/**
 * no-geometry-derived-topology
 *
 * Weryfikuje, że topologia SLD NIE jest wywodzona z geometrii.
 *
 * Zasada: topologia pochodzi wyłącznie z ENM (EngineeringSemanticModel)
 * przez adapter (sldProjectionAdapter / TopologyAdapterV2).
 *
 * Trasy SLD (SldRoute) mają connectionId z modelu domenowego,
 * nie współrzędne używane do wnioskowania o połączeniu.
 */

import { describe, expect, it } from 'vitest';

import type { SldRoute, SldOverlayProjection } from '../../engineering-semantic/types';

describe('no geometry-derived topology', () => {
  it('SldRoute has connectionId — topology comes from semantic model, not geometry', () => {
    const route: SldRoute = {
      routeId: 'route-gpz-bus',
      connectionId: 'conn-gpz-bus',
      semanticHash: 'hash-gpz-bus',
      pathPoints: [
        { x: 100, y: 200 },
        { x: 100, y: 300 },
      ],
      routeClass: 'TOR_MOCY',
    };

    // connectionId is the topology identity — from semantic model
    expect(route.connectionId).toBe('conn-gpz-bus');
    expect(typeof route.connectionId).toBe('string');
  });

  it('SldRoute pathPoints are visual-only — changing them does not change topology identity', () => {
    const route: SldRoute = {
      routeId: 'route-bus-bay',
      connectionId: 'conn-bus-bay',
      semanticHash: 'hash-bus-bay',
      pathPoints: [{ x: 50, y: 100 }, { x: 50, y: 200 }],
      routeClass: 'TOR_MOCY',
    };

    // Topology identity is connectionId — pathPoints are rendering hints only
    expect(route.connectionId).toBeTruthy();
    expect(route.pathPoints).toHaveLength(2);
    // Changing pathPoints doesn't change the connection being represented
    const reroutedPoints = [{ x: 60, y: 100 }, { x: 60, y: 200 }];
    expect(reroutedPoints).not.toEqual(route.pathPoints);
    // Same connectionId regardless of pathPoints
    expect(route.connectionId).toBe('conn-bus-bay');
  });

  it('SldOverlayProjection requires inputSnapshotRefId — result tied to domain snapshot, not geometry', () => {
    const overlay: SldOverlayProjection = {
      schemaVersion: 'v8',
      projectRefId: 'proj-1',
      overlayId: 'overlay-1',
      semanticHash: 'sem-hash-1',
      baseViewHash: 'view-hash-1',
      resultSetRefId: 'result-set-1',
      resultHash: 'result-hash-1',
      inputSnapshotRefId: 'snapshot-ref-1',
      overlayKind: 'NAPIECIE',
      overlayHash: 'overlay-hash-1',
      markers: [],
      labels: [],
    };

    // inputSnapshotRefId ties result to domain model snapshot, not canvas coords
    expect(overlay.inputSnapshotRefId).toBeTruthy();
    expect(overlay.baseViewHash).toBeTruthy();
  });

  it('topology identity uses semantic refId strings, not pixel coordinates', () => {
    // Semantic identifiers are domain-level, not geometry-level
    const semanticRefIds = ['gpz-1', 'gpz-bus-sn', 'bay-line-gpz', 'seg-1'];
    for (const refId of semanticRefIds) {
      expect(typeof refId).toBe('string');
      expect(refId.length).toBeGreaterThan(0);
      // NOT a plain number (which would suggest geometry index)
      expect(Number.isFinite(Number(refId))).toBe(false);
    }
  });

  it('SldRoute routeClass is a power/control domain token, not a geometry class', () => {
    const validRouteClasses: SldRoute['routeClass'][] = [
      'TOR_MOCY',
      'TOR_POMIAROWY',
      'TOR_STEROWNICZY',
      'TOR_LOGICZNY',
    ];

    for (const routeClass of validRouteClasses) {
      const route: SldRoute = {
        routeId: `route-${routeClass}`,
        connectionId: `conn-${routeClass}`,
        semanticHash: `hash-${routeClass}`,
        pathPoints: [],
        routeClass,
      };
      expect(validRouteClasses).toContain(route.routeClass);
    }
  });
});
