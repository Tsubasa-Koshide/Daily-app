@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0autostart.ps1" -Action uninstall
echo.
pause
