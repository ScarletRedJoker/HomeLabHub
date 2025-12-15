# Setup Startup Mode - Configures Windows to enter a mode on boot
# Run as Administrator

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("gaming", "productivity", "disable")]
    [string]$Mode
)

$ErrorActionPreference = "Stop"
$TaskName = "KVM-Startup-Mode"
$ScriptPath = "C:\Scripts\set-mode.ps1"

Write-Host "Configuring startup mode: $Mode" -ForegroundColor Cyan

if ($Mode -eq "disable") {
    Write-Host "Removing startup task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Startup mode disabled." -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $ScriptPath)) {
    Write-Host "Error: $ScriptPath not found!" -ForegroundColor Red
    Write-Host "Please copy set-mode.ps1 to C:\Scripts\ first." -ForegroundColor Yellow
    exit 1
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" -Mode $Mode"

$Trigger = New-ScheduledTaskTrigger -AtLogon

$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

$Task = New-ScheduledTask -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description "Automatically enters $Mode mode on startup"

Register-ScheduledTask -TaskName $TaskName -InputObject $Task | Out-Null

Write-Host ""
Write-Host "Startup mode configured!" -ForegroundColor Green
Write-Host "Windows will automatically enter $Mode mode after login." -ForegroundColor Yellow
Write-Host ""
Write-Host "To change or disable:" -ForegroundColor Cyan
Write-Host "  .\setup-startup-mode.ps1 -Mode gaming" -ForegroundColor White
Write-Host "  .\setup-startup-mode.ps1 -Mode productivity" -ForegroundColor White
Write-Host "  .\setup-startup-mode.ps1 -Mode disable" -ForegroundColor White
