/**
 * Kontrakt typów `playwright-env.mjs` — modułu WŁASNEGO, nie cudzej paczki.
 *
 * DLACZEGO ISTNIEJE (karta TYPY-POZA-BRAMKA, 2026-08-08): `playwright.config.ts`
 * importuje `./scripts/playwright-env.mjs`, a `tsc` nie czyta `.mjs` bez
 * `allowJs` — import szedł więc jako implicit any (TS7016). Włączenie `allowJs`
 * wciągnęłoby do bramki wszystkie 20 skryptów `.mjs` naraz (dług nieznanej
 * wielkości, poza zakresem tej karty); deklaracja obok modułu opisuje DOKŁADNIE
 * to, co moduł eksportuje, i nie udaje niczego więcej.
 *
 * Plik jest parą do `playwright-env.mjs` — każda zmiana sygnatur tam MUSI
 * przyjść tutaj. Tego nie pilnuje żaden skrypt: pilnuje to fakt, że
 * `playwright.config.ts` jest w zasięgu bramki typów, więc rozjazd zapala
 * `npm run type-check`.
 */

/** Ścieżka do wykonywalnej przeglądarki Chromium albo `null`, gdy żadnej nie ma. */
export function resolveChromiumExecutable(): string | null;

/** Kopia środowiska z dołożoną ścieżką do Chromium, gdy udało się ją ustalić. */
export function getPlaywrightEnv(
  baseEnv?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv & { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?: string };
