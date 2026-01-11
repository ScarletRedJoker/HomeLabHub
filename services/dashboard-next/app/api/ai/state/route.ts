import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { readFileSync, existsSync, statSync } from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getStateFilePath(): string {
  if (process.env.LOCAL_AI_STATE_FILE) {
    return process.env.LOCAL_AI_STATE_FILE;
  }
  
  const candidates = [
    path.resolve(process.cwd(), "../../deploy/shared/state/local-ai.json"),
    path.resolve(process.cwd(), "../deploy/shared/state/local-ai.json"),
    path.resolve(process.cwd(), "deploy/shared/state/local-ai.json"),
    "/opt/homelab/HomeLabHub/deploy/shared/state/local-ai.json",
  ];
  
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  
  return candidates[0];
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const statePath = getStateFilePath();
    
    if (!existsSync(statePath)) {
      return NextResponse.json({
        exists: false,
        message: "No local AI state file found. Run 'scripts/local-ollama-register.sh' on your homelab server.",
        configurationRequired: true,
      });
    }

    const stats = statSync(statePath);
    const stateAgeHours = Math.floor((Date.now() - stats.mtimeMs) / (1000 * 60 * 60));
    
    const content = readFileSync(statePath, "utf-8");
    const state = JSON.parse(content);
    
    const isStale = stateAgeHours > 24;
    
    const ollamaOnline = state.services?.ollama?.status === "online";
    const sdOnline = state.services?.stableDiffusion?.status === "online";
    const comfyOnline = state.services?.comfyui?.status === "online";
    
    return NextResponse.json({
      exists: true,
      state,
      stateAgeHours,
      isStale,
      summary: {
        hostname: state.hostname,
        tailscaleIp: state.tailscaleIp,
        registeredAt: state.registeredAt,
        services: {
          ollama: ollamaOnline,
          stableDiffusion: sdOnline,
          comfyui: comfyOnline,
        },
        totalOnline: [ollamaOnline, sdOnline, comfyOnline].filter(Boolean).length,
      },
      configuredUrls: {
        ollama: process.env.OLLAMA_URL || null,
        stableDiffusion: process.env.STABLE_DIFFUSION_URL || null,
        comfyui: process.env.COMFYUI_URL || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to read state file", details: error.message },
      { status: 500 }
    );
  }
}
