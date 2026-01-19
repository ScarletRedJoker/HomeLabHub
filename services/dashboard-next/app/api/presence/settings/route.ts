import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { existsSync, accessSync, constants } from 'fs';

const FALLBACK_DIR = "/app/data";
const PRIMARY_DIR = "/opt/homelab/studio-projects";

function getDataDir(): string {
  if (process.env.STUDIO_PROJECTS_DIR) {
    return process.env.STUDIO_PROJECTS_DIR;
  }
  if (process.env.REPL_ID) {
    return "./data/studio-projects";
  }
  try {
    if (existsSync(PRIMARY_DIR)) {
      accessSync(PRIMARY_DIR, constants.W_OK);
      return PRIMARY_DIR;
    }
  } catch {
  }
  return FALLBACK_DIR;
}

const SETTINGS_FILE = "presence-settings.json";

interface PresenceSettings {
  [userId: string]: {
    discordAppId: string;
    enabled: boolean;
    updatedAt: string;
  };
}

async function loadSettings(): Promise<PresenceSettings> {
  const dir = getDataDir();
  const filePath = path.join(dir, SETTINGS_FILE);
  
  try {
    await fs.mkdir(dir, { recursive: true });
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveSettings(data: PresenceSettings): Promise<void> {
  const dir = getDataDir();
  const filePath = path.join(dir, SETTINGS_FILE);
  
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[Presence Settings] Failed to save:', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    
    const settings = await loadSettings();
    const userSettings = settings[userId];
    
    if (!userSettings) {
      return NextResponse.json({
        discordAppId: '',
        enabled: true,
        presenceLastSeen: null,
      });
    }
    
    return NextResponse.json({
      discordAppId: userSettings.discordAppId || '',
      enabled: userSettings.enabled ?? true,
      presenceLastSeen: null,
    });
  } catch (error) {
    console.error('[Presence Settings] Error:', error);
    return NextResponse.json({ 
      discordAppId: '',
      enabled: true,
      presenceLastSeen: null,
    });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body.userId || 'default';
    const { discordAppId, enabled } = body;
    
    const settings = await loadSettings();
    settings[userId] = {
      discordAppId: discordAppId || '',
      enabled: enabled ?? true,
      updatedAt: new Date().toISOString(),
    };
    await saveSettings(settings);
    
    return NextResponse.json({ 
      success: true,
      message: 'Settings saved successfully'
    });
  } catch (error) {
    console.error('[Presence Settings] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to save settings' 
    }, { status: 500 });
  }
}
