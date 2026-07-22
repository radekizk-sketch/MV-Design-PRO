/**
 * Testy kreatora „Wyprowadź magistralę SN" — realna ścieżka użytkownika
 * (render → wybór katalogu → natywny zapis → operacja domenowa → łańcuchowanie
 * kolejnego kroku), zgodnie z Zero-Debt §5. Mockowane są tylko store'y i
 * końcówki API — nie sam ekran. Migruje intencję testów retirowanego
 * ContinueTrunkForm do kanonu kreatory/rama.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorMagistralaSn } from '../KreatorMagistralaSn';

const closeFormMock = vi.fn();
const openOperationFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = {
  from_bus_ref: 'bus-gpz-1',
  terminal_id: 'bus-gpz-1',
  terminal_port_id: 'bay-out-1:OUT',
  terminal_voltage_label: 'SN',
};

const snapshotState = {
  snapshot: { buses: [], branches: [], bays: [], branch_points: [] },
  logicalViews: { terminals: [] },
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
};

const successResponse = {
  snapshot: {
    branches: [{ id: 'seg-created', ref_id: 'seg-created', to_bus_ref: 'bus-created-end' }],
  },
  logical_views: {
    terminals: [{ element_id: 'bus-created-end', port_id: 'trunk_end', trunk_id: 'trunk-created' }],
  },
  changes: { created_element_ids: ['bus-created-end', 'seg-created'], updated_element_ids: [], deleted_element_ids: [] },
  selection_hint: { element_id: 'bus-created-end', element_type: 'bus' },
  error: null,
};

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', () => {
  const useSnapshotStore = (selector: (s: typeof snapshotState) => unknown) => selector(snapshotState);
  useSnapshotStore.getState = () => snapshotState;
  return { useSnapshotStore };
});

vi.mock('../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (s: { closeOperationForm: typeof closeFormMock; openOperationForm: typeof openOperationFormMock }) => unknown,
  ) => selector({ closeOperationForm: closeFormMock, openOperationForm: openOperationFormMock }),
  useActiveOperationContext: () => context,
}));

vi.mock('../../../../ui/selection', () => ({
  useSelectionStore: (selector: (s: { selectedElements: unknown[]; selectElement: typeof selectElementMock }) => unknown) =>
    selector({ selectedElements: [], selectElement: selectElementMock }),
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchCableTypes: () =>
    Promise.resolve([
      {
        id: 'kab-120',
        name: 'XRUHAKXS 1x120',
        r_ohm_per_km: 0.253,
        x_ohm_per_km: 0.118,
        rated_current_a: 255,
        voltage_rating_kv: 15,
        cross_section_mm2: 120,
      },
    ]),
  fetchLineTypes: () =>
    Promise.resolve([
      {
        id: 'afl-70',
        name: 'AFL-6 70',
        r_ohm_per_km: 0.443,
        x_ohm_per_km: 0.36,
        rated_current_a: 230,
        voltage_rating_kv: 15,
        cross_section_mm2: 70,
      },
    ]),
}));

vi.mock('../../../../ui/network-build/forms/cableVoltageDropApi', () => ({
  fetchCableVoltageDrop: () =>
    Promise.resolve({ delta_u_v: 120, delta_u_pct: 0.8, r_total_ohm: 0.126, x_total_ohm: 0.059 }),
}));

async function pickCable() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-magistrala-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-magistrala-katalog'), 'kab-120');
}

describe('KreatorMagistralaSn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = {
      from_bus_ref: 'bus-gpz-1',
      terminal_id: 'bus-gpz-1',
      terminal_port_id: 'bay-out-1:OUT',
      terminal_voltage_label: 'SN',
    };
    snapshotState.error = null;
    closeFormMock.mockReset();
    openOperationFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('tworzy pierwszy odcinek z pola SN i łańcuchuje wstawienie stacji', async () => {
    executeDomainOperationMock.mockResolvedValue(successResponse);
    render(<KreatorMagistralaSn />);
    await pickCable();

    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'continue_trunk_segment_sn',
        expect.objectContaining({
          from_terminal_id: 'bus-gpz-1',
          segment: expect.objectContaining({
            rodzaj: 'KABEL',
            dlugosc_m: 500,
            catalog_binding: expect.objectContaining({
              catalog_namespace: 'KABEL_SN',
              catalog_item_id: 'kab-120',
            }),
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
          segment_id: 'seg-created',
          endpoint_bus_ref: 'bus-created-end',
          placement_mode: 'ENDPOINT_APPEND',
          position_on_segment: 1,
        }),
      );
    });
  });

  it('następny krok „ZK SN" jest realną akcją i łańcuchuje wstawienie ZK SN', async () => {
    executeDomainOperationMock.mockResolvedValue(successResponse);
    render(<KreatorMagistralaSn />);
    await pickCable();

    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-magistrala-next'), 'zksn');
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(openOperationFormMock).toHaveBeenCalledWith(
        'insert_zksn_on_segment_sn',
        expect.objectContaining({ segment_id: 'seg-created', corridor_ref: 'trunk-created' }),
      );
    });
  });

  it('nie oferuje słupa rozgałęźnego dla kabla, oferuje po zmianie na linię', async () => {
    render(<KreatorMagistralaSn />);
    await pickCable();

    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    const nextSelect = screen.getByTestId('mvd-kreator-magistrala-next') as HTMLSelectElement;
    expect(Array.from(nextSelect.options).some((o) => o.value === 'branch_pole')).toBe(false);
    expect(screen.getByTestId('mvd-kreator-magistrala-next-blokada')).toBeInTheDocument();

    // Zmiana rodzaju na linię napowietrzną odsłania słup rozgałęźny.
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-wstecz'));
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-wstecz'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-magistrala-rodzaj'), 'LINIA');
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    const nextSelectLinia = screen.getByTestId('mvd-kreator-magistrala-next') as HTMLSelectElement;
    expect(Array.from(nextSelectLinia.options).some((o) => o.value === 'branch_pole')).toBe(true);
  });

  it('builder (M2): „Kolejny odcinek" NIE zamyka okna, dopisuje odcinek do listy i pozwala budować dalej', async () => {
    executeDomainOperationMock.mockResolvedValue(successResponse);
    render(<KreatorMagistralaSn />);
    await pickCable();

    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-magistrala-next'), 'continue');
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    // Okno buildera ZOSTAJE otwarte (nie ma zamknięcia, nie ma łańcuchowania obcej operacji).
    expect(closeFormMock).not.toHaveBeenCalled();
    expect(openOperationFormMock).not.toHaveBeenCalled();
    // Lista magistrali w budowie zawiera dodany odcinek.
    const builder = screen.getByTestId('mvd-kreator-magistrala-builder');
    expect(builder.textContent).toContain('XRUHAKXS 1x120');
    // Pojawia się akcja „Zakończ budowę".
    expect(screen.getByTestId('mvd-kreator-magistrala-zakoncz')).toBeInTheDocument();

    // Drugi odcinek: kontynuacja z końca poprzedniego (from_terminal_id = koniec ciągu).
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(2));
    const drugi = executeDomainOperationMock.mock.calls[1]?.[2] as Record<string, unknown>;
    expect(drugi.from_terminal_id).toBe('bus-created-end');
  });

  it('builder: „Zakończ budowę" zamyka okno i wraca do schematu', async () => {
    executeDomainOperationMock.mockResolvedValue(successResponse);
    render(<KreatorMagistralaSn />);
    await pickCable();
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-magistrala-next'), 'continue');
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-magistrala-zakoncz')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zakoncz'));
    expect(closeFormMock).toHaveBeenCalled();
    expect(navigateToSldMock).toHaveBeenCalled();
  });

  it('uczciwy stan zerowy: bez startu ciągu zapis jest zablokowany', async () => {
    context = {};
    render(<KreatorMagistralaSn />);
    // Montaż pobiera katalogi (kable + linie) — czekamy na realny stan końcowy
    // UI (opcja kabla w selekcie katalogu), żeby aktualizacje stanu domknęły
    // się w act.
    await screen.findByRole('option', { name: /XRUHAKXS 1x120/ });

    expect(screen.getByTestId('mvd-kreator-magistrala-brak-startu')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-magistrala-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorMagistralaSn />);
    await pickCable();

    expect(screen.getByTestId('mvd-kreator-magistrala-zapisz')).toBeDisabled();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
