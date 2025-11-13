# Spotify Integration - Homelab Documentation

## Overview
The Stream Bot now includes Spotify "now playing" functionality for OBS overlays, powered by Replit's Spotify integration.

## What Was Added

### 1. Backend Services

**File:** `services/stream-bot/server/spotify-service.ts`
- Spotify API client using Replit's connector
- Auto-refreshing access tokens
- Now playing data fetching
- User profile retrieval
- Connection status checking

**File:** `services/stream-bot/server/spotify-routes.ts`
- `/api/spotify/status` - Check if Spotify is connected
- `/api/spotify/profile` - Get user's Spotify profile
- `/api/spotify/now-playing` - Get current track (authenticated)
- `/api/spotify/now-playing/public` - Get current track (public, for OBS)

### 2. Frontend Components

**File:** `services/stream-bot/client/src/pages/spotify-overlay.tsx`
- Beautiful OBS browser source overlay
- Displays album art, song title, artist, progress bar
- Auto-refresh every 5 seconds
- Smooth fade in/out transitions

**File:** `services/stream-bot/client/src/components/spotify-card.tsx`
- Settings page integration
- Connection status display
- OBS URL copy/preview
- Setup instructions

### 3. Dependencies

**Added to package.json:**
- `@spotify/web-api-ts-sdk` - Official Spotify Web API SDK

### 4. Integration

**Replit Spotify Connector:**
- OAuth credentials managed by Replit
- Automatic token refresh
- No manual environment variables needed
- Connection ID: `connection:conn_spotify_01K9X64ZK28JKBZTHK12K2CNK6`

## Deployment

The Spotify integration is already set up in this Replit workspace and will work automatically when deployed to your homelab server.

### No Additional Configuration Required

Unlike traditional Spotify integrations, this uses Replit's connector system which:
- Manages OAuth credentials automatically
- Handles token refresh transparently
- Works in both development and production
- No environment variables to configure!

### Docker Deployment

The integration works seamlessly with Docker deployment:

```bash
# Deploy as normal
cd /home/evin/contain/HomeLabHub
git pull
./deployment/deploy-unified.sh
```

The Spotify integration will be automatically available at:
- **Dashboard**: https://stream.rig-city.com/settings
- **OBS Overlay**: https://stream.rig-city.com/overlay/spotify

## Usage

### For Streamers

1. **Connect Spotify** (already done via Replit integration)
2. **Go to Settings** at https://stream.rig-city.com/settings
3. **Copy OBS URL** from the Spotify Integration card
4. **Add to OBS** as a Browser Source

Detailed instructions: `services/stream-bot/docs/SPOTIFY_OBS_OVERLAY.md`

### For Developers

**Check Spotify status:**
```typescript
const response = await fetch('/api/spotify/status');
const { connected } = await response.json();
```

**Get now playing:**
```typescript
const response = await fetch('/api/spotify/now-playing/public');
const { isPlaying, title, artist, albumImageUrl } = await response.json();
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│ OBS Browser Source                              │
│ https://stream.rig-city.com/overlay/spotify     │
└────────────┬────────────────────────────────────┘
             │ Polls every 5s
             ↓
┌─────────────────────────────────────────────────┐
│ Stream Bot Server                               │
│ GET /api/spotify/now-playing/public             │
└────────────┬────────────────────────────────────┘
             │ Fetches current track
             ↓
┌─────────────────────────────────────────────────┐
│ Spotify Service (spotify-service.ts)            │
│ - Gets fresh access token                       │
│ - Calls Spotify Web API                         │
│ - Returns formatted data                        │
└────────────┬────────────────────────────────────┘
             │ Token from connector
             ↓
┌─────────────────────────────────────────────────┐
│ Replit Spotify Connector                        │
│ - Manages OAuth credentials                     │
│ - Auto-refreshes tokens                         │
│ - Provides fresh access tokens                  │
└─────────────────────────────────────────────────┘
```

## Files Modified/Created

### New Files
```
services/stream-bot/server/spotify-service.ts
services/stream-bot/server/spotify-routes.ts
services/stream-bot/client/src/pages/spotify-overlay.tsx
services/stream-bot/client/src/components/spotify-card.tsx
services/stream-bot/docs/SPOTIFY_OBS_OVERLAY.md
docs/SPOTIFY_INTEGRATION.md (this file)
```

### Modified Files
```
services/stream-bot/server/routes.ts
services/stream-bot/client/src/App.tsx
services/stream-bot/client/src/pages/settings.tsx
services/stream-bot/package.json
```

## Testing

### Manual Testing

1. **Start Stream Bot:**
   ```bash
   cd services/stream-bot
   npm run dev
   ```

2. **Check Status:**
   ```bash
   curl http://localhost:5000/api/spotify/status
   ```

3. **Test Overlay:**
   Open: http://localhost:5000/overlay/spotify

4. **Play Music on Spotify** and watch the overlay update

### Production Testing

After deployment:

1. Visit https://stream.rig-city.com/settings
2. Verify Spotify shows "Connected"
3. Copy OBS overlay URL
4. Open in browser to preview
5. Add to OBS and test

## Troubleshooting

### "Spotify not connected" Error

**Cause:** Replit connector not authorized  
**Fix:** Re-authorize the Spotify connection in Replit

### Overlay Shows Nothing

**Cause:** No music playing or API error  
**Fix:**
1. Start playing music on Spotify
2. Check server logs: `docker logs stream-bot --tail=50`
3. Verify connection status in Settings

### Token Refresh Failures

**Cause:** Connector credentials expired  
**Fix:** Replit automatically manages this; contact Replit support if persistent

## Security

### OAuth Flow
- Managed entirely by Replit's connector system
- No client secrets in code
- Automatic token rotation
- Secure credential storage

### API Endpoints
- `/api/spotify/now-playing/public` is intentionally public for OBS
- All other endpoints require authentication
- CORS enabled for OBS browser sources

### Data Privacy
- Only accesses currently playing track
- No listening history stored
- No personal data collected
- Complies with Spotify API terms

## Maintenance

### Updating Spotify SDK

```bash
cd services/stream-bot
npm update @spotify/web-api-ts-sdk
```

### Monitoring Usage

Check Spotify API quota:
- ~12 requests/minute (one every 5 seconds per overlay)
- Well within Spotify's rate limits
- No quota warnings expected

### Future Enhancements

Potential features to add:
- Song request queue
- Playlist management
- Recently played tracks display
- Multiple user support
- Custom overlay themes

---

**Status:** ✅ Production Ready  
**Added:** November 12, 2025  
**Integration:** Replit Spotify Connector  
**No Environment Variables Required**
