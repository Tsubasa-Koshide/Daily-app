$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$version = 'v33.4.11'
$zip = Join-Path $env:TEMP 'electron-download.zip'
$electronDir = Join-Path $PSScriptRoot 'node_modules\electron'
$dist = Join-Path $electronDir 'dist'

$urls = @(
  "https://github.com/electron/electron/releases/download/$version/electron-$version-win32-x64.zip",
  "https://registry.npmmirror.com/-/binary/electron/33.4.11/electron-v33.4.11-win32-x64.zip"
)

$ok = $false
foreach ($u in $urls) {
  try {
    Write-Host "Downloading Electron (~100 MB) from:"
    Write-Host "  $u"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Invoke-WebRequest -Uri $u -OutFile $zip
    $sizeMB = [math]::Round((Get-Item $zip).Length / 1MB)
    Write-Host "  Downloaded $sizeMB MB."
    if ($sizeMB -gt 50) { $ok = $true; break }
    Write-Host "  File too small - trying next source."
  } catch {
    Write-Host "  Failed: $($_.Exception.Message)"
  }
}

if (-not $ok) {
  Write-Host ""
  Write-Host "FAILED: could not download Electron from any source."
  Write-Host "Your network (proxy / antivirus / firewall) may be blocking the download."
  exit 1
}

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Force -Path $electronDir | Out-Null
New-Item -ItemType Directory -Force -Path $dist | Out-Null

Write-Host "Extracting..."
Expand-Archive -Path $zip -DestinationPath $dist -Force
Set-Content -Path (Join-Path $electronDir 'path.txt') -Value 'electron.exe' -NoNewline
Remove-Item $zip -Force -ErrorAction SilentlyContinue

if (Test-Path (Join-Path $dist 'electron.exe')) {
  Write-Host ""
  Write-Host "SUCCESS: Electron is installed."
} else {
  Write-Host ""
  Write-Host "FAILED: electron.exe not found after extraction."
  exit 1
}
