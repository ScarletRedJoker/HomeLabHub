# Spotify "Now Playing" OBS Overlay

## Overview
The stream bot now includes a beautiful Spotify "now playing" overlay that you can add to your OBS scenes. It automatically displays your currently playing song with album art, artist name, and a progress bar.

## Features

✅ **Auto-refresh** - Updates every 5 seconds  
✅ **Smooth transitions** - Fades in/out when music starts/stops  
✅ **Beautiful design** - Dark theme with album art and progress bar  
✅ **Spotify branding** - Green accent color matching Spotify's brand  
✅ **No manual setup** - Uses Replit's Spotify integration (already configured)

---

## Setup Instructions

### 1. Verify Spotify Connection

1. Go to your Stream Bot dashboard: https://stream.rig-city.com
2. Navigate to **Settings**
3. Scroll down to the **Spotify Integration** card
4. Verify it shows **"Connected"** status
5. If not connected, the integration needs to be authorized (contact your homelab admin)

### 2. Get Your OBS Overlay URL

The overlay URL is displayed in the Spotify Integration card on the Settings page:

```
https://stream.rig-city.com/overlay/spotify
```

You can:
- **Copy** the URL using the copy button
- **Preview** the overlay by clicking the preview button (opens in new window)

### 3. Add to OBS

#### Option A: Quick Add (Recommended)

1. Open OBS Studio
2. In your scene, click **+** (Add Source)
3. Select **Browser**
4. Name it "Spotify Now Playing"
5. Click **OK**

#### Option B: Configure Settings

In the Browser Source properties:

| Setting | Value |
|---------|-------|
| **URL** | `https://stream.rig-city.com/overlay/spotify` |
| **Width** | `600` |
| **Height** | `200` |
| **FPS** | `30` |
| **Shutdown source when not visible** | ✅ Checked (recommended) |
| **Refresh browser when scene becomes active** | ⬜ Unchecked |

Click **OK** to save.

### 4. Position & Style

1. Drag the overlay to your desired position (bottom-left looks great!)
2. Resize if needed (maintains aspect ratio)
3. The overlay is **transparent** - only the card shows

### 5. Test It Out

1. Play a song on Spotify
2. Within 5 seconds, the overlay should appear in OBS
3. When you pause/stop, it fades out after 5 seconds

---

## Overlay Appearance

### When Playing Music:

```
┌──────────────────────────────────────────────┐
│ 🎵 NOW PLAYING                               │
│                                              │
│ [Album Art]  Song Title                      │
│              Artist Name                     │
│              ▓▓▓▓▓▓▓░░░░░░░░░░░ 45%         │
└──────────────────────────────────────────────┘
```

### Design Details:
- **Dark background** with blur effect
- **Green accent** (Spotify brand color)
- **Album art** (80x80px rounded)
- **Progress bar** showing playback position
- **Smooth animations** (fade in/out, pulse icon)

### When Not Playing:
- Overlay is **completely hidden**
- No blank box or placeholder

---

## Customization

### Change Overlay Size

Edit the Browser Source in OBS:

- **Small**: 400x150
- **Medium**: 600x200 (default)
- **Large**: 800x250

### Change Position

Common positions:
- **Bottom-left**: Great for music overlays
- **Top-right**: Complements webcam overlays
- **Bottom-right**: Works well with chat boxes

### Advanced: Custom Styling

The overlay source is at:
```
services/stream-bot/client/src/pages/spotify-overlay.tsx
```

You can modify:
- Colors and theme
- Size and layout
- Animation timing
- Font styles

After changes:
```bash
cd services/stream-bot
npm run build
```

---

## Troubleshooting

### Overlay Not Showing

**Check 1:** Spotify Connection
- Go to Settings → Spotify Integration
- Verify "Connected" status
- If disconnected, contact homelab admin

**Check 2:** Music Playing
- Start playing a song on Spotify
- Wait up to 5 seconds for refresh
- Check if desktop/mobile Spotify is active

**Check 3:** OBS Browser Source
- Right-click source → **Properties**
- Verify URL is correct
- Try clicking **Refresh cache of current page**

**Check 4:** Stream Bot Server
- Check if stream bot is running: `docker ps | grep stream-bot`
- Check logs: `docker logs stream-bot --tail=50`

### Overlay Shows "Not Playing" When Music is On

**Issue:** Spotify playback might be in private session

**Fix:**
- Disable private session in Spotify
- Ensure you're playing on an active device
- Check Spotify web player or desktop app

### Overlay is Slow to Update

**Normal Behavior:**
- Refreshes every **5 seconds**
- This is intentional to avoid API rate limits

**If Still Slow:**
- Check your internet connection
- Restart the stream bot: `docker restart stream-bot`

### Album Art Not Loading

**Possible Causes:**
- Some songs don't have album art
- Network issues fetching image
- Spotify API delays

**Fix:**
- Wait a few seconds
- Play a different song
- Check if the preview shows album art

---

## Technical Details

### How It Works

1. **Polling**: Overlay polls `/api/spotify/now-playing/public` every 5 seconds
2. **Spotify API**: Server fetches current track from Spotify Web API
3. **Replit Integration**: Uses Replit's Spotify connector for auth
4. **Token Refresh**: Automatically refreshes expired access tokens
5. **Rendering**: React component with Tailwind CSS styling

### API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `/api/spotify/status` | ✅ Required | Check connection status |
| `/api/spotify/profile` | ✅ Required | Get Spotify user profile |
| `/api/spotify/now-playing` | ✅ Required | Get current track (authenticated) |
| `/api/spotify/now-playing/public` | ⬜ Public | Get current track (for OBS) |

### Permissions Used

The Spotify integration has these scopes:
- `user-read-currently-playing` - Read current track
- `user-read-playback-state` - Read playback state
- `user-read-recently-played` - Read listening history (future use)

### Performance

- **API Calls**: ~12 per minute (one every 5 seconds)
- **Bandwidth**: Minimal (~1KB per request)
- **CPU**: Negligible
- **Memory**: <5MB for overlay page

---

## FAQ

**Q: Can I use this with multiple Spotify accounts?**  
A: Currently, it uses the main Spotify account connected to the homelab. Multi-user support could be added in the future.

**Q: Does this work with Spotify Free?**  
A: Yes! It works with both Free and Premium accounts.

**Q: Can I change the colors to match my brand?**  
A: Yes, edit `spotify-overlay.tsx` and modify the Tailwind classes.

**Q: Will this show podcasts?**  
A: Currently, it only shows music tracks. Podcast support could be added.

**Q: Does it work offline?**  
A: No, it requires an internet connection to fetch data from Spotify.

**Q: Can I add this to Streamlabs OBS?**  
A: Yes! Use the same Browser Source steps.

---

## Related Features

### Future Enhancements

Planned features:
- [ ] Song history log
- [ ] Custom themes
- [ ] Multiple layout options
- [ ] Song request integration
- [ ] Playlist display
- [ ] Recently played tracks

### See Also

- **Stream Bot Dashboard**: Main bot configuration
- **Twitch Integration**: Chat bot features
- **OpenAI Snapple Facts**: AI-powered facts

---

**Last Updated:** November 12, 2025  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
