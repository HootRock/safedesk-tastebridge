param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPython = Join-Path $taskRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $taskPython)) { throw 'Install the local Python environment first; see README.' }
if (!(Test-Path -LiteralPath (Join-Path $taskRoot 'web/dist/index.html'))) { throw 'Build the interface first: pnpm --dir web build' }
if (!(Test-Path -LiteralPath (Join-Path $taskRoot '.env'))) { throw 'Copy .env.example to .env and configure your local services first.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "Port $Port is already in use. Check http://127.0.0.1:$Port/api/health and use the running service or choose another port."
    exit 0
}
Push-Location $taskRoot
try {
    Write-Host "SafeDesk: http://127.0.0.1:$Port/safedesk"
    Write-Host "TasteBridge: http://127.0.0.1:$Port/tastebridge"
    Write-Host 'Keep this terminal open. Press Ctrl+C to stop this local service.'
    & $taskPython -m uvicorn hackathon_api.main:app --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) { throw 'The local service exited with an error.' }
} finally { Pop-Location }
