/**
 * KD-7 — KONTRAKT KADRU: po dopasowaniu widoku CAŁA rysowana treść sceny
 * mieści się w kadrze z zadeklarowanym marginesem fitu.
 *
 * DLACZEGO TEN TEST ISTNIEJE. Kadr liczył ekstenty WYŁĄCZNIE z symboli i
 * odcinków (`meta.ownerRef`), a podpisy dokładał REZERWĄ LICZBOWĄ (4 wiersze
 * t2 pod najniższym symbolem, 1 wiersz t1 nad najwyższym). Stała pokrywała
 * pasmo nazw JEDNEJ sieci odniesienia i nie pokrywała niczego po bokach —
 * na sieci e2e podpisy wychodziły 56 j. świata w lewo, 88 j. w prawo i 37 j.
 * w górę poza kadr, a spec `e2e/sld-first-uklad.spec.ts` („kadr i panele")
 * łapał to jako podpis stacji 5 px pod dolną krawędzią kanwy (pomiar
 * 2026-07-31). Drugi człon tej samej wady: cel fitu był wyrażony w układzie
 * SCENY, a `viewBox` opisuje układ ARKUSZA (`SheetFrame` przesuwa treść o
 * `FRAME_MARGIN`) — 32 jednostki świata zjadały niemal cały 40-pikselowy
 * padding fitu.
 *
 * CO DOKŁADNIE ORZEKA. Na REALNEJ scenie odniesienia (`sldSubstrate52s`,
 * 53 stacje — ta sama fixtura, na której stoją testy kamery v3), dla
 * każdego poziomu szczegółu: margines od krawędzi kanwy do najdalszego
 * elementu RYSOWANEGO (symbol · odcinek · PROSTOKĄT ETYKIETY) jest na
 * każdej z czterech stron NIE MNIEJSZY niż padding fitu, a na osi
 * ograniczającej RÓWNY jemu. To orzeczenie jest wolne od strojenia pod
 * fixturę: nie ma w nim tolerancji dobranej „aż zzielenieje" — jedyną
 * liczbą jest `FIT_PADDING_PX`, deklarowana przez samą kamerę
 * (`ViewportController.fitToView`).
 *
 * Wykrywa OBA warianty regresji (zmierzone 2026-07-31, kanwa 1200×800):
 *  · etykiety z powrotem poza ekstentami ⇒ margines min. 16,4 / 31,8 / 36,9 px
 *    (L0/L1/L2) zamiast 40,
 *  · cel fitu z powrotem w układzie sceny ⇒ margines 37,5 px z asymetrią
 *    42,5/37,5 (dryf o `FRAME_MARGIN`).
 *
 * Ekstenty tekstu są DETERMINISTYCZNE (`core/text.ts` — `measureLabelWidth`
 * ze stałą `AVG_GLYPH_WIDTH_FACTOR`), więc kontrakt nie zależy od renderu
 * czcionki w przeglądarce (P7).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { SceneLod, SceneV3 } from '../../scene/buildScene';
import { buildSceneV3 } from '../../scene/buildScene';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { FRAME_MARGIN } from '../../sheet/Frame';
import { SldCanvasV3, scenePointToCameraWorld } from '../SldCanvasV3';

afterEach(() => cleanup());

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(
      resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json'),
      'utf8',
    ),
  ) as { readonly enm: EnergyNetworkModel }
).enm;

const CANVAS = { width: 1200, height: 800 } as const;
/** Padding fitu deklarowany przez kamerę (`ViewportController.fitToView`
 *  domyślne `paddingPx`) — JEDYNA liczba tego kontraktu. */
const FIT_PADDING_PX = 40;

/** Ekstenty CAŁEJ rysowanej treści sceny w świecie KAMERY: symbole i odcinki
 *  z `ownerRef` ORAZ prostokąty etykiet (podpis należy do rysunku). Liczone
 *  NIEZALEŻNIE od `contentBoundingBoxOf` — inaczej test sprawdzałby
 *  produkcję samą sobą. */
function rysowanaTrescWSwiecieKamery(scene: SceneV3): {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const obejmij = (x: number, y: number): void => {
    const p = scenePointToCameraWorld({ x, y });
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  for (const s of scene.symbols) {
    if (!s.meta?.ownerRef) continue;
    const def = SYMBOL_DEFS[s.symbolId];
    obejmij(s.x, s.y);
    obejmij(s.x + def.width, s.y + def.height);
  }
  for (const seg of scene.segments) {
    if (!seg.meta?.ownerRef) continue;
    for (const p of seg.points) obejmij(p.x, p.y);
  }
  for (const l of scene.labels) {
    obejmij(l.rect.x, l.rect.y);
    obejmij(l.rect.x + l.rect.width, l.rect.y + l.rect.height);
  }
  return { minX, minY, maxX, maxY };
}

/** Marginesy [px ekranu] od krawędzi kanwy do najdalszej rysowanej treści,
 *  odczytane z REALNEGO `viewBox` zamontowanej kanwy (ścieżka produkcyjna:
 *  fit startowy `SldCanvasV3`). */
function marginesyKadru(lod: SceneLod): {
  readonly lewo: number;
  readonly prawo: number;
  readonly gora: number;
  readonly dol: number;
} {
  const { container } = render(
    <SldCanvasV3 snapshot={enm} width={CANVAS.width} height={CANVAS.height} lodOverride={lod} />,
  );
  const viewBox = container.querySelector('[data-testid="sld-canvas-v3"]')!.getAttribute('viewBox')!;
  const [vx, vy, vw] = viewBox.split(' ').map(Number);
  const skala = CANVAS.width / vw;
  const tresc = rysowanaTrescWSwiecieKamery(buildSceneV3(enm, lod));
  return {
    lewo: (tresc.minX - vx) * skala,
    prawo: (vx + vw - tresc.maxX) * skala,
    gora: (tresc.minY - vy) * skala,
    dol: (vy + CANVAS.height / skala - tresc.maxY) * skala,
  };
}

describe('SldCanvasV3 — kontrakt kadru (KD-7): podpisy są treścią rysunku', () => {
  for (const lod of [0, 1, 2] as const) {
    it(`LOD ${lod}: cała rysowana treść (z etykietami) mieści się w kadrze z pełnym marginesem fitu`, () => {
      const m = marginesyKadru(lod);
      // Wszystkie cztery strony: NIC nie wystaje i nikt nie zjada paddingu.
      // Epsilon 1e-6 to arytmetyka zmiennoprzecinkowa, nie tolerancja
      // inżynierska (dopuszczenie choćby jednego piksela luzu przepuściłoby
      // dryf o `FRAME_MARGIN` mierzony w dziesiątkach pikseli).
      expect(m.lewo).toBeGreaterThanOrEqual(FIT_PADDING_PX - 1e-6);
      expect(m.prawo).toBeGreaterThanOrEqual(FIT_PADDING_PX - 1e-6);
      expect(m.gora).toBeGreaterThanOrEqual(FIT_PADDING_PX - 1e-6);
      expect(m.dol).toBeGreaterThanOrEqual(FIT_PADDING_PX - 1e-6);
      // Oś ograniczająca styka się z paddingiem DOKŁADNIE — kadr jest ciasny
      // wokół treści, nie „gdzieś w środku kanwy" (bez tego orzeczenia kadr
      // mógłby oddalić się dowolnie i nadal spełniać nierówność wyżej).
      expect(Math.min(m.lewo, m.prawo, m.gora, m.dol)).toBeCloseTo(FIT_PADDING_PX, 6);
    });
  }

  it('margines arkusza jest jawną częścią świata kamery (scena + FRAME_MARGIN)', () => {
    // Zapadka na drugi człon wady: gdyby konwersja zniknęła, kadr celowałby w
    // układ sceny, a treść rysowałaby się o `FRAME_MARGIN` obok.
    expect(scenePointToCameraWorld({ x: 0, y: 0 })).toEqual({ x: FRAME_MARGIN, y: FRAME_MARGIN });
  });
});
