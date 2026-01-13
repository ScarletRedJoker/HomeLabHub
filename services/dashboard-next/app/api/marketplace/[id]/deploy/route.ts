import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getPackageById } from "@/lib/marketplace/catalog";
import { generateDockerRunCommand } from "@/lib/marketplace/packages";
import { db } from "@/lib/db";
import { installations, marketplacePackages } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";
import { Client } from "ssh2";
import { getServerById, getSSHPrivateKey } from "@/lib/server-config-store";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const pkg = getPackageById(id);

  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { config = {}, serverId = "linode" } = body;

    const missingRequired = pkg.envVars
      ?.filter(v => v.required && !config[v.name] && !v.default)
      .map(v => v.name);

    if (missingRequired && missingRequired.length > 0) {
      return NextResponse.json(
        { error: `Missing required variables: ${missingRequired.join(", ")}` },
        { status: 400 }
      );
    }

    let packageId: string | null = null;
    try {
      const [dbPkg] = await db.select({ id: marketplacePackages.id })
        .from(marketplacePackages)
        .where(eq(marketplacePackages.name, pkg.name))
        .limit(1);
      if (dbPkg) packageId = dbPkg.id;
    } catch (e) {
      console.error("Error finding package ID in DB:", e);
    }

    const [installation] = await db.insert(installations).values({
      packageId: packageId as any,
      status: "pending",
      config: { ...config, packageId: pkg.id, displayName: pkg.displayName },
      projectId: null,
    }).returning();

    const installId = installation.id;

    deployPackage(installId, pkg, config, serverId);

    return NextResponse.json({
      success: true,
      installationId: installId,
      message: `Deployment of ${pkg.displayName} initiated`,
      status: "pending",
    });
  } catch (error: any) {
    console.error("Deploy error:", error);
    return NextResponse.json(
      { error: error.message || "Deployment failed" },
      { status: 500 }
    );
  }
}

async function deployPackage(
  installId: string,
  pkg: ReturnType<typeof getPackageById>,
  config: Record<string, string>,
  serverId: string
) {
  if (!pkg) return;

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

    console.log(`[Marketplace Deploy] Executing on ${server.name}:`, dockerCommand);

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

      console.log(`[Marketplace Deploy] ${pkg.displayName} deployed successfully on ${server.name}`);
      console.log(`[Marketplace Deploy] Container ID: ${containerId}`);
    } else {
      const errorMsg = result.error || "Docker command failed";
      console.error(`[Marketplace Deploy] SSH execution failed: ${errorMsg}`);
      if (result.output) {
        console.error(`[Marketplace Deploy] Output: ${result.output}`);
      }
      throw new Error(errorMsg);
    }
  } catch (error: any) {
    const errorMessage = error.message || "Unknown deployment error";
    console.error(`[Marketplace Deploy] Failed to deploy ${pkg?.displayName}:`, errorMessage);
    await db.update(installations)
      .set({
        status: "error",
        config: { ...(config || {}), packageId: pkg?.id, errorMessage },
      })
      .where(eq(installations.id, installId as any));
  }
}
