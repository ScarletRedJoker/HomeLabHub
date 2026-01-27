import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { db, isDbConnected } from "@/lib/db";
import { influencerPersonas } from "@/lib/db/platform-schema";
import { eq, desc } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const { searchParams } = request.nextUrl;
    const activeOnly = searchParams.get("active") !== "false";

    let query = db.select().from(influencerPersonas).orderBy(desc(influencerPersonas.createdAt));

    if (activeOnly) {
      query = query.where(eq(influencerPersonas.isActive, true)) as typeof query;
    }

    const personas = await query;

    return NextResponse.json({
      personas,
      count: personas.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!isDbConnected()) {
      return NextResponse.json({ error: "Database not connected" }, { status: 503 });
    }

    const body = await request.json();
    const {
      name,
      displayName,
      description,
      referenceImages,
      stylePrompt,
      negativePrompt,
      loraPath,
      loraWeight,
      embeddingName,
      workflowTemplateId,
      voiceId,
      voiceSettings,
      personalityTraits,
      writingStyle,
      topicFocus,
      platforms,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    const [persona] = await db
      .insert(influencerPersonas)
      .values({
        name,
        displayName: displayName || null,
        description: description || null,
        referenceImages: referenceImages || [],
        stylePrompt: stylePrompt || null,
        negativePrompt: negativePrompt || null,
        loraPath: loraPath || null,
        loraWeight: loraWeight || "0.8",
        embeddingName: embeddingName || null,
        workflowTemplateId: workflowTemplateId || null,
        voiceId: voiceId || null,
        voiceSettings: voiceSettings || null,
        personalityTraits: personalityTraits || [],
        writingStyle: writingStyle || null,
        topicFocus: topicFocus || [],
        platforms: platforms || [],
      })
      .returning();

    return NextResponse.json(persona, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
