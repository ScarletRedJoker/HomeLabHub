import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getAllServers, getSSHPrivateKey, ServerConfig } from "@/lib/server-config-store";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface ServiceEndpoint {
  name: string;
  host: string;
  port: number;
  status: "running" | "stopped" | "unknown";
  protocol: string;
  domain?: string;
  lastChecked: string;
  uptime?: string;
}

interface HostEndpoints {
  serverId: string;
  serverName: string;
  serverHost: string;
  online: boolean;
  lastChecked: string;
  endpoints: ServiceEndpoint[];
  dockerContainers?: Array<{
    id: string;
    name: string;
    status: string;
    port?: number;
  }>;
  error?: string;
}

function executeSSHCommand(
  conn: Client,
  command: string,
  timeout: number = 10000
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    let errorOutput = "";

    const timer = setTimeout(() => {
      reject(new Error(`Command timeout after ${timeout}ms`));
    }, timeout);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }

      stream.on("data", (data: Buffer) => {
        output += data.toString();
      });

      stream.stderr.on("data", (data: Buffer) => {
        errorOutput += data.toString();
      });

      stream.on("close", (code: number) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
        }
      });
    });
  });
}

async function detectEndpoints(server: ServerConfig): Promise<HostEndpoints> {
  const endpoints: ServiceEndpoint[] = [];
  const result: HostEndpoints = {
    serverId: server.id,
    serverName: server.name,
    serverHost: server.host,
    online: false,
    lastChecked: new Date().toISOString(),
    endpoints: [],
  };

  const privateKey = getSSHPrivateKey();
  if (!privateKey) {
    result.error = "SSH key not found";
    return result;
  }

  return new Promise((resolve) => {
    const conn = new Client();

    conn.on("ready", async () => {
      result.online = true;

      try {
        // Detect services based on server type
        if (server.serverType === "windows") {
          // Windows detection using PowerShell
          try {
            const psOutput = await executeSSHCommand(
              conn,
              'powershell -Command "Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json" 2>/dev/null',
              5000
            );

            if (psOutput) {
              try {
                const connections = JSON.parse(psOutput);
                const connArray = Array.isArray(connections) ? connections : [connections];
                
                connArray.forEach((conn: any) => {
                  if (conn.LocalAddress && conn.LocalPort) {
                    endpoints.push({
                      name: `Service:${conn.LocalPort}`,
                      host: server.host,
                      port: parseInt(conn.LocalPort, 10),
                      status: "running",
                      protocol: "TCP",
                      lastChecked: new Date().toISOString(),
                    });
                  }
                });
              } catch (e) {
                // JSON parse failed, skip
              }
            }
          } catch (e) {
            // Windows command failed, continue
          }
        } else {
          // Linux detection using netstat/ss
          try {
            const netstatOutput = await executeSSHCommand(
              conn,
              "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null | grep LISTEN",
              5000
            );

            if (netstatOutput) {
              const lines = netstatOutput.split("\n").filter(Boolean);
              
              lines.forEach((line) => {
                const match = line.match(/LISTEN\s+.*?:(\d+)\s+/);
                if (match) {
                  const port = parseInt(match[1], 10);
                  
                  // Skip standard system ports
                  if (port < 1024 && port !== 22 && port !== 80 && port !== 443) {
                    return;
                  }

                  const existing = endpoints.find(e => e.port === port);
                  if (!existing) {
                    endpoints.push({
                      name: `Port ${port}`,
                      host: server.host,
                      port,
                      status: "running",
                      protocol: "TCP",
                      lastChecked: new Date().toISOString(),
                    });
                  }
                }
              });
            }
          } catch (e) {
            // netstat failed, continue
          }

          // Detect Docker containers
          try {
            const dockerOutput = await executeSSHCommand(
              conn,
              "docker ps --format '{{.Names}}:{{.Ports}}:{{.Status}}' 2>/dev/null",
              5000
            );

            if (dockerOutput) {
              const containers: Array<{ id: string; name: string; status: string; port?: number }> = [];
              const lines = dockerOutput.split("\n").filter(Boolean);

              lines.forEach((line) => {
                const [name, ports, status] = line.split(":");
                
                let port: number | undefined;
                if (ports && ports !== "") {
                  const portMatch = ports.match(/(\d+)->(\d+)/);
                  if (portMatch) {
                    port = parseInt(portMatch[1], 10);
                  }
                }

                containers.push({
                  id: name,
                  name: name || "unknown",
                  status: status?.includes("Up") ? "running" : "stopped",
                  port,
                });

                if (port) {
                  const existing = endpoints.find(e => e.port === port);
                  if (!existing) {
                    endpoints.push({
                      name: `Docker: ${name}`,
                      host: server.host,
                      port,
                      status: status?.includes("Up") ? "running" : "stopped",
                      protocol: "HTTP",
                      lastChecked: new Date().toISOString(),
                    });
                  }
                }
              });

              if (containers.length > 0) {
                result.dockerContainers = containers;
              }
            }
          } catch (e) {
            // Docker not available, continue
          }

          // Check systemd services
          try {
            const systemdOutput = await executeSSHCommand(
              conn,
              "systemctl list-units --type=service --state=running --no-pager 2>/dev/null | grep -E '(docker|nginx|caddy|api|bot|dashboard)' || true",
              5000
            );

            if (systemdOutput) {
              const lines = systemdOutput.split("\n").filter(Boolean);
              
              lines.forEach((line) => {
                const match = line.match(/^●?\s*(\S+)\s+/);
                if (match) {
                  const serviceName = match[1];
                  if (!endpoints.find(e => e.name === serviceName)) {
                    endpoints.push({
                      name: serviceName,
                      host: server.host,
                      port: 0, // systemd services don't have fixed ports
                      status: line.includes("running") ? "running" : "stopped",
                      protocol: "Service",
                      lastChecked: new Date().toISOString(),
                    });
                  }
                }
              });
            }
          } catch (e) {
            // systemctl not available, continue
          }
        }
      } catch (error) {
        console.error(`Error detecting endpoints on ${server.name}:`, error);
      } finally {
        conn.end();
        result.endpoints = endpoints;
        resolve(result);
      }
    });

    conn.on("error", (err) => {
      result.error = err.message;
      result.online = false;
      resolve(result);
    });

    try {
      conn.connect({
        host: server.host,
        port: server.port || 22,
        username: server.user,
        privateKey: privateKey,
        readyTimeout: 10000,
        algorithms: {
          serverHostKey: ['ssh-rsa', 'rsa-sha2-256', 'rsa-sha2-512', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
        },
      });
    } catch (err: unknown) {
      result.error = err instanceof Error ? err.message : "Connection failed";
      result.online = false;
      resolve(result);
    }
  });
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const servers = await getAllServers();
    const results = await Promise.all(servers.map(detectEndpoints));

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      hosts: results,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to detect endpoints",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { serverId } = body;

    if (!serverId) {
      return NextResponse.json(
        { error: "serverId is required" },
        { status: 400 }
      );
    }

    const servers = await getAllServers();
    const server = servers.find(s => s.id === serverId);

    if (!server) {
      return NextResponse.json(
        { error: `Server "${serverId}" not found` },
        { status: 404 }
      );
    }

    const result = await detectEndpoints(server);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      host: result,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to detect endpoints",
      },
      { status: 500 }
    );
  }
}
