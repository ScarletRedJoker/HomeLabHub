import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { registerService, heartbeat as sendHeartbeat } from "@/lib/service-registry";
import { peerDiscovery } from "@/lib/peer-discovery";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface CreateProjectRequest {
  name: string;
  template: string;
  templateName: string;
  serverId: string;
  techStack: string[];
  features: string[];
  category: string;
}

interface ProjectHealthStatus {
  status: "healthy" | "pending-deploy" | "unreachable" | "checking";
  lastCheck: string | null;
  message: string;
}

const TEMPLATE_CAPABILITIES: Record<string, string[]> = {
  "saas-starter": ["web", "api", "auth", "database", "stripe"],
  "ecommerce-pro": ["web", "api", "database", "payments", "inventory"],
  "rest-api": ["api", "database"],
  "admin-dashboard": ["web", "api", "database", "admin"],
  "discord-bot": ["bot", "discord", "commands"],
  "landing-page": ["web", "static"],
  "nextjs-app": ["web", "api", "ssr"],
  "react-spa": ["web", "spa"],
  "static-site": ["web", "static"],
  "express-rest": ["api", "rest"],
  "fastapi": ["api", "python", "rest"],
  "graphql-api": ["api", "graphql"],
  "microservice": ["api", "microservice"],
  "ollama-chat": ["ai", "llm", "chat", "gpu"],
  "sd-image-gen": ["ai", "stable-diffusion", "image", "gpu"],
  "comfyui-workflow": ["ai", "comfyui", "workflow", "gpu"],
  "ai-agent": ["ai", "agent", "llm", "gpu"],
  "telegram-bot": ["bot", "telegram"],
  "slack-bot": ["bot", "slack"],
  "nextjs-postgres": ["web", "api", "database", "fullstack"],
  "mern-stack": ["web", "api", "database", "fullstack"],
  "t3-stack": ["web", "api", "database", "trpc", "fullstack"],
};

const SERVER_RECOMMENDATIONS: Record<string, string[]> = {
  "linode": ["web", "api", "dashboard", "bot", "static", "auth", "stripe"],
  "home": ["media", "gaming", "plex", "homelab", "internal"],
  "windows": ["gpu", "ai", "ml", "stable-diffusion", "ollama", "comfyui"],
};

const projectHealthCache = new Map<string, ProjectHealthStatus>();

function getRecommendedServers(capabilities: string[]): string[] {
  const servers: string[] = [];
  
  for (const [server, serverCaps] of Object.entries(SERVER_RECOMMENDATIONS)) {
    const hasMatchingCap = capabilities.some(cap => 
      serverCaps.includes(cap) || 
      serverCaps.some(sc => sc.includes(cap) || cap.includes(sc))
    );
    if (hasMatchingCap) {
      servers.push(server);
    }
  }
  
  if (servers.length === 0) {
    servers.push("linode");
  }
  
  return servers;
}

async function performHealthCheck(
  projectSlug: string,
  healthEndpoint: string
): Promise<ProjectHealthStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(healthEndpoint, {
      method: "GET",
      signal: controller.signal,
    });
    
    clearTimeout(timeout);

    if (response.ok) {
      const status: ProjectHealthStatus = {
        status: "healthy",
        lastCheck: new Date().toISOString(),
        message: "Service is responding",
      };
      projectHealthCache.set(projectSlug, status);
      return status;
    } else {
      const status: ProjectHealthStatus = {
        status: "unreachable",
        lastCheck: new Date().toISOString(),
        message: `HTTP ${response.status}`,
      };
      projectHealthCache.set(projectSlug, status);
      return status;
    }
  } catch (error: any) {
    const status: ProjectHealthStatus = {
      status: "pending-deploy",
      lastCheck: new Date().toISOString(),
      message: error.name === "AbortError" ? "Health check timed out" : "Service not yet deployed",
    };
    projectHealthCache.set(projectSlug, status);
    return status;
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: CreateProjectRequest = await request.json();
    const { name, template, templateName, serverId, techStack, features, category } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    if (!template) {
      return NextResponse.json({ error: "Template is required" }, { status: 400 });
    }

    if (!serverId) {
      return NextResponse.json({ error: "Target server is required" }, { status: 400 });
    }

    const projectSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const capabilities = TEMPLATE_CAPABILITIES[template] || ["web"];
    const recommendedServers = getRecommendedServers(capabilities);
    
    const projectUrl = serverId === "linode" 
      ? `https://${projectSlug}.evindrake.net`
      : serverId === "home"
        ? `http://${projectSlug}.home.nebula`
        : `https://ai.nebula.local/${projectSlug}`;

    const healthEndpoint = `${projectUrl}/api/health`;

    const environment = serverId === "linode" ? "linode" : serverId === "home" ? "ubuntu-home" : "windows-vm";
    const serviceCapabilities = [...new Set([...capabilities, template, category, "project"])];
    
    const metadata = {
      environment,
      version: "1.0.0",
      port: 5000,
      template,
      templateName,
      category,
      techStack,
      features,
      deploymentTarget: serverId,
      healthEndpoint,
      projectUrl,
      createdAt: new Date().toISOString(),
      createdBy: user.username || "system",
      isRecommendedServer: recommendedServers.includes(serverId),
    };

    let registrationSuccess = false;
    let peerRegistrationSuccess = false;

    try {
      registrationSuccess = await registerService(
        projectSlug, 
        serviceCapabilities, 
        healthEndpoint, 
        metadata
      );
      
      if (registrationSuccess) {
        console.log(`[Projects/Create] Service registered: ${projectSlug}@${environment}`);
        
        await sendHeartbeat();
      }
    } catch (regError) {
      console.warn("[Projects/Create] Service registration warning:", regError);
    }

    try {
      peerDiscovery.notifyChange({
        name: projectSlug,
        environment,
        endpoint: healthEndpoint,
        capabilities: serviceCapabilities,
        healthy: false,
        lastSeen: new Date(),
        metadata,
      }, "added");
      peerRegistrationSuccess = true;
      console.log(`[Projects/Create] Peer notification sent for: ${projectSlug}`);
    } catch (peerError) {
      console.warn("[Projects/Create] Peer discovery notification warning:", peerError);
    }

    projectHealthCache.set(projectSlug, {
      status: "checking",
      lastCheck: null,
      message: "Initial health check scheduled",
    });

    setTimeout(async () => {
      try {
        const healthStatus = await performHealthCheck(projectSlug, healthEndpoint);
        console.log(`[Projects/Create] Initial health check for ${projectSlug}: ${healthStatus.status}`);
        
        if (healthStatus.status === "healthy") {
          peerDiscovery.notifyChange({
            name: projectSlug,
            environment,
            endpoint: healthEndpoint,
            capabilities: serviceCapabilities,
            healthy: true,
            lastSeen: new Date(),
            metadata,
          }, "updated");
        }
      } catch (error) {
        console.error(`[Projects/Create] Health check error for ${projectSlug}:`, error);
      }
    }, 2000);

    const project = {
      id: `proj-${Date.now()}`,
      name,
      slug: projectSlug,
      template,
      templateName,
      serverId,
      serverName: serverId === "linode" ? "Linode Server" : serverId === "home" ? "Home Server" : "Windows VM",
      techStack,
      features,
      category,
      capabilities: serviceCapabilities,
      url: projectUrl,
      healthEndpoint,
      status: "created",
      healthStatus: "checking",
      recommendedServers,
      isRecommendedServer: recommendedServers.includes(serverId),
      registration: {
        serviceRegistry: registrationSuccess,
        peerDiscovery: peerRegistrationSuccess,
      },
      createdAt: new Date().toISOString(),
      createdBy: user.username || "system",
    };

    console.log(`[Projects/Create] Created project: ${name} (${projectSlug}) on ${serverId}`);
    if (!project.isRecommendedServer) {
      console.warn(`[Projects/Create] Warning: ${serverId} may not be optimal for ${template}. Recommended: ${recommendedServers.join(", ")}`);
    }

    return NextResponse.json({
      success: true,
      project,
      message: `Project "${name}" created successfully${!project.isRecommendedServer ? ` (Note: ${recommendedServers[0]} may be more suitable for this project type)` : ""}`,
    });
  } catch (error: any) {
    console.error("[Projects/Create] Error:", error);
    return NextResponse.json(
      { error: "Failed to create project", details: error.message },
      { status: 500 }
    );
  }
}
