import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

/**
 * Servicio de Google Analytics 4.
 * El snippet de gtag.js se carga desde index.html. Este servicio:
 *   - Trackea cambios de ruta (SPA-friendly).
 *   - Expone .event() para registrar eventos custom.
 *   - Es seguro en SSR: nunca toca window si no es browser.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  /** Measurement ID de GA4 — usado en gtag('config', ID, ...). */
  private readonly measurementId = 'G-DTE3JBZS7D';
  private enabled = false;

  constructor(
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  /** Llamar una sola vez desde AppComponent. */
  init(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.enabled = typeof window !== 'undefined' && typeof window.gtag === 'function';
    if (!this.enabled) {
      // gtag aún no cargó (script async); reintentar en 1 s.
      setTimeout(() => {
        this.enabled = typeof window.gtag === 'function';
        if (this.enabled) this.bindRouter();
      }, 1000);
      return;
    }
    this.bindRouter();
  }

  /**
   * Registra un evento custom.
   * Ej: analytics.event('level_complete', { level_id: 5, stars: 3 });
   */
  event(name: string, params?: Record<string, any>): void {
    if (!this.enabled || !window.gtag) return;
    try {
      window.gtag('event', name, params || {});
    } catch {
      // GA puede fallar si está bloqueado por adblockers; lo ignoramos
    }
  }

  // ----------------------------------------------------------------

  private bindRouter(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((event) => {
        if (!window.gtag) return;
        try {
          window.gtag('config', this.measurementId, {
            page_path: event.urlAfterRedirects,
            page_title: document.title,
            page_location: window.location.href
          });
        } catch {}
      });
  }
}
