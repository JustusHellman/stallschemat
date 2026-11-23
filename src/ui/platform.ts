/** Device / install helpers. */

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints): Platform {
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isMacSafari(ua = navigator.userAgent): boolean {
  return /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
}

/** Captured "beforeinstallprompt" event (Android / desktop Chrome & Edge). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const canPromptInstall = () => deferred !== null;

export function onInstallPromptChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}

/** Calendar feed URLs for a person. */
export function calendarUrls(personId: string, origin = location.origin, base = import.meta.env.BASE_URL) {
  const https = `${origin}${base.endsWith('/') ? base : base + '/'}cal/${personId}.ics`;
  const webcal = https.replace(/^https?:/, 'webcal:');
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent('Stallschemat')}`,
  };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Use the native share sheet if available, otherwise copy. Returns how it was shared. */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (navigator.share && detectPlatform() !== 'desktop') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch {
      /* cancelled – fall through to copy */
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export function downloadFile(name: string, content: string, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
