import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';

const openOperationForm = vi.fn();
const openRouteSurface = vi.fn();
const executeDomainOperation = vi.fn();

const fakeFieldItems = Array.from({ length: 5 }, (_, index) => ({
  bay_id: `template-bay-${index + 1}`,
  bay_ref: `template-bay-${index + 1}`,
  bay_name: `Pole szablonu ${index + 1}`,
  canonical_model: {
    base_model: {
      substation_ref: 'st-no-bays',
      gpz_section_id: null,
    },
  },
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: unknown) => unknown) =>
    selector({ openOperationForm, openRouteSurface }),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: unknown) => unknown) =>
    selector({
      selectedElements: [{ id: 'st-no-bays', type: 'Station', name: 'Stacja testowa' }],
    }),
}));

// JEDNA prawda gotowosci (KD-1 / V12K-286): inspektor czyta problemy przez
// `gotowoscAdapter` z `useSnapshotStore.readiness`, wiec scena zasila TO pole
// (dawna atrapa `readinessLiveStore` byla osobnym, nigdy nieodswiezanym zrodlem).
vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: unknown) => unknown) =>
    selector({
      snapshot: {
        buses: [
          { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
          { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
        ],
        branches: [],
        transformers: [],
        sources: [],
        loads: [
          { ref_id: 'load-1', name: 'Odbiór nN 1', bus_ref: 'bus-nn', p_mw: 0.03, q_mvar: 0, model: 'pq' },
          { ref_id: 'load-2', name: 'Odbiór nN 2', bus_ref: 'bus-nn', p_mw: 0.05, q_mvar: 0, model: 'pq' },
        ],
        generators: [
          {
            ref_id: 'pv-1',
            name: 'Blok PV 1',
            bus_ref: 'bus-nn',
            p_mw: 0.4,
            q_mvar: 0,
            gen_type: 'pv_inverter',
            station_ref: 'st-no-bays',
            catalog_ref: 'pv-inverter-400kw',
          },
          {
            ref_id: 'bess-1',
            name: 'Magazyn energii 1',
            bus_ref: 'bus-nn',
            p_mw: 0.2,
            q_mvar: 0,
            gen_type: 'bess',
            station_ref: 'st-no-bays',
            catalog_ref: 'bess-200kw',
          },
        ],
        substations: [
          {
            id: 'st-no-bays',
            ref_id: 'st-no-bays',
            name: 'Stacja testowa',
            station_type: 'mv_lv',
            bus_refs: ['bus-sn', 'bus-nn'],
            transformer_refs: [],
            meta: {
              nn_field_specs: [
                { field_ref: 'feeder-1', bay_role: 'FEEDER', bus_ref: 'bus-nn' },
                { field_ref: 'feeder-2', bay_role: 'FEEDER', bus_ref: 'bus-nn' },
              ],
            },
          },
        ],
        bays: [],
      },
      logicalViews: null,
      executeDomainOperation,
      readiness: readinessZListy([]),
      fixActions: [],
    }),
}));


vi.mock('../../field/useFieldReadModel', () => ({
  useFieldReadModel: () => ({
    data: { fields: fakeFieldItems },
    itemsByBayRef: new Map(fakeFieldItems.map((item) => [item.bay_ref, item])),
    itemsByBayId: new Map(),
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: unknown) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT', activeCaseId: 'case-1' }),
}));

describe('InspectorEngineeringView - struktura stacji', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    openRouteSurface.mockReset();
    executeDomainOperation.mockReset();
  });

  it('opisuje rozdzielnicę SN liczbą pól z read-modelu, gdy snapshot nie ma osobnych pól', () => {
    render(<InspectorEngineeringView />);

    expect(screen.getAllByText('Stacja testowa').length).toBeGreaterThan(0);
    expect(screen.getByTestId('engineering-field-nn_feeders')).toHaveTextContent(/Rozdzielnica nN\s*2 odpływów nN/);
    expect(screen.getByTestId('engineering-field-nn_loads')).toHaveTextContent(/Odbiory nN\s*2 odbiorów \/ 80 kW/);
    expect(screen.getByTestId('engineering-field-der_sources')).toHaveTextContent(/Układy PV\/BESS\/FW\s*PV 1 szt\. \/ 0,4 MW; BESS 1 szt\. \/ 0,2 MW/);
    expect(screen.getByTestId('engineering-field-bay_count')).toHaveTextContent(/Rozdzielnica SN\s*5 pól SN/);
  });
});
