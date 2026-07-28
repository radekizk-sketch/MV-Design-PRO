/**
 * Zrzut KAŻDEJ sceny harnessu — bramka pokrycia ekranów (V12K-259).
 *
 * DLACZEGO POWSTAŁ. Harness renderował 43 sceny żywych komponentów, a spec zrzutów
 * kadrował 9 z nich. Pozostałe 34 były utrzymywane i nigdy nieoglądane — zdolność bez
 * konsumenta, ten sam wzorzec co reguła gotowości bez wywołania (V12K-251). Pierwsze
 * uruchomienie tej bramki znalazło scenę `zrodlo` w stanie TWARDEGO CRASHU (biały ekran,
 * `Cannot read properties of undefined (reading 'length')`) — defekt niewidoczny latami,
 * bo nikt tego ekranu nie renderował w CI.
 *
 * CO SPRAWDZA (poza samym kadrem):
 *  1. korzeń harnessu osiąga `data-status=ready` — scena w ogóle się składa,
 *  2. ZERO błędów konsoli i ZERO wyjątków renderu — biały ekran nie przejdzie,
 *  3. treść nie zawiera komunikatu o nieudanym pobraniu — scena bez atrapy końcówki
 *     pokazywałaby błąd, a zrzut do oceny wyglądałby równie porządnie.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/creator-harness.html';
const OUTPUT_DIR = path.resolve(_dirname, '../../docs/audit/visual/sceny');

/** Sceny kadrowane przez `creator-screenshot.spec.ts` — tam mają własne interakcje. */
const JUZ_KADROWANE = new Set([
  'pole', 'oze', 'arcflash', 'magistrala', 'kompensator', 'transformator', 'odbior', 'wiazania',
]);

const SCENY = [
  'cieplna', 'dokumentacja', 'edycja-parametrow', 'estymacja', 'frt', 'kompensacja',
  'kompensacja-wynik', 'lom', 'macierz', 'migotanie', 'odbior-zgodnosc', 'odgalezienie',
  'oltc', 'pole-nn', 'pomiar', 'porownanie', 'przekaznik', 'przypisanie-katalogu', 'pulpit',
  'rozplyw', 'sila-sieci', 'slup-odgalezny', 'ssci', 'swiezosc', 'uwaga', 'walidacja',
  'wyniki-skladowe', 'wyniki-stabilnosc', 'wyniki-stan-fazowy', 'wyniki-zbieznosc', 'zksn',
  'zrodlo', 'zrodlo-dyspozycyjne', 'zwarcia', 'zwarcia-rozplyw',
].filter((s) => !JUZ_KADROWANE.has(s));

const THEMES = ['light', 'dark'] as const;

test.describe('sceny:screenshot', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  for (const scena of SCENY) {
    for (const theme of THEMES) {
      test(`${scena} — ${theme}`, async ({ page }) => {
        const errs: string[] = [];
        const isNoise = (t: string): boolean =>
          /favicon|Download the React DevTools|Failed to load resource/i.test(t);
        page.on('console', (m) => {
          if (m.type() === 'error' && !isNoise(m.text())) errs.push(m.text());
        });
        page.on('pageerror', (e) => errs.push(`PAGEERROR: ${e.message}`));

        await page.setViewportSize({ width: 1220, height: 900 });
        await page.goto(`${HARNESS_URL}?creator=${scena}&theme=${theme}`, {
          waitUntil: 'domcontentloaded',
          timeout: 40000,
        });

        const root = page.locator('[data-testid="creator-harness-root"]').first();
        await expect(root, `scena ${scena} nie doszła do stanu gotowego`).toHaveAttribute(
          'data-status',
          'ready',
          { timeout: 15000 },
        );

        // Treść musi być POKAZANA, nie obiecana: pusty korzeń to scena, która się
        // złożyła i nic nie wyrenderowała.
        const tresc = ((await root.textContent()) ?? '').replace(/\s+/g, ' ').trim();
        expect(tresc.length, `scena ${scena} wyrenderowała pustą treść`).toBeGreaterThan(80);
        // WZORZEC SZEROKI CELOWO (V12K-260): pierwsza wersja lapala tylko „Nie udalo sie
        // POBRAC", a scena odbioru pokazywala „Nie udalo sie WYZNACZYC podgladu pradu" —
        // ten sam defekt, inne slowo, bramka niema. Kazda odmiana „nie udalo sie" na
        // ekranie do oceny znaczy brakujaca atrape albo realna awarie.
        expect(
          /Nie udało się/i.test(tresc),
          `scena ${scena} pokazuje komunikat o niepowodzeniu — brakuje atrapy końcówki`,
        ).toBe(false);

        await page.waitForTimeout(250);
        await root.screenshot({ path: path.join(OUTPUT_DIR, `scena_${scena}_${theme}.png`) });

        if (errs.length > 0) console.log(`[${scena}/${theme}] errors:\n${errs.join('\n')}`);
        expect(errs, `błędy renderu w scenie ${scena}/${theme}`).toEqual([]);
      });
    }
  }
});
