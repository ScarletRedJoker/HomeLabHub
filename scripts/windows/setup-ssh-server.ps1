# Windows OpenSSH Server Setup
# Run as Administrator
# Enables SSH access so Ubuntu can remotely switch modes

$ErrorActionPreference = "Stop"

Write-Host "=== Setting up OpenSSH Server ===" -ForegroundColor Cyan

Write-Host "Installing OpenSSH Server..." -ForegroundColor Yellow
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0

Write-Host "Starting SSH service..." -ForegroundColor Yellow
Start-Service sshd

Write-Host "Setting SSH to start automatically..." -ForegroundColor Yellow
Set-Service -Name sshd -StartupType 'Automatic'

Write-Host "Configuring firewall..." -ForegroundColor Yellow
$rule = Get-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -ErrorAction SilentlyContinue
if (-not $rule) {
    New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
}

Write-Host "Setting default shell to PowerShell..." -ForegroundColor Yellow
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null

Write-Host ""
Write-Host "=== SSH Server Ready ===" -ForegroundColor Green
Write-Host ""
Write-Host "Test from Ubuntu with:" -ForegroundColor Cyan
Write-Host "  ssh $env:USERNAME@$(hostname)" -ForegroundColor White
Write-Host ""
Write-Host "Or use IP address:" -ForegroundColor Cyan
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" } | Select-Object -First 1).IPAddress
Write-Host "  ssh $env:USERNAME@$ip" -ForegroundColor White
