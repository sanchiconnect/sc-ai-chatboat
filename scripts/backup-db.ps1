<#
.SYNOPSIS
  Takes a backup of the SanchiJawab database (the docker-compose `db` container) into backups\.

.DESCRIPTION
  powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1            # one backup now
  powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1 -Keep 30   # keep the newest 30 files

  Produces a compressed pg_dump file (backups\sanchijawab-YYYYMMDD-HHMMSS.dump). Schedule it daily with Windows Task
  Scheduler (or cron on Linux with the same pg_dump command). If the database is a managed service instead of the
  compose container (RDS, Supabase...), use the provider's automated backups and run restore-db.ps1 -Drill against a
  downloaded dump to prove it restores.
  Copy the files somewhere off this machine; a backup on the same disk is not a backup.
#>
param([int]$Keep = 14)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root "backups"

function Get-EnvValue($name, $default) {
  $line = Select-String -Path (Join-Path $Root ".env") -Pattern "^\s*$name=(.*)$" -ErrorAction SilentlyContinue | Select-Object -Last 1
  if ($line -and $line.Matches[0].Groups[1].Value.Trim()) { return $line.Matches[0].Groups[1].Value.Trim() }
  return $default
}
$dbUser = Get-EnvValue "DB_USER" "sanchijawab"
$dbName = Get-EnvValue "DB_NAME" "sanchijawab"

Push-Location $Root
try {
  $cid = (docker compose ps -q db 2>$null | Select-Object -First 1)
  if (-not $cid) { Write-Host "The database container is not running. Start it with: docker compose up -d db" -ForegroundColor Red; exit 1 }

  New-Item -ItemType Directory -Force $OutDir | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $file = Join-Path $OutDir "sanchijawab-$stamp.dump"

  # Dump inside the container then copy it out: redirecting binary output through PowerShell 5.1 would corrupt it.
  docker exec $cid sh -c "pg_dump -U $dbUser -d $dbName -Fc -f /tmp/backup.dump" *> $null
  if ($LASTEXITCODE -ne 0) { Write-Host "pg_dump failed." -ForegroundColor Red; exit 1 }
  docker cp "${cid}:/tmp/backup.dump" $file *> $null
  docker exec $cid rm -f /tmp/backup.dump *> $null
  if (-not (Test-Path $file) -or (Get-Item $file).Length -lt 1024) { Write-Host "The backup file is missing or empty." -ForegroundColor Red; exit 1 }

  $size = [math]::Round((Get-Item $file).Length / 1MB, 2)
  Write-Host "Backup written: $file ($size MB)" -ForegroundColor Green

  $old = Get-ChildItem $OutDir -Filter "sanchijawab-*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
  foreach ($f in $old) { Remove-Item $f.FullName; Write-Host "Removed old backup $($f.Name)" -ForegroundColor DarkGray }
} finally { Pop-Location }
