import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

/**
 * Bootstrap server-side: el segundo argumento `context` es obligatorio
 * en Angular 19+ para inicializar la plataforma server. Sin él, falla con NG0401.
 */
const bootstrap = (context: any) => bootstrapApplication(AppComponent, config, context);

export default bootstrap;
