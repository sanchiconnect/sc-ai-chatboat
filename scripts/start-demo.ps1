<#
.SYNOPSIS
  Starts the whole SanchiJawab stack on this machine for a demo: database, migrations,
  API, worker, dashboard and the widget file server - each in its own window.

.DESCRIPTION
  Run from anywhere:   powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1
  Needs: Docker Desktop (running), uv, Node.js, and a filled-in .env at the repo root.
  Anything already running on its port (8000, 3000, 5500) is left alone and reused.

  -Check    only report what is ready / missing; start nothing.
  -Seed     afterwards, create a demo account full of real data (crawls real sites and
            asks real questions, so it spends Gemini calls and takes a few minutes).
  -NoBrowser  don't open browser tabs at the end.

  Stop everything this script started with:  scripts\stop-demo.ps1
#>
param(
  [switch]$Check,
  [switch]$Seed,
  [switch]$NoBrowser
)

# Continue (not Stop): Windows PowerShell 5.1 turns any stderr line from a native program (docker prints harmless\n# warnings) into a fatal error under Stop. Real failures are caught by checking exit codes below.\n$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "sanchijawab-backend"
$Admin = Join-Path $Root "sanchijawab-admin"
$Widget = Join-Path $Root "sanchijawab-widget"
$PidFile = Join-Path $Root ".demo-pids.json"
$problems = @()

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color }
function Ok($msg) { Say "  [ok]   $msg" Green }
function Bad($msg) { Say "  [FIX]  $msg" Red; $script:problems += $msg }
function Info($msg) { Say "  [..]   $msg" Yellow }

function Test-Port($port) {
  try { return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop) } catch { return $false }
}

function Get-EnvValue($name) {
  $envFile = Join-Path $Root ".env"
  if (-not (Test-Path $envFile)) { return "" }
  $line = Select-String -Path $envFile -Pattern "^\s*$name=(.*)$" | Select-Object -Last 1
  if ($line) { return $line.Matches[0].Groups[1].Value.Trim() }
  return ""
}

function Wait-Url($url, $seconds, $label) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
      if ($r.StatusCode -eq 200) { return $true }
    } catch { Start-Sleep -Seconds 2 }
  }
  return $false
}

Say "`nSanchiJawab demo launcher`n" Cyan

# --- 1. prerequisites -------------------------------------------------------
Say "Checking prerequisites" Cyan
foreach ($tool in @(@{n="docker"; h="Install Docker Desktop and start it"}, @{n="uv"; h="Install uv: https://docs.astral.sh/uv/"}, @{n="node"; h="Install Node.js 20+"}, @{n="npm"; h="Install Node.js 20+"})) {
  if (Get-Command $tool.n -ErrorAction SilentlyContinue) { Ok "$($tool.n) found" } else { Bad "$($tool.n) not found. $($tool.h)." }
}
if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker info *> $null
  if ($LASTEXITCODE -eq 0) { Ok "Docker is running" } else { Bad "Docker is installed but not running. Start Docker Desktop and wait until it says it is running." }
}
if (Test-Path (Join-Path $Root ".env")) {
  Ok ".env found"
  foreach ($k in @("CLOUD_API_KEY", "JWT_SECRET", "PAYMENT_SECRET_KEY")) {
    if ((Get-EnvValue $k).Length -gt 0) { Ok "$k is set" } else { Bad "$k is empty in .env (see .env.example)." }
  }
  if ((Get-EnvValue "JWT_SECRET").Length -gt 0 -and (Get-EnvValue "JWT_SECRET").Length -lt 16) { Bad "JWT_SECRET must be at least 16 characters." }
} else {
  Bad ".env is missing. Copy .env.example to .env and fill in CLOUD_API_KEY (Gemini), JWT_SECRET and PAYMENT_SECRET_KEY."
}
if ($problems.Count -gt 0) {
  Say "`nFix the items above, then run this again." Red
  exit 1
}

# --- 2. database + migrations ------------------------------------------------
Say "`nDatabase" Cyan
Push-Location $Root
try {
  if ($Check) {
    $state = docker compose ps --status running --services 2>$null | Where-Object { $_ -eq "db" }
    if ($state) { Ok "database container is running" } else { Info "database container is not running (the full start would launch it)" }
  } else {
    docker compose up -d db *> $null
    if ($LASTEXITCODE -ne 0) { throw "docker compose up -d db failed. Is Docker Desktop running?" }
    Info "waiting for the database to accept connections..."
    $ready = $false
    for ($i = 0; $i -lt 40 -and -not $ready; $i++) {
      docker compose exec -T db pg_isready -U (Get-EnvValue "DB_USER") *> $null
      if ($LASTEXITCODE -eq 0) { $ready = $true } else { Start-Sleep -Seconds 2 }
    }
    if (-not $ready) { throw "The database did not become ready in time. Run 'docker compose logs db' to see why." }
    Ok "database is up (port $(Get-EnvValue 'DB_PORT'))"
  }
} finally { Pop-Location }

Push-Location $Backend
try {
  if (-not (Test-Path (Join-Path $Backend ".venv"))) {
    if ($Check) { Info "backend packages not installed yet (first start runs 'uv sync')" }
    else { Info "installing backend packages (first run only, a few minutes)..."; uv sync *> $null; Ok "backend packages installed" }
  }
  if (-not $Check) {
    Info "applying database migrations..."
    uv run alembic upgrade head *> $null
    if ($LASTEXITCODE -ne 0) { throw "Migrations failed. Run 'uv run alembic upgrade head' in sanchijawab-backend to see the error." }
    Ok "database schema is up to date"
  } else {
    $cur = uv run alembic current 2>$null | Select-String "head"
    if ($cur) { Ok "database schema is up to date" } else { Info "database schema is not at the latest version (the full start applies it)" }
  }
} finally { Pop-Location }

# --- 3. front-end dependencies ------------------------------------------------
if (-not $Check) {
  Say "`nFront ends" Cyan
  if (-not (Test-Path (Join-Path $Admin "node_modules"))) { Info "installing dashboard packages (first run only)..."; Push-Location $Admin; npm install *> $null; Pop-Location }
  if (-not (Test-Path (Join-Path $Widget "node_modules"))) { Info "installing widget packages (first run only)..."; Push-Location $Widget; npm install *> $null; Pop-Location }
  Ok "packages installed"
}

# --- 4. start the services -----------------------------------------------------
$services = @(
  @{ Name = "API";       Port = 8000; Dir = $Backend; Cmd = "uv run uvicorn app.main:app --port 8000"; Url = "http://localhost:8000/health" },
  @{ Name = "Worker";    Port = 0;    Dir = $Backend; Cmd = "uv run python -m app.worker";            Url = $null },
  @{ Name = "Dashboard"; Port = 3000; Dir = $Admin;   Cmd = "npm run dev";                              Url = "http://localhost:3000" },
  @{ Name = "Widget";    Port = 5500; Dir = $Widget;  Cmd = "npm run serve";                            Url = "http://localhost:5500/widget.js" }
)

Say "`nServices" Cyan
$started = @()
$reused = @()
foreach ($s in $services) {
  if ($s.Port -gt 0 -and (Test-Port $s.Port)) { Ok "$($s.Name) already running on port $($s.Port) (left alone)"; $reused += $s.Name; continue }
  if ($s.Name -eq "Worker") {
    $running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like "*app.worker*" }
    if ($running) { Ok "Worker already running (left alone)"; continue }
  }
  if ($Check) { Info "$($s.Name) is not running (the full start would launch it)"; continue }
  $title = "SanchiJawab - $($s.Name)"
  $command = "`$host.UI.RawUI.WindowTitle='$title'; Set-Location '$($s.Dir)'; $($s.Cmd)"
  $p = Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-Command", $command -PassThru
  $started += @{ name = $s.Name; pid = $p.Id }
  Info "starting $($s.Name) in its own window..."
}
if ($started.Count -gt 0) { $started | ConvertTo-Json | Set-Content -Path $PidFile -Encoding utf8 }

# --- 5. wait until everything answers --------------------------------------------
if (-not $Check) {
  Say "`nWaiting for everything to respond (the first start can take a minute or two)" Cyan
  foreach ($s in $services) {
    if (-not $s.Url) { continue }
    if (Wait-Url $s.Url 240 $s.Name) { Ok "$($s.Name) is answering at $($s.Url)" }
    elseif ($reused -contains $s.Name) { Bad "Port $($s.Port) is taken by another program that is not the SanchiJawab $($s.Name) (for example an old terminal that was started in the wrong folder). Close that terminal, then run this script again." }
    else { Bad "$($s.Name) did not answer at $($s.Url). Look at its window for the error." }
  }
} else {
  Say "`nLive status" Cyan
  foreach ($s in $services) {
    if (-not $s.Url) { continue }
    try { $r = Invoke-WebRequest -Uri $s.Url -UseBasicParsing -TimeoutSec 4; Ok "$($s.Name): answering ($($r.StatusCode))" } catch { Info "$($s.Name): not answering at $($s.Url)" }
  }
}

# --- 6. end-to-end proof: a real question through the real pipeline ------------
if (-not $Check -and $problems.Count -eq 0) {
  Say "`nEnd-to-end check" Cyan
  try {
    $email = "demo_$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
    $signup = Invoke-RestMethod -Method Post -Uri "http://localhost:8000/v1/auth/signup" -ContentType "application/json" -Body (@{ email = $email; password = "Passw0rd!23"; business_name = "Launcher check" } | ConvertTo-Json)
    $h = @{ Authorization = "Bearer $($signup.access_token)" }
    $bot = Invoke-RestMethod -Method Post -Uri "http://localhost:8000/v1/workspaces/$($signup.workspace_id)/bots" -Headers $h -ContentType "application/json" -Body (@{ name = "Launcher check" } | ConvertTo-Json)
    Invoke-RestMethod -Method Post -Uri "http://localhost:8000/v1/bots/$($bot.bot_id)/qa-pairs" -Headers $h -ContentType "application/json" -Body (@{ question = "What are your opening hours?"; answer = "We are open 9am to 6pm, Monday to Saturday." } | ConvertTo-Json) | Out-Null
    $chat = Invoke-WebRequest -Method Post -UseBasicParsing -Uri "http://localhost:8000/public/w/$($bot.bot_id)/chat" -ContentType "application/json" -TimeoutSec 90 -Body (@{ message = "When are you open?"; business_name = "Launcher check" } | ConvertTo-Json)
    $answer = ([regex]::Matches($chat.Content, '"text":\s*"((?:[^"\\]|\\.)*)"') | ForEach-Object { $_.Groups[1].Value }) -join ""
    if ($answer.Length -gt 0) { Ok "a real AI answer came back: `"$($answer.Substring(0, [Math]::Min(110, $answer.Length)))`"" } else { Bad "The chat endpoint answered, but with no text. Check CLOUD_API_KEY (Gemini)." }
    Invoke-RestMethod -Method Delete -Uri "http://localhost:8000/v1/bots/$($bot.bot_id)" -Headers $h | Out-Null
    # Remove the throwaway account too, otherwise every start leaves another "Launcher check" workspace behind.
    Push-Location $Backend
    uv run python -m app.cleanup_test_data --apply --pattern ("^" + [regex]::Escape($email) + "$") 2>&1 | Out-Null
    Pop-Location
  } catch {
    Bad "The end-to-end check failed: $($_.Exception.Message)"
  }
}

if ($Seed -and -not $Check -and $problems.Count -eq 0) {
  Say "`nCreating a demo account with real data (this crawls sites and calls Gemini)" Cyan
  Push-Location $Backend; uv run python scripts/seed_demo.py; Pop-Location
}

# --- 7. summary -------------------------------------------------------------------
Say ""
if ($problems.Count -gt 0) {
  Say "Not everything is ready:" Red
  $problems | ForEach-Object { Say "  - $_" Red }
  exit 1
}
if ($Check) { Say "Check finished (nothing was started)." Green; exit 0 }

Say "Everything is running." Green
Say @"

  Dashboard (customers):   http://localhost:3000        sign up, create an assistant, add a website
  Super Admin console:     http://localhost:3000/staff/login   (use an email listed in SUPERADMIN_EMAILS)
  API docs:                http://localhost:8000/docs
  Widget test page:        http://localhost:5500/test.html      (edit the bot id inside, or use the Install tab snippet)

  Stop everything this script started:   scripts\stop-demo.ps1
"@ Cyan
if (-not $NoBrowser) {
  Start-Process "http://localhost:3000"
}
