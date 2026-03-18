param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $Root

$envFile = Join-Path $Root ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^[A-Za-z_][A-Za-z0-9_]*=') {
      $name, $value = $_ -split "=", 2
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

$tmpDir = Join-Path $Root "tmp"
if (!(Test-Path $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir | Out-Null
}

$stdout = Join-Path $tmpDir "dev-all.log"
$stderr = Join-Path $tmpDir "dev-all.err.log"

if (Test-Path $stdout) { Remove-Item $stdout -Force }
if (Test-Path $stderr) { Remove-Item $stderr -Force }

$proc = Start-Process `
  -FilePath "node.exe" `
  -ArgumentList "scripts/dev-all.js" `
  -WorkingDirectory $Root `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru `
  -WindowStyle Hidden

$proc.Id
