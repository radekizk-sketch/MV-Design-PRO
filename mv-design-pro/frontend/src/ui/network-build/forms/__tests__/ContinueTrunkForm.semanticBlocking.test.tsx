/**
 * ContinueTrunkForm — twardy guard semantyczny.
 *
 * Pilnuje, że formularz kontynuacji ciągu SN faktycznie blokuje próbę
 * wyprowadzenia linii napowietrznej z ZKSN i próbę wyprowadzenia kabla
 * ze słupa rozgałęźnego (komunikat techniczny + brak wywołania domeny).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContinueTrunkForm } from '../ContinueTrunkForm';

const closeFormMock = vi.fn();
const openOperationFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const selectElementMock = vi.fn();

const ZKSN_REF = 'bp/zksn/1';
const POLE_REF = 'bp/slup/1';

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
const snapshotState = {
  snapshot: {
    corridors: [],
    buses: [
      { id: 'bus-zksn', ref_id: 'bus-zksn', name: 'Szyna ZKSN', voltage_kv: 15 },
      { id: 'bus-slup', ref_id: 'bus-slup', name: 'Słup 12', voltage_kv: 15 },
    ],
    branch_points: [
      {
        id: ZKSN_REF,
        ref_id: ZKSN_REF,
        branch_point_type: 'zksn',
        parent_segment_id: 'seg/cable/1',
        bus_ref: 'bus-zksn',
        name: 'ZKSN 01',
        ports: { MAIN_IN: 'bus/in', MAIN_OUT: 'bus/out', BRANCH: ['bus/br/1'] }, // ui-terminology-ignore
      },
      {
        id: POLE_REF,
        ref_id: POLE_REF,
        branch_point_type: 'branch_pole',
        parent_segment_id: 'seg/line/1',
        bus_ref: 'bus-slup',
        name: 'Słup rozgałęźny 12',
        ports: { MAIN_IN: 'bus/in', MAIN_OUT: 'bus/out', BRANCH: ['bus/br/1'] }, // ui-terminology-ignore
      },
    ],
  },
  logicalViews: null,
  executeDomainOperation: executeDomainOperationMock,
};

const networkBuildState: {
  activeOperationForm: { context: Record<string, unknown> };
  closeOperationForm: typeof closeFormMock;
  openOperationForm: typeof openOperationFormMock;
} = {
  activeOperationForm: {
    context: {
      from_bus_ref: 'bus-zksn',
      terminal_id: ZKSN_REF,
      from_terminal_id: ZKSN_REF,
      terminal_port_id: 'BRANCH_1',
      segment_kind: 'LINIA_NAPOWIETRZNA',
      element_type: 'ZKSN',
      element_ref: ZKSN_REF,
    },
  },
  closeOperationForm: closeFormMock,
  openOperationForm: openOperationFormMock,
};

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: typeof snapshotState) => unknown) => selector(snapshotState),
}));

vi.mock('../../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: unknown[]; selectElement: typeof selectElementMock }) => unknown) =>
    selector({ selectedElements: [], selectElement: selectElementMock }),
}));

vi.mock('../../networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: typeof networkBuildState) => unknown) =>
    selector(networkBuildState),
  useActiveOperationForm: () => networkBuildState.activeOperationForm,
  useActiveOperationContext: () => networkBuildState.activeOperationForm.context,
}));

vi.mock('../../../catalog/api', async (importActual) => {
  const actual = await importActual<typeof import('../../../catalog/api')>();
  return {
    ...actual,
    fetchCableTypes: vi.fn().mockResolvedValue([
      {
        id: 'cable-base-xlpe-al-1c-120',
        name: 'XRUHAKXS 1×120/25',
        manufacturer: 'ENEA',
        voltage_rating_kv: 15,
        cross_section_mm2: 120,
        rated_current_a: 255,
        r_ohm_per_km: 0.25,
        x_ohm_per_km: 0.12,
        c_nf_per_km: 240,
        max_temperature_c: 90,
        insulation_type: 'XLPE',
        conductor_material: 'Al',
        standard: 'ENEA',
      },
    ]),
    fetchLineTypes: vi.fn().mockResolvedValue([
      {
        id: 'line-base-afl-70',
        name: 'AFL-6 70 mm²',
        manufacturer: 'Katalog',
        voltage_rating_kv: 15,
        cross_section_mm2: 70,
        rated_current_a: 230,
        r_ohm_per_km: 0.443,
        x_ohm_per_km: 0.36,
        b_us_per_km: 2.8,
        max_temperature_c: 80,
        conductor_material: 'AlFe',
        standard: 'PN-EN 50182',
      },
    ]),
    getCatalogErrorMessage: (error: unknown) =>
      error instanceof Error ? error.message : 'Błąd katalogu',
  };
});

describe('ContinueTrunkForm — semantyczny guard wyprowadzeń', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    closeFormMock.mockReset();
    openOperationFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    selectElementMock.mockReset();
  });

  it('blokuje próbę wyprowadzenia linii napowietrznej z ZKSN i NIE wywołuje operacji domenowej', async () => {
    networkBuildState.activeOperationForm.context = {
      from_bus_ref: 'bus-zksn',
      terminal_id: ZKSN_REF,
      from_terminal_id: ZKSN_REF,
      terminal_port_id: 'BRANCH_1',
      segment_kind: 'LINIA_NAPOWIETRZNA',
      element_type: 'ZKSN',
      element_ref: ZKSN_REF,
    };

    render(<ContinueTrunkForm />);

    await waitFor(() => {
      expect(screen.getByTestId('trunk-selected-catalog-params')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('length-preset-500'));
    fireEvent.click(screen.getByRole('button', { name: /Utw.*wstawienia stacji/ }));

    await waitFor(() => {
      expect(
        screen.getByText(/Linia napowietrzna nie może wychodzić bezpośrednio z ZKSN/),
      ).toBeInTheDocument();
    });
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
    expect(closeFormMock).not.toHaveBeenCalled();
  });

  it('blokuje próbę wyprowadzenia kabla SN ze słupa rozgałęźnego', async () => {
    networkBuildState.activeOperationForm.context = {
      from_bus_ref: 'bus-slup',
      terminal_id: POLE_REF,
      from_terminal_id: POLE_REF,
      terminal_port_id: 'BRANCH',
      segment_kind: 'KABEL_SN',
      element_type: 'BranchPole',
      element_ref: POLE_REF,
    };

    render(<ContinueTrunkForm />);

    await waitFor(() => {
      expect(screen.getByTestId('trunk-selected-catalog-params')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('length-preset-500'));
    fireEvent.click(screen.getByRole('button', { name: /Utw.*wstawienia stacji/ }));

    await waitFor(() => {
      expect(
        screen.getByText(/Kabel SN nie może wychodzić ze słupa linii napowietrznej/),
      ).toBeInTheDocument();
    });
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
