param(
  [switch]$StopInfra
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $repoRoot "tmp\run-state\telegram-prod.json"

function Write-Step([string]$message) {
  Write-Host "[telegram:stop] $message" -ForegroundColor Yellow
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

$knownPids = @()
if (Test-Path $statePath) {
  try {
    $state = Get-Content -Raw -Encoding utf8 $statePath | ConvertFrom-Json
    foreach ($name in @("app", "gateway", "worker", "ngrok")) {
      $value = $state.pids.$name
      if ($value -and [int]$value -gt 0) {
        $knownPids += [int]$value
      }
    }
  } catch {
    # ignore bad state file
  }
}

if ($knownPids.Count -gt 0) {
  Write-Step "Stopping known process tree(s): $($knownPids -join ', ')"
  foreach ($procId in ($knownPids | Sort-Object -Unique)) {
    Stop-ProcessTree $procId
  }
}

Write-Step "Stopping listeners on 3000 and 8081 (if still running)"
foreach ($procId in (Get-ListeningProcessIds @(3000, 8081))) {
  Stop-ProcessTree $procId
}

Write-Step "Stopping ngrok processes (if any)"
Get-Process ngrok -ErrorAction SilentlyContinue | ForEach-Object {
  Stop-ProcessTree $_.Id
}

Write-Step "Stopping nginx proxy container"
try {
  & docker rm -f starrush-nginx-dev-proxy 2>$null | Out-Null
} catch {
  # container may already be absent
}

if ($StopInfra) {
  Write-Step "Stopping docker compose services"
  Push-Location $repoRoot
  try {
    & docker compose down | Out-Host
  } finally {
    Pop-Location
  }
}

if (Test-Path $statePath) {
  Remove-Item $statePath -Force
}

Write-Host ""
Write-Host "Telegram stack stopped." -ForegroundColor Green
if ($StopInfra) {
  Write-Host "Postgres/Redis were stopped too."
} else {
  Write-Host "Postgres/Redis are still running (use -StopInfra to stop them)."
}
