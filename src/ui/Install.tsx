import { useEffect, useState } from 'preact/hooks';
import { useApp } from './context';
import { canPromptInstall, detectPlatform, isStandalone, onInstallPromptChange, promptInstall } from './platform';

const DISMISS_KEY = 'stallschemat-install-dismissed';

function useInstallState() {
  const [, force] = useState(0);
  useEffect(() => onInstallPromptChange(() => force((n) => n + 1)), []);
  return { platform: detectPlatform(), installed: isStandalone(), canPrompt: canPromptInstall() };
}

/** Small dismissable hint on the schedule page (only when not installed). */
export function InstallBanner() {
  const { setTab } = useApp();
  const { platform, installed, canPrompt } = useInstallState();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');
  if (installed || dismissed || (platform === 'desktop' && !canPrompt)) return null;
  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };
  return (
    <div class="install-banner" data-testid="install-banner">
      <span style={{ fontSize: '24px' }}>📲</span>
      <span style={{ flex: 1 }}>
        <b>Lägg appen på hemskärmen</b>
        <br />
        <span class="muted">Öppna schemat med ett tryck.</span>
      </span>
      {canPrompt ? (
        <button class="btn dark sm" onClick={() => promptInstall()}>Installera</button>
      ) : (
        <button
          class="btn dark sm"
          onClick={() => {
            setTab('settings');
            setTimeout(() => document.querySelector('[data-testid="install-card"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
          }}
        >
          Visa hur
        </button>
      )}
      <button class="x" onClick={dismiss} aria-label="Dölj">✕</button>
    </div>
  );
}

export function InstallCard() {
  const { platform, installed, canPrompt } = useInstallState();
  const [show, setShow] = useState<'ios' | 'android' | null>(null);

  if (installed) {
    return (
      <div class="card">
        <h2>📲 Appen</h2>
        <div class="ok-banner">✓ Appen är installerad på den här enheten.</div>
      </div>
    );
  }

  const guide = show ?? (platform === 'desktop' ? null : platform);

  return (
    <div class="card" data-testid="install-card">
      <h2>📲 Installera som app</h2>
      <p>Lägg Stallschemat på hemskärmen så öppnas det som en vanlig app – utan webbläsarfält.</p>

      {canPrompt && (
        <button class="btn primary block" onClick={() => promptInstall()}>
          Installera appen
        </button>
      )}

      {guide === 'ios' && (
        <>
          <h3>iPhone & iPad</h3>
          <ol class="steps">
            <li>
              <span>
                Tryck på <b>Dela</b>-knappen <span class="kbd">⬆︎</span>. I Safari på nyare iPhones ligger den under <span class="kbd">•••</span> längst ner.
              </span>
            </li>
            <li>
              <span>
                Välj <b>Lägg till på hemskärmen</b> (scrolla ner / tryck <b>Visa fler</b> om du inte ser det).
              </span>
            </li>
            <li>
              <span>
                Låt <b>Öppna som webbapp</b> vara påslaget och tryck <b>Lägg till</b>. Klart! 🐴
              </span>
            </li>
          </ol>
          <p class="help">Fungerar i Safari, och i Chrome/Edge från iOS 16.4.</p>
        </>
      )}

      {guide === 'android' && !canPrompt && (
        <>
          <h3>Android</h3>
          <ol class="steps">
            <li>
              <span>
                Öppna sidan i <b>Chrome</b> och tryck på menyn <span class="kbd">⋮</span> uppe till höger.
              </span>
            </li>
            <li>
              <span>
                Välj <b>Installera app</b> (eller <b>Lägg till på startskärmen</b>).
              </span>
            </li>
            <li>
              <span>Bekräfta – klart! 🐴</span>
            </li>
          </ol>
        </>
      )}

      {platform === 'desktop' && !canPrompt && !show && (
        <p class="help">Öppna sidan på din telefon för att installera den där. På datorn kan du installera via adressfältet i Chrome eller Edge.</p>
      )}

      <div class="toolbar mt">
        <span class="help" style={{ margin: 0 }}>Instruktioner för:</span>
        <button class={`pill ${guide === 'ios' ? 'on' : ''}`} onClick={() => setShow('ios')}>iPhone</button>
        <button class={`pill ${guide === 'android' ? 'on' : ''}`} onClick={() => setShow('android')}>Android</button>
      </div>
    </div>
  );
}
