import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../i18n/i18n.service';
import {
  SoloLevel,
  SoloProgress,
  SoloProgressService
} from '../../services/solo-progress.service';
import { SeoService } from '../../services/seo.service';
import { AnalyticsService } from '../../services/analytics.service';

@Component({
  selector: 'app-levels',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './levels.component.html',
  styleUrl: './levels.component.css'
})
export class LevelsComponent implements OnInit, OnDestroy {
  levels: SoloLevel[] = [];
  progress!: SoloProgress;
  private sub?: Subscription;

  constructor(
    private router: Router,
    private progressService: SoloProgressService,
    private seo: SeoService,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    this.levels = this.progressService.levels;
    this.progress = this.progressService.current;
    this.sub = this.progressService.progress$.subscribe((p) => (this.progress = p));
    this.seo.apply({
      titleKey: 'seo.levels.title',
      descKey: 'seo.levels.desc',
      canonicalPath: '/levels'
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  isUnlocked(level: SoloLevel): boolean {
    return this.progressService.isLevelUnlocked(level.id);
  }

  starsFor(level: SoloLevel): number {
    return this.progress.levels[level.id]?.stars || 0;
  }

  bestScoreFor(level: SoloLevel): number {
    return this.progress.levels[level.id]?.bestScore || 0;
  }

  openLevel(level: SoloLevel): void {
    if (!this.isUnlocked(level)) return;
    // Variante random — no se elige
    this.router.navigate(['/solo', level.id]);
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  starsArray(count: number): boolean[] {
    return [count >= 1, count >= 2, count >= 3];
  }

  trackById(_i: number, lvl: SoloLevel): number {
    return lvl.id;
  }

  get globalPercent(): number {
    const max = this.levels.length * 3;
    return Math.round((this.progress.totalStars / max) * 100);
  }
}
