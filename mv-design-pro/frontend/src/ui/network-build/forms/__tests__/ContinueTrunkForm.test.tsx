import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContinueTrunkForm } from '../ContinueTrunkForm';

const closeFormMock = vi.fn();
const openOperationFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
const snapshotState = {
  snapshot: {
    corridors: [],
    buses: [
      { id: 'bus-gpz-1', ref_id: 'bus-gpz-1', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
    ],
  },
  executeDomainOperation: executeDomainOperationMock,
};

const networkBuildState = {
  activeOperationForm: {
    context: {
      from_bus_ref: 'bus-gpz-1',
      terminal_id: 'bus-gpz-1',
      terminal_port_id: 'bay-out-1:OUT',
      segment_kind: 'KABEL_SN',
    },
  },
  closeOperationForm: closeFormMock,
  openOperationForm: openOperationFormMock,
};

const successfulContinueResponse = {
  snapshot: {
    branches: [
      {
        id: 'seg-created',
        ref_id: 'seg-created',
        to_bus_ref: 'bus-created-end',
      },
    ],
  },
  logical_views: {
    terminals: [
      {
        element_id: 'bus-created-end',
        port_id: 'trunk_end',
        trunk_id: 'trunk-created',
        branch_id: null,
        status: 'OTWARTY',
      },
    ],
  },
  changes: {
    created_element_ids: ['bus-created-end', 'seg-created'],
    updated_element_ids: [],
    deleted_element_ids: [],
  },
  selection_hint: {
    element_id: 'bus-created-end',
    element_type: 'bus',
    zoom_to: true,
  },
  error: null,
};

vi.mock('../../../app-state', () => ({
  useAppStateStore: (selector: (state: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: typeof snapshotState) => unknown) => selector(snapshotState),
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
      id: 'enea-operator-xruhakxs-1x120',
      name: 'ENEA Operator - XRUHAKXS 1x120/25',
      manufacturer: 'ENEA Operator',
      voltage_rating_kv: 15,
      cross_section_mm2: 120,
      rated_current_a: 255,
      r_ohm_per_km: 0.253,
      x_ohm_per_km: 0.118,
      c_nf_per_km: 240,
      max_temperature_c: 90,
      insulation_type: 'XLPE',
      conductor_material: 'Al',
      standard: 'ENEA Operator / PN-HD 620',
    },
    {
      id: 'tfk-xruhakxs-1x240',
      name: 'TFK XRUHAKXS 1x240/25',
      manufacturer: 'Tele-Fonika Kable',
      voltage_rating_kv: 20,
      cross_section_mm2: 240,
      rated_current_a: 410,
      r_ohm_per_km: 0.125,
      x_ohm_per_km: 0.099,
      c_nf_per_km: 340,
      max_temperature_c: 90,
      insulation_type: 'XLPE',
      conductor_material: 'Al',
      standard: 'IEC 60502-2',
    },
  ]),
    fetchLineTypes: vi.fn().mockResolvedValue([
      {
        id: 'afl-6-70',
        name: 'AFL-6 70 mm2',
        manufacturer: 'Katalog SN',
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

describe('ContinueTrunkForm', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    closeFormMock.mockReset();
    openOperationFormMock.mockReset();
    executeDomainOperationMock.mockReset();
  });

  it('pozwala utworzyć pierwszy odcinek z głowicy pola SN bez ręcznego przepisywania katalogu', async () => {
    executeDomainOperationMock.mockResolvedValue(successfulContinueResponse);

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Wyprowadź odcinek z głowicy pola SN')).toBeInTheDocument();
    expect(screen.getByText('Nowy ciąg główny SN')).toBeInTheDocument();
    expect(screen.getAllByText('głowica odpływowa pola SN').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent('XRUHAKXS 1×120/25');
    });
    expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent('0,253 Ω/km');
    expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent('PN-HD 620');
    expect(screen.getByTestId('trunk-selected-catalog-params')).not.toHaveTextContent('ENEA Operator');

    fireEvent.click(screen.getByTestId('length-preset-500'));
    fireEvent.click(screen.getByRole('button', { name: /Utw.*wstawienia stacji/ }));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          from_terminal_id: 'bus-gpz-1',
          segment: expect.objectContaining({
            dlugosc_m: 500,
          }),
        }),
      );
    });

    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('trunk_id');
    expect(closeFormMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(openOperationFormMock).toHaveBeenCalledWith(
        'insert_station_on_segment_sn',
        expect.objectContaining({
          segment_id: expect.any(String),
          endpoint_bus_ref: 'bus-created-end',
          placement_mode: 'ENDPOINT_APPEND',
          position_on_segment: 1,
        }),
      );
    });
  });

  it('po kliknięciu Zmień nie wybiera ponownie automatycznie pierwszego kabla', async () => {
    executeDomainOperationMock.mockResolvedValue(successfulContinueResponse);

    render(<ContinueTrunkForm />);

    await waitFor(() => {
      expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent('XRUHAKXS 1×120/25');
    });

    fireEvent.click(screen.getByTitle(/Zmie/));

    const searchInput = screen.getByTestId('catalog-picker-search');
    expect(searchInput).toBeInTheDocument();
    expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent(
      /Wybierz typ katalogowy/,
    );

    fireEvent.change(searchInput, { target: { value: 'TFK' } });
    fireEvent.click(await screen.findByTestId('catalog-entry-tfk-xruhakxs-1x240'));
    fireEvent.click(screen.getByTestId('length-preset-500'));
    fireEvent.click(screen.getByRole('button', { name: /Utw.*wstawienia stacji/ }));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));

    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as {
      segment?: {
        catalog_binding?: {
          catalog_namespace?: string;
          catalog_item_id?: string;
        };
      };
    };
    expect(payload.segment?.catalog_binding).toMatchObject({
      catalog_namespace: 'KABEL_SN',
      catalog_item_id: 'tfk-xruhakxs-1x240',
    });
  });

  it('traktuje wybór następnego kroku jako prawdziwą akcję, a nie martwy kafel', async () => {
    executeDomainOperationMock.mockResolvedValue(successfulContinueResponse);

    render(<ContinueTrunkForm />);

    await waitFor(() => {
      expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent('XRUHAKXS 1×120/25');
    });

    fireEvent.click(screen.getByTestId('trunk-next-step-zksn'));

    expect(executeDomainOperationMock).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Podaj/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('length-preset-500'));
    expect(screen.queryByText('Podaj długość odcinka większą od 0 m.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Utw.*ZK SN/ }));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(openOperationFormMock).toHaveBeenCalledWith(
        'insert_zksn_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-created',
          corridor_ref: 'trunk-created',
        }),
      );
    });
  });

  it('nie pozwala wybrać słupa rozgałęźnego dla odcinka kablowego', async () => {
    render(<ContinueTrunkForm />);

    await waitFor(() => {
      expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent(/XRUHAKXS.*120\/25/);
    });

    expect(screen.queryByTestId('trunk-next-step-branch_pole')).not.toBeInTheDocument();
    expect(screen.getByText(/Słup rozgałęźny pojawi się po wyborze linii napowietrznej SN/)).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Kabel SN'), {
      target: { value: 'LINIA_NAPOWIETRZNA' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent('AFL-6 70');
    });
    expect(screen.getByTestId('trunk-next-step-branch_pole')).toBeEnabled();
  });

  it('otwiera konfigurator stacji po zapisie odcinka takze bez created_element_ids z API', async () => {
    executeDomainOperationMock.mockResolvedValue({
      ...successfulContinueResponse,
      changes: {
        created_element_ids: [],
        updated_element_ids: [],
        deleted_element_ids: [],
      },
      selection_hint: null,
    });

    render(<ContinueTrunkForm />);

    await waitFor(() => {
      expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent(/XRUHAKXS.*120\/25/);
    });

    fireEvent.click(screen.getByTestId('length-preset-500'));
    fireEvent.click(screen.getByRole('button', { name: /Utw.*wstawienia stacji/ }));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    expect(closeFormMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(openOperationFormMock).toHaveBeenCalledWith(
        'insert_station_on_segment_sn',
        expect.objectContaining({
          segment_id: 'seg-created',
          endpoint_bus_ref: 'bus-created-end',
          placement_mode: 'ENDPOINT_APPEND',
        }),
      );
    });
  });

  it('nie zostawia aktywnego przycisku bez efektu, gdy nie ma aktywnego zakresu obliczen', async () => {
    appState.activeCaseId = null;

    render(<ContinueTrunkForm />);

    await waitFor(() => {
      expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent(/XRUHAKXS.*120\/25/);
    });

    fireEvent.click(screen.getByTestId('length-preset-500'));

    const submitButton = screen.getByRole('button', { name: /Utw.*wstawienia stacji/ });
    expect(submitButton).toBeDisabled();
    expect(screen.getAllByText(/Skonfiguruj aktywny zakres oblicze/).length).toBeGreaterThan(0);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
