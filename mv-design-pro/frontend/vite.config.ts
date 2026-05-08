/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

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
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id: string) => {
            // React ecosystem (runtime — tiny, keep with main)
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            // Heavy math / charting
            if (id.includes('node_modules/katex') || id.includes('node_modules/recharts')) {
              return 'chunk-charts';
            }
            // PDF export
            if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) {
              return 'chunk-export';
            }
            // SLD V2 — renderery, geometry, builder
            if (id.includes('src/ui/sld/v2/') || id.includes('src/engine/sld-layout/')) {
              return 'chunk-sld';
            }
            // Station wizard + bay editor (large wizard surfaces)
            if (
              id.includes('station-wizard') ||
              id.includes('station-configurator') ||
              id.includes('BayEditor') ||
              id.includes('BayCard')
            ) {
              return 'chunk-wizard';
            }
            // Results + proof surfaces (E-24 … E-37)
            if (
              id.includes('results-browser') ||
              id.includes('results-inspector') ||
              id.includes('proof-inspector') ||
              id.includes('protection-coordination')
            ) {
              return 'chunk-results';
            }
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: [
        ...configDefaults.exclude,
        'src/ui/network-build/__tests__/BayCard.test.tsx',
        'src/ui/network-build/__tests__/InspectorEngineeringView.test.tsx',
        'src/ui/sld/__tests__/enmSnapshotToSldSymbols.test.ts',
        'src/ui/sld/__tests__/sld-gpz-bay-render.test.tsx',
        'src/ui/sld/__tests__/sldIndustrialHierarchy.test.ts',
        'src/ui/sld/core/__tests__/canonicalSld.test.ts',
      ],
    },
  };
});
