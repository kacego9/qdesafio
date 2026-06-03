import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';

/**
 * Definición de un nivel del modo Solo.
 * Cada nivel sube en dificultad: más celdas, menos tiempo,
 * o más rondas seguidas a superar.
 */
/**
 * Variantes de juego (8 modos):
 * - classic: encuentra la imagen diferente.
 * - double: hay DOS diferentes, debes tocar AMBAS para acertar la ronda.
 * - flash: secuencia de celdas se iluminan en orden, debes tocarlas en el mismo orden (Simon).
 * - count: hay 1, 2 o 3 diferentes (random), debes encontrar todas. Min grid 3x4.
 * - mirror: la imagen única está volteada horizontalmente.
 * - blink: la imagen única cambia de POSICIÓN cada parpadeo (no solo aparece/desaparece).
 * - sudden: una falla te elimina del nivel — debes reintentar desde la ronda 1.
 * - grow: en cada ronda crece el grid Y la cantidad de diferentes (1, 2, 3 max).
 */
export type GameVariant =
  | 'classic'
  | 'double'
  | 'flash'
  | 'count'
  | 'mirror'
  | 'blink'
  | 'sudden'
  | 'grow';

/** Lista canónica de variantes en orden cíclico (para asignar a niveles) */
export const ALL_VARIANTS: GameVariant[] = [
  'classic', 'double', 'flash', 'count', 'mirror', 'blink', 'sudden', 'grow'
];

/** Variantes disponibles en multijugador */
export const MULTIPLAYER_VARIANTS: GameVariant[] = [
  'classic', 'double', 'flash', 'count', 'mirror', 'blink', 'sudden'
];

/** Variantes disponibles en modo solo (todas) */
export const SOLO_VARIANTS: GameVariant[] = [...ALL_VARIANTS];

/**
 * Devuelve la variante asignada a un nivel del modo solo.
 * Asignación cíclica: nivel 1 = classic, nivel 2 = double, ... nivel 9 = classic (más difícil), etc.
 */
export function getLevelVariant(levelId: number): GameVariant {
  const idx = (levelId - 1) % ALL_VARIANTS.length;
  return ALL_VARIANTS[idx];
}

/** Pick random para multijugador (server). Acepta `exclude` para no repetir. */
export function pickRandomVariant(pool: GameVariant[], exclude?: GameVariant): GameVariant {
  const filtered = pool.filter(v => v !== exclude);
  const list = filtered.length > 0 ? filtered : pool;
  // classic con peso doble
  const weighted: GameVariant[] = [];
  for (const v of list) {
    weighted.push(v);
    if (v === 'classic') weighted.push(v);
  }
  return weighted[Math.floor(Math.random() * weighted.length)];
}

export interface SoloLevel {
  id: number;
  /** Etiqueta corta visible al usuario (ej "01", "02"...) */
  label: string;
  /** Tamaño del grid */
  rows: number;
  columns: number;
  /** Tiempo por ronda en segundos */
  timeLimit: number;
  /** Cuántas rondas hay que pasar para terminar el nivel */
  rounds: number;
  /** Puntos base por acierto (antes de bonus por velocidad) */
  pointsBase: number;
  /** Umbrales de estrellas: [1★, 2★, 3★] sobre el score total del nivel */
  starThresholds: [number, number, number];
}

export interface LevelProgress {
  /** Mejor puntaje conseguido */
  bestScore: number;
  /** Estrellas conseguidas (0-3) */
  stars: number;
  /** Cuántas veces se ha completado */
  timesCompleted: number;
}

export interface SoloProgress {
  totalStars: number;
  totalScore: number;
  highestLevelUnlocked: number;
  /** Mapa: levelId → progreso */
  levels: Record<number, LevelProgress>;
  /** Última vez que jugó (timestamp) */
  lastPlayedAt: number;
  /** Streak diario en días (motiva retorno) */
  dailyStreak: number;
  lastDailyDate: string; // ISO date YYYY-MM-DD
}

const STORAGE_KEY = 'qdesafio.solo.progress.v1';

/**
 * Genera la lista de niveles de forma determinista.
 * Cuanto más alto el nivel, más complejo el grid y menos tiempo.
 */
function buildLevels(): SoloLevel[] {
  const levels: SoloLevel[] = [];

  // Tabla escalonada con curva MUY SUAVE (todos los niveles realistamente jugables)
  // Filosofía: el segundo ciclo (9-16) NO debe ser brutalmente más difícil que el primero.
  // Tiempo nunca baja de 10s. Las celdas crecen poco a poco. Las rondas máximo 5.
  const configs: Array<{
    rows: number;
    columns: number;
    timeLimit: number;
    rounds: number;
    pointsBase: number;
  }> = [
    // 1-8: ciclo 1 (introducción a las 8 variantes — muy fácil)
    { rows: 3, columns: 4, timeLimit: 20, rounds: 3, pointsBase: 100 }, // classic
    { rows: 3, columns: 4, timeLimit: 20, rounds: 3, pointsBase: 110 }, // double
    { rows: 3, columns: 4, timeLimit: 20, rounds: 3, pointsBase: 120 }, // flash
    { rows: 3, columns: 4, timeLimit: 20, rounds: 3, pointsBase: 130 }, // count
    { rows: 3, columns: 4, timeLimit: 18, rounds: 3, pointsBase: 140 }, // mirror
    { rows: 3, columns: 4, timeLimit: 18, rounds: 3, pointsBase: 150 }, // blink
    { rows: 3, columns: 4, timeLimit: 18, rounds: 3, pointsBase: 160 }, // sudden
    { rows: 3, columns: 4, timeLimit: 18, rounds: 3, pointsBase: 170 }, // grow
    // 9-16: ciclo 2 (apenas un poco más difícil — grid mismo, tiempo similar)
    { rows: 4, columns: 4, timeLimit: 18, rounds: 3, pointsBase: 200 }, // classic
    { rows: 4, columns: 4, timeLimit: 18, rounds: 3, pointsBase: 210 }, // double
    { rows: 4, columns: 4, timeLimit: 18, rounds: 4, pointsBase: 220 }, // flash
    { rows: 4, columns: 4, timeLimit: 18, rounds: 4, pointsBase: 230 }, // count
    { rows: 4, columns: 4, timeLimit: 17, rounds: 4, pointsBase: 240 }, // mirror
    { rows: 4, columns: 4, timeLimit: 17, rounds: 4, pointsBase: 250 }, // blink
    { rows: 4, columns: 4, timeLimit: 17, rounds: 4, pointsBase: 260 }, // sudden
    { rows: 4, columns: 4, timeLimit: 17, rounds: 4, pointsBase: 270 }, // grow
    // 17-24: ciclo 3 (más difícil pero todavía cómodo)
    { rows: 4, columns: 5, timeLimit: 17, rounds: 4, pointsBase: 320 }, // classic
    { rows: 4, columns: 5, timeLimit: 16, rounds: 4, pointsBase: 340 }, // double
    { rows: 4, columns: 5, timeLimit: 16, rounds: 4, pointsBase: 360 }, // flash
    { rows: 4, columns: 5, timeLimit: 16, rounds: 4, pointsBase: 380 }, // count
    { rows: 5, columns: 5, timeLimit: 15, rounds: 4, pointsBase: 400 }, // mirror
    { rows: 5, columns: 5, timeLimit: 15, rounds: 4, pointsBase: 420 }, // blink
    { rows: 5, columns: 5, timeLimit: 14, rounds: 5, pointsBase: 440 }, // sudden
    { rows: 5, columns: 5, timeLimit: 15, rounds: 5, pointsBase: 460 }, // grow
    // 25-30: ciclo 4 (más complejo, pero siempre jugable)
    { rows: 5, columns: 6, timeLimit: 14, rounds: 4, pointsBase: 520 }, // classic
    { rows: 5, columns: 6, timeLimit: 14, rounds: 4, pointsBase: 560 }, // double
    { rows: 5, columns: 6, timeLimit: 14, rounds: 4, pointsBase: 600 }, // flash
    { rows: 5, columns: 6, timeLimit: 14, rounds: 4, pointsBase: 640 }, // count
    { rows: 6, columns: 6, timeLimit: 13, rounds: 5, pointsBase: 700 }, // mirror
    { rows: 6, columns: 6, timeLimit: 13, rounds: 5, pointsBase: 800 }  // blink (último nivel)
  ];

  configs.forEach((c, i) => {
    const id = i + 1;
    // Score perfecto si responde en mitad del tiempo: rounds * pointsBase * 1.5
    const perfect = c.rounds * c.pointsBase * 1.5;
    levels.push({
      id,
      label: id.toString().padStart(2, '0'),
      rows: c.rows,
      columns: c.columns,
      timeLimit: c.timeLimit,
      rounds: c.rounds,
      pointsBase: c.pointsBase,
      starThresholds: [
        Math.round(perfect * 0.4),  // 1 estrella: 40%
        Math.round(perfect * 0.65), // 2 estrellas: 65%
        Math.round(perfect * 0.9)   // 3 estrellas: 90%
      ]
    });
  });

  return levels;
}

export const SOLO_LEVELS: SoloLevel[] = buildLevels();

@Injectable({ providedIn: 'root' })
export class SoloProgressService {
  private progress: SoloProgress = this.empty();
  private subject = new BehaviorSubject<SoloProgress>(this.progress);
  public progress$ = this.subject.asObservable();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      this.load();
    }
  }

  get current(): SoloProgress {
    return this.progress;
  }

  get levels(): SoloLevel[] {
    return SOLO_LEVELS;
  }

  getLevel(id: number): SoloLevel | undefined {
    return SOLO_LEVELS.find(l => l.id === id);
  }

  isLevelUnlocked(levelId: number): boolean {
    if (levelId <= 1) return true;
    return levelId <= this.progress.highestLevelUnlocked;
  }

  getLevelProgress(levelId: number): LevelProgress {
    return this.progress.levels[levelId] || { bestScore: 0, stars: 0, timesCompleted: 0 };
  }

  /**
   * Calcula estrellas para un nivel dado un puntaje.
   */
  computeStars(level: SoloLevel, score: number): number {
    const [t1, t2, t3] = level.starThresholds;
    if (score >= t3) return 3;
    if (score >= t2) return 2;
    if (score >= t1) return 1;
    return 0;
  }

  /**
   * Guarda el resultado de jugar un nivel. Devuelve el nuevo progreso de ese nivel.
   */
  recordLevelResult(level: SoloLevel, score: number): {
    isNewBest: boolean;
    starsEarned: number;
    starsBefore: number;
    levelProgress: LevelProgress;
    newlyUnlockedLevel?: number;
  } {
    const prev = this.getLevelProgress(level.id);
    const starsBefore = prev.stars;
    const starsNow = this.computeStars(level, score);
    const isNewBest = score > prev.bestScore;
    const newProgress: LevelProgress = {
      bestScore: Math.max(prev.bestScore, score),
      stars: Math.max(prev.stars, starsNow),
      timesCompleted: prev.timesCompleted + 1
    };
    this.progress.levels[level.id] = newProgress;

    // Recalcular total de estrellas y score
    this.progress.totalStars = Object.values(this.progress.levels)
      .reduce((sum, l) => sum + l.stars, 0);
    this.progress.totalScore = Object.values(this.progress.levels)
      .reduce((sum, l) => sum + l.bestScore, 0);

    // Desbloquear siguiente nivel si conseguimos al menos 1 estrella
    let newlyUnlockedLevel: number | undefined;
    if (starsNow >= 1 && level.id + 1 > this.progress.highestLevelUnlocked
        && level.id + 1 <= SOLO_LEVELS.length) {
      this.progress.highestLevelUnlocked = level.id + 1;
      newlyUnlockedLevel = level.id + 1;
    }

    // Streak diario
    this.updateDailyStreak();

    this.progress.lastPlayedAt = Date.now();
    this.persist();

    return {
      isNewBest,
      starsEarned: starsNow,
      starsBefore,
      levelProgress: newProgress,
      newlyUnlockedLevel
    };
  }

  /**
   * Resetea todo el progreso. Solo para "borrar datos" desde ajustes.
   */
  resetAll(): void {
    this.progress = this.empty();
    this.persist();
  }

  // ----------------------------------------------------------------
  //  Internos
  // ----------------------------------------------------------------

  private empty(): SoloProgress {
    return {
      totalStars: 0,
      totalScore: 0,
      highestLevelUnlocked: 1,
      levels: {},
      lastPlayedAt: 0,
      dailyStreak: 0,
      lastDailyDate: ''
    };
  }

  private updateDailyStreak(): void {
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    if (this.progress.lastDailyDate === isoToday) return;
    if (!this.progress.lastDailyDate) {
      this.progress.dailyStreak = 1;
    } else {
      const last = new Date(this.progress.lastDailyDate);
      const diffDays = Math.floor((today.getTime() - last.getTime()) / 86400000);
      if (diffDays === 1) this.progress.dailyStreak += 1;
      else this.progress.dailyStreak = 1;
    }
    this.progress.lastDailyDate = isoToday;
  }

  private persist(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
    } catch {
      // sin espacio o sin permiso → ignoramos
    }
    this.subject.next(this.progress);
  }

  private load(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Validación mínima para no romper si la versión cambia
      if (parsed && typeof parsed === 'object' && parsed.levels) {
        this.progress = {
          ...this.empty(),
          ...parsed,
          levels: parsed.levels || {}
        };
        this.subject.next(this.progress);
      }
    } catch {
      // archivo corrupto → arrancamos limpios
    }
  }
}
