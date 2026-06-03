import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '../../i18n/i18n.service';
import { SoloProgressService } from '../../services/solo-progress.service';

export type GameModeChoice = 'solo' | 'create' | 'join';

@Component({
  selector: 'app-mode-picker',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="mp-overlay" (click)="onOverlayClick($event)">
      <div class="mp-card" role="dialog" aria-modal="true">
        <button class="mp-close" (click)="close.emit()" aria-label="Close">✕</button>

        <div class="mp-header">
          <div class="mp-tag">{{ 'modePicker.tag' | t }}</div>
          <h2>{{ 'modePicker.title' | t }}</h2>
          <p>{{ 'modePicker.subtitle' | t }}</p>
        </div>

        <!-- SOLO -->
        <button class="mp-option solo" (click)="pick.emit('solo')">
          <div class="mp-option-emoji">🎯</div>
          <div class="mp-option-body">
            <div class="mp-option-title">
              {{ hasProgress ? ('modePicker.continueTitle' | t) : ('modePicker.soloTitle' | t) }}
            </div>
            <div class="mp-option-desc">
              {{ hasProgress
                  ? ('modePicker.continueDesc' | t : { level: nextLevelId, stars: progress.current.totalStars })
                  : ('modePicker.soloDesc' | t) }}
            </div>
          </div>
          <div class="mp-option-arrow">→</div>
        </button>

        <div class="mp-divider">
          <span>{{ 'modePicker.withFriends' | t }}</span>
        </div>

        <!-- CREATE -->
        <button class="mp-option" (click)="pick.emit('create')">
          <div class="mp-option-emoji">👥</div>
          <div class="mp-option-body">
            <div class="mp-option-title">{{ 'modePicker.createTitle' | t }}</div>
            <div class="mp-option-desc">{{ 'modePicker.createDesc' | t }}</div>
          </div>
          <div class="mp-option-arrow">→</div>
        </button>

        <!-- JOIN -->
        <button class="mp-option" (click)="pick.emit('join')">
          <div class="mp-option-emoji">🔑</div>
          <div class="mp-option-body">
            <div class="mp-option-title">{{ 'modePicker.joinTitle' | t }}</div>
            <div class="mp-option-desc">{{ 'modePicker.joinDesc' | t }}</div>
          </div>
          <div class="mp-option-arrow">→</div>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .mp-overlay {
      position: fixed;
      inset: 0;
      background: rgba(5, 0, 18, 0.78);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 9999;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      animation: mpFadeIn 0.2s ease;
      padding: 12px;
    }
    @media (min-width: 640px) {
      .mp-overlay { align-items: center; }
    }
    @keyframes mpFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .mp-card {
      width: 100%;
      max-width: 480px;
      background: rgba(20, 10, 40, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px 24px 16px 16px;
      padding: 24px 20px 20px;
      box-shadow: 0 -20px 60px rgba(0, 0, 0, 0.6);
      animation: mpSlideUp 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.1);
      position: relative;
      max-height: 92vh;
      overflow-y: auto;
    }
    @media (min-width: 640px) {
      .mp-card {
        border-radius: 24px;
        animation: mpScaleIn 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.1);
      }
    }
    @keyframes mpSlideUp {
      from { transform: translateY(40px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes mpScaleIn {
      from { transform: scale(0.92); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .mp-close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: rgba(255, 255, 255, 0.06);
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .mp-close:hover { background: rgba(255, 255, 255, 0.12); }

    .mp-header {
      text-align: center;
      margin-bottom: 18px;
      padding: 0 12px;
    }
    .mp-tag {
      font-size: 11px;
      letter-spacing: 0.25em;
      color: #00f5ff;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .mp-header h2 {
      font-size: 22px;
      font-weight: 900;
      margin: 0 0 6px;
      line-height: 1.2;
    }
    .mp-header p {
      margin: 0;
      font-size: 13px;
      color: #b8a9d9;
      line-height: 1.5;
    }

    .mp-option {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      padding: 16px 14px;
      margin-bottom: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      cursor: pointer;
      transition: transform 0.15s, border-color 0.15s, background 0.15s;
      color: #fff;
      font-family: inherit;
      text-align: left;
      min-height: 76px;
    }
    .mp-option:hover {
      border-color: rgba(255, 0, 110, 0.4);
      background: rgba(255, 0, 110, 0.06);
      transform: translateY(-2px);
    }
    .mp-option:active { transform: translateY(0); }
    .mp-option.solo {
      background: linear-gradient(120deg, rgba(255, 0, 110, 0.18), rgba(131, 56, 236, 0.1));
      border-color: rgba(255, 0, 110, 0.35);
    }

    .mp-option-emoji {
      font-size: 36px;
      flex-shrink: 0;
      line-height: 1;
    }
    .mp-option-body { flex: 1; min-width: 0; }
    .mp-option-title {
      font-size: 15px;
      font-weight: 800;
      line-height: 1.2;
      margin-bottom: 4px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }
    .mp-recommended {
      display: inline-block;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 8px;
      background: linear-gradient(135deg, #ff006e, #ffbe0b);
      color: #fff;
    }
    .mp-option-desc {
      font-size: 12.5px;
      color: #b8a9d9;
      line-height: 1.4;
    }
    .mp-option-arrow {
      font-size: 20px;
      color: #b8a9d9;
      font-weight: 800;
      flex-shrink: 0;
    }

    .mp-divider {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 14px 4px 10px;
      color: #6f5f8f;
      font-size: 11px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      font-weight: 700;
    }
    .mp-divider::before,
    .mp-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: rgba(255, 255, 255, 0.08);
    }
  `]
})
export class ModePickerComponent {
  @Output() close = new EventEmitter<void>();
  @Output() pick = new EventEmitter<GameModeChoice>();

  constructor(public progress: SoloProgressService) {}

  get hasProgress(): boolean {
    return this.progress.current.totalStars > 0
      || this.progress.current.highestLevelUnlocked > 1;
  }

  get nextLevelId(): number {
    return Math.min(
      this.progress.current.highestLevelUnlocked,
      this.progress.levels.length
    );
  }

  onOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.close.emit();
  }
}
