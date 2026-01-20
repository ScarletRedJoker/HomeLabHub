import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { homelabServers } from "@/lib/db/platform-schema";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface DiscoveredSite {
  id: string;
  name: string;
  domain: string;
  type: "static" | "dynamic" | "container";
  source: "linode" | "home" | "cloudflare" | "local";
  serverName?: string;
  containerName?: string;
  path?: string;
  status: "online" | "offline" | "unknown";
  lastChecked?: string;
  deploymentTarget?: {
    host: string;
    user: string;
    path: string;
    port?: number;
  };
}

function parseCaddyfile(content: string): DiscoveredSite[] {
  const sites: DiscoveredSite[] = [];
  const lines = content.split("\n");
  let currentDomain = "";
  let currentConfig: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\s*\{?$/) || 
        line.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,},/)) {
      if (currentDomain && currentConfig.length > 0) {
        const configText = currentConfig.join("\n");
        const containerMatch = configText.match(/reverse_proxy\s+([a-zA-Z0-9_-]+):(\d+)/);
        const ipMatch = configText.match(/reverse_proxy\s+(\d+\.\d+\.\d+\.\d+):(\d+)/);
        
        let type: "static" | "dynamic" | "container" = "dynamic";
        let containerName: string | undefined;
        
        if (containerMatch) {
          type = "container";
          containerName = containerMatch[1];
        }

        const domains = currentDomain.split(",").map(d => d.trim()).filter(d => d);
        for (const domain of domains) {
          if (domain && !domain.startsWith(":")) {
            sites.push({
              id: `caddy-${domain.replace(/\./g, "-")}`,
              name: domain.split(".")[0],
              domain: domain,
              type,
              source: ipMatch && ipMatch[1].startsWith("10.200.0") ? "home" : "linode",
              containerName,
              status: "unknown",
            });
          }
        }
      }
      
      currentDomain = line.replace(/\s*\{?\s*$/, "");
      currentConfig = [];
    } else {
      currentConfig.push(line);
    }
  }

  if (currentDomain && currentConfig.length > 0) {
    const configText = currentConfig.join("\n");
    const containerMatch = configText.match(/reverse_proxy\s+([a-zA-Z0-9_-]+):(\d+)/);
    
    let type: "static" | "dynamic" | "container" = "dynamic";
    let containerName: string | undefined;
    
    if (containerMatch) {
      type = "container";
      containerName = containerMatch[1];
    }

    const domains = currentDomain.split(",").map(d => d.trim()).filter(d => d);
    for (const domain of domains) {
      if (domain && !domain.startsWith(":")) {
        sites.push({
          id: `caddy-${domain.replace(/\./g, "-")}`,
          name: domain.split(".")[0],
          domain: domain,
          type,
          source: "linode",
          containerName,
          status: "unknown",
        });
      }
    }
  }

  return sites;
}

function discoverLocalSites(): DiscoveredSite[] {
  const sites: DiscoveredSite[] = [];
  const staticSitePath = join(process.cwd(), "..", "..", "static-site");
  
  if (existsSync(staticSitePath)) {
    try {
      const { readdirSync, statSync } = require("fs");
      const dirs = readdirSync(staticSitePath);
      
      for (const dir of dirs) {
        const fullPath = join(staticSitePath, dir);
        if (statSync(fullPath).isDirectory()) {
          const publicHtmlPath = join(fullPath, "public_html");
          const indexPath = join(publicHtmlPath, "index.html");
          
          if (existsSync(indexPath)) {
            sites.push({
              id: `local-${dir.replace(/\./g, "-")}`,
              name: dir.replace(".com", "").replace(".net", ""),
              domain: dir,
              type: "static",
              source: "local",
              path: publicHtmlPath,
              status: "online",
            });
          }
        }
      }
    } catch (error) {
      console.error("Error scanning static sites:", error);
    }
  }

  return sites;
}

function discoverDeploymentSites(): DiscoveredSite[] {
  const sites: DiscoveredSite[] = [];
  
  const linodeCaddyPath = join(process.cwd(), "..", "..", "deploy", "linode", "Caddyfile");
  if (existsSync(linodeCaddyPath)) {
    try {
      const content = readFileSync(linodeCaddyPath, "utf-8");
      const caddySites = parseCaddyfile(content);
      sites.push(...caddySites.map(site => ({
        ...site,
        source: "linode" as const,
        deploymentTarget: {
          host: process.env.LINODE_HOST || "evindrake.net",
          user: "root",
          path: "/opt/homelab",
          port: 22,
        },
      })));
    } catch (error) {
      console.error("Error parsing Linode Caddyfile:", error);
    }
  }

  const localCaddyPath = join(process.cwd(), "..", "..", "deploy", "local", "Caddyfile");
  if (existsSync(localCaddyPath)) {
    try {
      const content = readFileSync(localCaddyPath, "utf-8");
      const caddySites = parseCaddyfile(content);
      sites.push(...caddySites.map(site => ({
        ...site,
        source: "home" as const,
        deploymentTarget: {
          host: process.env.HOME_SERVER_HOST || "10.200.0.2",
          user: "evin",
          path: "/opt/homelab",
          port: 22,
        },
      })));
    } catch (error) {
      console.error("Error parsing local Caddyfile:", error);
    }
  }

  return sites;
}

async function discoverDatabaseServers(): Promise<DiscoveredSite[]> {
  const sites: DiscoveredSite[] = [];
  
  if (!isDbConnected()) {
    return sites;
  }

  try {
    const servers = await db.select().from(homelabServers);
    
    for (const server of servers) {
      if (server.capabilities?.includes("web-hosting")) {
        sites.push({
          id: `server-${server.slug}`,
          name: server.name,
          domain: server.host,
          type: "dynamic",
          source: server.location === "linode" ? "linode" : "home",
          serverName: server.name,
          status: server.status === "online" ? "online" : "unknown",
          deploymentTarget: {
            host: server.host,
            user: server.user,
            path: server.deployPath || "/var/www",
            port: server.port || 22,
          },
        });
      }
    }
  } catch (error) {
    console.error("Error fetching servers from database:", error);
  }

  return sites;
}

const KNOWN_PORTFOLIO_SITES: DiscoveredSite[] = [
  {
    id: "portfolio-scarletredjoker",
    name: "Personal Portfolio",
    domain: "scarletredjoker.com",
    type: "static",
    source: "linode",
    containerName: "scarletredjoker-web",
    path: "static-site/scarletredjoker.com/public_html",
    status: "online",
    deploymentTarget: {
      host: "evindrake.net",
      user: "root",
      path: "/opt/homelab/static-site/scarletredjoker.com/public_html",
      port: 22,
    },
  },
  {
    id: "portfolio-rig-city",
    name: "Rig City",
    domain: "rig-city.com",
    type: "static",
    source: "linode",
    containerName: "rig-city-site",
    status: "online",
    deploymentTarget: {
      host: "evindrake.net",
      user: "root",
      path: "/opt/homelab/services/rig-city-site",
      port: 22,
    },
  },
];

export async function GET(request: NextRequest) {
  try {
    const source = request.nextUrl.searchParams.get("source");
    const includeHealth = request.nextUrl.searchParams.get("health") === "true";

    let allSites: DiscoveredSite[] = [];

    allSites.push(...KNOWN_PORTFOLIO_SITES);
    
    const localSites = discoverLocalSites();
    allSites.push(...localSites);
    
    const deploymentSites = discoverDeploymentSites();
    for (const site of deploymentSites) {
      const exists = allSites.some(s => s.domain === site.domain);
      if (!exists) {
        allSites.push(site);
      }
    }
    
    const dbSites = await discoverDatabaseServers();
    for (const site of dbSites) {
      const exists = allSites.some(s => s.domain === site.domain);
      if (!exists) {
        allSites.push(site);
      }
    }

    if (source) {
      allSites = allSites.filter(s => s.source === source);
    }

    if (includeHealth) {
      allSites = await Promise.all(
        allSites.map(async (site) => {
          try {
            const response = await fetch(`https://${site.domain}`, {
              method: "HEAD",
              signal: AbortSignal.timeout(5000),
            });
            return {
              ...site,
              status: response.ok ? "online" : "offline",
              lastChecked: new Date().toISOString(),
            } as DiscoveredSite;
          } catch {
            return {
              ...site,
              status: "unknown" as const,
              lastChecked: new Date().toISOString(),
            };
          }
        })
      );
    }

    return NextResponse.json({
      success: true,
      sites: allSites,
      count: allSites.length,
      sources: ["linode", "home", "cloudflare", "local"],
    });
  } catch (error) {
    console.error("Site discovery error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to discover sites" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "refresh") {
      const allSites: DiscoveredSite[] = [];
      
      allSites.push(...KNOWN_PORTFOLIO_SITES);
      allSites.push(...discoverLocalSites());
      
      const deploymentSites = discoverDeploymentSites();
      for (const site of deploymentSites) {
        const exists = allSites.some(s => s.domain === site.domain);
        if (!exists) {
          allSites.push(site);
        }
      }

      return NextResponse.json({
        success: true,
        sites: allSites,
        refreshedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Site discovery POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Discovery action failed" },
      { status: 500 }
    );
  }
}
