/**
 * Service worker registration + smart app updates.
 * The browser checks for a new version on start; we additionally check when
 * the app comes back from the background (at most every 30 min). A new
 * version activates automatically and the page reloads – this only happens
 * right after opening the app, so nobody is interrupted mid-tap.
 */
let registration: ServiceWorkerRegistration | undefined;
let lastCheck = 0;
const MIN_INTERVAL = 30 * 60_000;

export async function setupServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg;
      lastCheck = Date.now();
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > MIN_INTERVAL) void checkForAppUpdate();
  });
}

/** Returns true if a new version was found (it will then install and reload). */
export async function checkForAppUpdate(): Promise<boolean> {
  if (!registration) return false;
  lastCheck = Date.now();
  try {
    await registration.update();
    return !!(registration.installing || registration.waiting);
  } catch {
    return false;
  }
}
