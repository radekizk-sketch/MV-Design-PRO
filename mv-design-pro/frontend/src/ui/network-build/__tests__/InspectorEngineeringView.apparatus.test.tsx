import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InspectorEngineeringView } from '../InspectorEngineeringView';
import { readinessZListy } from '../../../test/gotowoscTestUtils';

const openOperationForm = vi.fn();

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
  substations: [
    {
      id: 'stn/teststation/station',
      ref_id: 'stn/teststation/station',
      name: 'Stacja inline',
      station_type: 'inline',
      bus_refs: ['bus-sn-1'],
      transformer_refs: [],
    },
  ],
  bays: [
    {
      id: 'bay-1',
      ref_id: 'bay_ref_1',
      name: 'Pole liniowe 1',
      bay_role: 'OUT',
      substation_ref: 'gpz-1',
      bus_ref: 'bus-sn-1',
      equipment_refs: [],
    },
  ],
  generators: [],
  loads: [],
};

let mockSelectedElements: Array<{ id: string; type: string; name: string }> = [];
let mockReadinessIssues: Array<{
  severity: string;
  element_ref: string | null;
  element_refs: string[];
  message_pl: string;
}> = [];

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: { openOperationForm: typeof openOperationForm }) => unknown) =>
    selector({ openOperationForm }),
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
      readiness: readinessZListy(mockReadinessIssues),
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
  useAppStateStore: (selector: (state: { activeMode: string }) => unknown) =>
    selector({ activeMode: 'MODEL_EDIT' }),
}));

describe('InspectorEngineeringView - aparaty pola SN', () => {
  beforeEach(() => {
    openOperationForm.mockReset();
    mockReadinessIssues = [];
  });

  it('pokazuje właściwości klikniętego wyłącznika SN w prawym panelu', () => {
    mockSelectedElements = [{
      id: 'bay_ref_1#breaker',
      type: 'Switch',
      name: 'Wyłącznik SN - Pole liniowe 1',
    }];

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Parametry aparatu')).toBeInTheDocument();
    expect(screen.getByText('Wyłącznik SN')).toBeInTheDocument();
    expect(screen.getByText('Łączenie robocze i zwarciowe pola')).toBeInTheDocument();
    expect(screen.getByText('Pole liniowe 1')).toBeInTheDocument();
    expect(screen.queryByText('Zaznacz element na SLD')).not.toBeInTheDocument();
  });

  it('udostępnia wyprowadzenie ciągu wyłącznie z głowicy odpływowej pola SN', () => {
    mockSelectedElements = [{
      id: 'bay_ref_1#cable_head',
      type: 'Switch',
      name: 'Głowica kablowa / port odpływowy - Pole liniowe 1',
    }];

    render(<InspectorEngineeringView />);

    expect(screen.getByText('Wyprowadzenie sieci SN')).toBeInTheDocument();
    expect(screen.getByText('Wyprowadź ciąg główny z głowicy')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Wyprowadź ciąg główny z głowicy'));

    expect(openOperationForm).toHaveBeenCalledWith(
      'continue_trunk_segment_sn',
      expect.objectContaining({
        field_ref: 'bay_ref_1',
        bay_ref: 'bay_ref_1',
        terminal_name: expect.stringContaining('Głowica kablowa'),
      }),
    );
  });

  it('pokazuje kartę techniczną aparatu z wewnętrznego SLD stacji bez surowych referencji', () => {
    mockSelectedElements = [{
      id: 'stn/teststation/station/internal-bay/tr-3/fuse',
      type: 'Switch',
      name: 'Bezpiecznik - Pole transformatorowe SN, S01 · Stacja przelotowa',
    }];

    render(<InspectorEngineeringView />);

    expect(screen.queryByText('Zaznacz element na SLD')).not.toBeInTheDocument();
    expect(screen.getAllByText('Bezpiecznik - Pole transformatorowe SN, S01 · Stacja przelotowa').length).toBeGreaterThan(0);
    expect(screen.getByText('Miejsce w układzie')).toBeInTheDocument();
    expect(screen.getByText('Rozdzielnia SN')).toBeInTheDocument();
    expect(screen.getByText('Pole transformatorowe SN')).toBeInTheDocument();
    expect(screen.queryByText(/internal-bay/)).not.toBeInTheDocument();
  });
});
