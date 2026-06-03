import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface LeaderboardEntry {
  clientId: string;
  name: string;
  avatar: string;
  color: string;
  score: number;
  stars: number;
  levelsCompleted: number;
  lastSubmitAt: number;
}

export interface LeaderboardResponse {
  weekStart: number;
  entries: LeaderboardEntry[];
  total: number;
}

const CLIENT_ID_KEY = 'qdesafio.leaderboard.clientId';
const PROFILE_KEY = 'qdesafio.leaderboard.profile';

interface LocalProfile {
  name: string;
  avatar: string;
  color: string;
}

@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  /** Identificador estable que generamos al primer envío y persistimos. */
  private clientId: string | null = null;
  private profile: LocalProfile | null = null;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.clientId = localStorage.getItem(CLIENT_ID_KEY);
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        try { this.profile = JSON.parse(raw); } catch {}
      }
    }
  }

  hasProfile(): boolean {
    return !!this.profile && !!this.clientId;
  }

  getProfile(): LocalProfile | null {
    return this.profile;
  }

  getClientId(): string {
    if (!this.clientId) {
      this.clientId = this.generateId();
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem(CLIENT_ID_KEY, this.clientId);
      }
    }
    return this.clientId;
  }

  saveProfile(profile: LocalProfile): void {
    this.profile = profile;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }
  }

  /**
   * Submite un resultado de nivel al leaderboard global.
   * Si no hay perfil aún, devuelve null y el caller debe pedirlo.
   */
  async submit(levelScore: number, levelStars: number): Promise<{ rank: number; total: number } | null> {
    if (!this.profile) return null;
    const cid = this.getClientId();
    try {
      const res = await firstValueFrom(
        this.http.post<{ ok: boolean; rank: number; total: number }>(
          `${environment.serverUrl}/api/leaderboard/submit`,
          {
            clientId: cid,
            name: this.profile.name,
            avatar: this.profile.avatar,
            color: this.profile.color,
            levelScore,
            levelStars
          }
        )
      );
      return res?.ok ? { rank: res.rank, total: res.total } : null;
    } catch {
      // Sin conexión o server caído: silencioso, el modo offline igual funciona
      return null;
    }
  }

  async fetchTop(): Promise<LeaderboardResponse | null> {
    try {
      return await firstValueFrom(
        this.http.get<LeaderboardResponse>(`${environment.serverUrl}/api/leaderboard`)
      );
    } catch {
      return null;
    }
  }

  async fetchMyRank(): Promise<{ rank: number; total: number } | null> {
    if (!this.clientId) return null;
    try {
      return await firstValueFrom(
        this.http.get<{ rank: number; total: number }>(
          `${environment.serverUrl}/api/leaderboard/me/${this.clientId}`
        )
      );
    } catch {
      return null;
    }
  }

  private generateId(): string {
    // ID corto, suficientemente único: 16 chars base36
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 10);
    return `${t}${r}`;
  }
}
