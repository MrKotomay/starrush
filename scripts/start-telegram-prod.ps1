param(
  [switch]$SkipBuild,
  [switch]$SkipNgrok,
  [switch]$SkipCleanup,
  [int]$TimeoutSec = 180
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot "tmp\run-logs"
$stateDir = Join-Path $repoRoot "tmp\run-state"
$statePath = Join-Path $stateDir "telegram-prod.json"

function Write-Step([string]$message) {
  Write-Host "[telegram:start] $message" -ForegroundColor Cyan
}

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
}

function Ensure-Cmd([string]$cmdName) {
  $cmd = Get-Command $cmdName -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Command not found: $cmdName"
  }
}

function Stop-ProcessTree([int]$procId) {
  try {
    Stop-Process -Id $procId -Force -ErrorAction Stop
  } catch {
    # ignore
  }
}

function Get-ListeningProcessIds([int[]]$ports) {
  $allIds = New-Object System.Collections.Generic.HashSet[int]
  foreach ($port in $ports) {
    $rows = netstat -ano -p tcp | Select-String ":$port"
    foreach ($row in $rows) {
      $line = $row.ToString()
      if ($line -match "^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
        $procId = [int]$Matches[1]
        if ($procId -gt 0) {
          $allIds.Add($procId) | Out-Null
        }
      }
    }
  }
  return @($allIds)
}

function Start-BackgroundCmd(
  [string]$label,
  [string]$command,
  [string]$stdoutPath,
  [string]$stderrPath
) {
  $actualStdoutPath = $stdoutPath
  $actualStderrPath = $stderrPath

  if (Test-Path $actualStdoutPath) {
    try {
      Remove-Item $actualStdoutPath -Force
    } catch {
      $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $actualStdoutPath = "$stdoutPath.$stamp"
    }
  }
  if (Test-Path $actualStderrPath) {
    try {
      Remove-Item $actualStderrPath -Force
    } catch {
      $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $actualStderrPath = "$stderrPath.$stamp"
    }
  }

  $proc = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList @("/d", "/s", "/c", $command) `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $actualStdoutPath `
    -RedirectStandardError $actualStderrPath `
    -PassThru `
    -WindowStyle Minimized

  Write-Step "$label started (PID=$($proc.Id), out=$(Split-Path -Leaf $actualStdoutPath), err=$(Split-Path -Leaf $actualStderrPath))"
  return $proc.Id
}

function Wait-HttpOk([string]$url, [int]$timeoutSec) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 8
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
        return $true
      }
    } catch {
      # retry
    }
    Start-Sleep -Milliseconds 900
  }
  return $false
}

function Wait-NgrokUrl([int]$timeoutSec) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $timeoutSec) {
    try {
      $data = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 5
      $httpsTunnel = $data.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
      if ($httpsTunnel -and $httpsTunnel.public_url) {
        return [string]$httpsTunnel.public_url
      }
    } catch {
      # retry
    }
    Start-Sleep -Milliseconds 800
  }
  return $null
}

Ensure-Cmd "docker"
Ensure-Cmd "npm"
if (-not $SkipNgrok) {
  Ensure-Cmd "ngrok"
}

Ensure-Dir $logsDir
Ensure-Dir $stateDir

Write-Step "Repo: $repoRoot"

if (-not $SkipCleanup) {
  Write-Step "Cleaning old listeners on ports 3000/8081"
  foreach ($procId in (Get-ListeningProcessIds @(3000, 8081))) {
    Stop-ProcessTree $procId
  }

  Write-Step "Stopping previous ngrok processes (if any)"
  Get-Process ngrok -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-ProcessTree $_.Id
  }
}

Write-Step "Ensuring PostgreSQL and Redis are up"
Push-Location $repoRoot
try {
  & docker compose up -d | Out-Host
} finally {
  Pop-Location
}

if (-not $SkipBuild) {
  Write-Step "Building Next.js app (production)"
  Push-Location $repoRoot
  try {
    & npm run build | Out-Host
  } finally {
    Pop-Location
  }
}

$appPid = Start-BackgroundCmd `
  -label "Next.js (npm run start)" `
  -command "npm run start" `
  -stdoutPath (Join-Path $logsDir "app.out.log") `
  -stderrPath (Join-Path $logsDir "app.err.log")

$gatewayPid = Start-BackgroundCmd `
  -label "Gateway (npm run gateway)" `
  -command "npm run gateway" `
  -stdoutPath (Join-Path $logsDir "gateway.out.log") `
  -stderrPath (Join-Path $logsDir "gateway.err.log")

$workerPid = Start-BackgroundCmd `
  -label "Round worker (npm run worker:round)" `
  -command "npm run worker:round" `
  -stdoutPath (Join-Path $logsDir "worker.out.log") `
  -stderrPath (Join-Path $logsDir "worker.err.log")

Write-Step "Restarting local nginx proxy container (port 8088)"
$nginxConfigPath = (Resolve-Path (Join-Path $repoRoot "infra/nginx/dev-single-tunnel.conf")).Path
try {
  & docker rm -f starrush-nginx-dev-proxy 2>$null | Out-Null
} catch {
  # container may already be absent
}
& docker run -d --name starrush-nginx-dev-proxy -p 8088:8088 -v "${nginxConfigPath}:/etc/nginx/nginx.conf:ro" nginx:alpine | Out-Host

$ngrokPid = $null
if (-not $SkipNgrok) {
  $ngrokPid = Start-BackgroundCmd `
    -label "ngrok (http 8088)" `
    -command "ngrok http 8088" `
    -stdoutPath (Join-Path $logsDir "ngrok.out.log") `
    -stderrPath (Join-Path $logsDir "ngrok.err.log")
}

Write-Step "Waiting for app and proxy health checks"
if (-not (Wait-HttpOk -url "http://127.0.0.1:3000" -timeoutSec $TimeoutSec)) {
  throw "App did not become healthy on http://127.0.0.1:3000 within $TimeoutSec sec."
}
if (-not (Wait-HttpOk -url "http://127.0.0.1:8088" -timeoutSec $TimeoutSec)) {
  throw "Proxy did not become healthy on http://127.0.0.1:8088 within $TimeoutSec sec."
}

$publicUrl = $null
if (-not $SkipNgrok) {
  Write-Step "Waiting for ngrok public URL"
  $publicUrl = Wait-NgrokUrl -timeoutSec $TimeoutSec
  if (-not $publicUrl) {
    throw "ngrok public URL was not detected on http://127.0.0.1:4040 within $TimeoutSec sec."
  }
}

$state = [ordered]@{
  startedAt = (Get-Date).ToString("o")
  pids = @{
    app = $appPid
    gateway = $gatewayPid
    worker = $workerPid
    ngrok = $ngrokPid
  }
  publicUrl = $publicUrl
  wsUrl = if ($publicUrl) { "$publicUrl/ws" } else { $null }
  logsDir = $logsDir
}
$state | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 $statePath

Write-Host ""
Write-Host "=== Telegram prod stack is running ===" -ForegroundColor Green
Write-Host "App:    http://127.0.0.1:3000"
Write-Host "Proxy:  http://127.0.0.1:8088"
if ($publicUrl) {
  Write-Host "Public: $publicUrl"
  Write-Host "WS:     $publicUrl/ws"
  Write-Host ""
  Write-Host "BotFather Mini App URL: $publicUrl"
}
Write-Host "Logs:   $logsDir"
Write-Host "State:  $statePath"
Write-Host ""
Write-Host "Stop command: powershell -ExecutionPolicy Bypass -File scripts/stop-telegram.ps1"
