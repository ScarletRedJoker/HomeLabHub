import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { aiModels, modelFavorites, modelDownloads } from "@/lib/db/platform-schema";
import { eq, desc, and, sql, or, ilike } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const source = searchParams.get("source");
  const query = searchParams.get("query");
  const sortBy = searchParams.get("sort") || "updated";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const conditions: any[] = [];

    if (type && type !== "all") {
      conditions.push(eq(aiModels.type, type));
    }
    if (status && status !== "all") {
      conditions.push(eq(aiModels.status, status));
    }
    if (source && source !== "all") {
      conditions.push(eq(aiModels.source, source));
    }
    if (query) {
      conditions.push(
        or(
          ilike(aiModels.name, `%${query}%`),
          ilike(aiModels.creator, `%${query}%`)
        )
      );
    }

    const orderByClause = sortBy === "name" 
      ? aiModels.name 
      : sortBy === "useCount" 
        ? desc(aiModels.useCount)
        : sortBy === "lastUsed"
          ? desc(aiModels.lastUsed)
          : desc(aiModels.updatedAt);

    const models = await db
      .select()
      .from(aiModels)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderByClause)
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiModels)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const favorites = await db
      .select({ modelId: modelFavorites.modelId })
      .from(modelFavorites)
      .where(eq(modelFavorites.userId, user.id || "anonymous"));

    const favoriteIds = new Set(favorites.map(f => f.modelId));

    const enrichedModels = models.map(m => ({
      ...m,
      fileSizeFormatted: m.fileSize ? formatBytes(Number(m.fileSize)) : null,
      isFavorite: favoriteIds.has(m.id),
    }));

    const stats = await db
      .select({
        type: aiModels.type,
        count: sql<number>`count(*)`,
        totalSize: sql<string>`sum(COALESCE(file_size, 0))`,
      })
      .from(aiModels)
      .where(eq(aiModels.status, "installed"))
      .groupBy(aiModels.type);

    const typeStats: Record<string, { count: number; totalSize: string }> = {};
    for (const s of stats) {
      typeStats[s.type] = {
        count: Number(s.count),
        totalSize: formatBytes(Number(s.totalSize || 0)),
      };
    }

    return NextResponse.json({
      models: enrichedModels,
      total: Number(countResult?.count || 0),
      limit,
      offset,
      stats: typeStats,
    });
  } catch (error: any) {
    console.error("Registry error:", error);
    return NextResponse.json(
      { error: "Failed to fetch registry", details: error.message },
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
    const { action, modelId, externalSource, externalId, name, type, thumbnailUrl } = body;

    if (action === "favorite") {
      const existing = await db
        .select()
        .from(modelFavorites)
        .where(
          and(
            eq(modelFavorites.userId, user.id || "anonymous"),
            modelId ? eq(modelFavorites.modelId, modelId) : and(
              eq(modelFavorites.externalSource, externalSource),
              eq(modelFavorites.externalId, externalId)
            )
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return NextResponse.json({ message: "Already favorited" });
      }

      await db.insert(modelFavorites).values({
        userId: user.id || "anonymous",
        modelId: modelId || null,
        externalSource,
        externalId,
        name,
        type,
        thumbnailUrl,
      });

      return NextResponse.json({ success: true, message: "Added to favorites" });
    }

    if (action === "unfavorite") {
      await db
        .delete(modelFavorites)
        .where(
          and(
            eq(modelFavorites.userId, user.id || "anonymous"),
            modelId ? eq(modelFavorites.modelId, modelId) : and(
              eq(modelFavorites.externalSource, externalSource || ""),
              eq(modelFavorites.externalId, externalId || "")
            )
          )
        );

      return NextResponse.json({ success: true, message: "Removed from favorites" });
    }

    if (action === "recordUse") {
      if (!modelId) {
        return NextResponse.json({ error: "Model ID required" }, { status: 400 });
      }

      await db
        .update(aiModels)
        .set({
          useCount: sql`COALESCE(use_count, 0) + 1`,
          lastUsed: new Date(),
        })
        .where(eq(aiModels.id, modelId));

      return NextResponse.json({ success: true });
    }

    if (action === "updateMetadata") {
      if (!modelId) {
        return NextResponse.json({ error: "Model ID required" }, { status: 400 });
      }

      const updateData: any = { updatedAt: new Date() };
      if (body.name) updateData.name = body.name;
      if (body.description) updateData.description = body.description;
      if (body.tags) updateData.tags = body.tags;

      await db
        .update(aiModels)
        .set(updateData)
        .where(eq(aiModels.id, modelId));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Registry action error:", error);
    return NextResponse.json(
      { error: "Action failed", details: error.message },
      { status: 500 }
    );
  }
}
