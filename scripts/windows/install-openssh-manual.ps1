# Manual OpenSSH Server Installation (Bypasses Windows Update)
# Run as Administrator

$ErrorActionPreference = "Stop"

$installPath = "C:\Program Files\OpenSSH"
$downloadUrl = "https://github.com/PowerShell/Win32-OpenSSH/releases/download/v9.5.0.0p1-Beta/OpenSSH-Win64.zip"
$zipPath = "$env:TEMP\OpenSSH-Win64.zip"

Write-Host "=== Installing OpenSSH Server from GitHub ===" -ForegroundColor Cyan

if (Get-Service sshd -ErrorAction SilentlyContinue) {
    Write-Host "OpenSSH Server is already installed!" -ForegroundColor Green
    exit 0
}

Write-Host "Downloading OpenSSH..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath -UseBasicParsing

Write-Host "Extracting to $installPath..." -ForegroundColor Yellow
if (Test-Path $installPath) {
    Remove-Item -Path $installPath -Recurse -Force
}
Expand-Archive -Path $zipPath -DestinationPath "C:\Program Files" -Force
Rename-Item "C:\Program Files\OpenSSH-Win64" $installPath

Write-Host "Installing SSH service..." -ForegroundColor Yellow
Push-Location $installPath
powershell -ExecutionPolicy Bypass -File install-sshd.ps1
Pop-Location

Write-Host "Setting PATH..." -ForegroundColor Yellow
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($currentPath -notlike "*$installPath*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$installPath", "Machine")
}

Write-Host "Configuring firewall..." -ForegroundColor Yellow
New-NetFirewallRule -Name "OpenSSH-Server" -DisplayName "OpenSSH Server (sshd)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -ErrorAction SilentlyContinue

Write-Host "Starting SSH service..." -ForegroundColor Yellow
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic

Write-Host "Setting default shell to PowerShell..." -ForegroundColor Yellow
New-Item -Path "HKLM:\SOFTWARE\OpenSSH" -Force | Out-Null
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null

Remove-Item $zipPath -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== OpenSSH Server Installed ===" -ForegroundColor Green
Write-Host ""
Write-Host "Test from Ubuntu:" -ForegroundColor Cyan
Write-Host "  ssh $env:USERNAME@192.168.122.250" -ForegroundColor White
