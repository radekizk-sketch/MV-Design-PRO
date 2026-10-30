/**
 * Spoczynek geometrii celu kliku współrzędnymi (klasa G karty FIX-E2E-PELNE).
 *
 * Klik NATYWNY w punkt policzony z geometrii obiektu kanwy jest poprawny tylko wtedy, gdy
 * kamera i układ powłoki już się nie ruszają. Zamknięcie menu kontekstowego, zmiana
 * zaznaczenia albo otwarcie/zamknięcie inspektora zmienia szerokość kanwy i przesuwa kadr
 * (sonda biegu 2026-10-30: `viewBox` kanwy zmienia szerokość 701 → 970 po Escape i przesuwa
 * się jeszcze po ~1 s) — punkt policzony w trakcie ruchu trafia w tło. Warunek realny:
 * prostokąt celu na ekranie jest identyczny w dwóch kolejnych odczytach. Brak spoczynku
 * w limicie jest błędem testu (a nie cichym powrotem), bo klik w ruchomy cel nic nie dowodzi.
 */
import { expect, type Locator } from '@playwright/test';

export async function czekajNaStabilnaGeometrie(cel: Locator): Promise<void> {
  let poprzedni = '';
  await expect
    .poll(
      async () => {
        const biezacy = await cel.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
        });
        const stoi = biezacy === poprzedni;
        poprzedni = biezacy;
        return stoi;
      },
      { message: 'geometria celu kliku nie doszła do spoczynku', intervals: [250], timeout: 15000 },
    )
    .toBe(true);
}
