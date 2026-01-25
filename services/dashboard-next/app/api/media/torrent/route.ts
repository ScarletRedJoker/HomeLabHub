import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { Client } from "ssh2";
import { getSSHPrivateKey } from "@/lib/server-config-store";

export const dynamic = "force-dynamic";

const HOME_SSH_HOST = process.env.HOME_SSH_HOST || "192.168.1.100";
const HOME_SSH_USER = process.env.HOME_SSH_USER || "evin";
const TORRENT_CLIENT = process.env.TORRENT_CLIENT || "qbittorrent"; // or "transmission"

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface TorrentStatus {
  name: string;
  progress: number;
  status: "downloading" | "seeding" | "paused" | "stopped" | "completed";
  size: number;
  downloaded: number;
  uploadSpeed: number;
  downloadSpeed: number;
}

async function executeSSHCommand(command: string): Promise<{ success: boolean; output?: string; error?: string }> {
  const privateKey = getSSHPrivateKey();
  
  if (!privateKey) {
    return { success: false, error: "SSH private key not found" };
  }

  return new Promise((resolve) => {
    const conn = new Client();
    let output = "";
    let errorOutput = "";

    const timeoutId = setTimeout(() => {
      conn.end();
      resolve({ success: false, error: "SSH command timeout" });
    }, 30000);

    conn.on("ready", () => {
      conn.exec(command, (err: any, stream: any) => {
        if (err) {
          clearTimeout(timeoutId);
          conn.end();
          resolve({ success: false, error: err.message });
          return;
        }

        stream.on("close", () => {
          clearTimeout(timeoutId);
          conn.end();
          if (errorOutput) {
            resolve({ success: false, error: errorOutput });
          } else {
            resolve({ success: true, output });
          }
        });

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr?.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });
      });
    });

    conn.on("error", (err: any) => {
      clearTimeout(timeoutId);
      resolve({ success: false, error: err.message });
    });

    conn.connect({
      host: HOME_SSH_HOST,
      username: HOME_SSH_USER,
      privateKey,
      readyTimeout: 10000,
    });
  });
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, magnet, torrentUrl } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    if (action === "add") {
      if (!magnet && !torrentUrl) {
        return NextResponse.json({ error: "Missing magnet link or torrent URL" }, { status: 400 });
      }

      const link = magnet || torrentUrl;
      let command = "";
      
      if (TORRENT_CLIENT === "qbittorrent") {
        // Use qBittorrent Web API to add torrent
        // Escape special characters in the URL for curl
        const escapedLink = link.replace(/'/g, "'\\''");
        command = `curl -s -X POST "http://localhost:8080/api/v2/torrents/add" --data-urlencode "urls=${escapedLink}" -o /dev/null -w '%{http_code}'`;
      } else if (TORRENT_CLIENT === "transmission") {
        command = `transmission-remote -a "${link}"`;
      } else if (TORRENT_CLIENT === "aria2") {
        // aria2 RPC call
        const escapedLink = link.replace(/"/g, '\\"');
        command = `curl -s -X POST http://localhost:6800/jsonrpc -d '{"jsonrpc":"2.0","id":"1","method":"aria2.addUri","params":[["${escapedLink}"]]}' | grep -q '"result"' && echo 'success' || echo 'failed'`;
      }

      if (!command) {
        return NextResponse.json({ error: "Unknown torrent client configured" }, { status: 400 });
      }

      const result = await executeSSHCommand(command);
      if (!result.success) {
        return NextResponse.json({ error: "Failed to add torrent", details: result.error }, { status: 500 });
      }

      // Check response for qBittorrent (expects 200 status)
      if (TORRENT_CLIENT === "qbittorrent" && result.output?.trim() !== "200") {
        return NextResponse.json({ 
          error: "qBittorrent rejected the torrent", 
          details: `HTTP ${result.output?.trim() || 'unknown'} - Make sure qBittorrent WebUI is running on port 8080` 
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Torrent added successfully",
        source: magnet ? "magnet" : "url",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[Torrent API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "list") {
      let command = "";
      
      if (TORRENT_CLIENT === "qbittorrent") {
        // List torrents using qBittorrent Web API (default port 8080)
        command = `curl -s "http://localhost:8080/api/v2/torrents/info" 2>/dev/null || echo '[]'`;
      } else if (TORRENT_CLIENT === "transmission") {
        // List torrents using transmission-remote
        command = `transmission-remote -l`;
      } else if (TORRENT_CLIENT === "aria2") {
        // aria2 RPC call to list downloads
        command = `curl -s -X POST http://localhost:6800/jsonrpc -d '{"jsonrpc":"2.0","id":"1","method":"aria2.tellActive","params":[]}' 2>/dev/null || echo '{"result":[]}'`;
      }

      if (!command) {
        return NextResponse.json({ error: "Unknown torrent client" }, { status: 400 });
      }

      const result = await executeSSHCommand(command);
      if (!result.success) {
        return NextResponse.json({ torrents: [], error: result.error });
      }

      // Parse the output based on client type
      let torrents: TorrentStatus[] = [];
      
      if (TORRENT_CLIENT === "transmission") {
        // Parse transmission-remote output
        const lines = result.output?.split("\n") || [];
        for (const line of lines) {
          if (line.includes("% Done") || line.match(/^\s*\d+\s+/)) {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 5) {
              const progress = parseInt(parts[2]) || 0;
              const downloaded = parseInt(parts[3]) || 0;
              torrents.push({
                name: parts.slice(9).join(" ") || "Unknown",
                progress,
                status: progress === 100 ? "completed" : "downloading",
                size: 0,
                downloaded,
                uploadSpeed: 0,
                downloadSpeed: 0,
              });
            }
          }
        }
      }

      return NextResponse.json({ torrents });
    }

    if (action === "remove") {
      const hash = searchParams.get("hash");
      if (!hash) {
        return NextResponse.json({ error: "Missing torrent hash" }, { status: 400 });
      }

      let command = "";
      if (TORRENT_CLIENT === "qbittorrent") {
        command = `curl -s -X POST "http://localhost:8080/api/v2/torrents/delete" -d "hashes=${hash}&deleteFiles=false" -o /dev/null -w '%{http_code}'`;
      } else if (TORRENT_CLIENT === "transmission") {
        command = `transmission-remote -t ${hash} -r`;
      } else if (TORRENT_CLIENT === "aria2") {
        command = `curl -s -X POST http://localhost:6800/jsonrpc -d '{"jsonrpc":"2.0","id":"1","method":"aria2.remove","params":["${hash}"]}'`;
      }

      const result = await executeSSHCommand(command);
      return NextResponse.json({
        success: result.success,
        message: result.success ? "Torrent removed" : "Failed to remove torrent",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[Torrent API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
