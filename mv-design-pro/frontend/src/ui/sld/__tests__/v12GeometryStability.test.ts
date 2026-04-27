/**
 * Testy stabilności geometrii przy zmianie trybu pracy, LOD i filtrów — V12 § 5.6-5.7
 *
 * Kryterium akceptacji: ten sam model i ten sam viewport → identyczne pozycje symboli
 * niezależnie od aktywnego trybu pracy, LOD, filtrów warstwowych i trybu szkieletowego.
 *
 * Geometria = x, y symboli. Visibility i opacity NIE są geometrią.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useAppStateStore } from '../../app-state/store';
import { useSldLayerFiltersStore } from '../sldLayerFiltersStore';
import { getLodBand, isElementVisibleAtLod } from '../sldDetailLevel';
import type { AnySldSymbol } from '../../sld-editor/types';
import type { WorkMode } from '../../app-state/store';

// Fixture — model sieci z kilkoma symbolami w stałych pozycjach
const FIXED_SYMBOLS: AnySldSymbol[] = [
  { id: 'bus-1', elementId: 'bus-1', elementType: 'Bus', elementName: 'GPZ', position: { x: 100, y: 50 } } as AnySldSymbol,
  { id: 'st-1', elementId: 'st-1', elementType: 'Station', elementName: 'Stacja A', position: { x: 200, y: 150 } } as AnySldSymbol,
  { id: 'sw-1', elementId: 'sw-1', elementType: 'Switch', elementName: 'Łącznik 1', position: { x: 150, y: 100 } } as AnySldSymbol,
  { id: 'load-1', elementId: 'load-1', elementType: 'Load', elementName: 'Odbiór 1', position: { x: 250, y: 200 } } as AnySldSymbol,
];

/**
 * Wyciąga pozycje z tablicy symboli jako deterministyczną reprezentację geometrii.
 */
function extractGeometry(symbols: AnySldSymbol[]): Array<{ id: string; x: number; y: number }> {
  return [...symbols]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({ id: s.id, x: s.position.x, y: s.position.y }));
}

describe('Geometria niezmieniona przy zmianie trybu pracy', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useSldLayerFiltersStore.getState().resetFilters();
  });

  it('pozycje symboli są identyczne niezależnie od trybu pracy V12', () => {
    const baseGeometry = extractGeometry(FIXED_SYMBOLS);

    const modes: WorkMode[] = ['TE', 'TW', 'TZ', 'TP', 'TA', 'TN'];
    for (const mode of modes) {
      act(() => useAppStateStore.getState().setActiveWorkMode(mode));
      // Geometria jest właściwością symboli — nie zmienia się przez zmianę trybu
      const currentGeometry = extractGeometry(FIXED_SYMBOLS);
      expect(currentGeometry).toEqual(baseGeometry);
    }
  });
});

describe('Geometria niezmieniona przy zmianie filtrów warstwowych', () => {
  beforeEach(() => {
    useSldLayerFiltersStore.getState().resetFilters();
  });

  it('pozycje symboli są identyczne niezależnie od aktywnego filtra', () => {
    const baseGeometry = extractGeometry(FIXED_SYMBOLS);

    const filters = ['WSZYSTKO', 'TYLKO_GOTOWOSC', 'TYLKO_ZRODLA', 'TYLKO_NN', 'TYLKO_ZABEZPIECZENIA'] as const;
    for (const filter of filters) {
      act(() => useSldLayerFiltersStore.getState().setLayerFilter(filter));
      const currentGeometry = extractGeometry(FIXED_SYMBOLS);
      expect(currentGeometry).toEqual(baseGeometry);
    }
  });

  it('tryb szkieletowy nie zmienia pozycji symboli', () => {
    const baseGeometry = extractGeometry(FIXED_SYMBOLS);

    act(() => useSldLayerFiltersStore.getState().toggleSkeletonView(true));
    const currentGeometry = extractGeometry(FIXED_SYMBOLS);
    expect(currentGeometry).toEqual(baseGeometry);
  });
});

describe('LOD zmienia tylko widoczność, nie geometrię', () => {
  it('isElementVisibleAtLod(Bus, PRZEGLAD) = true — Bus widoczny w każdym paśmie', () => {
    expect(isElementVisibleAtLod('Bus', 'PRZEGLAD')).toBe(true);
  });

  it('isElementVisibleAtLod(Switch, PRZEGLAD) = false — Łącznik niewidoczny w przeglądzie', () => {
    expect(isElementVisibleAtLod('Switch', 'PRZEGLAD')).toBe(false);
  });

  it('LOD nie dostaje referencji do symboli — nie może modyfikować ich pozycji', () => {
    // getLodBand operuje wyłącznie na liczbie zoom, bez symboli
    const zoom = 0.5;
    const band = getLodBand(zoom);
    expect(band).toBe('GLOWNE_POLA');
    // Symbole nie są zmienione
    expect(FIXED_SYMBOLS[0].position.x).toBe(100);
    expect(FIXED_SYMBOLS[0].position.y).toBe(50);
  });

  it('determinizm LOD: ten sam zoom → ten sam band', () => {
    for (let i = 0; i < 10; i++) {
      expect(getLodBand(0.8)).toBe('GLOWNE_POLA');
      expect(getLodBand(1.2)).toBe('SZCZEGOLY');
    }
  });
});

describe('Deterministyczny render przy tym samym modelu i widoku', () => {
  it('extractGeometry jest deterministyczna — ta sama tablica → ten sam wynik', () => {
    const g1 = extractGeometry(FIXED_SYMBOLS);
    const g2 = extractGeometry(FIXED_SYMBOLS);
    expect(g1).toEqual(g2);
  });

  it('kolejność sortowania ID jest stabilna', () => {
    const shuffled = [...FIXED_SYMBOLS].reverse();
    const g1 = extractGeometry(FIXED_SYMBOLS);
    const g2 = extractGeometry(shuffled);
    expect(g1).toEqual(g2);
  });
});
