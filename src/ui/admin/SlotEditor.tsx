import { useEffect, useState } from 'preact/hooks';
import { normalizeTime } from '../../domain/dates';
import { randomId } from '../../domain/defaults';
import type { Slot } from '../../domain/types';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

/** Editable list of shifts (name, time, length). */
export function SlotEditor({ slots, onChange }: { slots: Slot[]; onChange: (s: Slot[]) => void }) {
  const set = (i: number, patch: Partial<Slot>) => onChange(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div data-testid="slot-editor">
      <div class="slot-edit-head">
        <span>Pass</span>
        <span>Tid</span>
        <span>Längd</span>
        <span />
      </div>
      {slots.map((s, i) => (
        <div class="slot-edit" key={s.id}>
          <input class="input sm" value={s.name} maxLength={40} aria-label="Passnamn" onInput={(e) => set(i, { name: (e.target as HTMLInputElement).value })} />
          <TimeInput value={s.time} label={`Tid för ${s.name}`} onChange={(time) => set(i, { time })} />
          <select class="input sm" value={s.duration} aria-label={`Längd för ${s.name}`} onChange={(e) => set(i, { duration: +(e.target as HTMLSelectElement).value })}>
            {[...new Set([...DURATIONS, s.duration])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>{d < 60 ? `${d} min` : `${d / 60} h`}</option>
            ))}
          </select>
          <button class="del" aria-label={`Ta bort ${s.name}`} onClick={() => onChange(slots.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button class="btn sm mt" onClick={() => onChange([...slots, { id: randomId(6), name: '', time: '12:00', duration: 30 }])}>
        ＋ Lägg till pass
      </button>
    </div>
  );
}

/** 24-hour text time input (native time pickers may show AM/PM depending on the phone's settings). */
function TimeInput({ value, label, onChange }: { value: string; label: string; onChange: (t: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const t = normalizeTime(text);
    if (t) {
      setText(t);
      onChange(t);
    } else {
      onChange(text); // keep invalid text so validation can complain
    }
  };
  return (
    <input
      class="input sm"
      inputMode="numeric"
      placeholder="TT:MM"
      maxLength={5}
      value={text}
      aria-label={label}
      onInput={(e) => setText((e.target as HTMLInputElement).value)}
      onBlur={commit}
      onChange={commit}
    />
  );
}
