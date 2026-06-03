import { CommonModule, isPlatformBrowser, Location } from '@angular/common';
import {
  Component,
  HostListener,
  Inject,
  NgZone,
  OnDestroy,
  OnInit,
  PLATFORM_ID
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { I18nService, TranslatePipe } from '../../i18n/i18n.service';
import {
  GameVariant,
  SoloLevel,
  SoloProgressService,
  getLevelVariant
} from '../../services/solo-progress.service';
import { SeoService } from '../../services/seo.service';
import { AnalyticsService } from '../../services/analytics.service';
import { LeaderboardService } from '../../services/leaderboard.service';
import { pickSoloQuestions, QuestionAsset } from '../../shared/solo-questions';
import { SoloOnboardingComponent } from '../../components/solo-onboarding/solo-onboarding.component';

interface GridCell {
  position: number;
  top: string;
  left: string;
}

type SoloPhase =
  | 'loading'        // estado inicial mientras se prepara el nivel
  | 'variantIntro'   // 5s overlay con info del modo
  | 'countdown'      // 3-2-1
  | 'flashSequence'  // mostrando secuencia de celdas (variant flash)
  | 'flashRecall'    // jugador toca la secuencia
  | 'playing'        // ronda normal
  | 'roundResult'    // pausa entre rondas + reveal
  | 'final';         // pantalla final

@Component({
  selector: 'app-solo',
  standalone: true,
  imports: [CommonModule, TranslatePipe, SoloOnboardingComponent],
  templateUrl: './solo.component.html',
  styleUrl: './solo.component.css'
})
export class SoloComponent implements OnInit, OnDestroy {
  level!: SoloLevel;
  variant: GameVariant = 'classic';
  phase: SoloPhase = 'loading';
  showOnboarding = false;

  private questions: QuestionAsset[] = [];
  currentRoundNumber = 0;
  currentQuestion: QuestionAsset | null = null;

  /** Posiciones de las celdas que son la respuesta correcta */
  correctPositions: number[] = [];
  /** Posiciones que el usuario ya tocó correctamente */
  correctTapped: number[] = [];

  gridCells: GridCell[] = [];
  imageSize = 0;
  boardWidth = 0;
  boardHeight = 0;
  imagesLoaded = false;

  // ============== Estado por variante ==============
  /** flash (Simon): secuencia de posiciones a memorizar */
  flashSequence: number[] = [];
  /** flash: índice del paso que se está mostrando */
  flashSequenceIdx = -1;
  /** flash: posición resaltada AHORA (para parpadear durante secuencia) */
  flashHighlight = -1;
  /** flash: secuencia que el usuario ha tocado en recall */
  flashUserInput: number[] = [];

  /** blink: posición visible AHORA (cambia cada 800ms) */
  blinkPosition = -1;
  private blinkTimer: any;

  /** mirror: ¿la celda correcta va espejada? */
  mirrored = false;

  /** sudden: jugador eliminado */
  suddenDeathOver = false;

  // ============== UI / Timers ==============
  countdownValue = 0;
  timeRemaining = 0;
  private tickInterval: any;
  private roundTimer: any;
  private countdownTimer: any;
  private introTimer: any;
  private flashSeqTimer: any;
  private postAnswerTimer: any;
  private paramSub?: Subscription;
  private transitionTimer: any;
  private roundStartedAt = 0;

  // ============== Score ==============
  score = 0;
  correctCount = 0;
  wrongCount = 0;

  // ============== Resultado de la ronda ==============
  youAnswered = false;
  youAnsweredCorrect: boolean | null = null;
  youSelectedPosition = -1;
  /** Cuando true, mostrar las posiciones correctas con ✅ durante 2s */
  revealCorrect = false;

  // ============== Pantalla final ==============
  finalStarsEarned = 0;
  finalIsNewBest = false;
  finalNewlyUnlocked: number | undefined;
  finalRank: number | null = null;
  finalRankTotal = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    public i18n: I18nService,
    public progress: SoloProgressService,
    private ngZone: NgZone,
    private seo: SeoService,
    private analytics: AnalyticsService,
    private leaderboard: LeaderboardService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    // Suscribirse a paramMap permite detectar cambios de URL /solo/1 → /solo/2
    // sin que Angular destruya y reconstruya el componente.
    this.paramSub = this.route.paramMap.subscribe((params) => {
      const idStr = params.get('id') || '1';
      const id = Math.max(1, parseInt(idStr, 10) || 1);
      this.loadLevel(id);
    });
  }

  /** Carga un nivel por id, asignando variant según getLevelVariant() */
  private loadLevel(id: number): void {
    const lvl = this.progress.getLevel(id);
    if (!lvl) { this.router.navigate(['/levels']); return; }
    if (!this.progress.isLevelUnlocked(lvl.id)) { this.router.navigate(['/levels']); return; }

    // Limpiar estado del nivel anterior (si lo había)
    this.clearAllTimers();
    this.score = 0;
    this.correctCount = 0;
    this.wrongCount = 0;
    this.currentRoundNumber = 0;
    this.suddenDeathOver = false;
    this.youAnswered = false;
    this.youAnsweredCorrect = null;
    this.youSelectedPosition = -1;
    this.correctTapped = [];
    this.revealCorrect = false;

    this.level = lvl;

    // El modo viene determinado por el nivel — ciclo cada 8 niveles
    this.variant = getLevelVariant(lvl.id);

    this.questions = pickSoloQuestions(this.level.rounds);

    this.showOnboarding = SoloOnboardingComponent.shouldShow(this.platformId);

    this.seo.apply({
      titleKey: 'seo.solo.title',
      descKey: 'seo.solo.desc',
      canonicalPath: `/solo/${this.level.id}`
    });
    this.analytics.event('level_start', {
      level_id: this.level.id,
      variant: this.variant,
      rows: this.level.rows,
      columns: this.level.columns,
      time_limit: this.level.timeLimit,
      rounds: this.level.rounds
    });

    if (!this.showOnboarding) {
      this.startVariantIntro();
    }
  }

  ngOnDestroy(): void {
    this.clearAllTimers();
    this.paramSub?.unsubscribe();
  }

  onOnboardingFinished(): void {
    this.showOnboarding = false;
    this.startVariantIntro();
  }

  // ============================================================
  //  FLUJO: variantIntro → countdown → ronda
  // ============================================================
  private startVariantIntro(): void {
    this.clearAllTimers();
    // Usar requestAnimationFrame para asegurar que el cambio de fase
    // se aplique en el siguiente ciclo de change detection
    if (isPlatformBrowser(this.platformId)) {
      requestAnimationFrame(() => {
        this.ngZone.run(() => {
          this.phase = 'variantIntro';
          // 5s para que dé tiempo de leer
          this.introTimer = setTimeout(() => {
            this.introTimer = null;
            this.ngZone.run(() => this.runCountdown());
          }, 5000);
        });
      });
    } else {
      this.phase = 'variantIntro';
    }
  }

  /** Saltar la intro de variante (usuario presiona "Empezar ya") */
  skipIntro(): void {
    if (this.phase !== 'variantIntro') return;
    if (this.introTimer) {
      clearTimeout(this.introTimer);
      this.introTimer = null;
    }
    this.runCountdown();
  }

  private runCountdown(): void {
    this.phase = 'countdown';
    this.countdownValue = 3;
    this.clearAllTimers();
    this.countdownTimer = setInterval(() => {
      this.ngZone.run(() => {
        this.countdownValue -= 1;
        if (this.countdownValue <= 0) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = null;
          this.beginRound();
        }
      });
    }, 1000);
  }

  // ============================================================
  //  GENERAR LA RONDA según variante
  // ============================================================
  private beginRound(): void {
    this.currentRoundNumber += 1;
    this.currentQuestion = this.questions[this.currentRoundNumber - 1];

    // Reset por ronda
    this.youAnswered = false;
    this.youAnsweredCorrect = null;
    this.youSelectedPosition = -1;
    this.imagesLoaded = false;
    this.correctTapped = [];
    this.flashUserInput = [];
    this.flashHighlight = -1;
    this.mirrored = false;
    this.clearBlink();
    this.revealCorrect = false;

    // Calcular tamaño efectivo del grid (grow ajusta)
    const { rows, cols } = this.effectiveDimensions();
    const total = rows * cols;

    // Decidir posiciones correctas según variante
    this.correctPositions = this.pickCorrectPositions(total);

    // mirror: marca la flag visual
    this.mirrored = this.variant === 'mirror';

    this.preloadImages(
      [this.currentQuestion.urlRepeat, this.currentQuestion.urlUnique],
      () => {
        this.computeBoardDimensions();
        this.buildGrid();

        // Variante flash: arrancar secuencia. NO usa el grid de imagenes,
        // usa las celdas iluminadas en orden.
        if (this.variant === 'flash') {
          this.startFlashSequence();
        } else {
          this.startPlayingPhase();
        }
      }
    );
  }

  private pickCorrectPositions(total: number): number[] {
    const out: number[] = [];

    // Elegir cuántas posiciones según variante
    let count = 1;
    if (this.variant === 'double') count = 2;
    else if (this.variant === 'count') {
      // 1, 2 o 3 random — pero solo si el grid tiene espacio (mín 12 celdas)
      // Si el grid es pequeño, máximo 1/4 del total
      const maxByRatio = Math.max(1, Math.floor(total / 4));
      count = 1 + Math.floor(Math.random() * Math.min(3, maxByRatio));
    }
    else if (this.variant === 'grow') {
      // 1-3 random, pero asegurando que sea ≤ 1/4 del grid
      const maxByRatio = Math.max(1, Math.floor(total / 4));
      count = 1 + Math.floor(Math.random() * Math.min(3, maxByRatio));
    }
    else if (this.variant === 'flash') {
      // Progresión por ronda: r1 = 3, r2 = 3, r3 = 4, r4 = 5
      // Independiente del nivel.
      const r = this.currentRoundNumber;
      if (r <= 2) count = 3;
      else if (r === 3) count = 4;
      else count = 5;
      // No exceder la mitad del grid
      count = Math.min(count, Math.max(3, Math.floor(total / 2)));
    }

    while (out.length < count) {
      const p = Math.floor(Math.random() * total) + 1;
      if (!out.includes(p)) out.push(p);
    }
    return out;
  }

  private startPlayingPhase(): void {
    this.phase = 'playing';
    this.roundStartedAt = Date.now();
    this.startTick();
    this.roundTimer = setTimeout(() => {
      this.ngZone.run(() => this.endRound(false));
    }, this.level.timeLimit * 1000);

    // blink: empezar a mover la posición
    if (this.variant === 'blink') {
      this.blinkPosition = this.correctPositions[0];
      this.startBlinkMover();
    }
  }

  // ============================================================
  //  FLASH (Simon-says): mostrar secuencia, luego pedir recall
  // ============================================================
  private startFlashSequence(): void {
    this.phase = 'flashSequence';
    // Secuencia = posiciones correctas (ya generadas)
    this.flashSequence = [...this.correctPositions];
    this.flashSequenceIdx = -1;
    this.flashHighlight = -1;

    let step = 0;
    const showStep = () => {
      if (step >= this.flashSequence.length) {
        // Terminó la secuencia, abrir recall
        this.flashHighlight = -1;
        this.flashSeqTimer = setTimeout(() => {
          this.flashSeqTimer = null;
          this.ngZone.run(() => this.startFlashRecall());
        }, 600);
        return;
      }
      this.ngZone.run(() => {
        this.flashHighlight = this.flashSequence[step];
        this.flashSequenceIdx = step;
      });
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

  private startFlashRecall(): void {
    this.phase = 'flashRecall';
    this.flashUserInput = [];
    this.roundStartedAt = Date.now();
    this.startTick();
    this.roundTimer = setTimeout(() => {
      this.ngZone.run(() => this.endRound(false));
    }, this.level.timeLimit * 1000);
  }

  // ============================================================
  //  BLINK: la celda correcta se mueve cada 2s con flash overlay 200ms
  // ============================================================

  /** Cuando true, mostrar overlay flash (durante 200ms entre cambios) */
  blinkFlashing = false;

  private startBlinkMover(): void {
    this.clearBlink();
    this.blinkTimer = setInterval(() => {
      this.ngZone.run(() => {
        // Flash overlay 200ms antes del cambio
        this.blinkFlashing = true;
        // Después de 100ms (mitad del fade) cambiamos la posición
        setTimeout(() => {
          this.ngZone.run(() => {
            const { rows, cols } = this.effectiveDimensions();
            const total = rows * cols;
            let next: number;
            do {
              next = Math.floor(Math.random() * total) + 1;
            } while (next === this.blinkPosition);
            this.blinkPosition = next;
            // La "correcta" ahora es la nueva posición
            this.correctPositions = [next];
          });
        }, 100);
        // Y a los 200ms quitamos el overlay
        setTimeout(() => {
          this.ngZone.run(() => { this.blinkFlashing = false; });
        }, 200);
      });
    }, 2000); // 2s entre cambios
  }

  // ============================================================
  //  CLICK del usuario en una celda
  // ============================================================
  /** ¿Esta variante requiere botón "Confirmar"? (count/grow — modos donde no sabes cuántos hay) */
  get requiresConfirm(): boolean {
    return ['count', 'grow'].includes(this.variant);
  }

  selectCell(position: number): void {
    if (this.phase === 'flashRecall') {
      this.handleFlashRecallTap(position);
      return;
    }
    if (this.phase !== 'playing') return;
    if (this.youAnswered) return;

    const isCorrect = this.correctPositions.includes(position);

    if (isCorrect) {
      // ¿Ya tocó esta celda? (toggle: destocar)
      if (this.correctTapped.includes(position)) {
        if (this.requiresConfirm) {
          this.correctTapped = this.correctTapped.filter(p => p !== position);
        }
        return;
      }
      this.correctTapped.push(position);
      this.youSelectedPosition = position;
      this.playSound(true);

      // En modos sin confirm: si tocó todas, acierto inmediato
      if (!this.requiresConfirm && this.correctTapped.length === this.correctPositions.length) {
        this.youAnswered = true;
        this.youAnsweredCorrect = true;
        this.awardPoints();
        this.postAnswerTimer = setTimeout(() => {
          this.postAnswerTimer = null;
          this.endRound(true);
        }, 250);
      }
      // En modos con confirm: solo marca y espera el botón
    } else {
      // Falla inmediata (independiente del modo)
      this.youAnswered = true;
      this.youAnsweredCorrect = false;
      this.youSelectedPosition = position;
      this.playSound(false);
      this.wrongCount += 1;
      if (this.variant === 'sudden') this.suddenDeathOver = true;
      this.postAnswerTimer = setTimeout(() => {
        this.postAnswerTimer = null;
        this.endRound(true);
      }, 250);
    }
  }

  /** El usuario presiona "Confirmar". Si tocó todas las correctas → acierto, sino fallo. */
  confirmAnswer(): void {
    if (!this.requiresConfirm) return;
    if (this.phase !== 'playing') return;
    if (this.youAnswered) return;

    const allCorrect = this.correctTapped.length === this.correctPositions.length;
    this.youAnswered = true;

    if (allCorrect) {
      this.youAnsweredCorrect = true;
      this.playSound(true);
      this.awardPoints();
    } else {
      this.youAnsweredCorrect = false;
      this.playSound(false);
      this.wrongCount += 1;
      if (this.variant === 'sudden') this.suddenDeathOver = true;
    }

    this.postAnswerTimer = setTimeout(() => {
      this.postAnswerTimer = null;
      this.endRound(true);
    }, 250);
  }

  private handleFlashRecallTap(position: number): void {
    if (this.youAnswered) return;
    const idx = this.flashUserInput.length;
    const expected = this.flashSequence[idx];
    if (position === expected) {
      this.flashUserInput.push(position);
      this.youSelectedPosition = position;
      this.playSound(true);
      // ¿Completó toda la secuencia?
      if (this.flashUserInput.length === this.flashSequence.length) {
        this.youAnswered = true;
        this.youAnsweredCorrect = true;
        this.awardPoints();
        this.postAnswerTimer = setTimeout(() => {
          this.postAnswerTimer = null;
          this.endRound(true);
        }, 250);
      }
    } else {
      // Falla en la secuencia
      this.youAnswered = true;
      this.youAnsweredCorrect = false;
      this.youSelectedPosition = position;
      this.playSound(false);
      this.wrongCount += 1;
      if (this.variant === 'sudden') this.suddenDeathOver = true;
      this.postAnswerTimer = setTimeout(() => {
        this.postAnswerTimer = null;
        this.endRound(true);
      }, 250);
    }
  }

  private awardPoints(): void {
    const elapsedSec = (Date.now() - this.roundStartedAt) / 1000;
    const timeFactor = Math.max(
      0,
      (this.level.timeLimit - elapsedSec) / this.level.timeLimit
    );
    let points = Math.round(this.level.pointsBase * (1 + timeFactor));

    // Bonus por dificultad de variante
    switch (this.variant) {
      case 'flash': points = Math.round(points * 1.5); break;
      case 'double': points = Math.round(points * 1.3); break;
      case 'count': points = Math.round(points * (1.2 + this.correctPositions.length * 0.15)); break;
      case 'mirror': points = Math.round(points * 1.25); break;
      case 'blink': points = Math.round(points * 1.6); break;
      case 'sudden': points = Math.round(points * 2.5); break;
      case 'grow': points = Math.round(points * (1 + this.currentRoundNumber * 0.15)); break;
    }

    this.score += points;
    this.correctCount += 1;
  }

  private endRound(answered: boolean): void {
    if (this.phase !== 'playing' && this.phase !== 'flashRecall') return;

    if (!answered) {
      // Sin respuesta = falló
      this.wrongCount += 1;
      this.youAnswered = true;
      this.youAnsweredCorrect = false;
      if (this.variant === 'sudden') this.suddenDeathOver = true;
    }

    this.stopTick();
    this.clearBlink();
    this.clearRoundTimer();

    // Fase 1: Mostrar ✅/❌ durante 2s
    this.revealCorrect = true;

    const isLastRound = this.currentRoundNumber >= this.level.rounds;
    const suddenEnd = this.variant === 'sudden' && this.suddenDeathOver;

    this.clearTransitionTimer();
    if (isLastRound || suddenEnd) {
      // Final del nivel: 2s con reveal, luego ir al final
      this.transitionTimer = setTimeout(() => {
        this.transitionTimer = null;
        this.ngZone.run(() => this.goFinal());
      }, 2000);
    } else {
      this.phase = 'roundResult';
      // Fase 1 (2s): reveal visible
      this.transitionTimer = setTimeout(() => {
        this.ngZone.run(() => {
          this.revealCorrect = false;
        });
        // Fase 2 (2s adicionales): grid limpio sin badges, para que el usuario procese
        this.transitionTimer = setTimeout(() => {
          this.transitionTimer = null;
          this.ngZone.run(() => {
            this.runCountdown();
          });
        }, 2000);
      }, 2000);
    }
  }

  /** ¿Pasó el 70% de las rondas? (umbral para considerar el nivel completado) */
  get passedThreshold(): boolean {
    if (this.level.rounds === 0) return false;
    return (this.correctCount / this.level.rounds) >= 0.7;
  }

  /** % de aciertos */
  get correctPercent(): number {
    if (this.level.rounds === 0) return 0;
    return Math.round((this.correctCount / this.level.rounds) * 100);
  }

  /** ¿El usuario debe repetir automáticamente el nivel? */
  autoRetryPending = false;

  private async goFinal(): Promise<void> {
    this.phase = 'final';

    // Sudden death cuenta como fallo automático del nivel (ya elimina suddenDeathOver)
    // 70% threshold: si no llegó, NO se considera completado y se reintenta
    const failedThreshold = !this.suddenDeathOver && !this.passedThreshold;

    if (failedThreshold || this.suddenDeathOver) {
      // No registrar el resultado como completado — el nivel queda sin pasar
      this.finalStarsEarned = 0;
      this.finalIsNewBest = false;
      this.finalNewlyUnlocked = undefined;
      this.autoRetryPending = true;

      this.analytics.event('level_failed', {
        level_id: this.level.id,
        variant: this.variant,
        score: this.score,
        correct: this.correctCount,
        wrong: this.wrongCount,
        percent: this.correctPercent,
        reason: this.suddenDeathOver ? 'sudden_death' : 'below_70'
      });

      // Auto-retry tras 4 segundos (tiempo para leer el mensaje)
      this.transitionTimer = setTimeout(() => {
        this.transitionTimer = null;
        this.ngZone.run(() => this.retryLevel());
      }, 4000);
      return;
    }

    // Pasó el nivel: registrar y dar estrellas
    const result = this.progress.recordLevelResult(this.level, this.score);
    this.finalStarsEarned = result.starsEarned;
    this.finalIsNewBest = result.isNewBest;
    this.finalNewlyUnlocked = result.newlyUnlockedLevel;
    this.analytics.event('level_complete', {
      level_id: this.level.id,
      variant: this.variant,
      score: this.score,
      stars: result.starsEarned,
      correct: this.correctCount,
      wrong: this.wrongCount,
      percent: this.correctPercent
    });

    if (this.leaderboard.hasProfile() && this.score > 0) {
      const ranked = await this.leaderboard.submit(this.score, result.starsEarned);
      if (ranked) {
        this.finalRank = ranked.rank;
        this.finalRankTotal = ranked.total;
      }
    }
  }

  // ============================================================
  //  ACCIONES UI: Reintentar, siguiente, etc.
  // ============================================================
  retryLevel(): void {
    this.clearAllTimers();
    this.score = 0;
    this.correctCount = 0;
    this.wrongCount = 0;
    this.currentRoundNumber = 0;
    this.suddenDeathOver = false;
    this.autoRetryPending = false;
    this.questions = pickSoloQuestions(this.level.rounds);
    this.startVariantIntro();
  }

  nextLevel(): void {
    const next = this.progress.getLevel(this.level.id + 1);
    if (!next || !this.progress.isLevelUnlocked(next.id)) {
      this.router.navigate(['/levels']);
      return;
    }
    // navigate dispara paramSub que llama loadLevel() — no duplicamos lógica
    this.router.navigate(['/solo', next.id]);
  }

  goLevels(): void { this.router.navigate(['/levels']); }
  goHome(): void { this.router.navigate(['/home']); }
  goLeaderboard(): void { this.router.navigate(['/leaderboard']); }

  // ============================================================
  //  GRID HELPERS
  // ============================================================
  /** Filas/columnas efectivas según ronda. grow las hace crecer. */
  effectiveDimensions(): { rows: number; cols: number } {
    if (this.variant === 'grow') {
      // Empieza más pequeño y crece. Mínimo 3x4 = 12 celdas para que 3 diferentes
      // sean ≤ 1/4 del total (12/4 = 3, ≤3 OK).
      const baseR = Math.max(3, this.level.rows - this.level.rounds + 1);
      const baseC = Math.max(4, this.level.columns - this.level.rounds + 1);
      const r = Math.min(Math.max(this.level.rows, 3), baseR + (this.currentRoundNumber - 1));
      const c = Math.min(Math.max(this.level.columns, 4), baseC + (this.currentRoundNumber - 1));
      return { rows: r, cols: c };
    }
    if (this.variant === 'count') {
      // count requiere min 3x4 = 12 celdas para que el max (3) sea ≤ 1/4
      const r = Math.max(3, this.level.rows);
      const c = Math.max(4, this.level.columns);
      return { rows: r, cols: c };
    }
    return { rows: this.level.rows, cols: this.level.columns };
  }

  private computeBoardDimensions(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.boardWidth = 800;
      this.boardHeight = 600;
      this.imageSize = 0;
      return;
    }
    const { rows, cols } = this.effectiveDimensions();
    const aspectRatio = cols / rows;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const horizontalPadding = vw < 520 ? 16 : 32;
    // Una sola barra arriba (header+hint fusionado) + botón confirm cuando aplica
    const needsConfirmSpace = ['count', 'grow'].includes(this.variant);
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
    this.imageSize = w / cols;
  }

  private buildGrid(): void {
    this.gridCells = [];
    const { rows, cols } = this.effectiveDimensions();
    let n = 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.gridCells.push({
          position: n++,
          top: r * this.imageSize + 'px',
          left: c * this.imageSize + 'px'
        });
      }
    }
  }

  /** Posición top/left para una celda dada (para overlays como ✅) */
  cellPos(position: number): { top: string; left: string } {
    const { cols } = this.effectiveDimensions();
    const index = position - 1;
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      top: row * this.imageSize + 'px',
      left: col * this.imageSize + 'px'
    };
  }

  /** ¿Esta celda es una de las correctas? */
  isCorrect(pos: number): boolean {
    return this.correctPositions.includes(pos);
  }

  /** ¿Mostrar la imagen "única" en esta celda?
   * - classic/double/count/grow/mirror: en correctPositions
   * - blink: solo en blinkPosition (la actual)
   * - flash: NO se muestra imagen única (todas iguales, se iluminan celdas)
   */
  shouldShowUnique(pos: number): boolean {
    if (this.variant === 'flash') return false;
    if (this.variant === 'blink') return pos === this.blinkPosition;
    return this.correctPositions.includes(pos);
  }

  /** ¿Esta celda está iluminada para flash? */
  isFlashHighlighted(pos: number): boolean {
    if (this.variant !== 'flash') return false;
    if (this.phase === 'flashSequence') return pos === this.flashHighlight;
    if (this.phase === 'flashRecall') {
      // Mostrar las que el usuario ya tocó correctamente
      return this.flashUserInput.includes(pos);
    }
    return false;
  }

  // ============================================================
  //  TICK / TIMERS
  // ============================================================
  private startTick(): void {
    this.timeRemaining = this.level.timeLimit;
    this.stopTick();
    this.tickInterval = setInterval(() => {
      this.ngZone.run(() => {
        this.timeRemaining = Math.max(0, this.timeRemaining - 1);
        if (this.timeRemaining <= 0) this.stopTick();
      });
    }, 1000);
  }

  private stopTick(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private clearBlink(): void {
    if (this.blinkTimer) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
  }

  private clearRoundTimer(): void {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }

  private clearTransitionTimer(): void {
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.stopTick();
    this.clearBlink();
    this.clearRoundTimer();
    this.clearTransitionTimer();
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
    if (this.introTimer) { clearTimeout(this.introTimer); this.introTimer = null; }
    if (this.flashSeqTimer) { clearTimeout(this.flashSeqTimer); this.flashSeqTimer = null; }
    if (this.postAnswerTimer) { clearTimeout(this.postAnswerTimer); this.postAnswerTimer = null; }
  }

  private preloadImages(urls: string[], done: () => void): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.imagesLoaded = true;
      done();
      return;
    }
    let loaded = 0;
    urls.forEach((url) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        this.ngZone.run(() => {
          loaded++;
          if (loaded === urls.length) {
            this.imagesLoaded = true;
            setTimeout(done, 100);
          }
        });
      };
      img.src = url;
    });
  }

  private playSound(correct: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const audio = new Audio(
        correct ? 'assets/audio/correct-answer.mp3' : 'assets/audio/wrong-answer.mp3'
      );
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}
  }

  // ============================================================
  //  GETTERS para template
  // ============================================================
  get timePercent(): number {
    return Math.max(0, (this.timeRemaining / this.level.timeLimit) * 100);
  }

  get starsArray(): boolean[] {
    return [
      this.finalStarsEarned >= 1,
      this.finalStarsEarned >= 2,
      this.finalStarsEarned >= 3
    ];
  }

  get hasNextLevel(): boolean {
    const next = this.progress.getLevel(this.level.id + 1);
    return !!next && this.progress.isLevelUnlocked(next.id);
  }

  /** Posiciones correctas que el usuario NO tocó. Se muestran con ❌ durante el reveal de un fallo en count. */
  get missedPositions(): number[] {
    return this.correctPositions.filter(p => !this.correctTapped.includes(p));
  }

  /** ¿Es el último nivel del juego? (para mostrar opción "volver al 1") */
  get isLastLevel(): boolean {
    return !this.progress.getLevel(this.level.id + 1);
  }

  /** Volver al nivel 1 (desde el final del juego) */
  restartFromLevel1(): void {
    this.router.navigate(['/solo', 1]);
  }

  /** Emoji del modo actual */
  get variantEmoji(): string {
    const map: Record<GameVariant, string> = {
      classic: '🎯', double: '👯', flash: '⚡', count: '🔢',
      mirror: '🪞', blink: '👁️', sudden: '💀', grow: '📈'
    };
    return map[this.variant];
  }

  /** Nombre del modo (i18n) */
  get variantLabel(): string {
    return this.i18n.t(('solo.variant.' + this.variant + '.name') as any);
  }

  /** Hint del modo (i18n) */
  get variantHint(): string {
    return this.i18n.t(('solo.variant.' + this.variant + '.hint') as any);
  }

  /** Hint corto para la barra persistente arriba */
  get variantHintShort(): string {
    return this.i18n.t(('solo.variant.' + this.variant + '.short') as any);
  }

  /** Cuántas celdas faltan (modos count/double/grow) */
  get remainingTaps(): number {
    return this.correctPositions.length - this.correctTapped.length;
  }

  /** Mostrar contador de "X / Y encontrados" */
  get showProgress(): boolean {
    return ['double', 'count', 'grow'].includes(this.variant)
      && this.correctPositions.length > 1;
  }

  trackByPosition(_i: number, c: GridCell): number {
    return c.position;
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.phase === 'playing' || this.phase === 'flashRecall' || this.phase === 'flashSequence') {
      this.computeBoardDimensions();
      this.buildGrid();
    }
  }
}
