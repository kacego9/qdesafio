# Q-Desafío — Resumen de cambios

## 1. Bug del nickname duplicado — RESUELTO

**Causa:** Race condition. El servidor enviaba el callback `room:create` con `{ ok, code }`, pero el evento `room:state` llegaba un instante después. El cliente navegaba a `/room/:code` antes de que el `BehaviorSubject` tuviera estado, así que `RoomComponent.ngOnInit` lo veía vacío y redirigía a `/join/:code`. El usuario volvía a meter el apodo y el server creaba un segundo jugador.

**Solución:**
- **Server** (`server/src/index.ts`): los handlers `room:create` y `room:join` ahora limpian cualquier sala previa del mismo socket antes de crear/unirse, y devuelven `state` directamente en el callback. `room:join` ahora es idempotente: si el mismo socket ya está en la sala, no se duplica.
- **Cliente** (`room.service.ts`): aplica `res.state` al `BehaviorSubject` *antes* de resolver la promesa, así RoomComponent ya tiene estado cuando carga.
- **RoomComponent**: añade un grace period de 1.5 s esperando estado antes de redirigir a `/join`. Evita falsos positivos por hidratación SSR.
- **Tipos compartidos**: `CreateRoomResponse` / `JoinRoomResponse` ahora tienen `state?: RoomState`.

## 2. Modo Solo + Niveles + localStorage — NUEVO

**Archivos nuevos:**
- `client/src/app/services/solo-progress.service.ts` — Define **30 niveles** (de 3×4 a 18×20, tiempo 20 s → 6 s, 3 → 10 rondas, 100 → 1000 puntos base). Gestiona `SoloProgress` (estrellas totales, score, nivel más alto desbloqueado, racha diaria). Estrellas: ≥40 % = ★, ≥65 % = ★★, ≥90 % = ★★★. Persistencia en localStorage con clave `qdesafio.solo.progress.v1`.
- `client/src/app/shared/solo-questions.ts` — Catálogo cliente-side de las 16 parejas de imágenes (`assets/find-odd/img/{1-16}_{0,1}.webp`), con `pickSoloQuestions(count)` que mezcla evitando repeticiones consecutivas.
- `client/src/app/pages/solo/solo.component.{ts,html,css}` — Gameplay solo completo. Fases countdown → playing → roundResult → final. Toda la lógica vive en cliente (no necesita servidor). Pantalla final con animación de estrellas, badge de récord, banner de nivel desbloqueado, botones de retry/next/all-levels.
- `client/src/app/pages/levels/levels.component.{ts,html,css}` — Selector de niveles. Muestra los 30 niveles, estados locked/unlocked/completed, estrellas conseguidas, mejor puntaje, resumen total y barra de progreso global.

**Rutas nuevas** en `app.routes.ts`:
- `/levels` → LevelsComponent
- `/solo/:id` → SoloComponent
- `/solo` → redirect a `/levels`

**localStorage:**
- `qdesafio.solo.progress.v1` — Progreso solo
- `qdesafio.language` — Idioma seleccionado (ya existía)

## 3. Rediseño Home para retención — NUEVO

`pages/home/` reescrito de cero. Nuevas secciones:

1. **Hero con CTA "mega"** — Si el usuario no jugó nada, "PLAY NOW · 30+ levels". Si ya tiene progreso, "CONTINUE · Level X · ⭐ N". Botón secundario para ver todos los niveles.
2. **Hooks de confianza** — chips: rápido, gratis, móvil, sin instalación.
3. **How it works** — 3 pasos con números, emoji y descripción.
4. **Game modes** — 3 cards: Solo (recomendado, destacado), Crear sala, Unirse con código.
5. **Benefits** — 4 beneficios (foco visual, reflejos, todas las edades, competir).
6. **FAQ** — 5 preguntas en `<details>` colapsables (excelente para snippets de Google).
7. **Final CTA** — segundo botón mega antes del footer.
8. **Footer** discreto.

Diseño: Poppins + degradados rosa/cian/morado, glassmorphism (`backdrop-filter: blur`), animaciones de entrada por sección, emojis flotantes decorativos en hero.

## 4. SEO — NUEVO

**`services/seo.service.ts`** — Servicio centralizado que:
- Actualiza `<title>`, meta description, OG tags (og:title, og:description, og:type, og:image, og:site_name), Twitter card, canonical link.
- Reactiva `<html lang>` cuando cambia el idioma.
- Inyecta JSON-LD Schema.org `Game` con la metadata correcta.

**`index.html`** reescrito con:
- Title + meta description + keywords + author + theme-color
- `robots` y `googlebot` con `max-image-preview:large`, `max-snippet:-1`
- `<link rel="canonical">`
- **hreflang** para en/es/pt/fr + `x-default`
- Open Graph completo (incluyendo `og:locale:alternate` para los 4 idiomas)
- Twitter card summary_large_image
- Apple touch icon (`/assets/icon-180.png` — añadir tu propio archivo)
- OG image (`/assets/og-image.png` — añadir tu propio archivo)
- JSON-LD `Game` schema inline
- `<noscript>` con contenido legible para crawlers

**`public/robots.txt`** — Permite todo, bloquea `/room/` y `/join/` (no aportan SEO).

**`public/sitemap.xml`** — URLs principales con hreflang alternates.

Cada página usa `seo.apply()` con sus propias keys de traducción:
- Home: `seo.home.title` / `seo.home.desc`
- Levels: `seo.levels.title` / `seo.levels.desc`
- Solo: `seo.solo.title` / `seo.solo.desc`

## 5. Multilingüe — VERIFICADO

`client/src/app/i18n/translations.ts` reescrito completo. Las 4 lenguas (en, es, pt, fr) tienen **156 claves cada una, sin diferencias**. La verificación automática confirma cobertura idéntica.

Claves nuevas añadidas:
- `home.*` (badge, title1/2, subtitle, playNow/Sub, continue/Sub, allLevels, hook.*, how.*, modes.*, benefits.*, faq.*, finalCta.*, footer)
- `solo.*` (level, levelOf, roundOf, score, exit, levelComplete, finalScore, newBest, correct, wrong, unlocked, nextLevel, retry, allLevels)
- `levels.*` (tag, title, totalStars, totalScore, dailyStreak, completed)
- `seo.{home,solo,levels}.{title,desc}`

Todas las claves antiguas (identity, join, lobby, difficulty, countdown, playing, round, final, error, common) se preservan.

## 6. Verificación de build

- `npm install` + `ng build --configuration production` → ✅ compila limpio
- `tsc --noEmit` en server → ✅ tipos correctos
- Bundle inicial: 86 KB transferidos (lazy chunks por ruta)
- Único warning: `room.component.css` excede el budget en 1.3 KB (archivo preexistente, no bloqueante)

## Items que tú deberías añadir tú mismo

1. **`/client/src/assets/og-image.png`** — Imagen 1200×630 para previews de redes sociales.
2. **`/client/src/assets/icon-180.png`** — Apple touch icon.
3. **`siteUrl`** en `seo.service.ts` — Pon tu dominio real en producción (ej: `https://qdesafio.com`).
4. **URLs absolutas en sitemap.xml y robots.txt** — Reemplaza `/sitemap.xml` por `https://tudominio.com/sitemap.xml`.
5. Considera **prerender / SSG** de `/`, `/levels` y `/home` para que los crawlers vean el HTML servido (Angular soporta esto vía `@angular/ssr`).

## Cómo correr

```bash
# Cliente
cd client && npm install && npm start
# Servidor
cd server && npm install && npm run dev
```

## 7. Google Analytics 4 — INTEGRADO

**Measurement ID configurado:** `G-DTE3JBZS7D`

**Archivos nuevos / modificados:**
- `client/src/app/services/analytics.service.ts` — Servicio que se conecta al `gtag` global, trackea cambios de ruta automáticamente vía `Router.events`, y expone `event(name, params)` para eventos custom. Es seguro en SSR (no toca `window` si no es browser) y no falla si un adblocker bloquea GA.
- `client/src/index.html` — Snippet de `gtag.js` con `send_page_view: false` (porque la SPA trackea las navegaciones manualmente desde el servicio).
- `client/src/app/app.component.ts` — Llama `analytics.init()` al arrancar.

**Eventos custom ya cableados:**
- `cta_click` — Cada botón del home (play_solo, all_levels, create_room, join_room, continue), con `has_progress` y `level_id` cuando aplica.
- `level_start` — Al entrar a un nivel solo, con dimensiones del grid, tiempo y rondas.
- `level_complete` — Al terminar un nivel, con score, estrellas, aciertos, fallos, si es nuevo récord, y nivel desbloqueado.
- `room_created` / `room_create_failed` — Al crear sala multi.
- `room_joined` / `room_join_failed` — Al unirse a sala.
- `game_start` — Al iniciar la partida desde el lobby.

**Para verificar que llegan los datos:**
1. Abre DevTools → Network → filtra por `collect`. Cada navegación dispara una petición a `google-analytics.com/g/collect`.
2. En GA4 → Reports → Realtime, deberías verte como usuario activo en menos de 30 s.
3. Para ver eventos custom: GA4 → Configure → Events. Tardan unas horas en agregarse al panel principal pero en Realtime aparecen al instante.

**Si quieres cambiar el ID** edita `analytics.service.ts` (la constante `measurementId`) y los dos lugares en `index.html` (el `src` del script y la llamada a `gtag('config', ...)`).

**GDPR / cookies:** Si vas a tener tráfico europeo, técnicamente necesitas consentimiento antes de cargar GA. La solución más limpia es cargar el snippet condicional tras aceptar un banner. Si lo necesitas, dímelo y lo añado.
