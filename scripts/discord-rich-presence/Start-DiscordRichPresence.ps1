# Discord Rich Presence for Plex/Jellyfin (Windows PowerShell)
# Shows your current media playback on your Discord profile

param(
    [string]$PlexUrl = "http://localhost:32400",
    [string]$PlexToken = $env:PLEX_TOKEN,
    [string]$JellyfinUrl = "http://localhost:8096", 
    [string]$JellyfinApiKey = $env:JELLYFIN_API_KEY,
    [string]$DiscordClientId = $env:DISCORD_CLIENT_ID,
    [int]$PollInterval = 15
)

Write-Host "=== Discord Rich Presence for Media Servers ===" -ForegroundColor Cyan
Write-Host ""

if (-not $DiscordClientId) {
    Write-Host "DISCORD_CLIENT_ID is required." -ForegroundColor Red
    Write-Host "Create an application at: https://discord.com/developers/applications" -ForegroundColor Yellow
    Write-Host ""
    $DiscordClientId = Read-Host "Enter your Discord Application ID"
}

Write-Host "Configuration:" -ForegroundColor Green
Write-Host "  Plex URL: $PlexUrl"
Write-Host "  Plex Token: $(if ($PlexToken) { 'Configured' } else { 'Not set' })"
Write-Host "  Jellyfin URL: $JellyfinUrl"  
Write-Host "  Jellyfin API Key: $(if ($JellyfinApiKey) { 'Configured' } else { 'Not set' })"
Write-Host "  Discord Client ID: $DiscordClientId"
Write-Host ""

$script:currentActivity = $null

function Get-PlexSessions {
    if (-not $PlexToken) { return @() }
    
    try {
        $response = Invoke-RestMethod -Uri "$PlexUrl/status/sessions" -Headers @{ 
            "X-Plex-Token" = $PlexToken 
        } -TimeoutSec 5
        
        $sessions = @()
        foreach ($video in $response.MediaContainer.Video) {
            $sessions += @{
                source = "plex"
                title = $video.title
                type = $video.type
                showName = $video.grandparentTitle
                year = $video.year
                state = $video.Player.state
                progress = [int]$video.viewOffset
                duration = [int]$video.duration
            }
        }
        foreach ($track in $response.MediaContainer.Track) {
            $sessions += @{
                source = "plex"
                title = $track.title
                type = "track"
                showName = $track.grandparentTitle
                year = $null
                state = $track.Player.state
                progress = [int]$track.viewOffset
                duration = [int]$track.duration
            }
        }
        return $sessions
    }
    catch {
        return @()
    }
}

function Get-JellyfinSessions {
    if (-not $JellyfinApiKey) { return @() }
    
    try {
        $response = Invoke-RestMethod -Uri "$JellyfinUrl/Sessions" -Headers @{
            "X-MediaBrowser-Token" = $JellyfinApiKey
        } -TimeoutSec 5
        
        $sessions = @()
        foreach ($session in $response) {
            if ($session.NowPlayingItem) {
                $item = $session.NowPlayingItem
                $sessions += @{
                    source = "jellyfin"
                    title = $item.Name
                    type = $item.Type.ToLower()
                    showName = $item.SeriesName
                    year = $item.ProductionYear
                    state = if ($session.PlayState.IsPaused) { "paused" } else { "playing" }
                    progress = [math]::Floor($session.PlayState.PositionTicks / 10000)
                    duration = [math]::Floor($item.RunTimeTicks / 10000)
                }
            }
        }
        return $sessions
    }
    catch {
        return @()
    }
}

Write-Host "Note: PowerShell cannot directly use Discord IPC." -ForegroundColor Yellow
Write-Host "For full Rich Presence support, use the Node.js version:" -ForegroundColor Yellow
Write-Host "  npm install && npm start" -ForegroundColor White
Write-Host ""
Write-Host "This script will show your current media status in console:" -ForegroundColor Green
Write-Host ""

while ($true) {
    $plexSessions = Get-PlexSessions
    $jellyfinSessions = Get-JellyfinSessions
    $sessions = $plexSessions + $jellyfinSessions
    
    Clear-Host
    Write-Host "=== Media Status ===" -ForegroundColor Cyan
    Write-Host "Last updated: $(Get-Date -Format 'HH:mm:ss')"
    Write-Host ""
    
    if ($sessions.Count -eq 0) {
        Write-Host "Nothing playing" -ForegroundColor Gray
    }
    else {
        foreach ($session in $sessions) {
            $sourceIcon = if ($session.source -eq "plex") { "[PLEX]" } else { "[JELLYFIN]" }
            $stateIcon = if ($session.state -eq "paused") { "PAUSED" } else { "PLAYING" }
            $color = if ($session.state -eq "paused") { "Yellow" } else { "Green" }
            
            $title = $session.title
            if ($session.showName) {
                $title = "$($session.showName) - $title"
            }
            
            $progress = ""
            if ($session.duration -gt 0) {
                $pct = [math]::Round(($session.progress / $session.duration) * 100)
                $progressMins = [math]::Floor($session.progress / 60000)
                $durationMins = [math]::Floor($session.duration / 60000)
                $progress = " [$progressMins/$durationMins min - $pct%]"
            }
            
            Write-Host "$sourceIcon $stateIcon" -ForegroundColor $color -NoNewline
            Write-Host " $title$progress"
        }
    }
    
    Write-Host ""
    Write-Host "Press Ctrl+C to exit" -ForegroundColor Gray
    
    Start-Sleep -Seconds $PollInterval
}
