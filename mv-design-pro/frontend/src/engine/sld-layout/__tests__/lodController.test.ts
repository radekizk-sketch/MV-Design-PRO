/**
 * lodController — testy progów zoom→LodLevel (+ histereza), polityki widoczności
 * per poziom (L0 omija aparaty/wyniki, L2 je zawiera), wirtualizacji viewportu
 * (L0 render-count ≪ L2), ciągłości fade przejść i determinizmu.
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md §7
 */
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../types/enm';
import { readTopologyFromENM } from '../../../ui/sld/core/topologyInputReader';
import { createTopologicalLayoutEngine } from '../layoutEngine';
import fixture from '../../../ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json';
import {
  LOD_LEVEL_ZOOM_THRESHOLDS,
  OVERVIEW_DENSITY_VISIBLE_STATIONS,
  countRenderedDetail,
  createLodLevelController,
  densityAwareLevel,
  geometryBBox,
  lodFadeFactor,
  lodLevelIndex,
  lodTransitionProgress,
  lodVisibilityPolicy,
  lodVisibilityPolicyForNumericLod,
  numericLodToLevel,
  polylineIntersectsViewport,
  rectIntersectsViewport,
  virtualizePositioned,
  visibleEdges,
  visibleNodes,
  worldViewportFromTransform,
  zoomToLodLevel,
  type WorldViewport,
} from '../lodController';

const enm = (fixture as { enm: unknown }).enm as EnergyNetworkModel;
const snapshot = readTopologyFromENM(enm, 'substrate-lod');

// =============================================================================
// 1. zoom → LodLevel + progi
// =============================================================================

describe('zoomToLodLevel — progi', () => {
  it('mała skala (przegląd) → L0', () => {
    expect(zoomToLodLevel(0.1)).toBe('L0');
    expect(zoomToLodLevel(0.3)).toBe('L0');
    expect(zoomToLodLevel(LOD_LEVEL_ZOOM_THRESHOLDS.L0_MAX - 0.001)).toBe('L0');
  });

  it('średnia skala (stacja/ciąg) → L1', () => {
    expect(zoomToLodLevel(LOD_LEVEL_ZOOM_THRESHOLDS.L0_MAX)).toBe('L1');
    expect(zoomToLodLevel(1.0)).toBe('L1');
    expect(zoomToLodLevel(LOD_LEVEL_ZOOM_THRESHOLDS.L1_MAX - 0.001)).toBe('L1');
  });

  it('duża skala (pełny szczegół) → L2', () => {
    expect(zoomToLodLevel(LOD_LEVEL_ZOOM_THRESHOLDS.L1_MAX)).toBe('L2');
    expect(zoomToLodLevel(3.0)).toBe('L2');
  });

  it('progi monotonicznie rosnące', () => {
    expect(LOD_LEVEL_ZOOM_THRESHOLDS.L0_MAX).toBeLessThan(LOD_LEVEL_ZOOM_THRESHOLDS.L1_MAX);
  });

  it('lodLevelIndex porządkuje L0<L1<L2', () => {
    expect(lodLevelIndex('L0')).toBe(0);
    expect(lodLevelIndex('L1')).toBe(1);
    expect(lodLevelIndex('L2')).toBe(2);
  });
});

// =============================================================================
// 2. Histereza — anty-migotanie na progu
// =============================================================================

describe('createLodLevelController — histereza', () => {
  it('startuje na poziomie z initialScale', () => {
    expect(createLodLevelController({ initialScale: 0.2 }).getLevel()).toBe('L0');
    expect(createLodLevelController({ initialScale: 1.0 }).getLevel()).toBe('L1');
    expect(createLodLevelController({ initialScale: 2.0 }).getLevel()).toBe('L2');
  });

  it('drobne ruchy wokół progu NIE przerzucają poziomu (anty-migotanie)', () => {
    const c = createLodLevelController({ initialScale: 0.5, hysteresisMargin: 0.15 });
    expect(c.getLevel()).toBe('L0');
    // Tuż powyżej progu L0_MAX (0.55), ale w pasmie histerezy → wciąż L0.
    expect(c.update(0.56)).toBe('L0');
    expect(c.update(0.6)).toBe('L0');
    // Wyraźne przekroczenie (0.55 * 1.15 = 0.6325) → przejście do L1.
    expect(c.update(0.64)).toBe('L1');
    // Spadek tuż poniżej progu, ale w pasmie → wciąż L1 (nie wraca migotliwie).
    expect(c.update(0.54)).toBe('L1');
    expect(c.update(0.5)).toBe('L1');
    // Wyraźny spadek (0.55 * 0.85 = 0.4675) → powrót do L0.
    expect(c.update(0.46)).toBe('L0');
  });

  it('reset ustawia poziom bez histerezy', () => {
    const c = createLodLevelController({ initialScale: 0.2 });
    c.update(2.0);
    expect(c.getLevel()).toBe('L2');
    c.reset(0.1);
    expect(c.getLevel()).toBe('L0');
    expect(c.getScale()).toBe(0.1);
  });

  it('determinizm: ta sama sekwencja skal → ta sama sekwencja poziomów', () => {
    const seq = [0.2, 0.6, 0.64, 1.0, 1.6, 1.3, 0.5, 0.46];
    const run = () => {
      const c = createLodLevelController({ initialScale: 0.2 });
      return seq.map((s) => c.update(s));
    };
    expect(run()).toEqual(run());
  });
});

// =============================================================================
// 3. Płynne przejścia (fade) — M-10
// =============================================================================

describe('lodTransitionProgress / lodFadeFactor — ciągłość', () => {
  it('progress rośnie monotonicznie w paśmie poziomu', () => {
    const a = lodTransitionProgress(0.6, 'L1');
    const b = lodTransitionProgress(1.0, 'L1');
    const c = lodTransitionProgress(1.35, 'L1');
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
  });

  it('fade jest ciągły wokół progu (brak skoku) i wraca do 1 poza pasmem', () => {
    // Daleko od progu → pełna widoczność.
    expect(lodFadeFactor(0.2, 'L0')).toBe(1);
    // W środku pasma przejścia (~próg) → wygaszenie < 1, ale > 0 (cross-fade).
    const mid = lodFadeFactor(LOD_LEVEL_ZOOM_THRESHOLDS.L0_MAX, 'L0');
    expect(mid).toBeLessThan(1);
    expect(mid).toBeGreaterThan(0);
    // Ciągłość: małe zmiany skali → małe zmiany fade.
    const f1 = lodFadeFactor(0.54, 'L0');
    const f2 = lodFadeFactor(0.545, 'L0');
    expect(Math.abs(f1 - f2)).toBeLessThan(0.2);
  });

  it('najwyższy poziom (L2) nie wygasza (zawsze 1)', () => {
    expect(lodFadeFactor(2.0, 'L2')).toBe(1);
    expect(lodFadeFactor(10.0, 'L2')).toBe(1);
  });

  it('determinizm fade: ta sama skala → ta sama wartość', () => {
    expect(lodFadeFactor(0.56, 'L0')).toBe(lodFadeFactor(0.56, 'L0'));
  });
});

// =============================================================================
// 4. Polityka widoczności per poziom — STRUKTURALNY fix gęstości
// =============================================================================

describe('lodVisibilityPolicy — L0 omija aparaty/wyniki, L2 je zawiera', () => {
  it('L0: bloki + nazwa + status; BRAK pól/aparatów/etykiet-wyników', () => {
    const p = lodVisibilityPolicy('L0');
    expect(p.stationBlock).toBe(true);
    expect(p.stationName).toBe(true);
    expect(p.stationReadiness).toBe(true);
    // To jest fix gęstości — nic, co by się nakładało:
    expect(p.fields).toBe(false);
    expect(p.apparatus).toBe(false);
    expect(p.apparatusCatalogLabels).toBe(false);
    expect(p.cableHeads).toBe(false);
    expect(p.resultLabels).toBe(false);
    expect(p.fullResults).toBe(false);
    expect(p.keyResults).toBe(false);
    // Krawędzie zagregowane (stacja→stacja), nie port→port.
    expect(p.aggregatedEdges).toBe(true);
    expect(p.portToPortEdges).toBe(false);
  });

  it('L1: pola + role + stan łącznika + kluczowe wyniki; BRAK pełnej aparatury', () => {
    const p = lodVisibilityPolicy('L1');
    expect(p.fields).toBe(true);
    expect(p.fieldRoleLabels).toBe(true);
    expect(p.switchState).toBe(true);
    expect(p.keyResults).toBe(true);
    expect(p.apparatus).toBe(false);
    expect(p.fullResults).toBe(false);
  });

  it('L2: pełna aparatura + głowice + katalogowe etykiety + pełne wyniki', () => {
    const p = lodVisibilityPolicy('L2');
    expect(p.apparatus).toBe(true);
    expect(p.apparatusCatalogLabels).toBe(true);
    expect(p.cableHeads).toBe(true);
    expect(p.fullResults).toBe(true);
    expect(p.portToPortEdges).toBe(true);
    expect(p.aggregatedEdges).toBe(false);
  });

  it('alarmy widoczne na każdym poziomie (bezpieczeństwo)', () => {
    expect(lodVisibilityPolicy('L0').alarms).toBe(true);
    expect(lodVisibilityPolicy('L1').alarms).toBe(true);
    expect(lodVisibilityPolicy('L2').alarms).toBe(true);
  });

  it('monotoniczność widoczności: co widać na L0 widać też na L1 i L2', () => {
    const l0 = lodVisibilityPolicy('L0');
    const l1 = lodVisibilityPolicy('L1');
    const l2 = lodVisibilityPolicy('L2');
    const keys: Array<keyof typeof l0> = [
      'stationBlock', 'stationName', 'fields', 'fieldRoleLabels', 'switchState',
      'apparatus', 'cableHeads', 'keyResults', 'fullResults',
    ];
    for (const k of keys) {
      if (l0[k] === true) {
        expect(l1[k]).toBe(true);
        expect(l2[k]).toBe(true);
      }
      if (l1[k] === true) {
        expect(l2[k]).toBe(true);
      }
    }
  });
});

// =============================================================================
// 5. Most numeryczny LOD (0–4) ↔ poziom geometrii
// =============================================================================

describe('numericLodToLevel — bridge', () => {
  it('0→L0, 1/2→L1, 3/4→L2', () => {
    expect(numericLodToLevel(0)).toBe('L0');
    expect(numericLodToLevel(1)).toBe('L1');
    expect(numericLodToLevel(2)).toBe('L1');
    expect(numericLodToLevel(3)).toBe('L2');
    expect(numericLodToLevel(4)).toBe('L2');
  });

  it('lodVisibilityPolicyForNumericLod zgodne z numericLodToLevel', () => {
    for (const n of [0, 1, 2, 3, 4] as const) {
      expect(lodVisibilityPolicyForNumericLod(n)).toEqual(
        lodVisibilityPolicy(numericLodToLevel(n)),
      );
    }
  });
});

describe('densityAwareLevel — L0 floor gdy dużo stacji w kadrze (M-08)', () => {
  it('dużo widocznych stacji → wymusza L0 niezależnie od poziomu bazowego', () => {
    expect(densityAwareLevel('L2', OVERVIEW_DENSITY_VISIBLE_STATIONS)).toBe('L0');
    expect(densityAwareLevel('L1', 50)).toBe('L0');
    expect(densityAwareLevel('L2', 53)).toBe('L0');
  });

  it('mało widocznych stacji → zachowuje poziom bazowy', () => {
    expect(densityAwareLevel('L2', OVERVIEW_DENSITY_VISIBLE_STATIONS - 1)).toBe('L2');
    expect(densityAwareLevel('L1', 3)).toBe('L1');
    expect(densityAwareLevel('L0', 0)).toBe('L0');
  });

  it('próg konfigurowalny', () => {
    expect(densityAwareLevel('L2', 10, 8)).toBe('L0');
    expect(densityAwareLevel('L2', 5, 8)).toBe('L2');
  });
});

// =============================================================================
// 6. Wirtualizacja viewportu
// =============================================================================

describe('worldViewportFromTransform / intersekcje', () => {
  it('odwzorowuje ekran→świat (identity scale)', () => {
    const vp = worldViewportFromTransform(
      { scale: 1, translateX: 0, translateY: 0 },
      { width: 100, height: 50 },
      0,
    );
    expect(vp).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 50 });
  });

  it('uwzględnia translację i skalę', () => {
    const vp = worldViewportFromTransform(
      { scale: 2, translateX: 10, translateY: 20 },
      { width: 200, height: 100 },
      0,
    );
    // world = (screen - translate) / scale
    expect(vp.minX).toBeCloseTo(-5);
    expect(vp.minY).toBeCloseTo(-10);
    expect(vp.maxX).toBeCloseTo(95);
    expect(vp.maxY).toBeCloseTo(40);
  });

  it('rectIntersectsViewport: wewnątrz / na zewnątrz / przecięcie brzegu', () => {
    const vp: WorldViewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    expect(rectIntersectsViewport({ x: 10, y: 10, width: 20, height: 20 }, vp)).toBe(true);
    expect(rectIntersectsViewport({ x: 200, y: 200, width: 10, height: 10 }, vp)).toBe(false);
    expect(rectIntersectsViewport({ x: 95, y: 95, width: 20, height: 20 }, vp)).toBe(true);
  });

  it('polylineIntersectsViewport: zależnie od bbox punktów', () => {
    const vp: WorldViewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    expect(polylineIntersectsViewport([{ x: 10, y: 10 }, { x: 50, y: 50 }], vp)).toBe(true);
    expect(polylineIntersectsViewport([{ x: 200, y: 200 }, { x: 300, y: 300 }], vp)).toBe(false);
    expect(polylineIntersectsViewport([], vp)).toBe(false);
  });

  it('virtualizePositioned zachowuje kolejność i odsiewa poza kadrem', () => {
    const vp: WorldViewport = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const items = [
      { id: 'a', x: 10, y: 10 },
      { id: 'b', x: 500, y: 500 },
      { id: 'c', x: 50, y: 50 },
    ];
    const out = virtualizePositioned(items, vp, 10);
    expect(out.map((i) => i.id)).toEqual(['a', 'c']);
  });
});

// =============================================================================
// 7. DOWÓD GĘSTOŚCI na realnym substracie (≥52 stacje): L0 ≪ L2
// =============================================================================

describe('density proof — substrate ≥52 stacji (M-08)', () => {
  const engine = createTopologicalLayoutEngine();
  const layout = engine.layout(snapshot, 'topological');

  it('layout zbudował bloki dla ≥52 stacji (korzenie L0)', () => {
    expect(layout.nodes.length).toBeGreaterThanOrEqual(52);
  });

  it('L0 render-count ≪ L2 (struktura, nie collision-avoidance)', () => {
    const l0 = countRenderedDetail(layout.nodes, 'L0');
    const l1 = countRenderedDetail(layout.nodes, 'L1');
    const l2 = countRenderedDetail(layout.nodes, 'L2');
    // L0 = tylko bloki stacji.
    expect(l0).toBe(layout.nodes.length);
    // L1 schodzi do pól → istotnie więcej.
    expect(l1).toBeGreaterThan(l0);
    // L2 schodzi do aparatów → jeszcze więcej.
    expect(l2).toBeGreaterThan(l1);
    // Drastyczny spadek gęstości: L0 to ułamek L2.
    expect(l0).toBeLessThan(l2 / 2);
  });

  it('wirtualizacja: kadr przeglądowy renderuje wszystkie bloki, mały kadr — mniej', () => {
    const bbox = geometryBBox(layout.nodes);
    const fullVp: WorldViewport = bbox;
    const allVisible = visibleNodes(layout.nodes, fullVp);
    expect(allVisible.length).toBe(layout.nodes.length);

    // Mały kadr (lewy górny ćwiartek) renderuje ostro mniej węzłów.
    const smallVp: WorldViewport = {
      minX: bbox.minX,
      minY: bbox.minY,
      maxX: bbox.minX + (bbox.maxX - bbox.minX) * 0.25,
      maxY: bbox.minY + (bbox.maxY - bbox.minY) * 0.25,
    };
    const fewVisible = visibleNodes(layout.nodes, smallVp);
    expect(fewVisible.length).toBeLessThan(layout.nodes.length);
  });

  it('wirtualizacja krawędzi: pełny kadr ⊇ mały kadr', () => {
    const bbox = geometryBBox(layout.nodes);
    const all = visibleEdges(layout.edges, bbox);
    expect(all.length).toBe(layout.edges.length);
    const small: WorldViewport = {
      minX: bbox.minX,
      minY: bbox.minY,
      maxX: bbox.minX + (bbox.maxX - bbox.minX) * 0.3,
      maxY: bbox.minY + (bbox.maxY - bbox.minY) * 0.3,
    };
    expect(visibleEdges(layout.edges, small).length).toBeLessThanOrEqual(all.length);
  });

  it('determinizm: countRenderedDetail powtarzalny', () => {
    expect(countRenderedDetail(layout.nodes, 'L2')).toBe(
      countRenderedDetail(layout.nodes, 'L2'),
    );
  });
});
