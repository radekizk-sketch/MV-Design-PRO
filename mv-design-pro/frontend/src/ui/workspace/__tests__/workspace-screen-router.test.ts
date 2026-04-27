import { describe, expect, it } from 'vitest';

import { CANONICAL_SCREEN_CODES, getScreenDefinition } from '../screenCanonRegistry';
import { SCREEN_MATRIX, SCREEN_TRANSITIONS, SURFACE_REGISTRY } from '../types';

describe('workspace screen router canon', () => {
  it('derives surface titles from screenCanonRegistry', () => {
    for (const screenId of CANONICAL_SCREEN_CODES) {
      expect(SURFACE_REGISTRY[screenId].titlePl).toBe(getScreenDefinition(screenId).labelFull);
      expect(SCREEN_MATRIX[screenId].titlePl).toBe(getScreenDefinition(screenId).labelFull);
    }
  });

  it('has a transition policy for every canonical screen', () => {
    expect(Object.keys(SCREEN_TRANSITIONS).sort()).toEqual([...CANONICAL_SCREEN_CODES].sort());
  });

  it('does not keep old active meanings for E-26, E-27, E-30 and E-31', () => {
    expect(getScreenDefinition('E-26').labelFull).toBe('Charakterystyki FRT/LVRT/HVRT');
    expect(getScreenDefinition('E-27').labelFull).toBe('Zabezpieczenia i automatyka');
    expect(getScreenDefinition('E-30').labelFull).toBe('Rozpływ mocy');
    expect(getScreenDefinition('E-31').labelFull).toBe('Stan fazowy SN');
    expect(getScreenDefinition('E-37').labelFull).toBe('Raporty OSD i audytowe');
    expect(getScreenDefinition('E-38').labelFull).toBe('Katalogi techniczne');
  });
});
