/**
 * Testy magazynu filtrów warstwowych SLD — V12 § 5.7
 *
 * Weryfikuje:
 * - Stan domyślny: WSZYSTKO, skeletonView=false
 * - Zmiana filtra aktualizuje magazyn
 * - Filtr nie mutuje modelu (tylko stan widoczności)
 * - Tryb szkieletowy jest niezależny od filtra
 * - elementMatchesLayerFilter działa deterministycznie
 * - isElementInSkeletonView zwraca poprawne wartości
 * - resetFilters przywraca stan domyślny
 * - Brak zakazanych terminów w etykietach
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useSldLayerFiltersStore,
  elementMatchesLayerFilter,
  isElementInSkeletonView,
  SLD_LAYER_FILTER_LABELS_PL,
  SLD_LAYER_FILTERS,
} from '../sldLayerFiltersStore';

const FORBIDDEN_TERMS = ['PCC', 'Boundary', 'Connection Point', 'snapshot', 'proof', 'fallback', 'feeder', 'branch', 'wizard', 'legacy'];

describe('useSldLayerFiltersStore', () => {
  beforeEach(() => {
    useSldLayerFiltersStore.getState().resetFilters();
  });

  it('domyślny stan: layerFilter=WSZYSTKO, skeletonView=false', () => {
    const { result } = renderHook(() => useSldLayerFiltersStore());
    expect(result.current.layerFilter).toBe('WSZYSTKO');
    expect(result.current.skeletonView).toBe(false);
  });

  it('setLayerFilter zmienia filtr', () => {
    const { result } = renderHook(() => useSldLayerFiltersStore());
    act(() => result.current.setLayerFilter('TYLKO_ZRODLA'));
    expect(result.current.layerFilter).toBe('TYLKO_ZRODLA');
  });

  it('toggleSkeletonView przełącza tryb szkieletowy', () => {
    const { result } = renderHook(() => useSldLayerFiltersStore());
    act(() => result.current.toggleSkeletonView());
    expect(result.current.skeletonView).toBe(true);
    act(() => result.current.toggleSkeletonView());
    expect(result.current.skeletonView).toBe(false);
  });

  it('toggleSkeletonView(true) wymusza wartość', () => {
    const { result } = renderHook(() => useSldLayerFiltersStore());
    act(() => result.current.toggleSkeletonView(true));
    expect(result.current.skeletonView).toBe(true);
    act(() => result.current.toggleSkeletonView(true));
    expect(result.current.skeletonView).toBe(true);
  });

  it('skeletonView i layerFilter są niezależnymi osiami', () => {
    const { result } = renderHook(() => useSldLayerFiltersStore());
    act(() => {
      result.current.setLayerFilter('TYLKO_NN');
      result.current.toggleSkeletonView(true);
    });
    expect(result.current.layerFilter).toBe('TYLKO_NN');
    expect(result.current.skeletonView).toBe(true);
  });

  it('resetFilters przywraca stan domyślny', () => {
    const { result } = renderHook(() => useSldLayerFiltersStore());
    act(() => {
      result.current.setLayerFilter('TYLKO_ZABEZPIECZENIA');
      result.current.toggleSkeletonView(true);
    });
    act(() => result.current.resetFilters());
    expect(result.current.layerFilter).toBe('WSZYSTKO');
    expect(result.current.skeletonView).toBe(false);
  });
});

describe('elementMatchesLayerFilter', () => {
  it('WSZYSTKO: wszystkie typy pasują', () => {
    expect(elementMatchesLayerFilter('Bus', 'WSZYSTKO')).toBe(true);
    expect(elementMatchesLayerFilter('Load', 'WSZYSTKO')).toBe(true);
    expect(elementMatchesLayerFilter('Switch', 'WSZYSTKO')).toBe(true);
  });

  it('TYLKO_GOTOWOSC: pasuje gdy hasReadinessIssue=true', () => {
    expect(elementMatchesLayerFilter('Bus', 'TYLKO_GOTOWOSC', false)).toBe(false);
    expect(elementMatchesLayerFilter('Bus', 'TYLKO_GOTOWOSC', true)).toBe(true);
    expect(elementMatchesLayerFilter('Load', 'TYLKO_GOTOWOSC', true)).toBe(true);
  });

  it('TYLKO_ZRODLA: pasuje tylko typy źródeł', () => {
    expect(elementMatchesLayerFilter('Source', 'TYLKO_ZRODLA')).toBe(true);
    expect(elementMatchesLayerFilter('PVInverter', 'TYLKO_ZRODLA')).toBe(true);
    expect(elementMatchesLayerFilter('Bus', 'TYLKO_ZRODLA')).toBe(false);
    expect(elementMatchesLayerFilter('Load', 'TYLKO_ZRODLA')).toBe(false);
  });

  it('TYLKO_NN: pasuje tylko typy nN', () => {
    expect(elementMatchesLayerFilter('BusNN', 'TYLKO_NN')).toBe(true);
    expect(elementMatchesLayerFilter('FeederNN', 'TYLKO_NN')).toBe(true);
    expect(elementMatchesLayerFilter('Bus', 'TYLKO_NN')).toBe(false);
    expect(elementMatchesLayerFilter('Source', 'TYLKO_NN')).toBe(false);
  });

  it('TYLKO_ZABEZPIECZENIA: pasuje tylko typy zabezpieczeń', () => {
    expect(elementMatchesLayerFilter('Relay', 'TYLKO_ZABEZPIECZENIA')).toBe(true);
    expect(elementMatchesLayerFilter('Measurement', 'TYLKO_ZABEZPIECZENIA')).toBe(true);
    expect(elementMatchesLayerFilter('Bus', 'TYLKO_ZABEZPIECZENIA')).toBe(false);
  });

  it('jest deterministyczna — ten sam input → ten sam wynik', () => {
    const r1 = elementMatchesLayerFilter('Source', 'TYLKO_ZRODLA');
    const r2 = elementMatchesLayerFilter('Source', 'TYLKO_ZRODLA');
    expect(r1).toBe(r2);
  });
});

describe('isElementInSkeletonView', () => {
  it('Bus, Station, ZKSN, BranchPole, Source należą do szkieletu', () => {
    expect(isElementInSkeletonView('Bus')).toBe(true);
    expect(isElementInSkeletonView('Station')).toBe(true);
    expect(isElementInSkeletonView('ZKSN')).toBe(true);
    expect(isElementInSkeletonView('BranchPole')).toBe(true);
    expect(isElementInSkeletonView('Source')).toBe(true);
  });

  it('Load, Switch, Measurement NIE należą do szkieletu', () => {
    expect(isElementInSkeletonView('Load')).toBe(false);
    expect(isElementInSkeletonView('Switch')).toBe(false);
    expect(isElementInSkeletonView('Measurement')).toBe(false);
    expect(isElementInSkeletonView('Earthing')).toBe(false);
  });
});

describe('Etykiety filtrów — brak zakazanych terminów', () => {
  it('SLD_LAYER_FILTER_LABELS_PL nie zawierają zakazanych terminów', () => {
    for (const filter of SLD_LAYER_FILTERS) {
      const label = SLD_LAYER_FILTER_LABELS_PL[filter];
      for (const term of FORBIDDEN_TERMS) {
        expect(label.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  });
});
