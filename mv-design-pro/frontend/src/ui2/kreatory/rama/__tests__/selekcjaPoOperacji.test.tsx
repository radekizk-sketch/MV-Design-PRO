/**
 * Testy wielokierunkowego wiązania kreatora ze schematem (V12K-073).
 * ZERO fabrykacji: ref i typ elementu pochodzą z `selection_hint`/`changes` backendu.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { DomainOpResponseV1, EnergyNetworkModel } from '../../../../types/enm';
import {
  kanonicznyRefZOperacji,
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

// K9-A (regresja naprawy): wskazanie NIEKANONICZNE (np. ref specyfikacji pola
// w metadanych stacji) wybierane wprost wywalało selekcję i zamykało otwarty
// kreator — selekcja może paść wyłącznie na ref rozwiązywalny w migawce.
describe('kanonicznyRefZOperacji', () => {
  const migawka = {
    header: {} as never,
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    loads: [],
    generators: [
      { id: 'gen-1', ref_id: 'gen-1', name: 'Blok PV', gen_type: 'pv_inverter', bus_ref: 'b-1', p_mw: 0.1, tags: [], meta: {} },
    ],
    substations: [],
    bays: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as unknown as EnergyNetworkModel;

  it('pomija wskazanie niekanoniczne i wybiera utworzony element rozwiązywalny w migawce', () => {
    const r = odpowiedz({
      snapshot: migawka,
      selection_hint: { element_id: 'nn/deadbeef/source_field', element_type: 'bay', zoom_to: true },
      changes: {
        created_element_ids: ['nn/deadbeef/source_field', 'gen-1'],
        updated_element_ids: [],
        deleted_element_ids: [],
      },
    });
    expect(kanonicznyRefZOperacji(r)).toBe('gen-1');
  });

  it('zwraca null, gdy żaden kandydat nie jest rozwiązywalny (bez selekcji zamiast złej selekcji)', () => {
    const r = odpowiedz({
      snapshot: migawka,
      selection_hint: { element_id: 'nn/deadbeef/source_field', element_type: 'bay', zoom_to: true },
      changes: {
        created_element_ids: ['nn/deadbeef/source_field'],
        updated_element_ids: [],
        deleted_element_ids: [],
      },
    });
    expect(kanonicznyRefZOperacji(r)).toBeNull();
  });

  it('bez migawki w odpowiedzi zachowuje dotychczasowe wskazanie', () => {
    const r = odpowiedz({
      selection_hint: { element_id: 'tr-1', element_type: 'transformer', zoom_to: true },
    });
    expect(kanonicznyRefZOperacji(r)).toBe('tr-1');
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
