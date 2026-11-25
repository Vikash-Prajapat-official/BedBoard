# Windows version of init-env.sh: creates .env from .env.example with fresh random secrets.
#   powershell -ExecutionPolicy Bypass -File scripts\init-env.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (Test-Path .env) { Write-Host ".env already exists, so I left it alone."; exit 0 }
if (-not (Test-Path .env.example)) { Write-Error "Run this from the BedBoard folder (.env.example not found)."; exit 1 }

# Letters and digits only, drawn from the operating system's secure random generator.
function New-Secret([int]$length) {
  $chars = [char[]]"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  $bytes = New-Object byte[] $length
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

$db = New-Secret 28
$auth = New-Secret 48
$backup = New-Secret 32

$text = Get-Content .env.example -Raw
$text = $text -replace '(?m)^POSTGRES_PASSWORD=.*$', "POSTGRES_PASSWORD=$db"
$text = $text -replace '(?m)^DATABASE_URL=.*$', "DATABASE_URL=postgresql://bedboard:$db@db:5432/bedboard"
$text = $text -replace '(?m)^AUTH_SECRET=.*$', "AUTH_SECRET=$auth"
$text = $text -replace '(?m)^BACKUP_PASSPHRASE=.*$', "BACKUP_PASSPHRASE=$backup"
# Plain UTF-8 without a byte-order mark, which Docker Compose requires.
[System.IO.File]::WriteAllText((Join-Path (Get-Location) ".env"), $text, (New-Object System.Text.UTF8Encoding($false)))

Write-Host @"
Created .env with random passwords.

  IMPORTANT: your encrypted backups can only be opened with BACKUP_PASSPHRASE.
  Copy it from .env to a safe place that is NOT this computer (a password manager,
  or a sealed note kept by the hospital administrator). Lose it and the backups are useless.

Next:  docker compose up -d --build
Then open http://localhost:3001 and create your administrator.
"@
