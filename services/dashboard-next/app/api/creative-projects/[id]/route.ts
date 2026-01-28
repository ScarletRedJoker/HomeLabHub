import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { creativeProjects, creativeProjectAssets } from "@/lib/db/platform-schema";
import { eq, desc, and } from "drizzle-orm";
import { getUser } from "@/lib/auth";

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

    const project = await db.select()
      .from(creativeProjects)
      .where(and(
        eq(creativeProjects.id, id),
        eq(creativeProjects.userId, user.username)
      ))
      .limit(1);

    if (project.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const assets = await db.select()
      .from(creativeProjectAssets)
      .where(eq(creativeProjectAssets.projectId, id))
      .orderBy(desc(creativeProjectAssets.createdAt));

    return NextResponse.json({ 
      success: true, 
      project: project[0],
      assets 
    });
  } catch (error: unknown) {
    console.error("Creative Project GET error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to fetch project" 
    }, { status: 500 });
  }
}

export async function PUT(
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

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const existing = await db.select()
      .from(creativeProjects)
      .where(and(
        eq(creativeProjects.id, id),
        eq(creativeProjects.userId, user.username)
      ))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { name, type, data, thumbnail } = body;

    const updated = await db.update(creativeProjects)
      .set({
        ...(name && { name }),
        ...(type && { type }),
        ...(data !== undefined && { data }),
        ...(thumbnail !== undefined && { thumbnail }),
        updatedAt: new Date(),
      })
      .where(eq(creativeProjects.id, id))
      .returning();

    return NextResponse.json({ success: true, project: updated[0] });
  } catch (error: unknown) {
    console.error("Creative Project PUT error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to update project" 
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

    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const existing = await db.select()
      .from(creativeProjects)
      .where(and(
        eq(creativeProjects.id, id),
        eq(creativeProjects.userId, user.username)
      ))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    await db.delete(creativeProjectAssets).where(eq(creativeProjectAssets.projectId, id));
    await db.delete(creativeProjects).where(eq(creativeProjects.id, id));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Creative Project DELETE error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to delete project" 
    }, { status: 500 });
  }
}
