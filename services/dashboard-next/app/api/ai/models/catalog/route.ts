import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { modelRegistry } from "@/lib/model-registry";
import type { HuggingFaceSearchParams, CivitaiSearchParams } from "@/types/models";

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

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") || "civitai";
  const query = searchParams.get("query") || searchParams.get("search") || "";
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const page = parseInt(searchParams.get("page") || "1", 10);

  try {
    if (source === "huggingface" || source === "hf") {
      const pipelineTag = searchParams.get("pipeline_tag") || searchParams.get("task");
      const library = searchParams.get("library");
      const author = searchParams.get("author");
      const sort = searchParams.get("sort") as HuggingFaceSearchParams["sort"];

      const params: HuggingFaceSearchParams = {
        search: query || undefined,
        limit,
        pipeline_tag: pipelineTag || undefined,
        library: library || undefined,
        author: author || undefined,
        sort: sort || "downloads",
        direction: "desc",
      };

      const result = await modelRegistry.searchHuggingFace(params);
      return NextResponse.json(result);
    }

    if (source === "civitai") {
      const typesParam = searchParams.get("types") || searchParams.get("type");
      const types = typesParam?.split(",").filter(Boolean) as CivitaiSearchParams["types"];
      const sort = searchParams.get("sort") as CivitaiSearchParams["sort"];
      const period = searchParams.get("period") as CivitaiSearchParams["period"];
      const nsfw = searchParams.get("nsfw");
      const baseModels = searchParams.get("baseModels")?.split(",").filter(Boolean);
      const tag = searchParams.get("tag");

      const params: CivitaiSearchParams = {
        query: query || undefined,
        limit,
        page,
        types: types?.length ? types : undefined,
        sort: sort || "Most Downloaded",
        period: period || "AllTime",
        nsfw: nsfw === "true" ? true : nsfw === "false" ? false : undefined,
        baseModels: baseModels?.length ? baseModels : undefined,
        tag: tag || undefined,
      };

      const result = await modelRegistry.searchCivitai(params);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Invalid source. Use 'huggingface' or 'civitai'" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[API] Catalog search error:", error);
    return NextResponse.json(
      { error: "Failed to search catalog", details: error.message },
      { status: 500 }
    );
  }
}
