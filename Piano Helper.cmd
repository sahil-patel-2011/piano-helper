@echo off
rem Double-click to start Piano Helper: builds the app if needed, starts it, opens your browser.
rem Phones on the same Wi-Fi can scan the QR code shown in this window.
title Piano Helper
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules (
  echo First run: installing, this takes a minute...
  call npm install || (pause & exit /b 1)
)
call npm run build:app --silent || (echo Build failed. & pause & exit /b 1)
call npm run piano-helper --silent -- studio --open
pause
