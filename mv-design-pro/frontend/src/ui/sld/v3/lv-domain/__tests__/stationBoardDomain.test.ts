/**
 * T5b-2 (18 P0, dowody warstwy A/B — "MODEL/TOPOLOGY" i "PROJECTION" z
 * `PROCEDURA ODBIORU T5b-2`) — fixtura "Stacja C" (`stationBoardDomain.ts`):
 * incomer JAWNY, trzy odpływy w pełnym torze (bus→zabezpieczenie→kabel→cel),
 * podrozdzielnica z WŁASNYM odbiorem, PV w PEŁNYM torze (zabezpieczenie+
 * kabel do zacisku PCC-LV).
 */
import { describe, expect, it } from 'vitest';

import { composeLvDomainScene, findTransformerIncomer } from '../composeLvDomainScene';
import { STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_REFS, STATION_BOARD_UPSTREAM_EQUIVALENTS } from '../fixtures/stationBoardDomain';

const scene = composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS);
const refs = STATION_BOARD_REFS;

describe('P0.3/P0.4 — LV incomer JAWNY (TR → incomer → BUS, zakaz skracania do ikonki)', () => {
  it('findTransformerIncomer rozpoznaje QF-TR1 jako incomer (zacisk nN ma DOKŁADNIE jedną gałąź, nie sprzęgło)', () => {
    const trafo = STATION_BOARD_DOMAIN_VIEW.transformers[0];
    const result = findTransformerIncomer(trafo, STATION_BOARD_DOMAIN_VIEW.branches);
    expect(result.boardBusRef).toBe(refs.rgnn1BusRef);
    expect(result.incomerBranch?.ref_id).toBe(refs.qfTr1Ref);
  });

  it('zacisk nN (LV terminal) jest węzłem sceny ODDZIELNYM od RGNN-1', () => {
    const terminalNode = scene.nodes.find((n) => n.ref === refs.lvTerminalBusRef);
    const boardNode = scene.nodes.find((n) => n.ref === refs.rgnn1BusRef);
    expect(terminalNode).toBeDefined();
    expect(boardNode).toBeDefined();
    expect(terminalNode!.x).not.toBe(undefined);
    expect(terminalNode!.y).toBeLessThan(boardNode!.y); // TR terminal WYŻEJ niż sekcja (kierunek toru)
  });

  it('QF-TR1 jest węzłem APARATU (nie zniknął w geometrii) między zaciskiem a sekcją', () => {
    const incomerNode = scene.nodes.find((n) => n.ref === refs.qfTr1Ref);
    expect(incomerNode?.kind).toBe('apparatus');
    expect(incomerNode?.symbolId).toBe('nnBreaker');
    expect(incomerNode?.meta?.role).toBe('incomer');
  });

  it('sekcja RGNN-1 jest KRESKĄ magistrali (busBarHalfWidth > 0), nie ikonką', () => {
    const boardNode = scene.nodes.find((n) => n.ref === refs.rgnn1BusRef);
    expect(boardNode?.kind).toBe('bus');
    expect(boardNode?.busBarHalfWidth).toBeGreaterThan(0);
    expect(boardNode?.symbolId).toBeUndefined();
  });
});

describe('P0.5/P0.6 — każdy odpływ: BUS → zabezpieczenie → kabel → cel', () => {
  it('QF-01: aparat na kikucie RGNN-1, kabel ODDZIELNY (kind=cable) do zacisku Odbiór-1', () => {
    const apparatusNode = scene.nodes.find((n) => n.ref === refs.qf01Ref);
    expect(apparatusNode?.kind).toBe('apparatus');
    expect(apparatusNode?.symbolId).toBe('nnBreaker');
    const cableEdge = scene.edges.find((e) => e.ref === refs.cableQf01Ref);
    expect(cableEdge?.kind).toBe('cable');
    expect(cableEdge?.meta?.catalogRef).toBe('KABEL_NN/YKY_4x25');
  });

  it('QF-02: odpływ prowadzi do PODROZDZIELNICY RGN-2 (sekcja realna, kreska), a NIE kwadratu z podpisem', () => {
    const rgn2Node = scene.nodes.find((n) => n.ref === refs.rgn2BusRef);
    expect(rgn2Node?.kind).toBe('bus');
    expect(rgn2Node?.busBarHalfWidth).toBeGreaterThan(0);
    const cableEdge = scene.edges.find((e) => e.ref === refs.cableQf02Ref);
    expect(cableEdge?.kind).toBe('cable');
  });

  it('RGN-2 ma WŁASNY odpływ (QF-RGN2-01 + kabel) do WŁASNEGO odbioru — podrozdzielnica NIE jest liściem', () => {
    const rgn2FeederApparatus = scene.nodes.find((n) => n.ref === 'stnC/QF-RGN2-01');
    expect(rgn2FeederApparatus?.kind).toBe('apparatus');
    const rgn2Load = scene.nodes.find((n) => n.ref === 'stnC/rgn2_load');
    expect(rgn2Load?.kind).toBe('load');
  });

  it('kabel dostaje krawędź KIND=cable ODRÓŻNIALNĄ od aparatu (branch) — dystynkcja wizualna P0.6', () => {
    const cableKinds = new Set(scene.edges.filter((e) => e.ref.startsWith('stnC/kabel_')).map((e) => e.kind));
    expect(cableKinds).toEqual(new Set(['cable']));
    const apparatusEdgeKinds = new Set([refs.qf01Ref, refs.qf02Ref, refs.qf03Ref, refs.qfTr1Ref].map(
      (ref) => scene.edges.find((e) => e.ref === ref)?.kind,
    ));
    expect(apparatusEdgeKinds).toEqual(new Set(['branch']));
  });
});

describe('P0.7 — PV w PEŁNYM torze (DER → zabezpieczenie → kabel → PCC-LV → BUS), gdy model GO NIESIE', () => {
  it('PV1 siedzi NAD zaciskiem PCC-LV (nie WPROST nad sekcją) — tor jest pełny, nie skrócony', () => {
    const pvNode = scene.nodes.find((n) => n.ref === refs.pvGeneratorRef);
    const pccNode = scene.nodes.find((n) => n.ref === refs.pvTerminalBusRef);
    expect(pvNode).toBeDefined();
    expect(pccNode).toBeDefined();
    expect(pvNode!.y).toBeLessThan(pccNode!.y);
  });

  it('QF-03 (pole PV) i kabel PV są węzły/krawędzie DEDYKOWANE — tor DER→zabezpieczenie→kabel→PCC pełny', () => {
    const fieldApparatus = scene.nodes.find((n) => n.ref === refs.qf03Ref);
    expect(fieldApparatus?.kind).toBe('apparatus');
    const fieldCable = scene.edges.find((e) => e.ref === refs.cableQf03Ref);
    expect(fieldCable?.kind).toBe('cable');
  });

  it('sourceDrop generatora do zacisku PCC NIE niesie adnotacji luki (apparatusGapPl) — tor jest znany z modelu', () => {
    const dropEdge = scene.edges.find((e) => e.ref === `${refs.pvGeneratorRef}#source-drop`);
    expect(dropEdge?.meta?.apparatusGapPl).toBeUndefined();
  });
});

describe('determinizm sceny "Stacja C"', () => {
  it('dwa wywołania dają identyczną scenę', () => {
    const a = composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS);
    const b = composeLvDomainScene(STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_UPSTREAM_EQUIVALENTS);
    expect(a).toEqual(b);
  });
});
