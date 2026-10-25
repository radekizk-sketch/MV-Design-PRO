import { describe, expect, it } from 'vitest';

import { gpzSwitchFrameOf, isGpzSwitchApparatus } from '../SldCanvasV3';
import type { PreviewSymbol } from '../../compose/preview';

function aparat(state: PreviewSymbol['state'], parityKeys: string[] = ['gpz.coupler', 'gpz.apparatus.cb']): PreviewSymbol {
  return {
    symbolId: 'lineBreaker',
    x: 24,
    y: 48,
    state,
    meta: { parityKeys, deviceRef: 'spr/cb', ownerRef: 'spr' },
  };
}

describe('GPZ — QET-SCADA Frame, dwa stany i odmowa trzeciego', () => {
  it('zamknięty — czerwona ramka, zgodny gabaryt i stałe zaciski', () => {
    const frame = gpzSwitchFrameOf(aparat('closed'));
    expect(frame).toMatchObject({ x: 20, y: 44, width: 24, height: 24, stroke: '#F05260' });
  });

  it('otwarty — zielona ramka, bez zmiany położenia', () => {
    const frame = gpzSwitchFrameOf(aparat('open'));
    expect(frame).toMatchObject({ x: 20, y: 44, width: 24, height: 24, stroke: '#2CCF93' });
  });

  it('brak/awaria — zero ramki, osobna walidacja', () => {
    expect(gpzSwitchFrameOf(aparat('unknown'))).toBeNull();
    expect(gpzSwitchFrameOf(aparat(undefined))).toBeNull();
  });

  it('wynik solvera i CT/VT nie otrzymują ramek położenia', () => {
    expect(isGpzSwitchApparatus(aparat('closed', ['gpz.bus.sn']))).toBe(false);
    expect(gpzSwitchFrameOf({
      symbolId: 'currentTransformer',
      x: 0,
      y: 0,
      meta: { parityKeys: ['gpz.apparatus.ct'] },
    })).toBeNull();
  });
});
