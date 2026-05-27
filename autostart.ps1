param([string]$Action = 'install')
$ErrorActionPreference = 'Stop'

$projDir = $PSScriptRoot
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'Daily Widget.lnk'

if ($Action -eq 'uninstall') {
  if (Test-Path $lnk) {
    Remove-Item $lnk -Force
    Write-Host 'Auto-start disabled. The widget will no longer open on sign-in.'
  } else {
    Write-Host 'Auto-start was not enabled.'
  }
  return
}

$electron = Join-Path $projDir 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) {
  Write-Host 'Electron is not installed yet.'
  Write-Host 'Please run start-widget.bat (or fix-electron.bat) once first, then try again.'
  exit 1
}

$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = $electron
$s.Arguments = '"' + $projDir + '"'
$s.WorkingDirectory = $projDir
$s.WindowStyle = 1
$s.Description = 'Daily Widget'
$s.Save()

Write-Host 'Auto-start enabled. The widget will open automatically when you sign in to Windows.'
Write-Host "Shortcut created at: $lnk"
