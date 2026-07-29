/**
 * KROPKA-WEZLOWA (V12K-150, spec §22.1 / IEC 60617) — WYROCZNIA SCENY
 * PRODUKCYJNEJ: każde ELEKTRYCZNE ODGAŁĘZIENIE od osi toru (odczep lateralny
 * ES/VT/SA) renderuje KROPKĘ WĘZŁOWĄ (`junction`) na osi toru; skrzyżowanie
 * BEZ połączenia — BEZ kropki. Semantyka z DANYCH sceny (odczepy `#lateral-…`,
 * `points[0]` = węzeł na osi), nie z heurystyki geometrycznych przecięć.
 *
 * Zamyka dług W1b (REJESTR_KONFLIKTOW V12K-150): W1b dostarczyła węzeł jako
 * wyrocznię (start odczepu na osi) + dowód wizualny; TU dowodzimy, że kropka
 * jest RENDEROWANA w scenie produkcyjnej (nie tylko w zrzucie).
 *
 * Ćwiczy REALNY potok `buildSceneV3` na dwóch fixturach:
 *  - `sldSubstrate52s` (sieć referencyjna, 53 stacje) — skala + determinizm + LOD;
 *  - `w1MatrixVariants` (macierz §20) — pełny zestaw rodzajów odczepu ES/SA/VT.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { buildSceneV3, noSceneSymbolOverlaps, noSymbolWireCollisions, type SceneLod, type SceneV3 } from '../buildScene';
import { junctionDotGaps, lateralBranchNodes } from '../crossings';
import { buildW1MatrixFixture } from './fixtures/w1MatrixVariants';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const JDEF = SYMBOL_DEFS.junction;

/** Zbiór środków kropek `junction` na scenie (środek = origin + gabaryt/2). */
function junctionDotCenters(scene: SceneV3): Set<string> {
  return new Set(
    scene.symbols
      .filter((s) => s.symbolId === 'junction')
      .map((s) => `${s.x + JDEF.width / 2},${s.y + JDEF.height / 2}`),
  );
}

describe('KROPKA-WEZLOWA (V12K-150) — kropka na odczepie lateralnym w scenie produkcyjnej', () => {
  describe('sieć referencyjna sldSubstrate52s', () => {
    for (const lod of [0, 1, 2] as const) {
      it(`LOD ${lod}: KAŻDY odczep lateralny (points[0] na osi) ma kropkę junction wyśrodkowaną na węźle`, () => {
        const scene = buildSceneV3(enm, lod as SceneLod);
        const nodes = lateralBranchNodes(scene.segments);
        const centers = junctionDotCenters(scene);
        for (const n of nodes) {
          expect(centers.has(`${n.x},${n.y}`), `kropka na odczepie (${n.x},${n.y}) LOD ${lod}`).toBe(true);
        }
      });
    }

    it('obustronna spójność kropka⇔węzeł (tee + lateral): junction_dot_probe = 0 luk na L2', () => {
      const scene = buildSceneV3(enm, 2);
      expect(junctionDotGaps(scene, SYMBOL_DEFS)).toEqual([]);
    });

    it('NEGATYW: liczba kropek junction = liczba realnych węzłów (żadna kropka na skrzyżowaniu bez połączenia)', () => {
      // Przecięcia kanału z magistralą (bez połączenia elektrycznego, F13.2 D3-14)
      // NIE dostają kropki — kropka wyłącznie na realnym węźle. Dowód liczbowy:
      // #kropek == #(węzłów tras ∪ odczepów lateralnych), więc żadna nie wisi na
      // czystym skrzyżowaniu.
      const scene = buildSceneV3(enm, 2);
      const dots = scene.symbols.filter((s) => s.symbolId === 'junction').length;
      // węzły z wyroczni (dedupe wg junctionDotGaps): 0 luk ⇒ #kropek == #węzłów.
      expect(junctionDotGaps(scene, SYMBOL_DEFS)).toEqual([]);
      // Dodatkowo: żadna kropka nie ma testId spoza {tee, lateral}.
      const tagged = scene.symbols.filter(
        (s) => s.symbolId === 'junction'
          && (String(s.meta?.testId ?? '').startsWith('sld-v3-wezel-lateral-')
            || String(s.meta?.testId ?? '').startsWith('sld-v3-wezel-t-')),
      ).length;
      expect(tagged).toBe(dots);
    });

    it('kropki NIE naruszają czytelności: noSceneSymbolOverlaps (aparaty) + noSymbolWireCollisions (twarde zero) zielone', () => {
      for (const lod of [0, 1, 2] as const) {
        const scene = buildSceneV3(enm, lod as SceneLod);
        expect(noSceneSymbolOverlaps(scene), `overlaps LOD ${lod}`).toBe(true);
        expect(noSymbolWireCollisions(scene), `symbol↔wire LOD ${lod}`).toBe(true);
      }
    });

    it('DETERMINIZM: dwa buildy dają IDENTYCZNY zbiór kropek lateralnych (te same dane ⇒ te same kropki)', () => {
      const a = buildSceneV3(enm, 2);
      const b = buildSceneV3(enm, 2);
      const dotsOf = (s: SceneV3) =>
        s.symbols
          .filter((x) => String(x.meta?.testId ?? '').startsWith('sld-v3-wezel-lateral-'))
          .map((x) => `${x.x},${x.y}`)
          .sort();
      expect(dotsOf(a)).toEqual(dotsOf(b));
      expect(dotsOf(a).length).toBeGreaterThan(0);
    });

    it('LOD: kropki lateralne obecne na L1 i L2 (te same pola ⇒ ta sama liczba)', () => {
      const l1 = buildSceneV3(enm, 1);
      const l2 = buildSceneV3(enm, 2);
      const count = (s: SceneV3) =>
        s.symbols.filter((x) => String(x.meta?.testId ?? '').startsWith('sld-v3-wezel-lateral-')).length;
      expect(count(l1)).toBeGreaterThan(0);
      expect(count(l1)).toBe(count(l2));
    });
  });

  describe('macierz wariantów (ES/SA/VT) — pełny zestaw rodzajów odczepu', () => {
    const fixture = buildW1MatrixFixture();
    const scene = buildSceneV3(fixture.enm, 2);
    const centers = junctionDotCenters(scene);

    const fieldLaterals = (fieldRef: string, kind: string) =>
      scene.segments.filter((s) => String(s.meta?.ownerRef ?? '').includes(`${fieldRef}#lateral-${kind}-`));

    const LATERAL_SET = new Set(['earthSwitch', 'voltageTransformer', 'surgeArrester']);
    const mainAxisX = (fieldRef: string): number => {
      const main = scene.symbols.filter(
        (s) => s.meta?.ownerRef === fieldRef && !LATERAL_SET.has(s.symbolId),
      );
      return main[0].x + SYMBOL_DEFS[main[0].symbolId].width / 2;
    };

    for (const kind of ['earthSwitch', 'surgeArrester', 'voltageTransformer'] as const) {
      it(`odczep ${kind}: węzeł na osi toru ma kropkę junction (macierz przypadków)`, () => {
        let seenAny = false;
        for (const target of fixture.targets) {
          const laterals = fieldLaterals(target.fieldRef, kind);
          if (laterals.length === 0) continue;
          seenAny = true;
          const axis = mainAxisX(target.fieldRef);
          for (const seg of laterals) {
            const tap = seg.points[0];
            expect(tap.x, `${target.variant.id}: ${kind} węzeł na osi`).toBe(axis);
            expect(centers.has(`${tap.x},${tap.y}`), `${target.variant.id}: kropka na odczepie ${kind}`).toBe(true);
          }
        }
        expect(seenAny, `macierz zawiera wariant z ${kind}`).toBe(true);
      });
    }

    it('pole liniowe CB+CT+SA (linia-cb-ct-sa): kropka na węźle SA', () => {
      const target = fixture.targets.find((t) => t.variant.id === 'linia-cb-ct-sa')!;
      const saSeg = fieldLaterals(target.fieldRef, 'surgeArrester')[0];
      expect(saSeg, 'odczep SA').toBeTruthy();
      expect(centers.has(`${saSeg.points[0].x},${saSeg.points[0].y}`)).toBe(true);
    });

    it('pole CB+CT+VT+ES (linia-ct-vt): kropka na węźle VT I na węźle ES (dwa odczepy)', () => {
      const target = fixture.targets.find((t) => t.variant.id === 'linia-ct-vt')!;
      const vt = fieldLaterals(target.fieldRef, 'voltageTransformer')[0];
      const es = fieldLaterals(target.fieldRef, 'earthSwitch')[0];
      expect(vt && es, 'odczepy VT i ES').toBeTruthy();
      expect(centers.has(`${vt.points[0].x},${vt.points[0].y}`), 'kropka VT').toBe(true);
      expect(centers.has(`${es.points[0].x},${es.points[0].y}`), 'kropka ES').toBe(true);
    });

    it('spójność kropka⇔węzeł na macierzy: junction_dot_probe = 0 luk', () => {
      expect(junctionDotGaps(scene, SYMBOL_DEFS)).toEqual([]);
    });
  });

  describe('NEGATYW syntetyczny: skrzyżowanie bez połączenia ≠ węzeł ≠ kropka', () => {
    it('dwa przecinające się odcinki BEZ wspólnego końca: 0 węzłów lateralnych, kropka fabrykowana ⇒ luka', () => {
      // Skrzyżowanie wnętrze×wnętrze (żaden koniec nie ląduje we wnętrzu drugiego)
      // — to NIE T-węzeł ani odczep pola: brak `#lateral-`, brak węzła, więc
      // kropka byłaby fałszywa (kropka-bez-rozgalezienia).
      const segments = [
        { points: [{ x: 0, y: 100 }, { x: 200, y: 100 }], meta: { kind: 'sn', ownerRef: 'seg/magistrala' } },
        { points: [{ x: 100, y: 0 }, { x: 100, y: 200 }], meta: { kind: 'sn', ownerRef: 'seg/pion' } },
      ] as const;
      expect(lateralBranchNodes(segments)).toEqual([]);
      const withFakeDot = {
        segments,
        symbols: [{ symbolId: 'junction', x: 100 - JDEF.width / 2, y: 100 - JDEF.height / 2 }],
      };
      const gaps = junctionDotGaps(withFakeDot, SYMBOL_DEFS);
      expect(gaps.some((g) => g.reason === 'kropka-bez-rozgalezienia')).toBe(true);
    });
  });
});
