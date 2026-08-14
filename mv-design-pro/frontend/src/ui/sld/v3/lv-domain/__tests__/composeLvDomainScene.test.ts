/**
 * Testy kompozycji sceny L2 (karta T5b, §0 rozstrzygnięcie 3/4). Fixtura
 * wieloźródłowa (2×TR + sprzęgło + PV + podrozdzielnica + boundary_link)
 * dowodzi: kompozycja GENERYCZNA z grafu (żaden szablon TR→RGnN→odpływy),
 * WSZYSTKIE źródła domeny obecne w scenie, boundary chip zamiast wciągnięcia
 * drugiej stacji.
 */
import { describe, expect, it } from 'vitest';

import {
  anchorChipLabel,
  composeLvDomainScene,
  transformerNameplateLabel,
} from '../composeLvDomainScene';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS } from '../fixtures/multiSourceDomain';
import type { LvDomainGraphView } from '../types';

describe('composeLvDomainScene — wieloźródłowość (2×TR + sprzęgło + PV)', () => {
  const scene = composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);

  it('OBA transformatory są węzłami sceny (żaden szablon TR→RGnN→odpływy, wieloźródłowość jawna)', () => {
    const transformerRefs = scene.nodes.filter((n) => n.kind === 'transformer').map((n) => n.ref);
    expect(transformerRefs.sort()).toEqual(['tr1', 'tr2']);
  });

  it('PV jest węzłem źródła sceny', () => {
    const generatorRefs = scene.nodes.filter((n) => n.kind === 'generator').map((n) => n.ref);
    expect(generatorRefs).toEqual(['pv1']);
  });

  it('OBIE kotwice SN (anchorChip per transformator) są obecne, z pełnym snapshotem w meta', () => {
    const anchors = scene.nodes.filter((n) => n.kind === 'anchorChip');
    expect(anchors.map((a) => a.ref).sort()).toEqual(['anchor:tr1', 'anchor:tr2']);
    for (const anchor of anchors) {
      expect(anchor.meta).toBeDefined();
      expect(anchor.meta?.sk_mva).toBe(187.4);
      expect(anchor.meta?.z1_ohm).toEqual({ r: 0.42, x: 1.18 });
    }
  });

  // T5b-2 (werdykt B-02 T5b, P0.2 BINDING): kanon ZMIENIONY — "kreska między
  // sekcjami bez aparatu ZAKAZANA (zmienia znaczenie zwarciowe)". Poprzednia
  // wersja tego testu WYMAGAŁA braku węzła aparatu na sprzęgle — to była
  // asercja dokładnie tego defektu, który właściciel odrzucił 0/10 (test
  // maskujący defekt produktu = dwa defekty, CLAUDE.md „Zero-Debt" pkt 5).
  // Naprawiony test: sprzęgło MA węzeł `apparatus` NA krawędzi `coupler`,
  // ze stanem łączeniowym w `meta.status` (P0.2/P0.9).
  it('sprzęgło (bus_coupler) MIĘDZY sekcjami tej samej głębokości jest krawędzią coupler Z JAWNYM węzłem aparatu (P0.2)', () => {
    const couplerEdge = scene.edges.find((e) => e.ref === 'coupler');
    expect(couplerEdge?.kind).toBe('coupler');
    const couplerNode = scene.nodes.find((n) => n.ref === 'coupler');
    expect(couplerNode?.kind).toBe('apparatus');
    expect(couplerNode?.symbolId).toBe('nnBreaker');
    expect(couplerNode?.meta?.status).toBe('closed');
  });

  it('sprzęgło OTWARTE zmienia meta.status węzła aparatu (dowód stanu łączeniowego, nie samego rysunku) — hard-check #1', () => {
    const openView: LvDomainGraphView = {
      ...MULTI_SOURCE_DOMAIN_VIEW,
      branches: MULTI_SOURCE_DOMAIN_VIEW.branches.map((b) => (b.ref_id === 'coupler' ? { ...b, status: 'open' } : b)),
    };
    const openScene = composeLvDomainScene(openView, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    const couplerNode = openScene.nodes.find((n) => n.ref === 'coupler');
    expect(couplerNode?.meta?.status).toBe('open');
    const couplerEdge = openScene.edges.find((e) => e.ref === 'coupler');
    expect(couplerEdge?.status).toBe('open');
  });

  // T5b-2 (P0.1 BINDING): "RGnN-A/B = prawdziwe SEKCJE SZYN (kreska
  // magistrali), nie ikonki-kwadraty" — węzeł sekcji NIE niesie już glifu
  // ikonki (`nnDistributionBoard`); zamiast tego niesie `busBarHalfWidth`
  // (renderer rysuje kreskę magistrali tej długości). Asercja poprzedniego
  // kanonu (symbolId==='nnDistributionBoard') przepisana do kanonu P0.1.
  it('podrozdzielnica wchłonięta (sub_bus) dostaje sekcję REALNĄ (kreska magistrali, nie ikonka)', () => {
    const subBusNode = scene.nodes.find((n) => n.ref === 'sub_bus');
    expect(subBusNode?.kind).toBe('bus');
    expect(subBusNode?.symbolId).toBeUndefined();
    expect(subBusNode?.busBarHalfWidth).toBeGreaterThan(0);
  });

  it('podrozdzielnica jest JEDEN wiersz poniżej sekcji rodzica (głębokość z grafu, nie szablon)', () => {
    const nnB = scene.nodes.find((n) => n.ref === 'nn_b')!;
    const subBus = scene.nodes.find((n) => n.ref === 'sub_bus')!;
    expect(subBus.y).toBeGreaterThan(nnB.y);
  });

  it('boundary chip zastępuje OBCĄ stację — żaden węzeł/gałąź obcej stacji (nn_other) nie istnieje w scenie', () => {
    const boundaryChip = scene.nodes.find((n) => n.kind === 'boundaryChip');
    expect(boundaryChip?.ref).toBe('boundary:tie_to_other');
    expect(boundaryChip?.label).toBe('→ Stacja OBCA');
    const otherStationNode = scene.nodes.find((n) => n.ref === 'nn_other');
    expect(otherStationNode).toBeUndefined();
  });

  it('boundary chip wisi NA KRAWĘDZI szyny źródłowej (ta sama wysokość co nn_b, przesunięty w bok)', () => {
    const nnB = scene.nodes.find((n) => n.ref === 'nn_b')!;
    const boundaryChip = scene.nodes.find((n) => n.kind === 'boundaryChip')!;
    expect(boundaryChip.y).toBe(nnB.y);
    expect(boundaryChip.x).toBeGreaterThan(nnB.x);
  });

  it('determinizm: dwa wywołania na tych samych danych dają identyczną scenę', () => {
    const sceneA = composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    const sceneB = composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
    expect(sceneA).toEqual(sceneB);
  });
});

describe('composeLvDomainScene — stan brak danych', () => {
  it('scena pusta (0 węzłów/krawędzi), zero wyjątku, gdy widok domeny ma status brak danych', () => {
    const view: LvDomainGraphView = {
      status: 'brak danych',
      station_ref: 'nieznana',
      buses: [],
      branches: [],
      transformers: [],
      generators: [],
      loads: [],
      sub_switchboards: [],
      boundary_links: [],
      missing_data: ['station'],
    };
    const scene = composeLvDomainScene(view);
    expect(scene.nodes).toEqual([]);
    expect(scene.edges).toEqual([]);
  });
});

describe('transformerNameplateLabel — tabliczka TR (Sn·przekładnia·grupa·uk%)', () => {
  it('formatuje wszystkie cztery pola werdyktu', () => {
    const label = transformerNameplateLabel({
      sn_mva: 0.63,
      uhv_kv: 15,
      ulv_kv: 0.4,
      vector_group: 'Dyn11',
      uk_percent: 4,
    });
    expect(label).toBe('0.63 MVA · 15/0.4 kV · Dyn11 · uk=4%');
  });
});

describe('anchorChipLabel — chip kompaktowy kotwicy SN', () => {
  it('pokazuje napięcie/Sk″/Ik″ dla snapshotu OK', () => {
    const label = anchorChipLabel(MULTI_SOURCE_UPSTREAM_EQUIVALENTS[0]);
    expect(label).toBe('SN 15 kV · Sk″=187.4 MVA · Ik″=7.21 kA');
  });

  it('daje uczciwy stan dla snapshotu brak danych (zero fabrykacji liczby)', () => {
    const label = anchorChipLabel({
      status: 'brak danych',
      case_id: 'c',
      station_ref: 's',
      missing_data: ['transformer'],
    });
    expect(label).toBe('SN · brak danych');
  });
});
