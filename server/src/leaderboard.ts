import fs from 'fs';
import path from 'path';

/**
 * Leaderboard global semanal.
 *
 * - Guarda los top 100 jugadores por puntaje agregado de la semana actual.
 * - Cada lunes 00:00 UTC se archiva el leaderboard previo y se empieza uno nuevo.
 * - La persistencia es a un archivo JSON para sobrevivir reinicios del proceso
 *   (suficiente para una instancia. Si escalamos a múltiples nodos, hay que
 *   migrar a Redis o una DB).
 *
 * El archivo vive en LEADERBOARD_FILE (configurable por env var).
 */

export interface LeaderboardEntry {
  /** Identificador estable del cliente (random generado y guardado en localStorage). */
  clientId: string;
  /** Nombre que el jugador eligió mostrar. */
  name: string;
  /** Avatar (emoji o color). */
  avatar: string;
  /** Color de fondo del avatar. */
  color: string;
  /** Puntaje acumulado en la semana. */
  score: number;
  /** Estrellas conseguidas en la semana. */
  stars: number;
  /** Cantidad de niveles completados con al menos 1 estrella. */
  levelsCompleted: number;
  /** Timestamp del último envío. */
  lastSubmitAt: number;
}

interface LeaderboardData {
  /** Lunes 00:00 UTC de la semana en curso (epoch millis). Cuando cambia, archivamos. */
  weekStart: number;
  entries: Record<string, LeaderboardEntry>; // clave = clientId
}

const FILE_PATH = process.env.LEADERBOARD_FILE
  || path.resolve(process.cwd(), 'data', 'leaderboard.json');

const MAX_ENTRIES = 100;
const NAME_MAX = 16;

/**
 * Devuelve el lunes 00:00 UTC de la semana de la fecha dada.
 */
function weekStartOf(date: Date): number {
  const d = new Date(date.getTime());
  const day = d.getUTCDay(); // 0 = domingo
  const diff = (day + 6) % 7; // días desde el lunes
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

class LeaderboardStore {
  private data: LeaderboardData = { weekStart: weekStartOf(new Date()), entries: {} };
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.load();
    this.rotateIfNeeded();
    // Comprueba rotación cada hora
    setInterval(() => this.rotateIfNeeded(), 60 * 60 * 1000);
  }

  /**
   * Submite un resultado (acumula score+stars al jugador identificado por clientId).
   * Si el jugador no existe en el leaderboard, lo crea.
   */
  submit(input: {
    clientId: string;
    name: string;
    avatar: string;
    color: string;
    levelScore: number;
    levelStars: number;
  }): { rank: number; total: number } {
    this.rotateIfNeeded();

    // Sanitización defensiva
    const clientId = String(input.clientId || '').slice(0, 64);
    if (!clientId) return { rank: 0, total: this.size() };
    const name = String(input.name || 'Player').slice(0, NAME_MAX);
    const avatar = String(input.avatar || '🙂').slice(0, 4);
    const color = String(input.color || '#ff006e').slice(0, 16);
    const levelScore = Math.max(0, Math.floor(Number(input.levelScore) || 0));
    const levelStars = Math.max(0, Math.min(3, Math.floor(Number(input.levelStars) || 0)));

    const existing = this.data.entries[clientId];
    if (existing) {
      existing.name = name;
      existing.avatar = avatar;
      existing.color = color;
      existing.score += levelScore;
      existing.stars += levelStars;
      if (levelStars > 0) existing.levelsCompleted += 1;
      existing.lastSubmitAt = Date.now();
    } else {
      this.data.entries[clientId] = {
        clientId,
        name,
        avatar,
        color,
        score: levelScore,
        stars: levelStars,
        levelsCompleted: levelStars > 0 ? 1 : 0,
        lastSubmitAt: Date.now()
      };
    }

    this.trimIfNeeded();
    this.scheduleSave();

    return {
      rank: this.rankOf(clientId),
      total: this.size()
    };
  }

  /**
   * Devuelve los top N jugadores ordenados por score desc.
   */
  top(n = 100): LeaderboardEntry[] {
    return this.sorted().slice(0, n);
  }

  /**
   * Devuelve la posición del jugador (1-based) o 0 si no está.
   */
  rankOf(clientId: string): number {
    const sorted = this.sorted();
    const i = sorted.findIndex(e => e.clientId === clientId);
    return i === -1 ? 0 : i + 1;
  }

  size(): number {
    return Object.keys(this.data.entries).length;
  }

  weekStart(): number {
    return this.data.weekStart;
  }

  // ------------------------------------------------------------
  //  Internos
  // ------------------------------------------------------------
  private sorted(): LeaderboardEntry[] {
    return Object.values(this.data.entries).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.stars - a.stars;
    });
  }

  private trimIfNeeded(): void {
    const all = this.sorted();
    if (all.length <= MAX_ENTRIES) return;
    const survivors = all.slice(0, MAX_ENTRIES);
    const newEntries: Record<string, LeaderboardEntry> = {};
    for (const e of survivors) newEntries[e.clientId] = e;
    this.data.entries = newEntries;
  }

  private rotateIfNeeded(): void {
    const currentWeek = weekStartOf(new Date());
    if (currentWeek > this.data.weekStart) {
      // Empieza una nueva semana: archivar el archivo viejo y empezar de cero
      this.archive();
      this.data = { weekStart: currentWeek, entries: {} };
      this.dirty = true;
      this.scheduleSave();
    }
  }

  private archive(): void {
    try {
      const archivePath = FILE_PATH.replace(
        /\.json$/,
        `.${this.data.weekStart}.json`
      );
      fs.writeFileSync(archivePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('[leaderboard] archive failed', e);
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(FILE_PATH)) {
        const raw = fs.readFileSync(FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.entries) {
          this.data = parsed;
        }
      }
    } catch (e) {
      console.error('[leaderboard] load failed', e);
    }
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (!this.dirty) return;
      this.dirty = false;
      try {
        const dir = path.dirname(FILE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(FILE_PATH, JSON.stringify(this.data), 'utf-8');
      } catch (e) {
        console.error('[leaderboard] save failed', e);
      }
    }, 2000); // debounce 2s
  }
}

export const leaderboard = new LeaderboardStore();
