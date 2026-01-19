# Nebula Command - Discord Rich Presence

Show your Plex and Jellyfin "Now Playing" status directly on your Discord profile - just like Spotify!

## Two Modes

### Mode 1: Dashboard API (Recommended)
Polls your Nebula Command dashboard for media status. Best for:
- Centralized control - dashboard knows what's playing
- Works even if Plex/Jellyfin aren't on your local network
- One config, works everywhere

### Mode 2: Standalone
Polls Plex/Jellyfin directly from your computer. Best for:
- No dashboard needed
- Direct local network access to media servers

## How It Works

Discord allows applications to set "Rich Presence" on your profile, but this **requires a desktop app running on your computer**. Bots cannot set your personal presence - only you can via Discord's IPC connection.

This solution provides:
1. **Windows PowerShell Script** - One-command setup for Windows users
2. **Node.js Daemon** - Cross-platform solution with auto-start
3. **Integration with Plex/Jellyfin** - Polls your media servers and updates Discord

## Quick Start (Windows) - One-Click Install

```powershell
# Run in PowerShell (as your normal user)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
.\install-windows.ps1
```

This will:
1. Install the presence daemon to your AppData folder
2. Set it to auto-start when you log in
3. Prompt for your Discord Application ID and dashboard URL
4. Start immediately!

## Quick Start (Manual/Cross-Platform)

```bash
# Install dependencies
npm install

# Configure
cp .env.example .env
# Edit .env with your settings

# Run with Dashboard API
npm start

# Or run standalone (direct Plex/Jellyfin)
npm run standalone
```

## Configuration

Create a `.env` file with your settings:

```env
# Plex Configuration
PLEX_URL=http://localhost:32400
PLEX_TOKEN=your_plex_token

# Jellyfin Configuration  
JELLYFIN_URL=http://localhost:8096
JELLYFIN_API_KEY=your_jellyfin_api_key

# Discord Application ID (create at discord.com/developers)
DISCORD_CLIENT_ID=your_discord_app_id
```

## Creating a Discord Application

1. Go to https://discord.com/developers/applications
2. Click "New Application" and name it "Plex" or "Media Player"
3. Copy the "Application ID" - this is your `DISCORD_CLIENT_ID`
4. (Optional) Upload an icon for your app - this shows on your profile

## Optional: Custom Image Assets

For richer presence with custom images:

1. In your Discord application, go to **Rich Presence > Art Assets**
2. Upload the following images (exact names required):
   - `plex_logo` - Your Plex logo (512x512 or larger)
   - `jellyfin_logo` - Your Jellyfin logo  
   - `playing` - Play icon (small overlay)
   - `paused` - Pause icon (small overlay)
3. Set `USE_CUSTOM_ASSETS=true` in your `.env` file

Without custom assets, the presence works but without logos.

## Features

- Shows what you're watching on Plex or Jellyfin
- Visual progress bar for media playback
- Movie poster/album art (when available)
- Paused/Playing state indicators
- Auto-clears when nothing is playing
- Low resource usage (polls every 15 seconds)

## Auto-Start on Windows

```powershell
# Add to startup
$script = "$env:APPDATA\NebulaCommand\discord-presence.ps1"
Copy-Item .\Start-DiscordRichPresence.ps1 $script
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\DiscordPresence.lnk")
$shortcut.TargetPath = "powershell"
$shortcut.Arguments = "-WindowStyle Hidden -File `"$script`""
$shortcut.Save()
```

## Security Warning

**Your Plex/Jellyfin tokens grant full access to your media servers.** Keep them safe:

- Never commit `.env` files to public repositories
- Never share your tokens with anyone
- Add `.env` to your `.gitignore` file
- Use environment variables instead of hardcoding tokens
- Consider regenerating tokens if you suspect they've been exposed

If you accidentally expose these tokens, immediately:
1. Regenerate your Plex token at https://plex.tv/claim
2. Regenerate your Jellyfin API key in Settings > API Keys
3. Update your `.env` file with the new tokens

## Why Can't the Bot Do This?

Discord's API intentionally prevents bots from modifying user presence for privacy and security reasons. Only applications running locally on your computer can set your Rich Presence via Discord's IPC (Inter-Process Communication).

This is why Spotify can show on your profile - the Spotify desktop app communicates directly with Discord on your computer.
