# Q-Desafío

Multiplayer/solo "find the odd one out" puzzle game with 9 game variants.

🌐 **Live**: https://qdesafio.com

## Stack

- **Client**: Angular 19 (standalone components), Socket.IO client, TypeScript
- **Server**: Node.js + Express + Socket.IO
- **Hosting**: AWS Lightsail (Ubuntu 22.04, $3.50/mo)
- **DNS**: AWS Route 53
- **TLS**: Let's Encrypt (Certbot)
- **Process manager**: PM2

## Features

- 30 progressive solo levels with stars (1/2/3 based on score)
- 9 game variants randomized per game: classic, flash, double, reverse, chain, blink, mirror, sudden death, shrink
- Multiplayer rooms (up to 20 players) with shareable 4-letter codes
- Weekly global leaderboard
- 4 languages: English, Spanish, Portuguese, French
- SEO + Google Analytics 4 ready
- Mobile-responsive (320px+)

## Project structure

```
qdesafio/
├── client/          Angular 19 SPA
│   ├── src/app/
│   │   ├── components/    Reusable components (mode-picker, onboarding, etc.)
│   │   ├── pages/         Routed pages (home, solo, room, levels, leaderboard, etc.)
│   │   ├── services/      Singletons (room, leaderboard, seo, analytics, solo-progress)
│   │   ├── shared/        Types and helpers shared across the app
│   │   └── i18n/          Translation dictionary (en/es/pt/fr)
│   ├── public/            Static files (robots.txt, sitemap.xml, manifest)
│   └── angular.json       Angular CLI config
├── server/          Node.js + Socket.IO server
│   └── src/
│       ├── index.ts        Express app + Socket.IO setup
│       ├── room.ts         Room class — game state machine
│       ├── leaderboard.ts  Weekly global leaderboard with auto-rotation
│       ├── shared-types.ts Types shared with client
│       ├── difficulties.ts Difficulty presets
│       └── questions.ts    Question/asset catalogue
└── deploy/          Deployment scripts (setup.sh, deploy.sh, nginx config)
```

## Local development

### Prerequisites

- Node.js 20+
- npm 10+

### Run server

```bash
cd server
npm install
npm run dev    # or: npx ts-node src/index.ts
```

Server listens on `http://localhost:3000`.

### Run client

```bash
cd client
npm install
npm start
```

Client opens at `http://localhost:4200`.

The client connects by default to `http://localhost:3000` in development. In production the server URL comes from `client/src/environments/environment.prod.ts`.

## Production deployment

### First-time server setup (Lightsail)

1. Create an Ubuntu 22.04 instance on AWS Lightsail
2. Open ports 22, 80, 443 in the Lightsail firewall
3. Attach a static IP and point your domain's A records to it (apex `@` and `www`)
4. SSH in and clone this repo:
   ```bash
   git clone https://github.com/YOUR_USER/qdesafio.git
   cd qdesafio
   bash deploy/setup.sh
   ```
   This installs Node.js, PM2, nginx, certbot, builds both apps, and obtains TLS.

### Subsequent deploys

After pushing changes to `main`:

```bash
# Local
git add -A
git commit -m "your message"
git push

# On Lightsail
cd /home/ubuntu/qdesafio
bash deploy/deploy.sh
```

`deploy.sh` does git pull → npm install → ng build → tsc build → pm2 restart → nginx reload.

### Secrets & environment

- The server reads `CLIENT_ORIGIN` (comma-separated allowed origins). In production it's set in PM2 ecosystem config.
- No API keys are required — the leaderboard persists to a JSON file at `server/data/leaderboard.json`.

## Game variants

| Variant      | Description                                      | Bonus  | Solo | Multi |
|--------------|--------------------------------------------------|--------|------|-------|
| Classic      | Find the different image                         | base   | ✅   | ✅    |
| Flash        | Image shown alone 2s, then grid appears          | +30%   | ✅   | ✅    |
| Double       | Two odd images, tap either                       | +15%   | ✅   | ✅    |
| Reverse      | Find the matching one (visually inverted)        | +20%   | ✅   | ✅    |
| Chain        | Combo multiplier x2/x3/x4                        | combo  | ✅   | ✅    |
| Blink        | Odd image flashes, only counts when visible      | +40%   | ✅   | ✅    |
| Mirror       | Odd image is horizontally flipped                | +25%   | ✅   | ✅    |
| Sudden death | One miss = out. Triple points!                   | +200%  | ✅   | ✅    |
| Shrink       | Grid grows each round                            | progressive | ✅ | ❌  |

Every game picks a random variant. In multiplayer the server picks one variant per round (same for all players). Classic has 2x weight to avoid overwhelming new users.

## License

Proprietary — all rights reserved.
