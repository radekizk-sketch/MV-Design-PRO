import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';

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

vi.mock('../../selection', () => ({
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

  it('pokazuje wyłącznik pola SN jako aparat, bez inspektora odcinka', () => {
    render(<InspectorEngineeringView />);

    expect(screen.getByText('Katalog aparatu')).toBeInTheDocument();
    expect(screen.getByText('Rodzaj aparatu')).toBeInTheDocument();
    expect(screen.getByText('Wyłącznik')).toBeInTheDocument();
    expect(screen.queryByTestId('sld-segment-inspector')).not.toBeInTheDocument();
  });
});
