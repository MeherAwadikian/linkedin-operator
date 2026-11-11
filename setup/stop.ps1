# Stop the LinkedIn Operator worker + tunnel.
$repo = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $repo 'logs'

foreach ($name in @('worker.pid', 'tunnel.pid')) {
  $f = Join-Path $logs $name
  if (Test-Path $f) {
    $procId = (Get-Content $f -Raw).Trim()
    if ($procId) { Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue }
    Remove-Item $f -ErrorAction SilentlyContinue
  }
}

# Free port 8787 (the worker) and stop the cloudflared tunnel pointing at it.
Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*127.0.0.1:8787*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host "Stopped worker + tunnel." -ForegroundColor Green
