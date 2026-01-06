import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readFileSync, existsSync } from "fs";
import { getServerById } from "@/lib/server-config";
import wol from "wake_on_lan";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

type PowerAction = "restart" | "shutdown" | "wake";

interface PowerRequest {
  serverId: string;
  action: PowerAction;
}

async function executeSSHCommand(
  host: string,
  user: string,
  keyPath: string,
  command: string
): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    if (!existsSync(keyPath)) {
      resolve({ success: false, error: "SSH key not found" });
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ success: false, error: "Connection timeout" });
    }, 30000);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({ success: false, error: err.message });
          return;
        }

        let output = "";
        let errorOutput = "";

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timeout);
          conn.end();
          if (code === 0) {
            resolve({ success: true, output: output.trim() });
          } else {
            resolve({
              success: false,
              error: errorOutput.trim() || `Command exited with code ${code}`,
            });
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    try {
      conn.connect({
        host,
        port: 22,
        username: user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 30000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    }
  });
}

async function sendWakeOnLan(
  macAddress: string,
  broadcastAddress: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    wol.wake(macAddress, { address: broadcastAddress }, (err: Error | null) => {
      if (err) {
        resolve({ success: false, error: err.message });
      } else {
        resolve({ success: true });
      }
    });
  });
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: PowerRequest = await request.json();
    const { serverId, action } = body;

    if (!serverId || !action) {
      return NextResponse.json(
        { error: "Missing serverId or action" },
        { status: 400 }
      );
    }

    if (!["restart", "shutdown", "wake"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be restart, shutdown, or wake" },
        { status: 400 }
      );
    }

    const server = getServerById(serverId);
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (action === "wake") {
      if (!server.supportsWol) {
        return NextResponse.json(
          { error: "Wake-on-LAN not supported for this server" },
          { status: 400 }
        );
      }

      if (!server.macAddress) {
        return NextResponse.json(
          { error: "MAC address not configured for this server" },
          { status: 400 }
        );
      }

      const result = await sendWakeOnLan(
        server.macAddress,
        server.broadcastAddress || "255.255.255.255"
      );

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: `Wake-on-LAN packet sent to ${server.name}`,
        });
      } else {
        return NextResponse.json(
          { error: result.error || "Failed to send WoL packet" },
          { status: 500 }
        );
      }
    }

    const command =
      action === "restart" ? "sudo shutdown -r now" : "sudo shutdown -h now";

    const result = await executeSSHCommand(
      server.host,
      server.user,
      server.keyPath,
      command
    );

    if (result.success || result.error?.includes("Connection reset")) {
      return NextResponse.json({
        success: true,
        message: `${action === "restart" ? "Restart" : "Shutdown"} command sent to ${server.name}`,
      });
    } else {
      return NextResponse.json(
        { error: result.error || `Failed to ${action} server` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Power control error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
