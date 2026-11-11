/**
 * Spoczynek geometrii celu kliku współrzędnymi (klasa G karty FIX-E2E-PELNE).
 *
 * Klik NATYWNY w punkt policzony z geometrii obiektu kanwy jest poprawny tylko wtedy, gdy
 * kamera i układ powłoki już się nie ruszają. Zamknięcie menu kontekstowego, zmiana
 * zaznaczenia albo otwarcie/zamknięcie inspektora zmienia szerokość kanwy i przesuwa kadr
 * (sonda biegu 2026-10-30: `viewBox` kanwy zmienia szerokość 701 → 970 po Escape i przesuwa
 * się jeszcze po ~1 s) — punkt policzony w trakcie ruchu trafia w tło. Warunek realny:
 * prostokąt celu na ekranie jest identyczny w trzech kolejnych odczytach. Brak spoczynku
 * w limicie jest błędem testu (a nie cichym powrotem), bo klik w ruchomy cel nic nie dowodzi.
 */
import { expect, type Locator } from '@playwright/test';

export async function czekajNaStabilnaGeometrie(cel: Locator): Promise<void> {
  let poprzedni = '';
  let zgodne = 0;
  await expect
    .poll(
      async () => {
        const biezacy = await cel.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
        });
        // Spoczynek = trzy kolejne identyczne odczyty (500 ms bez ruchu): ruch kamery po
        // zamknięciu menu bywa dwufazowy (zmiana szerokości kanwy, potem przesunięcie kadru),
        // a dwa odczyty potrafiły trafić w przerwę między fazami (bieg 2026-10-30).
        zgodne = biezacy === poprzedni ? zgodne + 1 : 0;
        poprzedni = biezacy;
        return zgodne >= 2;
      },
      { message: 'geometria celu kliku nie doszła do spoczynku', intervals: [250], timeout: 15000 },
    )
    .toBe(true);
}

/** Punkt NA geometrii uchwytu, w którym uchwyt jest NA WIERZCHU (sonda
 *  `elementFromPoint`). Odcinek bywa ŁAMANY — środek jego prostokąta gabarytowego
 *  leży poza kreską i klik trafiłby w tło (pomiar S9-10); punkt na kresce bywa
 *  przykryty innym obiektem (napis, symbol), więc próbujemy kolejnych punktów
 *  trasy. `null` = uchwyt nigdzie nie jest na wierzchu (klik nic by nie dowiódł). */
export async function punktNaWierzchu(
  uchwyt: Locator,
): Promise<{ x: number; y: number } | null> {
  return uchwyt.evaluate((el) => {
    const naWierzchu = (x: number, y: number) => {
      const gora = document.elementFromPoint(x, y);
      return gora !== null && (gora === el || el.contains(gora));
    };
    const geo = el as unknown as SVGGeometryElement;
    const ctm = geo.getScreenCTM();
    if (ctm && typeof geo.getTotalLength === 'function' && typeof geo.getPointAtLength === 'function') {
      const dl = geo.getTotalLength();
      for (const u of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.1, 0.9]) {
        const p = geo.getPointAtLength(dl * u);
        const x = ctm.a * p.x + ctm.c * p.y + ctm.e;
        const y = ctm.b * p.x + ctm.d * p.y + ctm.f;
        if (naWierzchu(x, y)) return { x, y };
      }
    }
    const r = el.getBoundingClientRect();
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const x = r.x + r.width * f;
      const y = r.y + r.height / 2;
      if (naWierzchu(x, y)) return { x, y };
    }
    return null;
  });
}
