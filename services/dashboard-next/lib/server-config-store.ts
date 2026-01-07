import fs from "fs/promises";
import path from "path";

export interface ServerConfig {
  id: string;
  name: string;
  description?: string;
  host: string;
  user: string;
  keyPath?: string;
  deployPath?: string;
  supportsWol?: boolean;
  macAddress?: string;
  broadcastAddress?: string;
  ipmiHost?: string;
  ipmiUser?: string;
  ipmiPassword?: string;
  ipmiManagementServer?: string;
  vncHost?: string;
  vncPort?: number;
  noVncUrl?: string;
  isDefault?: boolean;
}

const SETTINGS_DIR = process.env.STUDIO_PROJECTS_DIR || 
  (process.env.REPL_ID ? "./data/studio-projects" : "/opt/homelab/studio-projects");
const SETTINGS_FILE = "user-settings.json";

// SSH key path - on Linode the key is at /root/.ssh/homelab
const DEFAULT_SSH_KEY_PATH = process.env.SSH_KEY_PATH || "/root/.ssh/homelab";

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
    isDefault: true,
  },
];

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function loadSettingsFile(): Promise<any> {
  try {
    await ensureDir(SETTINGS_DIR);
    const filePath = path.join(SETTINGS_DIR, SETTINGS_FILE);
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
  await ensureDir(SETTINGS_DIR);
  const filePath = path.join(SETTINGS_DIR, SETTINGS_FILE);
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

export function getDefaultServers(): ServerConfig[] {
  return DEFAULT_SERVERS;
}
