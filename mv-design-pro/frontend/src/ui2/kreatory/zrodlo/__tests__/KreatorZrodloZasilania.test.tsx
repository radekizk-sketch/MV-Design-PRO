/**
 * Testy kreatora „Dodaj źródło zasilania" — realna ścieżka użytkownika
 * (render → auto-wybór katalogu → natywny zapis → operacja domenowa), zgodnie
 * z Zero-Debt §5. Mockowane są tylko store'y i końcówki API (nie sam ekran).
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorZrodloZasilania } from '../KreatorZrodloZasilania';
import { ZRODLO_STRINGS as T } from '../strings';
import type { GridSourcePreviewResponse } from '../../../../ui/network-build/forms/gridSourcePreviewApi';

const T_BRAK_ZAKRESU = T.brakZakresu;

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

// R5 (karta FAB-K, wzorzec E2E-S95): `vi.hoisted` — testy gotowości
// nadpisują implementację per test (`mockReturnValueOnce`), żeby symulować
// katalog systemów zasilających W TRAKCIE ładowania (Promise, który świadomie
// NIE rozstrzyga się w obrębie testu) — ten sam wzorzec co
// `KreatorMagistralaSn.test.tsx`. Pozostałe cztery katalogi tego kreatora
// (aparaty/rodziny rozdzielnic/transformatory/tap changery) NIE wchodzą do
// bramki `stanGotowosci` (karta FAB-K, §0 R5: „GPZ: katalog" — WYŁĄCZNIE
// katalog systemów zasilających) — zostają prostym, nienadpisywalnym mockiem.
const DOMYSLNY_KATALOG_ZRODEL = [
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
];
// Rzuty końcówki katalogu (producent rozdzielnicy, rodzaj w słowniku rodzin, wymienność).
// Domyślnie JEDEN wyłącznik producenta rodziny SafeRing (jedyny zdatny — przyjmowany
// automatycznie); test oferty rodziny dokłada wyłącznik innego producenta.
const { fetchSourceSystemTypesMock, fetchMvApparatusTypesMock, APARAT_ABB, APARAT_SIEMENS } = vi.hoisted(() => {
  const abb = { id: 'APP-001', name: 'Wyłącznik SN', device_kind: 'WYLACZNIK', u_n_kv: 17.5, i_n_a: 630, manufacturer_ref: 'ABB', family_apparatus_kind: 'circuit_breaker', interchangeable_across_families: false };
  const siemens = { id: 'APP-SIEMENS', name: 'Wyłącznik Siemens', device_kind: 'WYLACZNIK', u_n_kv: 17.5, i_n_a: 1250, manufacturer_ref: 'SIEMENS', family_apparatus_kind: 'circuit_breaker', interchangeable_across_families: false };
  return {
    fetchSourceSystemTypesMock: vi.fn(),
    fetchMvApparatusTypesMock: vi.fn(() => Promise.resolve([abb])),
    APARAT_ABB: abb,
    APARAT_SIEMENS: siemens,
  };
});

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchSourceSystemTypes: () => fetchSourceSystemTypesMock(),
  fetchMvApparatusTypes: () => fetchMvApparatusTypesMock(),
  fetchSwitchgearFamilies: () =>
    Promise.resolve([
      { switchgear_family_ref: 'ABB__SAFERING', manufacturer_ref: 'ABB', family_name: 'SafeRing', series_name: 'SafeRing', network_voltages_kv: [], um_classes_kv: [12, 17.5, 24], allowed_apparatus_kinds: ['switch_disconnector', 'circuit_breaker', 'earthing_switch', 'fuse_set'], insulation_type: 'sf6', construction_type: 'RMU', status: 'verified', source_refs: [] },
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
// Typ odpowiedzi z KONTRAKTU (`gridSourcePreviewApi.ts`), nie z ręcznej kopii kształtu —
// ręczna kopia (wnioskowany typ literału) nie znała bloku `scenariusz_min` (K7) i odrzucała
// go w typach testu, choć komponent i kontrakt już go niosły.
const fetchGridSourcePreviewMock = vi.fn(
  (): Promise<GridSourcePreviewResponse> =>
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

type Uzytkownik = ReturnType<typeof userEvent.setup>;

/** Przycisk kroku w pasku kroków ramy (klik natywny). */
function krok(id: string): HTMLElement {
  return screen.getByTestId('mvd-kreator-kroki').querySelector(`[data-testid="mvd-kreator-krok-${id}"]`) as HTMLElement;
}

/**
 * Renderuje kreator i czeka na realny stan końcowy montażu (5 katalogów + dobór jedynej
 * pozycji systemu zasilającego, transformatora i aparatu). Bez czasu tk podgląd IEC 60909
 * NIE rusza (interfejs nie podstawia 1 s) — kolumna podsumowania mówi, czego czeka.
 */
async function renderujKreator() {
  const wynik = render(<KreatorZrodloZasilania />);
  await waitFor(() => expect(fetchSourceSystemTypesMock).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.getByText(T.podsumCzeka)).toBeTruthy();
  expect(fetchGridSourcePreviewMock).not.toHaveBeenCalled();
  return wynik;
}

/** Decyzje projektanta, których kreator nie zgaduje (kontrakt prowadzenia, 2026-10-15). */
async function podajTk(user: Uzytkownik, tk = '1') {
  await user.click(krok('normy'));
  await user.type(screen.getByTestId('mvd-kreator-zrodlo-tk'), tk);
}
async function wybierzUziemienie(user: Uzytkownik) {
  await user.click(krok('rozdzielnia'));
  await user.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-uziemienie'), 'directly_grounded');
}
async function wybierzNapiecieSn(user: Uzytkownik, kv = '15') {
  await user.click(krok('identyfikacja'));
  await user.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-napiecie'), kv);
}

/** Kreator z podglądem backendu: projektant podał tk, podgląd IEC 60909 policzony. */
async function renderujZPodgladem() {
  const user = userEvent.setup();
  const wynik = render(<KreatorZrodloZasilania />);
  await waitFor(() => expect(fetchSourceSystemTypesMock).toHaveBeenCalled());
  await podajTk(user);
  await waitFor(() => expect(fetchGridSourcePreviewMock).toHaveBeenCalled());
  await act(async () => {});
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
    fetchSourceSystemTypesMock.mockReset();
    fetchSourceSystemTypesMock.mockResolvedValue(DOMYSLNY_KATALOG_ZRODEL);
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

  it('świeży kreator: zero alertów i czerwieni; dane jedynej pozycji katalogu w polach, uziemienie i tk puste', async () => {
    const user = userEvent.setup();
    await renderujKreator();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('mvd-kreator-zrodlo-kontrola').querySelector('[data-stan="konflikt"]')).toBeNull();
    // Napięcie SN z jedynej pozycji katalogu systemu zasilającego — zwykła, edytowalna wartość.
    expect(screen.getByTestId('mvd-kreator-zrodlo-napiecie')).toHaveValue('15');
    expect(screen.getByTestId('mvd-kreator-zrodlo-napiecie')).toBeEnabled();
    expect(screen.queryByText(/przyjęto/)).toBeNull();
    await user.click(krok('rozdzielnia'));
    expect(screen.getByTestId('mvd-kreator-zrodlo-uziemienie')).toHaveValue('');
    expect(screen.queryByTestId('mvd-kreator-zrodlo-uziemienie-ohm')).toBeNull();
    await user.click(krok('normy'));
    expect(screen.getByTestId('mvd-kreator-zrodlo-tk')).toHaveValue(null);
    expect(screen.getByTestId('mvd-kreator-zrodlo-zapisz')).toBeEnabled();
  });

  it('kilka pozycji katalogu na napięcie SN: kreator nie wybiera pierwszej', async () => {
    fetchSourceSystemTypesMock.mockResolvedValue([
      DOMYSLNY_KATALOG_ZRODEL[0],
      { ...DOMYSLNY_KATALOG_ZRODEL[0], id: 'GPZ-003', name: 'Zasilanie GPZ 15 kV (B)', sk3_mva: 500 },
    ]);
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await screen.findByRole('option', { name: /Zasilanie GPZ 15 kV \(B\)/ });
    expect(screen.getByTestId('mvd-kreator-zrodlo-katalog-select')).toHaveValue('');
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

  it('zapis wskazuje sposób pracy punktu neutralnego (krok, fokus, jedno zdanie); po wyborze GPZ się zapisuje', async () => {
    const user = userEvent.setup();
    await renderujKreator();
    // Dobór jedynych pozycji katalogu (system, transformator, aparat) następuje po montażu;
    // uziemienia kreator nie zgaduje (dawniej rezystor 12 Ω) — próba zapisu go wskazuje.
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    expect(screen.getByTestId('mvd-kreator-krok-rozdzielnia')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('mvd-kreator-zrodlo-uziemienie')).toHaveFocus();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wybierz sposób pracy punktu neutralnego — /);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-uziemienie'), 'resistor_grounded');
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    expect(screen.getByTestId('mvd-kreator-zrodlo-uziemienie-ohm')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Podaj rezystancję R_N rezystora/);
    await user.type(screen.getByTestId('mvd-kreator-zrodlo-uziemienie-ohm'), '40');
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const [caseId, op, payload] = executeDomainOperationMock.mock.calls[0];
    expect(caseId).toBe('case-1');
    expect(op).toBe('add_grid_source_sn');
    expect(payload).toMatchObject({
      source_name: 'GPZ Wschód',
      voltage_kv: 15,
      hv_voltage_kv: 110,
      catalog_binding: { catalog_namespace: 'ZRODLO_SN', catalog_item_id: 'GPZ-001' },
      transformer_catalog_ref: 'TR-110-15-25',
      grounding: { type: 'resistor_grounded', r_ohm: 40 },
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

  // Intencja dawnego testu R5 („bez zakresu zapis zablokowany PRZED kliknięciem”): zapis nie
  // rusza bez aktywnego przypadku i projektant wie dlaczego. Nowy kanon (kontrakt prowadzenia):
  // brak przypadku to BRAK_DO_OPERACJI — jedno zdanie przy próbie zapisu, nie wyszarzenie.
  it('bez aktywnego przypadku: kompletny zapis wskazuje przypadek, operacja nie wychodzi', async () => {
    appState.activeCaseId = null;
    const user = userEvent.setup();
    await renderujKreator();
    await wybierzUziemienie(user);
    expect(screen.getByTestId('mvd-kreator-zrodlo-zapisz')).toBeEnabled();
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toBe(T_BRAK_ZAKRESU);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * R5 — iloczyn cech „katalog jeszcze się ładuje × zakres poprawny”: zapis wyszarzony (jedyny
   * dopuszczalny powód obok zapisu w toku) z jednym zdaniem w stopce ramy.
   */
  it('iloczyn cech: katalog systemów zasilających jeszcze się ładuje × zakres obliczeń poprawny → zapis wyszarzony z jednym zdaniem', async () => {
    fetchSourceSystemTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorZrodloZasilania />);

    expect(screen.getByTestId('mvd-kreator-zrodlo-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-zrodlo')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/Wczytywanie katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
    // Pozostałe katalogi (aparaty, rodziny, transformatory, przełączniki) dochodzą w mikrotaskach.
    await act(async () => {});
    expect(screen.getByTestId('mvd-kreator-zrodlo-zapisz')).toBeDisabled();
  });

  /**
   * R5 — test PRZEJŚCIA disabled→enabled sterowany REALNYM rozstrzygnięciem
   * asynchronicznym (nie syntetyczną mutacją store'u): katalog w locie →
   * `data-status="ladowanie"` + zapis zablokowany, katalog odpowiada →
   * `data-status="gotowy"` I dopiero wtedy zapis klikalny.
   */
  it('przejście disabled→enabled: katalog w locie blokuje zapis, realne rozstrzygnięcie fetch odblokowuje', async () => {
    let resolveKatalog: (value: typeof DOMYSLNY_KATALOG_ZRODEL) => void = () => {};
    fetchSourceSystemTypesMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveKatalog = resolve;
      }),
    );
    render(<KreatorZrodloZasilania />);

    expect(screen.getByTestId('mvd-kreator-zrodlo-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-zrodlo')).toHaveAttribute('data-status', 'ladowanie');

    resolveKatalog(DOMYSLNY_KATALOG_ZRODEL);

    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-zrodlo')).toHaveAttribute('data-status', 'gotowy');
    });
    expect(screen.getByTestId('mvd-kreator-zrodlo-zapisz')).toBeEnabled();
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

  // Ten sam predykat oferty rodziny co kreator stacji i pola SN (`aparatWOfercieRodziny`).
  // Iloczyn: rodzina {niewybrana, wybrana} × producent aparatu {rodziny, inny}.
  it('aparaty pól liniowych GPZ: po wyborze rodziny tylko oferta rodziny', async () => {
    fetchMvApparatusTypesMock.mockReturnValueOnce(Promise.resolve([APARAT_ABB, APARAT_SIEMENS]));
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(krok('sekcje'));
    const katalog = (await screen.findByTestId('mvd-kreator-zrodlo-aparat-katalog')) as HTMLSelectElement;
    const opcje = () => [...katalog.querySelectorAll('option')].map((o) => o.value).filter(Boolean);
    await waitFor(() => expect(opcje()).toContain('APP-SIEMENS'));
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-zrodlo-rodzina-select').querySelector('option[value="ABB__SAFERING"]')).not.toBeNull(),
    );
    await user.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-rodzina-select'), 'ABB__SAFERING');
    await waitFor(() => expect(opcje()).not.toContain('APP-SIEMENS'));
    expect(opcje()).toEqual(['APP-001']);
  });

  it('krok Sekcje i pola pozwala edytować per sekcję (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-kroki').querySelector('[data-testid="mvd-kreator-krok-sekcje"]') as HTMLElement);
    expect(screen.getByTestId('mvd-kreator-zrodlo-sekcja-nazwa-0')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-sekcja-nazwa-1')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-aparat-rodzaj')).toBeTruthy();
  });

  it('krok Transformatory: wybór OLTC odsłania nastawy regulatora — puste, bez zgadniętych ±9 × 1,25 % i 15 kV', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(krok('transformatory'));
    // Domyślnie brak regulacji → brak nastaw OLTC.
    expect(screen.queryByTestId('mvd-kreator-zrodlo-oltc-setpoint')).toBeNull();
    await user.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-oltc-typ'), 'OLTC');
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-setpoint')).toHaveValue(null);
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-krok')).toHaveValue(null);
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-min')).toHaveValue(null);
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-uzwojenie')).toHaveValue('');
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-tryb')).toHaveValue('');
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-katalog')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('OLTC z kreatora trafia do operacji domenowej add_grid_source_sn (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    // Auto-wybór katalogu (efekt po montażu) — potrzebny do przejścia walidacji zapisu.
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await waitFor(() =>
      expect((screen.getByTestId('mvd-kreator-zrodlo-katalog-select') as HTMLSelectElement).value).toBe('GPZ-001'),
    );
    await wybierzUziemienie(user);
    await user.click(krok('transformatory'));
    await user.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-oltc-typ'), 'OLTC');
    // Nastawy zaczepów z karty przełącznika w katalogu; tryb sterowania to decyzja projektanta.
    await user.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-oltc-katalog'), 'tc_oltc_110sn_19_125');
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-min')).toHaveValue(-9);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-tryb')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Wybierz tryb sterowania regulatora — /);
    await user.selectOptions(screen.getByTestId('mvd-kreator-zrodlo-oltc-tryb'), 'AUTOMATIC');
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    expect(screen.getByTestId('mvd-kreator-zrodlo-oltc-setpoint')).toHaveFocus();
    await user.type(screen.getByTestId('mvd-kreator-zrodlo-oltc-setpoint'), '15.5');
    await user.type(screen.getByTestId('mvd-kreator-zrodlo-oltc-deadband'), '0.2');
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const [, , payload] = executeDomainOperationMock.mock.calls[0];
    expect(payload).toMatchObject({
      transformer_regulation_type: 'OLTC',
      transformer_control_mode: 'AUTOMATIC',
      transformer_voltage_setpoint_kv: 15.5,
      transformer_deadband_kv: 0.2,
      transformer_tap_min_position: -9,
      transformer_tap_max_position: 9,
      transformer_regulated_winding: 'HV',
    });
  });
});

/**
 * CV-4.3 K7 (karta K7-FE) — scenariusz MIN źródła sieciowego (warunki
 * przyłączenia OSD). Pola opcjonalne, ukryte w trybie impedancyjnym (brak
 * wariantu MIN), podgląd Ik″min obok Ik″max WYŁĄCZNIE z bloku
 * `scenariusz_min` odpowiedzi backendu (zero fizyki, zero fabrykacji).
 */
describe('KreatorZrodloZasilania — scenariusz MIN (CV-4.3 K7)', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    collapseSurfaceStackToMock.mockReset();
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({});
    navigateToSldMock.mockReset();
    fetchGridSourcePreviewMock.mockClear();
    fetchSourceSystemTypesMock.mockReset();
    fetchSourceSystemTypesMock.mockResolvedValue(DOMYSLNY_KATALOG_ZRODEL);
    appState.activeCaseId = 'case-1';
  });

  afterEach(cleanup);

  it('tryb ręczny (moc zwarciowa): pola Sk″min/Ik″min/R-X(MIN) są widoczne (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-tryb-przel-reczny'));

    expect(screen.getByTestId('mvd-kreator-zrodlo-min')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-sk3min')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-ik3min')).toBeTruthy();
    expect(screen.getByTestId('mvd-kreator-zrodlo-rxmin')).toBeTruthy();
  });

  it('tryb ręczny (impedancja): pola scenariusza MIN są ukryte (brak wariantu MIN, klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-tryb-przel-reczny'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-trybparam-IMPEDANCE'));

    expect(screen.queryByTestId('mvd-kreator-zrodlo-min')).toBeNull();
  });

  it('wpisanie Sk″min/Ik″min/R-X(MIN) natywną klawiaturą trafia do manual_equivalent zapisu', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-tryb-przel-reczny'));

    const sk3 = screen.getByTestId('mvd-kreator-zrodlo-sk3') as HTMLInputElement;
    await user.clear(sk3);
    await user.type(sk3, '250');
    const rx = screen.getByTestId('mvd-kreator-zrodlo-rx') as HTMLInputElement;
    await user.clear(rx);
    await user.type(rx, '0.1');
    const sk3Min = screen.getByTestId('mvd-kreator-zrodlo-sk3min') as HTMLInputElement;
    await user.type(sk3Min, '150');
    const rxMin = screen.getByTestId('mvd-kreator-zrodlo-rxmin') as HTMLInputElement;
    await user.type(rxMin, '0.2');
    // Tryb ręczny nie ma pozycji katalogu, więc napięcie SN i uziemienie podaje projektant.
    await wybierzNapiecieSn(user);
    await wybierzUziemienie(user);

    await user.click(krok('zapis'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const [, , payload] = executeDomainOperationMock.mock.calls[0];
    expect(payload).toMatchObject({
      manual_equivalent: expect.objectContaining({ sk3_min_mva: 150, rx_ratio_min: 0.2 }),
    });
  });

  it('podgląd backendu z blokiem scenariusz_min pokazuje Ik″min obok Ik″max', async () => {
    fetchGridSourcePreviewMock.mockResolvedValue({
      sk_mva: 310,
      ik3_ka: 11.93,
      ik1_ka: 8.1,
      ip_ka: 30.2,
      ith_ka: 11.9,
      kappa: 1.79,
      z1_ohm: { r_ohm: 0.09, x_ohm: 0.72 },
      z0_ohm: { r_ohm: 0.28, x_ohm: 2.3 },
      formula_ref: 'IEC60909',
      scenariusz_min: {
        sk_mva: 150,
        ik3_ka: 5.78,
        ik1_ka: 4.1,
        ip_ka: 14.6,
        ith_ka: 5.75,
        kappa: 1.75,
        z1_ohm: { r_ohm: 0.15, x_ohm: 1.2 },
        z0_ohm: null,
        tryb_danych: 'MOC_ZWARCIOWA',
        rx_ratio_zrodlo: 'MODEL_MIN',
      },
    });

    await renderujZPodgladem();

    expect(screen.getByTestId('mvd-kreator-zrodlo-podsum-sk-min')).toHaveTextContent('150.0 MVA');
    expect(screen.getByTestId('mvd-kreator-zrodlo-podsum-ik3-min')).toHaveTextContent('5.78 kA');

    // Przywróć domyślną odpowiedź (bez scenariusz_min) — nie przecieka do innych testów pliku.
    fetchGridSourcePreviewMock.mockResolvedValue({
      sk_mva: 310,
      ik3_ka: 11.93,
      ik1_ka: 8.1,
      ip_ka: 30.2,
      ith_ka: 11.9,
      kappa: 1.79,
      z1_ohm: { r_ohm: 0.09, x_ohm: 0.72 },
      z0_ohm: { r_ohm: 0.28, x_ohm: 2.3 },
      formula_ref: 'IEC60909',
    });
  });

  it('podgląd backendu BEZ bloku scenariusz_min nie renderuje wierszy MIN (zero fabrykacji)', async () => {
    await renderujZPodgladem();
    expect(screen.queryByTestId('mvd-kreator-zrodlo-podsum-sk-min')).toBeNull();
    expect(screen.queryByTestId('mvd-kreator-zrodlo-podsum-ik3-min')).toBeNull();
  });
});

/**
 * CV-4.3 K7c — napięcie zadane szyny bilansującej (`Source.u_set_pu`). Pole
 * ręcznego trybu, widoczne NIEZALEŻNIE od postaci parametru zwarciowego
 * (moc/impedancja) i strony (SN/WN) — backend czyta je bezwarunkowo przed
 * rozgałęzieniem na tryb (`_resolve_manual_source_equivalent`).
 */
describe('KreatorZrodloZasilania — napięcie zadane szyny bilansującej (CV-4.3 K7c)', () => {
  beforeEach(() => {
    closeFormMock.mockReset();
    collapseSurfaceStackToMock.mockReset();
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({});
    navigateToSldMock.mockReset();
    fetchGridSourcePreviewMock.mockClear();
    fetchSourceSystemTypesMock.mockReset();
    fetchSourceSystemTypesMock.mockResolvedValue(DOMYSLNY_KATALOG_ZRODEL);
    appState.activeCaseId = 'case-1';
  });

  afterEach(cleanup);

  it('tryb ręczny (moc zwarciowa): pole napięcia zadanego jest widoczne (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-tryb-przel-reczny'));

    expect(screen.getByTestId('mvd-kreator-zrodlo-uset')).toBeTruthy();
  });

  // Iloczyn cech: pole u_set_pu × tryb impedancyjny — w przeciwieństwie do
  // scenariusza MIN (ukrytego w trybie impedancyjnym), pole napięcia zadanego
  // NIE ma wyjątku trybu — zostaje widoczne w OBU postaciach parametru.
  it('tryb ręczny (impedancja): pole napięcia zadanego POZOSTAJE widoczne (brak wyjątku trybu, w przeciwieństwie do MIN)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-tryb-przel-reczny'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-trybparam-IMPEDANCE'));

    expect(screen.queryByTestId('mvd-kreator-zrodlo-min')).toBeNull();
    expect(screen.getByTestId('mvd-kreator-zrodlo-uset')).toBeTruthy();
  });

  it('tryb katalogowy: pole napięcia zadanego jest ukryte (manual_equivalent tego trybu nie dotyczy)', async () => {
    const user = userEvent.setup();
    await renderujKreator();
    await user.click(krok('zrodlo'));
    expect(screen.getByTestId('mvd-kreator-zrodlo-katalog-select')).toBeTruthy();
    expect(screen.queryByTestId('mvd-kreator-zrodlo-uset')).toBeNull();
  });

  it('wpisanie napięcia zadanego natywną klawiaturą trafia do manual_equivalent.u_set_pu zapisu', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-tryb-przel-reczny'));

    const sk3 = screen.getByTestId('mvd-kreator-zrodlo-sk3') as HTMLInputElement;
    await user.clear(sk3);
    await user.type(sk3, '250');
    const rx = screen.getByTestId('mvd-kreator-zrodlo-rx') as HTMLInputElement;
    await user.clear(rx);
    await user.type(rx, '0.1');
    const uSet = screen.getByTestId('mvd-kreator-zrodlo-uset') as HTMLInputElement;
    await user.type(uSet, '1.06');
    await wybierzNapiecieSn(user);
    await wybierzUziemienie(user);

    await user.click(krok('zapis'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const [, , payload] = executeDomainOperationMock.mock.calls[0];
    expect(payload).toMatchObject({
      manual_equivalent: expect.objectContaining({ u_set_pu: 1.06 }),
    });
  });

  it('puste pole napięcia zadanego → manual_equivalent BEZ klucza u_set_pu (zero fabrykacji, znamionowe)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-tryb-przel-reczny'));

    const sk3 = screen.getByTestId('mvd-kreator-zrodlo-sk3') as HTMLInputElement;
    await user.clear(sk3);
    await user.type(sk3, '250');
    const rx = screen.getByTestId('mvd-kreator-zrodlo-rx') as HTMLInputElement;
    await user.clear(rx);
    await user.type(rx, '0.1');
    await wybierzNapiecieSn(user);
    await wybierzUziemienie(user);

    await user.click(krok('zapis'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const [, , payload] = executeDomainOperationMock.mock.calls[0];
    const manual = (payload as { manual_equivalent: Record<string, unknown> }).manual_equivalent;
    expect('u_set_pu' in manual).toBe(false);
  });

  it('wartość spoza pasma 0,8-1,2: konflikt od razu przy polu, zapis wraca do pola (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-tryb-przel-reczny'));

    const sk3 = screen.getByTestId('mvd-kreator-zrodlo-sk3') as HTMLInputElement;
    await user.clear(sk3);
    await user.type(sk3, '250');
    const rx = screen.getByTestId('mvd-kreator-zrodlo-rx') as HTMLInputElement;
    await user.clear(rx);
    await user.type(rx, '0.1');
    const uSet = screen.getByTestId('mvd-kreator-zrodlo-uset') as HTMLInputElement;
    await user.type(uSet, '1.5');
    // KONFLIKT_TECHNICZNY widoczny od razu przy polu — bez klikania „Zapisz”.
    expect(screen.getByRole('alert').textContent).toMatch(/w paśmie 0.8–1.2 p.u./);

    await user.click(krok('zapis'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));

    expect(screen.getByTestId('mvd-kreator-krok-zrodlo')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('mvd-kreator-zrodlo-uset')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/w paśmie 0.8–1.2 p.u./);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});

/**
 * CV-4.3 K7c — synchronizacja pól katalogowych w `wybierzKatalog`. Naprawa
 * KLASY (nie instancji): `sn_voltage_kv`/`sk3_mva`/`rx_ratio` używały
 * `selected?.pole ?? p.pole`, więc pozycja katalogowa BEZ własnej wartości (np.
 * `rx_ratio`, pole opcjonalne kontraktu `SourceSystemCatalogType`) cicho
 * dziedziczyła wartość POPRZEDNIEJ pozycji zamiast `null` — dokładnie ten sam
 * defekt, który dane MIN (`sk3_min_mva`/`ik3_min_ka`/`rx_ratio_min`) już miały
 * naprawiony (karta K7-FE).
 */
describe('KreatorZrodloZasilania — synchronizacja katalogu przy przełączeniu pozycji (CV-4.3 K7c)', () => {
  const KATALOG_DWIE_POZYCJE = [
    DOMYSLNY_KATALOG_ZRODEL[0],
    {
      id: 'GPZ-002',
      name: 'Zasilanie GPZ 15 kV (bez R/X)',
      operator_name: 'OSD',
      series: null,
      catalog_number: 'SRC-2',
      voltage_rating_kv: 15,
      sk3_mva: 400,
      // rx_ratio CELOWO nieobecne — pozycja katalogowa bez wpisanego R/X (pole
      // opcjonalne `SourceSystemCatalogType.rx_ratio?: number`). Ten szczyt
      // reprodukuje dokładnie kombinację danych, w której sieroca wartość się
      // chowała (poprzednia pozycja MIAŁA rx_ratio, nowa go nie ma).
    },
  ];

  beforeEach(() => {
    closeFormMock.mockReset();
    collapseSurfaceStackToMock.mockReset();
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({});
    navigateToSldMock.mockReset();
    fetchGridSourcePreviewMock.mockClear();
    fetchSourceSystemTypesMock.mockReset();
    fetchSourceSystemTypesMock.mockResolvedValue(KATALOG_DWIE_POZYCJE);
    appState.activeCaseId = 'case-1';
  });

  afterEach(cleanup);

  it('przełączenie na pozycję BEZ R/X czyści sierocą wartość poprzedniej pozycji (zamiast ją zachować)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));

    const select = screen.getByTestId('mvd-kreator-zrodlo-katalog-select') as HTMLSelectElement;
    // Dwie pozycje na 15 kV — kreator nie wybiera pierwszej; projektant wybiera GPZ-001 (R/X=0,12).
    await screen.findByRole('option', { name: /Zasilanie GPZ 15 kV \(bez R\/X\)/ });
    expect(select.value).toBe('');
    await user.selectOptions(select, 'GPZ-001');

    await user.selectOptions(select, 'GPZ-002');
    await waitFor(() => expect(select.value).toBe('GPZ-002'));
    await wybierzUziemienie(user);

    await user.click(krok('zapis'));
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-zapisz'));

    // PRZED naprawą: R/X pozostawałoby sierocą wartością 0,12 z GPZ-001 (bo
    // `selected?.rx_ratio ?? p.rx_ratio` z `selected.rx_ratio===undefined` cicho
    // sięgało po `p.rx_ratio`), więc zapis przechodziłby mimo że GPZ-002 nie
    // niesie R/X. PO naprawie: przełączenie czyści R/X do `null`, walidacja
    // katalogowa („R/X musi pochodzić z wybranego katalogu systemowego")
    // blokuje zapis — obserwowalny dowód, że stara wartość NIE przecieka.
    expect(screen.getByTestId('mvd-kreator-zrodlo-katalog-select')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/nie ma Sk″ albo R\/X/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('przełączenie na pozycję BEZ R/X koryguje etykietę powiązania katalogowego do NOWEJ pozycji (Sk″ 400 MVA, nie 310)', async () => {
    const user = userEvent.setup();
    render(<KreatorZrodloZasilania />);
    await user.click(screen.getByTestId('mvd-kreator-zrodlo-dalej'));

    const select = screen.getByTestId('mvd-kreator-zrodlo-katalog-select') as HTMLSelectElement;
    await screen.findByRole('option', { name: /Zasilanie GPZ 15 kV \(bez R\/X\)/ });
    await user.selectOptions(select, 'GPZ-001');

    await user.selectOptions(select, 'GPZ-002');
    await waitFor(() => expect(select.value).toBe('GPZ-002'));

    // `wybranaPozycja` (etykieta „Powiązanie katalogowe") czyta z katalogu po
    // `catalog_ref` — niezależnie od pól kopiowanych do `dane` naprawionych
    // wyżej — więc Sk3 400 potwierdza, że przełączenie referencji faktycznie
    // wskazuje NOWĄ pozycję (kontekst dla testu powyżej, który dowodzi, że i
    // dane STANU formularza, nie tylko referencja, poszły za przełączeniem).
    // (dwa wystąpienia: opcja <select> i wiersz „Powiązanie katalogowe”.)
    expect(screen.getAllByText(/Sk3 400 MVA/).length).toBeGreaterThan(0);
  });
});
