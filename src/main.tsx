import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-900.css';
import './styles.css';
import { render } from 'preact';
import { App } from './App';

// Pas de zoom : Safari sur iPhone ignore « user-scalable=no », on bloque donc le geste de pincement.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

const root = document.getElementById('app');
if (root) render(<App />, root);

// Service worker : l'application reste utilisable hors ligne une fois chargée.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
