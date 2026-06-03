/**
 * Tipos compartidos con el servidor. Mantener SINCRONIZADOS con
 * server/src/shared-types.ts
 */

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
  eliminated: boolean;
  currentRoundTaps: number[];
}

export interface DifficultyDefinition {
  id: string;
  columns: number;
  rows: number;
  boxes: number;
  timeLimit: number;
  pointsBase: number;
}

export interface RoomSettings {
  difficultyId: string;
  totalRounds: number;
}

export type GamePhase =
  | 'lobby'
  | 'countdown'
  | 'playing'
  | 'roundResult'
  | 'final';

/** Variantes de juego multijugador (sincronizado con servidor) */
export type MultiplayerVariant =
  | 'classic'
  | 'double'
  | 'flash'
  | 'count'
  | 'mirror'
  | 'blink'
  | 'sudden';

export interface RoundData {
  roundNumber: number;
  totalRounds: number;
  urlRepeat: string;
  urlUnique: string;
  correctPositions: number[];
  flashSequence?: number[];
  startedAt: number;
  timeLimit: number;
  difficulty: DifficultyDefinition;
  variant: MultiplayerVariant;
  mirrored?: boolean;
}

export interface RoomState {
  code: string;
  hostId: string;
  phase: GamePhase;
  settings: RoomSettings;
  players: Player[];
  currentRound: RoundData | null;
  currentRoundNumber: number;
  nextVariant?: MultiplayerVariant;
}

export interface CreateRoomResponse {
  ok: boolean;
  code?: string;
  state?: RoomState;
  error?: string;
}

export interface JoinRoomResponse {
  ok: boolean;
  state?: RoomState;
  error?: string;
}
