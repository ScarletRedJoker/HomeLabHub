import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { influencerPersonas } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { id } = await params;

    const [persona] = await db
      .select()
      .from(influencerPersonas)
      .where(eq(influencerPersonas.id, id))
      .limit(1);

    if (!persona) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    return NextResponse.json(persona);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { id } = await params;
    const body = await request.json();

    const [existing] = await db
      .select()
      .from(influencerPersonas)
      .where(eq(influencerPersonas.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    
    const allowedFields = [
      "name", "displayName", "description", "referenceImages", "stylePrompt",
      "negativePrompt", "loraPath", "loraWeight", "embeddingName", "workflowTemplateId",
      "voiceId", "voiceSettings", "personalityTraits", "writingStyle", "topicFocus",
      "platforms", "isActive"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const [updated] = await db
      .update(influencerPersonas)
      .set(updateData)
      .where(eq(influencerPersonas.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { id } = await params;

    const [deleted] = await db
      .delete(influencerPersonas)
      .where(eq(influencerPersonas.id, id))
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Persona not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
