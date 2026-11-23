import { useState } from 'preact/hooks';
import { COLORS, randomId } from '../domain/defaults';
import { validatePersonName } from '../domain/validate';
import { ColorPicker, Dot } from './common';
import { useApp } from './context';

/**
 * Pick who you are (or add yourself). Used as the first-run screen and in the
 * "byt person" sheet when tapping your name in the header.
 */
export function WhoAreYou({ onDone }: { onDone?: () => void }) {
  const { state, me, setMe, updateConfig } = useApp();
  const people = Object.entries(state.config.people).filter(([, p]) => p.active);
  people.sort((a, b) => a[1].name.localeCompare(b[1].name, 'sv'));
  const [selected, setSelected] = useState<string | null>(me && state.config.people[me] ? me : null);
  const [adding, setAdding] = useState(people.length === 0);
  const [name, setName] = useState('');
  const usedColors = people.filter(([id]) => id !== selected).map(([, p]) => p.color);
  const [color, setColor] = useState<string>(
    (selected && state.config.people[selected]?.color) || COLORS.find((c) => !usedColors.includes(c)) || COLORS[0],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (id: string) => {
    setSelected(id);
    setAdding(false);
    setColor(state.config.people[id].color);
    setError(null);
  };

  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      if (adding) {
        const err = validatePersonName(name, Object.values(state.config.people).map((p) => p.name));
        if (err) return setError(err);
        const id = randomId();
        const ok = await updateConfig((c) => ({ ...c, people: { ...c.people, [id]: { name: name.trim(), color, active: true } } }));
        if (ok) {
          setMe(id);
          onDone?.();
        }
      } else if (selected) {
        if (state.config.people[selected].color !== color) {
          await updateConfig((c) => ({ ...c, people: { ...c.people, [selected]: { ...c.people[selected], color } } }));
        }
        setMe(selected);
        onDone?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const label = adding ? (name.trim() ? `Jag är ${name.trim()} →` : 'Lägg till mig') : selected ? `Jag är ${state.config.people[selected].name} →` : 'Välj ditt namn';

  return (
    <div>
      <div class="people">
        {people.map(([id, p]) => (
          <button key={id} class={`person ${selected === id && !adding ? 'sel' : ''}`} onClick={() => pick(id)} aria-pressed={selected === id && !adding}>
            <Dot color={p.color} />
            {p.name}
          </button>
        ))}
        <button
          class={`person new ${adding ? 'sel' : ''}`}
          onClick={() => {
            setAdding(true);
            setSelected(null);
            setColor(COLORS.find((c) => !people.some(([, p]) => p.color === c)) ?? COLORS[0]);
          }}
        >
          ＋ Ny person
        </button>
      </div>

      {adding && (
        <>
          <label class="f" for="new-name">Ditt namn</label>
          <input
            id="new-name"
            class="input"
            value={name}
            maxLength={24}
            autoFocus
            placeholder="t.ex. Maja"
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && confirm()}
          />
        </>
      )}

      {(adding || selected) && (
        <>
          <label class="f">Din färg</label>
          <ColorPicker value={color} onChange={setColor} used={usedColors} />
        </>
      )}
      {error && <div class="err">{error}</div>}
      <button class="btn primary block" disabled={busy || (!adding && !selected)} onClick={confirm}>
        {label}
      </button>
      <p class="help center">Valet sparas på den här enheten. Du kan byta när som helst genom att trycka på ditt namn uppe till höger.</p>
    </div>
  );
}
