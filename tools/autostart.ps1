param([switch]$Remove)
$ErrorActionPreference='Stop'
$startup=[Environment]::GetFolderPath('Startup')
$shortcutPath=Join-Path $startup 'Plka.lnk'
if($Remove){if(Test-Path $shortcutPath){Remove-Item -LiteralPath $shortcutPath};Write-Host 'Plka auto-start disabled.';exit}
$shell=New-Object -ComObject WScript.Shell
$link=$shell.CreateShortcut($shortcutPath)
$link.TargetPath=(Join-Path $PSHOME 'powershell.exe')
$link.Arguments='-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $PSScriptRoot 'start-background.ps1')+'" -NoOpen'
$link.WorkingDirectory=Split-Path $PSScriptRoot -Parent
$link.WindowStyle=7
$link.Description='Plka local image library'
$link.Save()
Write-Host 'Plka will start in the background when you sign in. Keep the application folder in this location.'
