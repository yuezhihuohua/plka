param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path $PSScriptRoot -Parent
$node = Join-Path $appRoot 'runtime\node.exe'
$info = (& $node (Join-Path $PSScriptRoot 'runtime-info.mjs') | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Cannot locate the library. Use the existing-library entry.' }
$logDir = Join-Path $info.configDir 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$arguments = '--experimental-sqlite "' + (Join-Path $appRoot 'launcher.mjs') + '" --background'
if ($NoOpen) { $arguments += ' --no-open' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir ($stamp + '.log')) -RedirectStandardError (Join-Path $logDir ($stamp + '.error.log')) | Out-Null
for ($i=0; $i -lt 100; $i++) {
  try {
    $health=Invoke-RestMethod -Uri ('http://127.0.0.1:' + $info.port + '/api/health') -TimeoutSec 1
    if ($health.ok -and $health.version -eq $info.version) {
      $key=(Get-Content -LiteralPath (Join-Path $info.dataDir '.connection-key') -Raw).Trim()
      Invoke-RestMethod -Uri ('http://127.0.0.1:' + $info.port + '/api/stats') -Headers @{Authorization=('Bearer '+$key)} -TimeoutSec 1 | Out-Null
      exit 0
    }
  } catch {}
  Start-Sleep -Milliseconds 300
}
Write-Host ('Plka could not start. Logs: ' + $logDir)
exit 1
