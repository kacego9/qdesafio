import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { I18nService } from '../../i18n/i18n.service';
import { Language, LanguageCode, LANGUAGES } from '../../i18n/translations';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="lang-wrap" [class.open]="isOpen">
      <button
        type="button"
        class="lang-trigger"
        (click)="toggle($event)"
        [attr.aria-label]="'Change language'"
      >
        <span class="lang-flag">{{ current.flag }}</span>
        <span class="lang-code">{{ current.code.toUpperCase() }}</span>
        <span class="lang-caret">▾</span>
      </button>

      <div class="lang-menu" *ngIf="isOpen">
        <button
          type="button"
          class="lang-option"
          *ngFor="let l of languages"
          [class.active]="l.code === current.code"
          (click)="pick(l.code, $event)"
        >
          <span class="lang-flag">{{ l.flag }}</span>
          <span class="lang-label">{{ l.label }}</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .lang-wrap {
      position: relative;
      display: inline-block;
      font-family: 'Poppins', system-ui, sans-serif;
    }
    .lang-trigger {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }
    .lang-trigger:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }
    .lang-flag { font-size: 16px; line-height: 1; }
    .lang-caret {
      font-size: 10px;
      opacity: 0.7;
      transition: transform 0.2s;
    }
    .lang-wrap.open .lang-caret { transform: rotate(180deg); }

    .lang-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 160px;
      max-height: 70vh;
      overflow-y: auto;
      background: rgba(20, 10, 40, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 6px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      z-index: 200;
      display: flex;
      flex-direction: column;
      gap: 2px;
      animation: menuIn 0.15s ease;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent;
    }
    .lang-menu::-webkit-scrollbar { width: 6px; }
    .lang-menu::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.2);
      border-radius: 3px;
    }
    @keyframes menuIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .lang-option {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: transparent;
      border: none;
      border-radius: 8px;
      color: #fff;
      text-align: left;
      font-size: 14px;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s;
    }
    .lang-option:hover { background: rgba(255, 255, 255, 0.08); }
    .lang-option.active {
      background: rgba(255, 0, 110, 0.2);
      color: #ff006e;
    }
  `]
})
export class LanguageSelectorComponent {
  isOpen = false;
  languages: Language[] = LANGUAGES;

  constructor(private i18n: I18nService) {}

  get current(): Language {
    return LANGUAGES.find(l => l.code === this.i18n.current) || LANGUAGES[0];
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  pick(code: LanguageCode, event: MouseEvent): void {
    event.stopPropagation();
    this.i18n.setLanguage(code);
    this.isOpen = false;
  }

  @HostListener('document:click')
  onOutsideClick(): void {
    this.isOpen = false;
  }
}
