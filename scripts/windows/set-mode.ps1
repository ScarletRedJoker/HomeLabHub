# Windows KVM Mode Switcher
# Switches between Gaming Mode (Sunshine) and Productivity Mode (RDP)
# Run as Administrator

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("gaming", "productivity")]
    [string]$Mode
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message, [string]$Color = "Cyan")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

function Stop-SunshineService {
    Write-Status "Stopping Sunshine..."
    $sunshine = Get-Process -Name "sunshine" -ErrorAction SilentlyContinue
    if ($sunshine) {
        Stop-Process -Name "sunshine" -Force
        Start-Sleep -Seconds 2
    }
    $sunshineService = Get-Service -Name "Sunshine" -ErrorAction SilentlyContinue
    if ($sunshineService -and $sunshineService.Status -eq "Running") {
        Stop-Service -Name "Sunshine" -Force
    }
    Write-Status "Sunshine stopped" -Color Green
}

function Start-SunshineService {
    Write-Status "Starting Sunshine..."
    $sunshineService = Get-Service -Name "Sunshine" -ErrorAction SilentlyContinue
    if ($sunshineService) {
        Start-Service -Name "Sunshine"
    } else {
        $sunshineExe = "C:\Program Files\Sunshine\sunshine.exe"
        if (Test-Path $sunshineExe) {
            Start-Process -FilePath $sunshineExe -WindowStyle Hidden
        }
    }
    Start-Sleep -Seconds 3
    Write-Status "Sunshine started" -Color Green
}

function Disconnect-RDPSessions {
    Write-Status "Disconnecting RDP sessions..."
    $sessions = query session 2>$null | Where-Object { $_ -match "rdp-tcp" -and $_ -match "Active" }
    foreach ($session in $sessions) {
        if ($session -match "^\s*(\S+)\s+(\S+)\s+(\d+)") {
            $sessionId = $Matches[3]
            logoff $sessionId /v 2>$null
        }
    }
    Start-Sleep -Seconds 2
    Write-Status "RDP sessions disconnected" -Color Green
}

function Set-HighPerformancePower {
    Write-Status "Setting High Performance power plan..."
    $highPerf = powercfg /list | Select-String "High performance"
    if ($highPerf -match "([a-f0-9-]{36})") {
        powercfg /setactive $Matches[1]
    }
}

function Disable-HDR {
    Write-Status "Disabling HDR and Auto HDR..."
    
    $GraphicsPath = "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers"
    if (Test-Path $GraphicsPath) {
        Set-ItemProperty -Path $GraphicsPath -Name "AutoHDREnabled" -Value 0 -Type DWord -ErrorAction SilentlyContinue
    }
    
    $DirectXPath = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
    if (Test-Path $DirectXPath) {
        $currentValue = Get-ItemProperty -Path $DirectXPath -Name "DirectXUserGlobalSettings" -ErrorAction SilentlyContinue
        if ($currentValue -and $currentValue.DirectXUserGlobalSettings) {
            $newValue = $currentValue.DirectXUserGlobalSettings -replace "AutoHDREnable=1", "AutoHDREnable=0"
            Set-ItemProperty -Path $DirectXPath -Name "DirectXUserGlobalSettings" -Value $newValue -ErrorAction SilentlyContinue
        }
    }
    
    Write-Status "HDR disabled" -Color Green
}

function Disable-RDPService {
    Write-Status "Disabling Remote Desktop service..."
    Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 1
    Stop-Service -Name "TermService" -Force -ErrorAction SilentlyContinue
}

function Enable-RDPService {
    Write-Status "Enabling Remote Desktop service..."
    Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name "fDenyTSConnections" -Value 0
    Start-Service -Name "TermService" -ErrorAction SilentlyContinue
}

function Set-GamingFirewall {
    Write-Status "Configuring firewall for gaming..."
    Enable-NetFirewallRule -DisplayName "Sunshine*" -ErrorAction SilentlyContinue
    Disable-NetFirewallRule -DisplayName "Remote Desktop*" -ErrorAction SilentlyContinue
}

function Set-ProductivityFirewall {
    Write-Status "Configuring firewall for productivity..."
    Disable-NetFirewallRule -DisplayName "Sunshine*" -ErrorAction SilentlyContinue
    Enable-NetFirewallRule -DisplayName "Remote Desktop*" -ErrorAction SilentlyContinue
}

function Enter-GamingMode {
    Write-Status "=== ENTERING GAMING MODE ===" -Color Yellow
    
    Disconnect-RDPSessions
    Disable-RDPService
    Set-HighPerformancePower
    Disable-HDR
    Set-GamingFirewall
    Start-SunshineService
    
    Write-Status "=== GAMING MODE ACTIVE ===" -Color Green
    Write-Status "Connect via Moonlight to start gaming" -Color Cyan
}

function Enter-ProductivityMode {
    Write-Status "=== ENTERING PRODUCTIVITY MODE ===" -Color Yellow
    
    Stop-SunshineService
    Enable-RDPService
    Set-ProductivityFirewall
    
    Write-Status "=== PRODUCTIVITY MODE ACTIVE ===" -Color Green
    Write-Status "Connect via RDP or WinApps" -Color Cyan
}

Write-Status "KVM Mode Switcher - Switching to $Mode mode"

switch ($Mode) {
    "gaming" { Enter-GamingMode }
    "productivity" { Enter-ProductivityMode }
}

Write-Status "Mode switch complete!" -Color Green
