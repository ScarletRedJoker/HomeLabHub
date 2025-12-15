# Windows Autologin Setup
# Run as Administrator
# This configures Windows to automatically log in without password prompt

param(
    [Parameter(Mandatory=$true)]
    [string]$Username,
    
    [Parameter(Mandatory=$true)]
    [string]$Password
)

$ErrorActionPreference = "Stop"

Write-Host "Setting up automatic login for user: $Username" -ForegroundColor Cyan

$RegPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"

Set-ItemProperty -Path $RegPath -Name "AutoAdminLogon" -Value "1" -Type String
Set-ItemProperty -Path $RegPath -Name "DefaultUserName" -Value $Username -Type String
Set-ItemProperty -Path $RegPath -Name "DefaultPassword" -Value $Password -Type String
Set-ItemProperty -Path $RegPath -Name "DefaultDomainName" -Value $env:COMPUTERNAME -Type String

Set-ItemProperty -Path $RegPath -Name "ForceAutoLogon" -Value "1" -Type String -ErrorAction SilentlyContinue

Write-Host "Autologin configured successfully!" -ForegroundColor Green
Write-Host "The system will automatically log in as '$Username' on next boot." -ForegroundColor Yellow
Write-Host ""
Write-Host "To disable autologin later, run:" -ForegroundColor Cyan
Write-Host "  Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name 'AutoAdminLogon' -Value '0'" -ForegroundColor White
