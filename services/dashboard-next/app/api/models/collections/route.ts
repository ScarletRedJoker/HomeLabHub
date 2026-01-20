import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { modelCollections, modelCollectionItems, aiModels } from "@/lib/db/platform-schema";
import { eq, desc, and, sql } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

const STARTER_PACKS = [
  {
    id: "starter-sdxl",
    name: "SDXL Essentials",
    description: "Essential models to get started with SDXL generation",
    category: "starter",
    thumbnailUrl: null,
    isStarterPack: true,
    items: [
      { name: "SDXL 1.0 Base", type: "checkpoint", source: "huggingface", sourceId: "stabilityai/stable-diffusion-xl-base-1.0" },
      { name: "SDXL VAE", type: "vae", source: "huggingface", sourceId: "stabilityai/sdxl-vae" },
    ],
  },
  {
    id: "starter-realistic",
    name: "Realistic Photography Pack",
    description: "Top models for photorealistic image generation",
    category: "starter",
    thumbnailUrl: null,
    isStarterPack: true,
    items: [
      { name: "Realistic Vision V5", type: "checkpoint", source: "civitai", sourceId: "4201" },
      { name: "VAE for Realistic", type: "vae", source: "civitai", sourceId: "23906" },
    ],
  },
  {
    id: "starter-anime",
    name: "Anime Art Pack",
    description: "Best models for anime and illustration style",
    category: "starter",
    thumbnailUrl: null,
    isStarterPack: true,
    items: [
      { name: "Anything V5", type: "checkpoint", source: "civitai", sourceId: "9409" },
      { name: "Counterfeit V3", type: "checkpoint", source: "civitai", sourceId: "4468" },
    ],
  },
  {
    id: "starter-lora",
    name: "Popular LoRA Pack",
    description: "Must-have LoRA models for style control",
    category: "starter",
    thumbnailUrl: null,
    isStarterPack: true,
    items: [
      { name: "Detail Tweaker", type: "lora", source: "civitai", sourceId: "58390" },
      { name: "Add More Details", type: "lora", source: "civitai", sourceId: "82098" },
    ],
  },
];

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const includeStarterPacks = searchParams.get("starterPacks") !== "false";
  const category = searchParams.get("category");

  try {
    const conditions: any[] = [];
    
    if (!includeStarterPacks) {
      conditions.push(eq(modelCollections.isStarterPack, false));
    }
    if (category) {
      conditions.push(eq(modelCollections.category, category));
    }

    const collections = await db
      .select()
      .from(modelCollections)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(modelCollections.createdAt));

    const collectionsWithItems = await Promise.all(
      collections.map(async (collection) => {
        const items = await db
          .select()
          .from(modelCollectionItems)
          .where(eq(modelCollectionItems.collectionId, collection.id))
          .orderBy(modelCollectionItems.sortOrder);

        return {
          ...collection,
          items,
        };
      })
    );

    const starterPacks = includeStarterPacks ? STARTER_PACKS : [];

    return NextResponse.json({
      collections: collectionsWithItems,
      starterPacks,
    });
  } catch (error: any) {
    console.error("Collections error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collections", details: error.message },
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
    const { action, collectionId, name, description, category, items, modelData } = body;

    if (action === "create") {
      if (!name) {
        return NextResponse.json({ error: "Collection name required" }, { status: 400 });
      }

      const [collection] = await db.insert(modelCollections).values({
        name,
        description: description || null,
        category: category || "custom",
        userId: user.id || "anonymous",
        isPublic: false,
        isStarterPack: false,
      }).returning();

      return NextResponse.json({ success: true, collection });
    }

    if (action === "addModel") {
      if (!collectionId) {
        return NextResponse.json({ error: "Collection ID required" }, { status: 400 });
      }

      const itemData: any = {
        collectionId,
      };

      if (modelData.modelId) {
        itemData.modelId = modelData.modelId;
      } else {
        itemData.externalSource = modelData.source;
        itemData.externalId = modelData.sourceId;
        itemData.name = modelData.name;
        itemData.type = modelData.type;
        itemData.downloadUrl = modelData.downloadUrl;
        itemData.thumbnailUrl = modelData.thumbnailUrl;
      }

      await db.insert(modelCollectionItems).values(itemData);

      await db
        .update(modelCollections)
        .set({
          modelCount: sql`COALESCE(model_count, 0) + 1`,
          updatedAt: new Date(),
        })
        .where(eq(modelCollections.id, collectionId));

      return NextResponse.json({ success: true });
    }

    if (action === "removeModel") {
      if (!collectionId || !body.itemId) {
        return NextResponse.json({ error: "Collection ID and item ID required" }, { status: 400 });
      }

      await db
        .delete(modelCollectionItems)
        .where(eq(modelCollectionItems.id, body.itemId));

      await db
        .update(modelCollections)
        .set({
          modelCount: sql`GREATEST(COALESCE(model_count, 0) - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(modelCollections.id, collectionId));

      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      if (!collectionId) {
        return NextResponse.json({ error: "Collection ID required" }, { status: 400 });
      }

      await db
        .delete(modelCollectionItems)
        .where(eq(modelCollectionItems.collectionId, collectionId));

      await db
        .delete(modelCollections)
        .where(eq(modelCollections.id, collectionId));

      return NextResponse.json({ success: true });
    }

    if (action === "update") {
      if (!collectionId) {
        return NextResponse.json({ error: "Collection ID required" }, { status: 400 });
      }

      const updateData: any = { updatedAt: new Date() };
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (category) updateData.category = category;

      await db
        .update(modelCollections)
        .set(updateData)
        .where(eq(modelCollections.id, collectionId));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Collection action error:", error);
    return NextResponse.json(
      { error: "Action failed", details: error.message },
      { status: 500 }
    );
  }
}
