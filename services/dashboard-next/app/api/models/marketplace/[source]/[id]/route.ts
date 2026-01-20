import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

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

interface ModelVersion {
  id: string;
  name: string;
  downloadUrl: string;
  files: {
    id: string;
    name: string;
    size: number;
    sizeFormatted: string;
    type: string;
    primary: boolean;
    checksum?: string;
  }[];
  images: { url: string; nsfw: boolean }[];
  createdAt: string;
  description?: string;
}

interface ModelDetails {
  id: string;
  name: string;
  description: string;
  type: string;
  source: "civitai" | "huggingface";
  sourceId: string;
  sourceUrl: string;
  creator: string;
  downloads: number;
  rating: number | null;
  ratingCount: number;
  tags: string[];
  nsfw: boolean;
  license: string | null;
  versions: ModelVersion[];
  sampleImages: string[];
}

async function getCivitaiDetails(id: string): Promise<ModelDetails | null> {
  try {
    const response = await fetch(`https://civitai.com/api/v1/models/${id}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("Rate limited");
      if (response.status === 404) return null;
      throw new Error(`API error: ${response.status}`);
    }

    const m = await response.json();
    
    const versions: ModelVersion[] = (m.modelVersions || []).map((v: any) => ({
      id: String(v.id),
      name: v.name,
      downloadUrl: v.downloadUrl,
      files: (v.files || []).map((f: any) => ({
        id: String(f.id),
        name: f.name,
        size: (f.sizeKB || 0) * 1024,
        sizeFormatted: formatBytes((f.sizeKB || 0) * 1024),
        type: f.type || "Model",
        primary: f.primary || false,
        checksum: f.hashes?.SHA256,
      })),
      images: (v.images || []).map((img: any) => ({
        url: img.url,
        nsfw: img.nsfw !== "None",
      })),
      createdAt: v.createdAt,
      description: v.description,
    }));

    const allImages = versions.flatMap(v => v.images.map(i => i.url)).slice(0, 10);

    return {
      id: `civitai-${m.id}`,
      name: m.name,
      description: m.description || "",
      type: m.type?.toLowerCase() || "checkpoint",
      source: "civitai",
      sourceId: String(m.id),
      sourceUrl: `https://civitai.com/models/${m.id}`,
      creator: m.creator?.username || "Unknown",
      downloads: m.stats?.downloadCount || 0,
      rating: m.stats?.rating || null,
      ratingCount: m.stats?.ratingCount || 0,
      tags: m.tags || [],
      nsfw: m.nsfw || false,
      license: null,
      versions,
      sampleImages: allImages,
    };
  } catch (error) {
    console.error("Civitai details error:", error);
    return null;
  }
}

async function getHuggingFaceDetails(id: string): Promise<ModelDetails | null> {
  try {
    const modelId = id.replace(/_/g, "/");
    const response = await fetch(`https://huggingface.co/api/models/${modelId}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("Rate limited");
      if (response.status === 404) return null;
      throw new Error(`API error: ${response.status}`);
    }

    const m = await response.json();

    const filesRes = await fetch(`https://huggingface.co/api/models/${modelId}/tree/main`, {
      headers: { "Content-Type": "application/json" },
    });
    
    let files: any[] = [];
    if (filesRes.ok) {
      files = await filesRes.json();
    }

    const modelFiles = files
      .filter((f: any) => f.path.endsWith(".safetensors") || f.path.endsWith(".ckpt") || f.path.endsWith(".bin"))
      .map((f: any) => ({
        id: f.path,
        name: f.path,
        size: f.size || 0,
        sizeFormatted: formatBytes(f.size || 0),
        type: "Model",
        primary: f.path.includes("model"),
        checksum: f.lfs?.oid,
      }));

    const version: ModelVersion = {
      id: m.sha || "main",
      name: "Latest",
      downloadUrl: `https://huggingface.co/${modelId}`,
      files: modelFiles,
      images: [],
      createdAt: m.lastModified || new Date().toISOString(),
    };

    return {
      id: `huggingface-${id}`,
      name: m.id?.split("/").pop() || modelId,
      description: m.cardData?.description || `${m.pipeline_tag || "Model"} by ${m.author}`,
      type: m.pipeline_tag?.includes("lora") ? "lora" : "checkpoint",
      source: "huggingface",
      sourceId: modelId,
      sourceUrl: `https://huggingface.co/${modelId}`,
      creator: m.author || "Unknown",
      downloads: m.downloads || 0,
      rating: null,
      ratingCount: m.likes || 0,
      tags: m.tags || [],
      nsfw: false,
      license: m.cardData?.license || null,
      versions: [version],
      sampleImages: [],
    };
  } catch (error) {
    console.error("HuggingFace details error:", error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ source: string; id: string }> }
) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { source, id } = await params;

  if (!source || !id) {
    return NextResponse.json({ error: "Source and ID are required" }, { status: 400 });
  }

  try {
    let details: ModelDetails | null = null;

    if (source === "civitai") {
      details = await getCivitaiDetails(id);
    } else if (source === "huggingface") {
      details = await getHuggingFaceDetails(id);
    } else {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }

    if (!details) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    return NextResponse.json(details);
  } catch (error: any) {
    console.error("Model details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch model details", details: error.message },
      { status: 500 }
    );
  }
}
