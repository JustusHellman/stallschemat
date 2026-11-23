import { useState } from 'preact/hooks';
import { hashAdminCode } from '../domain/util';
import { CalendarCard } from './Calendar';
import { Dot, Sheet } from './common';
import { useApp } from './context';
import { InstallCard } from './Install';
import { WhoAreYou } from './WhoAreYou';
import { checkForAppUpdate } from '../sw';

export function Settings() {
  const app = useApp();
  const { me, nameOf, colorOf, isAdmin } = app;
  const [switching, setSwitching] = useState(false);

  return (
    <div>
      <div class="card">
        <h2>Du är</h2>
        <div class="row" style={{ boxShadow: 'none', padding: '6px 0', margin: 0 }}>
          <Dot color={colorOf(me)} />
          <div class="main"><b>{nameOf(me)}</b></div>
          <button class="btn sm" onClick={() => setSwitching(true)}>Byt person / färg</button>
        </div>
      </div>

      <CalendarCard />
      <InstallCard />
      <AdminEntry />

      <div class="card">
        <h2>Uppdateringar</h2>
        <p>Schemat uppdateras automatiskt när appen är öppen och varje gång du öppnar den igen. Nya versioner av appen installeras av sig själva.</p>
        <button
          class="btn block"
          onClick={async () => {
            app.sync.refresh();
            const found = await checkForAppUpdate();
            app.toast(found ? 'Ny version hittad – startar om…' : 'Schemat är uppdaterat ✓');
          }}
        >
          Uppdatera nu
        </button>
      </div>
      <div class="version">
        Stallschemat · byggd {__BUILD_TIME__}
        {isAdmin && ' · admin'}
      </div>
      {switching && (
        <Sheet label="Byt person" onClose={() => setSwitching(false)}>
          <h3 style={{ marginBottom: '12px' }}>Vem är du?</h3>
          <WhoAreYou onDone={() => setSwitching(false)} />
        </Sheet>
      )}
    </div>
  );
}

function AdminEntry() {
  const app = useApp();
  const { state, isAdmin, unlockAdmin, setTab } = app;
  const hasCode = !!state.config.adminHash;
  const [code, setCode] = useState('');
  const [code2, setCode2] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (isAdmin) {
    return (
      <div class="card">
        <h2>🔑 Admin</h2>
        <p>Admin-läget är upplåst på den här enheten.</p>
        <button class="btn dark block" onClick={() => setTab('admin')}>Öppna admin</button>
        <button class="btn block" onClick={() => unlockAdmin(null)}>Lås admin på den här enheten</button>
      </div>
    );
  }

  const submit = async (e: Event) => {
    e.preventDefault();
    setErr(null);
    if (!/^\S{4,}$/.test(code.trim())) return setErr('Koden måste vara minst 4 tecken.');
    const hash = await hashAdminCode(code);
    if (!hasCode) {
      if (code !== code2) return setErr('Koderna matchar inte.');
      const ok = await app.updateConfig((c) => (c.adminHash ? c : { ...c, adminHash: hash }));
      if (!ok) return;
      unlockAdmin(hash);
      app.toast('Admin-kod skapad 🔑');
      setTab('admin');
    } else if (hash === state.config.adminHash) {
      unlockAdmin(hash);
      setTab('admin');
    } else {
      setErr('Fel kod.');
    }
  };

  return (
    <form class="card" onSubmit={submit} data-testid="admin-entry">
      <h2>🔑 Admin</h2>
      <p>{hasCode ? 'Ange admin-koden för att ändra schemat, se statistik och hantera personer.' : 'Ingen admin-kod finns ännu. Skapa en – den som har koden kan ändra grundschemat.'}</p>
      <input class="input" type="password" autoComplete="off" placeholder={hasCode ? 'Admin-kod' : 'Ny admin-kod'} value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} aria-label="Admin-kod" />
      {!hasCode && (
        <input class="input mt" type="password" autoComplete="off" placeholder="Upprepa koden" value={code2} onInput={(e) => setCode2((e.target as HTMLInputElement).value)} aria-label="Upprepa admin-kod" />
      )}
      {err && <div class="err">{err}</div>}
      <button class="btn dark block" type="submit">{hasCode ? 'Lås upp' : 'Skapa kod'}</button>
    </form>
  );
}
