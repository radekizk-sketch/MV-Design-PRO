import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContinueTrunkForm } from '../forms/ContinueTrunkForm';
import { buildOperationContext } from '../operationContext';

const snapshotState: {
  snapshot: any;
  logicalViews: any;
  executeDomainOperation: ReturnType<typeof vi.fn>;
} = {
  snapshot: null,
  logicalViews: null,
  executeDomainOperation: vi.fn(async () => undefined),
};

const closeOperationFormMock = vi.fn();
const activeOperationContextState: { value: Record<string, unknown> | undefined } = {
  value: undefined,
};
const selectedElementState: { value: any } = {
  value: null,
};

vi.mock('../../app-state', () => ({
  useAppStateStore: (selector: (state: { activeCaseId: string }) => unknown) =>
    selector({ activeCaseId: 'case-1' }),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (
    selector: (state: {
      snapshot: unknown;
      logicalViews: unknown;
      executeDomainOperation: () => Promise<void>;
    }) => unknown,
  ) => selector(snapshotState),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: { selectedElements: unknown[] }) => unknown) =>
    selector({ selectedElements: selectedElementState.value ? [selectedElementState.value] : [] }),
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (state: { closeOperationForm: typeof closeOperationFormMock }) => unknown,
  ) =>
    selector({
      closeOperationForm: closeOperationFormMock,
    }),
  useActiveOperationContext: () => activeOperationContextState.value,
}));

vi.mock('../../catalog/api', () => ({
  fetchCableTypes: vi.fn(async () => [
    {
      id: 'XRUHAKXS-3x120',
      name: 'XRUHAKXS 3x120',
      trade_name: 'XRUHAKXS 1×120/25',
      manufacturer: 'Katalog SN',
      voltage_rating_kv: 15,
      cross_section_mm2: 120,
      number_of_cores: 1,
      return_conductor_cross_section_mm2: 25,
      rated_current_a: 200,
      r_ohm_per_km: 0.253,
      x_ohm_per_km: 0.101,
      c_nf_per_km: 240,
      max_temperature_c: 90,
      insulation_type: 'XLPE',
      conductor_material: 'Al',
      standard: 'PN-HD 620',
    },
  ]),
  fetchLineTypes: vi.fn(async () => [
    {
      id: 'AFL-6-70',
      name: 'AFL-6 70',
      manufacturer: 'Katalog SN',
      voltage_rating_kv: 15,
      cross_section_mm2: 70,
      rated_current_a: 180,
      r_ohm_per_km: 0.443,
      x_ohm_per_km: 0.36,
      b_us_per_km: 2.8,
      max_temperature_c: 80,
      conductor_material: 'AlFe',
      standard: 'PN-EN 50182',
    },
  ]),
  getCatalogErrorMessage: vi.fn(() => 'Nie udało się pobrać katalogu.'),
}));

function setCanonicalContext() {
  activeOperationContextState.value = buildOperationContext({
    canonicalOp: 'continue_trunk_segment_sn',
    elementId: 'bay-out-1',
    elementType: 'BaySN',
    snapshot: snapshotState.snapshot,
    logicalViews: {
      terminals: [
        {
          element_id: 'bay-out-1',
          port_id: 'bay-out-1:OUT',
          trunk_id: 'trunk-1',
          status: 'DOSTEPNY',
        },
      ],
    } as any,
  });
}

function getSubmitSegmentButton() {
  return screen.getByRole('button', { name: /^Utwórz odcinek/ });
}

describe('ContinueTrunkForm', () => {
  beforeEach(() => {
    activeOperationContextState.value = undefined;
    selectedElementState.value = null;
    closeOperationFormMock.mockReset();
    snapshotState.executeDomainOperation.mockClear();
    snapshotState.logicalViews = null;
    snapshotState.snapshot = {
      substations: [
        {
          id: 'st-1',
          ref_id: 'st-1',
          name: 'Stacja 1',
          bus_refs: ['bus-sn-1'],
          transformer_refs: [],
          meta: {
            field_specs: [
              {
                field_ref: 'bus-sn-1',
                name: 'Pole odpływowe',
                bay_role: 'OUT',
                bus_ref: 'bus-sn-1',
                meta: { terminal_bus_ref: 'bus-sn-1' },
              },
            ],
          },
        },
      ],
      bays: [
        {
          id: 'bay-out-1',
          ref_id: 'bay-out-1',
          substation_ref: 'st-1',
          bus_ref: 'bus-sn-1',
          bay_role: 'OUT',
          equipment_refs: [],
        },
      ],
      buses: [{ id: 'bus-sn-1', ref_id: 'bus-sn-1', name: 'Szyna SN 1', voltage_kv: 15 }],
      corridors: [
        { id: 'trunk-1', ref_id: 'trunk-1', ordered_segment_refs: ['seg-1', 'seg-2'] },
      ],
    };
  });

  it('renderuje kontekst głowicy pola SN i parametry katalogowe', async () => {
    setCanonicalContext();

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Ciąg główny SN 1')).toBeInTheDocument();
    expect(screen.getAllByText('głowica odpływowa pola SN').length).toBeGreaterThan(0);
    expect(screen.getByText('15 kV')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/XRUHAKXS.*120/).length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent('Obciążalność');
    expect(screen.getByTestId('trunk-selected-catalog-params')).toHaveTextContent('0,101 Ω/km');
  });

  it('nie wymaga wyboru strony świata dla odcinka SN', async () => {
    setCanonicalContext();

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Punkt wyprowadzenia')).toBeInTheDocument();
    expect(screen.getByText(/Odcinek zaczyna się dokładnie w głowicy odpływowej pola SN/i)).toBeInTheDocument();
    expect(screen.queryByText('Geometria SLD')).not.toBeInTheDocument();
    expect(screen.queryByText('Kierunek pierwszego odcinka')).not.toBeInTheDocument();
    expect(screen.queryByText('Północ (N)')).not.toBeInTheDocument();
    expect(screen.queryByText('Wschód (E)')).not.toBeInTheDocument();
    expect(screen.queryByText('Południe (S)')).not.toBeInTheDocument();
    expect(screen.queryByText('Zachód (W)')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText(/XRUHAKXS.*120/).length).toBeGreaterThan(0);
    });
  });

  it('blokuje zapis, gdy terminal magistrali nie został rozstrzygnięty', async () => {
    activeOperationContextState.value = {
      element_ref: 'source-gpz-1',
      element_type: 'Source',
    };

    render(<ContinueTrunkForm />);

    expect(screen.getAllByText('Brak głowicy pola SN albo wolnego końca ciągu.').length)
      .toBeGreaterThan(0);
    expect(getSubmitSegmentButton()).toBeDisabled();
    await waitFor(() => {
      expect(screen.getAllByText(/XRUHAKXS.*120/).length).toBeGreaterThan(0);
    });
  });

  it('gdy formularz ma pusty kontekst, bierze wolny koniec z aktualnie zaznaczonej stacji', async () => {
    activeOperationContextState.value = {
      element_ref: 'source-gpz-1',
      element_type: 'Source',
    };
    selectedElementState.value = {
      id: 'st-1',
      type: 'Station',
      name: 'Stacja 1',
    };
    snapshotState.logicalViews = {
      terminals: [
        {
          element_id: 'bus-sn-1',
          port_id: 'trunk_end',
          trunk_id: 'trunk-1',
          branch_id: null,
          status: 'OTWARTY',
        },
      ],
    };
    snapshotState.executeDomainOperation.mockResolvedValue({ ok: true });

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Kontynuuj ciąg SN z wybranego portu')).toBeInTheDocument();
    expect(screen.getByText('Stacja 1 - port wyjściowy SN')).toBeInTheDocument();
    expect(screen.queryByText(/Nie znaleziono wolnego portu wyjściowego SN/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/XRUHAKXS.*120/).length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByTestId('length-preset-250'));
    fireEvent.click(getSubmitSegmentButton());

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          trunk_id: 'trunk-1',
          from_terminal_id: 'bus-sn-1',
        }),
      );
    });
  });

  it('odbudowuje wolny port z element_ref stacji, gdy selection store nie jest zsynchronizowany', async () => {
    activeOperationContextState.value = {
      element_ref: 'st-1',
      element_type: 'Station',
      segment_kind: 'KABEL_SN',
    };
    snapshotState.logicalViews = {
      terminals: [
        {
          element_id: 'bus-sn-1',
          port_id: 'trunk_end',
          trunk_id: 'trunk-1',
          branch_id: null,
          status: 'OTWARTY',
        },
      ],
    };
    snapshotState.executeDomainOperation.mockResolvedValue({ ok: true });

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Kontynuuj ciąg SN z wybranego portu')).toBeInTheDocument();
    expect(screen.getByText('Stacja 1 - port wyjściowy SN')).toBeInTheDocument();
    expect(screen.queryByText(/Nie znaleziono wolnego portu wyjściowego SN/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/XRUHAKXS.*120/).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByTestId('length-preset-250'));
    expect(getSubmitSegmentButton()).toBeEnabled();
    fireEvent.click(getSubmitSegmentButton());

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          trunk_id: 'trunk-1',
          from_terminal_id: 'bus-sn-1',
          segment: expect.objectContaining({
            dlugosc_m: 250,
          }),
        }),
      );
    });
  });

  it('pozwala wyprowadzić odcinek z pola SN przekazanego jako element_ref', async () => {
    activeOperationContextState.value = {
      element_ref: 'bay-out-1',
      element_type: 'BaySN',
      segment_kind: 'KABEL_SN',
    };
    snapshotState.executeDomainOperation.mockResolvedValue({ ok: true });

    render(<ContinueTrunkForm />);

    await waitFor(() => {
      expect(screen.getAllByText(/XRUHAKXS.*120/).length).toBeGreaterThan(0);
    });
    fireEvent.change(screen.getByPlaceholderText('np. 500'), { target: { value: '250' } });
    expect(getSubmitSegmentButton()).toBeEnabled();
    fireEvent.click(getSubmitSegmentButton());

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          field_ref: 'bay-out-1',
          segment: expect.objectContaining({
            dlugosc_m: 250,
          }),
        }),
      );
    });
  });

  it('wysyła nowy odcinek przez kanoniczny from_terminal_id i opcjonalny trunk_id', async () => {
    setCanonicalContext();

    snapshotState.executeDomainOperation.mockResolvedValue({ ok: true });

    render(<ContinueTrunkForm />);

    await waitFor(() => {
      expect(screen.getAllByText(/XRUHAKXS.*120/).length).toBeGreaterThan(0);
    });
    fireEvent.change(screen.getByPlaceholderText('np. 500'), { target: { value: '350' } });
    fireEvent.click(getSubmitSegmentButton());

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          trunk_id: 'trunk-1',
          from_terminal_id: 'bay-out-1',
          segment: expect.objectContaining({
            rodzaj: 'KABEL',
            dlugosc_m: 350,
          }),
        }),
      );
    });

    const payload = snapshotState.executeDomainOperation.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('from_bus_ref');
    expect(payload.from_terminal_id).toBe('bay-out-1');
  });

  it('pozwala kontynuować ciąg z wolnego końca istniejącego odcinka', async () => {
    activeOperationContextState.value = {
      trunk_id: 'trunk-1',
      from_terminal_id: 'bus-trunk-end',
      terminal_id: 'bus-trunk-end',
      terminal_port_id: 'trunk_end',
      terminal_name: 'Koniec ciągu M1',
      terminal_voltage_label: '15 kV',
      default_termination: 'continue',
      segment_kind: 'LINIA_NAPOWIETRZNA',
    };
    snapshotState.executeDomainOperation.mockResolvedValue({ ok: true });

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Kontynuuj ciąg SN z wybranego portu')).toBeInTheDocument();
    expect(screen.getAllByText('Port wyjściowy stacji / wolny koniec ciągu SN').length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(screen.getAllByText('AFL-6 70').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByPlaceholderText('np. 500'), { target: { value: '400' } });
    expect(getSubmitSegmentButton()).toBeEnabled();
    fireEvent.click(getSubmitSegmentButton());

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          trunk_id: 'trunk-1',
          from_terminal_id: 'bus-trunk-end',
          segment: expect.objectContaining({
            rodzaj: 'LINIA_NAPOWIETRZNA',
            dlugosc_m: 400,
          }),
        }),
      );
    });
  });

  it('rozpoznaje wolny koniec ciągu po kliknięciu stacji SN/nN', async () => {
    activeOperationContextState.value = buildOperationContext({
      canonicalOp: 'continue_trunk_segment_sn',
      elementId: 'st-1',
      elementType: 'Station',
      snapshot: snapshotState.snapshot,
      logicalViews: {
        terminals: [
          {
            element_id: 'bus-sn-1',
            port_id: 'trunk_end',
            trunk_id: 'trunk-1',
            branch_id: null,
            status: 'OTWARTY',
          },
        ],
      } as any,
    });
    snapshotState.executeDomainOperation.mockResolvedValue({ ok: true });

    render(<ContinueTrunkForm />);

    expect(screen.getByText('Kontynuuj ciąg SN z wybranego portu')).toBeInTheDocument();
    expect(screen.getByText('Stacja 1 - port wyjściowy SN')).toBeInTheDocument();
    expect(screen.queryByText(/Brak głowicy pola SN albo wolnego końca ciągu/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/XRUHAKXS.*120/).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByTestId('length-preset-250'));
    expect(screen.getByText(/XRUHAKXS.*120.*250 m/)).toBeInTheDocument();
    expect(getSubmitSegmentButton()).toBeEnabled();
    fireEvent.click(getSubmitSegmentButton());

    await waitFor(() => {
      expect(snapshotState.executeDomainOperation).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          trunk_id: 'trunk-1',
          from_terminal_id: 'bus-sn-1',
          segment: expect.objectContaining({
            dlugosc_m: 250,
          }),
        }),
      );
    });
  });
});
