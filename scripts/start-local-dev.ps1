# Khởi động môi trường phát triển: database, commerce service, web.
#
# Script cũ gọi `uvicorn app.main:app` từ thời backend còn viết bằng
# Python. Backend đã chuyển sang TypeScript nên lệnh đó không còn tồn
# tại, và nó cũng trỏ sai cổng database.

$ErrorActionPreference = 'Stop'

$repoRoot    = Split-Path -Parent $PSScriptRoot
$backendDir  = Join-Path $repoRoot 'services\commerce'
$frontendDir = Join-Path $repoRoot 'apps\web'

$backendPort  = 8000
$frontendPort = 3000

# ── 1. Database ─────────────────────────────────────────────────────
Write-Host '[1/3] Khởi động PostgreSQL...' -ForegroundColor Cyan
docker compose -f (Join-Path $repoRoot 'docker-compose.yml') up -d postgres
if ($LASTEXITCODE -ne 0) {
    throw 'Không khởi động được container. Docker Desktop đã chạy chưa?'
}

# Chờ container báo healthy. Chạy migration khi database chưa sẵn sàng
# thì lỗi kết nối, mà thông báo lúc đó không nói rõ nguyên nhân.
$deadline = (Get-Date).AddMinutes(2)
do {
    Start-Sleep -Seconds 2
    $state = docker inspect -f '{{.State.Health.Status}}' liveorder-postgres 2>$null
} while ($state -ne 'healthy' -and (Get-Date) -lt $deadline)

if ($state -ne 'healthy') { throw 'PostgreSQL không sẵn sàng sau 2 phút.' }
Write-Host '      PostgreSQL sẵn sàng.' -ForegroundColor Green

# ── 2. Dọn tiến trình cũ ────────────────────────────────────────────
# Chạy lại script mà còn tiến trình cũ ôm cổng thì lệnh mới im lặng
# thất bại, và người chạy tưởng mình đang xem bản mới.
foreach ($pattern in @('tsx watch src/server.ts', 'next dev')) {
    Get-CimInstance Win32_Process |
        Where-Object { $_.Name -match 'node' -and $_.CommandLine -match [regex]::Escape($pattern) } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# ── 3. Backend ──────────────────────────────────────────────────────
Write-Host "[2/3] Commerce service → http://localhost:$backendPort" -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$backendDir'; npm run dev"
) -WorkingDirectory $backendDir

# Service tự chạy migration lúc khởi động, nên chờ nó lên hẳn rồi mới
# bật web — web gọi API ngay từ lần render đầu.
$deadline = (Get-Date).AddMinutes(2)
$up = $false
do {
    Start-Sleep -Seconds 2
    try {
        Invoke-RestMethod -Uri "http://localhost:$backendPort/health" -TimeoutSec 2 | Out-Null
        $up = $true
    } catch { }
} while (-not $up -and (Get-Date) -lt $deadline)

if (-not $up) { throw "Commerce service không lên sau 2 phút. Xem cửa sổ backend." }
Write-Host '      Commerce service sẵn sàng.' -ForegroundColor Green

# ── 4. Frontend ─────────────────────────────────────────────────────
Write-Host "[3/3] Web → http://localhost:$frontendPort" -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$frontendDir'; `$env:NEXT_PUBLIC_COMMERCE_API_URL='http://localhost:$backendPort'; npm run dev -- --port $frontendPort"
) -WorkingDirectory $frontendDir

Write-Host ''
Write-Host 'Đã chạy:' -ForegroundColor Green
Write-Host "  Web       http://localhost:$frontendPort/shop/orders"
Write-Host "  API       http://localhost:$backendPort/api"
Write-Host '  pgAdmin   http://localhost:5050'
Write-Host ''
Write-Host 'Thử một vòng đơn hàng:  cd services\commerce; npm run smoke'
