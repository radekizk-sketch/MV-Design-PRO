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
    // WEJŚCIA PRE-BUNDLINGU (E2E-FIX, 2026-09-05): Vite domyślnie skanuje pod
    // kątem zależności wyłącznie `index.html`. Pierwsze wejście na osobny punkt
    // wejścia (`*-harness.html`, np. `screenshot-harness.html` w e2e) odkrywało
    // nowe zależności i uruchamiało ponowną optymalizację z PEŁNYM przeładowaniem
    // strony — `page.goto` czekał na drugie zdarzenie `load` i pod obciążeniem
    // CPU przekraczał limit nawigacji (30 s), mimo że harness już się
    // wyrenderował. Jawna lista wejść pre-bundluje WSZYSTKIE punkty wejścia przy
    // starcie serwera (klasa: każdy harness, także przyszły — wzorzec, nie
    // wyliczenie), więc żaden test nie płaci za optymalizację w trakcie biegu.
    // To naprawa przyczyny; limity czasu Playwrighta pozostają bez zmian.
    optimizeDeps: {
      entries: ['index.html', '*-harness.html'],
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      // KANON PREFIKSU (karta PREFIKSY): backend wystawia KAŻDY router HTTP pod
      // `/api`, więc jedna reguła wystarczy. Wcześniej stała tu druga reguła dla
      // `/projects` — obejście tego, że router archiwum projektu był zamontowany
      // poza `/api`. Obejście leczyło objaw: dopóki go nie było, końcówki
      // istniały, ale z przeglądarki były NIEOSIĄGALNE (eksport paczki dostawał
      // HTML serwera statycznego zamiast ZIP-a). Router przeniesiono pod `/api`,
      // więc reguła zniknęła razem z przyczyną. Każdy nowy wpis tutaj oznacza
      // router poza kanonem — pilnuje tego `scripts/route_prefix_guard.py`.
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
