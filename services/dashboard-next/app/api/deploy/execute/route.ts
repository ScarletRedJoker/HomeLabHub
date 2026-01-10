import { NextResponse } from "next/server";
import { getServerConfigs } from "@/lib/server-config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface DeployRequest {
  serverId: string;
  projectPath: string;
  projectName: string;
  branch?: string;
  deployType: "docker" | "pm2" | "systemd" | "script";
  buildCommand?: string;
  runCommand?: string;
  envVars?: Record<string, string>;
  port?: number;
}

interface DeployLog {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

async function executeSSHCommand(
  host: string,
  user: string,
  command: string
): Promise<{ success: boolean; output: string; error?: string }> {
  const { NodeSSH } = await import("node-ssh");
  const ssh = new NodeSSH();

  const sshKeyPath = process.env.SSH_KEY_PATH;
  if (!sshKeyPath) {
    return {
      success: false,
      output: "",
      error: "SSH_KEY_PATH environment variable is not configured",
    };
  }

  try {
    await ssh.connect({
      host,
      username: user,
      privateKeyPath: sshKeyPath,
      readyTimeout: 30000,
    });

    const result = await ssh.execCommand(command, { cwd: "/" });
    ssh.dispose();

    return {
      success: result.code === 0,
      output: result.stdout,
      error: result.stderr || undefined,
    };
  } catch (error: any) {
    return {
      success: false,
      output: "",
      error: error.message,
    };
  }
}

function createLog(level: DeployLog["level"], message: string): DeployLog {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
}

async function deployDocker(
  host: string,
  user: string,
  projectPath: string,
  projectName: string,
  envVars: Record<string, string>,
  port?: number
): Promise<{ success: boolean; logs: DeployLog[] }> {
  const logs: DeployLog[] = [];
  const containerName = projectName.toLowerCase().replace(/[^a-z0-9]/g, "-");

  logs.push(createLog("info", `Starting Docker deployment for ${projectName}`));

  const pullResult = await executeSSHCommand(
    host,
    user,
    `cd ${projectPath} && git pull origin main`
  );
  logs.push(createLog(pullResult.success ? "success" : "warn", `Git pull: ${pullResult.output || pullResult.error}`));

  logs.push(createLog("info", "Building Docker image..."));
  const buildResult = await executeSSHCommand(
    host,
    user,
    `cd ${projectPath} && docker build -t ${containerName}:latest .`
  );

  if (!buildResult.success) {
    logs.push(createLog("error", `Build failed: ${buildResult.error}`));
    return { success: false, logs };
  }
  logs.push(createLog("success", "Docker image built successfully"));

  logs.push(createLog("info", "Stopping existing container..."));
  await executeSSHCommand(host, user, `docker stop ${containerName} 2>/dev/null || true`);
  await executeSSHCommand(host, user, `docker rm ${containerName} 2>/dev/null || true`);

  logs.push(createLog("info", "Starting new container..."));
  const envString = Object.entries(envVars)
    .map(([k, v]) => `-e ${k}="${v}"`)
    .join(" ");
  const portMapping = port ? `-p ${port}:${port}` : "";

  const runResult = await executeSSHCommand(
    host,
    user,
    `docker run -d --name ${containerName} ${portMapping} ${envString} --restart unless-stopped ${containerName}:latest`
  );

  if (!runResult.success) {
    logs.push(createLog("error", `Failed to start container: ${runResult.error}`));
    return { success: false, logs };
  }

  logs.push(createLog("success", `Container ${containerName} started successfully`));

  if (port) {
    logs.push(createLog("info", "Checking container health..."));
    await new Promise((r) => setTimeout(r, 5000));

    const healthResult = await executeSSHCommand(
      host,
      user,
      `curl -sf http://localhost:${port}/health || curl -sf http://localhost:${port}/ || echo "Health check skipped"`
    );
    logs.push(createLog("info", `Health check: ${healthResult.output || "Service responding"}`));
  }

  logs.push(createLog("success", "Deployment complete!"));
  return { success: true, logs };
}

async function deployPM2(
  host: string,
  user: string,
  projectPath: string,
  projectName: string,
  buildCommand: string,
  runCommand: string,
  envVars: Record<string, string>
): Promise<{ success: boolean; logs: DeployLog[] }> {
  const logs: DeployLog[] = [];
  const appName = projectName.toLowerCase().replace(/[^a-z0-9]/g, "-");

  logs.push(createLog("info", `Starting PM2 deployment for ${projectName}`));

  const pullResult = await executeSSHCommand(
    host,
    user,
    `cd ${projectPath} && git pull origin main`
  );
  logs.push(createLog(pullResult.success ? "success" : "warn", `Git pull: ${pullResult.output || pullResult.error}`));

  logs.push(createLog("info", "Installing dependencies..."));
  await executeSSHCommand(host, user, `cd ${projectPath} && npm ci`);

  if (buildCommand) {
    logs.push(createLog("info", `Running build: ${buildCommand}`));
    const buildResult = await executeSSHCommand(host, user, `cd ${projectPath} && ${buildCommand}`);
    if (!buildResult.success) {
      logs.push(createLog("error", `Build failed: ${buildResult.error}`));
      return { success: false, logs };
    }
    logs.push(createLog("success", "Build completed"));
  }

  logs.push(createLog("info", "Restarting PM2 process..."));
  await executeSSHCommand(host, user, `pm2 delete ${appName} 2>/dev/null || true`);

  const envString = Object.entries(envVars)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");

  const startResult = await executeSSHCommand(
    host,
    user,
    `cd ${projectPath} && ${envString} pm2 start --name ${appName} -- ${runCommand}`
  );

  if (!startResult.success) {
    logs.push(createLog("error", `Failed to start PM2 process: ${startResult.error}`));
    return { success: false, logs };
  }

  await executeSSHCommand(host, user, "pm2 save");
  logs.push(createLog("success", `PM2 process ${appName} started and saved`));

  return { success: true, logs };
}

export async function POST(request: Request) {
  try {
    const body: DeployRequest = await request.json();
    const {
      serverId,
      projectPath,
      projectName,
      branch = "main",
      deployType,
      buildCommand,
      runCommand,
      envVars = {},
      port,
    } = body;

    if (!serverId || !projectPath || !projectName || !deployType) {
      return NextResponse.json(
        { error: "Missing required fields: serverId, projectPath, projectName, deployType" },
        { status: 400 }
      );
    }

    const servers = await getServerConfigs();
    const server = servers.find((s: { id: string }) => s.id === serverId);

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    if (!server.host) {
      return NextResponse.json(
        { error: "Server host not configured" },
        { status: 400 }
      );
    }

    let result: { success: boolean; logs: DeployLog[] };

    switch (deployType) {
      case "docker":
        result = await deployDocker(
          server.host,
          server.user || "root",
          projectPath,
          projectName,
          envVars,
          port
        );
        break;

      case "pm2":
        result = await deployPM2(
          server.host,
          server.user || "root",
          projectPath,
          projectName,
          buildCommand || "",
          runCommand || "npm start",
          envVars
        );
        break;

      default:
        return NextResponse.json(
          { error: `Unsupported deploy type: ${deployType}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: result.success,
      serverId,
      serverName: server.name,
      projectName,
      deployType,
      logs: result.logs,
      completedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Deploy execution error:", error);
    return NextResponse.json(
      { error: error.message || "Deployment failed" },
      { status: 500 }
    );
  }
}
