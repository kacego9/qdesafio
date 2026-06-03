import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../i18n/i18n.service';
import { SeoService } from '../../services/seo.service';
import {
  LeaderboardEntry,
  LeaderboardService
} from '../../services/leaderboard.service';

const AVATARS = ['🎯', '🦊', '🐯', '🦁', '🐼', '🐸', '🐙', '🦄', '🐲', '🤖', '👻', '👾'];
const COLORS = ['#ff006e', '#8338ec', '#3a86ff', '#06ffa5', '#ffbe0b', '#fb5607'];

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <section class="lb-page">
      <header class="lb-head">
        <button class="back-btn" (click)="goBack()">←</button>
        <div class="head-text">
          <div class="head-tag">{{ 'leaderboard.tag' | t }}</div>
          <h1>{{ 'leaderboard.title' | t }}</h1>
          <p class="head-sub">{{ 'leaderboard.subtitle' | t : { weekLabel: weekLabel } }}</p>
        </div>
      </header>

      <!-- Profile setup banner -->
      <div *ngIf="!hasProfile" class="profile-card">
        <div class="profile-emoji">👋</div>
        <h2>{{ 'leaderboard.profile.title' | t }}</h2>
        <p>{{ 'leaderboard.profile.text' | t }}</p>

        <label class="field-label">{{ 'identity.yourName' | t }}</label>
        <input type="text" maxlength="16"
               class="name-input"
               [(ngModel)]="newName"
               [placeholder]="'identity.namePlaceholder' | t" />

        <label class="field-label">{{ 'identity.chooseAvatar' | t }}</label>
        <div class="picker">
          <button *ngFor="let av of avatars"
                  class="picker-item"
                  [class.selected]="newAvatar === av"
                  (click)="newAvatar = av">{{ av }}</button>
        </div>

        <label class="field-label">{{ 'identity.chooseColor' | t }}</label>
        <div class="picker">
          <button *ngFor="let c of colors"
                  class="picker-color"
                  [class.selected]="newColor === c"
                  [style.background]="c"
                  (click)="newColor = c"></button>
        </div>

        <button class="save-btn"
                [disabled]="!canSave"
                (click)="saveProfile()">
          {{ 'leaderboard.profile.save' | t }}
        </button>
      </div>

      <!-- My rank -->
      <div *ngIf="hasProfile && myRank > 0" class="my-rank">
        <span class="mr-label">{{ 'leaderboard.yourRank' | t }}</span>
        <strong>#{{ myRank }} <small>{{ 'leaderboard.outOf' | t : { total: total } }}</small></strong>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="loading-box">
        <div class="loading-dots"><span></span><span></span><span></span></div>
      </div>

      <!-- Empty -->
      <div *ngIf="!loading && entries.length === 0" class="empty-box">
        <div class="eb-emoji">🏆</div>
        <p>{{ 'leaderboard.empty' | t }}</p>
        <button class="play-btn" (click)="goPlay()">{{ 'leaderboard.startPlaying' | t }}</button>
      </div>

      <!-- Ranking list -->
      <ul *ngIf="!loading && entries.length > 0" class="rank-list">
        <li *ngFor="let entry of entries; let i = index"
            class="rank-row"
            [class.me]="entry.clientId === myClientId"
            [class.top1]="i === 0"
            [class.top2]="i === 1"
            [class.top3]="i === 2">
          <div class="rk-pos">
            <span *ngIf="i === 0">🥇</span>
            <span *ngIf="i === 1">🥈</span>
            <span *ngIf="i === 2">🥉</span>
            <span *ngIf="i > 2">#{{ i + 1 }}</span>
          </div>
          <div class="rk-avatar" [style.background]="entry.color">{{ entry.avatar }}</div>
          <div class="rk-body">
            <div class="rk-name">{{ entry.name }}</div>
            <div class="rk-stats">
              ⭐ {{ entry.stars }} · 🏁 {{ entry.levelsCompleted }} {{ 'leaderboard.levels' | t }}
            </div>
          </div>
          <div class="rk-score">{{ entry.score }}</div>
        </li>
      </ul>
    </section>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; color: #fff; }
    .lb-page {
      max-width: 760px;
      margin: 0 auto;
      padding: 80px 16px 60px;
      animation: lbIn 0.4s ease;
    }
    @media (min-width: 520px) { .lb-page { padding: 80px 20px 60px; } }
    @keyframes lbIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .lb-head {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 24px;
    }
    .back-btn {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
      font-size: 20px;
      cursor: pointer;
      flex-shrink: 0;
    }
    .head-text { flex: 1; min-width: 0; }
    .head-tag {
      font-size: 11px;
      letter-spacing: 0.25em;
      color: #00f5ff;
      text-transform: uppercase;
      font-weight: 700;
    }
    .lb-head h1 {
      font-size: 28px;
      font-weight: 900;
      margin: 4px 0 4px;
      background: linear-gradient(90deg, #ff006e, #ffbe0b);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    @media (min-width: 520px) {
      .lb-head h1 { font-size: 36px; }
    }
    .head-sub { margin: 0; font-size: 13px; color: #b8a9d9; }

    /* PROFILE SETUP */
    .profile-card {
      background: rgba(20, 10, 40, 0.85);
      border: 1px solid rgba(255, 0, 110, 0.3);
      border-radius: 18px;
      padding: 24px 20px;
      text-align: center;
      margin-bottom: 24px;
    }
    .profile-emoji { font-size: 48px; }
    .profile-card h2 {
      font-size: 20px;
      font-weight: 900;
      margin: 8px 0 6px;
    }
    .profile-card p {
      color: #b8a9d9;
      font-size: 13px;
      margin: 0 0 18px;
      line-height: 1.5;
    }
    .field-label {
      display: block;
      text-align: left;
      font-size: 11px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #b8a9d9;
      font-weight: 700;
      margin-bottom: 6px;
      margin-top: 12px;
    }
    .name-input {
      width: 100%;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      color: #fff;
      font-family: inherit;
      font-size: 15px;
      box-sizing: border-box;
    }
    .name-input:focus {
      outline: none;
      border-color: #ff006e;
    }
    .picker {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
    .picker-item, .picker-color {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      border: 2px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
      font-size: 22px;
      transition: transform 0.15s, border-color 0.15s;
    }
    .picker-item.selected, .picker-color.selected {
      border-color: #ff006e;
      transform: scale(1.1);
    }
    .save-btn {
      margin-top: 18px;
      padding: 14px 24px;
      width: 100%;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #ff006e, #8338ec);
      color: #fff;
      font-family: inherit;
      font-weight: 900;
      font-size: 14px;
      letter-spacing: 0.1em;
      cursor: pointer;
      box-shadow: 0 8px 20px rgba(255, 0, 110, 0.4);
    }
    .save-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }

    /* MY RANK */
    .my-rank {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 14px 18px;
      background: linear-gradient(120deg, rgba(255, 0, 110, 0.15), rgba(20, 10, 40, 0.7));
      border: 1px solid rgba(255, 0, 110, 0.3);
      border-radius: 14px;
      margin-bottom: 16px;
    }
    .mr-label {
      font-size: 12px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #b8a9d9;
      font-weight: 700;
    }
    .my-rank strong {
      font-size: 22px;
      font-weight: 900;
      font-family: 'Courier New', monospace;
      color: #ffbe0b;
    }
    .my-rank small {
      font-size: 12px;
      color: #b8a9d9;
      font-weight: 500;
      font-family: inherit;
      margin-left: 4px;
    }

    /* LIST */
    .rank-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .rank-row {
      display: grid;
      grid-template-columns: 50px auto 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      background: rgba(20, 10, 40, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 14px;
      transition: border-color 0.15s;
    }
    .rank-row.me {
      border-color: rgba(0, 245, 255, 0.4);
      background: linear-gradient(120deg, rgba(0, 245, 255, 0.08), rgba(20, 10, 40, 0.7));
    }
    .rank-row.top1 { border-color: rgba(255, 190, 11, 0.5); }
    .rank-row.top2 { border-color: rgba(192, 192, 192, 0.45); }
    .rank-row.top3 { border-color: rgba(205, 127, 50, 0.5); }
    .rk-pos {
      font-family: 'Courier New', monospace;
      font-size: 18px;
      font-weight: 900;
      text-align: center;
    }
    .rk-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    .rk-body { min-width: 0; }
    .rk-name {
      font-weight: 800;
      font-size: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .rk-stats {
      font-size: 11.5px;
      color: #b8a9d9;
      margin-top: 2px;
    }
    .rk-score {
      font-family: 'Courier New', monospace;
      font-size: 18px;
      font-weight: 900;
      color: #ffbe0b;
      text-align: right;
    }

    .loading-box {
      display: flex;
      justify-content: center;
      padding: 40px 0;
    }
    .loading-dots { display: inline-flex; gap: 8px; }
    .loading-dots span {
      width: 12px; height: 12px;
      border-radius: 50%;
      background: #ff006e;
      animation: bD 0.8s ease infinite;
    }
    .loading-dots span:nth-child(2) { animation-delay: 0.15s; background: #8338ec; }
    .loading-dots span:nth-child(3) { animation-delay: 0.3s; background: #00f5ff; }
    @keyframes bD {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40% { transform: translateY(-10px); opacity: 1; }
    }

    .empty-box {
      text-align: center;
      padding: 40px 20px;
      background: rgba(20, 10, 40, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 18px;
    }
    .eb-emoji { font-size: 56px; margin-bottom: 12px; }
    .empty-box p { color: #b8a9d9; margin: 0 0 18px; font-size: 14px; }
    .play-btn {
      padding: 12px 22px;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #ff006e, #8338ec);
      color: #fff;
      font-family: inherit;
      font-weight: 900;
      font-size: 14px;
      letter-spacing: 0.1em;
      cursor: pointer;
    }

    @media (max-width: 380px) {
      .rank-row { grid-template-columns: 36px auto 1fr auto; gap: 8px; padding: 10px 12px; }
      .rk-pos { font-size: 14px; }
      .rk-avatar { width: 36px; height: 36px; font-size: 18px; }
      .rk-name { font-size: 14px; }
      .rk-score { font-size: 16px; }
    }
  `]
})
export class LeaderboardComponent implements OnInit {
  entries: LeaderboardEntry[] = [];
  myRank = 0;
  total = 0;
  weekStart = 0;
  loading = true;
  myClientId = '';

  hasProfile = false;
  newName = '';
  newAvatar = AVATARS[0];
  newColor = COLORS[0];
  avatars = AVATARS;
  colors = COLORS;

  constructor(
    private router: Router,
    private seo: SeoService,
    private leaderboardService: LeaderboardService
  ) {}

  async ngOnInit(): Promise<void> {
    this.seo.apply({
      titleKey: 'seo.leaderboard.title',
      descKey: 'seo.leaderboard.desc',
      canonicalPath: '/leaderboard'
    });

    this.hasProfile = this.leaderboardService.hasProfile();
    this.myClientId = this.leaderboardService.getClientId();
    if (this.hasProfile) {
      const p = this.leaderboardService.getProfile();
      if (p) {
        this.newName = p.name;
        this.newAvatar = p.avatar;
        this.newColor = p.color;
      }
    }

    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    const data = await this.leaderboardService.fetchTop();
    if (data) {
      this.entries = data.entries;
      this.weekStart = data.weekStart;
      this.total = data.total;
    }
    if (this.hasProfile) {
      const me = await this.leaderboardService.fetchMyRank();
      if (me) this.myRank = me.rank;
    }
    this.loading = false;
  }

  get canSave(): boolean {
    return this.newName.trim().length >= 1 && this.newName.trim().length <= 16;
  }

  saveProfile(): void {
    if (!this.canSave) return;
    this.leaderboardService.saveProfile({
      name: this.newName.trim(),
      avatar: this.newAvatar,
      color: this.newColor
    });
    this.hasProfile = true;
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }
  goPlay(): void {
    this.router.navigate(['/levels']);
  }

  get weekLabel(): string {
    if (!this.weekStart) return '';
    const d = new Date(this.weekStart);
    return d.toLocaleDateString();
  }
}
