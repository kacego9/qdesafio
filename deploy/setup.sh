#!/bin/bash
# ============================================================
#  Q-Desafío — script de setup inicial en la instancia
# ============================================================
# Ejecutar UNA SOLA VEZ después de clonar el repo en /home/ubuntu/qdesafio
# Uso: bash deploy/setup.sh
# ============================================================

set -e

echo "=========================================="
echo "  🚀 Q-Desafío Initial Setup"
echo "=========================================="

# 1. Sistema base
echo ""
echo "📦 Updating system..."
sudo apt update && sudo apt upgrade -y

echo ""
echo "📦 Installing nginx, git, curl..."
sudo apt install -y nginx git curl

# 2. Node 20
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 20 ]]; then
  echo ""
  echo "📦 Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
else
  echo "✅ Node.js already installed: $(node -v)"
fi

# 3. PM2
if ! command -v pm2 &> /dev/null; then
  echo ""
  echo "📦 Installing PM2..."
  sudo npm install -g pm2
else
  echo "✅ PM2 already installed: $(pm2 -v)"
fi

# 4. Configurar Nginx
echo ""
echo "🔧 Configuring Nginx..."
sudo cp /home/ubuntu/qdesafio/deploy/nginx-qdesafio.conf /etc/nginx/sites-available/qdesafio
sudo ln -sf /etc/nginx/sites-available/qdesafio /etc/nginx/sites-enabled/qdesafio
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

# 5. Build inicial
echo ""
echo "🏗  Building client..."
cd /home/ubuntu/qdesafio/client
npm install --no-audit --no-fund
npm run build -- --configuration production

echo ""
echo "🏗  Building server..."
cd /home/ubuntu/qdesafio/server
npm install --no-audit --no-fund
npm run build

# 6. Iniciar PM2
echo ""
echo "🚀 Starting server with PM2..."
pm2 start dist/index.js --name qdesafio-server
pm2 startup systemd -u ubuntu --hp /home/ubuntu | grep "sudo" | bash || true
pm2 save

# 7. Reload Nginx
echo ""
echo "🔄 Reloading Nginx..."
sudo systemctl reload nginx

echo ""
echo "=========================================="
echo "  ✅ Setup complete!"
echo "=========================================="
echo ""
echo "📋 Next steps:"
echo "  1. Verify DNS propagation:  nslookup qdesafio.com"
echo "  2. Test HTTP:                curl http://qdesafio.com"
echo "  3. Install SSL with Certbot:"
echo "       sudo apt install -y certbot python3-certbot-nginx"
echo "       sudo certbot --nginx -d qdesafio.com -d www.qdesafio.com"
echo ""
echo "💡 For future updates, just run:  bash deploy/deploy.sh"
