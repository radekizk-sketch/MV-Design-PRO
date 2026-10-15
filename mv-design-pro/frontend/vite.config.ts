/// <reference types="vitest" />
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve as resolvePath, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

const _dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Realpath `node_modules` względem korzenia projektu — rozwiązuje dowiązanie
 * (worktree izolowane) na rzeczywistą ścieżkę, którą Vite porównuje z
 * `server.fs.allow`. Brak katalogu (świeży checkout przed `npm ci`) zwraca
 * ścieżkę NIEROZWIĄZANĄ zamiast wywalać start configu — Vite i tak odmówi
 * serwowania z niego, dopóki nie powstanie.
 */
function realpathNodeModules(projectRoot: string): string {
  const path = resolvePath(projectRoot, 'node_modules');
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Pliki testów budżetu czasu procesora — JEDNO źródło zbioru (konfiguracja vitest poniżej
 * i test `src/test/__tests__/plikiBudzetuCzasu.test.ts`).
 *
 * PO CO (karta SZYBKIE-TESTY, 2026-10-15). Pomiar czasu procesora (`czasProcesora.ts`) nie
 * zależy od kolejki planisty, ale ZALEŻY od procesów liczących obok: współdzielona pamięć
 * podręczna i magistrala pamięci wydłużają czas procesora tego samego kodu. Zmierzone na
 * 4 vCPU: `buildScene.p1Recenzja` (budżet 30 000 ms) — sam plik zielony (2 z 2 biegów), w puli
 * 3 procesów 31 644 ms, w puli 4 procesów 30 675 ms. Wynik testu budżetu zależałby więc od tego,
 * które pliki akurat biegną obok — dlatego testy budżetu biegną w OSOBNYM kroku, jeden plik
 * naraz (`vitest run --mode budzety`), a główny bieg równoległy je pomija.
 *
 * ZBIÓR: każdy plik testów, który importuje pomocnik `czasProcesora`. Pomocnik odmawia pomiaru
 * poza trybem `budzety` (`czasProcesora.ts`), więc plik mierzący czas drogą pośrednią (przez
 * inny moduł) i nierozpoznany tutaj padnie głośno w biegu równoległym, zamiast losowo.
 */
/** Tryb vitest (`--mode`) kroku sekwencyjnego testów budżetu czasu (para: `czasProcesora.ts`). */
export const TRYB_BUDZETOW = 'budzety';

const IMPORT_POMOCNIKA = /from\s+['"][^'"]*\/czasProcesora['"]/;
const PLIK_TESTU = /\.(test|spec)\.tsx?$/;

function plikiTestow(katalog: string): string[] {
  return readdirSync(katalog, { withFileTypes: true }).flatMap((wpis) => {
    const sciezka = join(katalog, wpis.name);
    if (wpis.isDirectory()) return wpis.name === 'node_modules' ? [] : plikiTestow(sciezka);
    return PLIK_TESTU.test(wpis.name) ? [sciezka] : [];
  });
}

/** Ścieżki (względem `korzenFrontendu`, separator `/`) plików testów budżetu czasu, posortowane. */
export function plikiBudzetuCzasu(korzenFrontendu: string): string[] {
  return plikiTestow(join(korzenFrontendu, 'src'))
    .filter((sciezka) => IMPORT_POMOCNIKA.test(readFileSync(sciezka, 'utf-8')))
    .map((sciezka) => relative(korzenFrontendu, sciezka).split(sep).join('/'))
    .sort();
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isDev = mode === 'development';
  const isTest = mode === 'test' || process.env.VITEST === 'true';
  // Testy budżetu czasu procesora: osobny krok, jeden plik naraz (`plikiBudzetuCzasu` niżej).
  const krokBudzetow = mode === TRYB_BUDZETOW;
  const budzetyCzasu = isTest ? plikiBudzetuCzasu(_dirname) : [];
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
      // KARTA VITE-FS-ALLOW (2026-09-16, pomiar tego samego dnia). Gdy
      // `node_modules` jest DOWIĄZANIEM poza korzeniem worktree (worktree
      // izolowane współdzielą jedną realną kopię `node_modules`, żeby nie
      // kopiować kilkuset MB per worktree), Vite dev odmawia (403) plikom spod
      // `/@fs/<realpath>/...` (np. czcionki KaTeX, katalog `katex/dist/fonts`
      // ładowane przez `ui/proof/MathRenderer.tsx`): `server.fs.allow`
      // domyślnie obejmuje `searchForWorkspaceRoot(process.cwd())`, ale Vite
      // sprawdza listę wobec REALPATH żądanego pliku (dowiązanie rozwiązane),
      // a ten realpath leży POZA korzeniem worktree. Jawne dopisanie realpath
      // `node_modules` (rozwiązanego RAZ, przy starcie konfiguracji —
      // `realpathSync`, nie `readlink` w locie) naprawia to bez wyłączania
      // ochrony (`fs.strict: false` jest ZAKAZANE — wyłączyłoby cały mechanizm
      // zamiast rozszerzyć listę o jedną, konkretną, zweryfikowaną ścieżkę).
      // Korzeń projektu i `searchForWorkspaceRoot` zostają — to zachowanie
      // domyślne Vite, nadpisywane, nie zawężane, przez jawną listę.
      fs: {
        allow: Array.from(
          new Set([searchForWorkspaceRoot(_dirname), _dirname, realpathNodeModules(_dirname)]),
        ),
      },
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
      // KARTA SZYBKIE-TESTY (2026-09-30): pliki testów biegną RÓWNOLEGLE w puli PROCESÓW,
      // jeden plik na proces naraz. Pomiar przed zmianą (łańcuch p5, 2026-09-25): 879 plików
      // sekwencyjnie (`--no-file-parallelism`) — 1 644,9 s, w tym 369,5 s tworzenia środowiska
      // jsdom plik po pliku. Pula WĄTKÓW (domyślna w vitest 1.x) jest wykluczona: testy budżetu
      // algorytmu mierzą `process.cpuUsage()` całego procesu (`src/test/czasProcesora.ts`), więc
      // w puli wątków doliczałyby pracę plików wykonywanych obok — pomocnik odmawia pomiaru poza
      // wątkiem głównym procesu, a `src/test/__tests__/pulaTestow.test.ts` przypina ten warunek.
      pool: 'forks',
      // Liczba procesów zostaje DOMYŚLNA (rdzenie − 1) — rozstrzygnięcie z pomiaru 2026-10-15 na
      // 4 vCPU, to samo drzewo: 3 procesy 777,2 s; 4 procesy 702,6 s i 30,7 s czasu procesora
      // w testach budżetu `buildScene.p1Recenzja`/`buildScene.schemat10s7p6` (budżet 30 s, przy
      // 3 procesach zielone) — przy procesie na każdym rdzeniu rywalizacja o pamięć podręczną
      // zawyża czas procesora, więc wynik zależałby od obciążenia. 10 % czasu nie jest tego warte.
      setupFiles: ['./src/test/setup.ts'],
      // DWA KROKI JEDNEGO BIEGU (karta SZYBKIE-TESTY, 2026-10-15): testy budżetu czasu procesora
      // nie są wykluczone, tylko biegną w osobnym kroku `vitest run --mode budzety`, jeden plik
      // naraz — w puli równoległej sąsiednie procesy zawyżały ich czas procesora ponad budżet
      // (pomiar w opisie `plikiBudzetuCzasu` wyżej). `npm test` i CI uruchamiają oba kroki.
      fileParallelism: !krokBudzetow,
      include: krokBudzetow ? budzetyCzasu : ['src/**/*.{test,spec}.{ts,tsx}'],
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
      exclude: krokBudzetow ? [...configDefaults.exclude] : [...configDefaults.exclude, ...budzetyCzasu],
    },
  };
});
