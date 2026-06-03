# 🚀 Despliegue de Q-Desafío en AWS Lightsail

Esta guía describe el despliegue desde cero. Si ya está desplegado y solo quieres **actualizar el código**, salta a la sección "Actualizar la app".

---

## 📋 Pre-requisitos

- ✅ Instancia Lightsail Ubuntu corriendo (mínimo $3.50/mes)
- ✅ IP estática asignada (en el ejemplo: `98.88.142.8`)
- ✅ Dominio `qdesafio.com` con registros DNS apuntando al IP estático:
  - `A` `@` → `98.88.142.8`
  - `A` `www` → `98.88.142.8`
- ✅ Firewall de Lightsail con puertos 22, 80, 443 abiertos

---

## 🆕 Despliegue inicial (primera vez)

### 1. Subir el código a GitHub

Desde tu máquina local, en la carpeta del proyecto:

```bash
git init
git add .
git commit -m "initial deploy"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/qdesafio.git
git push -u origin main
```

> **Nota:** GitHub no acepta password. Genera un Personal Access Token en
> https://github.com/settings/tokens (scope `repo`) y úsalo como password.

### 2. Conectarse a la instancia por SSH

Abre la consola SSH desde el panel de Lightsail (botón `>_` al lado del nombre de la instancia).

### 3. Clonar el repo

```bash
cd /home/ubuntu
git clone https://github.com/TU-USUARIO/qdesafio.git
```

### 4. Ejecutar el script de setup

Este script instala Node, Nginx, PM2, configura todo y arranca el servidor:

```bash
cd /home/ubuntu/qdesafio
bash deploy/setup.sh
```

Tarda unos 5 minutos. Cuando termine verás "✅ Setup complete!".

### 5. Verificar que carga por HTTP

```bash
curl -I http://qdesafio.com
```

Debe responder `HTTP/1.1 200 OK`. También puedes abrir `http://qdesafio.com` en el navegador.

> ⚠️ Socket.IO **aún no funciona** porque el cliente apunta a `https://`. Eso se arregla en el siguiente paso.

### 6. Instalar HTTPS (Let's Encrypt)

**Antes de este paso**, asegúrate de que el DNS ya propagó:

```bash
nslookup qdesafio.com
# Debe devolver 98.88.142.8
```

Luego instala Certbot y obtén el certificado:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d qdesafio.com -d www.qdesafio.com
```

Te preguntará:
- Email → el tuyo
- Términos → `A` (accept)
- Newsletter → `N`
- Redirect → `2` (forzar HTTPS)

✅ **Ya estás en `https://qdesafio.com`**.

---

## 🔄 Actualizar la app (después del deploy inicial)

Cuando hagas cambios en local:

### 1. En tu máquina local

```bash
git add .
git commit -m "Descripción del cambio"
git push
```

### 2. En la instancia (vía SSH)

```bash
cd /home/ubuntu/qdesafio
bash deploy/deploy.sh
```

El script hace `git pull`, rebuilda cliente y server, reinicia PM2 y recarga Nginx. Tarda 1-2 minutos.

---

## 🛠 Comandos útiles

### PM2 (servidor Node)

```bash
pm2 status                  # ver estado del server
pm2 logs                    # ver logs en vivo
pm2 logs qdesafio-server    # logs solo del server
pm2 restart qdesafio-server # reiniciar
pm2 monit                   # dashboard de uso
```

### Nginx

```bash
sudo nginx -t                       # validar config
sudo systemctl reload nginx         # recargar sin downtime
sudo systemctl restart nginx        # reiniciar
sudo tail -f /var/log/nginx/error.log  # ver errores
sudo tail -f /var/log/nginx/access.log # ver tráfico
```

### Health check

```bash
curl http://localhost:3000/health
# {"ok":true,"rooms":N,"uptime":...}
```

### Ver puertos en escucha

```bash
sudo ss -tlnp
```

---

## 🐛 Troubleshooting

### "502 Bad Gateway" en el navegador

El server Node no está corriendo o no responde en el puerto 3000.

```bash
pm2 status
pm2 logs qdesafio-server --lines 50
```

Si el server se cayó, reinícialo:
```bash
pm2 restart qdesafio-server
```

### Socket.IO no se conecta (chat queda en "Connecting...")

- Verifica que `serverUrl` en `client/src/environments/environment.prod.ts` apunte a tu dominio real
- Verifica el bloque `location /socket.io/` en `/etc/nginx/sites-available/qdesafio`
- Ve los logs del server: `pm2 logs qdesafio-server`

### El SSL falla en Certbot

- DNS no ha propagado todavía. Verifica con `nslookup qdesafio.com`.
- Puerto 80 cerrado en el firewall de Lightsail.
- Otro servicio escuchando en puerto 80 (debería ser solo Nginx): `sudo ss -tlnp | grep :80`

### Cambios en el código no aparecen en el navegador

- ¿Hiciste rebuild del cliente? `bash deploy/deploy.sh`
- Cache del navegador: hard refresh (Ctrl+Shift+R) o navegación incógnita
- Cache de CloudFront/CDN si usas alguno

### Mucha memoria consumida

La instancia de $3.50 tiene solo 512 MB RAM. Si Node + Nginx + apt updates corriendo simultáneamente saturan, considera:
- Subir a plan de $5 (1 GB RAM)
- Crear swap: `sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
  - Persistir: añade `/swapfile none swap sw 0 0` a `/etc/fstab`

---

## 📊 Monitoreo

### Google Analytics

Tracking ID: `G-DTE3JBZS7D` (configurado en `index.html` y `analytics.service.ts`).

Eventos custom enviados:
- `cta_click` (botones del home)
- `level_start`, `level_complete` (modo solo)
- `room_created`, `room_joined`, `room_create_failed`, `room_join_failed`
- `game_start`

Verlos en: GA4 → Reports → Realtime

### Logs del server

```bash
pm2 logs qdesafio-server --lines 100
```

### Uso de recursos del sistema

```bash
htop                # CPU/RAM (instala con sudo apt install htop)
df -h               # uso de disco
free -h             # memoria
```

---

## 💰 Costos estimados (USD/mes)

| Recurso | Costo |
|---|---|
| Lightsail $3.50 plan | $3.50 |
| Lightsail static IP (atado a instancia) | $0 |
| Route 53 hosted zone | $0.50 |
| Dominio qdesafio.com (Hostinger, anual) | ~$1/mes |
| Let's Encrypt SSL | $0 |
| Google Analytics 4 | $0 |
| **TOTAL** | **~$5/mes** |

---

## 🔒 Seguridad recomendada

1. **No subas a Git**: archivos `.env`, claves `.pem`, ni `node_modules`. Ya está en `.gitignore`.
2. **Firewall de Lightsail**: cierra puerto 22 (SSH) a tu IP solo, no al mundo.
3. **Actualizaciones de seguridad**: `sudo unattended-upgrades` (paquete `unattended-upgrades`).
4. **Backups**: snapshots automáticos en Lightsail ($0.10/GB/mes, recomendado).

---

## 📞 Contacto y soporte

Issues con el código: [github.com/TU-USUARIO/qdesafio/issues](https://github.com/TU-USUARIO/qdesafio/issues)
