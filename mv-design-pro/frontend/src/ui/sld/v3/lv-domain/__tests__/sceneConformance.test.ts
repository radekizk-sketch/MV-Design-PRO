/**
 * WYROCZNIA ZGODNOŚCI SCENY L2 (karta T5b, §0 pkt 5: "wyrocznia zgodności
 * sceny z grafem obejmuje nową projekcję (dopisz analogiczną wyrocznię dla
 * LvDomainView — scena L2 = projekcja grafu domeny, test)").
 *
 * Analogiczna do `sld/v3/electrical/__tests__/sceneConformance.test.ts`
 * (T0→T1), ale dla NOWEJ, WŁASNEJ kanwy L2: KAŻDY węzeł/krawędź sceny
 * odpowiada DOKŁADNIE JEDNEMU elementowi grafu domeny (bus/branch/
 * transformer/generator/load/boundary_link) LUB jest jawnie oznaczonym
 * chipem pochodnym (kotwica SN `anchor:{transformer_ref}`, granica
 * `boundary:{branch_ref}`) — zero fabrykowanych węzłów, zero pominiętych
 * elementów domeny.
 */
import { describe, expect, it } from 'vitest';

import { composeLvDomainScene } from '../composeLvDomainScene';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS } from '../fixtures/multiSourceDomain';

const scene = composeLvDomainScene(MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS);
const view = MULTI_SOURCE_DOMAIN_VIEW;

describe('WYROCZNIA — scena L2 mierzy coś realnego (kontrola przed dowodem zgodności)', () => {
  it('scena ma NIEZEROWĄ liczbę węzłów i krawędzi (pusta scena = pusta wyrocznia = fałszywa zieleń)', () => {
    expect(scene.nodes.length).toBeGreaterThan(0);
    expect(scene.edges.length).toBeGreaterThan(0);
  });
});

describe('Check A — KAŻDY węzeł sceny odpowiada elementowi domeny LUB jest jawnym chipem pochodnym', () => {
  const busRefs = new Set(view.buses.map((b) => b.ref_id));
  const transformerRefs = new Set(view.transformers.map((t) => t.ref_id));
  const generatorRefs = new Set(view.generators.map((g) => g.ref_id));
  const loadRefs = new Set(view.loads.map((l) => l.ref_id));
  const branchRefs = new Set(view.branches.map((b) => b.ref_id));
  const boundaryBranchRefs = new Set(view.boundary_links.map((l) => l.branch_ref));

  function isKnown(node: (typeof scene.nodes)[number]): boolean {
    switch (node.kind) {
      case 'bus':
      case 'busJunction':
        return busRefs.has(node.ref);
      case 'transformer':
        return transformerRefs.has(node.ref);
      case 'generator':
        return generatorRefs.has(node.ref);
      case 'load':
        return loadRefs.has(node.ref);
      case 'apparatus':
        return branchRefs.has(node.ref);
      case 'anchorChip':
        return node.ref.startsWith('anchor:') && transformerRefs.has(node.ref.slice('anchor:'.length));
      case 'boundaryChip':
        return node.ref.startsWith('boundary:') && boundaryBranchRefs.has(node.ref.slice('boundary:'.length));
      default:
        return false;
    }
  }

  it('zero węzłów UNCLASSIFIED — każdy węzeł sceny wskazuje na realny element grafu domeny', () => {
    const unclassified = scene.nodes.filter((n) => !isKnown(n));
    expect(unclassified.map((n) => `${n.kind}:${n.ref}`)).toEqual([]);
  });
});

describe('Check B — KAŻDY element grafu domeny ma reprezentację w scenie (kompletność, nie tylko poprawność)', () => {
  it('każda szyna domeny ma węzeł sceny (bus lub busJunction)', () => {
    const sceneBusRefs = new Set(
      scene.nodes.filter((n) => n.kind === 'bus' || n.kind === 'busJunction').map((n) => n.ref),
    );
    for (const bus of view.buses) {
      expect(sceneBusRefs.has(bus.ref_id), `szyna ${bus.ref_id} nie ma węzła sceny`).toBe(true);
    }
  });

  it('każdy transformator domeny ma węzeł źródła I kotwicę SN', () => {
    const transformerNodeRefs = new Set(scene.nodes.filter((n) => n.kind === 'transformer').map((n) => n.ref));
    const anchorNodeRefs = new Set(scene.nodes.filter((n) => n.kind === 'anchorChip').map((n) => n.ref));
    for (const trafo of view.transformers) {
      expect(transformerNodeRefs.has(trafo.ref_id)).toBe(true);
      expect(anchorNodeRefs.has(`anchor:${trafo.ref_id}`)).toBe(true);
    }
  });

  it('każdy generator (PV/BESS/G1) domeny ma węzeł źródła', () => {
    const generatorNodeRefs = new Set(scene.nodes.filter((n) => n.kind === 'generator').map((n) => n.ref));
    for (const gen of view.generators) {
      expect(generatorNodeRefs.has(gen.ref_id)).toBe(true);
    }
  });

  it('każda gałąź domeny WEWNĄTRZ domeny ma krawędź sceny (branch albo coupler); gałąź boundary_link ma ZAMIAST TEGO krawędź boundaryLink (jej DRUGI koniec świadomie NIE jest szyną domeny — patrz Check C)', () => {
    const sceneBranchRefs = new Set(
      scene.edges.filter((e) => e.kind === 'branch' || e.kind === 'coupler').map((e) => e.ref),
    );
    const boundaryLinkRefs = new Set(view.boundary_links.map((l) => l.branch_ref));
    const boundaryEdgeRefs = new Set(scene.edges.filter((e) => e.kind === 'boundaryLink').map((e) => e.ref));
    for (const branch of view.branches) {
      if (boundaryLinkRefs.has(branch.ref_id)) {
        expect(
          boundaryEdgeRefs.has(`boundary:${branch.ref_id}#link`),
          `gałąź boundary_link ${branch.ref_id} nie ma krawędzi boundaryLink`,
        ).toBe(true);
        continue;
      }
      expect(sceneBranchRefs.has(branch.ref_id), `gałąź ${branch.ref_id} nie ma krawędzi sceny`).toBe(true);
    }
  });

  it('każdy odbiór domeny ma węzeł liścia', () => {
    const loadNodeRefs = new Set(scene.nodes.filter((n) => n.kind === 'load').map((n) => n.ref));
    for (const load of view.loads) {
      expect(loadNodeRefs.has(load.ref_id)).toBe(true);
    }
  });

  it('każdy boundary_link domeny ma boundary chip — GRANICA WIDOCZNA, nie ukryta', () => {
    const boundaryNodeRefs = new Set(scene.nodes.filter((n) => n.kind === 'boundaryChip').map((n) => n.ref));
    for (const link of view.boundary_links) {
      expect(boundaryNodeRefs.has(`boundary:${link.branch_ref}`)).toBe(true);
    }
  });
});

describe('Check C — brak elementów FABRYKOWANYCH (obca stacja NIGDY nie wchodzi do sceny)', () => {
  it('żaden węzeł sceny nie odnosi się do szyny/gałęzi spoza deklarowanej domeny (nn_other)', () => {
    const allRefs = scene.nodes.map((n) => n.ref);
    expect(allRefs).not.toContain('nn_other');
    expect(allRefs.some((r) => r.includes('nn_other'))).toBe(false);
  });
});
