import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { AnalyticsService } from './analytics.service';
import {
  CreateRoomResponse,
  JoinRoomResponse,
  Player,
  RoomSettings,
  RoomState,
  RoundData
} from '../shared/types';

@Injectable({ providedIn: 'root' })
export class RoomService {
  private socket: Socket | null = null;

  private stateSubject = new BehaviorSubject<RoomState | null>(null);
  public state$: Observable<RoomState | null> = this.stateSubject.asObservable();

  private countdownSubject = new Subject<number>();
  public countdown$: Observable<number> = this.countdownSubject.asObservable();

  private roundStartSubject = new Subject<RoundData>();
  public roundStart$: Observable<RoundData> = this.roundStartSubject.asObservable();

  private roundEndSubject = new Subject<{
    correctPosition: number;
    players: Player[];
    isFinalRound: boolean;
  }>();
  public roundEnd$ = this.roundEndSubject.asObservable();

  private playerAnsweredSubject = new Subject<{ playerId: string; correct: boolean }>();
  public playerAnswered$ = this.playerAnsweredSubject.asObservable();

  private gameFinalSubject = new Subject<{ ranking: Player[] }>();
  public gameFinal$ = this.gameFinalSubject.asObservable();

  private errorSubject = new Subject<string>();
  public error$ = this.errorSubject.asObservable();

  private connectedSubject = new BehaviorSubject<boolean>(false);
  public connected$ = this.connectedSubject.asObservable();

  constructor(private analytics: AnalyticsService) {}

  /** ID del socket (para saber quién soy yo en el estado) */
  get myId(): string | undefined {
    return this.socket?.id;
  }

  /** Acceso al último estado (usado por el Room component al inicializar) */
  get currentState(): RoomState | null {
    return this.stateSubject.value;
  }

  /**
   * Se conecta al servidor (si no está conectado ya).
   */
  private ensureConnected(): Socket {
    if (this.socket && this.socket.connected) return this.socket;
    if (!this.socket) {
      this.socket = io(environment.serverUrl, {
        transports: ['websocket', 'polling'],
        autoConnect: true
      });
      this.registerHandlers();
    } else {
      this.socket.connect();
    }
    return this.socket;
  }

  private registerHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.connectedSubject.next(true);
    });

    this.socket.on('disconnect', () => {
      this.connectedSubject.next(false);
    });

    this.socket.on('connect_error', (err: Error) => {
      console.error('Error de conexión al servidor:', err.message);
      this.errorSubject.next('CONNECTION_ERROR');
    });

    this.socket.on('room:state', (state: RoomState) => {
      this.stateSubject.next(state);
    });

    this.socket.on('round:countdown', ({ seconds }: { seconds: number }) => {
      this.countdownSubject.next(seconds);
    });

    this.socket.on('round:start', (round: RoundData) => {
      this.roundStartSubject.next(round);
    });

    this.socket.on('round:playerAnswered', (payload: { playerId: string; correct: boolean }) => {
      this.playerAnsweredSubject.next(payload);
    });

    this.socket.on('round:end', (payload: {
      correctPosition: number;
      players: Player[];
      isFinalRound: boolean;
    }) => {
      this.roundEndSubject.next(payload);
    });

    this.socket.on('game:final', (payload: { ranking: Player[] }) => {
      this.gameFinalSubject.next(payload);
    });

    this.socket.on('error:message', (payload: { message: string }) => {
      this.errorSubject.next(payload.message);
    });
  }

  // ==========================================================
  //  ACCIONES
  // ==========================================================

  createRoom(playerName: string, avatar: string, language: string): Promise<CreateRoomResponse> {
    const socket = this.ensureConnected();
    return new Promise((resolve) => {
      const timeout = setTimeout(
        () => resolve({ ok: false, error: 'TIMEOUT' }),
        8000
      );
      socket.emit('room:create', { playerName, avatar, language }, (res: CreateRoomResponse) => {
        clearTimeout(timeout);
        // Si el server nos devuelve el estado inicial, lo aplicamos antes
        // de que el cliente navegue para evitar la race condition que
        // causaba el "doble nickname".
        if (res.ok && res.state) {
          this.stateSubject.next(res.state);
        }
        if (res.ok) {
          this.analytics.event('room_created', { code: res.code });
        } else {
          this.analytics.event('room_create_failed', { error: res.error });
        }
        resolve(res);
      });
    });
  }

  joinRoom(code: string, playerName: string, avatar: string): Promise<JoinRoomResponse> {
    const socket = this.ensureConnected();
    return new Promise((resolve) => {
      const timeout = setTimeout(
        () => resolve({ ok: false, error: 'TIMEOUT' }),
        8000
      );
      socket.emit('room:join', { code, playerName, avatar }, (res: JoinRoomResponse) => {
        clearTimeout(timeout);
        if (res.ok && res.state) {
          this.stateSubject.next(res.state);
        }
        if (res.ok) {
          this.analytics.event('room_joined', { code });
        } else {
          this.analytics.event('room_join_failed', { error: res.error, code });
        }
        resolve(res);
      });
    });
  }

  updateSettings(settings: RoomSettings): void {
    this.socket?.emit('room:updateSettings', settings);
  }

  startGame(): void {
    this.socket?.emit('room:start');
    this.analytics.event('game_start', {
      code: this.stateSubject.value?.code,
      players: this.stateSubject.value?.players.length || 0
    });
  }

  submitAnswer(selectedPosition: number): void {
    this.socket?.emit('round:answer', { selectedPosition });
  }

  confirmAnswer(): void {
    this.socket?.emit('round:confirmAnswer');
  }

  nextRound(): void {
    this.socket?.emit('round:next');
  }

  playAgain(): void {
    this.socket?.emit('room:playAgain');
  }

  leaveRoom(): void {
    this.socket?.emit('room:leave');
    this.stateSubject.next(null);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.stateSubject.next(null);
    this.connectedSubject.next(false);
  }
}
