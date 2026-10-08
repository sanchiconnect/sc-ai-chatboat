<#
.SYNOPSIS
  Restores a backup made by backup-db.ps1, or proves that backups restore (-Drill).

.DESCRIPTION
  Prove backups work (safe: touches only a scratch database that it deletes afterwards):
      powershell -ExecutionPolicy Bypass -File scripts\restore-db.ps1 -Drill
  Restore a specific file into a NEW database so you can inspect it:
      powershell -ExecutionPolicy Bypass -File scripts\restore-db.ps1 -File backups\sanchijawab-20261008-090000.dump -Into sanchijawab_restored
  Replace the live database (destructive; asks you to type the database name to confirm):
      powershell -ExecutionPolicy Bypass -File scripts\restore-db.ps1 -File backups\x.dump -ReplaceLive

  Stop the api and worker first when replacing the live database.
#>
param(
  [string]$File,
  [string]$Into,
  [switch]$Drill,
  [switch]$ReplaceLive
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot

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

  function Psql($db, $sql) { (docker exec $cid psql -U $dbUser -d $db -tA -c $sql 2>$null) -join "`n" }

  # Row counts of the tables that matter, used to compare a restore against its source.
  $tables = @("users", "workspaces", "bots", "sources", "documents", "chunks", "conversations", "messages", "leads", "plans", "orders", "products", "content_pages")
  function Counts($db) {
    $out = [ordered]@{}
    foreach ($t in $tables) {
      $exists = Psql $db "select to_regclass('public.$t') is not null"
      $out[$t] = if ($exists -eq "t") { [int](Psql $db "select count(*) from $t") } else { -1 }
    }
    return $out
  }

  if ($Drill) {
    Write-Host "Restore drill" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "backup-db.ps1") -Keep 14
    if ($LASTEXITCODE -ne 0) { exit 1 }
    $File = Get-ChildItem (Join-Path $Root "backups") -Filter "sanchijawab-*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
    $Into = "sanchijawab_restore_drill"
  }

  if (-not $File -or -not (Test-Path $File)) { Write-Host "Give the backup file with -File <path>." -ForegroundColor Red; exit 1 }
  if ($ReplaceLive) { $Into = $dbName }
  if (-not $Into) { Write-Host "Say where to restore: -Into <new database name>, or -ReplaceLive." -ForegroundColor Red; exit 1 }
  if ($Into -eq $dbName -and -not $ReplaceLive) { Write-Host "That is the live database. Use -ReplaceLive if you really mean it." -ForegroundColor Red; exit 1 }

  if ($ReplaceLive) {
    Write-Host "This will ERASE the live database '$dbName' and replace it with $File." -ForegroundColor Yellow
    $typed = Read-Host "Type the database name ($dbName) to continue"
    if ($typed -ne $dbName) { Write-Host "Cancelled." -ForegroundColor Yellow; exit 1 }
    docker exec $cid psql -U $dbUser -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='$dbName' and pid<>pg_backend_pid()" *> $null
  }

  Write-Host "Restoring $(Split-Path $File -Leaf) into '$Into' ..." -ForegroundColor Cyan
  docker exec $cid psql -U $dbUser -d postgres -c "drop database if exists $Into" *> $null
  docker exec $cid psql -U $dbUser -d postgres -c "create database $Into" *> $null
  docker cp $File "${cid}:/tmp/restore.dump" *> $null
  docker exec $cid sh -c "pg_restore -U $dbUser -d $Into --no-owner --exit-on-error /tmp/restore.dump" *> $null
  $restoreExit = $LASTEXITCODE
  docker exec $cid rm -f /tmp/restore.dump *> $null
  if ($restoreExit -ne 0) { Write-Host "pg_restore failed." -ForegroundColor Red; if ($Drill) { docker exec $cid psql -U $dbUser -d postgres -c "drop database if exists $Into" *> $null }; exit 1 }

  $restored = Counts $Into
  Write-Host "`nRestored database contents:" -ForegroundColor Cyan
  $restored.GetEnumerator() | Where-Object { $_.Value -ge 0 } | ForEach-Object { Write-Host ("  {0,-15} {1,8}" -f $_.Key, $_.Value) }

  if ($Drill) {
    $live = Counts $dbName
    $same = $true
    foreach ($t in $tables) {
      # The live database may have gained rows since the backup a moment ago (a running API); only a LOSS is a failure.
      if ($restored[$t] -ne $live[$t] -and $restored[$t] -lt $live[$t] - 5) { $same = $false; Write-Host "  mismatch in $t : backup has $($restored[$t]), live has $($live[$t])" -ForegroundColor Red }
    }
    docker exec $cid psql -U $dbUser -d postgres -c "drop database if exists $Into" *> $null
    if ($same) { Write-Host "`nRESTORE DRILL PASSED: the backup restores and matches the live database. Scratch database removed." -ForegroundColor Green; exit 0 }
    Write-Host "`nRESTORE DRILL FAILED." -ForegroundColor Red; exit 1
  }
  Write-Host "`nDone. Database '$Into' is ready." -ForegroundColor Green
} finally { Pop-Location }
