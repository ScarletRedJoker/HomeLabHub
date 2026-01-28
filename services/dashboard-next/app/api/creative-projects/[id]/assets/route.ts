import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { creativeProjectAssets, creativeProjects } from "@/lib/db/platform-schema";
import { eq, desc, and } from "drizzle-orm";
import { getUser } from "@/lib/auth";

async function verifyProjectOwnership(projectId: string, username: string): Promise<boolean> {
  const project = await db.select()
    .from(creativeProjects)
    .where(and(
      eq(creativeProjects.id, projectId),
      eq(creativeProjects.userId, username)
    ))
    .limit(1);
  return project.length > 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const isOwner = await verifyProjectOwnership(id, user.username);
    if (!isOwner) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const assets = await db.select()
      .from(creativeProjectAssets)
      .where(eq(creativeProjectAssets.projectId, id))
      .orderBy(desc(creativeProjectAssets.createdAt));

    return NextResponse.json({ success: true, assets });
  } catch (error: unknown) {
    console.error("Creative Assets GET error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to fetch assets" 
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { type, data, metadata = {} } = body;

    if (!type || !data) {
      return NextResponse.json({ error: "Type and data are required" }, { status: 400 });
    }

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const isOwner = await verifyProjectOwnership(id, user.username);
    if (!isOwner) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const newAsset = await db.insert(creativeProjectAssets)
      .values({
        projectId: id,
        type,
        data,
        metadata,
      })
      .returning();

    await db.update(creativeProjects)
      .set({ updatedAt: new Date() })
      .where(eq(creativeProjects.id, id));

    return NextResponse.json({ 
      success: true, 
      asset: newAsset[0]
    });
  } catch (error: unknown) {
    console.error("Creative Assets POST error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to add asset" 
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get("assetId");

    if (!assetId) {
      return NextResponse.json({ error: "Asset ID is required" }, { status: 400 });
    }

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const isOwner = await verifyProjectOwnership(id, user.username);
    if (!isOwner) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const deleted = await db.delete(creativeProjectAssets)
      .where(eq(creativeProjectAssets.id, assetId))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Creative Assets DELETE error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to delete asset" 
    }, { status: 500 });
  }
}
