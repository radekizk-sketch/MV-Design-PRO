/**
 * Testy wielokierunkowego wiązania kreatora ze schematem (V12K-073).
 * ZERO fabrykacji: ref i typ elementu pochodzą z `selection_hint`/`changes` backendu.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { DomainOpResponseV1 } from '../../../../types/enm';
import {
  mapujTypElementu,
  refZOperacji,
  useSelekcjaPoOperacji,
} from '../selekcjaPoOperacji';

const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (
    selector: (s: {
      selectElement: typeof selectElementMock;
      centerSldOnElement: typeof centerSldOnElementMock;
    }) => unknown,
  ) => selector({ selectElement: selectElementMock, centerSldOnElement: centerSldOnElementMock }),
}));

function odpowiedz(overrides: Partial<DomainOpResponseV1>): DomainOpResponseV1 {
  return {
    snapshot: null,
    logical_views: {} as DomainOpResponseV1['logical_views'],
    readiness: { ready: true, blockers: [], warnings: [] } as DomainOpResponseV1['readiness'],
    fix_actions: [],
    changes: { created_element_ids: [], updated_element_ids: [], deleted_element_ids: [] },
    selection_hint: null,
    audit_trail: [],
    domain_events: [],
    materialized_params: {} as DomainOpResponseV1['materialized_params'],
    layout: { layout_hash: '', layout_version: '1.0' },
    ...overrides,
  };
}

describe('mapujTypElementu', () => {
  it('mapuje słownik domenowy backendu na ElementType prezentacji', () => {
    expect(mapujTypElementu('transformer', 'Bus')).toBe('TransformerBranch');
    expect(mapujTypElementu('switch', 'Bus')).toBe('Switch');
    expect(mapujTypElementu('branch', 'Bus')).toBe('LineBranch');
    expect(mapujTypElementu('substation', 'Bus')).toBe('Station');
    expect(mapujTypElementu('bay', 'Bus')).toBe('BaySN');
    expect(mapujTypElementu('generator', 'Bus')).toBe('Generator');
    expect(mapujTypElementu('load', 'Bus')).toBe('Load');
  });

  it('używa fallbacku, gdy backend nie poda typu lub jest nieznany', () => {
    expect(mapujTypElementu(null, 'LoadNN')).toBe('LoadNN');
    expect(mapujTypElementu(undefined, 'NOP')).toBe('NOP');
    expect(mapujTypElementu('cos_nieznanego', 'Station')).toBe('Station');
  });
});

describe('refZOperacji', () => {
  it('preferuje selection_hint.element_id', () => {
    const r = odpowiedz({
      selection_hint: { element_id: 'tr-1', element_type: 'transformer', zoom_to: true },
      changes: { created_element_ids: ['x-9'], updated_element_ids: [], deleted_element_ids: [] },
    });
    expect(refZOperacji(r)).toBe('tr-1');
  });

  it('spada na pierwszy created_element_id, gdy brak hintu', () => {
    const r = odpowiedz({
      changes: { created_element_ids: ['bay-7'], updated_element_ids: [], deleted_element_ids: [] },
    });
    expect(refZOperacji(r)).toBe('bay-7');
  });

  it('zwraca null dla braku odpowiedzi lub braku elementu', () => {
    expect(refZOperacji(null)).toBeNull();
    expect(refZOperacji(odpowiedz({}))).toBeNull();
  });
});

describe('useSelekcjaPoOperacji', () => {
  beforeEach(() => {
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  it('zaznacza nowy element (typ z backendu), centruje SLD i nawiguje', () => {
    const { result } = renderHook(() => useSelekcjaPoOperacji());
    const r = odpowiedz({
      selection_hint: { element_id: 'tr-1', element_type: 'transformer', zoom_to: true },
    });
    result.current(r, { type: 'Bus', name: 'TR SN/nN' });

    expect(selectElementMock).toHaveBeenCalledWith({
      id: 'tr-1',
      type: 'TransformerBranch',
      name: 'TR SN/nN',
    });
    expect(centerSldOnElementMock).toHaveBeenCalledWith('tr-1');
    expect(navigateToSldMock).toHaveBeenCalled();
  });

  it('używa fallbacku typu/nazwy przy braku hintu (ref z created_ids)', () => {
    const { result } = renderHook(() => useSelekcjaPoOperacji());
    const r = odpowiedz({
      changes: { created_element_ids: ['load-3'], updated_element_ids: [], deleted_element_ids: [] },
    });
    result.current(r, { type: 'LoadNN', name: 'Odbiór nN' });

    expect(selectElementMock).toHaveBeenCalledWith({
      id: 'load-3',
      type: 'LoadNN',
      name: 'Odbiór nN',
    });
    expect(navigateToSldMock).toHaveBeenCalled();
  });

  it('bez elementu — nawiguje do SLD, nic nie zaznacza', () => {
    const { result } = renderHook(() => useSelekcjaPoOperacji());
    result.current(null, { type: 'Bus', name: 'x' });

    expect(selectElementMock).not.toHaveBeenCalled();
    expect(centerSldOnElementMock).not.toHaveBeenCalled();
    expect(navigateToSldMock).toHaveBeenCalled();
  });
});
