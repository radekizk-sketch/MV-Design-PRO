import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';

/** Karta FAB-J: patrz komentarz w `InspectorEngineeringView.test.tsx`. */
function render(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const openOperationForm = vi.fn();
const openRouteSurface = vi.fn();

const snapshot = {
  buses: [
    {
      ref_id: 'bus-sn-1',
      name: 'Szyna SN 1',
      voltage_kv: 15,
    },
  ],
  branches: [
    {
      id: 'brk-1',
      ref_id: 'stn/1/sn_field_breaker/000',
      name: 'Wyłącznik pola SN 1',
      type: 'breaker',
      status: 'closed',
      from_bus_ref: 'bus-sn-1',
      to_bus_ref: 'bus-sn-1',
      catalog_ref: null,
      catalog_namespace: 'APARAT_SN',
    },
  ],
  branch_points: [],
  transformers: [],
  sources: [],
  substation: [],
  substations: [],
  bays: [],
  generators: [],
  loads: [],
};

let mockSelectedElements: Array<{ id: string; type: string; name: string }> = [];

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: {
    openOperationForm: typeof openOperationForm;
    openRouteSurface: typeof openRouteSurface;
  }) => unknown) =>
    selector({ openOperationForm, openRouteSurface }),
}));

// Inspektor czyta selekcję przez indeks pakietu, panel z kanwy (karta techniczna, kontekst
// aparatu) — wprost ze sklepu; obie ścieżki widzą TĘ SAMĄ selekcję.
vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: typeof mockSelectedElements }) => unknown) =>
    selector({ selectedElements: mockSelectedElements }),
}));

vi.mock('../../selection/store', () => ({
  useSelectionStore: (selector: (state: { selectedElements: typeof mockSelectedElements }) => unknown) =>
    selector({ selectedElements: mockSelectedElements }),
}));

// JEDNA prawda gotowosci (KD-1 / V12K-286): inspektor czyta problemy przez
// `gotowoscAdapter` z `useSnapshotStore.readiness`, wiec scena zasila TO pole
// (dawna atrapa `readinessLiveStore` byla osobnym, nigdy nieodswiezanym zrodlem).
vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot,
      logicalViews: null,
      executeDomainOperation: vi.fn(),
      readiness: readinessZListy([]),
      fixActions: [],
    }),
}));


vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    data: { fields: [] },
    itemsByBayRef: new Map(),
    itemsByBayId: new Map(),
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeMode: string; activeCaseId: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT', activeCaseId: 'case-1' }),
}));

describe('InspectorEngineeringView - backendowe gałęzie aparatów SN', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    openRouteSurface.mockReset();
    mockSelectedElements = [{
      id: 'stn/1/sn_field_breaker/000',
      type: 'Switch',
      name: 'Wyłącznik pola SN 1',
    }];
  });

  // Selekcja gałęzi wyłącznika spoza kanwy (drzewo, wyszukiwarka): temat kotwicy `galaz`
  // ma kategorię menu aparatu, więc karta techniczna też musi być kartą aparatu (łącznika
  // toru), nie „Odcinkiem kablowym" z trasą i katalogiem kabla. Do tej poprawki test
  // sprawdzał niewidoczne sekcje widoku — panel czytał selekcję z niezamockowanego sklepu —
  // i nie widział, że karta pokazywała wyłącznik jako odcinek.
  it('pokazuje wyłącznik pola SN jako aparat, bez inspektora odcinka', () => {
    render(<InspectorEngineeringView />);

    expect(screen.getByTestId('inspektor-karta')).toHaveAttribute('data-rodzaj-karty', 'lacznik');
    expect(screen.getByTestId('inspektor-karta-wartosc-rodzaj')).toHaveTextContent('Wyłącznik');
    expect(screen.queryByTestId('inspektor-karta-pole-dlugosc')).not.toBeInTheDocument();
    expect(screen.getByTestId('inspektor-element-rodzaj')).not.toHaveTextContent(/Odcinek/);
    expect(screen.queryByTestId('sld-segment-inspector')).not.toBeInTheDocument();
  });
});
