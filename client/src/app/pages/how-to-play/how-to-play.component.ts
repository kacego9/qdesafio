import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../i18n/i18n.service';
import { SeoService } from '../../services/seo.service';
import { SoloProgressService } from '../../services/solo-progress.service';
import { AnalyticsService } from '../../services/analytics.service';

@Component({
  selector: 'app-how-to-play',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './how-to-play.component.html',
  styleUrl: './how-to-play.component.css'
})
export class HowToPlayComponent implements OnInit {
  constructor(
    private router: Router,
    private seo: SeoService,
    public progress: SoloProgressService,
    private analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    this.seo.apply({
      titleKey: 'seo.howToPlay.title',
      descKey: 'seo.howToPlay.desc',
      canonicalPath: '/how-to-play'
    });
  }

  goSolo(): void {
    this.analytics.event('cta_click', {
      cta: 'play_solo',
      from: 'how_to_play',
      has_progress: this.hasProgress
    });
    if (this.hasProgress) {
      this.router.navigate(['/levels']);
    } else {
      this.router.navigate(['/solo', 1]);
    }
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  get hasProgress(): boolean {
    return this.progress.current.totalStars > 0
      || this.progress.current.highestLevelUnlocked > 1;
  }
}
