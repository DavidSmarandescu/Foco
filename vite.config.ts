import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Foco · Estudia en cámara rápida',
        short_name: 'Foco',
        description: 'Graba tus sesiones de estudio en cámara rápida y lleva tu racha. Sin conexión y sin servidores.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0B0B0D',
        theme_color: '#0B0B0D',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Todo precacheado, incluido el runtime de visión y el modelo: la app
        // funciona entera sin red tras la primera visita.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,tflite}'],
        globIgnores: ['**/vision_wasm_nosimd_internal.*'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Variante sin SIMD para navegadores antiguos: se guarda al usarse.
            urlPattern: /vision_wasm_nosimd_internal\.(js|wasm)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'foco-mediapipe-nosimd' },
          },
        ],
      },
    }),
  ],
  base: './',
  build: { chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
