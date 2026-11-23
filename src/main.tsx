import { render } from 'preact';
import { createBackend } from './data/setup';
import { setupServiceWorker } from './sw';
import { App } from './ui/App';
import { captureInstallPrompt } from './ui/platform';
import './ui/styles.css';

captureInstallPrompt();
void setupServiceWorker();

const root = document.getElementById('app')!;

createBackend()
  .then(async (backend) => {
    await backend.init();
    render(<App backend={backend} />, root);
  })
  .catch((e) => {
    console.error(e);
    root.innerHTML = `<div class="app"><div class="loading" style="padding:24px;text-align:center">Kunde inte starta appen.<br><small>${String(
      e?.message ?? e,
    ).replace(/</g, '&lt;')}</small><br><br><button class="btn" onclick="location.reload()">Försök igen</button></div></div>`;
  });
