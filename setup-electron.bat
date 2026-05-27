@echo off
cd /d "%~dp0"

echo ===== Electron-related environment variables =====
set ELECTRON
echo.
echo ===== npm settings =====
call npm config get ELECTRON_SKIP_BINARY_DOWNLOAD
call npm config get electron_mirror
call npm config get proxy
call npm config get https-proxy
echo.
echo ===== Removing old Electron and reinstalling (with progress) =====
if exist "node_modules\electron" rmdir /s /q "node_modules\electron"
set ELECTRON_SKIP_BINARY_DOWNLOAD=
set DEBUG=@electron/get:*
call npm install electron@33 --foreground-scripts
echo.
echo ===== Result =====
if exist "node_modules\electron\dist\electron.exe" (
  echo SUCCESS: Electron binary is installed.
) else (
  echo FAILED: Electron binary is still missing.
)
pause
