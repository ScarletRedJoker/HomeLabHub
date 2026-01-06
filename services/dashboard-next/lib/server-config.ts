export interface ServerConfig {
  id: string;
  name: string;
  description: string;
  host: string;
  user: string;
  keyPath: string;
  supportsWol: boolean;
  macAddress?: string;
  broadcastAddress?: string;
}

export function getServerConfigs(): ServerConfig[] {
  return [
    {
      id: "linode",
      name: "Linode Server",
      description: "Public services - Discord Bot, Stream Bot",
      host: process.env.LINODE_SSH_HOST || "linode.evindrake.net",
      user: process.env.LINODE_SSH_USER || "root",
      keyPath: process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa",
      supportsWol: false,
    },
    {
      id: "home",
      name: "Home Server",
      description: "Private services - Plex, Home Assistant",
      host: process.env.HOME_SSH_HOST || "host.evindrake.net",
      user: process.env.HOME_SSH_USER || "evin",
      keyPath: process.env.SSH_KEY_PATH || "/root/.ssh/id_rsa",
      supportsWol: true,
      macAddress: process.env.HOME_SERVER_MAC,
      broadcastAddress: process.env.HOME_SERVER_BROADCAST || "255.255.255.255",
    },
  ];
}

export function getServerById(id: string): ServerConfig | undefined {
  return getServerConfigs().find((s) => s.id === id);
}
