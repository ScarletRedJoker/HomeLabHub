# Discord Rich Presence for Plex/Jellyfin

Show your Plex and Jellyfin "Now Playing" status directly on your Discord profile - just like Spotify!

## How It Works

Discord allows applications to set "Rich Presence" on your profile, but this **requires a desktop app running on your computer**. Bots cannot set your personal presence - only you can via Discord's IPC connection.

This solution provides:
1. **Windows PowerShell Script** - One-command setup for Windows users
2. **Node.js Daemon** - Cross-platform solution with auto-start
3. **Integration with Plex/Jellyfin** - Polls your media servers and updates Discord

## Quick Start (Windows)

```powershell
# Run in PowerShell as Administrator
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
.\Start-DiscordRichPresence.ps1
```

## Quick Start (Cross-Platform)

```bash
# Install dependencies
npm install

# Configure (create .env file)
cp .env.example .env
# Edit .env with your Plex/Jellyfin credentials

# Run
npm start
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

## Why Can't the Bot Do This?

Discord's API intentionally prevents bots from modifying user presence for privacy and security reasons. Only applications running locally on your computer can set your Rich Presence via Discord's IPC (Inter-Process Communication).

This is why Spotify can show on your profile - the Spotify desktop app communicates directly with Discord on your computer.
