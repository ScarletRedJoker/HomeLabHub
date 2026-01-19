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

const HEARTBEAT_FILE = "presence-heartbeats.json";

interface HeartbeatData {
  [userId: string]: {
    lastSeen: string;
    updatedAt: string;
  };
}

async function loadHeartbeats(): Promise<HeartbeatData> {
  const dir = getDataDir();
  const filePath = path.join(dir, HEARTBEAT_FILE);
  
  try {
    await fs.mkdir(dir, { recursive: true });
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveHeartbeats(data: HeartbeatData): Promise<void> {
  const dir = getDataDir();
  const filePath = path.join(dir, HEARTBEAT_FILE);
  
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[Presence Heartbeat] Failed to save:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body.userId || 'default';
    
    const heartbeats = await loadHeartbeats();
    heartbeats[userId] = {
      lastSeen: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveHeartbeats(heartbeats);
    
    return NextResponse.json({ 
      success: true, 
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('[Presence Heartbeat] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to update heartbeat' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'default';
    
    const heartbeats = await loadHeartbeats();
    const userHeartbeat = heartbeats[userId];
    
    if (!userHeartbeat) {
      return NextResponse.json({ 
        connected: false, 
        lastSeen: null 
      });
    }
    
    const lastSeen = new Date(userHeartbeat.lastSeen);
    const isRecent = (Date.now() - lastSeen.getTime()) < 60000;
    
    return NextResponse.json({
      connected: isRecent,
      lastSeen: userHeartbeat.lastSeen,
    });
  } catch (error) {
    console.error('[Presence Heartbeat] Error:', error);
    return NextResponse.json({ 
      connected: false, 
      lastSeen: null 
    });
  }
}
