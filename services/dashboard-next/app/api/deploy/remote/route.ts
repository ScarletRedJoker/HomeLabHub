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

interface RemoteCommand {
  serverId: string;
  action: "execute" | "restart-service" | "pull-code" | "run-build" | "docker-restart";
  service?: string;
  command?: string;
  path?: string;
  buildCommand?: string;
}

interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number;
  duration: number;
  timestamp: string;
}

class SSHCommandExecutor {
  private privateKey: Buffer | null;
  private server: ServerConfig;

  constructor(server: ServerConfig, privateKey: Buffer | null) {
    this.server = server;
    this.privateKey = privateKey;
  }

  async executeCommand(
    command: string,
    timeout: number = 60000
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      if (!this.privateKey) {
        resolve({
          success: false,
          stdout: "",
          stderr: "SSH key not found",
          code: 1,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      let stdout = "";
      let stderr = "";
      let code = 0;

      const conn = new Client();

      conn.on("ready", () => {
        const timer = setTimeout(() => {
          conn.end();
          resolve({
            success: false,
            stdout,
            stderr: "Command timeout",
            code: 124,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          });
        }, timeout);

        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            resolve({
              success: false,
              stdout,
              stderr: err.message,
              code: 1,
              duration: Date.now() - startTime,
              timestamp: new Date().toISOString(),
            });
            return;
          }

          stream.on("data", (data: Buffer) => {
            stdout += data.toString();
          });

          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
          });

          stream.on("close", (closeCode: number) => {
            clearTimeout(timer);
            code = closeCode;
            conn.end();
            resolve({
              success: closeCode === 0,
              stdout,
              stderr,
              code: closeCode,
              duration: Date.now() - startTime,
              timestamp: new Date().toISOString(),
            });
          });
        });
      });

      conn.on("error", (err) => {
        resolve({
          success: false,
          stdout,
          stderr: err.message,
          code: 1,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        });
      });

      try {
        conn.connect({
          host: this.server.host,
          port: this.server.port || 22,
          username: this.server.user,
          privateKey: this.privateKey,
          readyTimeout: 10000,
          algorithms: {
            serverHostKey: ['ssh-rsa', 'rsa-sha2-256', 'rsa-sha2-512', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
          },
        });
      } catch (err: unknown) {
        resolve({
          success: false,
          stdout,
          stderr: err instanceof Error ? err.message : "Connection failed",
          code: 1,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  async restartService(serviceName: string): Promise<CommandResult> {
    let command = "";

    if (this.server.serverType === "windows") {
      // Windows service restart
      command = `powershell -Command "Restart-Service -Name '${serviceName}' -Force -ErrorAction Stop"`;
    } else {
      // Linux systemd or docker restart
      if (serviceName.startsWith("docker:")) {
        const containerName = serviceName.replace("docker:", "");
        command = `docker restart ${containerName}`;
      } else {
        command = `sudo systemctl restart ${serviceName}`;
      }
    }

    return this.executeCommand(command, 30000);
  }

  async pullCode(path: string): Promise<CommandResult> {
    const command = `cd "${path}" && git pull origin main 2>&1`;
    return this.executeCommand(command, 60000);
  }

  async runBuild(path: string, buildCommand: string): Promise<CommandResult> {
    const command = `cd "${path}" && ${buildCommand} 2>&1`;
    return this.executeCommand(command, 300000); // 5 minute timeout for builds
  }

  async dockerRestart(containerName: string): Promise<CommandResult> {
    const command = `docker restart ${containerName} && docker ps --filter "name=${containerName}"`;
    return this.executeCommand(command, 30000);
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: RemoteCommand = await request.json();
    const { serverId, action, service, command, path, buildCommand } = body;

    if (!serverId || !action) {
      return NextResponse.json(
        {
          success: false,
          error: "serverId and action are required",
        },
        { status: 400 }
      );
    }

    const servers = await getAllServers();
    const server = servers.find(s => s.id === serverId);

    if (!server) {
      return NextResponse.json(
        {
          success: false,
          error: `Server "${serverId}" not found`,
        },
        { status: 404 }
      );
    }

    const privateKey = getSSHPrivateKey();
    if (!privateKey) {
      return NextResponse.json(
        {
          success: false,
          error: "SSH key not found",
        },
        { status: 500 }
      );
    }

    const executor = new SSHCommandExecutor(server, privateKey);
    let result: CommandResult;

    switch (action) {
      case "execute": {
        if (!command) {
          return NextResponse.json(
            {
              success: false,
              error: "command is required for execute action",
            },
            { status: 400 }
          );
        }

        // Sanitize command to prevent injection
        if (
          command.includes(";") ||
          command.includes("|") ||
          command.includes("&&") ||
          command.includes("||")
        ) {
          return NextResponse.json(
            {
              success: false,
              error: "Complex commands with pipes or logical operators are not allowed",
            },
            { status: 400 }
          );
        }

        result = await executor.executeCommand(command);
        break;
      }

      case "restart-service": {
        if (!service) {
          return NextResponse.json(
            {
              success: false,
              error: "service is required for restart-service action",
            },
            { status: 400 }
          );
        }

        result = await executor.restartService(service);
        break;
      }

      case "pull-code": {
        if (!path) {
          return NextResponse.json(
            {
              success: false,
              error: "path is required for pull-code action",
            },
            { status: 400 }
          );
        }

        result = await executor.pullCode(path);
        break;
      }

      case "run-build": {
        if (!path || !buildCommand) {
          return NextResponse.json(
            {
              success: false,
              error: "path and buildCommand are required for run-build action",
            },
            { status: 400 }
          );
        }

        result = await executor.runBuild(path, buildCommand);
        break;
      }

      case "docker-restart": {
        if (!service) {
          return NextResponse.json(
            {
              success: false,
              error: "service (container name) is required for docker-restart action",
            },
            { status: 400 }
          );
        }

        result = await executor.dockerRestart(service);
        break;
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Invalid action: ${action}. Valid actions: execute, restart-service, pull-code, run-build, docker-restart`,
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      serverId,
      serverName: server.name,
      action,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("Remote command execution error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to execute remote command",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const servers = await getAllServers();

    return NextResponse.json({
      success: true,
      servers: servers.map(s => ({
        id: s.id,
        name: s.name,
        host: s.host,
        type: s.serverType || "linux",
      })),
      supportedActions: [
        "execute",
        "restart-service",
        "pull-code",
        "run-build",
        "docker-restart",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch server list",
      },
      { status: 500 }
    );
  }
}
