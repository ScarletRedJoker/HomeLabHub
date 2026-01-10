import { NextResponse } from "next/server";
import { getServerConfigs } from "@/lib/server-config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface ProvisionRequest {
  serverId: string;
  generateSSHKey?: boolean;
  setupDocker?: boolean;
  setupTailscale?: boolean;
  tailscaleAuthKey?: string;
}

interface ProvisionStep {
  name: string;
  status: "pending" | "running" | "success" | "failed";
  message?: string;
  duration?: number;
}

async function executeSSHCommand(
  host: string,
  user: string,
  command: string,
  keyPath?: string
): Promise<{ success: boolean; output: string; error?: string }> {
  const { NodeSSH } = await import("node-ssh");
  const ssh = new NodeSSH();

  const sshKeyPath = keyPath || process.env.SSH_KEY_PATH;
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

async function checkDockerInstalled(host: string, user: string): Promise<boolean> {
  const result = await executeSSHCommand(host, user, "docker --version");
  return result.success;
}

async function installDocker(host: string, user: string): Promise<{ success: boolean; error?: string }> {
  const commands = [
    "curl -fsSL https://get.docker.com -o get-docker.sh",
    "sh get-docker.sh",
    "systemctl enable docker",
    "systemctl start docker",
    "rm get-docker.sh",
  ];

  for (const cmd of commands) {
    const result = await executeSSHCommand(host, user, cmd);
    if (!result.success) {
      return { success: false, error: result.error };
    }
  }

  return { success: true };
}

async function configureTailscale(
  host: string,
  user: string,
  authKey: string
): Promise<{ success: boolean; error?: string }> {
  const commands = [
    "curl -fsSL https://tailscale.com/install.sh | sh",
    `tailscale up --authkey=${authKey} --accept-routes --accept-dns`,
  ];

  for (const cmd of commands) {
    const result = await executeSSHCommand(host, user, cmd);
    if (!result.success) {
      return { success: false, error: result.error };
    }
  }

  return { success: true };
}

async function generateSSHKeyPair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const crypto = await import("crypto");
  const { generateKeyPairSync } = crypto;

  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  return { publicKey, privateKey };
}

export async function POST(request: Request) {
  try {
    const body: ProvisionRequest = await request.json();
    const { serverId, generateSSHKey, setupDocker, setupTailscale, tailscaleAuthKey } = body;

    if (!serverId) {
      return NextResponse.json({ error: "Server ID is required" }, { status: 400 });
    }

    const servers = await getServerConfigs();
    const server = servers.find((s: { id: string }) => s.id === serverId);

    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const steps: ProvisionStep[] = [];
    let allSuccess = true;

    let generatedKeys: { publicKey: string; privateKey: string } | null = null;

    if (generateSSHKey) {
      steps.push({
        name: "Generate SSH Key Pair",
        status: "running",
      });

      try {
        generatedKeys = await generateSSHKeyPair();
        steps[steps.length - 1] = {
          name: "Generate SSH Key Pair",
          status: "success",
          message: "SSH key pair generated successfully. Add the public key to the server's authorized_keys.",
        };
      } catch (error: any) {
        steps[steps.length - 1] = {
          name: "Generate SSH Key Pair",
          status: "failed",
          message: error.message,
        };
        allSuccess = false;
      }
    }

    if (setupDocker && (server as { host?: string }).host) {
      steps.push({
        name: "Check Docker Installation",
        status: "running",
      });

      const dockerInstalled = await checkDockerInstalled(server.host, server.user || "root");

      if (dockerInstalled) {
        steps[steps.length - 1] = {
          name: "Check Docker Installation",
          status: "success",
          message: "Docker is already installed",
        };
      } else {
        steps[steps.length - 1] = {
          name: "Check Docker Installation",
          status: "success",
          message: "Docker not found, installing...",
        };

        steps.push({
          name: "Install Docker",
          status: "running",
        });

        const installResult = await installDocker(server.host, server.user || "root");

        if (installResult.success) {
          steps[steps.length - 1] = {
            name: "Install Docker",
            status: "success",
            message: "Docker installed successfully",
          };
        } else {
          steps[steps.length - 1] = {
            name: "Install Docker",
            status: "failed",
            message: installResult.error,
          };
          allSuccess = false;
        }
      }
    }

    if (setupTailscale && tailscaleAuthKey && server.host) {
      steps.push({
        name: "Setup Tailscale VPN",
        status: "running",
      });

      const tailscaleResult = await configureTailscale(
        server.host,
        server.user || "root",
        tailscaleAuthKey
      );

      if (tailscaleResult.success) {
        steps[steps.length - 1] = {
          name: "Setup Tailscale VPN",
          status: "success",
          message: "Tailscale configured successfully",
        };
      } else {
        steps[steps.length - 1] = {
          name: "Setup Tailscale VPN",
          status: "failed",
          message: tailscaleResult.error,
        };
        allSuccess = false;
      }
    }

    return NextResponse.json({
      success: allSuccess,
      serverId,
      serverName: server.name,
      steps,
      sshKeys: generatedKeys,
      completedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Auto-provision error:", error);
    return NextResponse.json(
      { error: error.message || "Provisioning failed" },
      { status: 500 }
    );
  }
}
