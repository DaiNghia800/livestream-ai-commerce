# Start the local development environment: database, commerce service, and web.
#
# The backend is TypeScript now; this script starts it with npm.

$ErrorActionPreference = 'Stop'

$repoRoot    = Split-Path -Parent $PSScriptRoot
$backendDir  = Join-Path $repoRoot 'services\commerce'
$frontendDir = Join-Path $repoRoot 'apps\web'

$backendPort  = 8000
$frontendPort = 3000

# 1. Database
Write-Host '[1/3] Starting PostgreSQL...' -ForegroundColor Cyan
docker compose -f (Join-Path $repoRoot 'docker-compose.yml') up -d postgres
if ($LASTEXITCODE -ne 0) {
    throw 'Could not start the container. Is Docker Desktop running?'
}

# Wait until the database is healthy before starting the backend.
$deadline = (Get-Date).AddMinutes(2)
do {
    Start-Sleep -Seconds 2
    $state = docker inspect -f '{{.State.Health.Status}}' liveorder-postgres 2>$null
} while ($state -ne 'healthy' -and (Get-Date) -lt $deadline)

if ($state -ne 'healthy') { throw 'PostgreSQL did not become healthy within 2 minutes.' }
Write-Host '      PostgreSQL is ready.' -ForegroundColor Green

# 2. Stop existing development processes to avoid port conflicts.
foreach ($pattern in @('tsx watch src/server.ts', 'next dev')) {
    Get-CimInstance Win32_Process |
        Where-Object { $_.Name -match 'node' -and $_.CommandLine -match [regex]::Escape($pattern) } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# 3. Backend
Write-Host "[2/3] Commerce service: http://localhost:$backendPort" -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$backendDir'; npm run dev"
) -WorkingDirectory $backendDir

# The service runs migrations on startup. Wait for its health endpoint
# before starting the frontend.
$deadline = (Get-Date).AddMinutes(2)
$up = $false
do {
    Start-Sleep -Seconds 2
    try {
        Invoke-RestMethod -Uri "http://localhost:$backendPort/health" -TimeoutSec 2 | Out-Null
        $up = $true
    } catch { }
} while (-not $up -and (Get-Date) -lt $deadline)

if (-not $up) { throw 'Commerce service did not start within 2 minutes. Check its window.' }
Write-Host '      Commerce service is ready.' -ForegroundColor Green

# 4. Frontend
Write-Host "[3/3] Web: http://localhost:$frontendPort" -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$frontendDir'; `$env:NEXT_PUBLIC_COMMERCE_API_URL='http://localhost:$backendPort'; npm run dev -- --port $frontendPort"
) -WorkingDirectory $frontendDir

Write-Host ''
Write-Host 'Services started:' -ForegroundColor Green
Write-Host "  Web       http://localhost:$frontendPort/shop/orders"
Write-Host "  API       http://localhost:$backendPort/api"
Write-Host '  pgAdmin   http://localhost:5050'
Write-Host ''
Write-Host 'Run the order smoke test: cd services\commerce; npm run smoke'
