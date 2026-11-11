# LinkedIn Operator — one-click launcher.
# Installs prerequisites (Node, pnpm, cloudflared) if missing, installs deps,
# starts the worker + tunnel, publishes the tunnel URL to the DB (so no Cloudflare
# edit is needed), and opens the app. Re-runnable any time.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$APP_URL = 'https://linkedin-operator-web.cloudg7914.workers.dev/'

function Say($m, $c = 'White') { Write-Host $m -ForegroundColor $c }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Winget-Install($id) {
  if (Have 'winget') {
    Say "  installing $id via winget..." 'DarkGray'
    winget install -e --id $id --accept-source-agreements --accept-package-agreements --silent 2>$null | Out-Null
    Refresh-Path
  }
}

Say "`n=== LinkedIn Operator — setup & launch ===`n" 'Cyan'

# --- 1. Node 22+ ---
Say "[1/6] Node.js..."
if (-not (Have 'node')) { Winget-Install 'OpenJS.NodeJS.LTS' }
if (-not (Have 'node')) {
  Say "  Node.js not found and could not auto-install. Install it from https://nodejs.org (LTS), then re-run." 'Yellow'
  Read-Host "Press Enter to exit"; exit 1
}
$nodeMajor = ((node --version) -replace 'v','').Split('.')[0] -as [int]
if ($nodeMajor -lt 22) {
  Say "  Node $(node --version) is too old (need 22+). Updating..." 'Yellow'
  Winget-Install 'OpenJS.NodeJS.LTS'
}
Say "  Node $(node --version)" 'Green'

# --- 2. pnpm ---
Say "[2/6] pnpm..."
if (-not (Have 'pnpm')) { try { npm install -g pnpm 2>$null | Out-Null; Refresh-Path } catch {} }
if (-not (Have 'pnpm')) { Winget-Install 'pnpm.pnpm' }
if (-not (Have 'pnpm')) { Say "  pnpm not found. Run: npm install -g pnpm   then re-run." 'Yellow'; Read-Host "Enter to exit"; exit 1 }
Say "  pnpm $(pnpm --version)" 'Green'

# --- 3. cloudflared ---
Say "[3/6] cloudflared (tunnel)..."
if (-not (Have 'cloudflared')) { Winget-Install 'Cloudflare.cloudflared' }
$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared -and (Test-Path 'C:\Program Files (x86)\cloudflared\cloudflared.exe')) {
  $cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
}
if (-not $cloudflared) { Say "  cloudflared not found. Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ then re-run." 'Yellow'; Read-Host "Enter to exit"; exit 1 }
Say "  cloudflared ready" 'Green'

# --- 4. Chrome (needed by the worker's Playwright) ---
Say "[4/6] Google Chrome..."
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { Say "  Chrome not detected — install it from https://www.google.com/chrome before using LinkedIn actions." 'Yellow' } else { Say "  Chrome found" 'Green' }

# --- 5. Install dependencies ---
Say "[5/6] Installing dependencies (first run can take a few minutes)..."
Push-Location $repo
pnpm install --silent
Pop-Location
Say "  dependencies ready" 'Green'

# Give this machine a unique worker id (avoids clashes on the shared database).
$envFile = Join-Path $repo 'apps\worker\.env'
if (Test-Path $envFile) {
  $content = Get-Content $envFile -Raw
  if ($content -match 'WORKER_ID=worker-local\s') {
    $wid = 'worker-' + ($env:COMPUTERNAME -replace '[^A-Za-z0-9]','').ToLower()
    $content = $content -replace 'WORKER_ID=worker-local', "WORKER_ID=$wid"
    Set-Content -Path $envFile -Value $content -Encoding utf8
    Say "  worker id set to $wid" 'DarkGray'
  }
}

# --- 6. Start worker + tunnel ---
Say "[6/6] Starting worker + tunnel..."
# Stop any previous instances first.
& (Join-Path $PSScriptRoot 'stop.ps1') 2>$null | Out-Null
Start-Sleep -Milliseconds 500

$worker = Start-Process -PassThru -WindowStyle Minimized -WorkingDirectory (Join-Path $repo 'apps\worker') `
  -FilePath 'node' -ArgumentList '--env-file=.env','--import','tsx','src/index.ts' `
  -RedirectStandardOutput (Join-Path $logs 'worker.out') -RedirectStandardError (Join-Path $logs 'worker.err')
$worker.Id | Set-Content (Join-Path $logs 'worker.pid')

$tunnel = Start-Process -PassThru -WindowStyle Minimized `
  -FilePath $cloudflared -ArgumentList 'tunnel','--url','http://127.0.0.1:8787' `
  -RedirectStandardOutput (Join-Path $logs 'tunnel.out') -RedirectStandardError (Join-Path $logs 'tunnel.err')
$tunnel.Id | Set-Content (Join-Path $logs 'tunnel.pid')

# Wait for the tunnel URL (cloudflared prints it to stderr).
Say "  waiting for tunnel..." 'DarkGray'
$publicUrl = $null
for ($i = 0; $i -lt 30 -and -not $publicUrl; $i++) {
  Start-Sleep -Seconds 1
  foreach ($f in @('tunnel.err','tunnel.out')) {
    $p = Join-Path $logs $f
    if (Test-Path $p) {
      $m = Select-String -Path $p -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($m) { $publicUrl = $m.Matches[0].Value; break }
    }
  }
}

if ($publicUrl) {
  Say "  tunnel: $publicUrl" 'Green'
  # Publish the URL to the DB so the web app finds the worker automatically.
  Push-Location $repo
  node --env-file=apps/worker/.env setup/publish-endpoint.mjs $publicUrl 2>&1 | Out-Null
  Pop-Location
  Say "  published to app — no Cloudflare edit needed." 'Green'
} else {
  Say "  tunnel URL not detected yet; check logs\tunnel.err. The worker still runs locally." 'Yellow'
}

Start-Process $APP_URL
Say "`n=== Running ===" 'Cyan'
Say "App:    $APP_URL (opening in your browser)"
Say "Worker: running (PID $($worker.Id))   Tunnel: running (PID $($tunnel.Id))"
Say "Logs:   $logs"
Say "To stop everything: double-click STOP.bat`n" 'DarkGray'
Read-Host "Press Enter to close this window (worker + tunnel keep running)"
