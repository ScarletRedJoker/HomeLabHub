import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { getPackageById } from "@/lib/marketplace/catalog";
import { CATEGORIES, generateDockerCompose, generateDockerRunCommand } from "@/lib/marketplace/packages";
import { db } from "@/lib/db";
import { installations } from "@/lib/db/platform-schema";
import { eq, and } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(
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

  const category = CATEGORIES.find(c => c.id === pkg.category);

  let installed = false;
  let installationStatus = null;
  try {
    const existingInstall = await db.select()
      .from(installations)
      .where(eq(installations.config, { packageId: id } as any))
      .limit(1);
    
    if (existingInstall.length > 0) {
      installed = true;
      installationStatus = existingInstall[0].status;
    }
  } catch (e) {
  }

  const dockerCompose = generateDockerCompose(pkg, {});
  const dockerRun = generateDockerRunCommand(pkg, {});

  return NextResponse.json({
    package: {
      ...pkg,
      category: {
        id: pkg.category,
        name: category?.name || pkg.category,
        color: category?.color,
      },
      dockerCompose,
      dockerRun,
      installed,
      installationStatus,
    },
  });
}
