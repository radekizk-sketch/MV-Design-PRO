/**
 * Testy kreatora „Dodaj źródło OZE/DER" — realna ścieżka użytkownika (Zero-Debt §5).
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorZrodlaOze } from '../KreatorZrodlaOze';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();

// D4: po zapisie kreator uruchamia auto-bieg + składa raport/BOM z backendu.
// Mockujemy klienta dokumentów, aby ćwiczyć realną ścieżkę UI deterministycznie.
const uruchomAutoBiegMock = vi.fn();
const fetchRaportMock = vi.fn();
const fetchBomMock = vi.fn();
vi.mock('../podsumowanieApi', () => ({
  uruchomAutoBieg: (...args: unknown[]) => uruchomAutoBiegMock(...args),
  fetchRaportZgodnosci: (...args: unknown[]) => fetchRaportMock(...args),
  fetchListaMaterialowa: (...args: unknown[]) => fetchBomMock(...args),
}));

// K9-A: sekwencja zapisu — wiązania aparaturowe i profile idą kanałem wiązań
// wytwórcy (żądanie zmiany wiązań). Mock pozwala asertować payload i symulować
// częściowe niepowodzenie sekwencji.
const patchDerCatalogBindingsMock = vi.fn();
vi.mock('../../../../ui/sld/v2/canvas/derPersistenceApi', () => ({
  DerPersistenceApiError: class DerPersistenceApiError extends Error {},
  patchDerCatalogBindings: (...args: unknown[]) => patchDerCatalogBindingsMock(...args),
}));

const appState: { activeCaseId: string | null; activeProjectId: string | null } = {
  activeCaseId: 'case-1',
  activeProjectId: 'proj-1',
};
const resolved: { station: string | null; bus: string | null; busSn: string | null } = {
  station: 'st-1',
  bus: 'bus-nn-1',
  busSn: 'bus-sn-1',
};
const snapshotState = {
  error: null as string | null,
  snapshot: { substations: [], transformers: [] },
  executeDomainOperation: executeDomainOperationMock,
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
  useNetworkBuildStore: (selector: (s: { closeOperationForm: typeof closeFormMock }) => unknown) =>
    selector({ closeOperationForm: closeFormMock }),
  useActiveOperationContext: () => ({}),
}));

vi.mock('../../../../ui/network-build/forms/enmResolvers', () => ({
  resolveStationRef: () => resolved.station,
  resolveBusNnRef: () => resolved.bus,
  resolveBusSnRef: () => resolved.busSn,
  listSnBusOptions: () =>
    resolved.busSn ? [{ ref_id: resolved.busSn, name: 'Szyna SN', voltage_kv: 15 }] : [],
  // K9-A O12: istniejące pola odpływowe nN rozdzielni (wybór umiejscowienia).
  listNnFeederOptions: () =>
    resolved.bus
      ? [{ ref_id: 'bay-feeder-1', name: 'Odpływ F1', kind: 'ODPLYW_NN', bus_ref: resolved.bus }]
      : [],
  stationLabel: () => 'Rozdzielnia ST-1',
}));

vi.mock('../../../../ui/navigation/routes', () => ({
  navigateToSld: () => navigateToSldMock(),
}));

// R5 (karta FAB-K, wzorzec E2E-S95): `vi.hoisted` (nie zwykłe `const` nad
// `vi.mock`) — testy gotowości nadpisują implementację per test
// (`mockReturnValueOnce`), żeby symulować katalog przekształtników/aparatury
// nN W TRAKCIE ładowania (Promise, który świadomie NIE rozstrzyga się w
// obrębie testu) — ten sam wzorzec co `KreatorMagistralaSn.test.tsx`.
const DOMYSLNE_KONWERTERY = [
  {
    id: 'conv-pv-1',
    name: 'Falownik PV 1',
    manufacturer: 'Producent testowy',
    kind: 'PV',
    un_kv: 0.4,
    sn_mva: 1.0,
    pmax_mw: 0.9,
    qmin_mvar: -0.3,
    qmax_mvar: 0.3,
    ptpiree_certificate_ref: 'CERT-1',
  },
];
const DOMYSLNE_APARATY = [{ id: 'apar-1', name: 'Wyłącznik nN', u_n_kv: 0.4, i_n_a: 630 }];
const { fetchConverterTypesMock, fetchLvApparatusTypesMock } = vi.hoisted(() => ({
  fetchConverterTypesMock: vi.fn(),
  fetchLvApparatusTypesMock: vi.fn(),
}));

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchConverterTypes: () => fetchConverterTypesMock(),
  fetchLvApparatusTypes: () => fetchLvApparatusTypesMock(),
  // K9-A: katalogi kroku „Aparatura pola".
  fetchCtTypes: () =>
    Promise.resolve([
      { id: 'ct-1', name: 'CT 100/5', ratio_primary_a: 100, ratio_secondary_a: 5, accuracy_class: '5P10' },
    ]),
  fetchVtTypes: () =>
    Promise.resolve([
      { id: 'vt-1', name: 'VT 15000/100', ratio_primary_v: 15000, ratio_secondary_v: 100, accuracy_class: '0.5' },
    ]),
  fetchProtectionDeviceTypes: () =>
    Promise.resolve([{ id: 'zab-1', name: 'Zabezpieczenie testowe', model: 'ZAB-TEST-1' }]),
}));

// Karta FAB-J: profil NC RfG + krzywe ride-through i P(f) WYŁĄCZNIE z backendu
// (`derRemoteCatalogs.ts` / `audit2-api.ts`) — mock na granicy modułu klienta,
// ten sam wzorzec co `ui/catalog/api` powyżej. Identyfikator operatora jest
// REALNY (`pse`, nie wymyślone przez front `ncrfg_pse`).
vi.mock('../../../../ui/network-build/station-der/derRemoteCatalogs', () => ({
  fetchNcRfgOperators: () =>
    Promise.resolve([
      {
        operator_id: 'pse',
        operator_name_pl: 'PSE — Polskie Sieci Elektroenergetyczne',
        last_revision: '2024-Q4',
        reactive_power: { q_range_pct_pn_min: -0.33, q_range_pct_pn_max: 0.33, cos_phi_min: 0.95, voltage_control_modes: [] },
        ride_through: {
          lvrt: [{ time_s: 0, voltage_pu: 0.05 }],
          hvrt: [{ time_s: 0, voltage_pu: 1.3 }],
        },
      },
    ]),
  getNcRfgOperator: (
    operators: ReadonlyArray<{ operator_id: string }>,
    operatorId: string | null,
  ) => (operatorId ? operators.find((o) => o.operator_id === operatorId) ?? null : null),
}));
vi.mock('../../../../ui/network-build/station-der/audit2-api', () => ({
  fetchAudit2CatalogSnapshot: () =>
    Promise.resolve({
      bess_operation_modes: [],
      tap_changers: [],
      hv_fuses: [],
      device_withstand: [],
      pf_curves: [
        {
          id: 'pf_droop_5', catalog_namespace: 'pf_curve', catalog_version: '1.0',
          label_pl: 'P(f) statyzm 5%', f_ref_hz: 50, droop_percent: 5,
          f_min_hz: 47.5, f_max_hz: 51.5, deadband_hz: 0.2, zrodlo_pl: 'Fikstura testowa',
        },
      ],
      block_transformers: [],
      mv_neutral_groundings: [],
    }),
}));

describe('KreatorZrodlaOze — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    appState.activeProjectId = 'proj-1';
    resolved.station = 'st-1';
    resolved.bus = 'bus-nn-1';
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    uruchomAutoBiegMock.mockReset();
    fetchRaportMock.mockReset();
    fetchBomMock.mockReset();
    patchDerCatalogBindingsMock.mockReset();
    patchDerCatalogBindingsMock.mockResolvedValue({ error: null });
    uruchomAutoBiegMock.mockResolvedValue('DONE');
    fetchRaportMock.mockResolvedValue(null);
    fetchBomMock.mockResolvedValue(null);
    fetchConverterTypesMock.mockReset();
    fetchConverterTypesMock.mockResolvedValue(DOMYSLNE_KONWERTERY);
    fetchLvApparatusTypesMock.mockReset();
    fetchLvApparatusTypesMock.mockResolvedValue(DOMYSLNE_APARATY);
    // Readout osi gotowości wytwórcy pobiera dane z modelu przez fetch.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            generator_ref: 'gen-1',
            macierz: {},
            osie: [
              { axis: 'sc_3f', label_pl: 'Zwarcie trójfazowe', status: 'ready', blockers: [] },
              {
                axis: 'protection',
                label_pl: 'Zabezpieczenia',
                status: 'blocked',
                blockers: [
                  {
                    code: 'der.protection.missing',
                    message_pl: 'Brak zabezpieczenia pola wytwórcy.',
                    object_ref: 'gen-1',
                    target_screen: 'wytworca',
                    target_tab: 'aparatura',
                  },
                ],
              },
            ],
            podsumowanie: { ready: 1, blocked: 1 },
          }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('dodaje źródło PV (nn_side, nowe pole) operacją add_converter_source', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorZrodlaOze />);
    // Krok 2: wybór falownika z katalogu.
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-oze-konwerter')).toBeInTheDocument();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-konwerter'), 'conv-pv-1');
    // Aparat nowego pola (krok 1 był domyślnie NEW_FIELD) — wróć i uzupełnij.
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-wstecz'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparat'), 'apar-1');

    await userEvent.click(screen.getByTestId('mvd-kreator-oze-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'add_converter_source',
        expect.objectContaining({
          source_technology: 'PV',
          connection_variant: 'nn_side',
          station_ref: 'st-1',
          bus_nn_ref: 'bus-nn-1',
          control_mode: 'STALY_COS_PHI',
          catalog_binding: expect.objectContaining({ catalog_namespace: 'ZRODLO_NN_PV', catalog_item_id: 'conv-pv-1' }),
        }),
      );
    });
    // D4: po zapisie kreator uruchamia auto-bieg i pokazuje podsumowanie (nie zamyka od razu).
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-oze-podsumowanie')).toBeInTheDocument();
    });
    expect(uruchomAutoBiegMock).toHaveBeenCalledWith('case-1');
    expect(fetchRaportMock).toHaveBeenCalled();
    expect(fetchBomMock).toHaveBeenCalled();
    // Zamknięcie następuje dopiero po akcji „Zakończ".
    expect(closeFormMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-zakoncz'));
    expect(closeFormMock).toHaveBeenCalled();
  });

  it('po zapisie renderuje raport zgodności i BOM z backendu 1:1 (D4 wymaganie 13+BOM)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    uruchomAutoBiegMock.mockResolvedValue('DONE');
    fetchRaportMock.mockResolvedValue({
      wersja: '1.0',
      source_ref: 'gen-1',
      source_name: 'Blok PV SN',
      werdykt: 'ZGODNY_Z_UWAGAMI',
      komunikat_krytyczny: null,
      pozycje: [
        {
          check_id: 'napiecie_sn',
          kategoria: 'walidacja_D1',
          status: 'PASS',
          code: 'der_sn.ok.napiecie_sn',
          message_pl: '✓ Strona SN TR blokowego zgodna z napięciem szyny SN.',
        },
        {
          check_id: 'converter.der_sn.kaskada_prad_pole_brak',
          kategoria: 'kaskada_pradowa',
          status: 'WARN',
          code: 'converter.der_sn.kaskada_prad_pole_brak',
          message_pl: '⚠️ Kaskada prądowa: pominięto ogniwo prądu znamionowego pola SN.',
        },
      ],
      podsumowanie: { pass: 1, warn: 1, fail: 0, razem: 2 },
    });
    fetchBomMock.mockResolvedValue({
      wersja: '1.0',
      source_ref: 'gen-1',
      source_name: 'Blok PV SN',
      pozycje: [
        {
          lp: 1,
          kategoria: 'transformator_blokowy',
          element: 'Transformator blokowy DER',
          catalog_ref: 'tr-sn-nn-15-04-1000kva-dyn11',
          ref_id: 'tr-1',
          parametry: { sn_mva: 1.0, grupa_polaczen: 'Dyn11' },
          ilosc: 1,
          jednostka: 'szt.',
        },
      ],
      count: 1,
      braki_ogniw: [],
    });

    render(<KreatorZrodlaOze />);
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-konwerter')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-konwerter'), 'conv-pv-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-wstecz'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparat'), 'apar-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-zapisz'));

    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-oze-werdykt')).toHaveTextContent('Projekt zgodny z uwagami');
    });
    // Komunikaty walidacji 1:1 z backendu (bez parafraz w UI).
    expect(screen.getByTestId('mvd-kreator-oze-check-napiecie_sn')).toHaveTextContent(
      '✓ Strona SN TR blokowego zgodna z napięciem szyny SN.',
    );
    expect(screen.getByTestId('mvd-kreator-oze-status-tekst')).toHaveTextContent('ukończony');
    // BOM z materializowanych elementów.
    expect(screen.getByTestId('mvd-kreator-oze-bom-tabela')).toHaveTextContent('tr-sn-nn-15-04-1000kva-dyn11');
  });

  it('auto-bieg wyłączony: dokumenty bez statusu biegu (opt-in)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorZrodlaOze />);
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-konwerter')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-konwerter'), 'conv-pv-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-wstecz'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparat'), 'apar-1');
    // Przejdź do kroku „Podsumowanie i zapis" (tech → katalog → aparatura → zgodność
    // → regulacja → zapis) i wyłącz auto-bieg.
    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    }
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-autobieg-toggle')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-autobieg-toggle'), 'nie');
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-zapisz'));

    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-podsumowanie')).toBeInTheDocument());
    expect(uruchomAutoBiegMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('mvd-kreator-oze-status-tekst')).toHaveTextContent('pominięty');
  });

  it('prezentuje komunikat błędu walidacji z backendu 1:1 (D1 wymaganie 5)', async () => {
    // Backend jest jedynym źródłem prawdy walidacji doborowej — kreator prezentuje
    // jego komunikat verbatim (np. niewystarczająca moc TR blokowego DER-SN).
    const komunikat =
      '❌ Moc transformatora jest niewystarczająca (ΣS=1 MVA > dopuszczalne 0.63 MVA).';
    executeDomainOperationMock.mockResolvedValue({
      error: komunikat,
      error_code: 'converter.der_sn.moc_transformatora_niewystarczajaca',
    });
    render(<KreatorZrodlaOze />);
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-oze-konwerter')).toBeInTheDocument();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-konwerter'), 'conv-pv-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-wstecz'));
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparat'), 'apar-1');

    await userEvent.click(screen.getByTestId('mvd-kreator-oze-zapisz'));

    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-blad')).toHaveTextContent(komunikat);
    });
    expect(closeFormMock).not.toHaveBeenCalled();
  });

  it('krok regulacji: cosφ dla stałego cosφ, nachylenie Q(U) po zmianie trybu (G-OZE-B3)', async () => {
    render(<KreatorZrodlaOze />);
    // Przejdź do kroku regulacji: tech → katalog → aparatura → zgodność → regulacja.
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-konwerter')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-tryb')).toBeInTheDocument());

    // Domyślnie STALY_COS_PHI → pole cosφ widoczne, brak pola nachylenia Q(U).
    expect(screen.getByTestId('mvd-kreator-oze-cosphi')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kreator-oze-qu-slope')).not.toBeInTheDocument();

    // Zmiana trybu na Q(U) → pole nachylenia + napięciowe pasmo nieczułości, znika pole cosφ.
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-tryb'), 'Q_OD_U');
    expect(screen.getByTestId('mvd-kreator-oze-qu-slope')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-oze-qu-db-low')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-oze-qu-db-high')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kreator-oze-cosphi')).not.toBeInTheDocument();

    // Pasmo nieczułości P(f) pojawia się dopiero po podaniu statyzmu.
    expect(screen.queryByTestId('mvd-kreator-oze-deadband')).not.toBeInTheDocument();
    await userEvent.type(screen.getByTestId('mvd-kreator-oze-statyzm'), '5');
    expect(screen.getByTestId('mvd-kreator-oze-deadband')).toBeInTheDocument();

    // Panel teorii + charakterystyki NC RfG (G-OZE-B5) obecny, z żywym wykresem SVG.
    const teoria = screen.getByTestId('mvd-kreator-oze-teoria');
    expect(teoria).toBeInTheDocument();
    expect(teoria.querySelector('svg')).not.toBeNull();

    // Zasada wywodów KaTeX (2026-07-22): wzory teorii Q(U) (Q = 0 w paśmie) i pomocy
    // pól renderuje KaTeX (math-rendered), nie surowy tekst.
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(2);
    expect(wzory.some((w) => (w.getAttribute('data-latex') ?? '').includes('Q = 0'))).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('K9-A: sekwencja zapisu — wiązania aparaturowe, profile, tryb pracy i limity Q idą do modelu', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      changes: { created_element_ids: ['gen-1'] },
    });
    render(<KreatorZrodlaOze />);

    // tech: aparat nowego pola.
    await screen.findByRole('option', { name: /Wyłącznik nN/ });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparat'), 'apar-1');
    // katalog: falownik.
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-konwerter')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-konwerter'), 'conv-pv-1');
    // aparatura: CT, VT, zabezpieczenie + referencja danych zwarciowych (bez katalogu).
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-aparatura')).toBeInTheDocument());
    await screen.findByRole('option', { name: /CT 100\/5/ });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparatura-ct'), 'ct-1');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparatura-vt'), 'vt-1');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparatura-zabezpieczenie'), 'zab-1');
    await userEvent.type(screen.getByTestId('mvd-kreator-oze-aparatura-dane-zwarciowe'), 'DOK-ZW-1');
    // zgodność: profil operatora + krzywe.
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-zgodnosc')).toBeInTheDocument());
    // Karta FAB-J: LVRT/HVRT nie są już niezależnie wybieralne (read-only,
    // tożsamościowo związane z profilem operatora) — jedyny wybór to profil + P(f).
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-oze-zgodnosc-profil')).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-zgodnosc-profil'), 'pse');
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-oze-zgodnosc-pf')).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-zgodnosc-pf'), 'pf_droop_5');
    // regulacja: tryb pracy + limity Q.
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-tryb-pracy')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-tryb-pracy'), 'praca_sieciowa');
    await userEvent.type(screen.getByTestId('mvd-kreator-oze-qmin'), '-0.2');
    await userEvent.type(screen.getByTestId('mvd-kreator-oze-qmax'), '0.2');
    // zapis (bez auto-biegu — sekwencja mierzalna deterministycznie).
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-autobieg-toggle')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-autobieg-toggle'), 'nie');
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-zapisz'));

    // Wiązania + profile jednym żądaniem zmiany wiązań wytwórcy.
    await waitFor(() => {
      expect(patchDerCatalogBindingsMock).toHaveBeenCalledWith('proj-1', 'case-1', 'gen-1', {
        ct_catalog_ref: 'ct-1',
        vt_catalog_ref: 'vt-1',
        protection_catalog_ref: 'zab-1',
        fault_current_data_ref: 'DOK-ZW-1',
        // Karta FAB-J: LVRT/HVRT tożsamościowo związane z operatorem (ten sam
        // `pse`) — backend niesie jedną parę krzywych na operatora, nie
        // niezależny wybór (patrz `KrokiAparaturaZgodnosc.tsx::wybierzProfil`).
        nc_rfg_profile_ref: 'pse',
        lvrt_curve_ref: 'pse',
        hvrt_curve_ref: 'pse',
        pf_curve_ref: 'pf_droop_5',
      });
    });
    // Tryb pracy — osobna operacja domenowa.
    expect(executeDomainOperationMock).toHaveBeenCalledWith('case-1', 'set_source_operating_mode', {
      source_ref: 'gen-1',
      mode: 'praca_sieciowa',
    });
    // Limity mocy biernej — aktualizacja pola limits elementu.
    expect(executeDomainOperationMock).toHaveBeenCalledWith('case-1', 'update_element_parameters', {
      element_ref: 'gen-1',
      parameters: { limits: { q_min_mvar: -0.2, q_max_mvar: 0.2 } },
    });

    // Przebieg sekwencji: wszystkie etapy zapisane.
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-sekwencja')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-kreator-oze-sekwencja-wiazania')).toHaveAttribute('data-stan', 'zapisane');
    expect(screen.getByTestId('mvd-kreator-oze-sekwencja-tryb')).toHaveAttribute('data-stan', 'zapisane');
    expect(screen.getByTestId('mvd-kreator-oze-sekwencja-limity')).toHaveAttribute('data-stan', 'zapisane');

    // Readout osi gotowości wytwórcy — statusy i powody w całości z modelu.
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-gotowosc-der-osie')).toBeInTheDocument());
    expect(screen.getByTestId('mvd-kreator-oze-gotowosc-der-os-sc_3f')).toHaveAttribute('data-status', 'ready');
    expect(screen.getByTestId('mvd-kreator-oze-gotowosc-der-os-protection')).toHaveTextContent(
      'Brak zabezpieczenia pola wytwórcy.',
    );
  });

  it('K9-A: częściowe niepowodzenie sekwencji — etap wiązań padł, stan pokazany uczciwie', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      changes: { created_element_ids: ['gen-1'] },
    });
    patchDerCatalogBindingsMock.mockRejectedValue(
      new Error('Referencje katalogowe nie istnieja w katalogu: ct_catalog_ref=ct-1.'),
    );
    render(<KreatorZrodlaOze />);

    await screen.findByRole('option', { name: /Wyłącznik nN/ });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparat'), 'apar-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-konwerter')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-konwerter'), 'conv-pv-1');
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-aparatura')).toBeInTheDocument());
    await screen.findByRole('option', { name: /CT 100\/5/ });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-aparatura-ct'), 'ct-1');
    // zapis bez auto-biegu.
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-dalej'));
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-autobieg-toggle')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-oze-autobieg-toggle'), 'nie');
    await userEvent.click(screen.getByTestId('mvd-kreator-oze-zapisz'));

    await waitFor(() => expect(screen.getByTestId('mvd-kreator-oze-sekwencja')).toBeInTheDocument());
    // Element JEST w modelu, etap wiązań padł z komunikatem, pozostałe pominięte.
    expect(screen.getByTestId('mvd-kreator-oze-sekwencja-zrodlo')).toHaveAttribute('data-stan', 'zapisane');
    const etapWiazania = screen.getByTestId('mvd-kreator-oze-sekwencja-wiazania');
    expect(etapWiazania).toHaveAttribute('data-stan', 'blad');
    expect(etapWiazania).toHaveTextContent('Referencje katalogowe nie istnieja w katalogu');
    expect(screen.getByTestId('mvd-kreator-oze-sekwencja-tryb')).toHaveAttribute('data-stan', 'pominiete');
    expect(screen.getByTestId('mvd-kreator-oze-sekwencja-limity')).toHaveAttribute('data-stan', 'pominiete');
  });

  it('uczciwy stan zerowy: bez rozdzielni zapis zablokowany', async () => {
    resolved.station = null;
    resolved.bus = null;
    render(<KreatorZrodlaOze />);
    // Montaż pobiera katalogi (konwertery + aparaty nN) — czekamy na realny
    // stan końcowy UI (opcja aparatu w selekcie nowego pola), żeby aktualizacje
    // stanu domknęły się w act.
    await screen.findByRole('option', { name: /Wyłącznik nN/ });
    expect(screen.getByTestId('mvd-kreator-oze-brak')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kreator-oze-zapisz')).toBeDisabled();
    // R5 (S9-5): sygnał gotowości (data-status) jest JEDNYM źródłem prawdy
    // z `disabled` (KLASA NIE INSTANCJA, predykaty parami).
    expect(screen.getByTestId('mvd-kreator-oze')).toHaveAttribute('data-status', 'zablokowany');
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorZrodlaOze />);
    // Realny stan końcowy montażu: opcja aparatu z katalogu (jak wyżej).
    await screen.findByRole('option', { name: /Wyłącznik nN/ });
    expect(screen.getByTestId('mvd-kreator-oze-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-oze')).toHaveAttribute('data-status', 'zablokowany');
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * R5 (karta FAB-K, wzorzec E2E-S95) — PRZYCZYNA nazwana w kodzie:
   * `akcjaGlowna.zablokowana` (`KreatorZrodlaOze.tsx`) sprawdzało WYŁĄCZNIE
   * `!hasKontekst || !activeCaseId` — bez stanu ładowania katalogu
   * przekształtników/aparatury nN (`GET /api/catalog/converter-types`,
   * `.../lv-apparatus-types`, montaż komponentu). Test poniżej pokrywa ILOCZYN
   * CECH z karty: „katalog jeszcze się ładuje" (Promise świadomie
   * nierozstrzygnięty) × „kontekst i zakres obliczeń poprawne" → zapis MUSI
   * być zablokowany, i to JAWNIE (komunikat w stopce), nie w ciszy.
   */
  it('iloczyn cech: katalog jeszcze się ładuje × kontekst/zakres poprawne → zapis zablokowany z komunikatem, nie w ciszy', () => {
    fetchConverterTypesMock.mockReturnValueOnce(new Promise(() => {}));
    fetchLvApparatusTypesMock.mockReturnValueOnce(new Promise(() => {}));
    render(<KreatorZrodlaOze />);

    expect(screen.getByTestId('mvd-kreator-oze-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-oze')).toHaveAttribute('data-status', 'ladowanie');
    expect(screen.getByTestId('mvd-kreator-walidacja').textContent).toMatch(/[Łł]adowanie katalogu/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * R5 — test PRZEJŚCIA disabled→enabled sterowany REALNYM rozstrzygnięciem
   * asynchronicznym (nie syntetyczną mutacją store'u): katalog w locie →
   * `data-status="ladowanie"` + zapis zablokowany, katalog odpowiada →
   * `data-status="gotowy"` I dopiero wtedy zapis klikalny.
   */
  it('przejście disabled→enabled: katalog w locie blokuje zapis, realne rozstrzygnięcie fetch odblokowuje', async () => {
    let resolveKonwertery: (value: typeof DOMYSLNE_KONWERTERY) => void = () => {};
    fetchConverterTypesMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveKonwertery = resolve;
      }),
    );
    render(<KreatorZrodlaOze />);

    expect(screen.getByTestId('mvd-kreator-oze-zapisz')).toBeDisabled();
    expect(screen.getByTestId('mvd-kreator-oze')).toHaveAttribute('data-status', 'ladowanie');

    resolveKonwertery(DOMYSLNE_KONWERTERY);

    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-oze')).toHaveAttribute('data-status', 'gotowy');
    });
    expect(screen.getByTestId('mvd-kreator-oze-zapisz')).toBeEnabled();
  });
});
