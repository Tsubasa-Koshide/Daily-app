@echo off
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Installing dependencies, please wait...
  call npm install
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Setting up Electron, please wait...
  call node "node_modules\electron\install.js"
)

echo Starting widget...
call npm start
pause
