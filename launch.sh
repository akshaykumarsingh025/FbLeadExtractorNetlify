#!/bin/bash
cd "$(dirname "$0")"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║         LeadSync - Development Launcher      ║"
echo "  ║  Facebook Lead Ads <-> Google Sheets         ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  ❌ Node.js is not installed."
    echo "     Install via: brew install node"
    echo "     Or download from https://nodejs.org"
    exit 1
fi
echo "  ✅ Node.js $(node -v)"

# Install root dependencies if needed
if [ ! -d "node_modules/express" ]; then
    echo "  📦 Installing root dependencies..."
    npm install
fi

# Install frontend dependencies if needed
if [ ! -d "frontend/node_modules" ]; then
    echo "  📦 Installing frontend dependencies..."
    (cd frontend && npm install)
fi

# Build frontend
echo "  🔨 Building frontend..."
(cd frontend && npx vite build)
if [ $? -ne 0 ]; then
    echo "  ❌ Frontend build failed!"
    exit 1
fi

# Copy .env.example to .env if no .env exists
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  ⚠️  Created .env — edit with your API keys!"
    echo ""
    echo "  Edit .env and re-run this script."
    exit 0
fi

echo ""
echo "  🚀 Starting LeadSync..."
echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │  Open: http://localhost:5173                │"
echo "  │  Or:   http://127.0.0.1:5173               │"
echo "  │                                             │"
echo "  │  Press Ctrl+C to stop                       │"
echo "  └─────────────────────────────────────────────┘"
echo ""

# Open browser (macOS)
if command -v open &> /dev/null; then
    open http://localhost:5173
fi

node scripts/unified-server.mjs
