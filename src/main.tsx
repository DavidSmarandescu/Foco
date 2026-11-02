import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import { App } from './App';

// La app de escritorio ya trae todo en local: el service worker solo hace falta en la web.
if (!window.focoDesktop) {
  import('virtual:pwa-register').then(({ registerSW }) =>
    registerSW({
      immediate: true,
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent('foco:offline-ready'));
      },
    }),
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
