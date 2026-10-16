$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$dialog=New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description='Select the original data folder containing library.sqlite'
if($dialog.ShowDialog() -eq 'OK'){
  $appRoot=Split-Path $PSScriptRoot -Parent
  & (Join-Path $appRoot 'runtime\node.exe') (Join-Path $PSScriptRoot 'runtime-info.mjs') --use-data $dialog.SelectedPath
  if($LASTEXITCODE -ne 0){throw 'Library selection failed.'}
  Write-Host 'Original library connected. Stop any previous service, then start Plka.'
}
