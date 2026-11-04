// @vitest-environment node
/**
 * Strażnik klasy „spec e2e pada przy ŁADOWANIU modułu" (karta FIX-LOM-SCENA).
 *
 * PO CO. Pełny bieg e2e przerywał się na starcie, zanim ruszył jakikolwiek test:
 * `e2e/dowody-oze-screenshot.spec.ts` na poziomie modułu szukał w wygenerowanej fiksturze
 * harnessu pola z nastawą 81R (`.find(…)!`), fikstura po karcie W5-B takiego pola nie miała,
 * a `.checks` na `undefined` rzucał TypeError. Playwright ładuje WSZYSTKIE speki przed
 * pierwszym testem, więc jeden wyjątek w kodzie modułu zatrzymuje cały bieg — i wychodzi
 * dopiero w pełnym e2e, który lokalnie nikt nie uruchamiał od tamtej zmiany.
 *
 * Ten test ładuje każdy spec tak, jak robi to Playwright (`playwright test --list` —
 * ewaluacja modułów bez przeglądarki i bez serwerów), i wymaga: zero błędów ładowania oraz
 * każdy plik `e2e/*.spec.ts` obecny na liście (spec, który nie zarejestrował testów, też jest
 * defektem — nie ma czego uruchomić). Obejmuje każde zapytanie do fikstur na poziomie modułu,
 * bez listy wzorców do utrzymywania.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const KATALOG_FRONTENDU = path.resolve(__dirname, '../../..');
const KATALOG_E2E = path.join(KATALOG_FRONTENDU, 'e2e');
const CLI_PLAYWRIGHTA = path.join(KATALOG_FRONTENDU, 'node_modules/@playwright/test/cli.js');

interface BladLadowania {
  message?: string;
  location?: { file: string; line: number; column: number };
}

interface ListaPlaywrighta {
  suites: { file: string }[];
  errors: BladLadowania[];
}

function listaSpecow(): { kod: number | null; lista: ListaPlaywrighta; stderr: string } {
  const env: Record<string, string | undefined> = { ...process.env };
  // `--list` nie startuje serwerów; bez trybu realnego backendu konfiguracja nie zakłada też
  // katalogu tymczasowego biegu.
  delete env.PLAYWRIGHT_REAL_BACKEND;
  delete env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  const wynik = spawnSync(process.execPath, [CLI_PLAYWRIGHTA, 'test', '--list', '--reporter=json'], {
    cwd: KATALOG_FRONTENDU,
    env,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { kod: wynik.status, lista: JSON.parse(wynik.stdout) as ListaPlaywrighta, stderr: wynik.stderr };
}

describe('Ładowanie speców e2e (Playwright --list)', () => {
  it('każdy spec e2e ładuje się bez wyjątku i rejestruje testy', () => {
    const { kod, lista, stderr } = listaSpecow();
    const bledy = lista.errors.map(
      (blad) =>
        `${blad.location ? `${path.basename(blad.location.file)}:${blad.location.line}` : '?'} — ${
          (blad.message ?? '').split('\n')[0]
        }`,
    );
    expect(bledy, stderr).toEqual([]);
    expect(kod).toBe(0);

    const zaladowane = lista.suites.map((suite) => suite.file).sort();
    const naDysku = fs
      .readdirSync(KATALOG_E2E)
      .filter((nazwa) => nazwa.endsWith('.spec.ts'))
      .sort();
    expect(zaladowane).toEqual(naDysku);
  }, 120_000);
});
