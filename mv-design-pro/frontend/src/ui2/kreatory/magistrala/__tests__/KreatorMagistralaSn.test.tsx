/**
 * Testy kreatora „Wyprowadź magistralę SN" — realna ścieżka użytkownika
 * (render → wybór katalogu → natywny zapis → operacja domenowa → łańcuchowanie
 * kolejnego kroku), zgodnie z Zero-Debt §5. Mockowane są tylko store'y i
 * końcówki API — nie sam ekran. Migruje intencję testów retirowanego
 * ContinueTrunkForm do kanonu kreatory/rama.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { at } from '../../../../test/arrayAt';
import { KreatorMagistralaSn } from '../KreatorMagistralaSn';
import type { OcenaDoboruMagistraliResponse } from '../ocenaDoboruApi';
// Odpowiedzi trasy oceny policzone BACKENDEM (`scripts/eksport_fixtur_harnessu.py`, ta sama
// funkcja trasy) — rekordy werdyktu nie są pisane ręcznie w teście.
import scenaPrzekroczenie from '../../../../harness-fixtures/generated/magistrala_ocena_scena_przekroczenie.json';
import scenaCiag from '../../../../harness-fixtures/generated/magistrala_ocena_scena_ciag.json';
import scenaGranica from '../../../../harness-fixtures/generated/magistrala_ocena_scena_granica.json';
import scenaBrakDanych from '../../../../harness-fixtures/generated/magistrala_ocena_scena_brak_danych.json';
import scenaKatalogBazowy from '../../../../harness-fixtures/generated/magistrala_ocena_scena_katalog_bazowy.json';

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

// Szyna startowa ciągu 15 kV — źródło AUTO_PRZYJETE napięcia ciągu (topologia, nie stała).
const snapshotState = {
  snapshot: {
    buses: [{ id: 'bus-gpz-1', ref_id: 'bus-gpz-1', voltage_kv: 15 }],
    branches: [],
    bays: [],
    branch_points: [],
  },
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

// Karta W3-J (2026-09-16): `StanSpadkuNapiecia` (zastepca `WykresSpadku`) uzywa
// `useAkcjaUruchomObliczenie` -> `przejdzDoPrzestrzeni` -> `ui2/legacy/mostObszarow.ts`,
// ktory buduje tablice ROUTES.*.hash NA POZIOMIE MODULU — pelny mock (bez `importOriginal`)
// zostawial `ROUTES`/`ALIAS_ROUTES` niezdefiniowane i wywalal caly plik testowy przy
// imporcie. Wzorzec `importOriginal` jak w `ui2/wyniki/zwarcia/__tests__/rozplywZwarciowy.test.tsx`
// i `ui2/legacy/__tests__/legacyPasekNarzedzi.test.tsx` — realny ROUTES, nadpisany tylko navigateToSld.
vi.mock('../../../../ui/navigation/routes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../ui/navigation/routes')>()),
  navigateToSld: () => navigateToSldMock(),
}));

// `vi.hoisted` (nie zwykłe `const` nad `vi.mock`): S9-5 nadpisuje implementację
// per test (`mockReturnValueOnce`), żeby symulować katalog W TRAKCIE ładowania
// (Promise, który świadomie NIE rozstrzyga się w obrębie testu) — wymaga
// realnych `vi.fn()` dostępnych już w chwili ewaluacji hoistowanej fabryki
// `vi.mock` niżej, nie samej konwencji nazewniczej.
const { fetchCableTypesMock, fetchLineTypesMock } = vi.hoisted(() => {
  const KABLE_DOMYSLNE = [
    {
      id: 'kab-120',
      name: 'XRUHAKXS 1x120',
      r_ohm_per_km: 0.253,
      x_ohm_per_km: 0.118,
      rated_current_a: 255,
      voltage_rating_kv: 15,
      cross_section_mm2: 120,
    },
  ];
  const LINIE_DOMYSLNE = [
    {
      id: 'afl-70',
      name: 'AFL-6 70',
      r_ohm_per_km: 0.443,
      x_ohm_per_km: 0.36,
      rated_current_a: 230,
      voltage_rating_kv: 15,
      cross_section_mm2: 70,
    },
  ];
  return {
    fetchCableTypesMock: vi.fn(() => Promise.resolve(KABLE_DOMYSLNE)),
    fetchLineTypesMock: vi.fn(() => Promise.resolve(LINIE_DOMYSLNE)),
  };
});

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchCableTypes: () => fetchCableTypesMock(),
  fetchLineTypes: () => fetchLineTypesMock(),
}));

const { fetchOcenaMock } = vi.hoisted(() => ({ fetchOcenaMock: vi.fn() }));

vi.mock('../ocenaDoboruApi', () => ({
  fetchOcenaDoboruMagistrali: (...args: unknown[]) => fetchOcenaMock(...args),
}));

const SCENY: Record<string, OcenaDoboruMagistraliResponse> = {
  przekroczenie: scenaPrzekroczenie as unknown as OcenaDoboruMagistraliResponse,
  ciag: scenaCiag as unknown as OcenaDoboruMagistraliResponse,
  granica: scenaGranica as unknown as OcenaDoboruMagistraliResponse,
  brak_danych: scenaBrakDanych as unknown as OcenaDoboruMagistraliResponse,
  katalog_bazowy: scenaKatalogBazowy as unknown as OcenaDoboruMagistraliResponse,
};

async function pickCable() {
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-magistrala-katalog')).toBeInTheDocument();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-magistrala-katalog'), 'kab-120');
}

/** Krok „Długość i podgląd”: projektant podaje długość i cosφ (napięcie przyjęte z szyny). */
async function podajParametry(dlugosc = '500', cosPhi = '0.95') {
  if (!screen.queryByTestId('mvd-kreator-magistrala-dlugosc')) {
    await userEvent.click(screen.getByTestId('mvd-kreator-krok-parametry'));
  }
  await userEvent.type(screen.getByTestId('mvd-kreator-magistrala-dlugosc'), dlugosc);
  await userEvent.type(screen.getByTestId('mvd-kreator-magistrala-cosphi'), cosPhi);
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
    // `mockClear` (NIE `mockReset`): czyści historię wywołań, ale zachowuje
    // implementację domyślną (`vi.hoisted` powyżej) — `mockReset` wymazałby ją
    // i kolejne testy dostałyby katalog `undefined`.
    fetchCableTypesMock.mockClear();
    fetchLineTypesMock.mockClear();
    fetchOcenaMock.mockReset();
    fetchOcenaMock.mockResolvedValue(SCENY.przekroczenie);
  });

  afterEach(() => cleanup());

  it('tworzy pierwszy odcinek z pola SN i łańcuchuje wstawienie stacji', async () => {
    executeDomainOperationMock.mockResolvedValue(successResponse);
    render(<KreatorMagistralaSn />);
    await pickCable();
    await podajParametry();

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

  it('krok parametrów: panel teorii renderuje wzory ΔU i Ith przez KaTeX (math-rendered, klik natywny)', async () => {
    // Zasada wywodów KaTeX (2026-07-22): ΔU ≈ (R·P+X·Q)/U, straty ∝ I²·R oraz
    // Ith ≥ Ik·√tk renderuje KaTeX, nie surowy tekst.
    render(<KreatorMagistralaSn />);
    await pickCable();
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(3);
    const latexy = wzory.map((w) => w.getAttribute('data-latex') ?? '');
    expect(latexy.some((l) => l.includes('\\Delta U \\approx'))).toBe(true);
    expect(latexy.some((l) => l.includes('\\sqrt{t_k}'))).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('następny krok „ZK SN" jest realną akcją i łańcuchuje wstawienie ZK SN', async () => {
    executeDomainOperationMock.mockResolvedValue(successResponse);
    render(<KreatorMagistralaSn />);
    await pickCable();

    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await podajParametry();
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
    await podajParametry();
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

    // Drugi odcinek: długość każdego odcinka jest jego własna — kreator NIE przenosi
    // poprzedniej (próba zapisu wskazuje długość); cosφ i napięcie ciągu zostają.
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));
    expect(screen.getByTestId('mvd-kreator-magistrala-dlugosc')).toHaveFocus();
    expect((screen.getByTestId('mvd-kreator-magistrala-cosphi') as HTMLInputElement).value).toBe('0.95');
    await userEvent.type(screen.getByTestId('mvd-kreator-magistrala-dlugosc'), '300');
    // Kontynuacja z końca poprzedniego (from_terminal_id = koniec ciągu).
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
    await podajParametry();
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-magistrala-next'), 'continue');
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-magistrala-zakoncz')).toBeInTheDocument());

    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zakoncz'));
    expect(closeFormMock).toHaveBeenCalled();
    expect(navigateToSldMock).toHaveBeenCalled();
  });

  // Intencja dawnych testów „zapis zablokowany”: bez startu i bez przypadku operacja nie
  // rusza — w nowym kanonie przez jedno wskazanie przy próbie zapisu; `data-status`
  // nadal jest jednym źródłem prawdy z `disabled` (rama wyprowadza oba z blokady).
  it('bez startu ciągu: zapis klikalny, próba zapisu nazywa brak startu', async () => {
    context = {};
    render(<KreatorMagistralaSn />);
    await screen.findByRole('option', { name: /XRUHAKXS 1x120/ });

    expect(screen.getByTestId('mvd-kreator-magistrala-brak-startu')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-magistrala-zapisz')).toBeEnabled();
    expect(screen.getByTestId('mvd-kreator-magistrala')).toHaveAttribute('data-status', 'gotowy');
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie')).toBeInTheDocument();
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('bez aktywnego przypadku: próba zapisu wskazuje przypadek', async () => {
    appState.activeCaseId = null;
    render(<KreatorMagistralaSn />);
    await pickCable();
    await podajParametry();
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/aktywny przypadek/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('świeży kreator: bez alertu; napięcie z szyny startowej w polu (edytowalne); długość i cosφ puste', async () => {
    render(<KreatorMagistralaSn />);
    await screen.findByRole('option', { name: /XRUHAKXS 1x120/ });
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(screen.getByTestId('mvd-kreator-krok-parametry'));
    expect(screen.getByTestId('mvd-kreator-magistrala-napiecie')).toHaveValue(15);
    expect(screen.getByTestId('mvd-kreator-magistrala-napiecie')).toBeEnabled();
    expect(screen.queryByText(/przyjęto/)).toBeNull();
    expect((screen.getByTestId('mvd-kreator-magistrala-dlugosc') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('mvd-kreator-magistrala-cosphi') as HTMLInputElement).value).toBe('');
    // Bez cosφ ocena spadku nie jest wołana (interfejs nie podstawia 0,95), a kreator milczy:
    // żadnej ramy „ocena wymaga…” w trakcie pracy (kontrakt prowadzenia 2026-10-15).
    expect(fetchOcenaMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mvd-kreator-magistrala-ocena-karty')).toBeNull();
    expect(screen.queryByTestId('mvd-kreator-magistrala-ocena')).toBeNull();
  });

  it('jedyna pozycja katalogu dla rodzaju stoi w polu; próba zapisu wskazuje długość', async () => {
    render(<KreatorMagistralaSn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-magistrala-katalog')).toHaveValue('kab-120'));
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));
    expect(screen.getByTestId('mvd-kreator-magistrala-dlugosc')).toHaveFocus();
    expect(screen.getByTestId('mvd-kreator-wskazanie').textContent).toMatch(/^Podaj długość odcinka — /);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('konflikty widoczne od razu przy polu: cosφ > 1 i długość niedodatnia', async () => {
    render(<KreatorMagistralaSn />);
    await pickCable();
    await userEvent.click(screen.getByTestId('mvd-kreator-krok-parametry'));
    await userEvent.type(screen.getByTestId('mvd-kreator-magistrala-cosphi'), '1.2');
    expect(screen.getByRole('alert').textContent).toMatch(/cosφ musi być w zakresie/);
    await userEvent.type(screen.getByTestId('mvd-kreator-magistrala-dlugosc'), '0');
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain('Długość odcinka musi być dodatnia.');
  });

  /**
   * S9-5 (`karta_e2e_s95.md`) — PRZYCZYNA nazwana w kodzie: `zapisZablokowany`
   * (`KreatorMagistralaSn.tsx`) w OGÓLE nie sprawdzał, czy katalog kabli/linii
   * (`GET /api/catalog/...`, efekt montujący komponent) już doszedł — przycisk
   * „Zapisz" był klikalny od pierwszego renderu, niezależnie od tego async
   * zależności. Test poniżej pokrywa dokładnie ILOCZYN CECH z karty: „katalog
   * jeszcze się ładuje" (fetch świadomie nierozstrzygnięty w tym teście) ×
   * „pole poprawne" (`dlugosc_m` ma poprawną wartość domyślną z
   * `DANE_DOMYSLNE`, zanim użytkownik cokolwiek wpisze) → zapis MUSI być
   * zablokowany, i to JAWNIE (komunikat w stopce), nie w ciszy.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × pole poprawne → zapis zablokowany z komunikatem, nie w ciszy', async () => {
    fetchCableTypesMock.mockReturnValueOnce(new Promise(() => {}));
    fetchLineTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorMagistralaSn />);

    // Katalog NIGDY nie rozstrzygnie się w tym teście (Promise zawieszony celowo).
    expect(screen.getByTestId('mvd-kreator-magistrala-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-magistrala')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-blokada').textContent).toMatch(/katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * S9-5 — test PRZEJŚCIA disabled→enabled po realnym wpisaniu długości
   * (`userEvent.type`, nie `fireEvent`), tą samą ścieżką co spec e2e
   * `s95-budowa-z-kanwy.spec.ts` (`zapiszMagistrale`): katalog → „Dalej" →
   * długość → sygnał gotowości `data-status="gotowy"` I dopiero wtedy
   * `toBeEnabled`. Regresja tej ścieżki na poziomie jednostkowym jest
   * milisekundowa — nie wymaga realnego backendu ani przeglądarki.
   */
  // Intencja dawnego testu przejścia disabled→enabled w nowym kanonie: zapis jest klikalny
  // przez cały czas (data-status „gotowy”), a pusta długość daje wskazanie, nie wyszarzenie;
  // po wpisaniu długości (userEvent.type) ten sam klik zapisuje odcinek.
  it('pusta długość: klik zapisu wskazuje pole; po wpisaniu długości ten sam klik zapisuje', async () => {
    executeDomainOperationMock.mockResolvedValue(successResponse);
    render(<KreatorMagistralaSn />);
    await pickCable();
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));

    expect(screen.getByTestId('mvd-kreator-magistrala-zapisz')).toBeEnabled();
    expect(screen.getByTestId('mvd-kreator-magistrala')).toHaveAttribute('data-status', 'gotowy');
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));
    expect(screen.getByTestId('mvd-kreator-magistrala-dlugosc')).toHaveFocus();

    await userEvent.type(screen.getByTestId('mvd-kreator-magistrala-dlugosc'), '300');
    expect(screen.queryByTestId('mvd-kreator-wskazanie')).toBeNull();
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
  });
});

/**
 * Karta MAGISTRALA-OCENA — warstwa „render kreatora" iloczynu cech: kryterium {obciążalność,
 * spadek odcinka, spadek ciągu} × stan {spełnia (scena ciągu 20 kV), nie spełnia (15 kV),
 * na granicy (20 kV, I_B = I_z), brak danych (20 kV), podstawa nieustalona (15 kV)}.
 * Kreator NIE rozstrzyga niczego: każda etykieta i semantyka jest przepisana z rekordu,
 * a w DOM nie ma gołego „OK" ani progu.
 */
describe('KreatorMagistralaSn — ocena doboru z backendu (rekordy werdyktu)', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { terminal_id: 'bus-gpz-1', terminal_voltage_label: 'SN' };
    fetchOcenaMock.mockReset();
    executeDomainOperationMock.mockReset();
  });

  afterEach(() => cleanup());

  for (const [nazwa, scena] of Object.entries(SCENY)) {
    it(`scena „${nazwa}": karty i plakietki przepisują status, etykietę i semantykę z rekordów`, async () => {
      fetchOcenaMock.mockResolvedValue(scena);
      render(<KreatorMagistralaSn />);
      await pickCable();
      await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
      await podajParametry();

      const wszystkie = [...scena.oceny_odcinka, scena.ocena_ciagu];
      // Rekord NIE_OCENIONO (praca w toku) nie dostaje karty ani plakietki — cisza; reszta
      // przepisana 1:1 z rekordu (status, etykieta, semantyka, wyjaśnienie).
      const nieocenione = wszystkie.filter((r) => r.status_maszynowy === 'NIE_OCENIONO');
      const rekordy = wszystkie.filter((r) => r.status_maszynowy !== 'NIE_OCENIONO');
      if (rekordy.length > 0) {
        await screen.findByTestId(`mvd-werdykt-${rekordy[0].kryterium_id}`);
      } else {
        await waitFor(() => expect(fetchOcenaMock).toHaveBeenCalled());
      }
      for (const rekord of nieocenione) {
        expect(screen.queryByTestId(`mvd-werdykt-${rekord.kryterium_id}`)).toBeNull();
        expect(screen.queryByTestId(`mvd-kreator-magistrala-ocena-${rekord.kryterium_id}`)).toBeNull();
      }
      expect(document.body.textContent).not.toMatch(/Ocena niewykonana|nieoceniono/i);
      if (rekordy.length === 0) {
        expect(screen.queryByTestId('mvd-kreator-magistrala-ocena-karty')).toBeNull();
        expect(screen.queryByTestId('mvd-kreator-magistrala-ocena')).toBeNull();
        return;
      }
      for (const rekord of rekordy) {
        const karta = await screen.findByTestId(`mvd-werdykt-${rekord.kryterium_id}`);
        expect(karta).toHaveAttribute('data-semantyka', rekord.etykieta.semantyka);
        expect(within(karta).getByTestId(`mvd-werdykt-${rekord.kryterium_id}-etykieta`).textContent).toBe(
          rekord.etykieta.etykieta_pl,
        );
        expect(karta.textContent).toContain(rekord.wyjasnienie.zdanie_pl);
        for (const brak of rekord.wyjasnienie.czego_brakuje) expect(karta.textContent).toContain(brak);
        const plakietka = screen.getByTestId(`mvd-kreator-magistrala-ocena-${rekord.kryterium_id}`);
        expect(plakietka).toHaveAttribute('data-status', rekord.status_maszynowy);
        expect(plakietka.textContent).toBe(rekord.etykieta.etykieta_pl);
      }
      // Zero werdyktu spoza rekordu: żadnego gołego „OK" ani „Do sprawdzenia".
      const ocena = screen.getByTestId('mvd-kreator-magistrala-ocena');
      expect(ocena.textContent).not.toMatch(/\bOK\b|Do sprawdzenia|Przekroczona/);
      expect(screen.getByTestId('mvd-kreator-magistrala-gotowosc').textContent).not.toMatch(/\bOK\b|Przekroczona/);
    });
  }

  it('żądanie oceny niesie wartości pól (prąd roboczy wprost, brak = null), nie próg ani sumę', async () => {
    fetchOcenaMock.mockResolvedValue(SCENY.przekroczenie);
    render(<KreatorMagistralaSn />);
    await pickCable();
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await podajParametry();
    await waitFor(() => expect(fetchOcenaMock).toHaveBeenCalled());
    const bezPradu = at(fetchOcenaMock.mock.calls, -1)?.[0] as Record<string, unknown>;
    expect(bezPradu).toMatchObject({
      napiecie_kv: 15,
      odcinek: { rodzaj: 'KABEL', catalog_ref: 'kab-120', dlugosc_m: 500, prad_roboczy_a: null },
      odcinki_zbudowane: [],
    });
    await userEvent.type(screen.getByTestId('mvd-kreator-magistrala-prad'), '300');
    await waitFor(() => {
      const ostatnie = at(fetchOcenaMock.mock.calls, -1)?.[0] as { odcinek: { prad_roboczy_a: number | null } };
      expect(ostatnie.odcinek.prad_roboczy_a).toBe(300);
    });
  });

  it('builder: po „Kolejny odcinek" ocena ciągu dostaje zapisany odcinek, liczby ciągu z backendu', async () => {
    fetchOcenaMock.mockResolvedValue(SCENY.ciag);
    executeDomainOperationMock.mockResolvedValue(successResponse);
    render(<KreatorMagistralaSn />);
    await pickCable();
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await podajParametry();
    await userEvent.type(screen.getByTestId('mvd-kreator-magistrala-prad'), '200');
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-dalej'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-magistrala-next'), 'continue');
    await userEvent.click(screen.getByTestId('mvd-kreator-magistrala-zapisz'));
    await waitFor(() => {
      const ostatnie = at(fetchOcenaMock.mock.calls, -1)?.[0] as { odcinki_zbudowane: unknown[] };
      expect(ostatnie.odcinki_zbudowane).toEqual([
        { rodzaj: 'KABEL', catalog_ref: 'kab-120', dlugosc_m: 500, prad_roboczy_a: 200, cos_phi: 0.95, nazwa: null },
      ]);
    });
    const builder = screen.getByTestId('mvd-kreator-magistrala-builder');
    // Długość i spadek ciągu przepisane z odpowiedzi backendu (scena: 2000 m, ΔU ciągu).
    expect(builder.textContent).toContain('2.00 km');
    expect(builder.textContent).toContain(`${SCENY.ciag.ciag.delta_u_pct?.toFixed(2)} %`);
  });

  it('błąd trasy oceny: komunikat zamiast rekordów, bez rozstrzygnięcia w UI', async () => {
    fetchOcenaMock.mockRejectedValue(new Error('Ocena doboru odcinka niedostępna — backend nie odpowiedział.'));
    render(<KreatorMagistralaSn />);
    await pickCable();
    await podajParametry();
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-magistrala-ocena').textContent).toContain('niedostępna'),
    );
    expect(screen.queryByTestId('mvd-werdykt-magistrala_sn.obciazalnosc_odcinka')).toBeNull();
  });
});
