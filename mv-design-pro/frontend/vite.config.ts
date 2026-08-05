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
        // Router archiwum projektu (`backend/src/api/project_archive.py`) jest
        // zamontowany pod `/projects`, BEZ prefiksu `/api`. Bez tej reguły
        // eksport/import paczki z przeglądarki trafiał w serwer statyczny
        // (odpowiedź HTML zamiast ZIP) — końcówki istniały, ale były
        // nieosiągalne dla interfejsu. Aplikacja nie ma tras ścieżkowych
        // (nawigacja po hashu), więc przekierowanie `/projects` jest bezkolizyjne.
        '/projects': {
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
      // 2026-07-17 (likwidacja długów): lista wykluczeń WYZEROWANA — 7 wpisów
      // maskowało długi zamiast je naprawiać: 6 testów martwych (cele
      // skasowane: klaster legacy ui/sld sprzed v2/v3, App.routes ze stubami
      // nieistniejących modułów, canonicalSld importujący skasowany
      // topologyAdapter) USUNIĘTE razem z celami; BayCard.test PRZECHODZIŁ —
      // przywrócony bez zmian; InspectorEngineeringView.test ODBUDOWANY do
      // obecnego kanonu (przy okazji złapał i naprawił 2 realne regresje
      // komponentu: hardkod podtytułu źródła przekształtnikowego i gubienie
      // kluczy semantycznych w akcjach TechCard). Nowe wykluczenie wymaga
      // uzasadnienia w commicie — wykluczenie NIE jest naprawą.
      exclude: [...configDefaults.exclude],
    },
  };
});
