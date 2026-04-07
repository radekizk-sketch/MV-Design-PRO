/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isDev = mode === 'development';
  const isTest = mode === 'test' || process.env.VITEST === 'true';
  const apiUrlDev = env.VITE_API_URL_DEV ?? process.env.VITE_API_URL_DEV ?? (isTest ? 'http://localhost' : undefined);
  const apiUrlProd = env.VITE_API_URL ?? process.env.VITE_API_URL ?? (isTest ? 'http://localhost' : undefined);
  const apiUrl = isDev ? apiUrlDev : apiUrlProd;

  if (!apiUrl) {
    throw new Error(
      'Brak wymaganej zmiennej API URL (VITE_API_URL_DEV dla DEV, VITE_API_URL dla PROD).',
    );
  }

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/');

            if (normalizedId.includes('/node_modules/')) {
              if (
                normalizedId.includes('/react/') ||
                normalizedId.includes('/react-dom/') ||
                normalizedId.includes('/scheduler/')
              ) {
                return 'vendor-react';
              }
              if (
                normalizedId.includes('/react-router/') ||
                normalizedId.includes('/react-router-dom/')
              ) {
                return 'vendor-router';
              }
              if (normalizedId.includes('/recharts/')) {
                return 'vendor-charts';
              }
              if (normalizedId.includes('/jspdf/')) {
                return 'vendor-pdf';
              }
              if (normalizedId.includes('/html2canvas/')) {
                return 'vendor-canvas';
              }
              if (
                normalizedId.includes('/@tanstack/react-query/') ||
                normalizedId.includes('/axios/')
              ) {
                return 'vendor-data';
              }
              if (
                normalizedId.includes('/react-hook-form/') ||
                normalizedId.includes('/@hookform/resolvers/') ||
                normalizedId.includes('/zod/')
              ) {
                return 'vendor-forms';
              }
              if (normalizedId.includes('/katex/')) {
                return 'vendor-katex';
              }
              if (normalizedId.includes('/zustand/')) {
                return 'vendor-state';
              }
              return 'vendor';
            }

            if (
              normalizedId.includes('/src/ui/results-workspace/') ||
              normalizedId.includes('/src/ui/results-inspector/') ||
              normalizedId.includes('/src/ui/power-flow-results/') ||
              normalizedId.includes('/src/ui/protection-results/')
            ) {
              return 'route-results';
            }

            if (
              normalizedId.includes('/src/ui/reference-patterns/') ||
              normalizedId.includes('/src/ui/fault-scenarios/') ||
              normalizedId.includes('/src/ui/enm-inspector/') ||
              normalizedId.includes('/src/ui/power-distribution/') ||
              normalizedId.includes('/src/ui/wizard/')
            ) {
              return 'route-tools';
            }

            if (
              normalizedId.includes('/src/ui/catalog/') ||
              normalizedId.includes('/src/ui/network-build/') ||
              normalizedId.includes('/src/ui/sld/export/')
            ) {
              return 'editor-tools';
            }
          },
        },
      },
    },
  };
});
