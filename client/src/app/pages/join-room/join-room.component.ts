import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RoomService } from '../../services/room.service';
import { I18nService, TranslatePipe } from '../../i18n/i18n.service';
import { IdentityFormComponent, IdentityPayload } from '../../components/identity-form/identity-form.component';

@Component({
  selector: 'app-join-room',
  standalone: true,
  imports: [CommonModule, FormsModule, IdentityFormComponent, TranslatePipe],
  template: `
    <section class="page">
      <div class="card">
        <div class="head">
          <div class="head-emoji">🔑</div>
          <h1>{{ 'join.title' | t }}</h1>
        </div>

        <!-- Paso 1: código -->
        <div class="code-section" *ngIf="step === 'code'">
          <label>{{ 'join.codeLabel' | t }}</label>
          <input
            class="code-input"
            [(ngModel)]="code"
            [placeholder]="'join.codePlaceholder' | t"
            maxlength="4"
            autocomplete="off"
            autocapitalize="characters"
            (input)="code = code.toUpperCase()"
            (keydown.enter)="nextStep()"
          />

          <div class="actions">
            <button class="btn-back" (click)="goBack()">
              {{ 'identity.back' | t }}
            </button>
            <button class="btn-next" (click)="nextStep()" [disabled]="code.length !== 4">
              {{ 'identity.continue' | t }}
            </button>
          </div>
        </div>

        <!-- Paso 2: identidad -->
        <div class="identity-section" *ngIf="step === 'identity'">
          <div class="code-display">
            <span class="code-label">{{ 'lobby.code' | t }}:</span>
            <span class="code-value">{{ code }}</span>
            <button class="code-edit" (click)="step = 'code'" aria-label="Edit code">✎</button>
          </div>

          <app-identity-form
            [submitLabel]="'join.join' | t"
            [loading]="loading"
            [errorText]="errorText"
            (submitted)="onSubmit($event)"
            (cancelled)="step = 'code'"
          ></app-identity-form>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; color: #fff; }
    .page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 80px 20px 40px;
    }
    .card {
      width: 100%;
      max-width: 460px;
      background: rgba(20, 10, 40, 0.7);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      padding: 32px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      animation: cardIn 0.5s ease;
    }
    @keyframes cardIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .head {
      text-align: center;
      margin-bottom: 28px;
    }
    .head-emoji {
      font-size: 44px;
      margin-bottom: 8px;
    }
    .head h1 {
      font-size: 24px;
      font-weight: 800;
      margin: 0;
    }

    .code-section {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .code-section label {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.15em;
      color: #b8a9d9;
      text-transform: uppercase;
      text-align: center;
    }
    .code-input {
      width: 100%;
      padding: 20px;
      background: rgba(255, 255, 255, 0.04);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      color: #fff;
      font-family: 'Courier New', monospace;
      font-size: 44px;
      font-weight: 800;
      letter-spacing: 0.3em;
      text-align: center;
      text-transform: uppercase;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }
    .code-input:focus {
      border-color: #00f5ff;
      box-shadow: 0 0 20px rgba(0, 245, 255, 0.25);
    }

    .actions {
      display: flex;
      gap: 10px;
    }
    .btn-back, .btn-next {
      padding: 14px 20px;
      border-radius: 12px;
      font-family: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 14px;
      letter-spacing: 0.1em;
    }
    .btn-back {
      flex: 0 0 auto;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #fff;
    }
    .btn-back:hover { background: rgba(255, 255, 255, 0.1); }
    .btn-next {
      flex: 1;
      background: linear-gradient(135deg, #ff006e, #8338ec);
      border: none;
      color: #fff;
      box-shadow: 0 8px 24px rgba(255, 0, 110, 0.4);
    }
    .btn-next:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-next:not(:disabled):hover { transform: translateY(-2px); }

    .code-display {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: rgba(0, 245, 255, 0.08);
      border: 1px solid rgba(0, 245, 255, 0.25);
      border-radius: 12px;
      margin-bottom: 24px;
      justify-content: center;
    }
    .code-label {
      font-size: 12px;
      letter-spacing: 0.2em;
      color: #00f5ff;
      text-transform: uppercase;
      font-weight: 700;
    }
    .code-value {
      font-family: 'Courier New', monospace;
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 0.3em;
      color: #fff;
    }
    .code-edit {
      background: transparent;
      border: none;
      color: #00f5ff;
      font-size: 16px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .code-edit:hover { background: rgba(0, 245, 255, 0.15); }
  `]
})
export class JoinRoomComponent {
  step: 'code' | 'identity' = 'code';
  code: string = '';
  loading = false;
  errorText = '';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private roomService: RoomService,
    private i18n: I18nService
  ) {}

  ngOnInit(): void {
    // Soporte de código preseleccionado desde URL: /join/ABCD
    const preCode = this.route.snapshot.paramMap.get('code');
    if (preCode && preCode.length === 4) {
      this.code = preCode.toUpperCase();
      this.step = 'identity';
    }
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }

  nextStep(): void {
    if (this.code.length === 4) {
      this.step = 'identity';
    }
  }

  async onSubmit(identity: IdentityPayload): Promise<void> {
    this.loading = true;
    this.errorText = '';

    const res = await this.roomService.joinRoom(this.code, identity.name, identity.avatar);

    this.loading = false;

    if (res.ok) {
      this.router.navigate(['/room', this.code]);
    } else {
      this.errorText = this.mapError(res.error);
    }
  }

  private mapError(code: string | undefined): string {
    switch (code) {
      case 'ROOM_NOT_FOUND': return this.i18n.t('error.roomNotFound');
      case 'GAME_ALREADY_STARTED': return this.i18n.t('error.gameStarted');
      case 'ROOM_FULL': return this.i18n.t('error.roomFull');
      case 'NAME_TAKEN': return this.i18n.t('error.nameTaken');
      case 'INVALID_NAME': return this.i18n.t('error.invalidName');
      case 'TIMEOUT': return this.i18n.t('error.timeout');
      case 'CONNECTION_ERROR': return this.i18n.t('error.connection');
      default: return this.i18n.t('error.generic');
    }
  }
}
