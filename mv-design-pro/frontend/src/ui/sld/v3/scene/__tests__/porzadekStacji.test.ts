/**
 * K2 (UI-04, nawigacja „poprzednia/następna stacja") — `meta.stationTraversalOrder`.
 *
 * Porządek obchodu pochodzi z danych SCENY (biegi i ich węzeł-origin), nie
 * z sortowania refów (hash) ani z geometrii (PR #483 sortował odgałęzienia po
 * minY/minX — przy łamaniu arkusza kolejność skakała między wierszami).
 *
 * ILOCZYN CECH:
 *  - sieć: 52 stacje (ciąg główny 12 + 41 stacji odgałęzień, arkusz łamany)
 *    × poziom szczegółu L0/L1/L2 (porządek NIE zależy od poziomu);
 *  - kompletność: każda narysowana stacja dokładnie raz, GPZ pierwszy;
 *  - ciąg główny w kolejności magistrali (podciąg);
 *  - odgałęzienie zaraz po stacji origin, stacje odgałęzienia w kolejności biegu;
 *  - funkcja czysta: bieg z origin poza rysunkiem → stacje na końcu, posortowane;
 *    odgałęzienie z odgałęzienia (zagnieżdżenie); cykl origin → bez powtórzeń;
 *    brak GPZ.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, porzadekObchoduStacji } from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(
    readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8'),
  ) as { enm: EnergyNetworkModel }
).enm;
const nazwa = new Map(enm.substations.map((s) => [s.ref_id, s.name]));

describe('stationTraversalOrder — sieć referencyjna 52 stacji', () => {
  const sceny = [buildSceneV3(enm, 0), buildSceneV3(enm, 1), buildSceneV3(enm, 2)] as const;
  const porzadek = sceny[2].meta.stationTraversalOrder;

  it('obejmuje KAŻDĄ narysowaną stację dokładnie raz, GPZ pierwszy', () => {
    const meta = sceny[2].meta;
    expect(new Set(porzadek).size).toBe(porzadek.length);
    expect(porzadek[0]).toBe(meta.gpzId);
    expect([...porzadek].sort()).toEqual([...new Set([...meta.drawnStationIds, meta.gpzId!])].sort());
  });

  it('jest identyczny na L0, L1 i L2 (nawigacja nie zależy od poziomu szczegółu)', () => {
    expect(sceny[0].meta.stationTraversalOrder).toEqual(porzadek);
    expect(sceny[1].meta.stationTraversalOrder).toEqual(porzadek);
  });

  it('ciąg główny występuje w kolejności magistrali', () => {
    const indeksy = sceny[2].meta.mainTrunkStationIds.map((id) => porzadek.indexOf(id));
    expect(indeksy.every((i) => i >= 0)).toBe(true);
    expect([...indeksy].sort((a, b) => a - b)).toEqual(indeksy);
  });

  it('odgałęzienie L{k}-{j} idzie zaraz po stacji T{k}, przed następną stacją ciągu, w kolejności j', () => {
    const trunk = new Set(sceny[2].meta.mainTrunkStationIds);
    const nazwy = porzadek.map((id) => nazwa.get(id) ?? id);
    let sprawdzone = 0;
    for (const [i, n] of nazwy.entries()) {
      const m = /^Stacja L(\d+)-(\d+)$/.exec(n);
      if (!m) continue;
      sprawdzone += 1;
      // Najbliższa poprzedzająca stacja ciągu głównego to origin odgałęzienia.
      const poprzedniaCiagu = [...porzadek.slice(0, i)].reverse().find((id) => trunk.has(id));
      expect(nazwa.get(poprzedniaCiagu!), `${n} po stacji swojego origin`).toBe(`Stacja T${m[1]}`);
      const j = Number(m[2]);
      if (j > 1) expect(nazwy[i - 1], `${n} zaraz po poprzedniej stacji biegu`).toBe(`Stacja L${m[1]}-${j - 1}`);
    }
    expect(sprawdzone, 'fixtura ma stacje odgałęzień nazwane L{k}-{j}').toBeGreaterThan(30);
  });
});

describe('porzadekObchoduStacji — funkcja czysta', () => {
  const biegi = (...b: [string, string | null][]) => b.map(([id, originRef]) => ({ id, originRef }));

  it('feeder z pola GPZ (origin null lub GPZ) zaraz po GPZ, potem ciąg z odgałęzieniami', () => {
    const wynik = porzadekObchoduStacji(
      'G',
      ['T1', 'T2'],
      biegi(['b1', 'T1'], ['f', null], ['g', 'G']),
      new Map([
        ['b1', ['L1']],
        ['f', ['F1']],
        ['g', ['F2']],
      ]),
      new Set(['T1', 'T2', 'L1', 'F1', 'F2']),
    );
    expect(wynik).toEqual(['G', 'F1', 'F2', 'T1', 'L1', 'T2']);
  });

  it('odgałęzienie z odgałęzienia: zagnieżdżone stacje zaraz po swojej stacji origin', () => {
    const wynik = porzadekObchoduStacji(
      'G',
      ['T1', 'T2'],
      biegi(['b1', 'T1'], ['b2', 'L1a']),
      new Map([
        ['b1', ['L1a', 'L1b']],
        ['b2', ['M1']],
      ]),
      new Set(['T1', 'T2', 'L1a', 'L1b', 'M1']),
    );
    expect(wynik).toEqual(['G', 'T1', 'L1a', 'M1', 'L1b', 'T2']);
  });

  it('stacja nieosiągnięta obchodem (origin poza rysunkiem) trafia na koniec, posortowana', () => {
    const wynik = porzadekObchoduStacji(
      'G',
      ['T1'],
      biegi(['b', 'X-nie-narysowany']),
      new Map([['b', ['Z2', 'Z1']]]),
      new Set(['T1', 'Z2', 'Z1']),
    );
    expect(wynik).toEqual(['G', 'T1', 'Z1', 'Z2']);
  });

  it('cykl origin (A z B, B z A) nie powtarza stacji; brak GPZ — bez wpisu GPZ', () => {
    const wynik = porzadekObchoduStacji(
      null,
      ['T1'],
      biegi(['a', 'T1'], ['b', 'A1'], ['c', 'B1']),
      new Map([
        ['a', ['A1']],
        ['b', ['B1']],
        ['c', ['A1']],
      ]),
      new Set(['T1', 'A1', 'B1']),
    );
    expect(wynik).toEqual(['T1', 'A1', 'B1']);
  });

  it('bieg bez narysowanych stacji jest pomijany', () => {
    const wynik = porzadekObchoduStacji('G', ['T1'], biegi(['pusty', 'T1']), new Map(), new Set(['T1']));
    expect(wynik).toEqual(['G', 'T1']);
  });
});
