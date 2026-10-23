/**
 * Karta GPZ-H5-SLD etap 2, wymaganie 6 — tabliczka pochodzenia wyniku (przestrzeń ekranu)
 * nie przecina urządzeń, etykiet ani przewodów schematu w kadrze „Dopasuj widok".
 *
 * Iloczyn cech: sieć {H5 2×2, równoważnik SN 2 sekcje} × kadr {1400×800, 1000×700}
 * × świeżość {aktualne, nieaktualne}. Wyrocznia z DOM kanwy: obrys płyty
 * (`sld-v3-tabliczka-wyniku-plyta`) rozłączny z obrysem KAŻDEGO glifu sceny narysowanego
 * poziomu (symbol × `SYMBOL_DEFS`, rzut przez `viewBox`) i z prostokątem tuszu KAŻDEJ
 * narysowanej etykiety (`<text>` środek × szerokość miarą typografii v3, obrót −90°) oraz
 * z każdym odcinkiem przewodu sceny.
 */
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { measureTextWidth } from '../../core/text';
import { zachodza, type ScreenRect } from '../chromeLayout';
import type { SldV3Overlay } from '../overlay';
import { SldCanvasV3 } from '../SldCanvasV3';
import { buildSceneV3, type SceneLod } from '../../scene/buildScene';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { FRAME_MARGIN } from '../../sheet/Frame';

const FX = `${__dirname}/../../scene/__tests__/fixtures`;
const SIECI = ['gpzH5_2x2', 'gpzRownowaznikSn2'] as const;
const KADRY = [
  [1400, 800],
  [1000, 700],
] as const;
const RUN_ID = '3f2a9c1e-5b7d-4e2a-9f10-77c3d1a2b4e5';

function wczytaj(nazwa: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(`${FX}/${nazwa}.enm.json`, 'utf8')) as { enm: EnergyNetworkModel }).enm;
}

function nakladka(nieaktualne: boolean): SldV3Overlay {
  return {
    energizedByTestId: {},
    resultLabelsByOwnerRef: {},
    resultsStale: nieaktualne,
    provenance: {
      caseRef: 'Przypadek bazowy',
      converged: true,
      analysisTypeLabel: 'Rozpływ mocy',
      runId: RUN_ID,
      completedAtLabel: '22.10.2026, 10:15:30',
      swiezosc: nieaktualne ? 'nieaktualny' : 'aktualny',
      swiezoscLabel: nieaktualne ? 'nieaktualny — rew. 11, model rew. 12' : 'aktualny',
    },
  };
}

describe('tabliczka wyniku rozłączna z urządzeniami i etykietami schematu', () => {
  for (const siec of SIECI) {
    const enm = wczytaj(siec);
    for (const [w, h] of KADRY) {
      for (const nieaktualne of [false, true]) {
        it(`${siec} · ${w}×${h} · ${nieaktualne ? 'nieaktualne' : 'aktualne'}`, () => {
          const { container } = render(<SldCanvasV3 snapshot={enm} width={w} height={h} overlay={nakladka(nieaktualne)} />);
          const svg = container.querySelector('svg[viewBox]') as SVGSVGElement;
          const [vx, vy, vw] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
          const k = w / vw;
          const naEkran = (x: number, y: number, s: number, t: number): ScreenRect => ({
            x: (x - vx) * k,
            y: (y - vy) * k,
            width: s * k,
            height: t * k,
          });
          // Scena (glify, etykiety, przewody) stoi w grupie `translate(FRAME_MARGIN, FRAME_MARGIN)`
          // arkusza; płyta tabliczki — w układzie korzenia (odwrotność kamery).
          const zeSceny = (x: number, y: number, s: number, t: number): ScreenRect =>
            naEkran(x + FRAME_MARGIN, y + FRAME_MARGIN, s, t);
          const plytaEl = container.querySelector('[data-testid="sld-v3-tabliczka-wyniku-plyta"]')!;
          expect(plytaEl, 'tabliczka narysowana').not.toBeNull();
          const n = (a: string) => Number(plytaEl.getAttribute(a));
          const plyta = naEkran(n('x'), n('y'), n('width'), n('height'));

          const lod = Number(container.querySelector('[data-scene-lod]')!.getAttribute('data-scene-lod')) as SceneLod;
          const scena = buildSceneV3(enm, lod);
          const glify = scena.symbols.map((s) => ({
            co: `${s.symbolId} ${s.meta?.ownerRef ?? ''}`,
            r: zeSceny(s.x, s.y, SYMBOL_DEFS[s.symbolId].width, SYMBOL_DEFS[s.symbolId].height),
          }));
          expect(glify.length).toBeGreaterThan(0);
          const etykiety = Array.from(container.querySelectorAll('g[data-testid^="sld-v3-label-"] > text')).map((t) => {
            const fs = Number(t.getAttribute('font-size'));
            const dl = measureTextWidth(t.textContent ?? '', fs);
            const obrot = (t.getAttribute('transform') ?? '').startsWith('rotate');
            const [szer, wys] = obrot ? [fs, dl] : [dl, fs];
            const cx = Number(t.getAttribute('x'));
            const cy = Number(t.getAttribute('y'));
            return { co: t.textContent ?? '', r: zeSceny(cx - szer / 2, cy - wys / 2, szer, wys) };
          });
          expect(etykiety.length).toBeGreaterThan(0);
          // Przewody toru (odcinki sceny, grubość 2 j.św.) — tabliczka nie leży na torze.
          const przewody = scena.segments.flatMap((seg) =>
            seg.points.slice(1).map((b, i) => {
              const a = seg.points[i];
              return {
                co: `przewód ${seg.meta?.ownerRef ?? ''}`,
                r: zeSceny(Math.min(a.x, b.x) - 1, Math.min(a.y, b.y) - 1, Math.abs(a.x - b.x) + 2, Math.abs(a.y - b.y) + 2),
              };
            }),
          );
          const kolizje = [...glify, ...etykiety, ...przewody].filter((o) => zachodza(plyta, o.r)).map((o) => o.co);
          expect(kolizje, `płyta ${JSON.stringify(plyta)}`).toEqual([]);
        });
      }
    }
  }
});
