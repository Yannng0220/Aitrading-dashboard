import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  return {
    // For GitHub Pages deployment, set BASE_PATH to "/<repo-name>/" in CI.
    // Locally it stays "/" so dev server works normally.
    base: process.env.BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Allow accessing the dev server through ngrok (Host header check)
      // - supports both the new ngrok-free.app and legacy ngrok.io domains
      // - optionally set NGROK_HOST to an exact hostname (e.g. "abcd-1-2-3-4.ngrok-free.app")
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        '::1',
        '.ngrok-free.app',
        '.ngrok.io',
        ...(process.env.NGROK_HOST ? [process.env.NGROK_HOST] : []),
      ],
    },
    build: {
      // Privacy hardening: don't ship source maps, and minify aggressively
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          passes: 2,
          drop_console: true,
          drop_debugger: true,
        },
        format: {
          comments: false,
        },
        mangle: true,
      },
    },
  };
});
