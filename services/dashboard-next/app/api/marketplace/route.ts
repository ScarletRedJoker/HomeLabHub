import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { 
  MARKETPLACE_CATALOG, 
  getPackagesByCategory, 
  searchPackages,
  getFeaturedPackages,
} from "@/lib/marketplace/catalog";
import { CATEGORIES, type MarketplacePackage } from "@/lib/marketplace/packages";
import { db } from "@/lib/db";
import { installations, marketplacePackages } from "@/lib/db/platform-schema";
import { eq, inArray } from "drizzle-orm";
import { Client } from "ssh2";
import { getServerById, getSSHPrivateKey } from "@/lib/server-config-store";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface PackageForAPI {
  id: string;
  name: string;
  version: string;
  displayName: string;
  description: string;
  category: string;
  categoryInfo?: {
    name: string;
    color: string;
  };
  icon?: string;
  repository: string;
  ports: { container: number; host: number; description?: string }[];
  volumes: { container: string; description?: string }[];
  variables: {
    name: string;
    description: string;
    default?: string;
    required?: boolean;
    secret?: boolean;
  }[];
  tags?: string[];
  featured?: boolean;
  installed?: boolean;
  installationStatus?: string;
}

function transformPackage(pkg: MarketplacePackage, installedPackages: Set<string>): PackageForAPI {
  const category = CATEGORIES.find(c => c.id === pkg.category);
  return {
    id: pkg.id,
    name: pkg.name,
    version: pkg.version,
    displayName: pkg.displayName,
    description: pkg.description,
    category: pkg.category,
    categoryInfo: category ? { name: category.name, color: category.color } : undefined,
    icon: pkg.iconUrl,
    repository: pkg.image,
    ports: pkg.ports.map(p => ({
      container: p.container,
      host: p.host,
      description: p.description,
    })),
    volumes: pkg.volumes.map(v => ({
      container: v.container,
      description: v.description,
    })),
    variables: pkg.envVars.map(v => ({
      name: v.name,
      description: v.description,
      default: v.default,
      required: v.required,
      secret: v.secret,
    })),
    tags: pkg.tags,
    featured: pkg.featured,
    installed: installedPackages.has(pkg.id),
  };
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const featured = searchParams.get("featured");

  let installedPackages = new Set<string>();
  try {
    const allInstallations = await db.select({ config: installations.config })
      .from(installations)
      .where(eq(installations.status, "running"));
    
    allInstallations.forEach(inst => {
      const config = inst.config as Record<string, any>;
      if (config?.packageId) {
        installedPackages.add(config.packageId);
      }
    });
  } catch (e) {
    console.error("Error fetching installed packages:", e);
  }

  let packages: MarketplacePackage[];

  if (featured === "true") {
    packages = getFeaturedPackages();
  } else if (search) {
    packages = searchPackages(search);
    if (category && category !== "all") {
      packages = packages.filter(p => p.category === category);
    }
  } else {
    packages = getPackagesByCategory(category || "all");
  }

  const transformedPackages = packages.map(pkg => transformPackage(pkg, installedPackages));

  const categoryCounts: Record<string, number> = { all: MARKETPLACE_CATALOG.length };
  MARKETPLACE_CATALOG.forEach(pkg => {
    categoryCounts[pkg.category] = (categoryCounts[pkg.category] || 0) + 1;
  });

  const categories = [
    { id: "all", name: "All", count: MARKETPLACE_CATALOG.length },
    ...CATEGORIES.map(cat => ({
      id: cat.id,
      name: cat.name,
      count: categoryCounts[cat.id] || 0,
      color: cat.color,
      icon: cat.icon,
    })).filter(cat => cat.count > 0),
  ];

  return NextResponse.json({
    packages: transformedPackages,
    categories,
    total: transformedPackages.length,
    installedCount: installedPackages.size,
  });
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { package: packageName, packageId, variables = {}, server = "linode" } = body;

    const pkgIdentifier = packageId || packageName;
    if (!pkgIdentifier) {
      return NextResponse.json({ error: "Package name or ID is required" }, { status: 400 });
    }

    const pkg = MARKETPLACE_CATALOG.find(p => p.id === pkgIdentifier || p.name === pkgIdentifier);
    if (!pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    const missingRequired = pkg.envVars
      ?.filter(v => v.required && !variables[v.name] && !v.default)
      .map(v => v.name);

    if (missingRequired && missingRequired.length > 0) {
      return NextResponse.json(
        { error: `Missing required variables: ${missingRequired.join(", ")}` },
        { status: 400 }
      );
    }

    let dbPackageId: string | null = null;
    try {
      const [dbPkg] = await db.select({ id: marketplacePackages.id })
        .from(marketplacePackages)
        .where(eq(marketplacePackages.name, pkg.name))
        .limit(1);
      if (dbPkg) dbPackageId = dbPkg.id;
    } catch (e) {
      console.error("Error finding package ID in DB:", e);
    }

    const [installation] = await db.insert(installations).values({
      packageId: dbPackageId as any,
      status: "pending",
      config: { ...variables, packageId: pkg.id, displayName: pkg.displayName },
      projectId: null,
    }).returning();

    const installId = installation.id;

    queueInstallation(installId, pkg, variables, server);

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

function escapeShellArg(arg: string): string {
  if (!arg) return "''";
  if (!/[^a-zA-Z0-9_\-./:@=]/.test(arg)) {
    return arg;
  }
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
}

async function executeSSHCommand(
  host: string,
  user: string,
  command: string,
  port: number = 22
): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const privateKey = getSSHPrivateKey();

    if (!privateKey) {
      resolve({ success: false, error: "SSH key not found" });
      return;
    }

    const conn = new Client();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ success: false, error: "Connection timeout" });
    }, 120000);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({ success: false, error: err.message });
          return;
        }

        let output = "";
        let errorOutput = "";

        stream.on("data", (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          errorOutput += data.toString();
        });

        stream.on("close", (code: number) => {
          clearTimeout(timeout);
          conn.end();
          if (code === 0) {
            resolve({ success: true, output: output.trim() });
          } else {
            resolve({
              success: false,
              output: output.trim(),
              error: errorOutput.trim() || `Command exited with code ${code}`,
            });
          }
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    });

    try {
      conn.connect({
        host,
        port,
        username: user,
        privateKey: privateKey,
        readyTimeout: 30000,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message });
    }
  });
}

async function queueInstallation(
  installId: string,
  pkg: MarketplacePackage,
  config: Record<string, string>,
  serverId: string
) {
  try {
    await db.update(installations)
      .set({ status: "installing" })
      .where(eq(installations.id, installId as any));

    const server = await getServerById(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    const envArgs = pkg.envVars
      .map(v => {
        const value = config[v.name] || v.default || "";
        if (!value) return "";
        return `-e ${escapeShellArg(v.name)}=${escapeShellArg(value)}`;
      })
      .filter(Boolean)
      .join(" ");

    const portArgs = pkg.ports
      .map(p => {
        const hostPort = config[`PORT_${p.container}`] || config.PORT || p.host;
        return `-p ${hostPort}:${p.container}${p.protocol === "udp" ? "/udp" : ""}`;
      })
      .join(" ");

    const volumeArgs = pkg.volumes
      .map(v => {
        const hostPath = v.host || `/opt/${pkg.id}${v.container}`;
        return `-v ${hostPath}:${v.container}`;
      })
      .join(" ");

    const containerName = escapeShellArg(pkg.id);
    const image = escapeShellArg(pkg.image);

    const mkdirCommand = pkg.volumes
      .filter(v => !v.host?.includes("docker.sock"))
      .map(v => {
        const hostPath = v.host || `/opt/${pkg.id}${v.container}`;
        return `mkdir -p ${escapeShellArg(hostPath)}`;
      })
      .join(" && ");

    const dockerCommand = [
      mkdirCommand ? `${mkdirCommand} &&` : "",
      `docker pull ${image}`,
      `&& (docker rm -f ${containerName} 2>/dev/null || true)`,
      `&& docker run -d --name ${containerName} --restart unless-stopped`,
      portArgs,
      envArgs,
      volumeArgs,
      image,
    ].filter(Boolean).join(" ");

    console.log(`[Marketplace] Executing on ${server.name}:`, dockerCommand);

    const result = await executeSSHCommand(
      server.host,
      server.user,
      dockerCommand,
      server.port || 22
    );

    if (result.success) {
      const containerId = result.output?.split("\n").pop()?.trim() || null;

      await db.update(installations)
        .set({
          status: "running",
          containerIds: containerId ? [containerId] : null,
          port: pkg.ports[0]?.host || null,
        })
        .where(eq(installations.id, installId as any));

      console.log(`[Marketplace] ${pkg.displayName} installed successfully on ${server.name}`);
      console.log(`[Marketplace] Container ID: ${containerId}`);
    } else {
      const errorMsg = result.error || "Docker command failed";
      console.error(`[Marketplace] SSH execution failed: ${errorMsg}`);
      if (result.output) {
        console.error(`[Marketplace] Output: ${result.output}`);
      }
      throw new Error(errorMsg);
    }
  } catch (error: any) {
    const errorMessage = error.message || "Unknown installation error";
    console.error(`[Marketplace] Failed to install ${pkg.displayName}:`, errorMessage);
    await db.update(installations)
      .set({
        status: "error",
        config: { ...(config || {}), packageId: pkg.id, errorMessage },
      })
      .where(eq(installations.id, installId as any));
  }
}
