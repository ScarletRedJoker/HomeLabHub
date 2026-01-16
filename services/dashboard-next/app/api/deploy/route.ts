import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getAllServers, getServerById, getDefaultSshKeyPath, getSSHPrivateKey, ServerConfig } from "@/lib/server-config-store";
import { remoteDeployer, Environment, DeployResult, ProbeResult, DeployOptions } from "@/lib/remote-deploy";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

export interface DeployRequest {
  action: "trigger_deploy" | "verify_all" | "get_status" | "sync_code" | "rollback";
  environment?: "linode" | "ubuntu-home" | "windows-vm" | "all";
  services?: string[];
  options?: {
    skipBuild?: boolean;
    skipVerify?: boolean;
    force?: boolean;
    branch?: string;
  };
  server?: string;
}

interface DeploymentLog {
  id: string;
  server: string;
  status: "running" | "success" | "failed";
  startTime: Date;
  endTime?: Date;
  logs: string[];
}

const activeDeployments: Map<string, DeploymentLog> = new Map();

async function runDeploy(server: ServerConfig, deployId: string): Promise<void> {
  const deployment = activeDeployments.get(deployId);
  if (!deployment) return;

  if (!server.deployPath) {
    deployment.status = "failed";
    deployment.logs.push(`ERROR: No deploy path configured for server "${server.name}"`);
    deployment.endTime = new Date();
    return;
  }

  const deployPath = server.deployPath;
  if (!/^[a-zA-Z0-9_\-/.:\\]+$/.test(deployPath)) {
    deployment.status = "failed";
    deployment.logs.push(`ERROR: Invalid deploy path "${deployPath}" - must contain only alphanumeric characters, dashes, underscores, dots, colons, and slashes`);
    deployment.endTime = new Date();
    return;
  }

  if (deployPath.includes("..") || deployPath.includes("&&") || deployPath.includes(";") || deployPath.includes("|") || deployPath.includes("`") || deployPath.includes("$")) {
    deployment.status = "failed";
    deployment.logs.push(`ERROR: Deploy path contains forbidden characters`);
    deployment.endTime = new Date();
    return;
  }

  const privateKey = getSSHPrivateKey();

  return new Promise((resolve, reject) => {
    if (!privateKey) {
      deployment.status = "failed";
      deployment.logs.push("ERROR: SSH key not found");
      deployment.endTime = new Date();
      reject(new Error("SSH key not found"));
      return;
    }

    const conn = new Client();

    conn.on("ready", () => {
      deployment.logs.push(`Connected to ${server.host}`);
      deployment.logs.push(`Running deploy script at ${deployPath}`);

      const safeDeployPath = `'${deployPath.replace(/'/g, "'\"'\"'")}'`;
      const command = `cd ${safeDeployPath} && git pull && ./deploy.sh 2>&1`;

      conn.exec(command, (err, stream) => {
        if (err) {
          deployment.status = "failed";
          deployment.logs.push(`ERROR: ${err.message}`);
          deployment.endTime = new Date();
          conn.end();
          reject(err);
          return;
        }

        stream.on("data", (data: Buffer) => {
          const lines = data.toString().split("\n").filter(Boolean);
          deployment.logs.push(...lines);
        });

        stream.stderr.on("data", (data: Buffer) => {
          const lines = data.toString().split("\n").filter(Boolean);
          deployment.logs.push(...lines.map(l => `STDERR: ${l}`));
        });

        stream.on("close", (code: number) => {
          conn.end();
          deployment.endTime = new Date();
          
          if (code === 0) {
            deployment.status = "success";
            deployment.logs.push("Deployment completed successfully!");
          } else {
            deployment.status = "failed";
            deployment.logs.push(`Deployment failed with exit code ${code}`);
          }
          resolve();
        });
      });
    });

    conn.on("error", (err) => {
      deployment.status = "failed";
      deployment.logs.push(`Connection error: ${err.message}`);
      deployment.endTime = new Date();
      reject(err);
    });

    try {
      conn.connect({
        host: server.host,
        port: 22,
        username: server.user,
        privateKey: privateKey,
        readyTimeout: 30000,
      });
    } catch (err: unknown) {
      deployment.status = "failed";
      deployment.logs.push(`Failed to connect: ${err instanceof Error ? err.message : "Unknown error"}`);
      deployment.endTime = new Date();
      reject(err);
    }
  });
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deployId = request.nextUrl.searchParams.get("id");
  const action = request.nextUrl.searchParams.get("action");
  const environment = request.nextUrl.searchParams.get("environment") as Environment | null;
  
  if (action === "get_status") {
    try {
      const status = await remoteDeployer.getStatus(environment || undefined);
      return NextResponse.json({
        success: true,
        status,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to get status",
      }, { status: 500 });
    }
  }

  if (action === "history") {
    const history = remoteDeployer.getDeploymentHistory(
      environment || undefined,
      parseInt(request.nextUrl.searchParams.get("limit") || "20", 10)
    );
    return NextResponse.json({
      success: true,
      history,
      timestamp: new Date().toISOString(),
    });
  }
  
  if (deployId) {
    const deployment = activeDeployments.get(deployId);
    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }
    return NextResponse.json(deployment);
  }

  const deployments = Array.from(activeDeployments.values())
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, 20);

  const servers = await getAllServers();
  const deployableServers = servers.filter(s => s.deployPath);

  return NextResponse.json({ 
    deployments,
    availableServers: deployableServers.map(s => ({ id: s.id, name: s.name, deployPath: s.deployPath })),
    environments: ["linode", "ubuntu-home", "windows-vm"],
  });
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: DeployRequest = await request.json();
    const { action, environment, services, options, server: serverId } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Action is required. Valid actions: trigger_deploy, verify_all, get_status, sync_code, rollback" },
        { status: 400 }
      );
    }

    switch (action) {
      case "trigger_deploy": {
        if (!environment) {
          return NextResponse.json(
            { error: "Environment is required for trigger_deploy. Valid environments: linode, ubuntu-home, windows-vm, all" },
            { status: 400 }
          );
        }

        const deployOptions: DeployOptions = {
          skipBuild: options?.skipBuild,
          skipVerify: options?.skipVerify,
          force: options?.force,
          services,
          branch: options?.branch,
        };

        let result: DeployResult | DeployResult[];

        if (environment === "all") {
          result = await remoteDeployer.deployToAll(deployOptions);
          return NextResponse.json({
            success: true,
            action: "trigger_deploy",
            environment: "all",
            results: result,
            timestamp: new Date().toISOString(),
          });
        } else {
          switch (environment) {
            case "linode":
              result = await remoteDeployer.deployToLinode(deployOptions);
              break;
            case "ubuntu-home":
              result = await remoteDeployer.deployToUbuntuHome(deployOptions);
              break;
            case "windows-vm":
              result = await remoteDeployer.deployToWindowsVM(deployOptions);
              break;
            default:
              return NextResponse.json(
                { error: `Invalid environment: ${environment}` },
                { status: 400 }
              );
          }

          return NextResponse.json({
            ...result,
            action: "trigger_deploy",
          });
        }
      }

      case "verify_all": {
        const verificationResults = await remoteDeployer.verifyAll();
        
        const allHealthy = Object.values(verificationResults).every(
          (probes: ProbeResult[]) => probes.every((p: ProbeResult) => p.success)
        );

        return NextResponse.json({
          success: true,
          action: "verify_all",
          healthy: allHealthy,
          results: verificationResults,
          timestamp: new Date().toISOString(),
        });
      }

      case "get_status": {
        const status = await remoteDeployer.getStatus(environment as Environment | undefined);
        return NextResponse.json({
          success: true,
          action: "get_status",
          status,
          timestamp: new Date().toISOString(),
        });
      }

      case "sync_code": {
        if (!environment || environment === "all") {
          return NextResponse.json(
            { error: "A specific environment is required for sync_code (linode, ubuntu-home, or windows-vm)" },
            { status: 400 }
          );
        }

        const syncResult = await remoteDeployer.syncCode(environment as Environment);
        return NextResponse.json({
          ...syncResult,
          action: "sync_code",
        });
      }

      case "rollback": {
        if (!environment || environment === "all") {
          return NextResponse.json(
            { error: "A specific environment is required for rollback (linode, ubuntu-home, or windows-vm)" },
            { status: 400 }
          );
        }

        const rollbackResult = await remoteDeployer.rollback(environment as Environment);
        return NextResponse.json({
          ...rollbackResult,
          action: "rollback",
        });
      }

      default:
        if (serverId) {
          const server = await getServerById(serverId);
          
          if (!server) {
            const servers = await getAllServers();
            const validServers = servers.filter(s => s.deployPath).map(s => s.id);
            return NextResponse.json(
              { error: `Server "${serverId}" not found. Available: ${validServers.join(", ")}` },
              { status: 400 }
            );
          }

          if (!server.deployPath) {
            return NextResponse.json(
              { error: `Server "${server.name}" does not have a deploy path configured` },
              { status: 400 }
            );
          }

          const deployId = `${serverId}-${Date.now()}`;

          const deployment: DeploymentLog = {
            id: deployId,
            server: serverId,
            status: "running",
            startTime: new Date(),
            logs: [`Starting deployment to ${server.name}...`],
          };

          activeDeployments.set(deployId, deployment);

          runDeploy(server, deployId).catch((err) => {
            console.error("Deploy error:", err);
          });

          return NextResponse.json({
            success: true,
            deployId,
            message: `Deployment to ${server.name} started`,
          });
        }

        return NextResponse.json(
          { error: `Invalid action: ${action}. Valid actions: trigger_deploy, verify_all, get_status, sync_code, rollback` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    console.error("Deploy API error:", error);
    return NextResponse.json(
      { error: "Failed to process deployment request", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
