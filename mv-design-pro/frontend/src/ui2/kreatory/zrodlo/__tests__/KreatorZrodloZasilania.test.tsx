/**
 * Testy kreatora „Dodaj źródło zasilania" — realna ścieżka użytkownika
 * (render → auto-wybór katalogu → natywny zapis → operacja domenowa), zgodnie
 * z Zero-Debt §5. Mockowane są tylko store'y i końcówki API (nie sam ekran).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorZrodloZasilania } from '../KreatorZrodloZasilania';

const closeFormMock = vi.fn();
const collapseSurfaceStackToMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
const context: Record<string, unknown> = { source_name: 'GPZ Wschód' };

vi.mock('../../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: { activeCaseId: string | null }) => unknown) => selector(appState),
}));

vi.mock('../../../../ui/topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (s: { executeDomainOperation: typeof executeDomainOperationMock }) => unknown) =>
    selector({ executeDomainOperation: executeDomainOperationMock }),
}));

vi.mock('../../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (
    selector: (s: {
      closeOperationForm: typeof closeFormMock;
      collapseSurfaceStackTo: typeof collapseSurfaceStackToMock;
    }) => unknown,
  ) => selector({ closeOperationForm: closeFormMock, collapseSurfaceStackTo: collapseSurfaceStackToMock }),
  useActiveOperationContext: () => context,
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchSourceSystemTypes: () =>
    Promise.resolve([
      {
        id: 'GPZ-001',
        name: 'Zasilanie GPZ 15 kV',
        operator_name: 'OSD',
        series: null,
        catalog_number: 'SRC-1',
        voltage_rating_kv: 15,
        sk3_mva: 310,
        rx_ratio: 0.12,
      },
    ]),
  fetchMvApparatusTypes: () =>
    Promise.resolve([
      { id: 'APP-001', name: 'Wyłącznik SN', device_kind: 'WYLACZNIK', u_n_kv: 17.5, i_n_a: 630 },
    ]),
}));

vi.mock('../../../../ui/network-build/forms/gridSourcePreviewApi', () => ({
  fetchGridSourcePreview: () =>
    Promise.resolve({
      sk_mva: 310,
      ik3_ka: 11.93,
      ik1_ka: 8.1,
      ip_ka: 30.2,
      ith_ka: 11.9,
      kappa: 1.79,
      z1_ohm: { r_ohm: 0.09, x_ohm: 0.72 },
      z0_ohm: { r_ohm: 0.28, x_ohm: 2.3 },
      formula_ref: 'IEC60909',
    }),
}));

describe('KreatorZrodloZasilania — realna ścieżka', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    collapseSurfaceStackToMock.mockReset();
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({});
    navigateToSldMock.mockReset();
    appState.activeCaseId = 'case-1';
  });

  afterEach(cleanup);

  it('renderuje ramę prowadzącą z celem i sekcjami', async () => {
    render(<KreatorZrodloZasilania />);
    expect(screen.getByTestId('mvd-kreator-zrodlo')).toBeTruthy();
    expect(screen.getByText(/Dodaj Główny Punkt Zasilający/)).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-katalog')).toBeTruthy();
    await waitFor(() =>
      expect((screen.getByTestId('mvd-kreator-zrodlo-katalog-select') as HTMLSelectElement).value).toBe('GPZ-001'),
    );
  });

  it('inicjalizuje nazwę z kontekstu operacji', () => {
    render(<KreatorZrodloZasilania />);
    expect((screen.getByTestId('mvd-kreator-zrodlo-nazwa') as HTMLInputElement).value).toBe('GPZ Wschód');
  });

  it('zapisuje GPZ operacją domenową add_grid_source_sn (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await waitFor(() =>
      expect((screen.getByTestId('mvd-kreator-zrodlo-katalog-select') as HTMLSelectElement).value).toBe('GPZ-001'),
    );
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const [caseId, op, payload] = executeDomainOperationMock.mock.calls[0];
    expect(caseId).toBe('case-1');
    expect(op).toBe('add_grid_source_sn');
    expect(payload).toMatchObject({
      source_name: 'GPZ Wschód',
      catalog_binding: { catalog_namespace: 'ZRODLO_SN', catalog_item_id: 'GPZ-001' },
    });
    await waitFor(() => expect(closeFormMock).toHaveBeenCalled());
    expect(navigateToSldMock).toHaveBeenCalled();
  });

  it('anuluje kreator bez zapisu (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-anuluj'));
    expect(closeFormMock).toHaveBeenCalledOnce();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('bez aktywnego zakresu pokazuje uczciwy błąd zamiast zapisu', async () => {
    const user = userEvent.setup();
    appState.activeCaseId = null;
    render(<KreatorZrodloZasilania />);
    await waitFor(() =>
      expect((screen.getByTestId('mvd-kreator-zrodlo-katalog-select') as HTMLSelectElement).value).toBe('GPZ-001'),
    );
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-blad')).toBeTruthy());
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('przełącza zakres na GPZ WN/SN i pokazuje sekcje zaawansowane (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    expect(screen.queryByTestId('mvd-kreator-zrodlo-sekcje')).toBeNull();
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zakres-advanced'));
    expect(screen.getByTestId('mvd-kreator-zrodlo-sekcje')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-zero')).toBeTruthy();
  });
});
