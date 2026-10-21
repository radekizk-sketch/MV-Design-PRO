/**
 * KARTA POLA-W-TORZE — KADRY STACJI z ŻYWEJ aplikacji (materiał oceny wizualnej właściciela,
 * bramka B-02; spec NIE wystawia werdyktu wizualnego).
 *
 * Po karcie kabel i transformator stacji są przyłączone do ZACISKU pola, które im służy,
 * a aparat pola leży w ich torze prądowym. Kadry pokazują cztery drogi budowy stacji:
 * przelotową (wcięcie w odcinek, dwa pola odgałęźne), sekcyjną (pole wyjściowe na sekcji B),
 * końcową (stacja na końcu ciągu) i odgałęźną (stacja na końcu odgałęzienia wyprowadzonego
 * z pola odgałęźnego stacji przelotowej) — w obu motywach.
 *
 * Sieć budowana operacjami API (kadry pokazują RYSUNEK, a nie proces budowy — ten dowodzi
 * spec `s95-budowa-z-kanwy.spec.ts`). Motyw przełączany REALNYM przyciskiem powłoki
 * z asercją na `data-theme`; kadr stacji dwuklikiem w uchwyt nazwy (karta K2 — wcześniej
 * przybliżenie kółkiem myszy, które ucinało sąsiadów i zależało od kroku kółka).
 *
 * Zrzuty: `docs/sld/audyt-2026-09/pola-w-torze-<stacja>-<motyw>.png`.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { katalogZrzutow } from './katalogZrzutow';
import { otworzAplikacje, siecKadrow, STACJE, ustawMotyw } from './siecKadrowStacji';
const HERE = dirname(fileURLToPath(import.meta.url));
// `E2E_KATALOG_ZRZUTOW` kieruje kadry do katalogu materiału oceny innej karty (np. zrzuty „po”
// karty W5-B w `docs/audit/visual/w5b/po`); zapis do drzewa repo nadal tylko z
// `ZRZUTY_DO_DOKUMENTACJI=1` (`katalogZrzutow`).
const KATALOG_ZRZUTOW = katalogZrzutow(
  process.env.E2E_KATALOG_ZRZUTOW
    ? resolve(process.env.E2E_KATALOG_ZRZUTOW)
    : resolve(HERE, '..', '..', 'docs', 'sld', 'audyt-2026-09'),
);

test('POLA-W-TORZE — kadry stacji przelotowej, sekcyjnej, końcowej i odgałęźnej (oba motywy)', async ({
  page,
  request,
}) => {
  test.setTimeout(900000);
  mkdirSync(KATALOG_ZRZUTOW, { recursive: true });
  const seed = await siecKadrow(request);
  const refStacji = new Map(
    (seed.enm.substations ?? []).map((s) => [String(s.name), s.ref_id] as const),
  );
  await otworzAplikacje(page, seed);
  const kanwa = page.getByTestId('sld-canvas-v3');

  for (const motyw of [
    { klucz: 'ciemny', theme: 'dark_scada' as const },
    { klucz: 'jasny', theme: 'light_technical' as const },
  ]) {
    await ustawMotyw(page, motyw.theme);
    // Kadr całej sieci: Shift+F (karta K2) — „Dopasuj widok" kadruje ZAZNACZENIE,
    // a po kadrze stacji w poprzednim motywie stacja jest zaznaczona.
    await page.keyboard.press('Shift+F');
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `pola-w-torze-siec-${motyw.klucz}.png`) });

    for (const stacja of STACJE) {
      const ref = refStacji.get(stacja.nazwa);
      expect(ref, `stacja ${stacja.nazwa} w modelu`).toBeTruthy();
      // K2 (UI-04): kadr stacji NATYWNIE — powrót do kadru sieci poziomem „Sieć"
      // mini-ścieżki (po pierwszej stacji), potem dwuklik w uchwyt nazwy stacji: kamera
      // kadruje CAŁĄ stację na poziomie ≥ L1 (pola i aparaty), bez przybliżania kółkiem.
      const sciezkaSieci = page.getByTestId('sld-v3-sciezka-0');
      if (await sciezkaSieci.isVisible()) {
        await sciezkaSieci.click();
        await expect(page.getByTestId('sld-v3-sciezka-kadru')).toHaveCount(0);
      }
      const uchwyt = page.locator(`[data-hit-role="obrys"][data-hit-owner-ref^="${ref}#name-row"]`).first();
      await expect(uchwyt).toHaveCount(1, { timeout: 30000 });
      await uchwyt.dblclick();
      await expect(page.getByTestId('sld-v3-sciezka-1')).toHaveText(stacja.nazwa, { timeout: 10000 });
      await expect(kanwa).not.toHaveAttribute('data-scene-lod', '0');
      await page.waitForTimeout(400);
      await page.screenshot({ path: resolve(KATALOG_ZRZUTOW, `pola-w-torze-${stacja.plik}-${motyw.klucz}.png`) });
    }
  }
});
