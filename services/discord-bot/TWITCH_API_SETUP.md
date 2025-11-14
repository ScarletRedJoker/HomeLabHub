# Twitch API Setup for Enhanced Stream Notifications

## Overview

The Discord bot now supports **rich embed notifications** for Twitch streams with enhanced data including:

- 🎮 **Stream title** from Twitch API
- 🎯 **Game/Category** being played
- 👀 **Live viewer count**
- 🖼️ **Stream thumbnail** (large preview image)
- 👤 **Streamer profile picture**
- 🎨 **Platform-specific colors** (Twitch purple, YouTube red, Kick green)

## Features

### Visual Enhancements
- **Rich embeds** instead of plain text notifications
- **Platform-specific branding** with appropriate colors
- **Large stream thumbnail** showing what's being streamed
- **Profile picture thumbnail** of the streamer
- **Footer text**: "A member of RigCity went live!"

### Data Fields
- Title: "🔴 {username} is now LIVE!"
- Description: Stream title (from API or Discord)
- Game/Category field (inline)
- Viewer count field (inline, when available)
- Direct link to stream in the title
- Timestamp of when stream went live

## Configuration

### 1. Get Twitch API Credentials

1. Go to [Twitch Developers](https://dev.twitch.tv/console/apps)
2. Log in with your Twitch account
3. Click **"Register Your Application"**
4. Fill in the application details:
   - **Name**: RigCity Discord Bot (or any name)
   - **OAuth Redirect URLs**: `http://localhost` (not used for this feature)
   - **Category**: Application Integration
5. Click **"Create"**
6. Once created, click **"Manage"** on your application
7. Copy your **Client ID**
8. Click **"New Secret"** to generate a **Client Secret** and copy it

### 2. Add Environment Variables

Add the following environment variables to your `.env` file or Replit Secrets:

```bash
TWITCH_CLIENT_ID=your_client_id_here
TWITCH_CLIENT_SECRET=your_client_secret_here
```

### 3. Restart the Bot

After adding the credentials, restart the Discord bot to apply the changes.

## How It Works

### Without Twitch API (Fallback Mode)
- Uses Discord presence data only
- Stream title from Discord activity
- Game name from Discord activity
- User's Discord avatar as thumbnail
- No viewer count or stream thumbnail

### With Twitch API (Enhanced Mode)
- Fetches real-time stream data from Twitch
- Gets accurate stream title and game/category
- Shows current viewer count
- Displays live stream thumbnail (preview image)
- Uses Twitch profile picture

### Platform Support

| Platform | Color | API Integration | Features |
|----------|-------|-----------------|----------|
| **Twitch** | Purple (#9146FF) | ✅ Full | Title, game, viewers, thumbnails |
| **YouTube** | Red (#FF0000) | ⏳ Planned | Discord presence only |
| **Kick** | Green (#53FC18) | ⏳ Planned | Discord presence only |

## Example Notification

**With Twitch API enabled:**

```
🔴 randomstonernerd is now LIVE!

Just Chatting and Coding - Building the RigCity Bot!

🎮 Game/Category: Science & Technology
👀 Viewers: 42

[Large stream preview thumbnail showing the stream]
[Profile picture in corner]

Footer: A member of RigCity went live!
Timestamp: Today at 3:45 PM
```

**Without Twitch API (fallback):**

```
🔴 randomstonernerd is now LIVE!

randomstonernerd's Stream

🎮 Game/Category: Just Chatting

[User's Discord avatar as thumbnail]

Footer: A member of RigCity went live!
Timestamp: Today at 3:45 PM
```

## Troubleshooting

### API Not Working

Check the console logs for these messages:

```
[Twitch API] Client ID or Secret not configured
```
- Solution: Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to environment variables

```
[Twitch API] Failed to get access token
```
- Solution: Verify your credentials are correct

```
[Stream Notifications] Twitch API returned no live stream data
```
- This is normal if the stream just started; Twitch API may take a moment to update

### Still Getting Plain Notifications

- Ensure you've restarted the bot after adding environment variables
- Check that the Discord bot has proper permissions in the notification channel
- Verify the user is being tracked for stream notifications in the dashboard

## API Rate Limits

- Twitch API has generous rate limits for client credentials
- Access tokens are cached and reused until expiry
- No additional configuration needed for rate limiting

## Future Enhancements

Planned features:
- YouTube API integration for YouTube streams
- Kick API integration for Kick streams
- Customizable embed colors per server
- Stream duration tracking
- Peak viewer count tracking
