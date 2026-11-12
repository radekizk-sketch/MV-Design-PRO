// @vitest-environment node
/**
 * Karta SLD-SKALA-I-NAWIGACJA, R6 — cel trafienia w hierarchii aparat → pole → stacja.
 *
 * Intencja: klik trafia najmniejszy obiekt hierarchii, który na ekranie jest rozpoznawalny
 * (`MIN_SYMBOL_SCREEN_PX`); z przeglądu sieci — stację, a nie przypadkowy aparat narysowany na
 * 3 px. Cel ma na ekranie co najmniej `MIN_HIT_SCREEN_PX`. Testy są ILOCZYNEM cech:
 * {rozmiary stopni} × {drabina skal} na funkcji czystej; na scenie referencyjnej
 * {skala przeglądu … skala pracy z bliska} × {rodzaj obiektu: aparat pola, transformator, odcinek
 * pola, szyna, napis narysowany, tożsamość w podpowiedzi, obszar pola, obszar stacji}
 * z wyrocznią „klik w środek obiektu trafia cel z `celTrafienia`”.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, sceneObstacleRects } from '../../scene/buildScene';
import { sheetSizeFor } from '../../sheet/outline';
import { MIN_SYMBOL_SCREEN_PX } from '../../symbols/defs';
import { gabarytSymbolu } from '../../symbols/blokZabezpieczen';
import { planSceneLabels } from '../labelLegibility';
import {
  HIT_OBJECT_CLASSES,
  MIN_HIT_SCREEN_PX,
  buildCanvasHitAreas,
  celTrafienia,
  hitAreaScreenSize,
  pickCanvasHitArea,
  stopnieCeluObiektu,
  testIdObszaruCelu,
  type CanvasHitArea,
  type StopienCelu,
} from '../hitAreas';
import { hierarchiaCelowTrafienia } from '../zakresKadru';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
const scene = buildSceneV3(enm);
const hierarchia = hierarchiaCelowTrafienia(enm, scene);

const SKALE = [0.02, 0.08, 0.2, 0.35, 0.5, 0.8, 1, 2];

function stopien(poziom: StopienCelu['poziom'], bok: number): StopienCelu {
  return { poziom, ref: poziom, rect: { x: 0, y: 0, width: bok, height: 4 * bok } };
}

describe('R6 — funkcja czysta celTrafienia', () => {
  it('ILOCZYN {skala} × {stopnie 16/40/200}: najmniejszy rozpoznawalny, a bez rozpoznawalnego — największy', () => {
    const stopnie = [stopien('aparat', 16), stopien('pole', 40), stopien('stacja', 200)];
    for (const skala of [0.001, ...SKALE, 8]) {
      const cel = celTrafienia(stopnie, skala);
      const oczekiwany = stopnie.find((s) => s.rect.width * skala >= MIN_SYMBOL_SCREEN_PX) ?? stopnie[2];
      expect(cel.poziom, `skala ${skala}`).toBe(oczekiwany.poziom);
    }
  });

  it('najmniejszy bok rozstrzyga (pole wąskie i wysokie jest nierozpoznawalne, gdy wąskie na ekranie)', () => {
    const waskie: StopienCelu = { poziom: 'pole', ref: 'p', rect: { x: 0, y: 0, width: 10, height: 1000 } };
    const stacja: StopienCelu = { poziom: 'stacja', ref: 's', rect: { x: 0, y: 0, width: 300, height: 300 } };
    expect(celTrafienia([waskie, stacja], 0.5).poziom).toBe('stacja');
    expect(celTrafienia([waskie, stacja], 0.8).poziom).toBe('pole');
  });

  it('pusta lista stopni to błąd wołającego, nie cichy wynik', () => {
    expect(() => celTrafienia([], 1)).toThrow();
  });

  it('inwentarz klas trafienia zawiera obszary celu pola i stacji', () => {
    expect(HIT_OBJECT_CLASSES).toContain('pole');
    expect(HIT_OBJECT_CLASSES).toContain('stacja');
  });
});

function obszaryDlaSkali(skala: number): readonly CanvasHitArea[] {
  const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), skala, sheetSizeFor(scene));
  return buildCanvasHitAreas({
    symbols: scene.symbols,
    segments: scene.segments,
    labels: plan.drawn,
    tozsamosciWPodpowiedzi: plan.tozsamosciWPodpowiedzi,
    resultMarkers: [{ testId: 'sld-v3-result-label-0', ownerRef: 'x', x: 0, y: 0, width: 30, height: 10 }],
    scale: skala,
    hierarchiaCelow: hierarchia,
  });
}

describe('R6 — scena referencyjna 52 stacji: ILOCZYN {skala} × {rodzaj obiektu}', () => {
  it('hierarchia ma obszar każdej narysowanej stacji i pola, a każde pole wskazuje swoją stację', () => {
    for (const ref of scene.meta.drawnStationIds) expect(hierarchia.stacje.has(ref), ref).toBe(true);
    expect(hierarchia.pola.size).toBeGreaterThan(scene.meta.drawnStationIds.length);
    for (const [, pole] of hierarchia.pola) expect(hierarchia.stacje.has(pole.stacjaRef)).toBe(true);
  });

  it('każdy obszar trafienia ma na ekranie co najmniej 24 px — na każdej skali, w każdej klasie', () => {
    for (const skala of SKALE) {
      const klasy = new Set<string>();
      for (const area of obszaryDlaSkali(skala)) {
        klasy.add(area.klasa);
        expect(hitAreaScreenSize(area, skala), `${area.klasa} ${area.testId} @ ${skala}`).toBeGreaterThanOrEqual(MIN_HIT_SCREEN_PX - 1e-9);
      }
      // Iloczyn bez przypadku nie jest dowodem: na przeglądzie są obszary stacji, z bliska aparaty.
      if (skala <= 0.08) expect(klasy.has('stacja'), `skala ${skala}`).toBe(true);
      if (skala >= 1) expect(klasy.has('aparat'), `skala ${skala}`).toBe(true);
    }
  });

  it('klik w środek każdego symbolu pola trafia cel wyznaczony przez celTrafienia (aparat, pole albo stacja)', () => {
    const poziomy = new Map<number, Set<string>>();
    for (const skala of SKALE) {
      const areas = obszaryDlaSkali(skala);
      const widziane = new Set<string>();
      scene.symbols.forEach((symbol) => {
        const kind = symbol.meta?.elementKind;
        if (kind === 'lvPortal' || kind === 'protectionAnnotation') return;
        const ownerRef = symbol.meta?.ownerRef;
        const g = gabarytSymbolu(symbol);
        const stopnie = stopnieCeluObiektu(hierarchia, ownerRef, g);
        if (stopnie.length < 2) return;
        const cel = celTrafienia(stopnie, skala);
        const poziom = cel.poziom;
        widziane.add(poziom);
        const trafiony = pickCanvasHitArea(areas, g.x + g.width / 2, g.y + g.height / 2);
        expect(trafiony, `${ownerRef} @ ${skala}`).not.toBeNull();
        if (poziom === 'aparat') {
          // Własny obszar symbolu nie zniknął (inny tusz może leżeć nad środkiem — wtedy
          // trafia obiekt, którego tusz tam jest; obszar celu wyższego nie kradnie kliku).
          expect(trafiony!.klasa === 'pole' || trafiony!.klasa === 'stacja', `${ownerRef} @ ${skala}`).toBe(false);
        } else {
          const klasaTrafiona = trafiony!.klasa;
          if (klasaTrafiona === 'pole' || klasaTrafiona === 'stacja') {
            expect(trafiony!.testId).toBe(testIdObszaruCelu(poziom, cel.ref));
          }
          expect(areas.some((a) => a.testId === testIdObszaruCelu(poziom, cel.ref))).toBe(true);
        }
      });
      poziomy.set(skala, widziane);
    }
    // Pokrycie iloczynu: każdy poziom hierarchii wystąpił na którejś skali.
    const wszystkie = new Set([...poziomy.values()].flatMap((s) => [...s]));
    expect(wszystkie).toEqual(new Set(['aparat', 'pole', 'stacja']));
  });

  it('z przeglądu sieci (skala 0,02 i 0,002 — stacja rozpoznawalna i nawet ona nie) obszar każdej narysowanej stacji wskazuje TĘ stację', () => {
    for (const skala of [0.02, 0.002]) {
      const areas = obszaryDlaSkali(skala);
      for (const ref of scene.meta.drawnStationIds) {
        const r = hierarchia.stacje.get(ref)!;
        const obszar = areas.find((a) => a.testId === testIdObszaruCelu('stacja', ref));
        expect(obszar, ref).toBeDefined();
        expect(obszar!.ownerRef).toBe(ref);
        expect(obszar!.elementKind).toBe('station');
        // Obrys obszaru stacji = prostokąt kadru stacji (jedno źródło).
        expect(obszar!.obrys).toMatchObject({ x: r.x, y: r.y, width: r.width, height: r.height });
      }
    }
  });

  it('z bliska (skala 2) nie ma obszarów pola ani stacji — puste miejsce w stacji jest tłem', () => {
    const areas = obszaryDlaSkali(2);
    expect(areas.filter((a) => a.klasa === 'pole' || a.klasa === 'stacja')).toEqual([]);
  });

  it('determinizm: ta sama scena i skala ⇒ identyczna lista obszarów', () => {
    for (const skala of [0.08, 0.35]) expect(obszaryDlaSkali(skala)).toEqual(obszaryDlaSkali(skala));
  });

  it('bez hierarchii (eksport, harness) każdy symbol jest własnym celem — zero obszarów pola/stacji', () => {
    const plan = planSceneLabels(scene.labels, sceneObstacleRects(scene), 0.05, sheetSizeFor(scene));
    const areas = buildCanvasHitAreas({ symbols: scene.symbols, segments: scene.segments, labels: plan.drawn, resultMarkers: [], scale: 0.05 });
    expect(areas.filter((a) => a.klasa === 'pole' || a.klasa === 'stacja')).toEqual([]);
  });
});
