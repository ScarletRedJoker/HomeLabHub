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

interface UserSettings {
  discordAppId: string;
  enabled: boolean;
  updatedAt: string;
  presenceApiKey?: string;
  plexUsername?: string;
  jellyfinUsername?: string;
}

interface PresenceSettings {
  [userId: string]: UserSettings;
}

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'npk_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
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
        presenceApiKey: null,
        hasApiKey: false,
        plexUsername: '',
        jellyfinUsername: '',
      });
    }
    
    return NextResponse.json({
      discordAppId: userSettings.discordAppId || '',
      enabled: userSettings.enabled ?? true,
      presenceLastSeen: null,
      presenceApiKey: userSettings.presenceApiKey || null,
      hasApiKey: !!userSettings.presenceApiKey,
      plexUsername: userSettings.plexUsername || '',
      jellyfinUsername: userSettings.jellyfinUsername || '',
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
    const { discordAppId, enabled, generateNewApiKey, plexUsername, jellyfinUsername } = body;
    
    const settings = await loadSettings();
    const existingSettings = settings[userId] || {};
    
    let presenceApiKey = existingSettings.presenceApiKey;
    if (generateNewApiKey || (!presenceApiKey && discordAppId)) {
      presenceApiKey = generateApiKey();
    }
    
    settings[userId] = {
      discordAppId: discordAppId ?? existingSettings.discordAppId ?? '',
      enabled: enabled ?? existingSettings.enabled ?? true,
      updatedAt: new Date().toISOString(),
      presenceApiKey,
      plexUsername: plexUsername ?? existingSettings.plexUsername ?? '',
      jellyfinUsername: jellyfinUsername ?? existingSettings.jellyfinUsername ?? '',
    };
    await saveSettings(settings);
    
    return NextResponse.json({ 
      success: true,
      message: 'Settings saved successfully',
      presenceApiKey,
      plexUsername: settings[userId].plexUsername,
      jellyfinUsername: settings[userId].jellyfinUsername,
    });
  } catch (error) {
    console.error('[Presence Settings] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to save settings' 
    }, { status: 500 });
  }
}
