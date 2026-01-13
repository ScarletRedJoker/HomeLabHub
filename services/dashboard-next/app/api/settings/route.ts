import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";
import { getAllServers, saveServers, ServerConfig } from "@/lib/server-config-store";

import { existsSync, accessSync, constants } from "fs";

const FALLBACK_SETTINGS_DIR = "/app/data";
const PRIMARY_SETTINGS_DIR = "/opt/homelab/studio-projects";

function getSettingsDir(): string {
  if (process.env.STUDIO_PROJECTS_DIR) {
    return process.env.STUDIO_PROJECTS_DIR;
  }
  if (process.env.REPL_ID) {
    return "./data/studio-projects";
  }
  
  try {
    if (existsSync(PRIMARY_SETTINGS_DIR)) {
      accessSync(PRIMARY_SETTINGS_DIR, constants.W_OK);
      return PRIMARY_SETTINGS_DIR;
    }
  } catch {
    console.log(`[Settings API] Primary directory ${PRIMARY_SETTINGS_DIR} not writable, using fallback`);
  }
  
  return FALLBACK_SETTINGS_DIR;
}

let cachedSettingsDir: string | null = null;

function getSettingsDirCached(): string {
  if (!cachedSettingsDir) {
    cachedSettingsDir = getSettingsDir();
    console.log(`[Settings API] Using settings directory: ${cachedSettingsDir}`);
  }
  return cachedSettingsDir;
}

const SETTINGS_FILE = "user-settings.json";

interface AISettings {
  openaiKeyConfigured: boolean;
  openaiKeyMasked: string;
  ollamaUrl: string;
  windowsVmIp: string;
  stableDiffusionUrl: string;
}

interface UserSettings {
  profile: {
    displayName: string;
    email: string;
    timezone: string;
  };
  appearance: {
    darkMode: boolean;
    compactMode: boolean;
    sidebarCollapsed: boolean;
  };
  notifications: {
    deploymentAlerts: boolean;
    serverHealthAlerts: boolean;
    discordNotifications: boolean;
    emailNotifications: boolean;
  };
  servers: ServerConfig[];
  ai?: AISettings;
}

function maskApiKey(key: string | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.substring(0, 7)}...${key.substring(key.length - 4)}`;
}

function getAISettings(): AISettings {
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;
  const apiKey = (integrationKey && integrationKey.startsWith('sk-')) ? integrationKey : directKey;
  const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";

  return {
    openaiKeyConfigured: !!(apiKey && apiKey.startsWith('sk-')),
    openaiKeyMasked: apiKey ? maskApiKey(apiKey) : "",
    ollamaUrl: process.env.OLLAMA_URL || `http://${WINDOWS_VM_IP}:11434`,
    windowsVmIp: WINDOWS_VM_IP,
    stableDiffusionUrl: process.env.STABLE_DIFFUSION_URL || `http://${WINDOWS_VM_IP}:7860`,
  };
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o755 });
    } catch (mkdirErr: any) {
      console.error(`[Settings API] Failed to create directory ${dir}:`, mkdirErr.message);
      throw new Error(`Cannot create settings directory: ${mkdirErr.message}`);
    }
  }
}

async function loadSettings(): Promise<UserSettings> {
  const settingsDir = getSettingsDirCached();
  try {
    console.log(`[Settings API] Loading settings from ${settingsDir}`);
    await ensureDir(settingsDir);
    const filePath = path.join(settingsDir, SETTINGS_FILE);
    const content = await fs.readFile(filePath, "utf-8");
    const stored = JSON.parse(content);
    
    const servers = await getAllServers();
    
    return {
      profile: stored.profile || {
        displayName: "Evin",
        email: "evin@evindrake.net",
        timezone: "America/New_York",
      },
      appearance: stored.appearance || {
        darkMode: true,
        compactMode: false,
        sidebarCollapsed: false,
      },
      notifications: stored.notifications || {
        deploymentAlerts: true,
        serverHealthAlerts: true,
        discordNotifications: true,
        emailNotifications: false,
      },
      servers,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      const servers = await getAllServers();
      const defaultSettings: UserSettings = {
        profile: {
          displayName: "Evin",
          email: "evin@evindrake.net",
          timezone: "America/New_York",
        },
        appearance: {
          darkMode: true,
          compactMode: false,
          sidebarCollapsed: false,
        },
        notifications: {
          deploymentAlerts: true,
          serverHealthAlerts: true,
          discordNotifications: true,
          emailNotifications: false,
        },
        servers,
      };
      await saveSettingsFile(defaultSettings);
      return defaultSettings;
    }
    throw error;
  }
}

async function saveSettingsFile(settings: Omit<UserSettings, "servers"> & { servers?: any }): Promise<void> {
  const settingsDir = getSettingsDirCached();
  await ensureDir(settingsDir);
  const filePath = path.join(settingsDir, SETTINGS_FILE);
  await fs.writeFile(filePath, JSON.stringify(settings, null, 2));
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await loadSettings();
    const aiSettings = getAISettings();
    
    return NextResponse.json({
      ...settings,
      ai: aiSettings,
    });
  } catch (error: any) {
    console.error("[Settings API] GET error:", error);
    
    if (error.code === "EACCES" || error.message?.includes("permission")) {
      return NextResponse.json({ 
        error: "Permission denied accessing settings directory",
        details: `Path: ${getSettingsDirCached()}`,
        code: "PERMISSION_DENIED"
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      error: error.message || "Failed to load settings",
      code: error.code || "UNKNOWN"
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const currentSettings = await loadSettings();
    
    const updatedSettings = {
      profile: { ...currentSettings.profile, ...body.profile },
      appearance: { ...currentSettings.appearance, ...body.appearance },
      notifications: { ...currentSettings.notifications, ...body.notifications },
      servers: body.servers || currentSettings.servers,
    };

    if (body.servers) {
      await saveServers(body.servers);
    }
    
    await saveSettingsFile(updatedSettings);
    
    const finalServers = await getAllServers();
    const aiSettings = getAISettings();
    
    return NextResponse.json({ 
      success: true, 
      settings: { ...updatedSettings, servers: finalServers, ai: aiSettings } 
    });
  } catch (error: any) {
    console.error("Settings PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
