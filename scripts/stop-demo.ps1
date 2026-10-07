<#
.SYNOPSIS
  Stops the windows start-demo.ps1 opened (API, worker, dashboard, widget server).
  The database container keeps running unless you pass -Database.
  Anything you started yourself in your own terminals is not touched.
#>
param([switch]$Database)

$Root = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $Root ".demo-pids.json"

if (Test-Path $PidFile) {
  foreach ($entry in (Get-Content $PidFile -Raw | ConvertFrom-Json)) {
    if (Get-Process -Id $entry.pid -ErrorAction SilentlyContinue) {
      taskkill /PID $entry.pid /T /F *> $null   # /T also stops the servers the window started
      Write-Host "stopped $($entry.name)" -ForegroundColor Green
    }
  }
  Remove-Item $PidFile -ErrorAction SilentlyContinue
} else {
  Write-Host "Nothing recorded as started by start-demo.ps1." -ForegroundColor Yellow
}

if ($Database) {
  Push-Location $Root; docker compose stop db; Pop-Location
  Write-Host "database stopped (data is kept)" -ForegroundColor Green
}
