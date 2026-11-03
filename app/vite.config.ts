import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: { target: 'es2020', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  plugins: [
    VitePWA({
      // Neue Versionen warten, bis die App geschlossen und neu geöffnet wird. Nie mitten im Zeichnen neu laden.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Grundriss-Skizze',
        short_name: 'Skizze',
        lang: 'de',
        description: 'Räume skizzieren, Maße eintragen, PDF erzeugen. Läuft ohne Internet.',
        display: 'standalone',
        start_url: './',
        scope: './',
        background_color: '#f4f5f3',
        theme_color: '#0b6b57',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
