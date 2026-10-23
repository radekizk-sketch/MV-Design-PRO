// WYBÓR TESTÓW VITEST WPŁYWEM ZMIANY — z uzasadnieniem, na grafie modułów samego vitest.
//
// Po co (karta SZYBKIE-TESTY-DO-SCALENIA, 2026-10-15): bramka scalenia
// (`mv-design-pro/scripts/bramka_scalenia.py`) ma wypisać, KTÓRY zmieniony plik pociągnął
// KTÓRY test. `vitest related` wybiera dokładnie te pliki, ale nie mówi dlaczego; ten skrypt
// wywołuje TĘ SAMĄ metodę wyboru (`Vitest.filterTestsBySource` — graf importów vite-node,
// wyzwalacze pełnego biegu `forceRerunTriggers`) i dla każdego wybranego pliku testów zapisuje
// zmienione pliki z jego domknięcia importów (`Vitest.getTestDependencies`). Drugiego parsera
// importów TypeScript nie ma.
//
// Jedna luka `vitest related` jest tu domknięta jawnie: pliki `setupFiles` (i ich importy)
// wykonują się przed KAŻDYM plikiem testów, a nie należą do grafu importów testu — ich zmiana
// wybiera komplet testów, tak jak wyzwalacz pełnego biegu.
//
// Dwa kroki vitest (karta SZYBKIE-TESTY, `vite.config.ts`): bieg główny i krok testów budżetu
// czasu procesora `--mode budzety`, który ma WŁASNY zbiór plików. Pomocnik wybiera w kroku
// wskazanym trzecim argumentem (`test` albo `budzety`), więc bramka woła go dla obu kroków.
//
// Użycie (z katalogu `frontend/`): node scripts/vitest_wplyw.mjs <wyjscie.json> <tryb> <plik>...
// Ścieżki zmienionych plików: względem katalogu `frontend/` albo bezwzględne.
// Wyjście JSON: {"pelny_bieg": "<przyczyna>"|null, "wszystkich": N, "lista": ["<test bezwzgl.>"...], "testy": {"<test bezwzgl.>": ["<zmieniony>"...]}}
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createVitest } from 'vitest/node';

const [wyjscie, tryb, ...zmienione] = process.argv.slice(2);
if (!wyjscie || !tryb) {
  console.error('użycie: node scripts/vitest_wplyw.mjs <wyjscie.json> <tryb> <zmieniony plik>...');
  process.exit(2);
}
const korzen = process.cwd();
const zmienioneBezwzgl = [...new Set(zmienione.map((p) => resolve(korzen, p)))].sort();

// Jak CLI vitest (`startVitest`): konfiguracja rozpoznaje bieg testów po `VITEST=true` także
// w trybie innym niż `test` (krok `--mode budzety`, `vite.config.ts`).
process.env.VITEST = 'true';
const ctx = await createVitest('test', {
  mode: tryb,
  watch: false,
  run: true,
  related: zmienioneBezwzgl,
});
try {
  const wszystkie = await ctx.globTestFiles();
  let pelnyBieg = null;
  const projekt = wszystkie.length > 0 ? wszystkie[0][0] : null;
  if (projekt !== null) {
    for (const plikStartowy of ctx.config.setupFiles ?? []) {
      const zaleznosci = await ctx.getTestDependencies([projekt, plikStartowy]);
      zaleznosci.add(plikStartowy);
      const trafiony = zmienioneBezwzgl.find((p) => zaleznosci.has(p));
      if (trafiony !== undefined) {
        pelnyBieg = `plik startowy testów (setupFiles) albo jego import: ${trafiony}`;
        break;
      }
    }
  }
  const wybrane = pelnyBieg !== null ? wszystkie : await ctx.filterTestsBySource(wszystkie);
  if (pelnyBieg === null && zmienioneBezwzgl.length > 0 && wybrane.length === wszystkie.length) {
    // `filterTestsBySource` zwraca komplet wyłącznie przez wyzwalacz pełnego biegu
    // (`forceRerunTriggers`) albo gdy każdy test zależy od zmiany — przyczyna wypisana jawnie.
    pelnyBieg = 'wyzwalacz pełnego biegu vitest (forceRerunTriggers) albo zależność każdego testu';
  }
  const testy = {};
  for (const spec of wybrane) {
    const zaleznosci = await ctx.getTestDependencies(spec);
    const przyczyny = zmienioneBezwzgl.filter((p) => p === spec[1] || zaleznosci.has(p));
    testy[spec[1]] = przyczyny;
  }
  const posortowane = Object.fromEntries(Object.keys(testy).sort().map((k) => [k, testy[k]]));
  writeFileSync(
    wyjscie,
    JSON.stringify(
      {
        pelny_bieg: pelnyBieg,
        wszystkich: wszystkie.length,
        // Komplet plików kroku (posortowany) — wzorzec, względem którego pełna bramka lokalna
        // (`scripts/brama_pelna.py`) dowodzi, że shardy vitest dają razem DOKŁADNIE ten zbiór.
        lista: wszystkie.map((spec) => spec[1]).sort(),
        testy: posortowane,
      },
      null,
      1,
    ),
  );
} finally {
  await ctx.close();
}
