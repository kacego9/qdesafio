import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, EventEmitter, Inject, Input, Output, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../i18n/i18n.service';

const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐯', '🐵', '🐨', '🐙', '🦄', '🦉', '🐢', '🦋'];

export interface IdentityPayload {
  name: string;
  avatar: string;
}

@Component({
  selector: 'app-identity-form',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <div class="form">
      <!-- Nombre -->
      <div class="field">
        <label>{{ 'identity.yourName' | t }}</label>
        <input
          type="text"
          class="input"
          [(ngModel)]="name"
          [placeholder]="'identity.namePlaceholder' | t"
          maxlength="16"
          autocomplete="off"
          (keydown.enter)="submit()"
        />
      </div>

      <!-- Avatar -->
      <div class="field">
        <label>{{ 'identity.chooseAvatar' | t }}</label>
        <div class="avatars">
          <button
            type="button"
            class="avatar-btn"
            *ngFor="let a of avatars"
            [class.active]="avatar === a"
            (click)="avatar = a"
          >{{ a }}</button>
        </div>
      </div>

      <!-- Error -->
      <div class="error" *ngIf="errorText">⚠ {{ errorText }}</div>

      <!-- Actions -->
      <div class="actions">
        <button type="button" class="btn-back" (click)="cancelled.emit()">
          {{ 'identity.back' | t }}
        </button>
        <button
          type="button"
          class="btn-submit"
          (click)="submit()"
          [disabled]="!canSubmit || loading"
        >
          <span *ngIf="!loading">{{ submitLabel || ('identity.continue' | t) }}</span>
          <span *ngIf="loading" class="spin">⏳</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    label {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.15em;
      color: #b8a9d9;
      text-transform: uppercase;
    }
    .input {
      width: 100%;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.04);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      color: #fff;
      font-family: inherit;
      font-size: 16px;
      font-weight: 500;
      outline: none;
      transition: border-color 0.2s, background 0.2s;
      box-sizing: border-box;
    }
    .input:focus {
      border-color: #00f5ff;
      background: rgba(0, 245, 255, 0.05);
    }
    .input::placeholder { color: rgba(184, 169, 217, 0.5); }

    .avatars {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 8px;
    }
    .avatar-btn {
      aspect-ratio: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      font-size: 26px;
      cursor: pointer;
      transition: all 0.15s;
      padding: 0;
    }
    .avatar-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      transform: translateY(-2px);
    }
    .avatar-btn.active {
      border-color: #ff006e;
      background: rgba(255, 0, 110, 0.15);
      box-shadow: 0 0 16px rgba(255, 0, 110, 0.3);
    }

    .error {
      padding: 10px 14px;
      background: rgba(255, 0, 110, 0.15);
      border: 1px solid rgba(255, 0, 110, 0.4);
      border-radius: 10px;
      color: #ff5088;
      font-size: 13px;
    }

    .actions {
      display: flex;
      gap: 10px;
      margin-top: 6px;
    }
    .btn-back {
      flex: 0 0 auto;
      padding: 14px 20px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      color: #fff;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-back:hover { background: rgba(255, 255, 255, 0.1); }

    .btn-submit {
      flex: 1;
      padding: 14px 20px;
      background: linear-gradient(135deg, #ff006e, #8338ec);
      border: none;
      border-radius: 12px;
      color: #fff;
      font-family: inherit;
      font-size: 15px;
      font-weight: 800;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 8px 24px rgba(255, 0, 110, 0.4);
    }
    .btn-submit:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-submit:not(:disabled):hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 32px rgba(255, 0, 110, 0.5);
    }

    .spin { animation: spin 1s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class IdentityFormComponent {
  @Input() submitLabel: string = '';
  @Input() loading: boolean = false;
  @Input() errorText: string = '';
  @Input() initialName: string = '';

  @Output() submitted = new EventEmitter<IdentityPayload>();
  @Output() cancelled = new EventEmitter<void>();

  avatars = AVATARS;
  name: string = '';
  // No usar Math.random() en field initializer porque rompe hydration SSR.
  // Se asigna en ngOnInit (browser only).
  avatar: string = AVATARS[0];

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {
    if (this.initialName) this.name = this.initialName;
    if (isPlatformBrowser(this.platformId)) {
      this.avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    }
  }

  get canSubmit(): boolean {
    return this.name.trim().length >= 1 && this.avatar !== '';
  }

  submit(): void {
    if (!this.canSubmit || this.loading) return;
    this.submitted.emit({ name: this.name.trim(), avatar: this.avatar });
  }
}
