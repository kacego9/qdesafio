/**
 * Tipos compartidos entre cliente y servidor.
 * Definen el "contrato" de comunicación por WebSockets.
 */

// ============================================================
//  MODELOS
// ============================================================

export interface Player {
  id: string;
  name: string;
  avatar: string;
  color: string;
  score: number;
  correctAnswers: number;
  wrongAnswers: number;
  totalResponseTime: number;
  isHost: boolean;
  isConnected: boolean;
  currentRoundResponseMs: number | null;
  currentRoundCorrect: boolean | null;
  /** ¿eliminado en sudden death? si true ya no juega más rondas */
  eliminated: boolean;
  /** Posiciones que ha tocado correctamente en la ronda actual (modos multi-tap) */
  currentRoundTaps: number[];
}

export interface DifficultyDefinition {
  id: string;
  columns: number;
  rows: number;
  boxes: number;
  timeLimit: number;  // segundos
  pointsBase: number;
}

export interface RoomSettings {
  difficultyId: string;
  totalRounds: number;
}

export type GamePhase =
  | 'lobby'        // esperando que se unan + host comience
  | 'countdown'    // 3-2-1 antes de cada ronda
  | 'playing'      // la ronda está en curso
  | 'roundResult'  // terminó la ronda, mostrando resultado
  | 'final';       // fin de juego, podio

/** Variantes de juego (debe coincidir con cliente solo-progress.service) */
export type GameVariant =
  | 'classic'
  | 'double'
  | 'flash'
  | 'count'
  | 'mirror'
  | 'blink'
  | 'sudden';

export interface RoundData {
  roundNumber: number;       // 1-based
  totalRounds: number;
  urlRepeat: string;
  urlUnique: string;
  /** Posiciones correctas (1-based). Puede haber 1, 2 o 3 según variante. */
  correctPositions: number[];
  /** Para variant flash: secuencia de celdas a memorizar (en orden) */
  flashSequence?: number[];
  /** timestamp del servidor cuando empezó la ronda (ms desde epoch) */
  startedAt: number;
  timeLimit: number;         // segundos
  difficulty: DifficultyDefinition;
  /** Variante de juego para esta ronda */
  variant: GameVariant;
  /** Si la imagen única debe ir espejada (mirror) */
  mirrored?: boolean;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: GamePhase;
  settings: RoomSettings;
  players: Player[];
  currentRound: RoundData | null;
  /** número de ronda actual (1-based), 0 si aún no empezó */
  currentRoundNumber: number;
  /** Variante de la próxima ronda (visible durante countdown) */
  nextVariant?: GameVariant;
}

// ============================================================
//  EVENTOS CLIENT → SERVER
// ============================================================

export interface ClientToServerEvents {
  /** crear una nueva sala como host */
  'room:create': (
    payload: { playerName: string; avatar: string; language: string },
    callback: (response: CreateRoomResponse) => void
  ) => void;

  /** unirse a una sala existente */
  'room:join': (
    payload: { code: string; playerName: string; avatar: string },
    callback: (response: JoinRoomResponse) => void
  ) => void;

  /** host cambia settings del lobby */
  'room:updateSettings': (payload: RoomSettings) => void;

  /** host inicia el juego */
  'room:start': () => void;

  /** jugador responde al emoji seleccionado */
  'round:answer': (payload: { selectedPosition: number }) => void;

  /** jugador confirma su respuesta (modos multi-tap: double, count) */
  'round:confirmAnswer': () => void;

  /** host avanza a la siguiente ronda */
  'round:next': () => void;

  /** jugador pide reiniciar (volver al lobby para jugar otra partida) */
  'room:playAgain': () => void;

  /** jugador se va de la sala */
  'room:leave': () => void;
}

// ============================================================
//  EVENTOS SERVER → CLIENT
// ============================================================

export interface ServerToClientEvents {
  /** Estado completo de la sala (enviado en cada cambio importante) */
  'room:state': (state: RoomState) => void;

  /** Empieza el countdown de una ronda */
  'round:countdown': (payload: { seconds: number }) => void;

  /** Inicia la ronda con los datos del grid */
  'round:start': (round: RoundData) => void;

  /** Un jugador respondió (los demás ven quién ya respondió) */
  'round:playerAnswered': (payload: { playerId: string; correct: boolean }) => void;

  /** Ronda terminó, aquí vienen los resultados */
  'round:end': (payload: {
    correctPositions: number[];
    players: Player[];
    isFinalRound: boolean;
  }) => void;

  /** Juego terminó, aquí está el podio */
  'game:final': (payload: { ranking: Player[] }) => void;

  /** Error genérico */
  'error:message': (payload: { message: string }) => void;
}

// ============================================================
//  RESPUESTAS DE CALLBACKS
// ============================================================

export interface CreateRoomResponse {
  ok: boolean;
  code?: string;
  /** Estado inicial de la sala (incluido para evitar race en la navegación) */
  state?: RoomState;
  error?: string;
}

export interface JoinRoomResponse {
  ok: boolean;
  /** Estado inicial de la sala (incluido para evitar race en la navegación) */
  state?: RoomState;
  error?: string;
}
