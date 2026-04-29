import { describe, expect, it } from 'vitest';
import { computeLayout } from '../index';
import type { LayoutSymbol } from '../types';

function createBusWithTerminals(terminals: LayoutSymbol[]): LayoutSymbol[] {
  return [
    {
      id: 'bus',
      elementId: 'bus',
      elementType: 'Bus',
      elementName: 'Main bus',
      voltageKV: 15,
      inService: true,
    },
    ...terminals,
  ];
}

describe('phase2 bay detection classification', () => {
  it('does not infer bay type from terminal labels', () => {
    const symbols = createBusWithTerminals([
      {
        id: 'load_keywords',
        elementId: 'load_keywords',
        elementType: 'Load',
        elementName: 'PV BESS WIND generator capacitor aux measurement',
        voltageKV: 15,
        connectedToNodeId: 'bus',
        inService: true,
      },
      {
        id: 'generator_keywords',
        elementId: 'generator_keywords',
        elementType: 'Generator',
        elementName: 'PV BESS WIND generator label only',
        voltageKV: 15,
        connectedToNodeId: 'bus',
        inService: true,
      },
    ]);

    const result = computeLayout({ symbols });
    const loadBay = result.bays.find((bay) =>
      bay.elements.some((element) => element.symbolId === 'load_keywords')
    );
    const generatorBay = result.bays.find((bay) =>
      bay.elements.some((element) => element.symbolId === 'generator_keywords')
    );

    expect(loadBay?.bayType).toBe('feeder');
    expect(generatorBay?.bayType).toBe('feeder');
    expect(result.bays.map((bay) => bay.bayType)).not.toContain('oze_pv');
    expect(result.bays.map((bay) => bay.bayType)).not.toContain('oze_wind');
    expect(result.bays.map((bay) => bay.bayType)).not.toContain('bess');
    expect(result.bays.map((bay) => bay.bayType)).not.toContain('capacitor');
    expect(result.bays.map((bay) => bay.bayType)).not.toContain('auxiliary');
    expect(result.bays.map((bay) => bay.bayType)).not.toContain('measurement');
    expect(result.bays.map((bay) => bay.bayType)).not.toContain('generator');
  });

  it('still uses explicit generatorType semantics', () => {
    const symbols = createBusWithTerminals([
      {
        id: 'pv_generator',
        elementId: 'pv_generator',
        elementType: 'Generator',
        elementName: 'Label is intentionally generic',
        voltageKV: 15,
        generatorType: 'PV',
        connectedToNodeId: 'bus',
        inService: true,
      },
    ]);

    const result = computeLayout({ symbols });

    expect(result.bays.find((bay) =>
      bay.elements.some((element) => element.symbolId === 'pv_generator')
    )?.bayType).toBe('oze_pv');
  });
});
