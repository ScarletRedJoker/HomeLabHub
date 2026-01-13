import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { installations, marketplacePackages } from "@/lib/db/platform-schema";
import { eq, desc, inArray } from "drizzle-orm";
import { getPackageById, MARKETPLACE_CATALOG } from "@/lib/marketplace/catalog";
import { InstalledPackage } from "@/lib/marketplace/packages";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const packageId = searchParams.get("packageId");

    let query = db.select({
      id: installations.id,
      packageId: installations.packageId,
      status: installations.status,
      config: installations.config,
      containerIds: installations.containerIds,
      port: installations.port,
      installedAt: installations.installedAt,
    }).from(installations);

    if (status) {
      query = query.where(eq(installations.status, status)) as typeof query;
    }

    const installedPackages = await query.orderBy(desc(installations.installedAt));

    const enrichedPackages: InstalledPackage[] = installedPackages.map(inst => {
      const config = (inst.config || {}) as Record<string, string>;
      const pkgId = config.packageId || inst.packageId;
      const catalogPkg = pkgId ? getPackageById(pkgId as string) : null;

      return {
        id: inst.id,
        packageId: pkgId as string || "unknown",
        packageName: catalogPkg?.name || config.packageId || "Unknown Package",
        displayName: catalogPkg?.displayName || config.displayName || "Unknown",
        status: inst.status as InstalledPackage["status"],
        serverId: config.serverId || "linode",
        serverName: config.serverName,
        containerId: inst.containerIds?.[0],
        port: inst.port || undefined,
        config,
        installedAt: inst.installedAt || new Date(),
        errorMessage: config.errorMessage,
      };
    });

    const filteredPackages = packageId
      ? enrichedPackages.filter(p => p.packageId === packageId)
      : enrichedPackages;

    const statusCounts = {
      total: filteredPackages.length,
      running: filteredPackages.filter(p => p.status === "running").length,
      installing: filteredPackages.filter(p => p.status === "installing").length,
      stopped: filteredPackages.filter(p => p.status === "stopped").length,
      error: filteredPackages.filter(p => p.status === "error").length,
      pending: filteredPackages.filter(p => p.status === "pending").length,
    };

    return NextResponse.json({
      installations: filteredPackages,
      counts: statusCounts,
    });
  } catch (error: any) {
    console.error("Failed to fetch installed packages:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch installed packages" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const installationId = searchParams.get("id");

    if (!installationId) {
      return NextResponse.json({ error: "Installation ID required" }, { status: 400 });
    }

    const [installation] = await db.select()
      .from(installations)
      .where(eq(installations.id, installationId as any))
      .limit(1);

    if (!installation) {
      return NextResponse.json({ error: "Installation not found" }, { status: 404 });
    }

    await db.delete(installations)
      .where(eq(installations.id, installationId as any));

    return NextResponse.json({
      success: true,
      message: "Installation record removed",
    });
  } catch (error: any) {
    console.error("Failed to delete installation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete installation" },
      { status: 500 }
    );
  }
}
