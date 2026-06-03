import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { I18nService, TranslatePipe } from '../../i18n/i18n.service';
import { SeoService } from '../../services/seo.service';
import { SoloProgressService } from '../../services/solo-progress.service';
import { AnalyticsService } from '../../services/analytics.service';
import {
  GameModeChoice,
  ModePickerComponent
} from '../../components/mode-picker/mode-picker.component';

interface CountdownParts {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
}

interface TournamentScheduleSlot {
  time: string;
  countriesKey: string;
  tone: 'cyan' | 'green' | 'purple' | 'blue';
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, TranslatePipe, ModePickerComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  modePickerOpen = false;
  readonly registrationUrl = 'https://docs.google.com/forms/d/e/1FAIpQLScErHq7xH1OPWWYkyU7lSb6tkbgEMEMRqYzQRQY-4q1nPsGtQ/viewform?usp=publish-editor';
  readonly tournamentSchedule: TournamentScheduleSlot[] = [
    {
      time: '10:00 a. m.',
      countriesKey: 'home.tournament.schedule.10',
      tone: 'cyan'
    },
    {
      time: '11:00 a. m.',
      countriesKey: 'home.tournament.schedule.11',
      tone: 'green'
    },
    {
      time: '12:00 p. m.',
      countriesKey: 'home.tournament.schedule.12',
      tone: 'purple'
    },
    {
      time: '1:00 p. m.',
      countriesKey: 'home.tournament.schedule.1',
      tone: 'blue'
    }
  ];
  countdown: CountdownParts = {
    days: '00',
    hours: '00',
    minutes: '00',
    seconds: '00'
  };
  nextTournamentLabel = 'Sábado 11:00 a. m. Colombia';
  private countdownTimer?: ReturnType<typeof setInterval>;

  constructor(
    private router: Router,
    private seo: SeoService,
    public progress: SoloProgressService,
    private analytics: AnalyticsService,
    private i18n: I18nService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    this.seo.apply({
      titleKey: 'seo.home.title',
      descKey: 'seo.home.desc',
      canonicalPath: '/'
    });
    this.seo.applyGameJsonLd();
    this.updateCountdown();
    if (isPlatformBrowser(this.platformId)) {
      this.countdownTimer = setInterval(() => this.updateCountdown(), 1000);
    }
  }

  ngOnDestroy(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }

  /** Apre el modal con las 3 opciones */
  openModePicker(): void {
    this.analytics.event('cta_click', {
      cta: 'play_now',
      has_progress: this.hasProgress
    });
    this.modePickerOpen = true;
  }

  closeModePicker(): void {
    this.modePickerOpen = false;
  }

  onModePicked(choice: GameModeChoice): void {
    this.modePickerOpen = false;
    this.analytics.event('mode_picked', { mode: choice });
    if (choice === 'solo') {
      if (this.hasProgress) {
        this.router.navigate(['/levels']);
      } else {
        this.router.navigate(['/solo', 1]);
      }
    } else if (choice === 'create') {
      this.router.navigate(['/create']);
    } else if (choice === 'join') {
      this.router.navigate(['/join']);
    }
  }

  goLevels(): void {
    this.analytics.event('cta_click', { cta: 'all_levels' });
    this.router.navigate(['/levels']);
  }
  continuePlaying(): void {
    this.analytics.event('cta_click', {
      cta: 'continue',
      level_id: this.nextLevelId
    });
    this.router.navigate(['/solo', this.nextLevelId]);
  }
  goHowToPlay(): void {
    this.analytics.event('cta_click', { cta: 'how_to_play' });
    this.router.navigate(['/how-to-play']);
  }
  goLeaderboard(): void {
    this.analytics.event('cta_click', { cta: 'leaderboard' });
    this.router.navigate(['/leaderboard']);
  }
  scrollToTournament(event?: Event): void {
    event?.preventDefault();
    this.analytics.event('cta_click', { cta: 'weekly_tournament_more' });
    if (!isPlatformBrowser(this.platformId)) return;

    document.getElementById('weekly-tournament')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  get hasProgress(): boolean {
    return this.progress.current.totalStars > 0
      || this.progress.current.highestLevelUnlocked > 1;
  }

  get nextLevelId(): number {
    const next = this.progress.current.highestLevelUnlocked;
    return Math.min(next, this.progress.levels.length);
  }

  private updateCountdown(): void {
    const now = new Date();
    const nextTournament = this.getNextTournamentDate(now);
    const remaining = Math.max(0, nextTournament.getTime() - now.getTime());
    const dayMs = 24 * 60 * 60 * 1000;
    const hourMs = 60 * 60 * 1000;
    const minuteMs = 60 * 1000;

    const days = Math.floor(remaining / dayMs);
    const hours = Math.floor((remaining % dayMs) / hourMs);
    const minutes = Math.floor((remaining % hourMs) / minuteMs);
    const seconds = Math.floor((remaining % minuteMs) / 1000);

    this.countdown = {
      days: this.padCountdown(days),
      hours: this.padCountdown(hours),
      minutes: this.padCountdown(minutes),
      seconds: this.padCountdown(seconds)
    };
    this.nextTournamentLabel = this.formatTournamentDate(nextTournament);
  }

  private getNextTournamentDate(now: Date): Date {
    const saturday = 6;
    const daysUntilSaturday = (saturday - now.getUTCDay() + 7) % 7;
    let tournamentTime = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysUntilSaturday,
      16,
      0,
      0,
      0
    );

    if (tournamentTime <= now.getTime()) {
      tournamentTime += 7 * 24 * 60 * 60 * 1000;
    }

    return new Date(tournamentTime);
  }

  private formatTournamentDate(date: Date): string {
    const locale = this.i18n.current === 'es' ? 'es-CO' : this.i18n.current;
    const label = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Bogota'
    }).format(date);

    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private padCountdown(value: number): string {
    return value.toString().padStart(2, '0');
  }
}
