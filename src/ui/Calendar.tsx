import { useState } from 'preact/hooks';
import { useApp } from './context';
import { calendarUrls, copyText, detectPlatform, isMacSafari } from './platform';

type Kind = 'apple' | 'google' | 'outlook';

/** Step-by-step calendar subscription (personal feed rebuilt hourly by GitHub Actions). */
export function CalendarCard() {
  const { me, toast } = useApp();
  const platform = detectPlatform();
  const defaultKind: Kind = platform === 'ios' || isMacSafari() ? 'apple' : 'google';
  const [kind, setKind] = useState<Kind>(defaultKind);
  if (!me) return null;
  const urls = calendarUrls(me);

  const copy = async () => {
    toast((await copyText(urls.https)) ? 'Länken är kopierad.' : 'Kunde inte kopiera – markera länken och kopiera manuellt.');
  };

  return (
    <div class="card" data-testid="calendar-card">
      <h2>📆 Mina pass i kalendern</h2>
      <p>Prenumerera en gång – sedan dyker dina pass upp i telefonens kalender av sig själva, och försvinner om du släpper dem.</p>

      <div class="seg" role="tablist" aria-label="Kalender">
        <button role="tab" aria-selected={kind === 'apple'} class={kind === 'apple' ? 'on' : ''} onClick={() => setKind('apple')}>iPhone / Mac</button>
        <button role="tab" aria-selected={kind === 'google'} class={kind === 'google' ? 'on' : ''} onClick={() => setKind('google')}>Google / Android</button>
        <button role="tab" aria-selected={kind === 'outlook'} class={kind === 'outlook' ? 'on' : ''} onClick={() => setKind('outlook')}>Outlook</button>
      </div>

      {kind === 'apple' && (
        <>
          <a class="btn primary block" href={urls.webcal} data-testid="cal-apple">Prenumerera i Kalender</a>
          <ol class="steps">
            <li><span>Tryck på den gröna knappen ovan.</span></li>
            <li><span>Tryck <b>Prenumerera</b> i rutan som dyker upp.</span></li>
            <li><span>Tryck <b>Lägg till</b> (ändra gärna färg först). Klart!</span></li>
          </ol>
          <p class="help">Tips: under Inställningar → Kalender → Konton → Prenumererade kalendrar kan du välja hur ofta den hämtar (t.ex. varje timme).</p>
        </>
      )}

      {kind === 'google' && (
        <>
          <a class="btn primary block" href={urls.google} target="_blank" rel="noopener" data-testid="cal-google">Lägg till i Google Kalender</a>
          <ol class="steps">
            <li><span>Tryck på den gröna knappen – Google Kalender öppnas i webbläsaren (logga in om det behövs).</span></li>
            <li><span>Tryck <b>Lägg till</b> för att bekräfta.</span></li>
            <li><span>Öppna Google Kalender-appen. Syns den inte: Meny → Inställningar → <b>Stallschemat</b> → slå på <b>Synkronisera</b>.</span></li>
          </ol>
          <p class="help">Obs! Google uppdaterar prenumererade kalendrar bara några gånger per dygn. Appen visar alltid det senaste.</p>
        </>
      )}

      {kind === 'outlook' && (
        <>
          <a class="btn primary block" href={urls.outlook} target="_blank" rel="noopener">Lägg till i Outlook</a>
          <ol class="steps">
            <li><span>Tryck på den gröna knappen och logga in.</span></li>
            <li><span>Tryck <b>Importera</b> / <b>Prenumerera</b>.</span></li>
          </ol>
        </>
      )}

      <label class="f">Eller kopiera din personliga länk</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input class="input sm" readOnly value={urls.https} onFocus={(e) => (e.target as HTMLInputElement).select()} aria-label="Kalenderlänk" />
        <button class="btn sm" onClick={copy}>Kopiera</button>
      </div>
      <p class="help">Kalendern uppdateras varje timme. Är du ny kan det dröja upp till en timme innan länken fungerar.</p>
    </div>
  );
}
