/** POMIAR TYMCZASOWY — karta KLIK-ETYKIETA-KOTWICA. Do usunięcia. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { buildCanvasHitAreas, LABEL_OWNER_ELEMENT_KIND, type CanvasHitArea } from '../hitAreas';
import { buildCanvasModelIndex, resolveCanvasMenuSubject } from '../canvasMenuSubject';
import { resultRefForSegment } from '../resultLabels';

const here = dirname(fileURLToPath(import.meta.url));
function loadEnm(relative: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, relative), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}
const ENM = loadEnm('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');

const KOTWICA_NA_KIND: Record<string, string> = {
  stacja: 'station',
  szyna: 'bus',
  galaz: 'segment',
  pole: 'apparatus',
  zrodlo: 'source',
  generator: 'der',
  transformator: 'transformer',
};

describe('POMIAR pelnej klasy', () => {
  for (const lod of [0, 1, 2] as SceneLod[]) {
    it(`LOD ${lod}`, () => {
      const scene = buildSceneV3(ENM, lod);
      const index = buildCanvasModelIndex(ENM);
      // Wszystkie obiekty kanwy — dokladnie tak, jak buduje je warstwa trafien.
      const areas = buildCanvasHitAreas({
        symbols: scene.symbols,
        segments: scene.segments,
        labels: scene.labels.map((label, i) => ({
          index: i,
          label,
          rect: label.rect,
          fontPx: 6,
          powiekszona: false,
        })) as never,
        resultMarkers: [],
        scale: 1,
      });
      // busRef per testId — tak jak `klikMeta` w SldCanvasV3.
      const busRefPoTestId = new Map<string, string | undefined>();
      scene.segments.forEach((segment, i) => {
        busRefPoTestId.set(segment.meta?.testId ?? `sld-v3-segment-${i}`, resultRefForSegment(segment.meta));
      });
      const licznik = new Map<string, { n: number; ref: string; modelRef: string; menu: string }>();
      const opisz = (a: CanvasHitArea): void => {
        const wynik = resolveCanvasMenuSubject(
          {
            ownerRef: a.ownerRef,
            elementKind: a.elementKind,
            klasa: a.klasa,
            busRef: busRefPoTestId.get(a.testId),
          },
          index,
        );
        const kotwica = wynik.stan === 'temat' ? wynik.temat.kotwica : `BRAK:${wynik.kod}`;
        const modelRef = wynik.stan === 'temat' ? wynik.temat.modelRef : '—';
        const menu = wynik.stan === 'temat' ? wynik.temat.menuKind : '—';
        const zgodne = wynik.stan === 'temat' && KOTWICA_NA_KIND[kotwica] === a.elementKind;
        const key = `${a.klasa.padEnd(16)} dekl=${String(a.elementKind).padEnd(22)} kotwica=${kotwica.padEnd(22)} ${zgodne ? 'ZGODNE ' : 'ROZJAZD'} menu=${menu}`;
        const wpis = licznik.get(key);
        if (wpis) wpis.n += 1;
        else licznik.set(key, { n: 1, ref: a.ownerRef ?? '—', modelRef, menu });
      };
      for (const a of areas) opisz(a);
      const wiersze = [...licznik.entries()].sort((a, b) => b[1].n - a[1].n);
      let rozjazdy = 0;
      for (const [k, v] of wiersze) if (k.includes('ROZJAZD')) rozjazdy += v.n;
      // eslint-disable-next-line no-console
      console.log(`\n=== LOD ${lod} — obiektow ${areas.length}, ROZJAZDOW ${rozjazdy} ===`);
      for (const [k, v] of wiersze) {
        // eslint-disable-next-line no-console
        console.log(`${String(v.n).padStart(5)}  ${k}\n         ref=${v.ref} modelRef=${v.modelRef}`);
      }
      expect(areas.length).toBeGreaterThan(0);
    });
  }
});
