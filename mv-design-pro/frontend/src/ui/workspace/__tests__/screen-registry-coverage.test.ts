import { describe, expect, it } from 'vitest';

import { CANONICAL_SCREEN_CODES, getScreenDefinition, getScreensByArea } from '../screenCanonRegistry';

const CANONICAL_AREAS = [
  'MODEL_SIECI',
  'SCHEMAT_TOPOLOGIA',
  'STUDIA_OBLICZENIOWE',
  'WYNIKI_ANALIZY',
  'ZABEZPIECZENIA_AUTOMATYKA',
  'ZRODLA_PRZYLACZENIA',
  'KATALOGI_TECHNICZNE',
  'RAPORTY_UZASADNIENIA',
  'HISTORIA_AUDYT',
] as const;

describe('screen registry coverage', () => {
  it('assigns every canonical screen to one of the nine work areas', () => {
    for (const screenId of CANONICAL_SCREEN_CODES) {
      expect(CANONICAL_AREAS).toContain(getScreenDefinition(screenId).areaId);
    }
  });

  it('keeps every work area represented by at least one screen', () => {
    for (const areaId of CANONICAL_AREAS) {
      expect(getScreensByArea(areaId).length).toBeGreaterThan(0);
    }
  });

  it('keeps mandatory advanced-analysis screens under the analysis and connection areas', () => {
    expect(getScreenDefinition('E-26').areaId).toBe('ZRODLA_PRZYLACZENIA');
    expect(getScreenDefinition('E-29').areaId).toBe('WYNIKI_ANALIZY');
    expect(getScreenDefinition('E-30').areaId).toBe('WYNIKI_ANALIZY');
    expect(getScreenDefinition('E-32').areaId).toBe('WYNIKI_ANALIZY');
    expect(getScreenDefinition('E-36').areaId).toBe('RAPORTY_UZASADNIENIA');
    expect(getScreenDefinition('E-37').areaId).toBe('RAPORTY_UZASADNIENIA');
  });

  it('registers V12.6 academic screens without reusing E-35..E-39', () => {
    expect(getScreenDefinition('E-40').labelFull).toContain('harmoniczne');
    expect(getScreenDefinition('E-41').labelFull).toContain('Stabilnosc');
    expect(getScreenDefinition('E-47').areaId).toBe('ZRODLA_PRZYLACZENIA');
    expect(getScreenDefinition('E-50').areaId).toBe('RAPORTY_UZASADNIENIA');
  });
});
