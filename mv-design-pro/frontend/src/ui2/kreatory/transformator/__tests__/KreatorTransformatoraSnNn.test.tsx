/**
 * Testy kreatora „Dodaj transformator SN/nN" — realna ścieżka użytkownika,
 * Zero-Debt §5. Mockowane tylko store'y i końcówki API. Migruje intencję
 * retirowanego AddTransformerForm (kontekst stacji, blokada GPZ) do kanonu ui2.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorTransformatoraSnNn } from '../KreatorTransformatoraSnNn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {
  station_ref: 'st-1',
  hv_bus_ref: 'bus-sn',
  lv_bus_ref: 'bus-nn',
  station_name: 'ST-1',
};
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: {
    buses: [
      { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
    ],
  },
};

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', () => {
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return {
    useSnapshotStore,
    selectBusOptions: (snap: typeof snapshotState.snapshot | null) =>
      (snap?.buses ?? []).map((b) => ({ ref_id: b.ref_id, name: b.name, voltage_kv: b.voltage_kv })),
  };
});

vi.mock('../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (s: { closeOperationForm: typeof closeFormMock }) => unknown) =>
    selector({ closeOperationForm: closeFormMock }),
  useActiveOperationContext: () => context,
}));

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

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchTransformerTypes: () =>
    Promise.resolve([
      {
        id: 'energen-tonr-1000-15-04',
        name: 'TONR 1000',
        rated_power_mva: 1.0,
        voltage_hv_kv: 15,
        voltage_lv_kv: 0.4,
        uk_percent: 6,
        pk_kw: 10,
        i0_percent: 0.5,
        p0_kw: 1.2,
        vector_group: 'Dyn5',
        tap_min: -2,
        tap_max: 2,
        tap_step_percent: 2.5,
      },
    ]),
}));

vi.mock('../../../../ui/network-build/forms/transformerRatedCurrentsApi', () => ({
  fetchTransformerRatedCurrents: () =>
    Promise.resolve({ primary_current_a: 38.5, secondary_current_a: 1443.4, formula_ref: 'I=S/(√3U)', assumptions: [] }),
}));

async function pickType() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-transformator-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-katalog'), 'energen-tonr-1000-15-04');
}

describe('KreatorTransformatoraSnNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { station_ref: 'st-1', hv_bus_ref: 'bus-sn', lv_bus_ref: 'bus-nn', station_name: 'ST-1' };
    snapshotState.error = null;
    snapshotState.snapshot = {
      buses: [
        { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
    };
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('tworzy transformator z kontekstem stacji (bez regulacji) i wiąże ze schematem', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'tr-created', element_type: 'transformer', zoom_to: true },
    });
    render(<KreatorTransformatoraSnNn />);
    await pickType();

    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_transformer_sn_nn',
        expect.objectContaining({
          hv_bus_ref: 'bus-sn',
          lv_bus_ref: 'bus-nn',
          station_ref: 'st-1',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'TRAFO_SN_NN', catalog_item_id: 'energen-tonr-1000-15-04' }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('transformer_regulation_type');
    expect(closeFormMock).toHaveBeenCalled();
    // Wielokierunkowe wiązanie (V12K-073): nowy transformator zaznaczony,
    // SLD wycentrowany, przejście na schemat.
    await waitFor(() => {
      expect(selectElementMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tr-created', type: 'TransformerBranch' }),
      );
    });
    expect(centerSldOnElementMock).toHaveBeenCalledWith('tr-created');
    expect(navigateToSldMock).toHaveBeenCalled();
  });

  it('konfiguruje OLTC AUTO i wysyła pola TapChanger', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorTransformatoraSnNn />);
    await pickType();

    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-dalej'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-regtyp'), 'OLTC');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-transformator-control'), 'AUTO');
    const setpoint = screen.getByTestId('mvd-kreator-transformator-setpoint');
    await userEvent.clear(setpoint);
    await userEvent.type(setpoint, '15.5');
    await userEvent.click(screen.getByTestId('mvd-kreator-transformator-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_transformer_sn_nn',
        expect.objectContaining({
          transformer_regulation_type: 'OLTC',
          transformer_control_mode: 'AUTO',
          transformer_voltage_setpoint_kv: 15.5,
        }),
      );
    });
  });

  it('panel teorii kroku szyn renderuje wzór impedancji przez KaTeX (math-rendered)', async () => {
    // Zasada wywodów KaTeX (2026-07-22): Z ≈ uk·U²/Sn renderuje KaTeX, nie surowy tekst.
    render(<KreatorTransformatoraSnNn />);
    await pickType();
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(1);
    expect(
      wzory.some((w) => (w.getAttribute('data-latex') ?? '').includes('u_k \\cdot U^2 / S_n')),
    ).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('uczciwa blokada dla kontekstu bez pary szyn (GPZ)', async () => {
    context = {
      station_ref: 'gpz-1',
      transformer_context_valid: false,
      transformer_block_reason: 'Transformator SN/nN nie należy do układu GPZ ani źródła systemowego.',
    };
    snapshotState.snapshot = { buses: [] };
    render(<KreatorTransformatoraSnNn />);
    // Montaż pobiera katalog transformatorów (mikrotaski) — czekamy na realny
    // stan końcowy UI (opcja typu w selekcie katalogu), żeby aktualizacja
    // stanu domknęła się w act.
    await screen.findByRole('option', { name: /TONR 1000/ });
    expect(screen.getByTestId('mvd-kreator-transformator-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-transformator-zapisz')).toBeDisabled();
    // przywróć snapshot dla kolejnych testów
    snapshotState.snapshot = {
      buses: [
        { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
        { ref_id: 'bus-nn', name: 'Szyna nN', voltage_kv: 0.4 },
      ],
    };
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorTransformatoraSnNn />);
    await pickType();
    expect(screen.getByTestId('mvd-kreator-transformator-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
