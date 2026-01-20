import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { videoPresets, type NewVideoPreset } from "@/lib/db/platform-schema";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { eq, desc, or, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

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
    const mode = searchParams.get("mode");

    let whereConditions = [
      or(
        eq(videoPresets.isPublic, true),
        eq(videoPresets.userId, user.id || "")
      ),
    ];

    if (mode) {
      whereConditions.push(eq(videoPresets.mode, mode));
    }

    const presets = await db
      .select()
      .from(videoPresets)
      .where(and(...whereConditions))
      .orderBy(desc(videoPresets.isDefault), desc(videoPresets.createdAt));

    return NextResponse.json({
      success: true,
      presets,
    });
  } catch (error: any) {
    console.error("[Video Presets API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch presets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      name,
      description,
      mode = "text-to-video",
      duration = 16,
      fps = 8,
      width = 512,
      height = 512,
      motionScale = 1.0,
      cfgScale = 7.0,
      steps = 25,
      scheduler = "euler",
      animateDiffModel,
      cameraMotion = { pan: 0, zoom: 0, rotate: 0 },
      subjectMotion = 1.0,
      negativePrompt,
      isPublic = true,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, error: "Preset name is required" },
        { status: 400 }
      );
    }

    const newPreset: NewVideoPreset = {
      name: name.trim(),
      description: description || null,
      mode,
      duration,
      fps,
      width,
      height,
      motionScale: motionScale.toString(),
      cfgScale: cfgScale.toString(),
      steps,
      scheduler,
      animateDiffModel: animateDiffModel || null,
      cameraMotion,
      subjectMotion: subjectMotion.toString(),
      negativePrompt: negativePrompt || null,
      isPublic,
      isDefault: false,
      userId: user.id || null,
    };

    const [inserted] = await db.insert(videoPresets).values(newPreset).returning();

    return NextResponse.json({
      success: true,
      preset: inserted,
    });
  } catch (error: any) {
    console.error("[Video Presets API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create preset" },
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
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Preset ID is required" },
        { status: 400 }
      );
    }

    const [preset] = await db
      .select()
      .from(videoPresets)
      .where(eq(videoPresets.id, id))
      .limit(1);

    if (!preset) {
      return NextResponse.json(
        { success: false, error: "Preset not found" },
        { status: 404 }
      );
    }

    if (preset.userId !== user.id && !preset.isPublic) {
      return NextResponse.json(
        { success: false, error: "Not authorized to delete this preset" },
        { status: 403 }
      );
    }

    if (preset.isDefault) {
      return NextResponse.json(
        { success: false, error: "Cannot delete default presets" },
        { status: 400 }
      );
    }

    await db.delete(videoPresets).where(eq(videoPresets.id, id));

    return NextResponse.json({
      success: true,
      message: "Preset deleted",
    });
  } catch (error: any) {
    console.error("[Video Presets API] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete preset" },
      { status: 500 }
    );
  }
}
