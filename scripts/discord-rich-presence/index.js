/**
 * Discord Rich Presence for Plex/Jellyfin
 * 
 * Shows your current media playback on your Discord profile.
 * Requires running on your local machine (not a server).
 */

require('dotenv').config();
const RPC = require('discord-rpc');

const PLEX_URL = process.env.PLEX_URL || 'http://localhost:32400';
const PLEX_TOKEN = process.env.PLEX_TOKEN;
const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://localhost:8096';
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_CLIENT_ID) {
  console.error('DISCORD_CLIENT_ID is required. Create an app at discord.com/developers');
  process.exit(1);
}

const rpc = new RPC.Client({ transport: 'ipc' });
let currentActivity = null;

async function fetchPlexSessions() {
  if (!PLEX_TOKEN) return [];
  
  try {
    const response = await fetch(`${PLEX_URL}/status/sessions?X-Plex-Token=${PLEX_TOKEN}`);
    if (!response.ok) return [];
    
    const text = await response.text();
    const sessions = [];
    
    const mediaContainers = text.match(/<Video[^>]*>|<Track[^>]*>/g) || [];
    for (const container of mediaContainers) {
      const title = container.match(/title="([^"]+)"/)?.[1] || 'Unknown';
      const type = container.includes('<Track') ? 'track' : 
                   container.match(/type="([^"]+)"/)?.[1] || 'video';
      const grandparentTitle = container.match(/grandparentTitle="([^"]+)"/)?.[1];
      const year = container.match(/year="([^"]+)"/)?.[1];
      const state = container.match(/state="([^"]+)"/)?.[1] || 'playing';
      const viewOffset = parseInt(container.match(/viewOffset="([^"]+)"/)?.[1] || '0');
      const duration = parseInt(container.match(/duration="([^"]+)"/)?.[1] || '0');
      
      sessions.push({
        source: 'plex',
        title,
        type,
        showName: grandparentTitle,
        year,
        state,
        progress: viewOffset,
        duration
      });
    }
    
    return sessions;
  } catch (error) {
    return [];
  }
}

async function fetchJellyfinSessions() {
  if (!JELLYFIN_API_KEY) return [];
  
  try {
    const response = await fetch(`${JELLYFIN_URL}/Sessions`, {
      headers: { 'X-MediaBrowser-Token': JELLYFIN_API_KEY }
    });
    if (!response.ok) return [];
    
    const data = await response.json();
    const sessions = [];
    
    for (const session of data) {
      if (!session.NowPlayingItem) continue;
      
      const item = session.NowPlayingItem;
      sessions.push({
        source: 'jellyfin',
        title: item.Name,
        type: item.Type.toLowerCase(),
        showName: item.SeriesName,
        year: item.ProductionYear,
        state: session.PlayState?.IsPaused ? 'paused' : 'playing',
        progress: session.PlayState?.PositionTicks ? Math.floor(session.PlayState.PositionTicks / 10000000) * 1000 : 0,
        duration: item.RunTimeTicks ? Math.floor(item.RunTimeTicks / 10000000) * 1000 : 0
      });
    }
    
    return sessions;
  } catch (error) {
    return [];
  }
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

async function updatePresence() {
  const plexSessions = await fetchPlexSessions();
  const jellyfinSessions = await fetchJellyfinSessions();
  const sessions = [...plexSessions, ...jellyfinSessions];
  
  if (sessions.length === 0) {
    if (currentActivity !== null) {
      rpc.clearActivity();
      currentActivity = null;
      console.log('[Presence] Cleared - nothing playing');
    }
    return;
  }
  
  const session = sessions[0];
  const stateIcon = session.state === 'paused' ? '⏸️' : '▶️';
  const sourceIcon = session.source === 'plex' ? '🟠' : '🟣';
  
  let details = session.title;
  if (session.showName) {
    details = `${session.showName} - ${session.title}`;
  }
  
  let state = `${stateIcon} ${session.type.charAt(0).toUpperCase() + session.type.slice(1)}`;
  if (session.year) {
    state += ` (${session.year})`;
  }
  
  const activity = {
    details: details.substring(0, 128),
    state: state.substring(0, 128),
    largeImageKey: session.source === 'plex' ? 'plex_logo' : 'jellyfin_logo',
    largeImageText: session.source === 'plex' ? 'Plex' : 'Jellyfin',
    smallImageKey: session.state === 'paused' ? 'paused' : 'playing',
    smallImageText: session.state === 'paused' ? 'Paused' : 'Playing',
    instance: false
  };
  
  if (session.progress && session.duration) {
    if (session.state !== 'paused') {
      activity.startTimestamp = Date.now() - session.progress;
      activity.endTimestamp = Date.now() - session.progress + session.duration;
    }
  }
  
  const activityKey = JSON.stringify(activity);
  if (currentActivity !== activityKey) {
    rpc.setActivity(activity);
    currentActivity = activityKey;
    console.log(`[Presence] ${sourceIcon} Now ${session.state}: ${details}`);
  }
}

rpc.on('ready', () => {
  console.log('Discord Rich Presence connected!');
  console.log(`Watching Plex: ${PLEX_TOKEN ? 'Yes' : 'No'}`);
  console.log(`Watching Jellyfin: ${JELLYFIN_API_KEY ? 'Yes' : 'No'}`);
  console.log('Polling every 15 seconds...');
  
  updatePresence();
  setInterval(updatePresence, 15000);
});

rpc.login({ clientId: DISCORD_CLIENT_ID }).catch(error => {
  console.error('Failed to connect to Discord:', error.message);
  console.log('Make sure Discord is running on this computer.');
  process.exit(1);
});

process.on('SIGINT', () => {
  rpc.clearActivity();
  rpc.destroy();
  process.exit(0);
});
