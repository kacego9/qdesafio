import { Server } from 'socket.io';
import {
  ClientToServerEvents,
  GamePhase,
  GameVariant,
  Player,
  RoomSettings,
  RoomState,
  RoundData,
  ServerToClientEvents
} from './shared-types';
import { AVATARS, COLORS, DIFFICULTIES, getDifficulty } from './difficulties';
import { pickQuestions, QuestionAsset } from './questions';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

/** Pool de variantes para multijugador. Excluye 'grow'. */
const MULTI_VARIANTS_BASE: GameVariant[] = [
  'classic', 'double', 'flash', 'count', 'mirror', 'blink', 'sudden'
];

/** Mezcla un array (Fisher-Yates) — devuelve copia */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Devuelve la variante para la ronda N (1-based) usando el orden mezclado de la partida.
 *  Si el order está vacío, fallback al orden base. */
function getVariantForRound(roundNumber: number, variantOrder: GameVariant[]): GameVariant {
  const order = variantOrder.length > 0 ? variantOrder : MULTI_VARIANTS_BASE;
  const idx = (roundNumber - 1) % order.length;
  return order[idx];
}

/**
 * Representa una sala de juego. Mantiene su estado,
 * maneja transiciones de fase y cálculo de puntaje.
 */
export class Room {
  public code: string;
  public hostId: string;
  public phase: GamePhase = 'lobby';
  public players: Player[] = [];
  public settings: RoomSettings = { difficultyId: 'medium', totalRounds: 3 };
  public currentRoundNumber = 0;
  public currentRound: RoundData | null = null;
  public nextVariant: GameVariant | undefined;
  /** Orden de variantes para esta partida (aleatorio por partida, mismo para todos los jugadores) */
  public variantOrder: GameVariant[] = [];

  private questionQueue: QuestionAsset[] = [];
  private roundTimeout: NodeJS.Timeout | null = null;
  private countdownInterval: NodeJS.Timeout | null = null;

  /** Última vez que la sala tuvo algún evento (para limpieza) */
  public lastActivity: number = Date.now();

  constructor(code: string, hostId: string, private io: IO) {
    this.code = code;
    this.hostId = hostId;
  }

  // ========================================================
  //  JUGADORES
  // ========================================================

  addPlayer(id: string, name: string, avatar: string): Player {
    // Asignar color evitando repetidos si es posible
    const usedColors = new Set(this.players.map(p => p.color));
    const color = COLORS.find(c => !usedColors.has(c)) || COLORS[this.players.length % COLORS.length];

    const player: Player = {
      id,
      name: name.slice(0, 16),
      avatar: avatar || AVATARS[this.players.length % AVATARS.length],
      color,
      score: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      totalResponseTime: 0,
      isHost: id === this.hostId,
      isConnected: true,
      currentRoundResponseMs: null,
      currentRoundCorrect: null,
      eliminated: false,
      currentRoundTaps: []
    };
    this.players.push(player);
    this.lastActivity = Date.now();
    return player;
  }

  removePlayer(id: string): void {
    const idx = this.players.findIndex(p => p.id === id);
    if (idx < 0) return;
    const wasHost = this.players[idx].isHost;
    this.players.splice(idx, 1);
    this.lastActivity = Date.now();

    // Si el host se va, pasar el host al siguiente jugador (si hay)
    if (wasHost && this.players.length > 0) {
      this.players[0].isHost = true;
      this.hostId = this.players[0].id;
    }

    // Si estábamos en juego y alguien respondió, chequear si ya todos respondieron
    if (this.phase === 'playing') {
      this.checkAllAnswered();
    }
  }

  markDisconnected(id: string): void {
    const p = this.players.find(pl => pl.id === id);
    if (p) {
      p.isConnected = false;
      this.lastActivity = Date.now();
    }
  }

  hasPlayer(id: string): boolean {
    return this.players.some(p => p.id === id);
  }

  getPlayer(id: string): Player | undefined {
    return this.players.find(p => p.id === id);
  }

  isHost(id: string): boolean {
    return this.hostId === id;
  }

  isNameTaken(name: string): boolean {
    return this.players.some(p => p.name.toLowerCase() === name.trim().toLowerCase());
  }

  // ========================================================
  //  SETTINGS
  // ========================================================

  updateSettings(settings: Partial<RoomSettings>): void {
    if (this.phase !== 'lobby') return;
    if (settings.difficultyId && DIFFICULTIES.find(d => d.id === settings.difficultyId)) {
      this.settings.difficultyId = settings.difficultyId;
    }
    if (settings.totalRounds && settings.totalRounds > 0 && settings.totalRounds <= 20) {
      this.settings.totalRounds = settings.totalRounds;
    }
    this.lastActivity = Date.now();
    this.broadcastState();
  }

  // ========================================================
  //  FLUJO DEL JUEGO
  // ========================================================

  startGame(): void {
    if (this.phase !== 'lobby') return;
    if (this.players.length < 1) return;

    // Preparar preguntas
    this.questionQueue = pickQuestions(this.settings.totalRounds);
    this.currentRoundNumber = 0;

    // Generar orden aleatorio de variantes para esta partida
    // (mismo orden para todos los jugadores, pero distinto entre partidas)
    this.variantOrder = shuffle(MULTI_VARIANTS_BASE);

    // Resetear puntajes
    for (const p of this.players) {
      p.score = 0;
      p.correctAnswers = 0;
      p.wrongAnswers = 0;
      p.totalResponseTime = 0;
      p.eliminated = false;
      p.currentRoundTaps = [];
    }

    this.startNextRound();
  }

  private startNextRound(): void {
    this.currentRoundNumber++;

    if (this.currentRoundNumber > this.settings.totalRounds) {
      this.goFinal();
      return;
    }

    // Resetear estado de respuesta de cada jugador
    for (const p of this.players) {
      p.currentRoundResponseMs = null;
      p.currentRoundCorrect = null;
      p.currentRoundTaps = [];
    }

    // Variante según el número de ronda y el orden mezclado de la partida
    this.nextVariant = getVariantForRound(this.currentRoundNumber, this.variantOrder);

    // Intro de variante: 5 segundos (todos los modos para coherencia)
    const introDelay = 5000;

    this.phase = 'countdown';
    this.broadcastState();

    this.clearCountdown();
    setTimeout(() => {
      let secondsLeft = 3;
      this.io.to(this.code).emit('round:countdown', { seconds: secondsLeft });

      this.countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
          this.io.to(this.code).emit('round:countdown', { seconds: secondsLeft });
        } else {
          this.clearCountdown();
          this.beginRound();
        }
      }, 1000);
    }, introDelay);
  }

  private beginRound(): void {
    const question = this.questionQueue[this.currentRoundNumber - 1];
    const difficulty = getDifficulty(this.settings.difficultyId);

    // Usar la variante ya elegida en startNextRound (sino derivar de roundNumber)
    const variant = this.nextVariant || getVariantForRound(this.currentRoundNumber, this.variantOrder);
    this.nextVariant = undefined;

    // Decidir cuántas posiciones correctas según variante
    let count = 1;
    if (variant === 'double') count = 2;
    else if (variant === 'count') count = 1 + Math.floor(Math.random() * 3); // 1-3
    else if (variant === 'flash') count = Math.min(3 + this.currentRoundNumber, 6);

    // Asegurar que haya celdas suficientes
    const maxCount = Math.min(count, Math.floor(difficulty.boxes / 2));
    const finalCount = Math.max(1, maxCount);

    // Elegir posiciones únicas (1-based)
    const correctPositions: number[] = [];
    while (correctPositions.length < finalCount) {
      const p = Math.floor(Math.random() * difficulty.boxes) + 1;
      if (!correctPositions.includes(p)) correctPositions.push(p);
    }

    // Para flash, el orden importa (es la secuencia)
    const flashSequence = variant === 'flash' ? [...correctPositions] : undefined;

    // Variante flash en multi: 2s de preview + (sequence_len * 0.9s) para mostrar la secuencia
    const flashPreviewMs = variant === 'flash'
      ? 600 + correctPositions.length * 900 + 600
      : 0;

    this.currentRound = {
      roundNumber: this.currentRoundNumber,
      totalRounds: this.settings.totalRounds,
      urlRepeat: question.urlRepeat,
      urlUnique: question.urlUnique,
      correctPositions,
      flashSequence,
      startedAt: Date.now() + flashPreviewMs,
      timeLimit: difficulty.timeLimit,
      difficulty,
      variant,
      mirrored: variant === 'mirror'
    };

    this.phase = 'playing';
    this.broadcastState();
    this.io.to(this.code).emit('round:start', this.currentRound);

    // Timer límite — incluye el preview de flash
    this.clearRoundTimeout();
    this.roundTimeout = setTimeout(() => {
      this.endRound();
    }, difficulty.timeLimit * 1000 + flashPreviewMs);
  }

  /**
   * Un jugador responde. Calcula puntaje y notifica.
   * Si todos respondieron, termina la ronda.
   */
  submitAnswer(playerId: string, selectedPosition: number): void {
    if (this.phase !== 'playing' || !this.currentRound) return;
    const player = this.getPlayer(playerId);
    if (!player) return;
    if (player.eliminated) return;
    // Ya respondió definitivamente (acertó todas, o falló)
    if (player.currentRoundResponseMs !== null) return;

    const round = this.currentRound;
    const now = Date.now();
    // Si todavía estamos en flash preview, rechazar (startedAt es futuro)
    if (now < round.startedAt) return;
    const elapsedMs = now - round.startedAt;

    // En flash, el ORDEN importa
    if (round.variant === 'flash' && round.flashSequence) {
      const idx = player.currentRoundTaps.length;
      const expected = round.flashSequence[idx];
      if (selectedPosition === expected) {
        player.currentRoundTaps.push(selectedPosition);
        // ¿Completó toda la secuencia?
        if (player.currentRoundTaps.length === round.flashSequence.length) {
          this.markAnswered(player, true, elapsedMs, round);
        }
        // Si no completó, sigue jugando (no marca answered)
      } else {
        // Falló la secuencia
        this.markAnswered(player, false, elapsedMs, round);
      }
      this.io.to(this.code).emit('round:playerAnswered', { playerId, correct: player.currentRoundCorrect ?? false });
      this.checkAllAnswered();
      return;
    }

    // Resto de variantes: la posición debe estar en correctPositions
    const isCorrect = round.correctPositions.includes(selectedPosition);
    const alreadyTapped = player.currentRoundTaps.includes(selectedPosition);

    // Variantes que requieren confirmación explícita (botón "Confirmar")
    const needsConfirm = ['count'].includes(round.variant);

    if (isCorrect && !alreadyTapped) {
      player.currentRoundTaps.push(selectedPosition);

      // En modos de UN solo correcto (classic, mirror, blink), el primer toque correcto = ronda
      if (!needsConfirm && player.currentRoundTaps.length === round.correctPositions.length) {
        this.markAnswered(player, true, elapsedMs, round);
        this.io.to(this.code).emit('round:playerAnswered', { playerId, correct: true });
        this.checkAllAnswered();
      }
      // En modos con confirm: solo registra la celda; espera al confirm
    } else if (!isCorrect) {
      // Falló — seleccionó una celda incorrecta
      this.markAnswered(player, false, elapsedMs, round);
      this.io.to(this.code).emit('round:playerAnswered', { playerId, correct: false });
      this.checkAllAnswered();
    }
    // Si ya tocó esa correcta y la repite, en modos de confirm la "destoca"
    else if (alreadyTapped && needsConfirm) {
      player.currentRoundTaps = player.currentRoundTaps.filter(p => p !== selectedPosition);
    }
  }

  /** El jugador confirma su respuesta (modos count/double). */
  confirmAnswer(playerId: string): void {
    if (this.phase !== 'playing' || !this.currentRound) return;
    const player = this.getPlayer(playerId);
    if (!player) return;
    if (player.eliminated) return;
    if (player.currentRoundResponseMs !== null) return;

    const round = this.currentRound;
    const now = Date.now();
    if (now < round.startedAt) return; // todavía en preview
    const elapsedMs = now - round.startedAt;

    const needsConfirm = ['count'].includes(round.variant);
    if (!needsConfirm) return; // no aplica

    const allCorrect = player.currentRoundTaps.length === round.correctPositions.length;
    this.markAnswered(player, allCorrect, elapsedMs, round);
    this.io.to(this.code).emit('round:playerAnswered', { playerId, correct: allCorrect });
    this.checkAllAnswered();
  }

  /** Marca al jugador como ya respondido con resultado, suma puntos si correcto. */
  private markAnswered(player: Player, correct: boolean, elapsedMs: number, round: RoundData): void {
    player.currentRoundResponseMs = elapsedMs;
    player.currentRoundCorrect = correct;
    this.lastActivity = Date.now();

    if (correct) {
      const elapsedSec = elapsedMs / 1000;
      const timeFactor = Math.max(0, (round.timeLimit - elapsedSec) / round.timeLimit);
      let points = Math.round(round.difficulty.pointsBase * (1 + timeFactor));

      switch (round.variant) {
        case 'flash': points = Math.round(points * 1.5); break;
        case 'double': points = Math.round(points * 1.3); break;
        case 'count': points = Math.round(points * (1.2 + round.correctPositions.length * 0.15)); break;
        case 'mirror': points = Math.round(points * 1.25); break;
        case 'blink': points = Math.round(points * 1.6); break;
        case 'sudden': points = Math.round(points * 2.5); break;
      }

      player.score += points;
      player.correctAnswers++;
      player.totalResponseTime += elapsedMs;
    } else {
      player.wrongAnswers++;
      player.totalResponseTime += round.timeLimit * 1000;
      // Sudden: lo elimina del juego — NO suma puntos en esta ronda (ya está marcado wrong)
      if (round.variant === 'sudden') {
        player.eliminated = true;
      }
    }
  }

  private checkAllAnswered(): void {
    if (this.phase !== 'playing') return;
    const active = this.players.filter(p => p.isConnected && !p.eliminated);
    // Si nadie queda activo (todos eliminados en sudden), terminar ronda y avanzar
    if (active.length === 0) {
      this.endRound();
      // Auto-avanzar al final porque ya nadie puede seguir
      if (this.currentRound?.variant === 'sudden') {
        setTimeout(() => this.goFinal(), 100);
      }
      return;
    }
    const allAnswered = active.every(p => p.currentRoundResponseMs !== null);
    if (allAnswered) {
      this.endRound();
    }
  }

  private endRound(): void {
    if (this.phase !== 'playing' || !this.currentRound) return;

    this.clearRoundTimeout();
    const round = this.currentRound;

    // Los que no respondieron (excepto eliminados) → cuenta como incorrecta
    for (const p of this.players) {
      if (p.eliminated) continue;
      if (p.currentRoundResponseMs === null) {
        p.currentRoundResponseMs = round.timeLimit * 1000;
        p.currentRoundCorrect = false;
        p.wrongAnswers++;
        p.totalResponseTime += round.timeLimit * 1000;
        // Sudden: si no respondió, también queda eliminado
        if (round.variant === 'sudden') p.eliminated = true;
      }
    }

    const isFinal = this.currentRoundNumber >= this.settings.totalRounds;
    this.phase = 'roundResult';
    this.broadcastState();

    this.io.to(this.code).emit('round:end', {
      correctPositions: round.correctPositions,
      players: [...this.players],
      isFinalRound: isFinal
    });
  }

  /**
   * El host avanza a la siguiente ronda (o al final).
   */
  nextRound(): void {
    if (this.phase !== 'roundResult') return;
    if (this.currentRoundNumber >= this.settings.totalRounds) {
      this.goFinal();
    } else {
      this.startNextRound();
    }
  }

  private goFinal(): void {
    this.phase = 'final';
    this.currentRound = null;
    const ranking = this.getRanking();
    this.broadcastState();
    this.io.to(this.code).emit('game:final', { ranking });
  }

  /**
   * Volver al lobby para jugar otra partida, manteniendo los mismos jugadores.
   */
  playAgain(): void {
    this.phase = 'lobby';
    this.currentRoundNumber = 0;
    this.currentRound = null;
    for (const p of this.players) {
      p.score = 0;
      p.correctAnswers = 0;
      p.wrongAnswers = 0;
      p.totalResponseTime = 0;
      p.currentRoundResponseMs = null;
      p.currentRoundCorrect = null;
    }
    this.clearRoundTimeout();
    this.clearCountdown();
    this.broadcastState();
  }

  // ========================================================
  //  UTILIDADES
  // ========================================================

  getRanking(): Player[] {
    return [...this.players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.totalResponseTime - b.totalResponseTime;
    });
  }

  getState(): RoomState {
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      settings: this.settings,
      players: this.players,
      currentRound: this.currentRound,
      currentRoundNumber: this.currentRoundNumber,
      nextVariant: this.nextVariant
    };
  }

  broadcastState(): void {
    this.io.to(this.code).emit('room:state', this.getState());
  }

  destroy(): void {
    this.clearRoundTimeout();
    this.clearCountdown();
  }

  private clearRoundTimeout(): void {
    if (this.roundTimeout) {
      clearTimeout(this.roundTimeout);
      this.roundTimeout = null;
    }
  }

  private clearCountdown(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }
}
