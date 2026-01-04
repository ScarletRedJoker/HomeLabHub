import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readFileSync, existsSync } from "fs";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

interface DeployConfig {
  server: "linode" | "home";
  host: string;
  user: string;
  deployPath: string;
}

const deployConfigs: Record<string, DeployConfig> = {
  linode: {
    server: "linode",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
    user: process.env.LINODE_SSH_USER || "root",
    deployPath: "/opt/homelab/HomeLabHub/deploy/linode",
  },
  home: {
    server: "home",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    user: process.env.HOME_SSH_USER || "evin",
    deployPath: "/opt/homelab/HomeLabHub/deploy/local",
  },
};

interface DeploymentLog {
  id: string;
  server: string;
  status: "running" | "success" | "failed";
  startTime: Date;
  endTime?: Date;
  logs: string[];
}

const activeDeployments: Map<string, DeploymentLog> = new Map();

async function runDeploy(config: DeployConfig, deployId: string): Promise<void> {
  const keyPath = process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa";
  
  const deployment = activeDeployments.get(deployId);
  if (!deployment) return;

  return new Promise((resolve, reject) => {
    if (!existsSync(keyPath)) {
      deployment.status = "failed";
      deployment.logs.push("ERROR: SSH key not found at " + keyPath);
      deployment.endTime = new Date();
      reject(new Error("SSH key not found"));
      return;
    }

    const conn = new Client();

    conn.on("ready", () => {
      deployment.logs.push(`Connected to ${config.host}`);
      deployment.logs.push(`Running deploy script at ${config.deployPath}`);

      const command = `cd ${config.deployPath} && git pull && ./deploy.sh 2>&1`;

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
        host: config.host,
        port: 22,
        username: config.user,
        privateKey: readFileSync(keyPath),
        readyTimeout: 30000,
      });
    } catch (err: any) {
      deployment.status = "failed";
      deployment.logs.push(`Failed to connect: ${err.message}`);
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

  return NextResponse.json({ deployments });
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { server } = await request.json();

    if (!server || !deployConfigs[server]) {
      return NextResponse.json(
        { error: "Invalid server. Must be 'linode' or 'home'" },
        { status: 400 }
      );
    }

    const config = deployConfigs[server];
    const deployId = `${server}-${Date.now()}`;

    const deployment: DeploymentLog = {
      id: deployId,
      server,
      status: "running",
      startTime: new Date(),
      logs: [`Starting deployment to ${server}...`],
    };

    activeDeployments.set(deployId, deployment);

    runDeploy(config, deployId).catch((err) => {
      console.error("Deploy error:", err);
    });

    return NextResponse.json({
      success: true,
      deployId,
      message: `Deployment to ${server} started`,
    });
  } catch (error: any) {
    console.error("Deploy start error:", error);
    return NextResponse.json(
      { error: "Failed to start deployment", details: error.message },
      { status: 500 }
    );
  }
}
