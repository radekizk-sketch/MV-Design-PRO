/**
 * PIĘĆ TWARDYCH SPRAWDZEŃ WŁAŚCICIELA (karta T5b-2, `PROCEDURA ODBIORU
 * T5b-2` w `docs/nn/PLAN_SLD_NN_TOPOLOGIA_2026-08.md`):
 *  1. Sprzęgło: QBC OPEN→CLOSED zmienia rysunek ORAZ connectivity ORAZ
 *     wyniki zwarciowe (nie animacja symbolu).
 *  2. 2×TR: QBC OPEN → dwa obszary zasilania; CLOSED → solver wie, czy praca
 *     równoległa dopuszczona/niedopuszczona/warunkowa — NIE renderer.
 *  3. PV: DER → switching/protection → conductor → PCC → BUS (nie
 *     ikona→RGnN).
 *  4. SWZ: overlay na konkretnym torze; displayedValue ==
 *     solverResult(feederId, scenarioId, runId).
 *  5. Boundary: BUS → feeder → protection → cable → boundary terminal →
 *     foreign-domain chip (nie BUS → Stacja OBCA).
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { computeElectricalComponents, composeLvDomainScene } from '../composeLvDomainScene';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS } from '../fixtures/multiSourceDomain';
import { STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_REFS, STATION_BOARD_UPSTREAM_EQUIVALENTS } from '../fixtures/stationBoardDomain';
import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import type { SwzOverlayEntry } from '../../canvas/overlay';
import type { LvDomainGraphView } from '../types';

function withCouplerStatus(status: 'open' | 'closed'): LvDomainGraphView {
  return {
    ...MULTI_SOURCE_DOMAIN_VIEW,
    branches: MULTI_SOURCE_DOMAIN_VIEW.branches.map((b) => (b.ref_id === 'coupler' ? { ...b, status } : b)),
  };
}

describe('HARD-CHECK #1 — sprzęgło QBC OPEN→CLOSED zmienia rysunek ORAZ connectivity ORAZ wyniki zwarciowe', () => {
  it('RYSUNEK: meta.status węzła aparatu sprzęgła i status krawędzi zmieniają się z danymi (nie animacja niezależna)', () => {
    const openScene = composeLvDomainScene(withCouplerStatus('open'), MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    const closedScene = composeLvDomainScene(withCouplerStatus('closed'), MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    expect(openScene.nodes.find((n) => n.ref === 'coupler')?.meta?.status).toBe('open');
    expect(closedScene.nodes.find((n) => n.ref === 'coupler')?.meta?.status).toBe('closed');
    expect(openScene.edges.find((e) => e.ref === 'coupler')?.status).toBe('open');
    expect(closedScene.edges.find((e) => e.ref === 'coupler')?.status).toBe('closed');
  });

  it('CONNECTIVITY: OPEN → nn_a i nn_b w RÓŻNYCH komponentach elektrycznych; CLOSED → w TYM SAMYM (P0.18 — z grafu, nie z geometrii)', () => {
    const openComponents = computeElectricalComponents(withCouplerStatus('open'));
    expect(openComponents.get('nn_a')).not.toBe(openComponents.get('nn_b'));

    const closedComponents = computeElectricalComponents(withCouplerStatus('closed'));
    expect(closedComponents.get('nn_a')).toBe(closedComponents.get('nn_b'));
  });

  it('WYNIKI ZWARCIOWE: overlay "shortCircuit" pokazuje DOKŁADNIE wartość solvera podaną dla DANEGO scenariusza QBC (dwa różne runId → dwie różne wartości renderowane, zero przeliczeń w UI)', () => {
    const scene = composeLvDomainScene(withCouplerStatus('closed'), MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    const nnABusNode = scene.nodes.find((n) => n.ref === 'nn_a')!;

    const payloadQbcOpen: RawOverlayPayload = {
      run_id: 'run-qbc-open',
      analysis_type: 'sc_3f',
      elements: { nn_a: { ref_id: 'nn_a', kind: 'bus', badges: [], severity: 'INFO', metrics: { IK_3F_A: { code: 'IK_3F_A', value: 6100, unit: 'A' } } } },
    };
    const payloadQbcClosed: RawOverlayPayload = {
      run_id: 'run-qbc-closed',
      analysis_type: 'sc_3f',
      elements: { nn_a: { ref_id: 'nn_a', kind: 'bus', badges: [], severity: 'INFO', metrics: { IK_3F_A: { code: 'IK_3F_A', value: 9800, unit: 'A' } } } },
    };

    const { unmount } = render(
      <LvDomainView
        rootStationId="root"
        scenarioId="qbc-open"
        view={withCouplerStatus('open')}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
        initialOverlay="shortCircuit"
        resultOverlayPayload={payloadQbcOpen}
      />,
    );
    expect(screen.getByTestId(`lv-domain-badge-shortCircuit-${nnABusNode.ref}`).textContent).toContain('6100.00');
    expect(screen.getByTestId(`lv-domain-badge-shortCircuit-${nnABusNode.ref}`)).toHaveAttribute('data-run-id', 'run-qbc-open');
    unmount();

    render(
      <LvDomainView
        rootStationId="root"
        scenarioId="qbc-closed"
        view={withCouplerStatus('closed')}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
        initialOverlay="shortCircuit"
        resultOverlayPayload={payloadQbcClosed}
      />,
    );
    expect(screen.getByTestId(`lv-domain-badge-shortCircuit-${nnABusNode.ref}`).textContent).toContain('9800.00');
    expect(screen.getByTestId(`lv-domain-badge-shortCircuit-${nnABusNode.ref}`)).toHaveAttribute('data-run-id', 'run-qbc-closed');
  });
});

describe('HARD-CHECK #2 — 2×TR: QBC OPEN → dwa obszary zasilania; CLOSED → topologia scala się; PERMISYWNOŚĆ pracy równoległej NIE jest renderowana przez frontend (luka modelu nazwana, zero fabrykacji werdyktu)', () => {
  it('OPEN: tr1 (na nn_a) i tr2 (na nn_b) leżą w RÓŻNYCH komponentach elektrycznych — dwa NIEZALEŻNE obszary zasilania', () => {
    const components = computeElectricalComponents(withCouplerStatus('open'));
    const tr1 = MULTI_SOURCE_DOMAIN_VIEW.transformers.find((t) => t.ref_id === 'tr1')!;
    const tr2 = MULTI_SOURCE_DOMAIN_VIEW.transformers.find((t) => t.ref_id === 'tr2')!;
    expect(components.get(tr1.lv_bus_ref)).not.toBe(components.get(tr2.lv_bus_ref));
  });

  it('CLOSED: tr1 i tr2 leżą w TYM SAMYM komponencie elektrycznym — topologia scala się (solver widzi jeden węzeł zwarciowy, nie renderer)', () => {
    const components = computeElectricalComponents(withCouplerStatus('closed'));
    const tr1 = MULTI_SOURCE_DOMAIN_VIEW.transformers.find((t) => t.ref_id === 'tr1')!;
    const tr2 = MULTI_SOURCE_DOMAIN_VIEW.transformers.find((t) => t.ref_id === 'tr2')!;
    expect(components.get(tr1.lv_bus_ref)).toBe(components.get(tr2.lv_bus_ref));
  });

  it('ZERO fabrykacji werdyktu pracy równoległej: DOM renderu nie zawiera ŻADNEGO tekstu sugerującego dopuszczalność/niedopuszczalność (LvDomainGraphView/UpstreamEquivalentSnapshot dziś nie niosą takiego kanału — luka modelu, patrz raport karty)', () => {
    render(
      <LvDomainView
        rootStationId="root"
        scenarioId="qbc-closed"
        view={withCouplerStatus('closed')}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
      />,
    );
    const rootText = screen.getByTestId('lv-domain-view-root').textContent ?? '';
    for (const forbidden of ['dopuszcz', 'niedopuszcz', 'praca równoległa', 'synchroniczn']) {
      expect(rootText.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe('HARD-CHECK #3 — PV: DER → switching/protection → conductor → PCC → BUS (nie ikona→RGnN)', () => {
  it('gdy model NIESIE pełny tor (Stacja C): PV → zabezpieczenie (QF-03) → kabel → zacisk PCC-LV → sekcja — WSZYSTKIE ogniwa obecne', () => {
    const scene = composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS);
    const refs = STATION_BOARD_REFS;
    expect(scene.nodes.find((n) => n.ref === refs.pvGeneratorRef)?.kind).toBe('generator');
    expect(scene.nodes.find((n) => n.ref === refs.qf03Ref)?.kind).toBe('apparatus');
    expect(scene.edges.find((e) => e.ref === refs.cableQf03Ref)?.kind).toBe('cable');
    expect(scene.nodes.find((n) => n.ref === refs.pvTerminalBusRef)?.kind).toBe('busJunction');
    expect(scene.nodes.find((n) => n.ref === refs.rgnn1BusRef)?.kind).toBe('bus');
  });

  it('gdy model NIE NIESIE toru pola (multiSourceDomain, PV WPROST na sekcji): luka NAZWANA jawnie w meta krawędzi (apparatusGapPl), zero fabrykacji glifu aparatu', () => {
    const scene = composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    const dropEdge = scene.edges.find((e) => e.ref === 'pv1#source-drop');
    expect(dropEdge?.meta?.apparatusGapPl).toBeDefined();
    expect(String(dropEdge?.meta?.apparatusGapPl)).toContain('luka modelu');
    // Zero węzła aparatu na tej gałęzi (nic nie fabrykujemy) — PV1 nie ma
    // żadnego węzła 'apparatus' powiązanego z jej source-drop.
    const apparatusNodesForPv = scene.nodes.filter((n) => n.kind === 'apparatus' && n.ref.includes('pv1'));
    expect(apparatusNodesForPv).toEqual([]);
  });
});

describe('HARD-CHECK #4 — SWZ overlay na konkretnym torze; displayedValue == solverResult(feederId, scenarioId, runId)', () => {
  it('plakietka SWZ pod aparatem QF-01 pokazuje DOKŁADNIE wartości z swzByFeederRef[qf01] (zero przeliczeń, zero zaokrągleń niezgodnych)', () => {
    const refs = STATION_BOARD_REFS;
    const entry: SwzOverlayEntry = {
      ownerRef: refs.qf01Ref,
      status: 'spełnia',
      przyczynaPl: 'Ik1min pokrywa próg wyłącznika w czasie wymaganym.',
      ik1MinA: 842,
      iaWymaganeA: 250,
      tWymaganyS: 0.4,
      margines: 0.18,
    };
    render(
      <LvDomainView
        rootStationId={refs.stationRef}
        scenarioId="scenario-swz-demo"
        view={STATION_BOARD_DOMAIN_VIEW}
        upstreamEquivalents={STATION_BOARD_UPSTREAM_EQUIVALENTS}
        initialOverlay="swz"
        swzByFeederRef={{ [refs.qf01Ref]: entry }}
      />,
    );
    const badge = screen.getByTestId(`lv-domain-badge-swz-${refs.qf01Ref}`);
    expect(badge).toHaveAttribute('data-swz-status', 'spełnia');
    expect(badge.textContent).toContain('842');
    expect(badge.textContent).toContain('0.40');
    // Aparat BEZ wpisu w swzByFeederRef nie dostaje plakietki (uczciwy brak).
    expect(screen.queryByTestId(`lv-domain-badge-swz-${refs.qf02Ref}`)).toBeNull();
  });

  it('zmiana wartości w swzByFeederRef (inny runId/status FAIL) zmienia DOKŁADNIE renderowaną treść — dowód pass-through, nie cache/fabrykacja', () => {
    const refs = STATION_BOARD_REFS;
    const failEntry: SwzOverlayEntry = {
      ownerRef: refs.qf01Ref,
      status: 'nie spełnia',
      przyczynaPl: 'Ik1min poniżej progu wyłączenia w czasie wymaganym.',
      ik1MinA: 96,
      iaWymaganeA: 250,
      tWymaganyS: 0.4,
      margines: -0.62,
    };
    render(
      <LvDomainView
        rootStationId={refs.stationRef}
        scenarioId="scenario-swz-fail"
        view={STATION_BOARD_DOMAIN_VIEW}
        upstreamEquivalents={STATION_BOARD_UPSTREAM_EQUIVALENTS}
        initialOverlay="swz"
        swzByFeederRef={{ [refs.qf01Ref]: failEntry }}
      />,
    );
    const badge = screen.getByTestId(`lv-domain-badge-swz-${refs.qf01Ref}`);
    expect(badge).toHaveAttribute('data-swz-status', 'nie spełnia');
    expect(badge.textContent).toContain('96');
    expect(badge.textContent).toContain('250');
  });
});

describe('HARD-CHECK #5 — Boundary: BUS → feeder → protection → cable → boundary terminal → foreign-domain chip (nie BUS → Stacja OBCA)', () => {
  it('łańcuch strukturalny: kikut na nn_b → krawędź cable → węzeł boundaryTerminal → krawędź boundaryLink → chip (cztery ogniwa, nie skrót)', () => {
    const scene = composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    const cableEdge = scene.edges.find((e) => e.ref === 'tie_to_other' && e.kind === 'cable');
    const terminalNode = scene.nodes.find((n) => n.ref === 'boundary-terminal:tie_to_other');
    const linkEdge = scene.edges.find((e) => e.ref === 'boundary:tie_to_other#link');
    const chipNode = scene.nodes.find((n) => n.ref === 'boundary:tie_to_other');
    expect(cableEdge).toBeDefined();
    expect(terminalNode).toBeDefined();
    expect(linkEdge).toBeDefined();
    expect(chipNode).toBeDefined();
    // Kabel KOŃCZY SIĘ dokładnie tam, gdzie zaczyna się terminal (ciągłość toru).
    expect(cableEdge!.x2).toBe(terminalNode!.x);
    expect(cableEdge!.y2).toBe(terminalNode!.y);
    // Link do chipa zaczyna się dokładnie na terminalu (nie na szynie wprost).
    expect(linkEdge!.x1).toBe(terminalNode!.x);
    expect(linkEdge!.x2).toBe(chipNode!.x);
  });

  it('kabel graniczny bez znanego typu gałęzi (realny kształt backendu, P0.6/P0.8 luka) niesie adnotację gapPl zamiast fabrykować aparat', () => {
    const scene = composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    const cableEdge = scene.edges.find((e) => e.ref === 'tie_to_other' && e.kind === 'cable');
    expect(cableEdge?.meta?.gapPl).toBeDefined();
    const apparatusNode = scene.nodes.find((n) => n.ref === 'tie_to_other' && n.kind === 'apparatus');
    expect(apparatusNode).toBeUndefined();
  });
});
