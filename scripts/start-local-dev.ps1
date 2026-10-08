$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot 'services\commerce'
$frontendDir = Join-Path $repoRoot 'apps\web'

$backendPort = 8000
$frontendPreferredPort = 3000

$oldBackendPids = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -match 'python|python.exe' -and $_.CommandLine -match 'uvicorn app.main:app'
    } |
    Select-Object -ExpandProperty ProcessId -Unique

foreach ($processId in $oldBackendPids) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

$oldFrontendPids = Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -match 'node|node.exe' -and $_.CommandLine -match 'next dev'
    } |
    Select-Object -ExpandProperty ProcessId -Unique

foreach ($processId in $oldFrontendPids) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

$frontendPort = $frontendPreferredPort
$portInUse = Get-NetTCPConnection -LocalPort $frontendPort -ErrorAction SilentlyContinue
if ($portInUse) {
    foreach ($candidate in @(3001, 3002, 3003, 3004, 3005)) {
        $candidateInUse = Get-NetTCPConnection -LocalPort $candidate -ErrorAction SilentlyContinue
        if (-not $candidateInUse) {
            $frontendPort = $candidate
            break
        }
    }
}

Write-Host "Starting backend on http://localhost:$backendPort"
Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$backendDir'; `$env:PYTHONPATH='$backendDir'; `$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5433/liveorder'; `$env:SECRET_KEY='liveorder-dev-secret-key-change-me'; python -m uvicorn app.main:app --host 0.0.0.0 --port $backendPort"
) -WorkingDirectory $backendDir -WindowStyle Minimized

Start-Sleep -Seconds 3

Write-Host "Starting frontend on http://localhost:$frontendPort"
Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$frontendDir'; `$env:NEXT_PUBLIC_COMMERCE_API_URL='http://localhost:$backendPort'; npm run dev -- --hostname 0.0.0.0 --port $frontendPort"
) -WorkingDirectory $frontendDir -WindowStyle Minimized

Write-Host ""
Write-Host "Gateway:"
Write-Host "  Backend:  http://localhost:$backendPort"
Write-Host "  Frontend: http://localhost:$frontendPort"
Write-Host "  Swagger:  http://localhost:$backendPort/docs"
Write-Host ""
