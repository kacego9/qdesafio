import { Inject, Injectable, PLATFORM_ID, Pipe, PipeTransform } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { LanguageCode, LANGUAGES, TRANSLATIONS, TranslationKey } from './translations';

const STORAGE_KEY = 'qdesafio.language';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private langSubject = new BehaviorSubject<LanguageCode>('en');
  public lang$ = this.langSubject.asObservable();

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
      if (saved && LANGUAGES.find(l => l.code === saved)) {
        this.langSubject.next(saved);
        this.applyDirection(saved);
      } else {
        // Detectar idioma del navegador
        const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
        const code = LANGUAGES.find(l => l.code === browser)?.code || 'en';
        this.langSubject.next(code);
        this.applyDirection(code);
      }
    }
  }

  get current(): LanguageCode {
    return this.langSubject.value;
  }

  setLanguage(lang: LanguageCode): void {
    if (!LANGUAGES.find(l => l.code === lang)) return;
    this.langSubject.next(lang);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, lang);
      this.applyDirection(lang);
    }
  }

  /** Aplica la dirección RTL/LTR al document según el idioma */
  private applyDirection(lang: LanguageCode): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const language = LANGUAGES.find(l => l.code === lang);
    const dir = language?.rtl ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
  }

  /**
   * Traduce una clave con opcional interpolación.
   * Ejemplo: t('countdown.roundOf', { current: 2, total: 5 })
   */
  t(key: TranslationKey, params?: Record<string, string | number>): string {
    const dict = TRANSLATIONS[this.current] || TRANSLATIONS.en;
    let text = (dict as any)[key] || (TRANSLATIONS.en as any)[key] || String(key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
      });
    }
    return text;
  }
}

/**
 * Pipe impure para re-evaluar cuando cambia el idioma.
 * Uso: {{ 'home.title1' | t }}
 */
@Pipe({ name: 't', pure: false, standalone: true })
export class TranslatePipe implements PipeTransform {
  constructor(private i18n: I18nService) {}
  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key as TranslationKey, params);
  }
}
