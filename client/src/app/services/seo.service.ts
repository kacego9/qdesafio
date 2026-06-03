import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { I18nService } from '../i18n/i18n.service';
import { TranslationKey, LANGUAGES } from '../i18n/translations';

export interface SeoData {
  /** Título — puede ser una clave de traducción o un texto literal. */
  titleKey?: TranslationKey | string;
  titleLiteral?: string;
  /** Descripción — clave de traducción o texto literal. */
  descKey?: TranslationKey | string;
  descLiteral?: string;
  /** Path de la URL canónica (ej "/solo"). Si no se pasa, se usa la actual. */
  canonicalPath?: string;
  /** Imagen para Open Graph. */
  image?: string;
  /** Tipo de Open Graph. */
  type?: 'website' | 'article';
}

@Injectable({ providedIn: 'root' })
export class SeoService {
  private siteName = 'Q-Desafío';
  /** URL base de producción. */
  private siteUrl = 'https://qdesafio.com';

  constructor(
    private title: Title,
    private meta: Meta,
    private i18n: I18nService,
    @Inject(PLATFORM_ID) private platformId: Object,
    @Inject(DOCUMENT) private doc: Document
  ) {
    // Actualiza metas cuando el idioma cambia
    this.i18n.lang$.subscribe(() => this.refreshLangAttr());
  }

  /**
   * Actualiza title, description, OG tags, canonical y hreflang de manera coherente.
   */
  apply(data: SeoData): void {
    const title = this.resolve(data.titleKey, data.titleLiteral) || this.siteName;
    const fullTitle = title.includes(this.siteName) ? title : `${title} · ${this.siteName}`;
    const desc = this.resolve(data.descKey, data.descLiteral) || '';
    const path = data.canonicalPath || (isPlatformBrowser(this.platformId) ? this.doc.location.pathname : '/');

    this.title.setTitle(fullTitle);
    this.upsertMeta('name', 'description', desc);

    // Open Graph
    this.upsertMeta('property', 'og:title', fullTitle);
    this.upsertMeta('property', 'og:description', desc);
    this.upsertMeta('property', 'og:type', data.type || 'website');
    this.upsertMeta('property', 'og:site_name', this.siteName);
    this.upsertMeta('property', 'og:url', `${this.siteUrl}${path}`);
    if (data.image) this.upsertMeta('property', 'og:image', data.image);

    // Twitter
    this.upsertMeta('name', 'twitter:card', 'summary_large_image');
    this.upsertMeta('name', 'twitter:title', fullTitle);
    this.upsertMeta('name', 'twitter:description', desc);
    if (data.image) this.upsertMeta('name', 'twitter:image', data.image);

    // Canonical + hreflang
    this.setCanonical(path);
    this.setHreflangs(path);

    // Idioma
    this.refreshLangAttr();
  }

  /**
   * Inyecta JSON-LD estructurado para los buscadores.
   * Usa el schema de tipo "VideoGame" con todos los detalles.
   */
  applyGameJsonLd(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const id = 'qd-jsonld-game-dynamic';
    let script = this.doc.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = this.doc.createElement('script') as HTMLScriptElement;
      script.id = id;
      script.type = 'application/ld+json';
      this.doc.head.appendChild(script);
    }
    const allLangs = LANGUAGES.map(l => l.code);
    const json = {
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: this.siteName,
      url: this.siteUrl,
      description: this.i18n.t('seo.home.desc'),
      genre: ['Puzzle', 'Casual', 'Brain Training', 'Multiplayer'],
      gamePlatform: ['Web Browser', 'Mobile Web', 'Desktop'],
      applicationCategory: 'GameApplication',
      operatingSystem: 'Any',
      playMode: ['SinglePlayer', 'MultiPlayer'],
      numberOfPlayers: {
        '@type': 'QuantitativeValue',
        minValue: 1,
        maxValue: 20
      },
      inLanguage: allLangs,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock'
      }
    };
    script.text = JSON.stringify(json);
  }

  /**
   * Inyecta breadcrumbs JSON-LD para una página específica.
   * Útil para páginas internas (levels, solo/N, leaderboard, etc.)
   */
  applyBreadcrumbs(items: Array<{ name: string; path: string }>): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const id = 'qd-jsonld-breadcrumbs';
    let script = this.doc.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = this.doc.createElement('script') as HTMLScriptElement;
      script.id = id;
      script.type = 'application/ld+json';
      this.doc.head.appendChild(script);
    }
    const json = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: item.name,
        item: `${this.siteUrl}${item.path}`
      }))
    };
    script.text = JSON.stringify(json);
  }

  // ----------------------------------------------------------------

  private resolve(key?: string, literal?: string): string {
    if (literal) return literal;
    if (!key) return '';
    const t = this.i18n.t(key as TranslationKey);
    return t === key ? key : t;
  }

  private upsertMeta(attr: 'name' | 'property', value: string, content: string): void {
    const selector = `${attr}="${value}"`;
    if (this.meta.getTag(selector)) {
      this.meta.updateTag({ [attr]: value, content });
    } else {
      this.meta.addTag({ [attr]: value, content });
    }
  }

  private setCanonical(path: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = `${this.siteUrl}${path}`;
    let link = this.doc.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = this.doc.createElement('link');
      link.rel = 'canonical';
      this.doc.head.appendChild(link);
    }
    link.href = url;
  }

  /**
   * Sustituye los <link rel="alternate" hreflang="..."> dinámicamente
   * para apuntar a la ruta actual (con ?lang=...) en cada idioma.
   */
  private setHreflangs(path: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // Limpiar los hreflang anteriores que generamos
    const existing = Array.from(this.doc.querySelectorAll('link[rel="alternate"][data-qd-hreflang]'));
    for (const el of existing) el.remove();

    for (const lang of LANGUAGES) {
      const link = this.doc.createElement('link');
      link.rel = 'alternate';
      link.setAttribute('hreflang', lang.code);
      link.href = `${this.siteUrl}${path}?lang=${lang.code}`;
      link.setAttribute('data-qd-hreflang', '1');
      this.doc.head.appendChild(link);
    }
    // x-default
    const xdef = this.doc.createElement('link');
    xdef.rel = 'alternate';
    xdef.setAttribute('hreflang', 'x-default');
    xdef.href = `${this.siteUrl}${path}`;
    xdef.setAttribute('data-qd-hreflang', '1');
    this.doc.head.appendChild(xdef);
  }

  private refreshLangAttr(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.doc.documentElement.lang = this.i18n.current;
    // Aplicar dirección RTL/LTR
    const lang = LANGUAGES.find(l => l.code === this.i18n.current);
    this.doc.documentElement.dir = lang?.rtl ? 'rtl' : 'ltr';
  }
}
