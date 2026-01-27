import fs from "fs/promises";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { convertSSHKeyToPEM, detectSSHKeyFormat } from "./ssh-key-converter";
import { getEnvironmentConfig, detectEnvironment, type Environment, type EnvironmentConfig } from "./env-bootstrap";

export interface ServerConfig {
  id: string;
  name: string;
  description?: string;
  host: string;
  user: string;
  port?: number;
  keyPath?: string;
  deployPath?: string;
  supportsWol?: boolean;
  macAddress?: string;
  broadcastAddress?: string;
  wolRelayServer?: string;
  ipmiHost?: string;
  ipmiUser?: string;
  ipmiPassword?: string;
  ipmiManagementServer?: string;
  vncHost?: string;
  vncPort?: number;
  noVncUrl?: string;
  isDefault?: boolean;
  serverType?: "linux" | "windows";
  tailscaleIp?: string;
  agentPort?: number;
  agentToken?: string;
}

const FALLBACK_SETTINGS_DIR = "/app/data";
const PRIMARY_SETTINGS_DIR = "/opt/homelab/studio-projects";

function getSettingsDir(): string {
  if (process.env.STUDIO_PROJECTS_DIR) {
    return process.env.STUDIO_PROJECTS_DIR;
  }
  if (process.env.REPL_ID) {
    return "./data/studio-projects";
  }
  
  try {
    if (existsSync(PRIMARY_SETTINGS_DIR)) {
      const testFile = `${PRIMARY_SETTINGS_DIR}/.write-test-${Date.now()}`;
      try {
        require("fs").writeFileSync(testFile, "test");
        require("fs").unlinkSync(testFile);
        return PRIMARY_SETTINGS_DIR;
      } catch {
        console.log(`[Server Config] Primary directory ${PRIMARY_SETTINGS_DIR} not writable, using fallback`);
      }
    }
  } catch {
    console.log(`[Server Config] Primary directory ${PRIMARY_SETTINGS_DIR} not accessible, using fallback`);
  }
  
  return FALLBACK_SETTINGS_DIR;
}

let cachedSettingsDir: string | null = null;

function getSettingsDirCached(): string {
  if (!cachedSettingsDir) {
    cachedSettingsDir = getSettingsDir();
    console.log(`[Server Config] Using settings directory: ${cachedSettingsDir}`);
  }
  return cachedSettingsDir;
}

const SETTINGS_FILE = "user-settings.json";

// SSH key path - on Linode the key is at /root/.ssh/homelab, on Replit at $HOME/.ssh/homelab
const DEFAULT_SSH_KEY_PATH = process.env.SSH_KEY_PATH || 
  (process.env.REPL_ID ? `${process.env.HOME}/.ssh/homelab` : "/root/.ssh/homelab");

const DEFAULT_SERVERS: ServerConfig[] = [
  {
    id: "linode",
    name: "Linode Server",
    description: "Public services - Discord Bot, Stream Bot, Dashboard",
    host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
    user: process.env.LINODE_SSH_USER || "root",
    keyPath: DEFAULT_SSH_KEY_PATH,
    deployPath: "/opt/homelab/HomeLabHub/deploy/linode",
    supportsWol: false,
    serverType: "linux",
    isDefault: true,
  },
  {
    id: "home",
    name: "Home Server",
    description: "Private services - Plex, Home Assistant, Gaming",
    host: process.env.HOME_SSH_HOST || "host.evindrake.net",
    user: process.env.HOME_SSH_USER || "evin",
    keyPath: DEFAULT_SSH_KEY_PATH,
    deployPath: "/opt/homelab/HomeLabHub/deploy/local",
    supportsWol: true,
    macAddress: process.env.HOME_SERVER_MAC,
    broadcastAddress: process.env.HOME_SERVER_BROADCAST || "255.255.255.255",
    ipmiHost: process.env.HOME_IPMI_HOST,
    ipmiUser: process.env.HOME_IPMI_USER || "admin",
    ipmiPassword: process.env.HOME_IPMI_PASSWORD,
    ipmiManagementServer: "home",
    vncHost: process.env.HOME_VNC_HOST || process.env.HOME_SSH_HOST,
    vncPort: parseInt(process.env.HOME_VNC_PORT || "5900", 10),
    noVncUrl: process.env.HOME_NOVNC_URL,
    serverType: "linux",
    isDefault: true,
  },
  (() => {
    const { getAIConfig } = require("@/lib/ai/config");
    const aiConfig = getAIConfig();
    return {
      id: "windows",
      name: "Windows VM",
      description: "AI workstation - Ollama, ComfyUI, Stable Diffusion",
      host: process.env.WINDOWS_VM_HOST || aiConfig.windowsVM.ip || "localhost",
      tailscaleIp: aiConfig.windowsVM.ip || undefined,
      user: process.env.WINDOWS_VM_USER || "evin",
      deployPath: "C:\\HomeLabHub",
      supportsWol: true,
      macAddress: process.env.WINDOWS_VM_MAC,
      broadcastAddress: process.env.WINDOWS_VM_BROADCAST || "192.168.1.255",
      wolRelayServer: "home",
      agentPort: aiConfig.windowsVM.nebulaAgentPort,
      agentToken: process.env.NEBULA_AGENT_TOKEN,
      serverType: "windows" as const,
      isDefault: true,
    };
  })(),
];

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function loadSettingsFile(): Promise<any> {
  const settingsDir = getSettingsDirCached();
  try {
    await ensureDir(settingsDir);
    const filePath = path.join(settingsDir, SETTINGS_FILE);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function saveSettingsFile(settings: any): Promise<void> {
  const settingsDir = getSettingsDirCached();
  await ensureDir(settingsDir);
  const filePath = path.join(settingsDir, SETTINGS_FILE);
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2));
}

function mergeWithDefaults(storedServers: Partial<ServerConfig>[]): ServerConfig[] {
  const result: ServerConfig[] = [];
  const storedById = new Map(storedServers.map(s => [s.id, s]));
  
  for (const defaultServer of DEFAULT_SERVERS) {
    const stored = storedById.get(defaultServer.id);
    if (stored) {
      result.push({
        ...defaultServer,
        ...stored,
        keyPath: stored.keyPath || defaultServer.keyPath || DEFAULT_SSH_KEY_PATH,
        isDefault: true,
      });
      storedById.delete(defaultServer.id);
    } else {
      result.push(defaultServer);
    }
  }
  
  Array.from(storedById.values()).forEach(server => {
    if (server.id && server.name && server.host && server.user) {
      result.push({
        id: server.id,
        name: server.name,
        description: server.description || "",
        host: server.host,
        user: server.user,
        keyPath: server.keyPath || DEFAULT_SSH_KEY_PATH,
        deployPath: server.deployPath,
        supportsWol: server.supportsWol || false,
        macAddress: server.macAddress,
        broadcastAddress: server.broadcastAddress,
        ipmiHost: server.ipmiHost,
        ipmiUser: server.ipmiUser,
        ipmiPassword: server.ipmiPassword,
        ipmiManagementServer: server.ipmiManagementServer,
        vncHost: server.vncHost,
        vncPort: server.vncPort,
        noVncUrl: server.noVncUrl,
        isDefault: false,
      });
    }
  });
  
  return result;
}

export async function getAllServers(): Promise<ServerConfig[]> {
  const settings = await loadSettingsFile();
  if (!settings?.servers) {
    return DEFAULT_SERVERS;
  }
  return mergeWithDefaults(settings.servers);
}

export async function getServerById(id: string): Promise<ServerConfig | undefined> {
  const servers = await getAllServers();
  return servers.find(s => s.id === id);
}

export async function saveServers(servers: Partial<ServerConfig>[]): Promise<ServerConfig[]> {
  const settings = await loadSettingsFile() || {
    profile: {
      displayName: "Evin",
      email: "evin@evindrake.net",
      timezone: "America/New_York",
    },
    appearance: {
      darkMode: true,
      compactMode: false,
      sidebarCollapsed: false,
    },
    notifications: {
      deploymentAlerts: true,
      serverHealthAlerts: true,
      discordNotifications: true,
      emailNotifications: false,
    },
    servers: [],
  };
  
  settings.servers = servers;
  await saveSettingsFile(settings);
  return mergeWithDefaults(servers);
}

export async function addServer(server: Omit<ServerConfig, "isDefault">): Promise<ServerConfig[]> {
  const settings = await loadSettingsFile();
  const currentServers = settings?.servers || [];
  
  if (currentServers.some((s: any) => s.id === server.id)) {
    throw new Error(`Server with ID "${server.id}" already exists`);
  }
  
  currentServers.push({
    ...server,
    keyPath: server.keyPath || DEFAULT_SSH_KEY_PATH,
  });
  
  return saveServers(currentServers);
}

export async function updateServer(id: string, updates: Partial<ServerConfig>): Promise<ServerConfig[]> {
  const settings = await loadSettingsFile();
  const currentServers = settings?.servers || [];
  
  const index = currentServers.findIndex((s: any) => s.id === id);
  if (index === -1) {
    const defaultServer = DEFAULT_SERVERS.find(s => s.id === id);
    if (defaultServer) {
      currentServers.push({ ...defaultServer, ...updates });
    } else {
      throw new Error(`Server with ID "${id}" not found`);
    }
  } else {
    currentServers[index] = { ...currentServers[index], ...updates };
  }
  
  return saveServers(currentServers);
}

export async function deleteServer(id: string): Promise<ServerConfig[]> {
  const settings = await loadSettingsFile();
  const currentServers = settings?.servers || [];
  
  const defaultServer = DEFAULT_SERVERS.find(s => s.id === id);
  if (defaultServer) {
    throw new Error(`Cannot delete default server "${id}"`);
  }
  
  const filtered = currentServers.filter((s: any) => s.id !== id);
  return saveServers(filtered);
}

export function getDefaultSshKeyPath(): string {
  return DEFAULT_SSH_KEY_PATH;
}

export function getSSHPrivateKey(): Buffer | null {
  try {
    let keyBuffer: Buffer | null = null;
    
    if (process.env.SSH_PRIVATE_KEY) {
      keyBuffer = Buffer.from(process.env.SSH_PRIVATE_KEY);
    } else if (process.env.SSH_PRIVATE_KEY_FILE) {
      // Read from file path specified in env
      const keyPath = process.env.SSH_PRIVATE_KEY_FILE;
      if (existsSync(keyPath)) {
        try {
          keyBuffer = readFileSync(keyPath);
          console.log(`[SSH] Loaded key from SSH_PRIVATE_KEY_FILE: ${keyPath}`);
        } catch (err: any) {
          console.error(`[SSH] Failed to read SSH key from ${keyPath}: ${err.message}`);
          return null;
        }
      } else {
        console.error(`[SSH] SSH_PRIVATE_KEY_FILE path does not exist: ${keyPath}`);
        return null;
      }
    } else if (process.env.SSH_KEY_PATH) {
      // Read from SSH_KEY_PATH
      const keyPath = process.env.SSH_KEY_PATH;
      if (existsSync(keyPath)) {
        try {
          keyBuffer = readFileSync(keyPath);
          console.log(`[SSH] Loaded key from SSH_KEY_PATH: ${keyPath}`);
        } catch (err: any) {
          console.error(`[SSH] Failed to read SSH key from ${keyPath}: ${err.message}`);
          return null;
        }
      }
    } else {
      const keyPath = DEFAULT_SSH_KEY_PATH;
      if (existsSync(keyPath)) {
        try {
          keyBuffer = readFileSync(keyPath);
        } catch (err: any) {
          console.error(`[SSH] Failed to read SSH key from file: ${err.message}`);
          return null;
        }
      }
    }
    
    if (!keyBuffer) {
      console.warn("[SSH] SSH private key not found");
      return null;
    }
    
    // Detect key format and convert to PEM if needed
    // The converter handles all logging internally
    const format = detectSSHKeyFormat(keyBuffer);
    
    // Supported formats that ssh2 can use directly
    const supportedFormats = ['RSA', 'EC', 'ED25519', 'PKCS8'];
    
    if (supportedFormats.includes(format)) {
      // Key is already in a supported format
      return keyBuffer;
    }
    
    // Try to convert unsupported formats (OpenSSH, Unknown, etc.) to PEM
    const convertedKey = convertSSHKeyToPEM(keyBuffer);
    if (convertedKey) {
      return convertedKey;
    }
    
    // Conversion failed - return null (converter already logged guidance)
    console.error(`[SSH] Failed to process SSH key in format: ${format}`);
    return null;
  } catch (err: any) {
    console.error(`[SSH] Error processing SSH key: ${err.message}`);
    return null;
  }
}

export function hasSSHKey(): boolean {
  if (process.env.SSH_PRIVATE_KEY) return true;
  if (process.env.SSH_PRIVATE_KEY_FILE && existsSync(process.env.SSH_PRIVATE_KEY_FILE)) return true;
  if (process.env.SSH_KEY_PATH && existsSync(process.env.SSH_KEY_PATH)) return true;
  return existsSync(DEFAULT_SSH_KEY_PATH);
}

export function getDefaultServers(): ServerConfig[] {
  return DEFAULT_SERVERS;
}

let cachedEnvConfig: EnvironmentConfig | null = null;

export function getCurrentEnvironmentConfig(): EnvironmentConfig {
  if (!cachedEnvConfig) {
    cachedEnvConfig = getEnvironmentConfig();
    console.log(`[Server Config] Environment: ${cachedEnvConfig.environment}, Role: ${cachedEnvConfig.role}`);
  }
  return cachedEnvConfig;
}

export function getEnvironmentAwareSshKeyPath(): string {
  const config = getCurrentEnvironmentConfig();
  
  if (process.env.SSH_KEY_PATH) {
    return process.env.SSH_KEY_PATH;
  }
  
  if (config.sshKeyPath) {
    return config.sshKeyPath;
  }
  
  return DEFAULT_SSH_KEY_PATH;
}

export function getCurrentEnvironment(): Environment {
  return detectEnvironment();
}

export function isProductionEnvironment(): boolean {
  return getCurrentEnvironmentConfig().isProduction;
}

export async function getServersWithRegistryDiscovery(): Promise<ServerConfig[]> {
  const servers = await getAllServers();
  
  try {
    const { getHealthyPeers } = await import("./service-registry");
    const registeredPeers = await getHealthyPeers();
    
    for (const peer of registeredPeers) {
      const existingServer = servers.find(
        s => s.id === peer.name || 
             s.tailscaleIp === peer.endpoint.replace(/^https?:\/\//, "").split(":")[0]
      );
      
      if (!existingServer && peer.capabilities.includes("agent")) {
        const endpoint = peer.endpoint.replace(/^https?:\/\//, "");
        const [host, portStr] = endpoint.split(":");
        const port = portStr ? parseInt(portStr, 10) : 9765;
        
        const serverType = peer.environment === "windows-vm" ? "windows" : "linux";
        
        servers.push({
          id: `registry-${peer.name}`,
          name: `${peer.name} (discovered)`,
          description: `Auto-discovered via service registry from ${peer.environment}`,
          host: host,
          user: serverType === "windows" ? "evin" : "root",
          tailscaleIp: host,
          agentPort: port,
          serverType: serverType,
          isDefault: false,
        });
        
        console.log(`[Server Config] Discovered agent: ${peer.name} at ${host}:${port}`);
      }
    }
  } catch (error) {
    // Service registry not available, use static config only
  }
  
  return servers;
}

export async function discoverWindowsAgent(): Promise<ServerConfig | null> {
  try {
    const { findAIService } = await import("./service-registry");
    const aiService = await findAIService();
    
    if (aiService && aiService.environment === "windows-vm") {
      const endpoint = aiService.endpoint.replace(/^https?:\/\//, "");
      const [host, portStr] = endpoint.split(":");
      const port = portStr ? parseInt(portStr, 10) : 9765;
      
      return {
        id: "windows-discovered",
        name: "Windows VM (discovered)",
        description: "Auto-discovered Windows AI agent",
        host: host,
        user: "evin",
        tailscaleIp: host,
        agentPort: port,
        serverType: "windows",
        isDefault: false,
      };
    }
  } catch {
    // Fallback to default Windows config
  }
  
  return DEFAULT_SERVERS.find(s => s.id === "windows") || null;
}
