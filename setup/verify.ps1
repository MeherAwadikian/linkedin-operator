# LinkedIn Operator — install/health verifier ("doctor").
# Confirms every prerequisite, config value, and live dependency is in place.
# Run standalone (double-click VERIFY.bat) or it runs at the end of START.bat.

$repo = Split-Path -Parent $PSScriptRoot
$ok = $true
function Pass($m) { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "  [FAIL] $m" -ForegroundColor Red; $script:ok = $false }
function Have($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }

Write-Host "`n=== LinkedIn Operator — install check ===`n" -ForegroundColor Cyan

# --- tools ---
if (Have 'node') {
  $maj = ((node --version) -replace 'v','').Split('.')[0] -as [int]
  if ($maj -ge 22) { Pass "Node $(node --version)" } else { Fail "Node $(node --version) — need 22+" }
} else { Fail "Node.js not installed (https://nodejs.org)" }
if (Have 'pnpm') { Pass "pnpm $(pnpm --version)" } else { Fail "pnpm not installed (npm i -g pnpm)" }
if ((Have 'cloudflared') -or (Test-Path 'C:\Program Files (x86)\cloudflared\cloudflared.exe')) { Pass "cloudflared present" } else { Fail "cloudflared not installed" }
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($chrome) { Pass "Google Chrome found" } else { Warn "Chrome not found — needed for LinkedIn actions" }

# --- dependencies installed ---
if (Test-Path "$repo\node_modules") { Pass "dependencies installed" } else { Fail "dependencies missing — run: pnpm install" }

# --- worker config present & complete ---
$envFile = "$repo\apps\worker\.env"
if (Test-Path $envFile) {
  $c = Get-Content $envFile -Raw
  $missing = @()
  foreach ($k in 'NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VAULT_MASTER_KEY','WORKER_INGEST_TOKEN') {
    if ($c -notmatch "(?m)^$k=.+$") { $missing += $k }
  }
  if ($missing.Count -eq 0) { Pass "apps/worker/.env has all required keys" }
  else { Fail "apps/worker/.env missing: $($missing -join ', ')" }
} else { Fail "apps/worker/.env not found" }

# --- Supabase reachable ---
if (Test-Path $envFile) {
  $url = (Select-String -Path $envFile -Pattern '^NEXT_PUBLIC_SUPABASE_URL=(.+)$').Matches.Groups[1].Value
  $svc = (Select-String -Path $envFile -Pattern '^SUPABASE_SERVICE_ROLE_KEY=(.+)$').Matches.Groups[1].Value
  if ($url -and $svc) {
    try {
      $r = Invoke-WebRequest -Uri "$url/rest/v1/worker_heartbeats?select=id&limit=1" -Headers @{ apikey = $svc; Authorization = "Bearer $svc"; 'Accept-Profile' = 'app' } -TimeoutSec 20 -UseBasicParsing
      if ($r.StatusCode -eq 200) { Pass "Supabase database reachable" } else { Warn "Supabase returned HTTP $($r.StatusCode)" }
    } catch { Fail "Supabase unreachable: $($_.Exception.Message)" }
  }
}

# --- worker + tunnel (if running) ---
if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) { Pass "worker running on :8787" } else { Warn "worker not running — START.bat starts it" }

Write-Host ""
if ($ok) { Write-Host "All required checks passed. You're good to go." -ForegroundColor Green }
else { Write-Host "Some checks FAILED — fix the items above, then re-run." -ForegroundColor Red }
Write-Host ""
