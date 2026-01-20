import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface CivitaiModel {
  id: number;
  name: string;
  description?: string;
  type: string;
  nsfw: boolean;
  tags: string[];
  creator: { username: string };
  modelVersions: {
    id: number;
    name: string;
    downloadUrl: string;
    images: { url: string; nsfw: string }[];
    files: { id: number; name: string; sizeKB: number; type: string; primary?: boolean }[];
  }[];
  stats: { downloadCount: number; favoriteCount: number; commentCount: number; rating: number; ratingCount: number };
}

interface HuggingFaceModel {
  id: string;
  modelId: string;
  author: string;
  sha: string;
  lastModified: string;
  tags: string[];
  downloads: number;
  likes: number;
  library_name?: string;
  pipeline_tag?: string;
}

interface MarketplaceModel {
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
  downloadUrl: string | null;
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

async function searchCivitai(query: string, type: string | null, limit: number, sort: string, nsfw: boolean): Promise<MarketplaceModel[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    sort: sort === "downloads" ? "Highest Rated" : sort === "newest" ? "Newest" : "Most Downloaded",
  });
  
  if (query) params.set("query", query);
  if (type && type !== "all") {
    const typeMap: Record<string, string> = {
      "checkpoint": "Checkpoint",
      "lora": "LORA",
      "embedding": "TextualInversion",
      "controlnet": "Controlnet",
      "vae": "VAE",
    };
    if (typeMap[type]) params.set("types", typeMap[type]);
  }
  if (!nsfw) params.set("nsfw", "false");

  try {
    const response = await fetch(`https://civitai.com/api/v1/models?${params}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("Rate limited by Civitai API");
      throw new Error(`Civitai API error: ${response.status}`);
    }

    const data = await response.json();
    const models: MarketplaceModel[] = (data.items || []).map((m: CivitaiModel) => {
      const latestVersion = m.modelVersions?.[0];
      const primaryFile = latestVersion?.files?.find(f => f.primary) || latestVersion?.files?.[0];
      const thumbnail = latestVersion?.images?.find(img => nsfw || img.nsfw === "None")?.url || latestVersion?.images?.[0]?.url;
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
        downloadUrl: latestVersion?.downloadUrl || null,
      };
    });

    return models;
  } catch (error: any) {
    console.error("Civitai search error:", error);
    return [];
  }
}

async function searchHuggingFace(query: string, type: string | null, limit: number): Promise<MarketplaceModel[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    sort: "downloads",
    direction: "-1",
  });
  
  if (query) params.set("search", query);
  
  const tagFilters: string[] = [];
  if (type === "checkpoint") tagFilters.push("diffusers");
  if (type === "lora") tagFilters.push("lora");
  if (type === "embedding") tagFilters.push("text-to-image");
  
  if (tagFilters.length > 0) {
    params.set("filter", tagFilters.join(","));
  } else {
    params.set("filter", "diffusers");
  }

  try {
    const response = await fetch(`https://huggingface.co/api/models?${params}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("Rate limited by HuggingFace API");
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    const data: HuggingFaceModel[] = await response.json();
    
    return data.map((m) => ({
      id: `huggingface-${m.id.replace(/\//g, "_")}`,
      name: m.id.split("/").pop() || m.id,
      description: `${m.pipeline_tag || "Model"} by ${m.author}`,
      type: type || "checkpoint",
      source: "huggingface" as const,
      sourceId: m.id,
      sourceUrl: `https://huggingface.co/${m.id}`,
      thumbnailUrl: `https://huggingface.co/${m.id}/resolve/main/thumbnail.png`,
      creator: m.author || "Unknown",
      downloads: m.downloads || 0,
      rating: null,
      ratingCount: m.likes || 0,
      tags: m.tags || [],
      nsfw: false,
      fileSize: null,
      fileSizeFormatted: null,
      version: m.sha?.slice(0, 7) || null,
      downloadUrl: `https://huggingface.co/${m.id}`,
    }));
  } catch (error: any) {
    console.error("HuggingFace search error:", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || "";
  const type = searchParams.get("type") || null;
  const source = searchParams.get("source") || "all";
  const sort = searchParams.get("sort") || "downloads";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const nsfw = searchParams.get("nsfw") === "true";

  try {
    const results: MarketplaceModel[] = [];
    const errors: string[] = [];

    if (source === "all" || source === "civitai") {
      try {
        const civitaiResults = await searchCivitai(query, type, limit, sort, nsfw);
        results.push(...civitaiResults);
      } catch (error: any) {
        errors.push(`Civitai: ${error.message}`);
      }
    }

    if (source === "all" || source === "huggingface") {
      try {
        const hfResults = await searchHuggingFace(query, type, limit);
        results.push(...hfResults);
      } catch (error: any) {
        errors.push(`HuggingFace: ${error.message}`);
      }
    }

    if (sort === "downloads") {
      results.sort((a, b) => b.downloads - a.downloads);
    }

    const types = [
      { id: "all", name: "All Types", count: results.length },
      { id: "checkpoint", name: "Checkpoints", count: results.filter(m => m.type === "checkpoint").length },
      { id: "lora", name: "LoRA", count: results.filter(m => m.type === "lora").length },
      { id: "embedding", name: "Embeddings", count: results.filter(m => m.type === "embedding").length },
      { id: "controlnet", name: "ControlNet", count: results.filter(m => m.type === "controlnet").length },
      { id: "vae", name: "VAE", count: results.filter(m => m.type === "vae").length },
    ];

    return NextResponse.json({
      models: results.slice(0, limit),
      total: results.length,
      types,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Marketplace search error:", error);
    return NextResponse.json(
      { error: "Failed to search marketplace", details: error.message },
      { status: 500 }
    );
  }
}
