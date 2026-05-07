/**
 * Snap — Phase 2 testy (operator-grade SLD plan v2).
 *
 * Pokrycie:
 *   1. snapPointToGrid: snap do grid base 20px.
 *   2. snapToPort: znajduje najbliższy w tolerance.
 *   3. snapToPort: tie-breaker (Manhattan dist + id ASC).
 *   4. snapToPort: null gdy żaden w tolerance.
 *   5. applySnapMode: 'off' → unchanged.
 *   6. applySnapMode: 'grid' → snap do grid.
 *   7. applySnapMode: 'port' → snap do najbliższego portu.
 *   8. applySnapMode: 'port' fallback do grid gdy port miss.
 *   9. SnapState setters: setSnapMode/setGridVisible/setPortTolerance idempotency.
 *  10. Determinizm: 5 reruny → identical snap.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SNAP_STATE,
  type PortSnapTarget,
  type SnapState,
  applySnapMode,
  setGridVisible,
  setPortTolerance,
  setSnapMode,
  snapPointToGrid,
  snapToPort,
} from '../Snap';

const PORTS: PortSnapTarget[] = [
  { id: 'port-1', x: 0, y: 0 },
  { id: 'port-2', x: 100, y: 0 },
  { id: 'port-3', x: 50, y: 50 },
];

describe('snapPointToGrid', () => {
  it('Snap do grid base 20px', () => {
    expect(snapPointToGrid({ x: 23, y: 47 })).toEqual({ x: 20, y: 40 });
    expect(snapPointToGrid({ x: 11, y: 9 })).toEqual({ x: 20, y: 0 });
    expect(snapPointToGrid({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('Negative coords snap correctly', () => {
    expect(snapPointToGrid({ x: -23, y: -7 })).toEqual({ x: -20, y: -0 });
  });
});

describe('snapToPort', () => {
  it('Znajduje najbliższy w tolerance', () => {
    const result = snapToPort({ x: 5, y: 3 }, PORTS, 10);
    expect(result?.id).toBe('port-1');
  });

  it('Drugi port jeśli bliżej', () => {
    const result = snapToPort({ x: 95, y: 5 }, PORTS, 15);
    expect(result?.id).toBe('port-2');
  });

  it('null gdy żaden w tolerance', () => {
    expect(snapToPort({ x: 200, y: 200 }, PORTS, 10)).toBeNull();
  });

  it('Tie-breaker: ten sam dist → id ASC', () => {
    const ports: PortSnapTarget[] = [
      { id: 'b', x: 10, y: 0 },
      { id: 'a', x: 10, y: 0 }, // ten sam dist
      { id: 'c', x: 10, y: 0 },
    ];
    const result = snapToPort({ x: 10, y: 0 }, ports, 10);
    expect(result?.id).toBe('a'); // id ASC tie-break
  });

  it('Pusta lista portów → null', () => {
    expect(snapToPort({ x: 0, y: 0 }, [], 10)).toBeNull();
  });

  it('Tolerance 0 → tylko exact match', () => {
    const result = snapToPort({ x: 0, y: 0 }, PORTS, 0);
    expect(result?.id).toBe('port-1'); // (0,0) === port (0,0)
  });
});

describe('applySnapMode', () => {
  it('mode=off → unchanged', () => {
    const result = applySnapMode({ x: 23, y: 47 }, 'off');
    expect(result.snapped).toEqual({ x: 23, y: 47 });
    expect(result.portTarget).toBeNull();
  });

  it('mode=grid → snap do grid', () => {
    const result = applySnapMode({ x: 23, y: 47 }, 'grid');
    expect(result.snapped).toEqual({ x: 20, y: 40 });
  });

  it('mode=port + port w tolerance → snap do portu', () => {
    const result = applySnapMode(
      { x: 5, y: 3 },
      'port',
      { ports: PORTS, portTolerance: 10 },
    );
    expect(result.snapped).toEqual({ x: 0, y: 0 });
    expect(result.portTarget?.id).toBe('port-1');
  });

  it('mode=port + brak portów w tolerance → fallback do grid', () => {
    const result = applySnapMode(
      { x: 200, y: 207 },
      'port',
      { ports: PORTS, portTolerance: 10 },
    );
    expect(result.snapped).toEqual({ x: 200, y: 200 });
    expect(result.portTarget).toBeNull();
  });

  it('mode=port BEZ portów ani tolerance → snap do grid', () => {
    const result = applySnapMode({ x: 23, y: 47 }, 'port');
    expect(result.snapped).toEqual({ x: 20, y: 40 });
    expect(result.portTarget).toBeNull();
  });
});

describe('SnapState setters — immutability + idempotency', () => {
  it('setSnapMode: zmiana → nowy obiekt', () => {
    const s1 = DEFAULT_SNAP_STATE;
    const s2 = setSnapMode(s1, 'port');
    expect(s2).not.toBe(s1);
    expect(s2.mode).toBe('port');
  });

  it('setSnapMode: ten sam mode → no-op (same reference)', () => {
    const s1: SnapState = { ...DEFAULT_SNAP_STATE, mode: 'port' };
    const s2 = setSnapMode(s1, 'port');
    expect(s2).toBe(s1);
  });

  it('setGridVisible: idempotency', () => {
    const s1 = DEFAULT_SNAP_STATE;
    const s2 = setGridVisible(s1, true); // s1.gridVisible jest true
    expect(s2).toBe(s1);
    const s3 = setGridVisible(s1, false);
    expect(s3.gridVisible).toBe(false);
  });

  it('setPortTolerance: clamp do >=0', () => {
    const s2 = setPortTolerance(DEFAULT_SNAP_STATE, -5);
    expect(s2.portTolerance).toBe(0);
  });

  it('DEFAULT_SNAP_STATE: mode=grid, gridVisible=true, tolerance=12', () => {
    expect(DEFAULT_SNAP_STATE.mode).toBe('grid');
    expect(DEFAULT_SNAP_STATE.gridVisible).toBe(true);
    expect(DEFAULT_SNAP_STATE.portTolerance).toBe(12);
  });
});

describe('Determinizm — 5 reruny → identical', () => {
  it('snapPointToGrid: 5 reruny', () => {
    for (let i = 0; i < 5; i++) {
      expect(snapPointToGrid({ x: 23, y: 47 })).toEqual({ x: 20, y: 40 });
    }
  });

  it('snapToPort: 5 reruny → ten sam port', () => {
    const ref = snapToPort({ x: 5, y: 3 }, PORTS, 10);
    for (let i = 0; i < 5; i++) {
      expect(snapToPort({ x: 5, y: 3 }, PORTS, 10)).toEqual(ref);
    }
  });
});
