/**
 * GPZ P0: droga między sekcjami przechodzi PRZEZ PORTY wyłącznika,
 * a nie przez osobny przewód mostkujący styk otwarty.
 * Ten test sprawdza tylko geometrię projekcji, NIE obwody blokad ruchowych.
 */
import { describe, expect, it } from 'vitest';

import { composeGpz, gpzInternalSegmentsEndAtPortsOrBus } from '../gpz';
import type { GpzCanonicalRendererProps } from '../../../v2/renderer/GpzCanonicalRenderer';

function gpz(stan: 'open' | 'closed' | 'unknown'): GpzCanonicalRendererProps {
  return {
    id: 'gpz-test-coupler',
    x: 0,
    y: 0,
    name: 'GPZ TEST',
    transformers: [],
    sections: [
      { sectionId: 'a', order: 1, label: 'A', busVoltageKv: 15, bays: [] },
      { sectionId: 'b', order: 2, label: 'B', busVoltageKv: 15, bays: [] },
    ],
    couplers: [
      {
        couplerId: 'spr',
        leftSectionId: 'a',
        rightSectionId: 'b',
        designation: 'Sprzęgło',
        closedState: stan,
        breakerDeviceRef: 'spr/cb',
      },
    ],
  };
}

describe('GPZ — rzeczywiste zaciski sprzęgła na SldCanvasV3', () => {
  for (const stan of ['open', 'closed', 'unknown'] as const) {
    it(`nie łączy szyn z obejściem wyłącznika przy stanie ${stan}`, () => {
      const composition = composeGpz(gpz(stan), { x: 0, y: 0 });
      const cb = composition.symbols.find((s) => s.meta.testId === 'gpz-canonical-coupler-spr');
      expect(cb?.symbolId).toBe('lineBreaker');
      expect(cb?.state).toBe(stan);
      expect(cb?.deviceRef).toBe('spr/cb');
      const a = cb?.ports.a;
      const b = cb?.ports.b;
      expect(a).toBeDefined();
      expect(b).toBeDefined();

      const west = composition.segments.find((s) => s.ownerRef === 'spr#from-section-a');
      const east = composition.segments.find((s) => s.ownerRef === 'spr#to-section-b');
      expect(west?.points[west.points.length - 1]).toMatchObject({ x: a?.x, y: a?.y });
      expect(east?.points[0]).toMatchObject({ x: b?.x, y: b?.y });
      expect(composition.segments.some((s) => s.ownerRef === 'spr#tie')).toBe(false);
      expect(gpzInternalSegmentsEndAtPortsOrBus(composition)).toBe(true);
    });
  }

  it('brak ref wyłącznika nie zostaje ukryty', () => {
    const props = gpz('unknown');
    const incomplete = { ...props, couplers: props.couplers.map(({ breakerDeviceRef: _ref, ...rest }) => rest) };
    const composition = composeGpz(incomplete, { x: 0, y: 0 });
    expect(composition.missingData).toContain('gpz.coupler.breaker_device_ref_missing');
  });
});
