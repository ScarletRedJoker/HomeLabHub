# Enable WinRM for Remote PowerShell Execution
# Run as Administrator
# This allows Ubuntu to remotely switch modes

$ErrorActionPreference = "Stop"

Write-Host "=== Setting up WinRM for Remote Management ===" -ForegroundColor Cyan

Write-Host "Enabling PowerShell Remoting..." -ForegroundColor Yellow
Enable-PSRemoting -Force -SkipNetworkProfileCheck

Write-Host "Setting WinRM service to automatic..." -ForegroundColor Yellow
Set-Service -Name WinRM -StartupType Automatic
Start-Service WinRM

Write-Host "Configuring WinRM for basic auth..." -ForegroundColor Yellow
Set-Item -Path WSMan:\localhost\Service\Auth\Basic -Value $true
Set-Item -Path WSMan:\localhost\Service\AllowUnencrypted -Value $true

Write-Host "Adding firewall rule for WinRM..." -ForegroundColor Yellow
$rule = Get-NetFirewallRule -Name "WINRM-HTTP-In-TCP" -ErrorAction SilentlyContinue
if (-not $rule) {
    New-NetFirewallRule -Name "WINRM-HTTP-In-TCP" -DisplayName "WinRM HTTP" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 5985
}
Enable-NetFirewallRule -Name "WINRM-HTTP-In-TCP" -ErrorAction SilentlyContinue

Write-Host "Configuring trusted hosts..." -ForegroundColor Yellow
Set-Item -Path WSMan:\localhost\Client\TrustedHosts -Value "*" -Force

Write-Host "Restarting WinRM service..." -ForegroundColor Yellow
Restart-Service WinRM

Write-Host ""
Write-Host "=== WinRM Ready ===" -ForegroundColor Green
Write-Host ""
Write-Host "Test from Ubuntu with:" -ForegroundColor Cyan
Write-Host "  pwsh -Command \"Invoke-Command -ComputerName 192.168.122.250 -Credential (Get-Credential) -ScriptBlock { hostname }\"" -ForegroundColor White
Write-Host ""
Write-Host "Or with stored credentials - see Ubuntu setup instructions." -ForegroundColor Yellow
