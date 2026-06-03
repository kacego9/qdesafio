import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { ClientToServerEvents, ServerToClientEvents } from './shared-types';
import { Room } from './room';
import { leaderboard } from './leaderboard';

const PORT = Number(process.env.PORT) || 3000;

/**
 * Orígenes permitidos para CORS.
 * - En producción: leemos de la env var CLIENT_ORIGIN (separados por coma) si existe,
 *   o default a los dominios oficiales.
 * - En desarrollo: si pasas '*' permite cualquiera (útil para testing).
 */
const DEFAULT_ORIGINS = [
  'https://qdesafio.com',
  'https://www.qdesafio.com',
  'http://localhost:4200'
];
const envOrigins = process.env.CLIENT_ORIGIN;
const CLIENT_ORIGIN: string | string[] =
  envOrigins === '*'
    ? '*'
    : envOrigins
      ? envOrigins.split(',').map(s => s.trim()).filter(Boolean)
      : DEFAULT_ORIGINS;

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: '8kb' }));

// Health check (útil para Render/Railway)
app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, uptime: process.uptime() });
});

// ============================================================
//  LEADERBOARD endpoints
// ============================================================
app.get('/api/leaderboard', (_req, res) => {
  res.json({
    weekStart: leaderboard.weekStart(),
    entries: leaderboard.top(100),
    total: leaderboard.size()
  });
});

app.post('/api/leaderboard/submit', (req, res) => {
  try {
    const body = req.body || {};
    const result = leaderboard.submit({
      clientId: body.clientId,
      name: body.name,
      avatar: body.avatar,
      color: body.color,
      levelScore: body.levelScore,
      levelStars: body.levelStars
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[leaderboard/submit] error', e);
    res.status(500).json({ ok: false, error: 'INTERNAL' });
  }
});

app.get('/api/leaderboard/me/:clientId', (req, res) => {
  const cid = String(req.params.clientId || '').slice(0, 64);
  res.json({
    rank: leaderboard.rankOf(cid),
    total: leaderboard.size()
  });
});

// Home page simple
app.get('/', (_req, res) => {
  res.type('text/plain').send('Q-Desafío Server OK · Socket.IO listo');
});

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
  // Tiempo que se permite a un jugador reconectarse antes de marcarlo como muerto
  pingTimeout: 60000
});

// ============================================================
//  REGISTRO DE SALAS
// ============================================================
const rooms = new Map<string, Room>();

function generateRoomCode(): string {
  // Códigos de 4 letras (excluyendo caracteres confusos)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code: string;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

/** Encuentra la sala en la que está un socket dado */
function findRoomBySocket(socketId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.hasPlayer(socketId)) return room;
  }
  return undefined;
}

// ============================================================
//  HANDLERS DE SOCKET.IO
// ============================================================

io.on('connection', (socket) => {
  console.log(`[+] Socket conectado: ${socket.id}`);

  // -------- Crear sala --------
  socket.on('room:create', ({ playerName, avatar }, cb) => {
    // Si el socket ya estaba en una sala anterior, sacarlo limpiamente
    // (evita el bug del "doble nickname" si el cliente reusa la conexión).
    const previousRoom = findRoomBySocket(socket.id);
    if (previousRoom) {
      console.log(`[room] socket ${socket.id} ya estaba en ${previousRoom.code}, limpiando antes de crear`);
      previousRoom.removePlayer(socket.id);
      socket.leave(previousRoom.code);
      if (previousRoom.players.length === 0) {
        previousRoom.destroy();
        rooms.delete(previousRoom.code);
      } else {
        previousRoom.broadcastState();
      }
    }

    const name = (playerName || '').trim();
    if (name.length < 1 || name.length > 16) {
      return cb({ ok: false, error: 'INVALID_NAME' });
    }
    const code = generateRoomCode();
    const room = new Room(code, socket.id, io);
    room.addPlayer(socket.id, name, avatar);
    rooms.set(code, room);
    socket.join(code);
    console.log(`[room] Creada sala ${code} por ${name} (${socket.id})`);
    // IMPORTANTE: incluimos `state` en la respuesta para que el cliente
    // tenga el estado antes de navegar al lobby (evita la condición de
    // carrera en la que se redirigía a /join porque state aún no llegaba).
    cb({ ok: true, code, state: room.getState() });
    room.broadcastState();
  });

  // -------- Unirse a sala --------
  socket.on('room:join', ({ code, playerName, avatar }, cb) => {
    const normalizedCode = (code || '').trim().toUpperCase();
    const room = rooms.get(normalizedCode);
    if (!room) {
      return cb({ ok: false, error: 'ROOM_NOT_FOUND' });
    }
    if (room.phase !== 'lobby') {
      return cb({ ok: false, error: 'GAME_ALREADY_STARTED' });
    }
    if (room.players.length >= 20) {
      return cb({ ok: false, error: 'ROOM_FULL' });
    }
    const name = (playerName || '').trim();
    if (name.length < 1 || name.length > 16) {
      return cb({ ok: false, error: 'INVALID_NAME' });
    }
    if (room.isNameTaken(name)) {
      return cb({ ok: false, error: 'NAME_TAKEN' });
    }

    // Idempotencia: si este mismo socket ya está en la sala, no agregar otra vez
    if (room.hasPlayer(socket.id)) {
      console.log(`[room] socket ${socket.id} ya estaba en ${normalizedCode}, no se duplica`);
      return cb({ ok: true, state: room.getState() });
    }

    // Si el socket estaba en otra sala distinta, removerlo de ahí
    const previousRoom = findRoomBySocket(socket.id);
    if (previousRoom && previousRoom.code !== normalizedCode) {
      previousRoom.removePlayer(socket.id);
      socket.leave(previousRoom.code);
      if (previousRoom.players.length === 0) {
        previousRoom.destroy();
        rooms.delete(previousRoom.code);
      } else {
        previousRoom.broadcastState();
      }
    }

    room.addPlayer(socket.id, name, avatar);
    socket.join(normalizedCode);
    console.log(`[room] ${name} se unió a ${normalizedCode}`);
    cb({ ok: true, state: room.getState() });
    room.broadcastState();
  });

  // -------- Actualizar settings (solo host) --------
  socket.on('room:updateSettings', (settings) => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.isHost(socket.id)) return;
    room.updateSettings(settings);
  });

  // -------- Iniciar juego (solo host) --------
  socket.on('room:start', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.isHost(socket.id)) return;
    console.log(`[room] ${room.code} inicia con ${room.players.length} jugadores`);
    room.startGame();
  });

  // -------- Responder a la ronda --------
  socket.on('round:answer', ({ selectedPosition }) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    room.submitAnswer(socket.id, selectedPosition);
  });

  // -------- Confirmar respuesta (modos count/double) --------
  socket.on('round:confirmAnswer', () => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    room.confirmAnswer(socket.id);
  });

  // -------- Avanzar a la siguiente ronda (solo host) --------
  socket.on('round:next', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.isHost(socket.id)) return;
    room.nextRound();
  });

  // -------- Volver a jugar (solo host) --------
  socket.on('room:playAgain', () => {
    const room = findRoomBySocket(socket.id);
    if (!room || !room.isHost(socket.id)) return;
    room.playAgain();
  });

  // -------- Salir de la sala --------
  socket.on('room:leave', () => {
    handleDisconnect(socket.id, true);
  });

  // -------- Desconexión --------
  socket.on('disconnect', (reason) => {
    console.log(`[-] Socket desconectado: ${socket.id} (${reason})`);
    handleDisconnect(socket.id, false);
  });
});

/**
 * Maneja desconexión/salida de un socket.
 * Si era el último jugador, destruye la sala.
 */
function handleDisconnect(socketId: string, deliberate: boolean): void {
  const room = findRoomBySocket(socketId);
  if (!room) return;

  if (deliberate || room.phase === 'lobby' || room.phase === 'final') {
    // Lo removemos por completo
    room.removePlayer(socketId);
  } else {
    // Durante el juego, lo marcamos como desconectado (podría reconectarse)
    room.markDisconnected(socketId);
  }

  // Si la sala quedó vacía, destruirla
  if (room.players.length === 0) {
    console.log(`[room] ${room.code} vacía, destruyendo`);
    room.destroy();
    rooms.delete(room.code);
  } else {
    room.broadcastState();
  }
}

// ============================================================
//  LIMPIEZA PERIÓDICA DE SALAS ABANDONADAS
// ============================================================
// Cada 5 minutos: elimina salas sin actividad hace > 1 hora
setInterval(() => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActivity > ONE_HOUR) {
      console.log(`[cleanup] Sala ${code} inactiva, eliminando`);
      room.destroy();
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

// ============================================================
server.listen(PORT, () => {
  console.log(`🚀 Q-Desafío Server corriendo en puerto ${PORT}`);
  console.log(`   CORS origin: ${CLIENT_ORIGIN}`);
});
