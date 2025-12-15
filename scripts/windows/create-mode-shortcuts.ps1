# Create Desktop Shortcuts for Mode Switching
# Run as Administrator

$ErrorActionPreference = "Stop"

$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ScriptsPath = "C:\Scripts"

Write-Host "Creating mode switching shortcuts on Desktop..." -ForegroundColor Cyan

$WshShell = New-Object -ComObject WScript.Shell

$GamingShortcut = $WshShell.CreateShortcut("$DesktopPath\Gaming Mode.lnk")
$GamingShortcut.TargetPath = "powershell.exe"
$GamingShortcut.Arguments = "-ExecutionPolicy Bypass -File `"$ScriptsPath\set-mode.ps1`" -Mode gaming"
$GamingShortcut.WorkingDirectory = $ScriptsPath
$GamingShortcut.Description = "Switch to Gaming Mode (Sunshine/Moonlight)"
$GamingShortcut.IconLocation = "shell32.dll,12"
$GamingShortcut.Save()
Write-Host "Created: Gaming Mode.lnk" -ForegroundColor Green

$ProductivityShortcut = $WshShell.CreateShortcut("$DesktopPath\Productivity Mode.lnk")
$ProductivityShortcut.TargetPath = "powershell.exe"
$ProductivityShortcut.Arguments = "-ExecutionPolicy Bypass -File `"$ScriptsPath\set-mode.ps1`" -Mode productivity"
$ProductivityShortcut.WorkingDirectory = $ScriptsPath
$ProductivityShortcut.Description = "Switch to Productivity Mode (RDP/WinApps)"
$ProductivityShortcut.IconLocation = "shell32.dll,21"
$ProductivityShortcut.Save()
Write-Host "Created: Productivity Mode.lnk" -ForegroundColor Green

Write-Host ""
Write-Host "Right-click shortcuts and select 'Run as administrator' to use them." -ForegroundColor Yellow
Write-Host "Or set them to always run as admin:" -ForegroundColor Cyan
Write-Host "  Right-click -> Properties -> Shortcut -> Advanced -> Run as administrator" -ForegroundColor White
