@echo off
title LeadSync - Facebook Leads to Google Sheets
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║         LeadSync - Development Launcher      ║
echo  ║  Facebook Lead Ads ^<-^> Google Sheets         ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ Node.js is not installed. Download from https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo  ✅ Node.js %%v

:: Install root dependencies if needed
if not exist "node_modules\express" (
    echo  📦 Installing root dependencies...
    call npm install
)

:: Install frontend dependencies if needed
if not exist "frontend\node_modules" (
    echo  📦 Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

:: Build frontend
echo  🔨 Building frontend...
cd frontend
call npx vite build
if %errorlevel% neq 0 (
    echo  ❌ Frontend build failed!
    cd ..
    pause
    exit /b 1
)
cd ..

:: Copy .env.example to .env if no .env exists
if not exist ".env" (
    copy .env.example .env >nul
    echo  ⚠️  Created .env — edit with your API keys!
    echo.
    echo  Edit .env and re-run this script.
    pause
    exit /b 0
)

echo.
echo  🚀 Starting LeadSync...
echo.
echo  ┌─────────────────────────────────────────────┐
echo  │  Open: http://localhost:5173                │
echo  │  Or:   http://127.0.0.1:5173               │
echo  │                                             │
echo  │  Press Ctrl+C to stop                       │
echo  └─────────────────────────────────────────────┘
echo.

start http://localhost:5173
node scripts/unified-server.mjs

pause
