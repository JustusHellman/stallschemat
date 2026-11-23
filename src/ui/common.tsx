import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { COLORS } from '../domain/defaults';

export function Dot({ color, size }: { color: string; size?: 'sm' | 'md' }) {
  return <span class={`dot ${size ?? ''}`} style={{ background: color }} aria-hidden="true" />;
}

/*
 * One shared history entry while any sheet is open, so the phone's back
 * button / back gesture closes the sheet instead of leaving the app.
 * Switching directly from one sheet to another reuses the entry.
 */
const sheetStack: (() => void)[] = [];
(globalThis as { __sheetStack?: unknown }).__sheetStack = sheetStack;
let ignoreNextPop = false;
let popListening = false;

function onPopState() {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    return;
  }
  const top = sheetStack[sheetStack.length - 1];
  if (top) {
    (top as (() => void) & { byPop?: boolean }).byPop = true;
    top();
  }
}

/**
 * Bottom sheet. Closes with: the backdrop, Escape, the ✕, the phone's back
 * button / back gesture, or by swiping down. The page behind doesn't scroll.
 */
export function Sheet({ onClose, children, label }: { onClose: () => void; children: ComponentChildren; label: string }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number } | null>(null);

  // Layout effect: registers synchronously, so Escape/back work immediately after opening.
  useLayoutEffect(() => {
    const entry = Object.assign(() => closeRef.current(), { byPop: false });
    sheetStack.push(entry);
    if (!popListening) {
      window.addEventListener('popstate', onPopState);
      popListening = true;
    }
    if (!history.state?.stallSheet) history.pushState({ stallSheet: true }, '');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && sheetStack[sheetStack.length - 1] === entry && closeRef.current();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      sheetStack.splice(sheetStack.indexOf(entry), 1);
      // Defer: if another sheet opens right away, it keeps the history entry.
      setTimeout(() => {
        if (sheetStack.length) return;
        document.body.style.overflow = '';
        if (!entry.byPop && history.state?.stallSheet) {
          ignoreNextPop = true;
          history.back();
        }
      }, 0);
    };
  }, []);

  const onTouchStart = (e: TouchEvent) => {
    if ((sheetRef.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y0: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!drag.current || !sheetRef.current) return;
    drag.current.dy = Math.max(0, e.touches[0].clientY - drag.current.y0);
    sheetRef.current.style.transform = `translate(-50%, ${drag.current.dy}px)`;
  };
  const onTouchEnd = () => {
    if (!drag.current || !sheetRef.current) return;
    const { dy } = drag.current;
    drag.current = null;
    sheetRef.current.style.transform = '';
    if (dy > 90) closeRef.current();
  };

  return (
    <>
      <div class="backdrop" onClick={() => closeRef.current()} data-testid="backdrop" />
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={sheetRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div class="grab" aria-hidden="true" />
        <button class="sheet-x" onClick={() => closeRef.current()} aria-label="Stäng rutan">✕</button>
        {children}
      </div>
    </>
  );
}

export function ColorPicker({ value, onChange, used = [] }: { value: string; onChange: (c: string) => void; used?: string[] }) {
  return (
    <div class="colors" role="radiogroup" aria-label="Färg">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={`Färg ${c}${used.includes(c) ? ' (används av någon annan)' : ''}`}
          class={`${c === value ? 'sel' : ''} ${used.includes(c) && c !== value ? 'used' : ''}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export function Toast({ msg, kind }: { msg: string; kind: 'info' | 'error' }) {
  return (
    <div class={`toast ${kind === 'error' ? 'error' : ''}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
}

/** "för 5 min sedan" */
export function relativeTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'nyss';
  const m = Math.round(s / 60);
  if (m < 60) return `för ${m} min sedan`;
  const h = Math.round(m / 60);
  if (h < 24) return `för ${h} h sedan`;
  const d = Math.round(h / 24);
  return `för ${d} ${d === 1 ? 'dag' : 'dagar'} sedan`;
}
