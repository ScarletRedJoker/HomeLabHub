export interface EnvVar {
  name: string;
  description: string;
  default?: string;
  required?: boolean;
  secret?: boolean;
}

export interface PortMapping {
  container: number;
  host: number;
  protocol?: "tcp" | "udp";
  description?: string;
}

export interface VolumeMount {
  container: string;
  host?: string;
  description?: string;
  required?: boolean;
}

export interface MarketplacePackage {
  id: string;
  name: string;
  displayName: string;
  description: string;
  longDescription?: string;
  category: PackageCategory;
  image: string;
  version: string;
  dockerCompose?: string;
  envVars: EnvVar[];
  ports: PortMapping[];
  volumes: VolumeMount[];
  iconUrl?: string;
  repository?: string;
  documentation?: string;
  tags?: string[];
  minMemory?: number;
  minCpu?: number;
  requiresGpu?: boolean;
  featured?: boolean;
}

export type PackageCategory = 
  | "media"
  | "development"
  | "monitoring"
  | "networking"
  | "storage"
  | "database"
  | "ai"
  | "tools"
  | "security";

export interface CategoryInfo {
  id: PackageCategory;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: "media", name: "Media", description: "Media servers and streaming", icon: "Film", color: "bg-pink-500/10 text-pink-500 border-pink-500/20" },
  { id: "development", name: "Development", description: "Developer tools and IDEs", icon: "Code2", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { id: "monitoring", name: "Monitoring", description: "System monitoring and alerting", icon: "Activity", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  { id: "networking", name: "Networking", description: "Network utilities and proxies", icon: "Network", color: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20" },
  { id: "storage", name: "Storage", description: "File storage and sync", icon: "HardDrive", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  { id: "database", name: "Databases", description: "Database servers", icon: "Database", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  { id: "ai", name: "AI & ML", description: "AI and machine learning", icon: "Brain", color: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  { id: "tools", name: "Tools", description: "Productivity and utilities", icon: "Wrench", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  { id: "security", name: "Security", description: "Security and authentication", icon: "Shield", color: "bg-red-500/10 text-red-500 border-red-500/20" },
];

export interface InstalledPackage {
  id: string;
  packageId: string;
  packageName: string;
  displayName: string;
  status: "pending" | "installing" | "running" | "stopped" | "error";
  serverId: string;
  serverName?: string;
  containerId?: string;
  port?: number;
  config: Record<string, string>;
  installedAt: Date;
  errorMessage?: string;
}

export function getCategoryInfo(categoryId: string): CategoryInfo | undefined {
  return CATEGORIES.find(c => c.id === categoryId);
}

export function generateDockerCompose(pkg: MarketplacePackage, config: Record<string, string>): string {
  const envLines = pkg.envVars.map(env => {
    const value = config[env.name] || env.default || "";
    return `      - ${env.name}=${value}`;
  }).join("\n");

  const portLines = pkg.ports.map(port => {
    const hostPort = config[`PORT_${port.container}`] || port.host;
    return `      - "${hostPort}:${port.container}${port.protocol === "udp" ? "/udp" : ""}"`;
  }).join("\n");

  const volumeLines = pkg.volumes.map(vol => {
    const hostPath = config[`VOLUME_${vol.container.replace(/\//g, "_")}`] || vol.host || `./${pkg.id}${vol.container}`;
    return `      - ${hostPath}:${vol.container}`;
  }).join("\n");

  return `version: "3.8"
services:
  ${pkg.id}:
    image: ${pkg.image}
    container_name: ${pkg.id}
    restart: unless-stopped
${envLines ? `    environment:\n${envLines}` : ""}
${portLines ? `    ports:\n${portLines}` : ""}
${volumeLines ? `    volumes:\n${volumeLines}` : ""}
`;
}

export function generateDockerRunCommand(pkg: MarketplacePackage, config: Record<string, string>): string {
  const parts: string[] = ["docker run -d"];
  parts.push(`--name ${pkg.id}`);
  parts.push("--restart unless-stopped");

  for (const port of pkg.ports) {
    const hostPort = config[`PORT_${port.container}`] || config.PORT || port.host;
    parts.push(`-p ${hostPort}:${port.container}${port.protocol === "udp" ? "/udp" : ""}`);
  }

  for (const env of pkg.envVars) {
    const value = config[env.name] || env.default;
    if (value) {
      parts.push(`-e ${env.name}='${value.replace(/'/g, "'\"'\"'")}'`);
    }
  }

  for (const vol of pkg.volumes) {
    const hostPath = vol.host || `/opt/${pkg.id}${vol.container}`;
    parts.push(`-v ${hostPath}:${vol.container}`);
  }

  parts.push(pkg.image);

  return parts.join(" \\\n  ");
}
