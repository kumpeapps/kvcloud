import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Polyfill for crypto.randomUUID if not available
if (typeof window !== 'undefined' && typeof window.crypto !== 'undefined') {
  if (!window.crypto.randomUUID) {
    (window.crypto as any).randomUUID = function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
  }
}

// Force dark theme as default
if (typeof document !== 'undefined') {
  document.body.classList.add('dark-theme');
  document.body.classList.remove('light-theme');
}

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => {
    console.error('Bootstrap error:', err);
    document.body.innerHTML = `<div style="padding: 20px; color: red;">
      <h1>Application Error</h1>
      <pre>${err.message || err}</pre>
    </div>`;
  });
