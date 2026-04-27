import { describe, expect, it } from 'vitest';

import {
  SLD_LOD_DEFINITIONS,
  getSldLodLevel,
  mapSldLodToLegacyBand,
  shouldRenderFullApparatus,
} from '../SldLevelOfDetailEngine';

describe('SldLevelOfDetailEngine', () => {
  it('mapuje zoom na kanoniczne poziomy LOD-0..LOD-5', () => {
    expect(getSldLodLevel({ zoom: 0.05 })).toBe('LOD-0');
    expect(getSldLodLevel({ zoom: 0.25 })).toBe('LOD-1');
    expect(getSldLodLevel({ zoom: 0.40 })).toBe('LOD-2');
    expect(getSldLodLevel({ zoom: 0.75 })).toBe('LOD-3');
    expect(getSldLodLevel({ zoom: 1.0 })).toBe('LOD-4');
    expect(getSldLodLevel({ zoom: 1.8 })).toBe('LOD-5');
  });

  it('tryby wynikowy i audytowy mają priorytet nad zoomem', () => {
    expect(getSldLodLevel({ zoom: 0.25, hasActiveResults: true })).toBe('LOD-6');
    expect(getSldLodLevel({ zoom: 0.25, auditActive: true })).toBe('LOD-7');
  });

  it('focus podnosi szczegółowość lokalną bez zmiany geometrii', () => {
    expect(getSldLodLevel({ zoom: 0.05, focusedObject: true })).toBe('LOD-1');
    expect(getSldLodLevel({ zoom: 0.25, focusedObject: true })).toBe('LOD-2');
  });

  it('mapuje nowe LOD na dotychczasowe pasma widoczności dla zgodności renderera', () => {
    expect(mapSldLodToLegacyBand('LOD-0')).toBe('PRZEGLAD');
    expect(mapSldLodToLegacyBand('LOD-3')).toBe('GLOWNE_POLA');
    expect(mapSldLodToLegacyBand('LOD-4')).toBe('SZCZEGOLY');
    expect(mapSldLodToLegacyBand('LOD-7')).toBe('PELNY');
  });

  it('pełna aparatura jest dostępna od LOD-4', () => {
    expect(shouldRenderFullApparatus('LOD-3')).toBe(false);
    expect(shouldRenderFullApparatus('LOD-4')).toBe(true);
    expect(shouldRenderFullApparatus('LOD-7')).toBe(true);
  });

  it('rejestr LOD pokrywa osiem formalnych poziomów', () => {
    expect(SLD_LOD_DEFINITIONS.map((item) => item.level)).toEqual([
      'LOD-0',
      'LOD-1',
      'LOD-2',
      'LOD-3',
      'LOD-4',
      'LOD-5',
      'LOD-6',
      'LOD-7',
    ]);
  });
});
