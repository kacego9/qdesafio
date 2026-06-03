import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, EventEmitter, Inject, Output, PLATFORM_ID } from '@angular/core';
import { TranslatePipe } from '../../i18n/i18n.service';

const STORAGE_KEY = 'qdesafio.onboarding.solo.completed.v1';

/**
 * Tutorial visual de 3 pasos que aparece la PRIMERA vez que un usuario
 * entra al modo solo. Se persiste en localStorage para no volver a mostrarse.
 */
@Component({
  selector: 'app-solo-onboarding',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="ob-overlay" (click)="onOverlayClick($event)">
      <div class="ob-card">
        <div class="ob-progress">
          <span *ngFor="let _ of [].constructor(totalSteps); let i = index"
                class="ob-dot"
                [class.active]="i === step"
                [class.done]="i < step"></span>
        </div>

        <ng-container [ngSwitch]="step">
          <!-- PASO 1 -->
          <div *ngSwitchCase="0" class="ob-step">
            <div class="ob-emoji">👀</div>
            <h2>{{ 'onboarding.s1.title' | t }}</h2>
            <p>{{ 'onboarding.s1.text' | t }}</p>
            <div class="ob-visual">
              <div class="ob-grid">
                <span *ngFor="let _ of [].constructor(8)">😀</span>
                <span class="odd">😎</span>
                <span *ngFor="let _ of [].constructor(7)">😀</span>
              </div>
              <div class="ob-arrow-down"></div>
              <div class="ob-hint">{{ 'onboarding.s1.hint' | t }}</div>
            </div>
          </div>

          <!-- PASO 2 -->
          <div *ngSwitchCase="1" class="ob-step">
            <div class="ob-emoji">⏱️</div>
            <h2>{{ 'onboarding.s2.title' | t }}</h2>
            <p>{{ 'onboarding.s2.text' | t }}</p>
            <ul class="ob-list">
              <li>⚡ {{ 'onboarding.s2.b1' | t }}</li>
              <li>🚫 {{ 'onboarding.s2.b2' | t }}</li>
              <li>⏰ {{ 'onboarding.s2.b3' | t }}</li>
            </ul>
          </div>

          <!-- PASO 3 -->
          <div *ngSwitchCase="2" class="ob-step">
            <div class="ob-emoji">⭐</div>
            <h2>{{ 'onboarding.s3.title' | t }}</h2>
            <p>{{ 'onboarding.s3.text' | t }}</p>
            <div class="ob-stars-row">
              <div class="ob-stars">
                <span class="filled">★</span>
                <span>★</span><span>★</span>
              </div>
              <div class="ob-stars">
                <span class="filled">★★</span>
                <span>★</span>
              </div>
              <div class="ob-stars">
                <span class="filled">★★★</span>
              </div>
            </div>
            <p class="ob-tip">💡 {{ 'onboarding.s3.tip' | t }}</p>
          </div>
        </ng-container>

        <div class="ob-actions">
          <button *ngIf="step > 0" class="ob-btn ghost" (click)="prev()">
            ← {{ 'onboarding.prev' | t }}
          </button>
          <button class="ob-btn skip" (click)="finish()">
            {{ step < totalSteps - 1 ? ('onboarding.skip' | t) : '' }}
          </button>
          <button class="ob-btn primary" (click)="next()">
            {{ step < totalSteps - 1 ? ('onboarding.next' | t) : ('onboarding.start' | t) }}
            {{ step < totalSteps - 1 ? ' →' : ' 🚀' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .ob-overlay {
      position: fixed;
      inset: 0;
      background: rgba(5, 0, 18, 0.88);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      animation: obFade 0.25s ease;
    }
    @keyframes obFade {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .ob-card {
      width: 100%;
      max-width: 440px;
      background: rgba(20, 10, 40, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 24px 22px 18px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
    }

    .ob-progress {
      display: flex;
      gap: 6px;
      justify-content: center;
      margin-bottom: 18px;
    }
    .ob-dot {
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.12);
      transition: background 0.2s;
    }
    .ob-dot.active { background: #ff006e; }
    .ob-dot.done { background: #06ffa5; }

    .ob-step {
      text-align: center;
      padding: 6px 0 18px;
      animation: obStepIn 0.3s ease;
    }
    @keyframes obStepIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ob-emoji { font-size: 56px; line-height: 1; }
    .ob-step h2 {
      font-size: 22px;
      font-weight: 900;
      margin: 8px 0 6px;
      line-height: 1.2;
    }
    .ob-step p {
      font-size: 14px;
      color: #b8a9d9;
      line-height: 1.55;
      margin: 0 auto 14px;
      max-width: 340px;
    }

    .ob-visual { padding: 8px 0; }
    .ob-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 4px;
      max-width: 200px;
      margin: 0 auto 8px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
    }
    .ob-grid span {
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 6px;
    }
    .ob-grid span.odd {
      background: rgba(6, 255, 165, 0.2);
      border: 2px solid #06ffa5;
      animation: obPulse 1.4s ease infinite;
    }
    @keyframes obPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(6, 255, 165, 0.5); }
      50% { box-shadow: 0 0 0 8px rgba(6, 255, 165, 0); }
    }
    .ob-arrow-down {
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 10px solid #06ffa5;
      margin: 0 auto;
    }
    .ob-hint {
      font-size: 12px;
      color: #06ffa5;
      font-weight: 700;
      letter-spacing: 0.05em;
      margin-top: 4px;
    }

    .ob-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: 320px;
      margin: 0 auto;
    }
    .ob-list li {
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      font-size: 13px;
      text-align: left;
      color: #cfc4e8;
    }

    .ob-stars-row {
      display: flex;
      justify-content: center;
      gap: 14px;
      margin: 8px 0 10px;
      flex-wrap: wrap;
    }
    .ob-stars {
      font-size: 20px;
      letter-spacing: 1px;
      color: rgba(255, 255, 255, 0.2);
    }
    .ob-stars .filled {
      color: #ffbe0b;
      text-shadow: 0 0 8px rgba(255, 190, 11, 0.5);
    }
    .ob-tip {
      font-size: 12.5px !important;
      color: #ffbe0b !important;
      background: rgba(255, 190, 11, 0.08);
      padding: 8px 12px;
      border-radius: 8px;
      max-width: 320px !important;
      line-height: 1.45 !important;
    }

    .ob-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }
    .ob-btn {
      padding: 12px 16px;
      border-radius: 10px;
      border: none;
      font-family: inherit;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.05em;
      cursor: pointer;
      transition: transform 0.15s, background 0.15s;
      color: #fff;
    }
    .ob-btn.ghost {
      background: transparent;
      color: #b8a9d9;
      padding: 12px 8px;
    }
    .ob-btn.skip {
      background: transparent;
      color: #6f5f8f;
      flex: 1;
      text-align: left;
      padding: 12px 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .ob-btn.skip:hover { color: #b8a9d9; }
    .ob-btn.primary {
      background: linear-gradient(135deg, #ff006e, #8338ec);
      box-shadow: 0 6px 16px rgba(255, 0, 110, 0.4);
      flex: 0 0 auto;
    }
    .ob-btn.primary:hover {
      transform: translateY(-2px);
    }
  `]
})
export class SoloOnboardingComponent {
  @Output() finishEvent = new EventEmitter<void>();

  step = 0;
  totalSteps = 3;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  /** Estatico: ¿hay que mostrar el onboarding a este usuario? */
  static shouldShow(platformId: Object): boolean {
    if (!isPlatformBrowser(platformId)) return false;
    return localStorage.getItem(STORAGE_KEY) !== '1';
  }

  next(): void {
    if (this.step < this.totalSteps - 1) {
      this.step += 1;
    } else {
      this.finish();
    }
  }

  prev(): void {
    if (this.step > 0) this.step -= 1;
  }

  finish(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, '1');
    }
    this.finishEvent.emit();
  }

  onOverlayClick(_e: MouseEvent): void {
    // No cerramos al hacer click fuera para forzar a leer al menos una vez.
  }
}
