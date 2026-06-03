import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { RoomService } from '../../services/room.service';
import { I18nService, TranslatePipe } from '../../i18n/i18n.service';
import { IdentityFormComponent, IdentityPayload } from '../../components/identity-form/identity-form.component';

@Component({
  selector: 'app-create-room',
  standalone: true,
  imports: [CommonModule, IdentityFormComponent, TranslatePipe],
  template: `
    <section class="page">
      <div class="card">
        <div class="head">
          <div class="back-emoji">🎯</div>
          <h1>{{ 'home.createRoom' | t }}</h1>
        </div>

        <app-identity-form
          [submitLabel]="'home.createRoom' | t"
          [loading]="loading"
          [errorText]="errorText"
          (submitted)="onSubmit($event)"
          (cancelled)="goBack()"
        ></app-identity-form>
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
      margin-bottom: 24px;
    }
    .back-emoji {
      font-size: 44px;
      margin-bottom: 8px;
    }
    .head h1 {
      font-size: 24px;
      font-weight: 800;
      margin: 0;
      background: linear-gradient(90deg, #ff006e, #00f5ff);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
  `]
})
export class CreateRoomComponent {
  loading = false;
  errorText = '';

  constructor(
    private router: Router,
    private roomService: RoomService,
    private i18n: I18nService
  ) {}

  goBack(): void {
    this.router.navigate(['/home']);
  }

  async onSubmit(identity: IdentityPayload): Promise<void> {
    this.loading = true;
    this.errorText = '';

    const res = await this.roomService.createRoom(
      identity.name,
      identity.avatar,
      this.i18n.current
    );

    this.loading = false;

    if (res.ok && res.code) {
      this.router.navigate(['/room', res.code]);
    } else {
      this.errorText = this.mapError(res.error);
    }
  }

  private mapError(code: string | undefined): string {
    switch (code) {
      case 'TIMEOUT': return this.i18n.t('error.timeout');
      case 'INVALID_NAME': return this.i18n.t('error.invalidName');
      case 'CONNECTION_ERROR': return this.i18n.t('error.connection');
      default: return this.i18n.t('error.generic');
    }
  }
}
