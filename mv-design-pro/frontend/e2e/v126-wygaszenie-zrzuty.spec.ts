/**
 * Zrzuty okna „Analizy akademickie" dla karty V126-WYGASZENIE — para PRZED/PO.
 *
 * ŹRÓDŁO (uczciwie): HARNESS PREZENTACJI (`creator-harness.html`, scena
 * `akademickie`), a NIE żywy backend. Podmieniony `fetch` odsyła REALNE
 * odpowiedzi solvera z fixtury CI `odpowiedziSolvera.json` (generator
 * `backend/tests/ci/generuj_odpowiedzi_v126.py`), a katalog rodzajów
 * `analysis-types` odsyła KOMPLET kontraktu — dzięki temu zrzut „po" pokazuje
 * odsiew rodzaju wycofanego na tych samych danych, na których stoi strażnik.
 *
 * CZEGO ZRZUT NIE DOWODZI:
 *  1. nie dowodzi zachowania ŻYWEGO backendu (końcówki są podmienione),
 *  2. nie dowodzi zawartości listy rodzajów — natywny `<select>` nie rysuje
 *     swoich opcji w zrzucie; widać tylko pozycję wybraną. Zawartość listy
 *     pinuje `ui2/wyniki/akademickie/__tests__/wygaszenie.test.tsx`,
 *  3. nie dowodzi, że pole zniknęło z odpowiedzi backendu — bo NIE zniknęło
 *     (kontrakty FROZEN); wycofano je z warstwy prezentacji.
 *
 * Faza sterowana zmienną `FAZA` (`przed` | `po`), żeby ten sam spec zdjął obie
 * strony pary bez edycji pliku.
 *
 * Wyjście: docs/sld/audyt-2026-08/v126-wygaszenie-<widok>-<faza>-<motyw>.png
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const BAZA = process.env.HARNESS_URL ?? 'http://127.0.0.1:5199/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/sld/audyt-2026-08');
const FAZA = process.env.FAZA === 'przed' ? 'przed' : 'po';
const MOTYWY = [
  { kod: 'light', nazwa: 'jasny' },
  { kod: 'dark', nazwa: 'ciemny' },
] as const;

async function otworz(page: Page, motyw: string): Promise<void> {
  await page.goto(`${BAZA}?creator=akademickie&theme=${motyw}&rodzaj=voltage_stability`);
  await expect(page.getByTestId('mvd-akad-ekran')).toBeVisible();
}

test.describe('V126-WYGASZENIE — zrzuty pary przed/po', () => {
  for (const motyw of MOTYWY) {
    test(`wybor rodzaju (${motyw.nazwa})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await otworz(page, motyw.kod);
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      await page.getByTestId('mvd-akad-wybor').screenshot({
        path: path.join(OUTPUT_DIR, `v126-wygaszenie-wybor-${FAZA}-${motyw.nazwa}.png`),
      });
    });

    test(`stabilnosc napieciowa (${motyw.nazwa})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1400 });
      await otworz(page, motyw.kod);
      // Natywna ścieżka użytkownika: wybór rodzaju → uruchomienie analizy.
      await page.getByTestId('mvd-akad-rodzaj').selectOption('voltage_stability');
      await page.getByTestId('mvd-akad-uruchom').click();
      await expect(page.getByTestId('mvd-akad-wyniki')).toBeVisible();
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `v126-wygaszenie-stabilnosc-${FAZA}-${motyw.nazwa}.png`),
        fullPage: true,
      });
    });
  }
});
