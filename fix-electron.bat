@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-electron.ps1"
echo.
if exist "%~dp0node_modules\electron\dist\electron.exe" (
  echo Electron is ready. Now run start-widget.bat to launch the widget.
) else (
  echo Setup failed. Please copy all the messages above.
)
pause
