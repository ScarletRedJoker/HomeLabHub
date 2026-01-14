import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getServerById, getDefaultSshKeyPath, getSSHPrivateKey } from "@/lib/server-config-store";
import { sendWolViaRelay, wakeAndWaitForOnline, checkServerOnline } from "@/lib/wol-relay";
import wol from "wake_on_lan";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

type PowerAction = "restart" | "shutdown" | "wake" | "status";

interface PowerRequest {
  serverId: string;
  action: PowerAction;
  waitForOnline?: boolean;
  waitTimeoutMs?: number;
}

async function executeSSHCommand(
  host: string,
  user: string,
  command: string,
  port: number = 22
): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const privateKey = getSSHPrivateKey();
    
    if (!privateKey) {
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
        port,
        username: user,
        privateKey: privateKey,
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
    const { serverId, action, waitForOnline = false, waitTimeoutMs = 120000 } = body;

    if (!serverId || !action) {
      return NextResponse.json(
        { error: "Missing serverId or action" },
        { status: 400 }
      );
    }

    if (!["restart", "shutdown", "wake", "status"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be restart, shutdown, wake, or status" },
        { status: 400 }
      );
    }

    const server = await getServerById(serverId);
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (action === "status") {
      const checkPort = server.serverType === "windows" ? server.agentPort || 9765 : 22;
      const online = await checkServerOnline(server.host, checkPort);
      return NextResponse.json({
        success: true,
        serverId: server.id,
        name: server.name,
        online,
        serverType: server.serverType || "linux",
      });
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

      if (server.wolRelayServer) {
        console.log(`[Power API] Using WoL relay via ${server.wolRelayServer} for ${server.name}`);
        
        if (waitForOnline) {
          const result = await wakeAndWaitForOnline({
            macAddress: server.macAddress,
            broadcastAddress: server.broadcastAddress,
            relayServerId: server.wolRelayServer,
            targetHost: server.host,
            checkPort: server.serverType === "windows" ? server.agentPort || 9765 : 22,
            waitTimeoutMs,
          });

          return NextResponse.json({
            success: result.success,
            message: result.message,
            method: result.method,
            online: result.online,
            serverType: server.serverType || "linux",
          });
        } else {
          const result = await sendWolViaRelay({
            macAddress: server.macAddress,
            broadcastAddress: server.broadcastAddress,
            relayServerId: server.wolRelayServer,
          });

          if (result.success) {
            return NextResponse.json({
              success: true,
              message: result.message || `Wake-on-LAN sent via relay to ${server.name}`,
              method: result.method,
              serverType: server.serverType || "linux",
            });
          } else {
            return NextResponse.json(
              { error: result.error || "Failed to send WoL packet via relay" },
              { status: 500 }
            );
          }
        }
      }

      const result = await sendWakeOnLan(
        server.macAddress,
        server.broadcastAddress || "255.255.255.255"
      );

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: `Wake-on-LAN packet sent to ${server.name}`,
          method: "direct",
          serverType: server.serverType || "linux",
        });
      } else {
        return NextResponse.json(
          { error: result.error || "Failed to send WoL packet" },
          { status: 500 }
        );
      }
    }

    if (server.serverType === "windows") {
      if (action === "shutdown" || action === "restart") {
        const agentUrl = `http://${server.tailscaleIp || server.host}:${server.agentPort || 9765}`;
        try {
          const command = action === "restart" ? "shutdown /r /t 0" : "shutdown /s /t 0";
          const response = await fetch(`${agentUrl}/api/execute`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${server.agentToken || process.env.NEBULA_AGENT_TOKEN}`,
            },
            body: JSON.stringify({ command }),
          });

          if (response.ok) {
            return NextResponse.json({
              success: true,
              message: `${action === "restart" ? "Restart" : "Shutdown"} command sent to ${server.name}`,
              serverType: "windows",
            });
          } else {
            const sshResult = await executeSSHCommand(
              server.host,
              server.user,
              action === "restart" ? "shutdown /r /t 0" : "shutdown /s /t 0",
              server.port || 22
            );

            if (sshResult.success || sshResult.error?.includes("Connection reset")) {
              return NextResponse.json({
                success: true,
                message: `${action === "restart" ? "Restart" : "Shutdown"} command sent to ${server.name} via SSH`,
                serverType: "windows",
              });
            }

            return NextResponse.json(
              { error: `Failed to ${action} Windows VM via agent or SSH` },
              { status: 500 }
            );
          }
        } catch (err: any) {
          const sshResult = await executeSSHCommand(
            server.host,
            server.user,
            action === "restart" ? "shutdown /r /t 0" : "shutdown /s /t 0",
            server.port || 22
          );

          if (sshResult.success || sshResult.error?.includes("Connection reset")) {
            return NextResponse.json({
              success: true,
              message: `${action === "restart" ? "Restart" : "Shutdown"} command sent to ${server.name} via SSH`,
              serverType: "windows",
            });
          }

          return NextResponse.json(
            { error: `Failed to ${action} Windows VM: ${err.message}` },
            { status: 500 }
          );
        }
      }
    }

    const command =
      action === "restart" ? "sudo shutdown -r now" : "sudo shutdown -h now";

    const result = await executeSSHCommand(
      server.host,
      server.user,
      command,
      server.port || 22
    );

    if (result.success || result.error?.includes("Connection reset")) {
      return NextResponse.json({
        success: true,
        message: `${action === "restart" ? "Restart" : "Shutdown"} command sent to ${server.name}`,
        serverType: server.serverType || "linux",
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

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const serverId = searchParams.get("serverId");

  try {
    if (serverId) {
      const server = await getServerById(serverId);
      if (!server) {
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }

      const checkPort = server.serverType === "windows" ? server.agentPort || 9765 : 22;
      const online = await checkServerOnline(server.host, checkPort);

      return NextResponse.json({
        success: true,
        server: {
          id: server.id,
          name: server.name,
          description: server.description,
          online,
          serverType: server.serverType || "linux",
          supportsWol: server.supportsWol,
          wolRelayServer: server.wolRelayServer,
        },
      });
    }

    const { getAllServers } = await import("@/lib/server-config-store");
    const servers = await getAllServers();

    const statusChecks = await Promise.all(
      servers.map(async (server) => {
        const checkPort = server.serverType === "windows" ? server.agentPort || 9765 : 22;
        const online = await checkServerOnline(server.host, checkPort);
        return {
          id: server.id,
          name: server.name,
          description: server.description,
          online,
          serverType: server.serverType || "linux",
          supportsWol: server.supportsWol,
          wolRelayServer: server.wolRelayServer,
        };
      })
    );

    return NextResponse.json({
      success: true,
      servers: statusChecks,
    });
  } catch (error: any) {
    console.error("Power status error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
