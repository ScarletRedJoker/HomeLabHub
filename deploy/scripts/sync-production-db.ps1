#Requires -Version 5.1
<#
.SYNOPSIS
    Nebula Command - Production Database Sync (Windows)
.DESCRIPTION
    Syncs the production database schema and creates admin user
.PARAMETER DatabaseUrl
    PostgreSQL connection string
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$DatabaseUrl
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Nebula Command - Production DB Sync" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$sql = @"
-- Add username column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS username varchar(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash varchar(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role varchar(20) DEFAULT 'viewer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Create unique index on username if not exists
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username) WHERE username IS NOT NULL;

-- Set username from email for users that don't have one
UPDATE users 
SET username = COALESCE(
    NULLIF(split_part(email, '@', 1), ''),
    'user_' || LEFT(id::text, 8)
)
WHERE username IS NULL OR username = '';

-- Create admin user if not exists
INSERT INTO users (id, username, email, password_hash, role, is_active, created_at)
SELECT 
    gen_random_uuid(),
    'admin',
    'admin@nebula.local',
    '\$2a\$10\$4rb3ZAc1VL5QI.WdRmGGbewjZcx3NlXY.JlqoAQqCZ5vdvX0T55Q.',
    'admin',
    true,
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE username = 'admin'
);

-- Show results
SELECT username, email, role, is_active FROM users ORDER BY created_at DESC LIMIT 5;
"@

Write-Host "[1/2] Running database sync..." -ForegroundColor Yellow

try {
    $tempFile = [System.IO.Path]::GetTempFileName() + ".sql"
    Set-Content -Path $tempFile -Value $sql
    
    $result = & psql $DatabaseUrl -f $tempFile 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Database sync failed" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
    
    Remove-Item $tempFile -ErrorAction SilentlyContinue
    
    Write-Host $result
}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Database sync complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Login credentials:" -ForegroundColor Yellow
Write-Host "    Username: admin" -ForegroundColor White
Write-Host "    Password: admin123" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Green
