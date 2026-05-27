@echo off
cd /d "%~dp0"
if not exist "node_modules\" (
  echo Installing dependencies for the first time...
  call npm install
)
call npm start
