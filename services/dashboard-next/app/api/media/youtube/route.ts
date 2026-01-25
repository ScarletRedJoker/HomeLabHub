import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { stat } from "fs/promises";
import { Client } from "ssh2";
import { getSSHPrivateKey } from "@/lib/server-config-store";

export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

const WINDOWS_VM_HOST = process.env.WINDOWS_VM_HOST || "100.118.44.102";
const WINDOWS_VM_USER = process.env.WINDOWS_VM_USER || "Evin";
const MEDIA_LIBRARY_PATH = process.env.MEDIA_LIBRARY_PATH || "/home/runner/media-library";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
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
    }, 60000);

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
      host: WINDOWS_VM_HOST,
      username: WINDOWS_VM_USER,
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
    const { url, type } = body;

    if (!url) {
      return NextResponse.json({ error: "Missing YouTube URL" }, { status: 400 });
    }

    if (!type || !["audio", "video"].includes(type)) {
      return NextResponse.json({ error: "Invalid type. Must be 'audio' or 'video'" }, { status: 400 });
    }

    // Ensure media library directory exists
    if (!existsSync(MEDIA_LIBRARY_PATH)) {
      mkdirSync(MEDIA_LIBRARY_PATH, { recursive: true });
    }

    const timestamp = Date.now();
    const filename = type === "audio" ? `youtube_${timestamp}.flac` : `youtube_${timestamp}.mp4`;
    const outputPath = join(MEDIA_LIBRARY_PATH, filename);

    // Build yt-dlp command
    let ytdlpCommand = `yt-dlp "${url}"`;
    if (type === "audio") {
      // Use FLAC for lossless audio quality
      ytdlpCommand += ` -x --audio-format flac --audio-quality 0 -o "${outputPath}"`;
    } else {
      ytdlpCommand += ` -f best -o "${outputPath}"`;
    }

    // Check if we need to execute on Windows VM or locally
    const localYtdlp = process.platform === "win32" || (await checkLocalYtdlp());

    let result;
    if (localYtdlp) {
      // Execute locally
      try {
        await execAsync(ytdlpCommand, { timeout: 300000 }); // 5 minute timeout
        result = { success: true, path: outputPath };
      } catch (error: any) {
        result = { success: false, error: error.message };
      }
    } else {
      // Execute on Windows VM
      result = await executeSSHCommand(ytdlpCommand);
    }

    if (!result.success) {
      return NextResponse.json(
        { error: "Download failed", details: result.error },
        { status: 500 }
      );
    }

    // Get file size
    let fileSize = 0;
    try {
      const stats = await stat(outputPath);
      fileSize = stats.size;
    } catch (error) {
      // File might be on remote server, just return path
    }

    return NextResponse.json({
      success: true,
      message: `${type} downloaded successfully`,
      filename,
      path: outputPath,
      fileSize,
      type,
    });
  } catch (error: any) {
    console.error("[YouTube API] Error:", error);
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
      // List all media files
      if (!existsSync(MEDIA_LIBRARY_PATH)) {
        return NextResponse.json({ files: [] });
      }

      const files = readdirSync(MEDIA_LIBRARY_PATH);
      const filesList = [];

      for (const file of files) {
        try {
          const filePath = join(MEDIA_LIBRARY_PATH, file);
          const stats = await stat(filePath);
          if (stats.isFile()) {
            filesList.push({
              name: file,
              path: filePath,
              size: stats.size,
              modified: stats.mtime,
              type: (file.endsWith(".flac") || file.endsWith(".mp3")) ? "audio" : file.endsWith(".mp4") ? "video" : "other",
            });
          }
        } catch (error) {
          console.error(`Failed to stat ${file}:`, error);
        }
      }

      return NextResponse.json({ files: filesList });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[YouTube API] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function checkLocalYtdlp(): Promise<boolean> {
  try {
    await execAsync("which yt-dlp || where yt-dlp", { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
