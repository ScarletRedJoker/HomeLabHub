#!/usr/bin/env node
/**
 * Nebula Command - Discord Rich Presence Daemon
 * 
 * Polls the Nebula Command dashboard API and updates your Discord profile
 * with what you're currently watching on Plex/Jellyfin.
 * 
 * Run once, forget about it - your presence updates automatically!
 */

require('dotenv').config();
const RPC = require('discord-rpc');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://dash.evindrake.net';
const API_KEY = process.env.PRESENCE_API_KEY || process.env.SERVICE_AUTH_TOKEN || '';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '15000');

if (!DISCORD_CLIENT_ID) {
  console.error('ERROR: DISCORD_CLIENT_ID is required');
  console.error('Create an app at: https://discord.com/developers/applications');
  console.error('Copy the Application ID and add it to your .env file');
  process.exit(1);
}

console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║     NEBULA COMMAND - Discord Rich Presence Daemon     ║');
console.log('╚═══════════════════════════════════════════════════════╝');
console.log('');
console.log(`Dashboard URL: ${DASHBOARD_URL}`);
console.log(`Poll Interval: ${POLL_INTERVAL}ms`);
console.log('');

const rpc = new RPC.Client({ transport: 'ipc' });
let currentActivityKey = null;
let consecutiveErrors = 0;

async function fetchCurrentMedia() {
  try {
    const headers = { 'Accept': 'application/json' };
    if (API_KEY) {
      headers['Authorization'] = `Bearer ${API_KEY}`;
    }
    
    const response = await fetch(`${DASHBOARD_URL}/api/presence/current`, { headers });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    consecutiveErrors = 0;
    return await response.json();
  } catch (error) {
    consecutiveErrors++;
    if (consecutiveErrors <= 3 || consecutiveErrors % 10 === 0) {
      console.error(`[${new Date().toLocaleTimeString()}] API Error (${consecutiveErrors}x): ${error.message}`);
    }
    return null;
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function getStateEmoji(type) {
  switch (type) {
    case 'movie': return '🎬';
    case 'episode': return '📺';
    case 'track': return '🎵';
    default: return '▶️';
  }
}

async function updatePresence() {
  const data = await fetchCurrentMedia();
  
  if (!data || !data.active || data.sessions.length === 0) {
    if (currentActivityKey !== null) {
      rpc.clearActivity();
      currentActivityKey = null;
      console.log(`[${new Date().toLocaleTimeString()}] Cleared presence - nothing playing`);
    }
    return;
  }
  
  const session = data.sessions[0];
  const stateEmoji = session.state === 'paused' ? '⏸️' : '▶️';
  const sourceEmoji = session.source === 'plex' ? '🟠' : '🟣';
  const typeEmoji = getStateEmoji(session.type);
  
  let details = session.title;
  let state = '';
  
  switch (session.type) {
    case 'episode':
      if (session.showName) {
        details = session.showName;
        state = `${session.seasonEpisode ? session.seasonEpisode + ' - ' : ''}${session.title}`;
      }
      break;
    case 'track':
      if (session.artistAlbum) {
        state = session.artistAlbum;
      }
      break;
    case 'movie':
      if (session.year) {
        state = `${typeEmoji} Movie (${session.year})`;
      } else {
        state = `${typeEmoji} Movie`;
      }
      break;
    default:
      state = `${stateEmoji} ${session.source === 'plex' ? 'Plex' : 'Jellyfin'}`;
  }
  
  if (!state) {
    state = `${stateEmoji} ${session.state === 'paused' ? 'Paused' : 'Playing'}`;
  }
  
  const activity = {
    details: details.substring(0, 128),
    state: state.substring(0, 128),
    instance: false
  };
  
  if (session.progress && session.duration && session.state !== 'paused') {
    activity.startTimestamp = Date.now() - session.progress;
    activity.endTimestamp = Date.now() - session.progress + session.duration;
  }
  
  if (process.env.USE_CUSTOM_ASSETS === 'true') {
    activity.largeImageKey = session.source === 'plex' ? 'plex_logo' : 'jellyfin_logo';
    activity.largeImageText = session.source === 'plex' ? 'Plex' : 'Jellyfin';
    activity.smallImageKey = session.state === 'paused' ? 'paused' : 'playing';
    activity.smallImageText = session.state === 'paused' ? 'Paused' : 'Playing';
  }
  
  const activityKey = JSON.stringify({ 
    title: session.title, 
    source: session.source, 
    state: session.state,
    type: session.type
  });
  
  if (currentActivityKey !== activityKey) {
    rpc.setActivity(activity);
    currentActivityKey = activityKey;
    
    const progressPct = session.duration > 0 
      ? Math.round((session.progress / session.duration) * 100) 
      : 0;
    
    console.log(`[${new Date().toLocaleTimeString()}] ${sourceEmoji} ${stateEmoji} ${details}`);
    if (session.showName || session.artistAlbum) {
      console.log(`    └─ ${state}`);
    }
    console.log(`    └─ Progress: ${progressPct}%`);
  }
}

rpc.on('ready', () => {
  console.log('✅ Connected to Discord!');
  console.log(`   Logged in as: ${rpc.user.username}#${rpc.user.discriminator}`);
  console.log('');
  console.log('Watching for media activity...');
  console.log('Press Ctrl+C to stop');
  console.log('');
  
  updatePresence();
  setInterval(updatePresence, POLL_INTERVAL);
});

rpc.on('disconnected', () => {
  console.log('❌ Disconnected from Discord. Attempting reconnect...');
  setTimeout(() => {
    rpc.login({ clientId: DISCORD_CLIENT_ID }).catch(console.error);
  }, 5000);
});

console.log('Connecting to Discord...');
rpc.login({ clientId: DISCORD_CLIENT_ID }).catch(error => {
  console.error('');
  console.error('❌ Failed to connect to Discord:', error.message);
  console.error('');
  console.error('Troubleshooting:');
  console.error('1. Make sure Discord desktop app is running');
  console.error('2. Check that your DISCORD_CLIENT_ID is correct');
  console.error('3. Try restarting Discord');
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('');
  console.log('Shutting down...');
  rpc.clearActivity();
  rpc.destroy();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught error:', error.message);
});
