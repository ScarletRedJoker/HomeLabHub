import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { existsSync, readFileSync } from "fs";
import { Client } from "ssh2";
import { getSSHPrivateKey, hasSSHKey, getDefaultSshKeyPath } from "@/lib/server-config-store";
import { 
  getAgentConfig, 
  getAllDeploymentTargets, 
  getDeploymentConfig,
  testAgentConnection,
  type DeploymentTarget 
} from "@/lib/service-locator";
import { getAllServices, type RegisteredService } from "@/lib/service-registry";
import { detectSSHKeyFormat } from "@/lib/ssh-key-converter";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

type NodeType = "replit" | "linode" | "ubuntu-home" | "windows-vm";

interface NodeInfo {
  id: NodeType;
  name: string;
  description: string;
  hostname: string;
  tailscaleIp?: string;
  onTailscale: boolean;
  connectionType: "ssh" | "agent" | "local";
  status: "online" | "offline" | "unknown" | "degraded";
  lastHeartbeat?: string;
  sshConfig?: {
    host: string;
    user: string;
    port: number;
    keyConfigured: boolean;
  };
  services: ServiceInfo[];
  capabilities: string[];
  metrics?: {
    cpu?: number;
    memory?: number;
    disk?: number;
    uptime?: string;
  };
  error?: string;
}

interface ServiceInfo {
  name: string;
  type: "docker" | "pm2" | "native" | "agent";
  status: "online" | "offline" | "unknown";
  port?: number;
  node: NodeType;
}

interface SSHKeyStatus {
  exists: boolean;
  keyPath: string;
  format?: string;
  isPEMFormat: boolean;
  fingerprint?: string;
  publicKey?: string;
  error?: string;
}

interface ConnectionsData {
  timestamp: string;
  nodes: NodeInfo[];
  sshKeyStatus: SSHKeyStatus;
  tailscaleMesh: {
    nodes: Array<{
      id: NodeType;
      name: string;
      tailscaleIp?: string;
      connected: boolean;
    }>;
  };
  serviceDiscovery: ServiceInfo[];
  summary: {
    totalNodes: number;
    onlineNodes: number;
    totalServices: number;
    onlineServices: number;
  };
}

function getSSHKeyStatus(): SSHKeyStatus {
  const keyPath = getDefaultSshKeyPath();
  const keyFromEnv = process.env.SSH_PRIVATE_KEY;
  
  try {
    let keyBuffer: Buffer | null = null;
    
    if (keyFromEnv) {
      keyBuffer = Buffer.from(keyFromEnv);
    } else if (existsSync(keyPath)) {
      keyBuffer = readFileSync(keyPath);
    }
    
    if (!keyBuffer) {
      return {
        exists: false,
        keyPath,
        isPEMFormat: false,
        error: "SSH key not found",
      };
    }
    
    const format = detectSSHKeyFormat(keyBuffer);
    const isPEMFormat = ['RSA', 'EC', 'ED25519', 'PKCS8'].includes(format);
    
    let fingerprint: string | undefined;
    let publicKey: string | undefined;
    
    const publicKeyPath = `${keyPath}.pub`;
    if (existsSync(publicKeyPath)) {
      try {
        publicKey = readFileSync(publicKeyPath, 'utf-8').trim();
        const { execFileSync } = require('child_process');
        fingerprint = execFileSync('ssh-keygen', ['-lf', publicKeyPath], {
          encoding: 'utf-8',
          timeout: 5000
        }).trim();
      } catch {}
    }
    
    return {
      exists: true,
      keyPath: keyFromEnv ? "(from SSH_PRIVATE_KEY env)" : keyPath,
      format,
      isPEMFormat,
      fingerprint,
      publicKey,
    };
  } catch (err: any) {
    return {
      exists: false,
      keyPath,
      isPEMFormat: false,
      error: err.message,
    };
  }
}

async function testSSHConnection(
  host: string,
  user: string,
  port: number = 22,
  timeout: number = 10000
): Promise<{ success: boolean; error?: string; latency?: number }> {
  const privateKey = getSSHPrivateKey();
  
  if (!privateKey) {
    return { success: false, error: "SSH key not configured" };
  }
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const conn = new Client();
    const timeoutHandle = setTimeout(() => {
      conn.end();
      resolve({ success: false, error: "Connection timeout" });
    }, timeout);
    
    conn.on("ready", () => {
      const latency = Date.now() - startTime;
      clearTimeout(timeoutHandle);
      conn.end();
      resolve({ success: true, latency });
    });
    
    conn.on("error", (err) => {
      clearTimeout(timeoutHandle);
      resolve({ success: false, error: err.message });
    });
    
    try {
      conn.connect({
        host,
        port,
        username: user,
        privateKey,
        readyTimeout: timeout - 1000,
      });
    } catch (err: any) {
      clearTimeout(timeoutHandle);
      resolve({ success: false, error: err.message });
    }
  });
}

async function getReplitNodeInfo(): Promise<NodeInfo> {
  return {
    id: "replit",
    name: "Replit",
    description: "Current development environment",
    hostname: process.env.REPL_SLUG || "replit",
    onTailscale: false,
    connectionType: "local",
    status: "online",
    lastHeartbeat: new Date().toISOString(),
    services: [
      { name: "dashboard-next", type: "native", status: "online", port: 5000, node: "replit" },
      { name: "discord-bot", type: "native", status: "online", port: 3001, node: "replit" },
      { name: "stream-bot", type: "native", status: "online", port: 3000, node: "replit" },
    ],
    capabilities: ["nodejs", "development"],
  };
}

async function getLinodeNodeInfo(): Promise<NodeInfo> {
  const config = getDeploymentConfig("linode");
  const host = process.env.LINODE_SSH_HOST || "linode.evindrake.net";
  const user = process.env.LINODE_SSH_USER || "root";
  
  const sshResult = await testSSHConnection(host, user, 22, 8000);
  
  const services: ServiceInfo[] = [
    { name: "Dashboard", type: "docker", status: sshResult.success ? "online" : "unknown", port: 443, node: "linode" },
    { name: "Discord Bot", type: "pm2", status: sshResult.success ? "online" : "unknown", port: 3001, node: "linode" },
    { name: "Stream Bot", type: "pm2", status: sshResult.success ? "online" : "unknown", port: 3000, node: "linode" },
    { name: "Caddy", type: "docker", status: sshResult.success ? "online" : "unknown", port: 443, node: "linode" },
    { name: "PostgreSQL", type: "docker", status: sshResult.success ? "online" : "unknown", port: 5432, node: "linode" },
  ];
  
  return {
    id: "linode",
    name: config?.name || "Linode Production",
    description: "Cloud production server",
    hostname: host,
    onTailscale: false,
    connectionType: "ssh",
    status: sshResult.success ? "online" : "offline",
    lastHeartbeat: sshResult.success ? new Date().toISOString() : undefined,
    sshConfig: {
      host,
      user,
      port: 22,
      keyConfigured: hasSSHKey(),
    },
    services,
    capabilities: ["docker", "pm2", "ssh", "production"],
    error: sshResult.error,
  };
}

async function getUbuntuHomeNodeInfo(): Promise<NodeInfo> {
  const config = getDeploymentConfig("ubuntu-home");
  const host = process.env.HOME_SSH_HOST || "host.evindrake.net";
  const user = process.env.HOME_SSH_USER || "evin";
  const tailscaleIp = process.env.UBUNTU_HOME_TAILSCALE_IP;
  
  const sshResult = await testSSHConnection(host, user, 22, 8000);
  
  const services: ServiceInfo[] = [
    { name: "Plex", type: "docker", status: sshResult.success ? "online" : "unknown", port: 32400, node: "ubuntu-home" },
    { name: "Jellyfin", type: "docker", status: sshResult.success ? "online" : "unknown", port: 8096, node: "ubuntu-home" },
    { name: "Home Assistant", type: "docker", status: sshResult.success ? "online" : "unknown", port: 8123, node: "ubuntu-home" },
    { name: "Caddy", type: "docker", status: sshResult.success ? "online" : "unknown", port: 443, node: "ubuntu-home" },
    { name: "Cloudflared", type: "docker", status: sshResult.success ? "online" : "unknown", node: "ubuntu-home" },
  ];
  
  return {
    id: "ubuntu-home",
    name: config?.name || "Ubuntu Homelab",
    description: "Local home server via Tailscale",
    hostname: host,
    tailscaleIp,
    onTailscale: true,
    connectionType: "ssh",
    status: sshResult.success ? "online" : "offline",
    lastHeartbeat: sshResult.success ? new Date().toISOString() : undefined,
    sshConfig: {
      host,
      user,
      port: 22,
      keyConfigured: hasSSHKey(),
    },
    services,
    capabilities: ["docker", "ssh", "tailscale", "media"],
    error: sshResult.error,
  };
}

async function getWindowsVMNodeInfo(): Promise<NodeInfo> {
  const config = getDeploymentConfig("windows-vm");
  const tailscaleIp = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
  
  const agentResult = await testAgentConnection("windows-vm");
  
  const services: ServiceInfo[] = [
    { name: "Ollama", type: "agent", status: agentResult.reachable ? "online" : "unknown", port: 11434, node: "windows-vm" },
    { name: "Stable Diffusion", type: "agent", status: agentResult.reachable ? "online" : "unknown", port: 7860, node: "windows-vm" },
    { name: "ComfyUI", type: "agent", status: agentResult.reachable ? "online" : "unknown", port: 8188, node: "windows-vm" },
    { name: "Nebula Agent", type: "agent", status: agentResult.reachable && agentResult.authValid ? "online" : "offline", port: 9765, node: "windows-vm" },
  ];
  
  return {
    id: "windows-vm",
    name: config?.name || "Windows AI VM",
    description: "GPU services via Tailscale",
    hostname: tailscaleIp,
    tailscaleIp,
    onTailscale: true,
    connectionType: "agent",
    status: agentResult.reachable ? (agentResult.authValid ? "online" : "degraded") : "offline",
    lastHeartbeat: agentResult.reachable ? new Date().toISOString() : undefined,
    services,
    capabilities: ["gpu", "ai", "ollama", "stable-diffusion", "comfyui", "tailscale"],
    error: agentResult.error,
  };
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const action = request.nextUrl.searchParams.get("action");
  
  if (action === "test-ssh") {
    const host = request.nextUrl.searchParams.get("host");
    const user = request.nextUrl.searchParams.get("user");
    const port = parseInt(request.nextUrl.searchParams.get("port") || "22", 10);
    
    if (!host || !user) {
      return NextResponse.json({ error: "host and user are required" }, { status: 400 });
    }
    
    const result = await testSSHConnection(host, user, port);
    return NextResponse.json(result);
  }
  
  if (action === "test-agent") {
    const target = request.nextUrl.searchParams.get("target") as DeploymentTarget;
    if (!target) {
      return NextResponse.json({ error: "target is required" }, { status: 400 });
    }
    
    const result = await testAgentConnection(target);
    return NextResponse.json(result);
  }
  
  try {
    const [replitNode, linodeNode, ubuntuHomeNode, windowsVMNode, registeredServices] = await Promise.all([
      getReplitNodeInfo(),
      getLinodeNodeInfo(),
      getUbuntuHomeNodeInfo(),
      getWindowsVMNodeInfo(),
      getAllServices().catch(() => [] as RegisteredService[]),
    ]);
    
    const nodes: NodeInfo[] = [replitNode, linodeNode, ubuntuHomeNode, windowsVMNode];
    
    const allServices: ServiceInfo[] = nodes.flatMap(n => n.services);
    
    registeredServices.forEach(rs => {
      if (!allServices.some(s => s.name.toLowerCase() === rs.name.toLowerCase())) {
        allServices.push({
          name: rs.name,
          type: "native",
          status: rs.isHealthy ? "online" : "offline",
          node: rs.environment as NodeType,
        });
      }
    });
    
    const tailscaleMesh = {
      nodes: nodes
        .filter(n => n.onTailscale || n.tailscaleIp)
        .map(n => ({
          id: n.id,
          name: n.name,
          tailscaleIp: n.tailscaleIp,
          connected: n.status === "online" || n.status === "degraded",
        })),
    };
    
    const onlineNodes = nodes.filter(n => n.status === "online" || n.status === "degraded").length;
    const onlineServices = allServices.filter(s => s.status === "online").length;
    
    const data: ConnectionsData = {
      timestamp: new Date().toISOString(),
      nodes,
      sshKeyStatus: getSSHKeyStatus(),
      tailscaleMesh,
      serviceDiscovery: allServices,
      summary: {
        totalNodes: nodes.length,
        onlineNodes,
        totalServices: allServices.length,
        onlineServices,
      },
    };
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Connections API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch connection data", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const body = await request.json().catch(() => ({}));
  const { action, target, host, user, port } = body;
  
  if (action === "ping") {
    if (target === "replit") {
      return NextResponse.json({ success: true, latency: 0 });
    }
    
    if (target === "windows-vm") {
      const result = await testAgentConnection(target);
      return NextResponse.json({ success: result.reachable, error: result.error });
    }
    
    if (host && user) {
      const result = await testSSHConnection(host, user, port || 22);
      return NextResponse.json(result);
    }
    
    return NextResponse.json({ error: "Invalid ping target" }, { status: 400 });
  }
  
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
