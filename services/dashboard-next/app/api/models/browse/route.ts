import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface BrowseModel {
  id: string;
  name: string;
  description: string;
  type: string;
  source: "civitai" | "huggingface";
  sourceId: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  creator: string;
  downloads: number;
  rating: number | null;
  ratingCount: number;
  tags: string[];
  nsfw: boolean;
  fileSize: number | null;
  fileSizeFormatted: string | null;
  version: string | null;
  baseModel?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function mapCivitaiType(type: string): string {
  const typeMap: Record<string, string> = {
    "Checkpoint": "checkpoint",
    "LORA": "lora",
    "LoRA": "lora",
    "TextualInversion": "embedding",
    "Hypernetwork": "embedding",
    "AestheticGradient": "embedding",
    "Controlnet": "controlnet",
    "VAE": "vae",
  };
  return typeMap[type] || "checkpoint";
}

async function fetchCivitaiTrending(period: string, limit: number, nsfw: boolean): Promise<BrowseModel[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    sort: "Most Downloaded",
    period: period === "day" ? "Day" : period === "week" ? "Week" : "Month",
  });
  if (!nsfw) params.set("nsfw", "false");

  try {
    const response = await fetch(`https://civitai.com/api/v1/models?${params}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 300 },
    });

    if (!response.ok) return [];
    const data = await response.json();

    return (data.items || []).map((m: any) => {
      const latestVersion = m.modelVersions?.[0];
      const primaryFile = latestVersion?.files?.find((f: any) => f.primary) || latestVersion?.files?.[0];
      const thumbnail = latestVersion?.images?.find((img: any) => nsfw || img.nsfw === "None")?.url;
      const fileSize = primaryFile?.sizeKB ? primaryFile.sizeKB * 1024 : null;

      return {
        id: `civitai-${m.id}`,
        name: m.name,
        description: m.description?.slice(0, 200) || "",
        type: mapCivitaiType(m.type),
        source: "civitai" as const,
        sourceId: String(m.id),
        sourceUrl: `https://civitai.com/models/${m.id}`,
        thumbnailUrl: thumbnail || null,
        creator: m.creator?.username || "Unknown",
        downloads: m.stats?.downloadCount || 0,
        rating: m.stats?.rating || null,
        ratingCount: m.stats?.ratingCount || 0,
        tags: m.tags || [],
        nsfw: m.nsfw || false,
        fileSize,
        fileSizeFormatted: fileSize ? formatBytes(fileSize) : null,
        version: latestVersion?.name || null,
        baseModel: latestVersion?.baseModel,
      };
    });
  } catch (error) {
    console.error("Civitai trending error:", error);
    return [];
  }
}

async function fetchCivitaiNew(type: string | null, limit: number, nsfw: boolean): Promise<BrowseModel[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    sort: "Newest",
  });
  if (type && type !== "all") {
    const typeMap: Record<string, string> = {
      checkpoint: "Checkpoint",
      lora: "LORA",
      embedding: "TextualInversion",
      controlnet: "Controlnet",
      vae: "VAE",
    };
    if (typeMap[type]) params.set("types", typeMap[type]);
  }
  if (!nsfw) params.set("nsfw", "false");

  try {
    const response = await fetch(`https://civitai.com/api/v1/models?${params}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 180 },
    });

    if (!response.ok) return [];
    const data = await response.json();

    return (data.items || []).map((m: any) => {
      const latestVersion = m.modelVersions?.[0];
      const primaryFile = latestVersion?.files?.find((f: any) => f.primary) || latestVersion?.files?.[0];
      const thumbnail = latestVersion?.images?.find((img: any) => nsfw || img.nsfw === "None")?.url;
      const fileSize = primaryFile?.sizeKB ? primaryFile.sizeKB * 1024 : null;

      return {
        id: `civitai-${m.id}`,
        name: m.name,
        description: m.description?.slice(0, 200) || "",
        type: mapCivitaiType(m.type),
        source: "civitai" as const,
        sourceId: String(m.id),
        sourceUrl: `https://civitai.com/models/${m.id}`,
        thumbnailUrl: thumbnail || null,
        creator: m.creator?.username || "Unknown",
        downloads: m.stats?.downloadCount || 0,
        rating: m.stats?.rating || null,
        ratingCount: m.stats?.ratingCount || 0,
        tags: m.tags || [],
        nsfw: m.nsfw || false,
        fileSize,
        fileSizeFormatted: fileSize ? formatBytes(fileSize) : null,
        version: latestVersion?.name || null,
        baseModel: latestVersion?.baseModel,
      };
    });
  } catch (error) {
    console.error("Civitai new error:", error);
    return [];
  }
}

async function fetchHuggingFaceTrending(limit: number): Promise<BrowseModel[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    sort: "likes",
    direction: "-1",
    filter: "diffusers",
  });

  try {
    const response = await fetch(`https://huggingface.co/api/models?${params}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 300 },
    });

    if (!response.ok) return [];
    const data = await response.json();

    return data.map((m: any) => ({
      id: `huggingface-${m.id.replace(/\//g, "_")}`,
      name: m.id.split("/").pop() || m.id,
      description: `${m.pipeline_tag || "Model"} by ${m.author}`,
      type: m.tags?.includes("lora") ? "lora" : "checkpoint",
      source: "huggingface" as const,
      sourceId: m.id,
      sourceUrl: `https://huggingface.co/${m.id}`,
      thumbnailUrl: null,
      creator: m.author || "Unknown",
      downloads: m.downloads || 0,
      rating: null,
      ratingCount: m.likes || 0,
      tags: m.tags || [],
      nsfw: false,
      fileSize: null,
      fileSizeFormatted: null,
      version: m.sha?.slice(0, 7) || null,
    }));
  } catch (error) {
    console.error("HuggingFace trending error:", error);
    return [];
  }
}

async function fetchPopularByType(type: string, limit: number, nsfw: boolean): Promise<BrowseModel[]> {
  const typeMap: Record<string, string> = {
    checkpoint: "Checkpoint",
    lora: "LORA",
    embedding: "TextualInversion",
    controlnet: "Controlnet",
    vae: "VAE",
  };

  const params = new URLSearchParams({
    limit: String(limit),
    sort: "Highest Rated",
    types: typeMap[type] || "Checkpoint",
  });
  if (!nsfw) params.set("nsfw", "false");

  try {
    const response = await fetch(`https://civitai.com/api/v1/models?${params}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 600 },
    });

    if (!response.ok) return [];
    const data = await response.json();

    return (data.items || []).map((m: any) => {
      const latestVersion = m.modelVersions?.[0];
      const primaryFile = latestVersion?.files?.find((f: any) => f.primary) || latestVersion?.files?.[0];
      const thumbnail = latestVersion?.images?.find((img: any) => nsfw || img.nsfw === "None")?.url;
      const fileSize = primaryFile?.sizeKB ? primaryFile.sizeKB * 1024 : null;

      return {
        id: `civitai-${m.id}`,
        name: m.name,
        description: m.description?.slice(0, 200) || "",
        type: mapCivitaiType(m.type),
        source: "civitai" as const,
        sourceId: String(m.id),
        sourceUrl: `https://civitai.com/models/${m.id}`,
        thumbnailUrl: thumbnail || null,
        creator: m.creator?.username || "Unknown",
        downloads: m.stats?.downloadCount || 0,
        rating: m.stats?.rating || null,
        ratingCount: m.stats?.ratingCount || 0,
        tags: m.tags || [],
        nsfw: m.nsfw || false,
        fileSize,
        fileSizeFormatted: fileSize ? formatBytes(fileSize) : null,
        version: latestVersion?.name || null,
        baseModel: latestVersion?.baseModel,
      };
    });
  } catch (error) {
    console.error("Civitai popular error:", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") || "trending";
  const type = searchParams.get("type");
  const period = searchParams.get("period") || "week";
  const source = searchParams.get("source") || "all";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const nsfw = searchParams.get("nsfw") === "true";
  const baseModel = searchParams.get("baseModel");

  try {
    let models: BrowseModel[] = [];

    if (category === "trending") {
      if (source === "all" || source === "civitai") {
        const civitai = await fetchCivitaiTrending(period, limit, nsfw);
        models.push(...civitai);
      }
      if (source === "all" || source === "huggingface") {
        const hf = await fetchHuggingFaceTrending(limit);
        models.push(...hf);
      }
      models.sort((a, b) => b.downloads - a.downloads);
    } else if (category === "new") {
      models = await fetchCivitaiNew(type, limit, nsfw);
    } else if (category === "popular" && type) {
      models = await fetchPopularByType(type, limit, nsfw);
    } else if (category === "popular") {
      const types = ["checkpoint", "lora", "embedding"];
      const results = await Promise.all(
        types.map(t => fetchPopularByType(t, Math.ceil(limit / 3), nsfw))
      );
      models = results.flat().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    if (baseModel) {
      models = models.filter(m => m.baseModel === baseModel);
    }

    const baseModels = [...new Set(models.filter(m => m.baseModel).map(m => m.baseModel))];

    return NextResponse.json({
      models: models.slice(0, limit),
      total: models.length,
      category,
      baseModels,
      filters: {
        types: ["all", "checkpoint", "lora", "embedding", "controlnet", "vae"],
        periods: ["day", "week", "month", "all"],
        sources: ["all", "civitai", "huggingface"],
      },
    });
  } catch (error: any) {
    console.error("Browse error:", error);
    return NextResponse.json(
      { error: "Failed to browse models", details: error.message },
      { status: 500 }
    );
  }
}
