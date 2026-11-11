/**
 * Rozstrzygnięcie architekta S7-P2 (2026-10-30, `docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md` §12,
 * `SLD_CAD_SPEC_V3.md` §22.1) — mostek NA KANWIE, nie tylko w wyroczni sceny.
 *
 * Wyrocznia `przecieciaBezMostka` liczy mostki tą samą funkcją co kanwa, ale gdyby kanwa
 * przestała jej używać (np. ścieżka odcinka budowana wprost z punktów), wyrocznia sceny
 * dalej świeciłaby na zielono, a rysunek pokazywałby przecięcie bez przeskoku — czytane
 * jak połączenie. Ten test czyta FAKTYCZNIE wyrenderowane drzewo kanwy
 * (`renderToStaticMarkup`, ścieżka zrzutów odbiorczych): każde przecięcie toru mocy sceny
 * ma na kanwie półłuk (`A` w ścieżce pionu), a liczba półłuków jest równa liczbie przecięć.
 * Iloczyn: {sieć referencyjna, wachlarz pól GPZ z danymi zabezpieczeń} × {L0, L1, L2}.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { interiorCrossings } from '../../scene/crossings';
import { SldCanvasV3 } from '../SldCanvasV3';

const here = dirname(fileURLToPath(import.meta.url));
const wczytaj = (sciezka: string): EnergyNetworkModel => {
  const surowy = JSON.parse(readFileSync(resolve(here, sciezka), 'utf8')) as { enm?: EnergyNetworkModel };
  return (surowy.enm ?? surowy) as EnergyNetworkModel;
};

const SIECI: readonly (readonly [string, EnergyNetworkModel])[] = [
  ['sieć referencyjna 52 stacji', wczytaj('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json')],
  ['wachlarz pól GPZ z danymi zabezpieczeń', wczytaj('../../scene/__tests__/fixtures/gpzProtectionDataPath.enm.json')],
];

interface SciezkaOdcinka {
  readonly ownerRef: string;
  readonly mostki: number;
  readonly d: string;
}

/** Ścieżki odcinków kanwy z deklarowaną liczbą mostków (`data-bridge-count`). */
function sciezkiZMostkami(svg: string): SciezkaOdcinka[] {
  const wynik: SciezkaOdcinka[] = [];
  for (const m of svg.matchAll(/<path\b[^>]*\bdata-bridge-count="(\d+)"[^>]*>/g)) {
    const tag = m[0];
    wynik.push({
      ownerRef: /data-owner-ref="([^"]*)"/.exec(tag)?.[1] ?? '',
      mostki: Number(m[1]),
      d: /\sd="([^"]*)"/.exec(tag)?.[1] ?? '',
    });
  }
  return wynik;
}

describe('S7, rozstrzygnięcie przecięć (2026-10-30) — każde przecięcie toru mocy ma na kanwie mostek półłukowy', () => {
  for (const [nazwa, enm] of SIECI) {
    for (const lod of [0, 1, 2] as const satisfies readonly SceneLod[]) {
      it(`${nazwa} · L${lod}: liczba półłuków na kanwie = liczba przecięć sn×sn sceny, każdy w ścieżce pionu`, () => {
        const przeciecia = interiorCrossings(buildSceneV3(enm, lod).segments).filter((c) => !c.involvesBus);
        expect(przeciecia.length, 'fikstura bez przecięć nie dowodzi mostka').toBeGreaterThan(0);
        const svg = renderToStaticMarkup(
          <SldCanvasV3 snapshot={enm} width={1600} height={900} lodOverride={lod} paletteMode="light_technical" />,
        );
        const sciezki = sciezkiZMostkami(svg);
        expect(sciezki.reduce((n, s) => n + s.mostki, 0)).toBe(przeciecia.length);
        for (const s of sciezki) {
          // Półłuk mostka to komenda łuku `A` (promień BRIDGE_RADIUS) — po jednej na mostek.
          expect((s.d.match(/A/g) ?? []).length, s.ownerRef).toBe(s.mostki);
        }
        // Każdy pion przecięcia niesie mostek: właściciel pionu każdego przecięcia jest wśród
        // ścieżek z mostkami.
        const zMostkami = new Set(sciezki.map((s) => s.ownerRef));
        expect(przeciecia.filter((c) => !zMostkami.has(c.vOwnerRef ?? '')).map((c) => c.vOwnerRef)).toEqual([]);
      });
    }
  }
});
