@echo off
cd /d "%~dp0"

echo ===== Clearing the (corrupted) Electron download cache =====
if exist "%LOCALAPPDATA%\electron\Cache" rmdir /s /q "%LOCALAPPDATA%\electron\Cache"
if exist "%LOCALAPPDATA%\Cache\electron" rmdir /s /q "%LOCALAPPDATA%\Cache\electron"
if exist "%USERPROFILE%\.electron" rmdir /s /q "%USERPROFILE%\.electron"

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
