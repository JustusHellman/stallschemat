import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// Version label = last commit time. Must be deterministic: the hourly calendar
// deploy rebuilds the same commit, and an identical build means the service
// worker does not see a "new version" (so nobody's app reloads needlessly).
function buildLabel(): string {
  try {
    return execSync('git log -1 --format=%cd --date=format:"%Y-%m-%d %H:%M"', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

// BASE_PATH is set by the GitHub Pages workflow to "/<repo-name>/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: {
    __BUILD_TIME__: JSON.stringify(buildLabel()),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Stallschemat',
        short_name: 'Stallschemat',
        description: 'Gemensamt schema för stallet – ta pass med ett tryck.',
        lang: 'sv',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#faf8f5',
        theme_color: '#5b4636',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Calendar feeds must always come fresh from the network.
        navigateFallbackDenylist: [/\/cal\//],
        globIgnores: ['cal/**'],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 800 },
  server: { port: 5173 },
});
