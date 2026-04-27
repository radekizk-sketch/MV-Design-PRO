/**
 * Testy hook useSldReadabilityOverlay — V12 § 5.7
 *
 * Weryfikuje:
 * - WSZYSTKO + bez szkieletu + PELNY LOD → opacity = 1 dla wszystkich
 * - Filtr TYLKO_ZRODLA → opacity < 1 dla Bus (nie-źródło)
 * - Tryb szkieletowy → opacity obniżone dla Load (nie-szkielet)
 * - LOD PRZEGLAD → opacity = 0 dla Switch (SZCZEGOL)
 * - lodBand jest poprawne dla danego zoom
 * - isSkeletonView odzwierciedla stan magazynu
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSldLayerFiltersStore } from '../sldLayerFiltersStore';
import { useSldReadabilityOverlay } from '../SldReadabilityOverlay';
import type { ViewportState } from '../types';
import type { AnySldSymbol } from '../../sld-editor/types';

const SYMBOLS: AnySldSymbol[] = [
  { id: 'bus', elementType: 'Bus', elementName: 'Bus', position: { x: 0, y: 0 } } as AnySldSymbol,
  { id: 'sw', elementType: 'Switch', elementName: 'Łącznik', position: { x: 0, y: 0 } } as AnySldSymbol,
  { id: 'load', elementType: 'Load', elementName: 'Odbiór', position: { x: 0, y: 0 } } as AnySldSymbol,
  { id: 'src', elementType: 'Source', elementName: 'GPZ', position: { x: 0, y: 0 } } as AnySldSymbol,
];

function makeViewport(zoom: number): ViewportState {
  return { offsetX: 0, offsetY: 0, zoom };
}

describe('useSldReadabilityOverlay', () => {
  beforeEach(() => {
    useSldLayerFiltersStore.getState().resetFilters();
  });

  it('WSZYSTKO + zoom 2.0 (PELNY) → opacity 1 dla wszystkich', () => {
    const { result } = renderHook(() =>
      useSldReadabilityOverlay(SYMBOLS, makeViewport(2.0)),
    );
    expect(result.current.getOpacity('bus', 'Bus')).toBe(1);
    expect(result.current.getOpacity('sw', 'Switch')).toBe(1);
    expect(result.current.getOpacity('load', 'Load')).toBe(1);
  });

  it('LOD PRZEGLAD (zoom 0.3) → Switch opacity 0 (niewidoczny)', () => {
    const { result } = renderHook(() =>
      useSldReadabilityOverlay(SYMBOLS, makeViewport(0.3)),
    );
    expect(result.current.getOpacity('sw', 'Switch')).toBe(0);
    // Bus (SZKIELET) nadal widoczny
    expect(result.current.getOpacity('bus', 'Bus')).toBe(1);
  });

  it('filtr TYLKO_ZRODLA → Bus opacity < 1 (wyciszony)', () => {
    act(() => useSldLayerFiltersStore.getState().setLayerFilter('TYLKO_ZRODLA'));
    const { result } = renderHook(() =>
      useSldReadabilityOverlay(SYMBOLS, makeViewport(2.0)),
    );
    const busOpacity = result.current.getOpacity('bus', 'Bus');
    expect(busOpacity).toBeLessThan(1);
    // Źródło widoczne normalnie
    expect(result.current.getOpacity('src', 'Source')).toBe(1);
  });

  it('tryb szkieletowy → Load opacity bardzo niska', () => {
    act(() => useSldLayerFiltersStore.getState().toggleSkeletonView(true));
    const { result } = renderHook(() =>
      useSldReadabilityOverlay(SYMBOLS, makeViewport(2.0)),
    );
    const loadOpacity = result.current.getOpacity('load', 'Load');
    expect(loadOpacity).toBeLessThan(0.15);
    // Bus (SZKIELET) widoczny normalnie
    expect(result.current.getOpacity('bus', 'Bus')).toBe(1);
  });

  it('lodBand jest poprawne dla danego zoom', () => {
    const { result } = renderHook(() =>
      useSldReadabilityOverlay(SYMBOLS, makeViewport(0.7)),
    );
    expect(result.current.lodBand).toBe('GLOWNE_POLA');
  });

  it('isSkeletonView odzwierciedla stan magazynu', () => {
    act(() => useSldLayerFiltersStore.getState().toggleSkeletonView(true));
    const { result } = renderHook(() =>
      useSldReadabilityOverlay(SYMBOLS, makeViewport(1.0)),
    );
    expect(result.current.isSkeletonView).toBe(true);
  });
});
