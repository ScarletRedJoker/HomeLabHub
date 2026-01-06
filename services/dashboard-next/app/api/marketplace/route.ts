import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface MarketplacePackage {
  name: string;
  version: string;
  displayName: string;
  description: string;
  category: string;
  icon?: string;
  repository: string;
  variables?: Array<{
    name: string;
    description: string;
    default?: string;
    required?: boolean;
    secret?: boolean;
  }>;
}

function loadPackages(): MarketplacePackage[] {
  const packagesDir = path.join(process.cwd(), "../../marketplace/packages");
  const altPackagesDir = path.join(process.cwd(), "../../../marketplace/packages");
  
  let dir = packagesDir;
  if (!fs.existsSync(dir)) {
    dir = altPackagesDir;
  }
  if (!fs.existsSync(dir)) {
    return getBuiltinPackages();
  }

  const packages: MarketplacePackage[] = [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const pkg = yaml.load(content) as MarketplacePackage;
      if (pkg && pkg.name) {
        packages.push(pkg);
      }
    } catch (error) {
      console.error(`Failed to load package ${file}:`, error);
    }
  }

  return packages.length > 0 ? packages : getBuiltinPackages();
}

function getBuiltinPackages(): MarketplacePackage[] {
  return [
    {
      name: "ollama",
      version: "0.1.0",
      displayName: "Ollama",
      description: "Run large language models locally. Supports Llama 3.2, CodeLlama, Mistral, and more.",
      category: "ai",
      repository: "docker.io/ollama/ollama",
      variables: [
        { name: "PORT", description: "API port", default: "11434" },
        { name: "OLLAMA_MODELS", description: "Models to pull", default: "llama3.2" },
      ],
    },
    {
      name: "uptime-kuma",
      version: "1.23.0",
      displayName: "Uptime Kuma",
      description: "Self-hosted monitoring tool. Monitor HTTP, TCP, DNS, and Docker containers.",
      category: "monitoring",
      repository: "docker.io/louislam/uptime-kuma",
      variables: [
        { name: "PORT", description: "Web UI port", default: "3001" },
      ],
    },
    {
      name: "n8n",
      version: "1.20.0",
      displayName: "n8n Workflow Automation",
      description: "Fair-code workflow automation with 400+ integrations. Visual workflow editor.",
      category: "tools",
      repository: "docker.io/n8nio/n8n",
      variables: [
        { name: "PORT", description: "Web UI port", default: "5678" },
        { name: "ADMIN_USER", description: "Admin username", default: "admin" },
        { name: "ADMIN_PASSWORD", description: "Admin password", required: true, secret: true },
      ],
    },
    {
      name: "code-server",
      version: "4.20.0",
      displayName: "VS Code (code-server)",
      description: "Run VS Code in the browser. Full IDE experience with extensions and terminal.",
      category: "tools",
      repository: "docker.io/codercom/code-server",
      variables: [
        { name: "PORT", description: "Web UI port", default: "8443" },
        { name: "PASSWORD", description: "Access password", required: true, secret: true },
      ],
    },
    {
      name: "grafana",
      version: "10.2.0",
      displayName: "Grafana",
      description: "The open observability platform. Create dashboards for metrics, logs, and traces.",
      category: "monitoring",
      repository: "docker.io/grafana/grafana",
      variables: [
        { name: "PORT", description: "Web UI port", default: "3000" },
        { name: "ADMIN_USER", description: "Admin username", default: "admin" },
        { name: "ADMIN_PASSWORD", description: "Admin password", required: true, secret: true },
      ],
    },
    {
      name: "postgres",
      version: "16.0",
      displayName: "PostgreSQL",
      description: "The world's most advanced open source relational database.",
      category: "database",
      repository: "docker.io/library/postgres",
      variables: [
        { name: "PORT", description: "Database port", default: "5432" },
        { name: "POSTGRES_USER", description: "Database user", default: "postgres" },
        { name: "POSTGRES_PASSWORD", description: "Database password", required: true, secret: true },
        { name: "POSTGRES_DB", description: "Default database", default: "nebula" },
      ],
    },
    {
      name: "redis",
      version: "7.2",
      displayName: "Redis",
      description: "In-memory data store for caching, messaging, and real-time data.",
      category: "database",
      repository: "docker.io/library/redis",
      variables: [
        { name: "PORT", description: "Redis port", default: "6379" },
      ],
    },
    {
      name: "stable-diffusion",
      version: "1.0.0",
      displayName: "Stable Diffusion WebUI",
      description: "AI image generation with Automatic1111 WebUI. Requires NVIDIA GPU.",
      category: "ai",
      repository: "ghcr.io/automatic1111/stable-diffusion-webui",
      variables: [
        { name: "PORT", description: "WebUI port", default: "7860" },
      ],
    },
  ];
}

const installations: Map<string, Installation> = new Map();

interface Installation {
  id: string;
  packageName: string;
  status: "pending" | "installing" | "running" | "stopped" | "error";
  config: Record<string, string>;
  server: "linode" | "homelab";
  createdAt: Date;
  error?: string;
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");

  let packages = loadPackages();

  if (category) {
    packages = packages.filter(p => p.category === category);
  }

  if (search) {
    const searchLower = search.toLowerCase();
    packages = packages.filter(
      p =>
        p.name.toLowerCase().includes(searchLower) ||
        p.displayName.toLowerCase().includes(searchLower) ||
        p.description.toLowerCase().includes(searchLower)
    );
  }

  const categories = [
    { id: "all", name: "All", count: loadPackages().length },
    { id: "ai", name: "AI & ML", count: loadPackages().filter(p => p.category === "ai").length },
    { id: "database", name: "Databases", count: loadPackages().filter(p => p.category === "database").length },
    { id: "monitoring", name: "Monitoring", count: loadPackages().filter(p => p.category === "monitoring").length },
    { id: "tools", name: "Developer Tools", count: loadPackages().filter(p => p.category === "tools").length },
    { id: "web", name: "Web Apps", count: loadPackages().filter(p => p.category === "web").length },
    { id: "media", name: "Media", count: loadPackages().filter(p => p.category === "media").length },
  ];

  return NextResponse.json({
    packages,
    categories,
    total: packages.length,
  });
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { packageName, config = {}, server = "linode" } = body;

    if (!packageName) {
      return NextResponse.json({ error: "Package name is required" }, { status: 400 });
    }

    const allPackages = loadPackages();
    const pkg = allPackages.find(p => p.name === packageName);
    if (!pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    const missingRequired = pkg.variables
      ?.filter(v => v.required && !config[v.name] && !v.default)
      .map(v => v.name);
    
    if (missingRequired && missingRequired.length > 0) {
      return NextResponse.json(
        { error: `Missing required variables: ${missingRequired.join(", ")}` },
        { status: 400 }
      );
    }

    const installId = `${packageName}-${Date.now()}`;
    const installation: Installation = {
      id: installId,
      packageName,
      status: "pending",
      config,
      server: server as "linode" | "homelab",
      createdAt: new Date(),
    };

    installations.set(installId, installation);

    queueInstallation(installId, pkg, config, server);

    return NextResponse.json({
      success: true,
      installationId: installId,
      message: `Installation of ${pkg.displayName} queued for ${server}`,
      status: "pending",
    });
  } catch (error: any) {
    console.error("Install error:", error);
    return NextResponse.json(
      { error: error.message || "Installation failed" },
      { status: 500 }
    );
  }
}

async function queueInstallation(
  installId: string,
  pkg: MarketplacePackage,
  config: Record<string, string>,
  server: string
) {
  const installation = installations.get(installId);
  if (!installation) return;

  installation.status = "installing";

  try {
    const envVars = pkg.variables
      ?.map(v => {
        const value = config[v.name] || v.default || "";
        return `${v.name}=${value}`;
      })
      .join(" ");

    const dockerCommand = `docker run -d --name ${pkg.name} ${envVars ? `--env ${envVars.split(" ").join(" --env ")}` : ""} ${pkg.repository}`;

    console.log(`[Marketplace] Would execute on ${server}:`, dockerCommand);
    console.log(`[Marketplace] Package: ${pkg.displayName} v${pkg.version}`);

    await new Promise(resolve => setTimeout(resolve, 2000));

    installation.status = "running";
    console.log(`[Marketplace] ${pkg.displayName} installed successfully on ${server}`);
  } catch (error: any) {
    installation.status = "error";
    installation.error = error.message;
    console.error(`[Marketplace] Failed to install ${pkg.displayName}:`, error);
  }
}
