/**
 * Karta GPZ-H5-SLD pkt 3g — TABLICZKA WYNIKU (baner nieaktualności + pochodzenie) w
 * przestrzeni EKRANU.
 *
 * Przyczyna defektu (pomiar przed naprawą, te same fikstury): tabliczka była zakotwiczona
 * w arkuszu na prawo od strefy GPZ, poza treścią, z której liczy się kadr „Dopasuj widok"
 * — H5 2×2 przy 1400×800: widok kończył się na 1664 j.św., tabliczka zajmowała
 * 1536…2429 j.św., więc „Moduł: … · Przebieg: …" był ucięty krawędzią kanwy.
 *
 * Iloczyn cech: sieć {H5 2×2, równoważnik SN 2 sekcje} × kadr {1400×800, 1000×700,
 * 1800×1100} × wyniki {aktualne, nieaktualne} × deklaracja {pełna z przypadkiem, bez
 * przypadku}. Wyrocznia: płyta i KAŻDY wiersz w całości w widoku, napis nie dłuższy niż
 * płyta, płyta rozłączna z podkładką wskaźnika ukrytych opisów i z podpisami arkusza.
 * Pomiar w DOM wprost z `rect`/`text` przez `viewBox` (to, co rysuje kanwa), nie z układu.
 */
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { measureTextWidth } from '../../core/text';
import {
  POCHODZENIE_FONT_PX,
  ukladPochodzeniaWyniku,
  zachodza,
  type ScreenRect,
} from '../chromeLayout';
import type { SldV3Overlay } from '../overlay';
import { buildResultLabelsFromScene } from '../resultLabels';
import { SldCanvasV3 } from '../SldCanvasV3';
import { buildSceneV3 } from '../../scene/buildScene';

const FX = `${__dirname}/../../scene/__tests__/fixtures`;
const SIECI = ['gpzH5_2x2', 'gpzRownowaznikSn2'] as const;
const KADRY = [
  [1400, 800],
  [1000, 700],
  [1800, 1100],
] as const;
const RUN_ID = '3f2a9c1e-5b7d-4e2a-9f10-77c3d1a2b4e5';

function wczytaj(nazwa: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(`${FX}/${nazwa}.enm.json`, 'utf8')) as { enm: EnergyNetworkModel }).enm;
}

function nakladka(enm: EnergyNetworkModel, nieaktualne: boolean, zPrzypadkiem: boolean): SldV3Overlay {
  const scena = buildSceneV3(enm, 2);
  // Realna warstwa liczb: napięcie na KAŻDEJ szynie modelu — baner nieaktualności
  // pojawia się tylko, gdy warstwa ma co pokazać (R2 wym. 8).
  const elements = Object.fromEntries(
    enm.buses.map((b) => [
      b.ref_id,
      {
        ref_id: b.ref_id,
        kind: 'bus',
        badges: [],
        severity: 'INFO',
        metrics: { U_kV: { code: 'U_kV', value: b.voltage_kv, unit: 'kV', format_hint: 'fixed2' } },
      },
    ]),
  );
  const resultLabelsByOwnerRef = buildResultLabelsFromScene(
    scena,
    { run_id: RUN_ID, analysis_type: 'load_flow', elements },
    new Set<string>(),
  );
  expect(Object.keys(resultLabelsByOwnerRef).length).toBeGreaterThan(0);
  return {
    energizedByTestId: {},
    resultLabelsByOwnerRef,
    resultsStale: nieaktualne,
    provenance: {
      ...(zPrzypadkiem ? { caseRef: 'Przypadek bazowy', converged: true } : {}),
      analysisTypeLabel: 'Rozpływ mocy',
      runId: RUN_ID,
      completedAtLabel: '22.10.2026, 10:15:30',
      swiezosc: nieaktualne ? 'nieaktualny' : 'aktualny',
      swiezoscLabel: nieaktualne ? 'nieaktualny — rew. 11, model rew. 12' : 'aktualny',
    },
  };
}

/** Prostokąt elementu SVG w pikselach ekranu — z atrybutów i `viewBox` korzenia. */
function naEkran(svg: SVGSVGElement, w: number, x: number, y: number, szer: number, wys: number): ScreenRect {
  const [vx, vy, vw] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
  const k = w / vw;
  return { x: (x - vx) * k, y: (y - vy) * k, width: szer * k, height: wys * k };
}

function rectEkranu(svg: SVGSVGElement, w: number, el: Element): ScreenRect {
  const n = (a: string) => Number(el.getAttribute(a));
  return naEkran(svg, w, n('x'), n('y'), n('width'), n('height'));
}

function wWidoku(r: ScreenRect, w: number, h: number): boolean {
  const eps = 1e-6;
  return r.x >= -eps && r.y >= -eps && r.x + r.width <= w + eps && r.y + r.height <= h + eps;
}

describe('tabliczka wyniku — w całości w widoku (iloczyn sieć × kadr × świeżość × deklaracja)', () => {
  for (const siec of SIECI) {
    const enm = wczytaj(siec);
    for (const [w, h] of KADRY) {
      for (const nieaktualne of [false, true]) {
        for (const zPrzypadkiem of [true, false]) {
          it(`${siec} · ${w}×${h} · ${nieaktualne ? 'nieaktualne' : 'aktualne'} · ${zPrzypadkiem ? 'z przypadkiem' : 'bez przypadku'}`, () => {
            const { container } = render(
              <SldCanvasV3 snapshot={enm} width={w} height={h} overlay={nakladka(enm, nieaktualne, zPrzypadkiem)} />,
            );
            const svg = container.querySelector('svg') as SVGSVGElement;
            const plytaEl = container.querySelector('[data-testid="sld-v3-tabliczka-wyniku-plyta"]');
            expect(plytaEl, 'tabliczka wyniku narysowana').not.toBeNull();
            const plyta = rectEkranu(svg, w, plytaEl!);
            expect(wWidoku(plyta, w, h), `płyta ${JSON.stringify(plyta)} w widoku ${w}×${h}`).toBe(true);

            // Każdy wiersz: początek w płycie, napis (miarą typografii v3) nie dłuższy niż płyta.
            const wiersze = Array.from(container.querySelectorAll('[data-wiersz-pochodzenia]'));
            // Baner tylko, gdy warstwa liczb ma co pokazać na bieżącym poziomie szczegółu
            // (R2 wym. 8) — kadr automatyczny może zejść do L0, gdzie etykiet szyn nie ma.
            const warstwaPokazuje =
              container.querySelectorAll('[data-testid^="sld-v3-result-label-"], [data-testid^="sld-v3-result-aggregate-"]').length > 0;
            const baner = nieaktualne && warstwaPokazuje;
            const oczekiwane = (baner ? 1 : 0) + (zPrzypadkiem ? 1 : 0) + 4;
            expect(wiersze).toHaveLength(oczekiwane);
            for (const t of wiersze) {
              const p = naEkran(svg, w, Number(t.getAttribute('x')), Number(t.getAttribute('y')), 0, 0);
              const szer = measureTextWidth(t.textContent ?? '', POCHODZENIE_FONT_PX);
              expect(p.x).toBeGreaterThanOrEqual(plyta.x);
              expect(p.x + szer, `wiersz „${t.textContent}" mieści się w płycie`).toBeLessThanOrEqual(plyta.x + plyta.width + 1e-6);
              expect(p.y).toBeGreaterThan(plyta.y);
              expect(p.y).toBeLessThan(plyta.y + plyta.height);
            }
            const tresc = wiersze.map((t) => t.textContent).join('\n');
            expect(tresc).toContain(`Przebieg: ${RUN_ID}`);
            expect(tresc).toContain('Moduł: Rozpływ mocy');
            expect(container.querySelector('[data-testid="sld-v3-result-stale-badge"]') !== null).toBe(baner);

            // Rozłączność z podkładką wskaźnika ukrytych opisów (gdy jest).
            const hint = container.querySelector('[data-testid="sld-v3-hidden-labels-hint-plyta"]');
            if (hint) expect(zachodza(plyta, rectEkranu(svg, w, hint))).toBe(false);
          });
        }
      }
    }
  }
});

describe('baner nieaktualności jest wierszem tabliczki (L2, warstwa liczb niepusta)', () => {
  for (const siec of SIECI) {
    it(siec, () => {
      const enm = wczytaj(siec);
      const { container } = render(
        <SldCanvasV3 snapshot={enm} width={1400} height={800} lodOverride={2} overlay={nakladka(enm, true, true)} />,
      );
      const svg = container.querySelector('svg') as SVGSVGElement;
      const baner = container.querySelector('[data-testid="sld-v3-result-stale-badge-tekst"]');
      expect(baner?.textContent).toBe('⚠ wyniki nieaktualne');
      const plyta = rectEkranu(svg, 1400, container.querySelector('[data-testid="sld-v3-tabliczka-wyniku-plyta"]')!);
      const p = naEkran(svg, 1400, Number(baner!.getAttribute('x')), Number(baner!.getAttribute('y')), 0, 0);
      expect(p.y).toBeGreaterThan(plyta.y);
      expect(p.y).toBeLessThan(plyta.y + plyta.height);
      expect(wWidoku(plyta, 1400, 800)).toBe(true);
    });
  }
});

describe('ukladPochodzeniaWyniku — reguła ustępowania', () => {
  const miara = { measure: measureTextWidth };
  const wiersze = [
    { id: 'a', tekst: 'Moduł: Rozpływ mocy' },
    { id: 'b', tekst: `Przebieg: ${RUN_ID}` },
  ];

  it('pusta lista wierszy ⇒ brak tabliczki', () => {
    expect(ukladPochodzeniaWyniku({ width: 1000, height: 700 }, [], [], miara)).toBeNull();
  });

  it('bez przeszkód: lewy-dolny róg, nad pasem doków, w widoku', () => {
    const u = ukladPochodzeniaWyniku({ width: 1000, height: 700 }, wiersze, [], miara)!;
    expect(u.plyta.x).toBe(12);
    expect(u.plyta.y + u.plyta.height).toBeLessThan(700 - 40);
    expect(u.wiersze.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('przeszkoda w slocie ⇒ tabliczka nad nią, rozłącznie; łańcuch przeszkód ⇒ nad najwyższą', () => {
    const bazowy = ukladPochodzeniaWyniku({ width: 1000, height: 700 }, wiersze, [], miara)!.plyta;
    const p1: ScreenRect = { x: 0, y: bazowy.y + 10, width: 400, height: 20 };
    const u1 = ukladPochodzeniaWyniku({ width: 1000, height: 700 }, wiersze, [p1], miara)!;
    expect(zachodza(u1.plyta, p1)).toBe(false);
    const p2: ScreenRect = { x: 0, y: u1.plyta.y + 5, width: 400, height: 10 };
    const u2 = ukladPochodzeniaWyniku({ width: 1000, height: 700 }, wiersze, [p1, p2], miara)!;
    expect(zachodza(u2.plyta, p1)).toBe(false);
    expect(zachodza(u2.plyta, p2)).toBe(false);
  });

  it('widok niższy niż tabliczka ⇒ y = 0 (nie ponad krawędź)', () => {
    const u = ukladPochodzeniaWyniku({ width: 1000, height: 60 }, wiersze, [], miara)!;
    expect(u.plyta.y).toBe(0);
  });
});
