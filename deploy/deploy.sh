#!/bin/bash
# ============================================================
#  Q-Desafío — script de actualización en la instancia
# ============================================================
# Uso: ./deploy.sh
# Hace: git pull → build cliente → build server → restart pm2
# Asume que estás en la instancia AWS Lightsail dentro de /home/ubuntu/qdesafio
# ============================================================

set -e  # exit on error

PROJECT_DIR="/home/ubuntu/qdesafio"
CLIENT_DIR="$PROJECT_DIR/client"
SERVER_DIR="$PROJECT_DIR/server"

echo "=========================================="
echo "  🚀 Q-Desafío Deploy"
echo "=========================================="

cd "$PROJECT_DIR"

echo ""
echo "📥 Pulling latest changes from git..."
git pull

echo ""
echo "📦 Installing client dependencies..."
cd "$CLIENT_DIR"
npm install --no-audit --no-fund

echo ""
echo "🏗  Building Angular client (production)..."
npm run build -- --configuration production

echo ""
echo "📦 Installing server dependencies..."
cd "$SERVER_DIR"
npm install --no-audit --no-fund

echo ""
echo "🏗  Building server (TypeScript)..."
npm run build

echo ""
echo "🔄 Restarting PM2 server..."
pm2 restart qdesafio-server || pm2 start dist/index.js --name qdesafio-server
pm2 save

echo ""
echo "🔄 Reloading Nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "=========================================="
echo "  ✅ Deploy complete!"
echo "  Visit: https://qdesafio.com"
echo "=========================================="
echo ""
echo "Quick checks:"
echo "  pm2 status           — server status"
echo "  pm2 logs             — live logs"
echo "  curl localhost:3000/health  — health check"
