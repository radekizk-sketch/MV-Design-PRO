/**
 * Testy kreatora „Dodaj źródło zasilania" — realna ścieżka użytkownika
 * (render → auto-wybór katalogu → natywny zapis → operacja domenowa), zgodnie
 * z Zero-Debt §5. Mockowane są tylko store'y i końcówki API (nie sam ekran).
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
  fetchSwitchgearFamilies: () =>
    Promise.resolve([
      { switchgear_family_ref: 'ABB__SAFERING', manufacturer_ref: 'ABB', family_name: 'SafeRing', series_name: 'SafeRing', network_voltages_kv: [], um_classes_kv: [12, 17.5, 24], insulation_type: 'sf6', construction_type: 'RMU', status: 'verified', source_refs: [] },
    ]),
  fetchCompleteBayTemplates: () =>
    Promise.resolve([
      { template_ref: 'ABB__SAFERING__LINE_OUT', manufacturer_ref: 'ABB', switchgear_family_ref: 'ABB__SAFERING', bay_kind: 'liniowe_odplywowe', bay_role: 'OUT', source_status: 'catalog_solution', source_refs: [], version: '1', hash: 'x', notes_pl: null },
    ]),
  fetchTransformerTypes: () =>
    Promise.resolve([
      { id: 'TR-110-15-25', name: 'TR 110/15 25 MVA', rated_power_mva: 25, voltage_hv_kv: 110, voltage_lv_kv: 15, uk_percent: 12.5, pk_kw: 120, i0_percent: 0.2, p0_kw: 25, vector_group: 'YNd11', tap_min: -9, tap_max: 9 },
    ]),
  fetchTapChangers: () =>
    Promise.resolve([
      { id: 'tc_oltc_110sn_19_125', catalog_namespace: 'tap_changer', catalog_version: '2024.1', label_pl: 'OLTC 110/SN 19 zaczepow', type: 'oltc', neutral_position: 0, tap_count: 19, step_percent: 1.25, range_percent: 11.25, regulated_side: 'hv', switching_time_s: 5, operations_before_maintenance_thousand: 100, supports_avr: true, applicable_to: [] },
    ]),
}));

// Podgląd IEC 60909 jako vi.fn — liczba wywołań jest realnym sygnałem
// zakończenia łańcucha montażu (patrz renderujKreator poniżej).
const fetchGridSourcePreviewMock = vi.fn(() =>
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
);

vi.mock('../../../../ui/network-build/forms/gridSourcePreviewApi', () => ({
  fetchGridSourcePreview: () => fetchGridSourcePreviewMock(),
}));

/**
 * Renderuje kreator i czeka na realny stan końcowy montażu. Montaż pobiera
 * 5 katalogów, po nich efekty auto-wybierają pozycję katalogu źródła i aparat,
 * co przelicza podgląd IEC 60909 po stronie serwera DRUGI raz (pierwszy bieg
 * rusza od danych domyślnych jeszcze przed katalogami). Czekamy na drugie
 * wywołanie podglądu, a ogon (wynik drugiego biegu to mikrotask bez
 * rozróżnialnego sygnału UI — treść podsumowania jest identyczna po obu
 * biegach) domykamy jawnym act(async) — bez tego React zgłasza
 * „An update to KreatorZrodloZasilania was not wrapped in act(...)".
 */
async function renderujKreator() {
  const wynik = render(<KreatorZrodloZasilania />);
  await waitFor(() => expect(fetchGridSourcePreviewMock).toHaveBeenCalledTimes(2));
  await act(async () => {});
  // Stan końcowy widoczny dla użytkownika: podsumowanie z wynikiem backendu.
  expect(screen.getByText('Obliczenie IEC 60909 po stronie serwera')).toBeTruthy();
  return wynik;
}

describe('KreatorZrodloZasilania — realna ścieżka', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    collapseSurfaceStackToMock.mockReset();
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({});
    navigateToSldMock.mockReset();
    fetchGridSourcePreviewMock.mockClear();
    appState.activeCaseId = 'case-1';
  });

  afterEach(cleanup);

  it('renderuje pełnoekranową ramę: cel, pasek kroków i stałą kolumnę podsumowania', async () => {
    await renderujKreator();
    expect(screen.getByTestId('mvd-kreator-zrodlo')).toBeTruthy();
    expect(screen.getByText(/Dodaj Główny Punkt Zasilający/)).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-kroki')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-aside')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-podsumowanie')).toBeTruthy();
    // Krok 1: identyfikacja widoczna, sekcje dalszych kroków jeszcze nie.
    expect(screen.getByTestId('mvd-kreator-zrodlo-id')).toBeTruthy();
    expect(screen.queryByTestId('mvd-kreator-zrodlo-katalog')).toBeNull();
  });

  it('inicjalizuje nazwę z kontekstu operacji (krok 1)', async () => {
    await renderujKreator();
    expect((screen.getByTestId('mvd-kreator-zrodlo-nazwa') as HTMLInputElement).value).toBe('GPZ Wschód');
  });

  it('nawigacja kroków: „Dalej” odsłania krok Źródło z auto-wybranym katalogiem (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await waitFor(() =>
      expect((screen.getByTestId('mvd-kreator-zrodlo-katalog-select') as HTMLSelectElement).value).toBe('GPZ-001'),
    );
  });

  it('krok Źródło: panel teorii renderuje wzór impedancji źródła przez KaTeX (math-rendered, klik natywny)', async () => {
    // Zasada wywodów KaTeX (2026-07-22): Z = c·U²/Sk″ (teoria) i Z ∝ 1/Sk″ (podpis
    // wykresu sztywności) renderuje KaTeX, nie surowy tekst.
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-zrodlo-teoria')).toBeTruthy());
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(2);
    const latexy = wzory.map((w) => w.getAttribute('data-latex') ?? '');
    expect(latexy.some((l) => l.includes("c \\cdot U^2 / S_k''"))).toBe(true);
    expect(latexy.some((l) => l.includes("\\propto 1/S_k''"))).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('zapisuje GPZ operacją domenową add_grid_source_sn z dowolnego kroku (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    // auto-wybór katalogu + aparatu następuje po montażu (efekty), niezależnie od kroku.
    await waitFor(() => expect(navigateToSldMock).toHaveBeenCalledTimes(0));
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
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await waitFor(() =>
      expect((screen.getByTestId('mvd-kreator-zrodlo-katalog-select') as HTMLSelectElement).value).toBe('GPZ-001'),
    );
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-blad')).toBeTruthy());
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('tryb ręczny na kroku Źródło odsłania stronę WN i pola Sk″ (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-tryb-przel-reczny'));
    expect(screen.getByTestId('mvd-kreator-zrodlo-strona')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-sk3')).toBeTruthy();
    expect(screen.queryByTestId('mvd-kreator-zrodlo-katalog-select')).toBeNull();
  });

  it('krok Sekcje i pola pozwala edytować per sekcję (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-kroki').querySelector('[data-testid="mvd-kreator-krok-sekcje"]') as HTMLElement);
    expect(screen.getByTestId('mvd-kreator-zrodlo-sekcja-nazwa-0')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-sekcja-nazwa-1')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-aparat-rodzaj')).toBeTruthy();
  });

  it('krok Transformatory: wybór OLTC odsłania nastawy regulatora (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(
      screen.getByTestId('mvd-kreator-kroki').querySelector('[data-testid="mvd-kreator-krok-transformatory"]') as HTMLElement,
    );
    // Domyślnie brak regulacji → brak nastaw OLTC.
    expect(screen.queryByTestId('mvd-kreator-zrodlo-oltc-setpoint')).toBeNull();
    await user.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-oltc-typ'), 'OLTC');
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-setpoint')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-uzwojenie')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-katalog')).toBeTruthy();
  });

  it('OLTC z kreatora trafia do operacji domenowej add_grid_source_sn (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    // Auto-wybór katalogu (efekt po montażu) — potrzebny do przejścia walidacji zapisu.
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await waitFor(() =>
      expect((screen.getByTestId('mvd-kreator-zrodlo-katalog-select') as HTMLSelectElement).value).toBe('GPZ-001'),
    );
    await user.click(
      screen.getByTestId('mvd-kreator-kroki').querySelector('[data-testid="mvd-kreator-krok-transformatory"]') as HTMLElement,
    );
    await user.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-oltc-typ'), 'OLTC');
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-setpoint')).toBeTruthy();
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const [, , payload] = executeDomainOperationMock.mock.calls[0];
    expect(payload).toMatchObject({
      transformer_regulation_type: 'OLTC',
      transformer_control_mode: 'AUTOMATIC',
    });
  });
});
