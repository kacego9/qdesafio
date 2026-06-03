import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  Component,
  HostListener,
  Inject,
  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RoomService } from '../../services/room.service';
import { I18nService, TranslatePipe } from '../../i18n/i18n.service';
import { Player, RoomState, RoundData, GamePhase } from '../../shared/types';

interface GridCell {
  position: number;
  top: string;
  left: string;
}

const DIFFICULTIES_INFO = [
  { id: 'easy', labelKey: 'difficulty.easy', descKey: 'difficulty.desc.easy', emoji: '🌱' },
  { id: 'medium', labelKey: 'difficulty.medium', descKey: 'difficulty.desc.medium', emoji: '🔥' },
  { id: 'hard', labelKey: 'difficulty.hard', descKey: 'difficulty.desc.hard', emoji: '⚡' },
  { id: 'insane', labelKey: 'difficulty.insane', descKey: 'difficulty.desc.insane', emoji: '💀' }
];
const ROUND_OPTIONS = [1, 2, 3, 5, 7, 10];

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './room.component.html',
  styleUrl: './room.component.css'
})
export class RoomComponent implements OnInit, OnDestroy {
  state: RoomState | null = null;
  private subs: Subscription[] = [];

  // Ronda actual
  currentRound: RoundData | null = null;
  gridCells: GridCell[] = [];
  imageSize = 0;
  boardWidth = 0;
  boardHeight = 0;

  // UI local
  countdownValue: number = 0;
  youAnswered = false;
  youAnsweredCorrect: boolean | null = null;
  youSelectedPosition = -1;
  /** Taps locales del jugador actual (espejo del server, actualizado optimistamente) */
  myLocalTaps: number[] = [];

  timeRemaining = 0;
  private tickInterval: any;

  // Feedback
  correctPositionRevealed = -1;
  copied = false;

  // Final
  finalRanking: Player[] = [];

  // Dificultades y rondas (para el panel del host)
  difficulties = DIFFICULTIES_INFO;
  roundOptions = ROUND_OPTIONS;

  // Imagen cargando
  imagesLoaded = false;

  // Variantes
  private blinkTimer: any;
  /** Posición que se muestra como "única" en blink (cambia cada 1s) */
  blinkPosition = -1;
  /** Cuando true, mostrar grid con badge ✅ sobre la respuesta correcta */
  showingReveal = false;
  /** Flash preview: durante los primeros segundos solo se ve la secuencia */
  flashPreviewActive = false;
  private flashPreviewTimer: any;
  /** Flash: posición resaltada AHORA durante secuencia */
  flashHighlight = -1;
  private flashSeqTimer: any;

  roomCode = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public roomService: RoomService,
    public i18n: I18nService,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    this.roomCode = this.route.snapshot.paramMap.get('code') || '';

    // Si no tenemos estado y no estamos conectados, dar un breve margen para
    // que llegue el estado (la create/join callback ya debería haberlo
    // poblado). Si tras la espera sigue sin haber estado, redirigimos a join.
    const initialState = this.roomService.currentState;
    if (!initialState) {
      // Esperamos hasta 1.5s para que llegue el estado por el canal habitual
      let arrived = false;
      const guardSub = this.roomService.state$.subscribe((s) => {
        if (s) {
          arrived = true;
          guardSub.unsubscribe();
        }
      });
      setTimeout(() => {
        if (!arrived) {
          guardSub.unsubscribe();
          this.router.navigate(['/join', this.roomCode]);
        }
      }, 1500);
    }

    this.subs.push(
      this.roomService.state$.subscribe((s: RoomState | null) => {
        const wasNotCountdown = this.state?.phase !== 'countdown';
        this.state = s;
        if (!s) return;
        // Al ENTRAR a countdown, reseteo a 0 para que muestre intro primero
        if (s.phase === 'countdown' && wasNotCountdown) {
          this.countdownValue = 0;
        }
        if (s.phase === 'final') {
          this.finalRanking = this.sortPlayers(s.players);
        }
      })
    );

    this.subs.push(
      this.roomService.countdown$.subscribe((n: number) => {
        this.ngZone.run(() => {
          this.countdownValue = n;
        });
      })
    );

    this.subs.push(
      this.roomService.roundStart$.subscribe((round: RoundData) => {
        this.ngZone.run(() => this.handleRoundStart(round));
      })
    );

    this.subs.push(
      this.roomService.roundEnd$.subscribe((payload: { correctPosition: number; players: Player[]; isFinalRound: boolean }) => {
        this.ngZone.run(() => {
          this.correctPositionRevealed = payload.correctPosition;
          this.stopTick();
          this.timeRemaining = 0;
          this.clearBlink();
          // Mostrar reveal en el grid durante 2s antes del roundResult
          this.showingReveal = true;
          setTimeout(() => {
            this.ngZone.run(() => { this.showingReveal = false; });
          }, 2000);
        });
      })
    );

    this.subs.push(
      this.roomService.gameFinal$.subscribe((payload: { ranking: Player[] }) => {
        this.ngZone.run(() => {
          this.finalRanking = payload.ranking;
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.stopTick();
    this.clearBlink();
    this.clearFlashPreview();
  }

  // ============================================================
  //  GETTERS
  // ============================================================
  get phase(): GamePhase | null {
    return this.state?.phase || null;
  }

  get me(): Player | undefined {
    if (!this.state) return undefined;
    return this.state.players.find(p => p.id === this.roomService.myId);
  }

  get isHost(): boolean {
    return this.me?.isHost || false;
  }

  get sortedPlayers(): Player[] {
    if (!this.state) return [];
    return this.sortPlayers(this.state.players);
  }

  sortPlayers(players: Player[]): Player[] {
    return [...players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.totalResponseTime - b.totalResponseTime;
    });
  }

  /**
   * Devuelve todos los jugadores empatados en lo más alto.
   * - Si nadie sumó puntos (score top = 0): TODOS los jugadores conectados son
   *   "empate sin puntos" — nadie ganó realmente.
   * - Si varios tienen el mismo score más alto Y el mismo tiempo total: empate real.
   * - Si solo hay uno con el score más alto (o desempata por tiempo): un solo ganador.
   */
  get topPlayers(): Player[] {
    const ranking = this.finalRanking;
    if (ranking.length === 0) return [];
    const topScore = ranking[0].score;
    // Caso 1: nadie sumó puntos → empate global "sin ganador"
    if (topScore === 0) return ranking;
    // Caso 2: empate real entre quienes comparten score top y tiempo total
    const topTime = ranking[0].totalResponseTime;
    return ranking.filter(p => p.score === topScore && p.totalResponseTime === topTime);
  }

  get hasTie(): boolean {
    return this.topPlayers.length > 1;
  }

  /** True solo si hay 1 ganador con puntos > 0. */
  get hasSingleWinner(): boolean {
    return !this.hasTie && this.topPlayers.length === 1 && this.topPlayers[0].score > 0;
  }

  /** True si nadie acertó nada (todos en cero). */
  get noOneScored(): boolean {
    return this.finalRanking.length > 0 && this.finalRanking[0].score === 0;
  }

  get winner(): Player | null {
    return this.hasSingleWinner ? this.topPlayers[0] : null;
  }

  get howManyAnswered(): number {
    if (!this.state) return 0;
    return this.state.players.filter(p => p.currentRoundResponseMs !== null).length;
  }

  get totalConnected(): number {
    if (!this.state) return 0;
    return this.state.players.filter(p => p.isConnected).length;
  }

  get timePercent(): number {
    if (!this.currentRound) return 0;
    return Math.max(0, (this.timeRemaining / this.currentRound.timeLimit) * 100);
  }

  // ============================================================
  //  LOBBY ACTIONS (solo host)
  // ============================================================
  selectDifficulty(id: string): void {
    if (!this.isHost || !this.state) return;
    this.roomService.updateSettings({
      difficultyId: id,
      totalRounds: this.state.settings.totalRounds
    });
  }

  selectRounds(n: number): void {
    if (!this.isHost || !this.state) return;
    this.roomService.updateSettings({
      difficultyId: this.state.settings.difficultyId,
      totalRounds: n
    });
  }

  startGame(): void {
    if (!this.isHost) return;
    this.roomService.startGame();
  }

  copyCode(): void {
    if (!isPlatformBrowser(this.platformId) || !this.state) return;
    const code = this.state.code;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        this.copied = true;
        setTimeout(() => (this.copied = false), 2000);
      });
    }
  }

  leaveRoom(): void {
    this.roomService.leaveRoom();
    this.router.navigate(['/home']);
  }

  // ============================================================
  //  ROUND LOGIC
  // ============================================================
  handleRoundStart(round: RoundData): void {
    this.currentRound = round;
    this.youAnswered = false;
    this.youAnsweredCorrect = null;
    this.youSelectedPosition = -1;
    this.myLocalTaps = [];
    this.correctPositionRevealed = -1;
    this.showingReveal = false;
    this.imagesLoaded = false;
    this.flashPreviewActive = false;
    this.flashHighlight = -1;
    this.blinkPosition = round.correctPositions[0] || -1;
    this.clearBlink();
    this.clearFlashPreview();
    this.clearFlashSeq();

    this.preloadImages([round.urlRepeat, round.urlUnique], () => {
      this.computeBoardDimensions();
      this.buildGrid();

      if (round.variant === 'flash') {
        // Mostrar la secuencia paso a paso durante el "preview"
        this.flashPreviewActive = true;
        this.runFlashSequence(round, () => {
          this.ngZone.run(() => {
            this.flashPreviewActive = false;
            this.flashHighlight = -1;
            this.startTick();
          });
        });
      } else {
        this.startTick();
        this.startBlinkIfNeeded(round);
      }
    });
  }

  private runFlashSequence(round: RoundData, onDone: () => void): void {
    const seq = round.flashSequence || [];
    let step = 0;
    const showStep = () => {
      if (step >= seq.length) {
        this.flashSeqTimer = setTimeout(onDone, 400);
        return;
      }
      this.ngZone.run(() => { this.flashHighlight = seq[step]; });
      this.flashSeqTimer = setTimeout(() => {
        this.ngZone.run(() => { this.flashHighlight = -1; });
        this.flashSeqTimer = setTimeout(() => {
          step += 1;
          showStep();
        }, 200);
      }, 700);
    };
    showStep();
  }

  /** Cuando true, mostrar overlay flash 200ms */
  blinkFlashing = false;

  private startBlinkIfNeeded(round: RoundData): void {
    if (round.variant !== 'blink') return;
    this.blinkTimer = setInterval(() => {
      this.ngZone.run(() => {
        this.blinkFlashing = true;
        setTimeout(() => {
          this.ngZone.run(() => {
            const total = round.difficulty.boxes;
            let next: number;
            do { next = Math.floor(Math.random() * total) + 1; }
            while (next === this.blinkPosition);
            this.blinkPosition = next;
          });
        }, 100);
        setTimeout(() => {
          this.ngZone.run(() => { this.blinkFlashing = false; });
        }, 200);
      });
    }, 2000);
  }

  private clearFlashPreview(): void {
    if (this.flashPreviewTimer) {
      clearTimeout(this.flashPreviewTimer);
      this.flashPreviewTimer = null;
    }
    this.flashPreviewActive = false;
  }

  private clearFlashSeq(): void {
    if (this.flashSeqTimer) {
      clearTimeout(this.flashSeqTimer);
      this.flashSeqTimer = null;
    }
    this.flashHighlight = -1;
  }

  private clearBlink(): void {
    if (this.blinkTimer) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
  }

  preloadImages(urls: string[], done: () => void): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.imagesLoaded = true;
      done();
      return;
    }
    let loaded = 0;
    urls.forEach(url => {
      const img = new Image();
      img.onload = img.onerror = () => {
        this.ngZone.run(() => {
          loaded++;
          if (loaded === urls.length) {
            this.imagesLoaded = true;
            setTimeout(done, 200);
          }
        });
      };
      img.src = url;
    });
  }

  computeBoardDimensions(): void {
    if (!this.currentRound || !isPlatformBrowser(this.platformId)) {
      this.boardWidth = 800;
      this.boardHeight = 600;
      this.imageSize = 0;
      return;
    }
    const d = this.currentRound.difficulty;
    const aspectRatio = d.columns / d.rows;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Padding y reserva escalan con el viewport (mobile vs desktop)
    const horizontalPadding = vw < 520 ? 16 : 32;
    // Reserva: header + hint bar + mini-leaderboard + botón confirmar (solo en count)
    const needsConfirmSpace = this.currentRound &&
      ['count'].includes(this.currentRound.variant);
    const baseReserve = vw < 520 ? 180 : 220;
    const verticalReserve = needsConfirmSpace ? baseReserve + 70 : baseReserve;

    const availW = vw - horizontalPadding;
    const availH = Math.max(220, vh - verticalReserve);

    let w = availW;
    let h = w / aspectRatio;
    if (h > availH) {
      h = availH;
      w = h * aspectRatio;
    }
    this.boardWidth = Math.floor(w);
    this.boardHeight = Math.floor(h);
    this.imageSize = w / d.columns;
  }

  buildGrid(): void {
    if (!this.currentRound) return;
    const d = this.currentRound.difficulty;
    this.gridCells = [];
    let n = 1;
    for (let r = 0; r < d.rows; r++) {
      for (let c = 0; c < d.columns; c++) {
        this.gridCells.push({
          position: n++,
          top: (r * this.imageSize) + 'px',
          left: (c * this.imageSize) + 'px'
        });
      }
    }
  }

  /**
   * Posición (top/left) para una celda dada por su número.
   */
  cellPos(position: number): { top: string; left: string } {
    if (!this.currentRound) return { top: '0', left: '0' };
    const d = this.currentRound.difficulty;
    const index = position - 1;
    const row = Math.floor(index / d.columns);
    const col = index % d.columns;
    return {
      top: (row * this.imageSize) + 'px',
      left: (col * this.imageSize) + 'px'
    };
  }

  /** ¿Esta celda es una de las correctas? */
  isCorrect(pos: number): boolean {
    if (!this.currentRound) return false;
    return this.currentRound.correctPositions.includes(pos);
  }

  /** ¿Esta celda ya la tocó CORRECTAMENTE el jugador esta ronda? */
  isTapped(pos: number): boolean {
    return this.myLocalTaps.includes(pos);
  }

  /** ¿Mostrar la imagen única en esta celda?
   * Para classic/double/count/grow/mirror: en correctPositions.
   * Para blink: solo en blinkPosition (la actual, lado cliente porque cambia).
   * Para flash: NO se muestra imagen, son celdas neutras iluminadas en orden.
   */
  shouldShowUnique(pos: number): boolean {
    if (!this.currentRound) return false;
    if (this.currentRound.variant === 'flash') return false;
    if (this.currentRound.variant === 'blink') return pos === this.blinkPosition;
    return this.currentRound.correctPositions.includes(pos);
  }

  /** ¿Esta celda está iluminada en flash? */
  isFlashHighlighted(pos: number): boolean {
    if (!this.currentRound || this.currentRound.variant !== 'flash') return false;
    return pos === this.flashHighlight;
  }

  /** Etiqueta del modo (no-classic) */
  get variantLabel(): string {
    if (!this.currentRound) return '';
    return this.i18n.t(('solo.variant.' + this.currentRound.variant + '.name') as any);
  }

  /** Hint corto del modo */
  get variantHintShort(): string {
    if (!this.currentRound) return '';
    return this.i18n.t(('solo.variant.' + this.currentRound.variant + '.short') as any);
  }

  /** Emoji del modo actual */
  get variantEmoji(): string {
    if (!this.currentRound) return '🎯';
    const map: Record<string, string> = {
      classic: '🎯', double: '👯', flash: '⚡', count: '🔢',
      mirror: '🪞', blink: '👁️', sudden: '💀'
    };
    return map[this.currentRound.variant] || '🎯';
  }

  /** Etiqueta de la PRÓXIMA variante (durante countdown) */
  get nextVariantLabel(): string {
    if (!this.state?.nextVariant) return '';
    return this.i18n.t(('solo.variant.' + this.state.nextVariant + '.name') as any);
  }

  /** Hint completo de la próxima variante */
  get nextVariantHint(): string {
    if (!this.state?.nextVariant) return '';
    return this.i18n.t(('solo.variant.' + this.state.nextVariant + '.hint') as any);
  }

  /** Emoji de la próxima variante */
  get nextVariantEmoji(): string {
    const map: Record<string, string> = {
      classic: '🎯', double: '👯', flash: '⚡', count: '🔢',
      mirror: '🪞', blink: '👁️', sudden: '💀'
    };
    return map[this.state?.nextVariant || 'classic'] || '🎯';
  }

  /** ¿Mostrar contador de progreso (modos multi-tap)? */
  get showProgress(): boolean {
    if (!this.currentRound) return false;
    return ['double', 'count', 'flash'].includes(this.currentRound.variant)
      && this.currentRound.correctPositions.length > 1;
  }

  /** Total de tocas requeridas */
  get totalCorrectPositions(): number {
    return this.currentRound?.correctPositions.length || 0;
  }

  /** Cuántas ha tocado bien el yo */
  get myTapCount(): number {
    return this.myLocalTaps.length;
  }

  startTick(): void {
    if (!this.currentRound) return;
    this.timeRemaining = this.currentRound.timeLimit;
    this.stopTick();
    this.tickInterval = setInterval(() => {
      this.timeRemaining = Math.max(0, this.timeRemaining - 1);
      if (this.timeRemaining <= 0) this.stopTick();
    }, 1000);
  }

  stopTick(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  /** ¿Esta variante requiere botón "Confirmar"? */
  get requiresConfirm(): boolean {
    if (!this.currentRound) return false;
    return ['count'].includes(this.currentRound.variant);
  }

  selectCell(position: number): void {
    if (this.phase !== 'playing') return;
    if (this.youAnswered) return;
    if (this.flashPreviewActive) return;
    if (!this.currentRound) return;
    if (this.me?.eliminated) return;
    if (this.me?.currentRoundResponseMs != null) return; // ya respondió

    const isCorrect = this.currentRound.correctPositions.includes(position);
    const needsConfirm = this.requiresConfirm;
    const variant = this.currentRound.variant;

    // Para flash, validar el orden de la secuencia localmente
    if (variant === 'flash' && this.currentRound.flashSequence) {
      const expected = this.currentRound.flashSequence[this.myLocalTaps.length];
      if (position !== expected) {
        // Falló secuencia
        this.youSelectedPosition = position;
        this.roomService.submitAnswer(position);
        this.playSound(false);
        this.youAnswered = true;
        this.youAnsweredCorrect = false;
        return;
      }
      // Correcto: añadir al recall local
      this.myLocalTaps = [...this.myLocalTaps, position];
      this.youSelectedPosition = position;
      this.roomService.submitAnswer(position);
      this.playSound(true);

      // ¿Completó toda la secuencia?
      if (this.myLocalTaps.length === this.currentRound.flashSequence.length) {
        this.youAnswered = true;
        this.youAnsweredCorrect = true;
      }
      return;
    }

    this.youSelectedPosition = position;
    this.roomService.submitAnswer(position);
    this.playSound(isCorrect);

    if (!isCorrect) {
      this.youAnswered = true;
      this.youAnsweredCorrect = false;
      this.clearBlink();
      return;
    }

    // Es correcto: añadir al tracking local (toggle si needsConfirm)
    if (this.myLocalTaps.includes(position)) {
      // Ya estaba (en count: destocar si requiere confirm)
      if (needsConfirm) {
        this.myLocalTaps = this.myLocalTaps.filter(p => p !== position);
      }
      return;
    }
    this.myLocalTaps = [...this.myLocalTaps, position];

    // Modos sin confirm (classic, double, mirror, blink): si ya tocó todas las correctas → terminó
    if (!needsConfirm && this.myLocalTaps.length >= this.currentRound.correctPositions.length) {
      this.youAnswered = true;
      this.youAnsweredCorrect = true;
      this.clearBlink();
    }
    // Modos con confirm (count): solo registra el tap, espera el botón
  }

  /** El usuario presiona "Confirmar" en multi (modo count) */
  confirmAnswer(): void {
    if (!this.requiresConfirm) return;
    if (this.phase !== 'playing') return;
    if (this.youAnswered) return;
    if (!this.me) return;

    this.youAnswered = true;
    const allTapped = this.myLocalTaps.length === this.currentRound!.correctPositions.length;
    this.youAnsweredCorrect = allTapped;
    this.roomService.confirmAnswer();
    this.playSound(allTapped);
    this.clearBlink();
  }

  // ============================================================
  //  ROUND RESULT
  // ============================================================
  nextRound(): void {
    if (!this.isHost) return;
    this.roomService.nextRound();
  }

  // ============================================================
  //  FINAL
  // ============================================================
  playAgain(): void {
    if (!this.isHost) return;
    this.roomService.playAgain();
  }

  newRoom(): void {
    this.roomService.leaveRoom();
    this.router.navigate(['/create']);
  }

  goHome(): void {
    this.roomService.leaveRoom();
    this.router.navigate(['/home']);
  }

  // ============================================================
  //  HELPERS
  // ============================================================
  getDifficultyInfo(id: string) {
    return this.difficulties.find(d => d.id === id) || this.difficulties[1];
  }

  getPlayerIcon(player: Player): string {
    if (player.currentRoundResponseMs === null) return '⏳';
    return player.currentRoundCorrect ? '✅' : '❌';
  }

  getPlayerResponseTime(player: Player): string {
    if (player.currentRoundResponseMs === null) return '—';
    return (player.currentRoundResponseMs / 1000).toFixed(2) + 's';
  }

  trackPlayer(_i: number, p: Player): string { return p.id; }
  trackByPosition(_i: number, cell: GridCell): number { return cell.position; }

  playSound(correct: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const audio = new Audio(correct ? 'assets/audio/correct-answer.mp3' : 'assets/audio/wrong-answer.mp3');
      audio.volume = 0.6;
      audio.play().catch(() => {});
    } catch {}
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.phase === 'playing') {
      this.computeBoardDimensions();
      this.buildGrid();
    }
  }
}
