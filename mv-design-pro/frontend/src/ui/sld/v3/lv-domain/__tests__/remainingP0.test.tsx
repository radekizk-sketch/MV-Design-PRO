/**
 * T5b-2 — dowody punktów P0.9/P0.11/P0.12/P0.13/P0.15 nieobjętych wprost
 * przez pozostałe pliki testowe (composeLvDomainScene/sceneConformance/
 * stationBoardDomain/hardChecks). `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`
 * werdykt B-02 T5b, komplet 18 punktów.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { MIN_TAP_PITCH, composeLvDomainScene } from '../composeLvDomainScene';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS } from '../fixtures/multiSourceDomain';
import { buildLvDomainProjectionFixture } from '../fixtures/projectionFixture';
import { STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_REFS, STATION_BOARD_UPSTREAM_EQUIVALENTS } from '../fixtures/stationBoardDomain';
import type { SwzOverlayEntry } from '../../canvas/overlay';

describe('P0.9 — stany łączeniowe aparatów pokazane SYMBOLEM (geometrią glifu), nie tylko kolorem', () => {
  it('QF-TR1 zamknięty renderuje wypełniony prostokąt CB (fillOpacity=1, fill=stroke); QBC otwarty w innym fixture — pusty (fill=none)', () => {
    render(
      <LvDomainView
        projection={buildLvDomainProjectionFixture({
          graph: STATION_BOARD_DOMAIN_VIEW,
          upstreamEquivalents: STATION_BOARD_UPSTREAM_EQUIVALENTS,
        })}
      />,
    );
    const qfTr1 = screen.getByTestId(`lv-domain-node-${STATION_BOARD_REFS.qfTr1Ref}`);
    const rect = qfTr1.querySelector('rect[data-nn-breaker-toggle], rect');
    expect(rect).not.toBeNull();
    // CLOSED (wg fixtury) — wypełniony (fillOpacity 1, fill != 'none').
    expect(rect?.getAttribute('fill')).not.toBe('none');
    expect(rect?.getAttribute('fill-opacity')).toBe('1');
  });

  it('sprzęgło OTWARTE (meta.status=open) renderuje PUSTY prostokąt (fill=none) — geometria, nie tylko kolor', () => {
    const openView = {
      ...MULTI_SOURCE_DOMAIN_VIEW,
      branches: MULTI_SOURCE_DOMAIN_VIEW.branches.map((b) => (b.ref_id === 'coupler' ? { ...b, status: 'open' as const } : b)),
    };
    render(
      <LvDomainView
        projection={buildLvDomainProjectionFixture({
          graph: openView,
          upstreamEquivalents: MULTI_SOURCE_UPSTREAM_EQUIVALENTS,
        })}
      />,
    );
    const couplerNode = screen.getByTestId('lv-domain-node-coupler');
    const rect = couplerNode.querySelector('rect');
    expect(rect?.getAttribute('fill')).toBe('none');
  });
});

describe('P0.11 — werdykt SWZ trzeci stan (nierozstrzygalne) renderuje się honestly, bez fałszywego PASS/FAIL', () => {
  it('status "nierozstrzygalne" dostaje ton UNKNOWN (żółty), symbol "?", nie zielony/czerwony', () => {
    const entry: SwzOverlayEntry = {
      ownerRef: STATION_BOARD_REFS.qf01Ref,
      status: 'nierozstrzygalne',
      przyczynaPl: 'Rodzaj aparatu nierozpoznany — brak klasyfikacji katalogowej.',
      ik1MinA: 300,
      iaWymaganeA: null,
      tWymaganyS: null,
      margines: null,
    };
    render(
      <LvDomainView
        projection={buildLvDomainProjectionFixture({
          graph: STATION_BOARD_DOMAIN_VIEW,
          upstreamEquivalents: STATION_BOARD_UPSTREAM_EQUIVALENTS,
          swzByFeederRef: { [STATION_BOARD_REFS.qf01Ref]: entry },
        })}
        initialOverlay="swz"
      />,
    );
    const badge = screen.getByTestId(`lv-domain-badge-swz-${STATION_BOARD_REFS.qf01Ref}`);
    expect(badge).toHaveAttribute('data-swz-status', 'nierozstrzygalne');
    expect(badge.textContent).toContain('?');
  });
});

describe('P0.12/P0-V1 — kanwa wypełnia VIEWPORT, treść fitowana do pasma occupancy i CENTROWANA', () => {
  // FLIP (T5b-4, werdykt B-02 6/10 pkt 1): poprzedni pin („<svg> == gabaryt
  // sceny") przybijał kanon, który właściciel odrzucił — „boundingBox →
  // viewport" nie daje optymalnej skali roboczej; schemat siedział jako mały
  // blok w czarnej przestrzeni. INTENCJA pinu bez zmian (zero pustej kanwy,
  // zero stałego rozmiaru oderwanego od treści) — nowa forma: SVG wypełnia
  // viewport, a TREŚĆ jest skalowana do pasma occupancy (60–75% osi
  // wiążącej) i CENTROWANA (`visualGrammar.ts::fitSceneToViewport`).
  it('<svg> = viewport (1400×1000 minus nagłówek); occupancy osi wiążącej 55–80%; treść wyśrodkowana', () => {
    const scene = composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS);
    render(
      <LvDomainView
        projection={buildLvDomainProjectionFixture({
          graph: STATION_BOARD_DOMAIN_VIEW,
          upstreamEquivalents: STATION_BOARD_UPSTREAM_EQUIVALENTS,
        })}
        width={1400}
        height={1000}
      />,
    );
    const svg = screen.getByTestId('lv-domain-svg');
    const vw = Number(svg.getAttribute('width'));
    const vh = Number(svg.getAttribute('height'));
    expect(vw).toBe(1400);
    expect(vh).toBeGreaterThan(800); // viewport minus pasek nagłówka, nie gabaryt sceny
    const s = Number(svg.getAttribute('data-fit-scale'));
    expect(s).toBeGreaterThan(0);
    const occupancyX = (s * scene.width) / vw;
    const occupancyY = (s * scene.height) / vh;
    // Oś WIĄŻĄCA trzyma pasmo occupancy (0,70/0,66). Druga oś wynika z
    // PROPORCJI treści: Stacja C to jedna wąska kolumna sekcji — przy
    // jednolitej skali (L2 bez kamery/pan) nie może wypełnić 70% szerokości
    // i to jest UCZCIWE (kompozycja = centrowanie, nie rozciąganie).
    expect(Math.max(occupancyX, occupancyY)).toBeGreaterThanOrEqual(0.55);
    expect(Math.max(occupancyX, occupancyY)).toBeLessThanOrEqual(0.8);
    // Centrowanie (werdykt pkt 17 — koniec z przyklejaniem do lewej).
    const world = screen.getByTestId('lv-domain-world');
    const transform = world.getAttribute('transform') ?? '';
    const match = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/.exec(transform);
    expect(match).not.toBeNull();
    const tx = Number(match![1]);
    const ty = Number(match![2]);
    expect(tx).toBeCloseTo((vw - s * scene.width) / 2, 5);
    expect(ty).toBeCloseTo((vh - s * scene.height) / 2, 5);
    expect(tx).toBeGreaterThan(0);
  });
});

describe('P0.13 — minimalne engineering sizes: rozstaw kikutów >= MIN_TAP_PITCH (świat), fonty >= 9px (ekran)', () => {
  it('MIN_TAP_PITCH nie schodzi poniżej progu czytelności (40 j.św.)', () => {
    expect(MIN_TAP_PITCH).toBeGreaterThanOrEqual(40);
  });

  it('trzy odpływy Stacji C (QF-01/02/03) mają rozstaw x >= MIN_TAP_PITCH między sąsiadującymi kikutami', () => {
    const scene = composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS);
    const refs = STATION_BOARD_REFS;
    const xs = [refs.qf01Ref, refs.qf02Ref, refs.qf03Ref]
      .map((ref) => scene.nodes.find((n) => n.ref === ref)?.x)
      .filter((x): x is number => x != null)
      .sort((a, b) => a - b);
    expect(xs.length).toBe(3);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(MIN_TAP_PITCH - 1); // -1 tolerancja zaokrągleń fp
    }
  });
});

describe('P0.15 — hierarchia pionowa: SN anchor → TR → LV incomer → MAIN BUS → feeders/DER → subdistribution → loads', () => {
  it('kolejność Y rosnąco DOKŁADNIE w tej sekwencji dla toru T1→QF-TR1→RGNN-1→QF-02→RGN-2→odbiór', () => {
    const scene = composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS);
    const refs = STATION_BOARD_REFS;
    const yOf = (ref: string): number => scene.nodes.find((n) => n.ref === ref)!.y;

    const anchorY = yOf('anchor:stnC/T1');
    const trY = yOf('stnC/T1');
    const lvTerminalY = yOf(refs.lvTerminalBusRef);
    const rgnn1Y = yOf(refs.rgnn1BusRef);
    const qf02Y = yOf(refs.qf02Ref);
    const rgn2Y = yOf(refs.rgn2BusRef);
    const rgn2LoadY = yOf('stnC/rgn2_load');

    expect(anchorY).toBeLessThan(trY);
    expect(trY).toBeLessThan(lvTerminalY);
    expect(lvTerminalY).toBeLessThan(rgnn1Y);
    expect(rgnn1Y).toBeLessThan(qf02Y);
    expect(qf02Y).toBeLessThan(rgn2Y);
    expect(rgn2Y).toBeLessThan(rgn2LoadY);
  });
});
