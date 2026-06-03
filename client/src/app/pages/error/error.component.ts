import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '../../i18n/i18n.service';

@Component({
  selector: 'app-error',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  template: `
    <section class="err-stage">
      <div class="err-content">
        <div class="err-emoji">🧭</div>
        <h1>404</h1>
        <p>Page not found</p>
        <a routerLink="/home" class="btn">{{ 'final.home' | t }}</a>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; color: #fff; }
    .err-stage {
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 40px 20px;
    }
    .err-content {
      text-align: center;
      animation: errIn 0.5s ease;
    }
    @keyframes errIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .err-emoji { font-size: 64px; margin-bottom: 12px; }
    h1 {
      font-size: 80px;
      font-weight: 900;
      margin: 0;
      background: linear-gradient(90deg, #ff006e, #00f5ff);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    p { font-size: 18px; color: #b8a9d9; margin: 4px 0 30px; }
    .btn {
      display: inline-block;
      padding: 14px 28px;
      background: linear-gradient(135deg, #ff006e, #8338ec);
      color: #fff;
      font-weight: 800;
      letter-spacing: 0.12em;
      border-radius: 12px;
      text-decoration: none;
      transition: transform 0.2s;
      box-shadow: 0 10px 24px rgba(255, 0, 110, 0.4);
    }
    .btn:hover { transform: translateY(-2px); }
  `]
})
export class ErrorComponent {}
