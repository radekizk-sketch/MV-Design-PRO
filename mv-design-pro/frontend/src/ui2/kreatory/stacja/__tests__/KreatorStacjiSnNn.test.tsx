/**
 * Testy kreatora „Dodaj stację SN/nN" (Audyt D, faza D2) — realna ścieżka
 * użytkownika (Zero-Debt §5): natywne interakcje (klik kroku, wybór typu z
 * katalogu, klik zapisu), a nie syntetyczne zdarzenia. Mockowane wyłącznie
 * store'y i końcówki API; helpery topologii (segment/napięcie SN) działają
 * na realnym snapshotcie. Weryfikuje, że zapis woła właściwą operację domenową
 * z poprawnym payloadem i wiąże nowy element ze schematem (V12K-073).
 *
 * Kontrakt prowadzenia projektanta (karta PROWADZENIE-KREATORY, 2026-10-15): przycisk
 * zapisu nie jest wyszarzany brakiem danych — klik przy braku daje JEDNO wskazanie
 * „co — po co” z przejściem do pola. Testy, które pilnowały wyszarzenia, sprawdzają teraz
 * tę samą intencję (zapis nie wychodzi do backendu) przez klik i wskazanie.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KreatorStacjiSnNn } from '../KreatorStacjiSnNn';

const closeFormMock = vi.fn();
const executeDomainOperationMock = vi.fn();
const navigateToSldMock = vi.fn();
const selectElementMock = vi.fn();
const centerSldOnElementMock = vi.fn();

// Testy „realnej ścieżki” przechodzą natywnymi klikami cały tor projektanta (szablon →
// rodzaj → transformator i nN → rodzina i aparaty pól → uziemienie → zapis), a od karty
// PROWADZENIE-KREATORY także kroki, które dawniej wypełniał domysł (napięcie nN, aparaty,
// odpływy, uziemienie). Pomiar 2026-10-15 przy obciążeniu maszyny ~24: 2,5–6,0 s na test,
// więc domyślne 5 s nie mierzy produktu, tylko obciążenie. Limit pliku 20 s; produktowy
// czas odpowiedzi kreatora nie jest tu przedmiotem asercji.
vi.setConfig({ testTimeout: 20000 });

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
const KONTEKST_PODZIALU = {
  segment_id: 'seg-1',
  position_on_segment: 0.5,
  station_type: 'branch',
} as const;
let context: Record<string, unknown> = { ...KONTEKST_PODZIALU };
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: {
    buses: [
      { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'bus-end', name: 'Terminal', voltage_kv: 15 },
    ],
    branches: [{ ref_id: 'seg-1', name: 'Odcinek L-1', from_bus_ref: 'bus-sn', to_bus_ref: 'bus-end' }],
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

/**
 * Aparat kompozycji producenta. `status_wyposazenia` jest w kontrakcie
 * WYMAGANE (pydantic bez wartości domyślnej), więc fixture też go wymaga —
 * wcześniej deklarował `is_required`, klucz USUNIĘTY z kontraktu przy scaleniu
 * kanonu rozdzielnic, czyli opisywał odpowiedź, której backend nie wysyła.
 */
const aparat = (
  ref: string,
  apparatus_kind: string,
  label: string,
  position_in_bay: number,
  status_wyposazenia: 'FABRYCZNY' | 'OPCJA' = 'FABRYCZNY',
) => ({
  device_template_ref: ref,
  apparatus_kind,
  label,
  position_in_bay,
  electrical_side: 'line_side',
  status_wyposazenia,
});

const szablon = (over: Record<string, unknown>) => ({
  template_ref: 'tpl',
  base_template: { template_id: 'tpl', name: 'Pole katalogowe', bay_role: 'IN', devices: [] },
  manufacturer_ref: 'ZPUE_WLOSZCZOWA',
  switchgear_family_ref: 'ZPUE_ROTOBLOK',
  bay_kind: 'liniowe_doplywowe',
  bay_role: 'IN',
  source_status: 'repo_verified',
  source_refs: ['kat/zpue'],
  version: '1',
  hash: 'h',
  notes_pl: null,
  ...over,
});

const SZABLONY = [
  szablon({
    template_ref: 'tpl-in',
    bay_kind: 'liniowe_doplywowe',
    bay_role: 'IN',
    base_template: { template_id: 'tpl-in', name: 'Pole liniowe Rotoblok', bay_role: 'IN', devices: [] },
    // Pole liniowe z pełnym składem katalogowym: wyłącznik i odłącznik FABRYCZNE,
    // przekładnik prądowy jako OPCJA (rodzaj z dostawcą w operacji stacyjnej —
    // `equipment.ct`), ogranicznik przepięć jako OPCJA BEZ dostawcy.
    device_instances: [
      aparat('dev-in-q1', 'disconnector_busbar', 'Q1', 1),
      aparat('dev-in-q0', 'circuit_breaker', 'Q0', 2),
      aparat('dev-in-q9', 'earthing_switch', 'Q9 (E)', 3),
      aparat('dev-in-ct', 'current_transformer', 'T1', 4, 'OPCJA'),
      aparat('dev-in-sa', 'surge_arrester', 'F1', 5, 'OPCJA'),
    ],
  }),
  szablon({ template_ref: 'tpl-out', bay_kind: 'liniowe_odplywowe', bay_role: 'OUT' }),
  szablon({ template_ref: 'tpl-tr', bay_kind: 'transformatorowe', bay_role: 'TR' }),
  szablon({ template_ref: 'tpl-coupler', bay_kind: 'sprzeglowe_poprzeczne', bay_role: 'COUPLER' }),
  // Pakiet rodziny RMU (ZPUE TPM Air) — jednostki bloku dobierają się z niego.
  szablon({
    template_ref: 'tpl-tpm-l',
    switchgear_family_ref: 'ZPUE_TPM_AIR',
    bay_kind: 'liniowe_odplywowe',
    bay_role: 'OUT',
    device_instances: [aparat('dev-tpm-l-q1', 'switch_disconnector', 'Q1', 1)],
  }),
  szablon({
    template_ref: 'tpl-tpm-t',
    switchgear_family_ref: 'ZPUE_TPM_AIR',
    bay_kind: 'transformatorowe',
    bay_role: 'TR',
    device_instances: [
      aparat('dev-tpm-t-q1', 'switch_disconnector', 'Q1', 1),
      aparat('dev-tpm-t-f', 'fuse_set', 'F1', 2),
    ],
  }),
];

/**
 * BLOKI FABRYCZNE per rodzina — subzasób `/factory-configurations`.
 * ZPUE TPM Air ma transkrybowaną kartę (bloki LL/LLT), Schneider RM6 jej NIE MA
 * (dług danych nazwany w kanonie §9) i musi dawać uczciwy stan zerowy, a nie
 * wymyślony blok.
 */
const jednostka = (
  unit_code: string,
  unit_name_pl: string,
  bay_kind: string,
  apparatus_kinds: string[],
) => ({ unit_code, unit_name_pl, bay_kind, apparatus_kinds, width_mm: null });

const BLOKI_WG_RODZINY: Record<string, Record<string, unknown>[]> = {
  ZPUE_TPM_AIR: [
    {
      configuration_ref: 'ZPUE_TPM_AIR__LL',
      switchgear_family_ref: 'ZPUE_TPM_AIR',
      code: 'LL',
      name_pl: 'Blok kabel-kabel',
      units: [
        jednostka('L', 'Jednostka liniowa (rozłącznik 630 A)', 'liniowe_odplywowe', [
          'switch_disconnector',
        ]),
        jednostka('L', 'Jednostka liniowa (rozłącznik 630 A)', 'liniowe_odplywowe', [
          'switch_disconnector',
        ]),
      ],
      unit_sequence: 'L-L',
      total_width_mm: null,
      source_refs: ['https://zpue.pl/rozdzielnice-sn/tpm-air'],
      notes_pl: null,
    },
    {
      configuration_ref: 'ZPUE_TPM_AIR__LLT',
      switchgear_family_ref: 'ZPUE_TPM_AIR',
      code: 'LLT',
      name_pl: 'Blok kabel-kabel-transformator',
      units: [
        jednostka('L', 'Jednostka liniowa (rozłącznik 630 A)', 'liniowe_odplywowe', [
          'switch_disconnector',
        ]),
        jednostka('L', 'Jednostka liniowa (rozłącznik 630 A)', 'liniowe_odplywowe', [
          'switch_disconnector',
        ]),
        jednostka(
          'T',
          'Jednostka transformatorowa (rozłącznik z bezpiecznikami 250 A)',
          'transformatorowe',
          ['switch_disconnector', 'fuse_set'],
        ),
      ],
      unit_sequence: 'L-L-T',
      total_width_mm: null,
      source_refs: ['https://zpue.pl/rozdzielnice-sn/tpm-air'],
      notes_pl: null,
    },
  ],
  SCHNEIDER_RM6: [],
};

/**
 * KOMPLETNOSC-POLA-TR: przełącznik dostępności readoutu zawężenia ról
 * (`/api/catalog/bay-apparatus-kinds`). Ustawiany PRZED renderem — pozwala
 * sprawdzić degradację, gdy backend tej końcówki nie ma (starsza wersja,
 * chwilowy błąd sieci).
 */
let zawezenieRolNiedostepne = false;

vi.mock('../../../../ui/catalog/api', () => ({
  getCatalogErrorMessage: () => 'błąd katalogu',
  fetchTransformerTypes: () =>
    Promise.resolve([
      {
        id: 'trafo-630-15-04',
        name: 'TR 630',
        rated_power_mva: 0.63,
        voltage_hv_kv: 15,
        voltage_lv_kv: 0.4,
        uk_percent: 4,
        tap_min: -2,
        tap_max: 2,
        tap_step_percent: 2.5,
      },
      {
        id: 'trafo-1000-15-069',
        name: 'TR 1000 690V',
        rated_power_mva: 1.0,
        voltage_hv_kv: 15,
        voltage_lv_kv: 0.69,
        uk_percent: 6,
        tap_min: -2,
        tap_max: 2,
        tap_step_percent: 2.5,
      },
    ]),
  fetchConverterTypes: () =>
    Promise.resolve([
      { id: 'pv-800-069', name: 'PV 800 0,69kV', kind: 'PV', un_kv: 0.69, sn_mva: 0.9, pmax_mw: 0.8 },
      { id: 'pv-500-04', name: 'PV 500 0,4kV', kind: 'PV', un_kv: 0.4, sn_mva: 0.55, pmax_mw: 0.5 },
      { id: 'bess-069', name: 'BESS 0,69kV', kind: 'BESS', un_kv: 0.69, sn_mva: 0.8, pmax_mw: 0.7 },
      { id: 'wind-04', name: 'FW 0,4kV', kind: 'WIND', un_kv: 0.4, sn_mva: 0.6, pmax_mw: 0.5 },
    ]),
  fetchManufacturers: () =>
    Promise.resolve([
      {
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        name: 'ZPUE Włoszczowa',
        normalized_code: 'zpue',
        country: 'PL',
        status: 'verified',
        source_refs: ['kat'],
        notes_pl: null,
      },
    ]),
  /**
   * Rodziny rozdzielnic — TRZY tory konfiguracji naraz, bo krok pól rozgałęzia
   * się właśnie na nich:
   *  · Rotoblok — `wnetrzowa` ⇒ MODULARNY (konstrukcja zgodna z kartą ZPUE;
   *    fixture deklarował wcześniej `RMU`, co przeczyło katalogowi),
   *  · TPM Air — `RMU` ⇒ BLOK_RMU z transkrybowanymi blokami,
   *  · RM6 — `RMU` ⇒ BLOK_RMU BEZ bloków w katalogu (jawny dług danych),
   *  · rodzina bez konstrukcji ⇒ tor `null` (katalog nie wyznacza toru pracy).
   * `tor_konfiguracji` jest po stronie backendu polem WYLICZANYM i przychodzi
   * z KAŻDĄ odpowiedzią — fixture bez niego opisywał odpowiedź, której nie ma.
   */
  fetchSwitchgearFamilies: () =>
    Promise.resolve([
      {
        switchgear_family_ref: 'ZPUE_ROTOBLOK',
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        family_name: 'Rotoblok',
        series_name: null,
        network_voltages_kv: [15, 20],
        um_classes_kv: [17.5, 24],
        rated_current_options: [630],
        short_time_current_options: [16],
        insulation_type: 'air',
        construction_type: 'wnetrzowa',
        tor_konfiguracji: 'MODULARNY',
        allowed_apparatus_kinds: [
          'circuit_breaker',
          'switch_disconnector',
          'earthing_switch',
          'fuse_set',
          'current_transformer',
          'voltage_transformer',
        ],
        status: 'repo_verified',
        source_refs: ['kat'],
        notes_pl: null,
      },
      {
        switchgear_family_ref: 'ZPUE_TPM_AIR',
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        family_name: 'TPM Air',
        series_name: null,
        network_voltages_kv: [],
        um_classes_kv: [17.5],
        rated_current_options: [630],
        short_time_current_options: [20],
        insulation_type: 'air',
        construction_type: 'RMU',
        tor_konfiguracji: 'BLOK_RMU',
        status: 'repo_verified',
        source_refs: ['kat'],
        notes_pl: null,
      },
      {
        switchgear_family_ref: 'SCHNEIDER_RM6',
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        family_name: 'RM6 (bez transkrypcji bloków)',
        series_name: null,
        network_voltages_kv: [],
        um_classes_kv: [17.5],
        rated_current_options: [],
        short_time_current_options: [],
        insulation_type: 'sf6',
        construction_type: 'RMU',
        tor_konfiguracji: 'BLOK_RMU',
        status: 'repo_verified',
        source_refs: ['kat'],
        notes_pl: null,
      },
      {
        switchgear_family_ref: 'BEZ_KONSTRUKCJI',
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        family_name: 'Rodzina bez karty konstrukcji',
        series_name: null,
        network_voltages_kv: [],
        um_classes_kv: [17.5],
        rated_current_options: [],
        short_time_current_options: [],
        insulation_type: 'unknown',
        construction_type: 'unknown',
        tor_konfiguracji: null,
        status: 'repo_verified',
        source_refs: ['kat'],
        notes_pl: null,
      },
    ]),
  fetchFactoryConfigurations: (rodzinaRef: string) =>
    Promise.resolve(BLOKI_WG_RODZINY[rodzinaRef] ?? []),
  fetchCompleteBayTemplates: () => Promise.resolve(SZABLONY),
  // Krok „Pomiar i zabezpieczenia" (K9-B): przekładniki, zabezpieczenia i
  // kanoniczne kody funkcji per rola pola — readouty z backendu.
  fetchCtTypes: () =>
    Promise.resolve([
      { id: 'ct-400-5', name: 'CT 400/5', ratio_primary_a: 400, ratio_secondary_a: 5, accuracy_class: '5P20' },
    ]),
  fetchVtTypes: () =>
    Promise.resolve([
      { id: 'vt-15-100', name: 'VT 15 kV/100 V', ratio_primary_v: 15000, ratio_secondary_v: 100 },
    ]),
  fetchMvProtectionDeviceTypes: () =>
    Promise.resolve([{ id: 'relay-1', name: 'Przekaźnik nadprądowy', vendor: 'ABB' }]),
  fetchBayProtectionCodes: () =>
    Promise.resolve({
      IN: ['51', '50', '51N'],
      OUT: ['51', '50', '51N', '67N'],
      TR: ['87T', '51'],
      FEEDER: ['51'],
      COUPLER: ['51'],
    }),
  // B-12: katalog aparatury SN — aparat pola wskazuje projektant, backend go nie dobiera.
  fetchMvApparatusTypes: () =>
    Promise.resolve([
      // Pozycje oferty ZPUE (fikstura nazywa je jak w danych testowych; producent rozdzielnicy
      // i rodzaj w słowniku rodzin przychodzą z końcówki katalogu).
      {
        id: 'sw-cb-abb-vd4-17kv-630a',
        name: 'ABB VD4 17,5 kV 630 A',
        device_kind: 'WYLACZNIK',
        u_n_kv: 17.5,
        i_n_a: 630,
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        family_apparatus_kind: 'circuit_breaker',
      },
      {
        id: 'sw-cb-abb-vd4-24kv-1250a',
        name: 'ABB VD4 24 kV 1250 A',
        device_kind: 'WYLACZNIK',
        u_n_kv: 24,
        i_n_a: 1250,
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        family_apparatus_kind: 'circuit_breaker',
      },
      {
        id: 'sw-ls-zpue-nal-17kv-630a',
        name: 'ZPUE NAL 17,5 kV 630 A',
        device_kind: 'ROZLACZNIK',
        u_n_kv: 17.5,
        i_n_a: 630,
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        family_apparatus_kind: 'switch_disconnector',
      },
      // Przejście scenariusza 630 kVA (pkt 3 i 5): aparat INNEGO producenta i reklozer
      // (łącznik słupowy spoza celek) nie należą do oferty żadnej rodziny ZPUE.
      {
        id: 'sw-cb-siemens-3ah5-17kv-1250a',
        name: 'Siemens 3AH5 17,5 kV 1250 A',
        device_kind: 'WYLACZNIK',
        u_n_kv: 17.5,
        i_n_a: 1250,
        manufacturer_ref: 'SIEMENS',
        family_apparatus_kind: 'circuit_breaker',
      },
      {
        id: 'sw-rec-abb-rec615-17kv-630a',
        name: 'ABB REC615 17,5 kV 630 A',
        device_kind: 'REKLOZER',
        u_n_kv: 17.5,
        i_n_a: 630,
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        family_apparatus_kind: null,
      },
      // KOMPLETNOSC-POLA-TR: rozłącznik bezpiecznikowy — realne rozwiązanie pola
      // transformatorowego RMU (i JEDYNY sposób, by sprawdzić, że picker zawęża
      // listę rolą, a nie pokazuje wszystkiego wszędzie).
      // Kształt 1:1 z końcówką katalogu: wytwórca wkładek (ETI) nie jest producentem
      // rozdzielnic (`manufacturer_ref: null`), a zestaw bezpiecznikowy jest komponentem
      // wymiennym między rodzinami. Dawna fikstura nadawała mu producenta ZPUE i tym samym
      // maskowała, że filtr „producent rodziny” wycinał bezpiecznik z każdej rodziny.
      {
        id: 'sw-fuse-eti-vv-17kv-63a',
        name: 'ETI VV 17,5 kV 63 A',
        device_kind: 'ROZLACZNIK_BEZPIECZNIKOWY',
        u_n_kv: 17.5,
        i_n_a: 63,
        manufacturer_ref: null,
        family_apparatus_kind: 'fuse_set',
        interchangeable_across_families: true,
      },
      // Aparat bez producenta rozdzielnic, ale NIEWYMIENNY (odłącznik słupowy) — poza
      // ofertą każdej rodziny, choć jego rodzaj rodzina dopuszcza.
      {
        id: 'sw-ds-generic-slupowy-17kv-400a',
        name: 'Odłącznik słupowy 17,5 kV 400 A',
        device_kind: 'ODLACZNIK',
        u_n_kv: 17.5,
        i_n_a: 400,
        manufacturer_ref: null,
        family_apparatus_kind: 'switch_disconnector',
        interchangeable_across_families: false,
      },
      {
        id: 'sw-ds-abb-ojs-17kv-630a',
        name: 'ABB OJS 17,5 kV 630 A',
        device_kind: 'ODLACZNIK',
        u_n_kv: 17.5,
        i_n_a: 630,
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        family_apparatus_kind: 'switch_disconnector',
      },
    ]),
  // KOMPLETNOSC-POLA-TR: rodzaje aparatu głównego dopuszczalne per rola pola
  // (readout `/api/catalog/bay-apparatus-kinds` — jedno źródło prawdy backendu).
  fetchBayApparatusKinds: () =>
    zawezenieRolNiedostepne
      ? Promise.reject(new Error('HTTP 404'))
      : Promise.resolve({
          IN: ['WYLACZNIK', 'ROZLACZNIK', 'REKLOZER'],
          OUT: ['WYLACZNIK', 'ROZLACZNIK', 'REKLOZER'],
          FEEDER: ['WYLACZNIK', 'ROZLACZNIK', 'REKLOZER'],
          TR: ['ROZLACZNIK_BEZPIECZNIKOWY', 'WYLACZNIK'],
          COUPLER: ['WYLACZNIK', 'ROZLACZNIK'],
          MEASUREMENT: ['ODLACZNIK'],
          OZE: ['WYLACZNIK', 'ROZLACZNIK'],
        }),
}));

// B-8 (karta KD-3): klient szablonów UŻYTKOWNIKA — osobny zbiór od wbudowanych.
const zapisaneSzablony: Array<{
  id: string;
  name_pl: string;
  description_pl: string;
  source: 'UZYTKOWNIKA';
  saved_at: string;
  configuration: Record<string, unknown>;
}> = [];
vi.mock('../szablonyUzytkownika', () => ({
  pobierzSzablonyUzytkownika: () => Promise.resolve([...zapisaneSzablony]),
  zapiszSzablonUzytkownika: (
    nazwa: string,
    opis: string | null,
    konfiguracja: Record<string, unknown>,
  ) => {
    const wpis = {
      id: 'user_test1',
      name_pl: nazwa,
      description_pl: opis ?? '',
      source: 'UZYTKOWNIKA' as const,
      saved_at: '2026-07-31T00:00:00Z',
      configuration: konfiguracja,
    };
    zapisaneSzablony.length = 0;
    zapisaneSzablony.push(wpis);
    return Promise.resolve(wpis);
  },
  usunSzablonUzytkownika: () => Promise.resolve(),
}));

/**
 * Biblioteka szablonów per KATEGORIA + sterowanie momentem odpowiedzi.
 *
 * Mock zwracał wcześniej JEDNĄ listę niezależnie od kategorii i rozstrzygał się
 * natychmiast — przy takim dublerze nie dawało się zobaczyć stanu „kategoria
 * zmieniona, odpowiedź jeszcze nie przyszła", czyli dokładnie tego, w którym
 * picker pokazywał szablony poprzedniej kategorii.
 */
const biblioteka = vi.hoisted(() => {
  const szablon = (id: string, name_pl: string, category: string) => ({
    id,
    name_pl,
    category,
    description_pl: 'Szablon testowy',
    use_case_pl: '',
    nc_rfg_type: 'B',
    tags: [],
    icon: 'station-pv-farm',
  });
  const wgKategorii: Record<string, ReturnType<typeof szablon>[]> = {
    typowa_sn_nn: [szablon('tpl_typowa_400', 'Typowa 400 kVA', 'typowa_sn_nn')],
    farma_pv: [szablon('tpl_farma_pv_1mw', 'Farma PV 1 MW', 'farma_pv')],
  };
  /** Gdy ustawione — odpowiedź czeka na ręczne zwolnienie (`zwolnij`). */
  let wstrzymaj: (() => void) | null = null;
  return {
    wgKategorii,
    /** Wstrzymuje KOLEJNE żądanie do czasu wywołania `zwolnij()`. */
    wstrzymajNastepne(): void {
      wstrzymaj = null;
      biblioteka.oczekujace = new Promise<void>((resolve) => {
        wstrzymaj = resolve;
      });
    },
    oczekujace: null as Promise<void> | null,
    zwolnij(): void {
      wstrzymaj?.();
      wstrzymaj = null;
      biblioteka.oczekujace = null;
    },
  };
});

vi.mock('../../../../ui/network-build/station-templates/api', () => ({
  fetchStationTemplateCategories: () =>
    Promise.resolve({
      categories: [
        { id: 'typowa_sn_nn', label_pl: 'Typowe stacje SN/nN', icon: '', description_pl: '', template_count: 1, wchodzi_w_segment: true },
        { id: 'farma_pv', label_pl: 'Farmy fotowoltaiczne', icon: '', description_pl: '', template_count: 1, wchodzi_w_segment: true },
      ],
      total_templates: 2,
    }),
  fetchStationTemplates: async (kategoria: string) => {
    if (biblioteka.oczekujace) await biblioteka.oczekujace;
    const templates = biblioteka.wgKategorii[kategoria] ?? [];
    return { templates, total: templates.length };
  },
  fetchStationTemplate: (id: string) =>
    Promise.resolve({
      id,
      name_pl: 'Farma PV 1 MW',
      category: 'farma_pv',
      description_pl: 'Szablon testowy',
      use_case_pl: '',
      nc_rfg_type: 'B',
      tags: [],
      icon: 'station-pv-farm',
      schema: {
        sn_bay_apparatus_options: [
          {
            catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
            label_pl: 'ABB VD4',
            namespace: 'APARAT_SN',
            default: true,
            badge_pl: null,
          },
        ],
        sn_bay_protection_options: [
          {
            device_catalog_ref: 'relay-1',
            label_pl: 'Przekaźnik',
            vendor: 'ABB',
            settings_template_id: 'tpl',
            badge_pl: null,
          },
        ],
        ct_options: [
          { catalog_ref: 'ct-400-5', label_pl: 'CT 400/5', namespace: 'CT', default: true, badge_pl: null },
        ],
        vt_options: [
          { catalog_ref: 'vt-15-100', label_pl: 'VT', namespace: 'VT', default: true, badge_pl: null },
        ],
      },
    }),
  previewStationTemplate: () =>
    Promise.resolve({
      template_id: 'tpl_farma_pv_1mw',
      template_name_pl: 'Farma PV 1 MW',
      category: 'farma_pv',
      nc_rfg_type: 'B',
      station_type: 'inline',
      catalog_profile_applied: null,
      effective_config: {
        transformer_ref: 'trafo-630-15-04',
        transformer_count: 1,
        sn_bays_count: 2,
        sn_bay_roles: ['IN', 'MEASUREMENT'],
        sn_fields: [
          { field_role: 'LINIA_IN', apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a' },
          { field_role: 'LINIA_OUT', apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a' },
          // Propozycja szablonu spoza oferty rodziny (przejście 630 kVA: aparat ABB w celce ZPUE).
          { field_role: 'TRANSFORMATOROWE', apparatus_catalog_ref: 'sw-cb-siemens-3ah5-17kv-1250a' },
        ],
        sn_manufacturer: 'ZPUE_WLOSZCZOWA',
        nn_feeders_count: 2,
        nn_feeder_cb_ref: 'cb_nn_400a',
        protection_relay_ref: 'relay-1',
        der_total_count: 0,
        der_mix: [],
      },
      estimated_elements_count: 6,
    }),
}));

/** Krok kreatora wybierany natywnym klikiem w nagłówek kroku (rama kreatorów). */
async function przejdzDoKroku(tytul: string) {
  await userEvent.click(screen.getByRole('button', { name: new RegExp(tytul) }));
}

async function przejdzDoTransformatora() {
  // Kreator startuje od kroku „Szablon" (K9-B) — przechodzimy natywnym klikiem
  // w nagłówek kroku transformatora (ścieżka „od zera", bez szablonu).
  await przejdzDoKroku('Transformator i strona nN');
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-stacja-katalog')).toBeInTheDocument();
  });
}

/** Wartość listy wyboru (natywny `<select>`) — pomocniczo do warunkowego wyboru. */
function wartosc(testid: string): string {
  return (screen.getByTestId(testid) as HTMLSelectElement).value;
}

async function wybierzTyp() {
  // Napięcie strony nN — katalog ma transformatory 0,4 i 0,69 kV na 15 kV, więc to wybór
  // projektanta (dawniej 0,4 kV z automatu).
  if (screen.queryByTestId('mvd-kreator-stacja-nn') && wartosc('mvd-kreator-stacja-nn') === '') {
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-nn'), '0.4');
  }
  await waitFor(() => {
    const select = screen.getByTestId('mvd-kreator-stacja-katalog') as HTMLSelectElement;
    expect(select.querySelector('option[value="trafo-630-15-04"]')).not.toBeNull();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-katalog'), 'trafo-630-15-04');
}

async function przejdzIWybierzRozdzielnice() {
  // transformator → pola rozdzielnicy (natywny klik w nagłówek kroku).
  await przejdzDoKroku('Pola rozdzielnicy SN');
  await waitFor(() => {
    const producent = screen.getByTestId('mvd-kreator-stacja-producent') as HTMLSelectElement;
    expect(producent.querySelector('option[value="ZPUE_WLOSZCZOWA"]')).not.toBeNull();
  });
  // Producent i rodzina wybrane natywnie.
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-producent'), 'ZPUE_WLOSZCZOWA');
  await waitFor(() => {
    const rodzina = screen.getByTestId('mvd-kreator-stacja-rodzina') as HTMLSelectElement;
    expect(rodzina.querySelector('option[value="ZPUE_ROTOBLOK"]')).not.toBeNull();
  });
  await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-rodzina'), 'ZPUE_ROTOBLOK');
  await waitFor(() => expect(screen.getByTestId('mvd-kreator-stacja-aparat-1')).toBeInTheDocument());
  await wybierzAparatyPol();
  await uzupelnijNnIUziemienie();
}

/**
 * Aparat każdego pola bez wskazania — natywny wybór z listy pola. Oferta rodziny ma kilka
 * zdatnych aparatów na rolę, więc kreator ich nie dobiera (dawniej pierwszy z listy).
 */
async function wybierzAparatyPol(preferowane: readonly string[] = ['sw-cb-abb-vd4-17kv-630a']) {
  for (let n = 1; screen.queryByTestId(`mvd-kreator-stacja-aparat-${n}`); n += 1) {
    const select = screen.getByTestId(`mvd-kreator-stacja-aparat-${n}`) as HTMLSelectElement;
    if (select.value) continue;
    const opcje = [...select.querySelectorAll('option')].map((o) => o.value).filter(Boolean);
    const wybor = preferowane.find((ref) => opcje.includes(ref)) ?? opcje[0];
    await userEvent.selectOptions(select, wybor);
  }
}

/**
 * Strona nN i uziemienie (kroki 6–7) — wartości wpływające na wyniki wskazuje projektant
 * (dawniej 2 odpływy, TN-C-S i punkt bezpośrednio uziemiony z automatu). Wraca do kroku pól.
 */
async function uzupelnijNnIUziemienie() {
  await przejdzDoKroku('Blok nN');
  const odplywy = await screen.findByTestId('mvd-kreator-stacja-odplywy');
  if (!(odplywy as HTMLInputElement).value) fireEvent.change(odplywy, { target: { value: '2' } });
  await przejdzDoKroku('Uziemienie i punkt neutralny');
  if (wartosc('mvd-kreator-stacja-uklad-nn') === '') {
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-uklad-nn'), 'TN-C-S');
  }
  if (wartosc('mvd-kreator-stacja-punkt-neutralny') === '') {
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-punkt-neutralny'),
      'directly_grounded',
    );
  }
  await przejdzDoKroku('Pola rozdzielnicy SN');
}

/** Klik „Zapisz” przy braku: zapis nie wychodzi, stopka niesie JEDNO wskazanie. */
async function zapiszIOczekujWskazania(tekst: RegExp) {
  await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
  expect(await screen.findByTestId('mvd-kreator-wskazanie')).toHaveTextContent(tekst);
  expect(executeDomainOperationMock).not.toHaveBeenCalled();
}

describe('KreatorStacjiSnNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { ...KONTEKST_PODZIALU };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('świadomy podział: wybór typu → zapis woła insert_station_on_segment_sn i wiąże ze schematem', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'st-created', element_type: 'substation', zoom_to: true },
    });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          station_type: 'branch',
          segment_id: 'seg-1',
          insert_at: { mode: 'RATIO', value: 0.5 },
          transformer: expect.objectContaining({
            create: true,
            transformer_catalog_ref: 'trafo-630-15-04',
            catalog_binding: expect.objectContaining({ catalog_namespace: 'TRAFO_SN_NN', catalog_item_id: 'trafo-630-15-04' }),
          }),
          nn_block: expect.objectContaining({ nn_configuration: 'LOAD_NN', outgoing_feeders_nn_count: 2 }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('endpoint_bus_ref');
    expect((payload.station as Record<string, unknown>).sn_voltage_kv).toBe(15);
    // sn_fields kompletne (WE/WY/ODG/TR) i wiązanie rozdzielnicy w station.switchgear.
    const snFields = payload.sn_fields as Array<{ field_role: string; bay_template_ref: string | null }>;
    expect(snFields.map((f) => f.field_role)).toEqual([
      'LINIA_IN',
      'LINIA_OUT',
      'LINIA_ODG',
      'TRANSFORMATOROWE',
    ]);
    expect(snFields.every((f) => Boolean(f.bay_template_ref))).toBe(true);
    expect((payload.station as Record<string, unknown>).switchgear).toMatchObject({
      manufacturer_ref: 'ZPUE_WLOSZCZOWA',
      switchgear_family_ref: 'ZPUE_ROTOBLOK',
    });

    expect(closeFormMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(selectElementMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'st-created', type: 'Station' }),
      );
    });
    expect(centerSldOnElementMock).toHaveBeenCalledWith('st-created');
    expect(navigateToSldMock).toHaveBeenCalled();
  });

  it('zakończenie odcinka: kontekst ENDPOINT_APPEND → zapis woła append_station_on_endpoint', async () => {
    context = { placement_mode: 'ENDPOINT_APPEND', endpoint_bus_ref: 'bus-end', run_ref: 'run-1' };
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'append_station_on_endpoint',
        expect.objectContaining({
          endpoint_bus_ref: 'bus-end',
          run_ref: 'run-1',
          transformer: expect.objectContaining({ transformer_catalog_ref: 'trafo-630-15-04' }),
          sn_fields: expect.arrayContaining([
            expect.objectContaining({ field_role: 'LINIA_IN', bay_template_ref: expect.any(String) }),
          ]),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('segment_id');
    // P1: dopięcie na końcu bez jawnego typu → stacja końcowa (WE+TR), nie odgałęźna.
    expect(payload.station_type).toBe('terminal');
    const snFields = payload.sn_fields as Array<{ field_role: string }>;
    expect(snFields.map((f) => f.field_role)).toEqual(['LINIA_IN', 'TRANSFORMATOROWE']);
  });

  it('B-3: wyposażenie pola jedzie W TEJ SAMEJ operacji co stacja (bez sekwencji po zapisie)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();

    // Krok „Pomiar i zabezpieczenia": natywny wybór CT/VT/przekaźnika 1. pola.
    await przejdzDoKroku('Pomiar i zabezpieczenia');
    await waitFor(() => {
      const ct = screen.getByTestId('mvd-kreator-stacja-ct-1') as HTMLSelectElement;
      expect(ct.querySelector('option[value="ct-400-5"]')).not.toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-ct-1'), 'ct-400-5');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-vt-1'), 'vt-15-100');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-przekaznik-1'), 'relay-1');
    // Kody funkcji pola liniowego (51, 50, 51N) wskazują dwa rodzaje — rodzaj wybiera projektant.
    expect(wartosc('mvd-kreator-stacja-rodzaj-zabezpieczenia-1')).toBe('');
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-rodzaj-zabezpieczenia-1'),
      'NADPRADOWY',
    );
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-vt-uzwojenie-1'),
      'POMIAROWE',
    );

    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
    // JEDNA operacja: brak osobnych add_ct/add_vt/add_relay po zapisie (B-3).
    expect(executeDomainOperationMock).toHaveBeenCalledTimes(1);
    const [, operacja, payload] = executeDomainOperationMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(operacja).toBe('insert_station_on_segment_sn');

    const snFields = payload.sn_fields as Array<{
      field_role: string;
      equipment?: Record<string, Record<string, unknown>>;
    }>;
    // Wyposażenie przy WŁAŚCIWYM polu (pierwszym), pozostałe pola bez klucza.
    expect(snFields[0].equipment?.ct).toMatchObject({
      catalog_ref: 'ct-400-5',
      // Przekładnia z pozycji katalogowej — UI niczego nie liczy.
      ratio_primary_a: 400,
      ratio_secondary_a: 5,
      catalog_binding: expect.objectContaining({
        catalog_namespace: 'CT',
        catalog_item_id: 'ct-400-5',
      }),
    });
    expect(snFields[0].equipment?.vt).toMatchObject({
      catalog_ref: 'vt-15-100',
      ratio_primary_v: 15000,
      ratio_secondary_v: 100,
    });
    expect(snFields[0].equipment?.relay).toMatchObject({
      catalog_ref: 'relay-1',
      relay_type: 'NADPRADOWY',
      catalog_binding: expect.objectContaining({ catalog_namespace: 'ZABEZPIECZENIE' }),
    });
    expect(snFields.slice(1).every((f) => f.equipment === undefined)).toBe(true);

    expect(closeFormMock).toHaveBeenCalled();
  });

  it('krok uziemienia: natywny wybór układu IT + punktu izolowanego → nn_earthing w payloadzie (G-STK-1)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    // pola → uziemienie (natywny klik w nagłówek kroku ramy kreatorów).
    await przejdzDoKroku('Uziemienie i punkt neutralny');
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-stacja-uklad-nn')).toBeInTheDocument();
    });
    // Natywny wybór układu sieci nN i typu punktu neutralnego.
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-uklad-nn'), 'IT');
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-punkt-neutralny'),
      'isolated',
    );
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload.nn_earthing).toEqual({ lv_system: 'IT', neutral_point: 'isolated' });
  });

  it('honoruje wybór typu stacji zmieniony natywnie w kroku 1', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    // Kreator startuje od kroku „Szablon" — rodzaj stacji ustawiamy po przejściu
    // do jego kroku (klik natywny w nagłówek).
    await przejdzDoKroku('Rodzaj i umiejscowienie');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-typ'), 'sectional');
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          station_type: 'sectional',
          // Sekcyjna → pole sprzęgłowe w sn_fields.
          sn_fields: expect.arrayContaining([
            expect.objectContaining({ field_role: 'SPRZEGLO', bay_template_ref: expect.any(String) }),
          ]),
        }),
      );
    });
  });

  it('PV za transformatorem: wybór falownika natywnie → nn_block PV w payloadzie', async () => {
    executeDomainOperationMock.mockResolvedValue({
      error: null,
      selection_hint: { element_id: 'st-pv', element_type: 'substation', zoom_to: true },
    });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    // Konfiguracja nN → PV (natywny wybór).
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-konfiguracja-nn'),
      'PV_INVERTER',
    );
    // Falownik z katalogu — natywny wybór pozycji 0,69 kV.
    await waitFor(() => {
      const falownik = screen.getByTestId('mvd-kreator-stacja-falownik') as HTMLSelectElement;
      expect(falownik.querySelector('option[value="pv-800-069"]')).not.toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-falownik'), 'pv-800-069');
    // Transformator zawężony do strony nN falownika (0,69 kV).
    await waitFor(() => {
      const katalog = screen.getByTestId('mvd-kreator-stacja-katalog') as HTMLSelectElement;
      expect(katalog.querySelector('option[value="trafo-1000-15-069"]')).not.toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-katalog'), 'trafo-1000-15-069');
    await przejdzIWybierzRozdzielnice();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          nn_block: expect.objectContaining({
            nn_configuration: 'PV_INVERTER',
            source_converter_catalog_ref: 'pv-800-069',
            source_converter_un_kv: 0.69,
            source_converter_sn_mva: 0.9,
          }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const nnBlock = payload.nn_block as Record<string, unknown>;
    expect(nnBlock.source_protection).toBeTruthy();
    const feeders = nnBlock.outgoing_feeders_nn as Array<{ feeder_role: string }>;
    expect(feeders.map((f) => f.feeder_role)).toContain('ZRODLO_NN_PV');
    // Napięcie nN stacji z katalogu falownika, nie z pola odbioru.
    expect((payload.station as Record<string, unknown>).nn_voltage_kv).toBe(0.69);
  });

  it('BESS za transformatorem: wybór falownika BESS natywnie → nn_block BESS + feeder ZRODLO_NN_BESS', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-konfiguracja-nn'),
      'BESS_INVERTER',
    );
    // Falownik z katalogu zawężony do rodzaju BESS (0,69 kV).
    await waitFor(() => {
      const falownik = screen.getByTestId('mvd-kreator-stacja-falownik') as HTMLSelectElement;
      expect(falownik.querySelector('option[value="bess-069"]')).not.toBeNull();
      // Falowniki PV nie należą do listy BESS.
      expect(falownik.querySelector('option[value="pv-800-069"]')).toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-falownik'), 'bess-069');
    await waitFor(() => {
      const katalog = screen.getByTestId('mvd-kreator-stacja-katalog') as HTMLSelectElement;
      expect(katalog.querySelector('option[value="trafo-1000-15-069"]')).not.toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-katalog'), 'trafo-1000-15-069');
    await przejdzIWybierzRozdzielnice();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          nn_block: expect.objectContaining({
            nn_configuration: 'BESS_INVERTER',
            source_converter_catalog_ref: 'bess-069',
            source_converter_kind: 'BESS',
            source_converter_un_kv: 0.69,
          }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const nnBlock = payload.nn_block as Record<string, unknown>;
    // Legacy: intencja zabezpieczenia tylko dla PV → BESS bez source_protection.
    expect(nnBlock).not.toHaveProperty('source_protection');
    const feeders = nnBlock.outgoing_feeders_nn as Array<{ feeder_role: string }>;
    expect(feeders.map((f) => f.feeder_role)).toContain('ZRODLO_NN_BESS');
    expect((payload.station as Record<string, unknown>).nn_voltage_kv).toBe(0.69);
  });

  it('FW za transformatorem: wybór falownika WIND natywnie → nn_block FW + feeder ZRODLO_NN_FW', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-konfiguracja-nn'),
      'FW_INVERTER',
    );
    await waitFor(() => {
      const falownik = screen.getByTestId('mvd-kreator-stacja-falownik') as HTMLSelectElement;
      expect(falownik.querySelector('option[value="wind-04"]')).not.toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-falownik'), 'wind-04');
    // Falownik 0,4 kV → transformator SN 15 / nN 0,4 kV.
    await waitFor(() => {
      const katalog = screen.getByTestId('mvd-kreator-stacja-katalog') as HTMLSelectElement;
      expect(katalog.querySelector('option[value="trafo-630-15-04"]')).not.toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-katalog'), 'trafo-630-15-04');
    await przejdzIWybierzRozdzielnice();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          nn_block: expect.objectContaining({
            nn_configuration: 'FW_INVERTER',
            source_converter_catalog_ref: 'wind-04',
            source_converter_kind: 'WIND',
          }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const feeders = (payload.nn_block as Record<string, unknown>).outgoing_feeders_nn as Array<{
      feeder_role: string;
    }>;
    expect(feeders.map((f) => f.feeder_role)).toContain('ZRODLO_NN_FW');
  });

  it('CUSTOM_NN: własne napięcie strony nN wybrane natywnie → nn_configuration CUSTOM_NN z tym napięciem', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-konfiguracja-nn'),
      'CUSTOM_NN',
    );
    // Rozszerzona lista napięć strony nN — wybór 0,69 kV (poza domyślnym 0,4 kV).
    await waitFor(() => {
      const napiecie = screen.getByTestId('mvd-kreator-stacja-nn') as HTMLSelectElement;
      expect(napiecie.querySelector('option[value="6.3"]')).not.toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-nn'), '0.69');
    await waitFor(() => {
      const katalog = screen.getByTestId('mvd-kreator-stacja-katalog') as HTMLSelectElement;
      expect(katalog.querySelector('option[value="trafo-1000-15-069"]')).not.toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-katalog'), 'trafo-1000-15-069');
    await przejdzIWybierzRozdzielnice();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          nn_block: expect.objectContaining({ nn_configuration: 'CUSTOM_NN' }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const nnBlock = payload.nn_block as Record<string, unknown>;
    expect(nnBlock).not.toHaveProperty('source_converter_catalog_ref');
    expect((payload.station as Record<string, unknown>).nn_voltage_kv).toBe(0.69);
    const feeders = nnBlock.outgoing_feeders_nn as Array<{ feeder_role: string }>;
    expect(feeders.every((f) => f.feeder_role === 'ODPLYW_NN')).toBe(true);
  });

  it('LOAD_NN: zmiana liczby odpływów w kroku Blok nN → payload z odpływami odbiorczymi', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    // pola → Blok nN (natywny klik w nagłówek kroku ramy kreatorów).
    await przejdzDoKroku('Blok nN');
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-stacja-odplywy')).toBeInTheDocument();
    });
    // fireEvent.change zamiast userEvent.type: pole liczbowe ma min=1, więc
    // clear zeruje do 1, a doklepanie „4" dałoby 14 → clamp 8. Zmiana wartości
    // wprost napędza realny handler onChange komponentu (nie omija store'a ani
    // walidacji) i wiernie oddaje ustawienie liczby odpływów przez użytkownika.
    const odplywy = screen.getByTestId('mvd-kreator-stacja-odplywy');
    fireEvent.change(odplywy, { target: { value: '4' } });
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => {
      expect(executeDomainOperationMock).toHaveBeenCalledWith(
        'case-1',
        'insert_station_on_segment_sn',
        expect.objectContaining({
          nn_block: expect.objectContaining({
            nn_configuration: 'LOAD_NN',
            outgoing_feeders_nn_count: 4,
          }),
        }),
      );
    });
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const feeders = (payload.nn_block as Record<string, unknown>).outgoing_feeders_nn as Array<{
      feeder_role: string;
    }>;
    expect(feeders).toHaveLength(4);
    expect(feeders.every((f) => f.feeder_role === 'ODPLYW_NN')).toBe(true);
  });

  it('krok transformatora: pomoc pola liczby jednostek renderuje wzór Z/n przez KaTeX (klik natywny)', async () => {
    // Zasada wywodów KaTeX (2026-07-22): impedancja zastępcza Z/n w pomocy pola
    // renderuje KaTeX (math-rendered), nie surowy tekst.
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    const wzory = screen.getAllByTestId('math-rendered');
    expect(wzory.length).toBeGreaterThanOrEqual(1);
    expect(wzory.some((w) => (w.getAttribute('data-latex') ?? '').includes('Z/n'))).toBe(true);
    expect(screen.queryByTestId('math-fallback')).toBeNull();
  });

  it('uczciwy stan zerowy: brak miejsca osadzenia → klik zapisu wskazuje umiejscowienie', async () => {
    context = {};
    render(<KreatorStacjiSnNn />);
    // Uczciwy stan zerowy pokazuje krok „Rodzaj i umiejscowienie" (kreator
    // startuje od kroku „Szablon").
    await przejdzDoKroku('Rodzaj i umiejscowienie');
    expect(screen.getByTestId('mvd-kreator-stacja-brak')).toBeInTheDocument();
    // Intencja (dawniej: przycisk wyszarzony): bez miejsca zapis nie wychodzi; klik
    // wskazuje JEDEN brak — tam, gdzie stanie stacja.
    expect(screen.getByTestId('mvd-kreator-stacja-zapisz')).toBeEnabled();
    await zapiszIOczekujWskazania(/Otwórz kreator z odcinka albo końca magistrali/);
  });

  it('bez aktywnego przypadku obliczeniowego klik zapisu wskazuje go (komplet danych)', async () => {
    appState.activeCaseId = null;
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    await zapiszIOczekujWskazania(/aktywny przypadek obliczeniowy/);
  });
});


describe('B-8 — zapisz konfigurację jako szablon użytkownika', () => {
  it('zapis z kroku podglądu wysyła STAN FORMULARZA i pokazuje potwierdzenie', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    await wybierzTyp();

    // Natywna ścieżka: krok podglądu → nazwa szablonu → klik „Zapisz jako szablon".
    await przejdzDoKroku('Podgląd skutków');
    const nazwa = await screen.findByTestId('mvd-kreator-stacja-szablon-nazwa');
    await userEvent.type(nazwa, 'Moja stacja 630');
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-szablon-zapisz'));

    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-stacja-szablon-zapis-komunikat')).toHaveTextContent(
        'Moja stacja 630',
      ),
    );
    // Zapisany został STAN FORMULARZA — z wybranym transformatorem.
    expect(zapisaneSzablony).toHaveLength(1);
    expect(zapisaneSzablony[0].configuration.catalog_ref).toBe('trafo-630-15-04');
    expect(zapisaneSzablony[0].name_pl).toBe('Moja stacja 630');
  });

  it('zapisany szablon pojawia się na liście kroku 0 ze ŹRÓDŁEM w etykiecie', async () => {
    render(<KreatorStacjiSnNn />);
    // Lista jest odświeżana po zapisie (poprzedni test zostawił wpis w mocku).
    const wybor = (await screen.findByTestId(
      'mvd-kreator-stacja-szablon-wybor',
    )) as HTMLSelectElement;
    await waitFor(() => {
      expect(wybor.querySelector('option[value="user_test1"]')).not.toBeNull();
    });
    const wlasny = wybor.querySelector('option[value="user_test1"]');
    expect(wlasny?.textContent).toContain('(mój szablon)');
    // Wbudowany ma własne oznaczenie — projektant widzi, skąd szablon pochodzi.
    // Wbudowany DOMYŚLNEJ kategorii (`typowa_sn_nn`): lista jest per kategoria,
    // więc szablon farmy PV pojawia się dopiero po jej wybraniu.
    const wbudowany = wybor.querySelector('option[value="tpl_typowa_400"]');
    expect(wbudowany?.textContent).toContain('(wbudowany)');
  });

  it('zmiana kategorii NIE zostawia na liście szablonów poprzedniej kategorii', async () => {
    // DEFEKT, KTÓRY TO PILNUJE: lista wbudowanych nie była czyszczona przy
    // zmianie kategorii, więc przez czas trwania żądania picker oferował
    // szablony POPRZEDNIEJ kategorii jako szablony wybranej — projektant mógł
    // wypełnić formularz szablonem z zupełnie innej kategorii, a pusty stan
    // („ta kategoria nie zawiera szablonów") padał również PODCZAS ładowania.
    render(<KreatorStacjiSnNn />);
    const wybor = (await screen.findByTestId(
      'mvd-kreator-stacja-szablon-wybor',
    )) as HTMLSelectElement;
    await waitFor(() => {
      expect(wybor.querySelector('option[value="tpl_typowa_400"]')).not.toBeNull();
    });

    // Odpowiedź dla NOWEJ kategorii wstrzymana — mierzymy dokładnie okno,
    // w którym dane wybranej kategorii jeszcze nie dotarły.
    biblioteka.wstrzymajNastepne();
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-szablon-kategoria'),
      'farma_pv',
    );

    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-stacja-szablon-laduje')).toBeInTheDocument();
    });
    expect(wybor.querySelector('option[value="tpl_typowa_400"]')).toBeNull();
    expect(wybor.querySelector('option[value="tpl_farma_pv_1mw"]')).toBeNull();
    // Ładowanie ≠ pustka: komunikat „ta kategoria nie zawiera szablonów" nie
    // może paść, zanim odpowiedź przyjdzie.
    expect(screen.queryByTestId('mvd-kreator-stacja-szablon-pusty')).toBeNull();

    biblioteka.zwolnij();
    await waitFor(() => {
      expect(wybor.querySelector('option[value="tpl_farma_pv_1mw"]')).not.toBeNull();
    });
    expect(screen.queryByTestId('mvd-kreator-stacja-szablon-laduje')).toBeNull();
  });

  it('bez nazwy klik zapisu szablonu mówi, czego brakuje (nic nie zapisuje)', async () => {
    // Intencja (dawniej: przycisk wyszarzony): bez nazwy szablon nie powstaje — klik
    // mówi wprost, czego brakuje.
    zapisaneSzablony.length = 0;
    render(<KreatorStacjiSnNn />);
    await przejdzDoKroku('Podgląd skutków');
    const przycisk = await screen.findByTestId('mvd-kreator-stacja-szablon-zapisz');
    expect(przycisk).toBeEnabled();
    await userEvent.click(przycisk);
    expect(await screen.findByTestId('mvd-kreator-stacja-szablon-zapis-komunikat')).toHaveTextContent(/nazw/i);
    expect(zapisaneSzablony).toHaveLength(0);
  });
});

/**
 * KOMPLETNOSC-POLA-TR §0 pkt 1/4 — pole transformatorowe w kreatorze stacji.
 *
 * WSZYSTKO PRZEZ REALNĄ ŚCIEŻKĘ UŻYTKOWNIKA: nawigacja klikiem w nagłówek kroku,
 * wybory `selectOptions`, usuwanie i przywracanie pola klikiem w przycisk.
 * Żadnego `dispatchEvent` ani wymuszania stanu store — test, który omija
 * interakcję, nie wykryłby regresji tej właśnie interakcji (zasada Zero-Debt
 * pkt 5: test maskujący defekt produktu = dwa defekty).
 */
describe('KreatorStacjiSnNn — pole transformatorowe (KOMPLETNOSC-POLA-TR)', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { ...KONTEKST_PODZIALU };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    navigateToSldMock.mockReset();
    selectElementMock.mockReset();
    centerSldOnElementMock.mockReset();
  });

  afterEach(() => cleanup());

  it('DOMYŚLNIE tworzy pole transformatorowe — bez ani jednego kliknięcia w listę pól', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    // Krok pól odwiedzony, ale NIC w nim nie zmieniamy — sprawdzamy DOMYŚLNĄ
    // zawartość listy, nie skutek edycji.
    expect(screen.queryByTestId('mvd-kreator-stacja-brak-pola-tr')).toBeNull();

    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const role = (payload.sn_fields as Array<{ field_role: string }>).map((f) => f.field_role);
    expect(role).toContain('TRANSFORMATOROWE');
  });

  it('pole transformatorowe dostaje aparat DOPUSZCZALNY dla swojej roli (zawężenie z backendu)', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();

    // Pole 4 to pole transformatorowe (kolejność ról stacji odgałęźnej).
    const aparatTr = screen.getByTestId('mvd-kreator-stacja-aparat-4') as HTMLSelectElement;
    const opcjeTr = [...aparatTr.querySelectorAll('option')].map((o) => o.value).filter(Boolean);
    // TR: rozłącznik bezpiecznikowy albo wyłącznik — odłącznik NIE jest aparatem
    // pola transformatorowego i nie może się w liście pojawić.
    expect(opcjeTr).toContain('sw-fuse-eti-vv-17kv-63a');
    expect(opcjeTr).toContain('sw-cb-abb-vd4-17kv-630a');
    expect(opcjeTr).not.toContain('sw-ds-abb-ojs-17kv-630a');

    // Pole liniowe (1) ma INNY zbiór: bez rozłącznika bezpiecznikowego.
    const aparatLinia = screen.getByTestId('mvd-kreator-stacja-aparat-1') as HTMLSelectElement;
    const opcjeLinia = [...aparatLinia.querySelectorAll('option')].map((o) => o.value).filter(Boolean);
    expect(opcjeLinia).toContain('sw-cb-abb-vd4-17kv-630a');
    expect(opcjeLinia).not.toContain('sw-fuse-eti-vv-17kv-63a');
  });

  it('rozłącznik bezpiecznikowy wybrany natywnie dla pola TR jedzie do operacji', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-aparat-4'),
      'sw-fuse-eti-vv-17kv-63a',
    );
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const polaTr = (payload.sn_fields as Array<{ field_role: string; apparatus_catalog_ref: string }>)
      .filter((f) => f.field_role === 'TRANSFORMATOROWE');
    expect(polaTr).toHaveLength(1);
    expect(polaTr[0].apparatus_catalog_ref).toBe('sw-fuse-eti-vv-17kv-63a');
  });

  it('usunięcie pola TR: jawny komunikat skutków i ZABLOKOWANY zapis (POLA-W-TORZE)', async () => {
    // Intencja KOMPLETNOSC-POLA-TR zostaje: kreator NAZYWA skutek braku pola TR zamiast
    // milczeć. Zmienił się skutek (karta POLA-W-TORZE): transformator leży na zacisku pola
    // transformatorowego, a operacja bez wspólnego aparatu pól odmawia domknięcia pola —
    // zapis bez pola TR nie jest już stanem roboczym, tylko odmową, więc kreator go blokuje.
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();

    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-pole-usun-4'));

    const panel = await screen.findByTestId('mvd-kreator-stacja-brak-pola-tr');
    expect(panel.textContent).toMatch(/odłącza transformator/);
    expect(panel.textContent).toMatch(/nie da się zapisać/);

    await zapiszIOczekujWskazania(/wymaga pól toru: .*transformatorowe/i);
  });

  it.each([
    // tryb × usunięte pole (numer wiersza w domyślnym składzie) × czy pole należy do toru
    ['podział odcinka', 'SPLIT', 1, 'LINIA_IN', true],
    ['podział odcinka', 'SPLIT', 2, 'LINIA_OUT', true],
    ['podział odcinka', 'SPLIT', 3, 'LINIA_ODG', false],
    ['koniec odcinka', 'ENDPOINT_APPEND', 1, 'LINIA_IN', true],
  ] as const)(
    '%s: usunięcie pola %s (%s) — pole toru blokuje zapis i wraca jednym kliknięciem na swoje miejsce',
    async (_opis, tryb, numer, rola, wToru) => {
      context =
        tryb === 'SPLIT'
          ? { ...KONTEKST_PODZIALU }
          : { placement_mode: 'ENDPOINT_APPEND', endpoint_bus_ref: 'bus-end', run_ref: 'run-1' };
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorStacjiSnNn />);

      await przejdzDoTransformatora();
      await wybierzTyp();
      await przejdzIWybierzRozdzielnice();
      await userEvent.click(screen.getByTestId(`mvd-kreator-stacja-pole-usun-${numer}`));

      if (!wToru) {
        // Pole spoza toru (odgałęźne) usuwa się bez skutku dla zapisu.
        expect(screen.queryByTestId('mvd-kreator-stacja-brak-pol-toru')).toBeNull();
        await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
        await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
        return;
      }

      const panel = await screen.findByTestId('mvd-kreator-stacja-brak-pol-toru');
      expect(panel.textContent).toMatch(/nie da się zapisać/);
      await zapiszIOczekujWskazania(/wymaga pól toru/);

      await userEvent.click(screen.getByTestId(`mvd-kreator-stacja-dodaj-pole-toru-${rola}`));
      await waitFor(() => expect(screen.queryByTestId('mvd-kreator-stacja-brak-pol-toru')).toBeNull());
      // Przywrócone pole dostaje aparat od projektanta (oferta ma kilka zdatnych pozycji).
      await wybierzAparatyPol();
      await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
      const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
      const pola = payload.sn_fields as Array<{ field_role: string; apparatus_catalog_ref: string }>;
      // Kolejność toru: wejściowe na początku, wyjściowe zaraz za wejściowym.
      expect(pola.map((f) => f.field_role)).toEqual(
        tryb === 'SPLIT'
          ? ['LINIA_IN', 'LINIA_OUT', 'LINIA_ODG', 'TRANSFORMATOROWE']
          : ['LINIA_IN', 'TRANSFORMATOROWE'],
      );
      expect(pola.every((f) => Boolean(f.apparatus_catalog_ref))).toBe(true);
    },
  );

  it('brak readoutu zawężenia ról NIE kasuje katalogu aparatów (degradacja proporcjonalna)', async () => {
    // Backend bez końcówki `/bay-apparatus-kinds` (starsza wersja, błąd sieci):
    // kreator traci ZAWĘŻENIE, nie listę. Pierwsza wersja tej karty pobierała
    // obie dane jednym `Promise.all`, więc porażka dodatku kasowała dobór —
    // krok pól stawał się pusty i stacji nie dawało się zapisać.
    zawezenieRolNiedostepne = true;
    try {
      executeDomainOperationMock.mockResolvedValue({ error: null });
      render(<KreatorStacjiSnNn />);

      await przejdzDoTransformatora();
      await wybierzTyp();
      await przejdzIWybierzRozdzielnice();

      const aparatTr = screen.getByTestId('mvd-kreator-stacja-aparat-4') as HTMLSelectElement;
      const opcje = [...aparatTr.querySelectorAll('option')].map((o) => o.value).filter(Boolean);
      // Pełny katalog (bez zawężenia) — łącznie z odłącznikiem, którego przy
      // działającym readoucie w tym polu nie ma.
      expect(opcje).toContain('sw-cb-abb-vd4-17kv-630a');
      expect(opcje).toContain('sw-ds-abb-ojs-17kv-630a');
      expect(opcje.length).toBeGreaterThan(0);

      // Zapis nadal możliwy — pole TR jedzie z aparatem.
      await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
      await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
      const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
      const tr = (payload.sn_fields as Array<{ field_role: string; apparatus_catalog_ref: string }>)
        .filter((f) => f.field_role === 'TRANSFORMATOROWE');
      expect(tr).toHaveLength(1);
      expect(tr[0].apparatus_catalog_ref).toBeTruthy();
    } finally {
      zawezenieRolNiedostepne = false;
    }
  });

  it('panel kontroli niesie stan pola TR — widoczny z KAŻDEGO kroku, nie tylko z listy pól', async () => {
    // Panel skutków żyje w kroku pól; projektant, który po usunięciu pola przejdzie
    // dalej, nie zobaczyłby już nic. Wiersz kontroli jest w stałej kolumnie kreatora.
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();

    const gotowosc = screen.getByTestId('mvd-kreator-stacja-gotowosc');
    expect(gotowosc.textContent).toMatch(/Pole transformatorowe/);
    expect(gotowosc.textContent).toMatch(/W rozdzielnicy/);

    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-pole-usun-4'));
    await waitFor(() => {
      expect(screen.getByTestId('mvd-kreator-stacja-gotowosc').textContent).toMatch(
        /Brak — wymagane do zapisu/,
      );
    });

    // Krok zmieniony na inny — stan pola TR NADAL widoczny (stała kolumna).
    await przejdzDoKroku('Blok nN');
    expect(screen.getByTestId('mvd-kreator-stacja-gotowosc').textContent).toMatch(
      /Brak — wymagane do zapisu/,
    );
  });

  it('przywrócenie pola TR jednym kliknięciem — komunikat znika, rola wraca do operacji', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-pole-usun-4'));
    await screen.findByTestId('mvd-kreator-stacja-brak-pola-tr');

    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-przywroc-pole-tr'));
    await waitFor(() => {
      expect(screen.queryByTestId('mvd-kreator-stacja-brak-pola-tr')).toBeNull();
    });
    await wybierzAparatyPol();

    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const pola = payload.sn_fields as Array<{ field_role: string; apparatus_catalog_ref: string }>;
    const tr = pola.filter((f) => f.field_role === 'TRANSFORMATOROWE');
    expect(tr).toHaveLength(1);
    // Przywrócone pole jest KOMPLETNE: aparat dopuszczalny dla roli TR.
    expect(['sw-fuse-eti-vv-17kv-63a', 'sw-cb-abb-vd4-17kv-630a']).toContain(
      tr[0].apparatus_catalog_ref,
    );
  });
});

/**
 * KONFIGURATOR-POL-RMU (etap S3) — DWA TORY KONFIGURACJI na realnej ścieżce
 * użytkownika (natywne kliknięcia i natywny wybór z list).
 *
 * Pokrycie jest ILOCZYNEM CECH, bo defekt chowa się w kombinacji, nie w
 * pojedynczym scenariuszu karty:
 *   (tor MODUŁOWY × tor BLOKOWY RMU)
 * × (rodzina z danymi katalogu × rodzina z długiem danych × rodzina bez toru)
 * × (wyposażenie FABRYCZNE × OPCJA sterowalna × OPCJA bez dostawcy)
 * × (werdykt VALID × INVALID z backendu).
 */
describe('KreatorStacjiSnNn — tory konfiguracji rozdzielnicy (S3)', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { ...KONTEKST_PODZIALU };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({ error: null });
  });

  afterEach(() => cleanup());

  /** Dojście do kroku pól z wybranym producentem i WSKAZANĄ rodziną. */
  async function wybierzRodzine(familyRef: string) {
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzDoKroku('Pola rozdzielnicy SN');
    await waitFor(() => {
      const producent = screen.getByTestId('mvd-kreator-stacja-producent') as HTMLSelectElement;
      expect(producent.querySelector('option[value="ZPUE_WLOSZCZOWA"]')).not.toBeNull();
    });
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-producent'),
      'ZPUE_WLOSZCZOWA',
    );
    await waitFor(() => {
      const rodzina = screen.getByTestId('mvd-kreator-stacja-rodzina') as HTMLSelectElement;
      expect(rodzina.querySelector(`option[value="${familyRef}"]`)).not.toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-rodzina'), familyRef);
  }

  /**
   * KATALOG-FIRST. Krok komponował wcześniej pola z pakietu producenta BEZ
   * względu na rodzinę, więc rozdzielnica mogła powstać z kart dwóch różnych
   * wyrobów naraz — ta sama atrapa, co usunięta „rodzina standardowa
   * producenta", tylko niewidoczna dla projektanta.
   */
  it('bez wskazanej rodziny NIE komponuje pól — mówi, jaki jest następny krok', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzDoKroku('Pola rozdzielnicy SN');
    await waitFor(() => {
      const producent = screen.getByTestId('mvd-kreator-stacja-producent') as HTMLSelectElement;
      expect(producent.querySelector('option[value="ZPUE_WLOSZCZOWA"]')).not.toBeNull();
    });
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-producent'),
      'ZPUE_WLOSZCZOWA',
    );

    // Producent wybrany, rodzina NIE — pól nie ma i ekran nazywa następny krok.
    expect(await screen.findByTestId('mvd-kreator-stacja-pola-puste')).toHaveTextContent(
      /Wskaż rodzinę rozdzielnicy/i,
    );
    expect(screen.queryByTestId('mvd-kreator-stacja-pole-wiersz-1')).toBeNull();
    // WSKAZANIE NAZYWA REALNY POWÓD (naprawa 2026-08-14, przeniesiona na kontrakt
    // prowadzenia 2026-10-15). Defekt zastany: stopka mówiła „Brak kompletnych szablonów
    // pól … wybierz inny pakiet katalogowy", choć brakowało WYŁĄCZNIE wskazania rodziny.
    await zapiszIOczekujWskazania(/Wybierz rodzinę rozdzielnicy SN/);
    expect(screen.getByTestId('mvd-kreator-wskazanie')).not.toHaveTextContent(
      /Brak kompletnych szablonów pól/i,
    );

    // Wskazanie rodziny domyka krok: pola rodzaju stacji wchodzą z jej pakietu, a JEDYNA
    // karta rodziny dla roli wchodzi do pola sama (przejście 630 kVA, pkt 1).
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-rodzina'), 'ZPUE_ROTOBLOK');
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-stacja-pole-wiersz-1')).toBeInTheDocument(),
    );
    await waitFor(() => expect(wartosc('mvd-kreator-stacja-pole-szablon-1')).toBe('tpl-in'));
  });

  /**
   * SZABLON STARTOWY × BRAK RODZINY. Lista pól z szablonu jest decyzją
   * projektanta z kroku 0 (role i aparaty przyszły z szablonu), więc bramka
   * katalog-first NIE MOŻE jej skasować — ma poczekać na wskazanie rodziny.
   * To jest właśnie ten iloczyn cech, w którym „wyczyść pola bez rodziny"
   * cicho wyrzuciłoby pracę projektanta.
   */
  it('pola z SZABLONU STARTOWEGO przeżywają brak rodziny i czekają na jej wskazanie', async () => {
    render(<KreatorStacjiSnNn />);
    const wybor = (await screen.findByTestId(
      'mvd-kreator-stacja-szablon-wybor',
    )) as HTMLSelectElement;
    await waitFor(() => {
      expect(wybor.querySelector('option[value="tpl_typowa_400"]')).not.toBeNull();
    });
    await userEvent.selectOptions(wybor, 'tpl_typowa_400');
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-szablon-zastosuj'));
    await screen.findByTestId('mvd-kreator-stacja-szablon-zastosowany');

    await przejdzDoKroku('Pola rozdzielnicy SN');
    // Pola szablonu są na liście, choć rodziny jeszcze nie wskazano.
    expect(await screen.findByTestId('mvd-kreator-stacja-pole-wiersz-1')).toBeInTheDocument();
    // Karty katalogowej nie ma — nie dobieramy jej z pakietu producenta, bo
    // mieszałaby wyroby; krok pozostaje jawnie niedomknięty.
    const szablonPola = screen.getByTestId(
      'mvd-kreator-stacja-pole-szablon-1',
    ) as HTMLSelectElement;
    expect(szablonPola.value).toBe('');
    // Producent przyszedł z szablonu stacji (efektywna konfiguracja), rodziny brak — klik
    // zapisu wskazuje rodzinę (dawniej: wyszarzony przycisk).
    expect(wartosc('mvd-kreator-stacja-producent')).toBe('ZPUE_WLOSZCZOWA');
    await zapiszIOczekujWskazania(/rodzinę rozdzielnicy/);

    // Wskazanie rodziny domyka krok: pola dostają karty JEJ pakietu.
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-producent'),
      'ZPUE_WLOSZCZOWA',
    );
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-rodzina'), 'ZPUE_ROTOBLOK');
    await waitFor(() => {
      expect(
        (screen.getByTestId('mvd-kreator-stacja-pole-szablon-1') as HTMLSelectElement).value,
      ).not.toBe('');
    });
  });

  it('rodziny NIEDOSTĘPNE są WIDOCZNE i wyłączone — z jawnym powodem', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzDoKroku('Pola rozdzielnicy SN');
    await waitFor(() => {
      const producent = screen.getByTestId('mvd-kreator-stacja-producent') as HTMLSelectElement;
      expect(producent.querySelector('option[value="ZPUE_WLOSZCZOWA"]')).not.toBeNull();
    });
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-producent'),
      'ZPUE_WLOSZCZOWA',
    );

    const rodzina = (await screen.findByTestId(
      'mvd-kreator-stacja-rodzina',
    )) as HTMLSelectElement;
    // Wszystkie cztery rodziny producenta są na liście (portfolio, nie wycinek).
    for (const ref of ['ZPUE_ROTOBLOK', 'ZPUE_TPM_AIR', 'SCHNEIDER_RM6', 'BEZ_KONSTRUKCJI']) {
      expect(rodzina.querySelector(`option[value="${ref}"]`)).not.toBeNull();
    }
  });

  it('nagłówek rodziny podaje klasy znamionowe, technologię i TOR KONFIGURACJI', async () => {
    render(<KreatorStacjiSnNn />);
    await wybierzRodzine('ZPUE_TPM_AIR');

    const naglowek = await screen.findByTestId('mvd-kreator-stacja-naglowek-rodziny');
    // Fikstura TPM_AIR deklaruje klasę urządzenia 17,5 kV; nagłówek nazywa
    // wielkość, więc projektant nie zgaduje, czy czyta sieć, czy izolację.
    expect(naglowek).toHaveTextContent('urządzenie 17,5 kV');
    expect(naglowek).toHaveTextContent('630 A');
    expect(naglowek).toHaveTextContent('20 kA');
    expect(naglowek).toHaveTextContent('powietrzna');
    expect(naglowek).toHaveTextContent('RMU');
    expect(naglowek).toHaveTextContent(/blokowy/i);
  });

  it('rodzina bez zadeklarowanej konstrukcji: jawny brak toru, ZERO domysłu', async () => {
    render(<KreatorStacjiSnNn />);
    await wybierzRodzine('BEZ_KONSTRUKCJI');

    await screen.findByTestId('mvd-kreator-stacja-tor-brak');
    // Żaden tor się nie włącza — ani składanie z pól, ani wybór bloku.
    expect(screen.queryByTestId('mvd-kreator-stacja-tor-modularny')).toBeNull();
    expect(screen.queryByTestId('mvd-kreator-stacja-tor-blok')).toBeNull();
    // …i NIC nie powstaje: ekran, który mówi „nie zgaduję toru", a mimo to
    // składa listę pól, zaprzeczałby sam sobie.
    await waitFor(() =>
      expect(screen.queryByTestId('mvd-kreator-stacja-pole-wiersz-1')).toBeNull(),
    );
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
    // Nagłówek pokazuje brak danej, a nie wartość domyślną.
    const naglowek = screen.getByTestId('mvd-kreator-stacja-naglowek-rodziny');
    expect(naglowek).toHaveTextContent('brak w karcie katalogowej');
  });

  it('tor MODUŁOWY: karta pola pokazuje skład katalogowy z oznaczeniami i statusami', async () => {
    render(<KreatorStacjiSnNn />);
    await wybierzRodzine('ZPUE_ROTOBLOK');

    await screen.findByTestId('mvd-kreator-stacja-tor-modularny');
    // Pole 1 (LINIA_IN) ma kartę `tpl-in` z pełnym składem.
    const karta = await screen.findByTestId('mvd-kreator-stacja-wyposazenie-1');
    expect(karta).toHaveTextContent('Q0');
    expect(karta).toHaveTextContent('wyłącznik');
    expect(karta).toHaveTextContent('Q9 (E)');
    expect(karta).toHaveTextContent('uziemnik');

    // FABRYCZNY = znacznik STAŁY (bez kontrolki wyboru).
    expect(
      screen.getByTestId('mvd-kreator-stacja-wyposazenie-1-status-dev-in-q1'),
    ).toHaveTextContent('fabryczne');
    expect(screen.queryByTestId('mvd-kreator-stacja-wyposazenie-1-opcja-dev-in-q1')).toBeNull();
  });

  it('tor MODUŁOWY × OPCJA z dostawcą: wskazanie pozycji katalogowej jedzie do operacji', async () => {
    render(<KreatorStacjiSnNn />);
    await wybierzRodzine('ZPUE_ROTOBLOK');

    // Przekładnik prądowy jest OPCJĄ pola — a operacja stacyjna ma dla niego
    // pole payloadu (`equipment.ct`), więc kontrolka JEST i realnie działa.
    const picker = await screen.findByTestId('mvd-kreator-stacja-wyposazenie-1-opcja-dev-in-ct');
    expect(
      screen.getByTestId('mvd-kreator-stacja-wyposazenie-1-status-dev-in-ct'),
    ).toHaveTextContent('poza konfiguracją');

    await userEvent.selectOptions(picker, 'ct-400-5');
    await waitFor(() =>
      expect(
        screen.getByTestId('mvd-kreator-stacja-wyposazenie-1-status-dev-in-ct'),
      ).toHaveTextContent('w konfiguracji'),
    );

    await wybierzAparatyPol();
    await uzupelnijNnIUziemienie();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());

    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const pola = payload.sn_fields as Array<{
      field_role: string;
      equipment?: { ct?: { catalog_ref?: string } };
    }>;
    const poleIn = pola.find((f) => f.field_role === 'LINIA_IN');
    expect(poleIn?.equipment?.ct?.catalog_ref).toBe('ct-400-5');
  });

  it('tor MODUŁOWY × OPCJA bez dostawcy: BRAK kontrolki + jawny powód (zero phantomu)', async () => {
    render(<KreatorStacjiSnNn />);
    await wybierzRodzine('ZPUE_ROTOBLOK');

    await screen.findByTestId('mvd-kreator-stacja-wyposazenie-1');
    // Ogranicznik przepięć jest OPCJĄ karty, ale operacja stacyjna nie ma dla
    // niego pola — przełącznika bez skutku w modelu NIE POKAZUJEMY.
    expect(screen.queryByTestId('mvd-kreator-stacja-wyposazenie-1-opcja-dev-in-sa')).toBeNull();
    expect(
      screen.getByTestId('mvd-kreator-stacja-wyposazenie-1-bez-dostawcy-dev-in-sa'),
    ).toHaveTextContent(/nie ma pola dla tego rodzaju aparatu/i);
  });

  it('tor BLOKOWY RMU: wybór bloku buduje pola z jednostek wyrobu (skład STAŁY)', async () => {
    render(<KreatorStacjiSnNn />);
    await wybierzRodzine('ZPUE_TPM_AIR');

    await screen.findByTestId('mvd-kreator-stacja-tor-blok');
    // Dopóki blok niewybrany — nie ma pól i mówimy o tym wprost.
    expect(await screen.findByTestId('mvd-kreator-stacja-blok-niewybrany')).toBeInTheDocument();

    await userEvent.selectOptions(
      await screen.findByTestId('mvd-kreator-stacja-blok'),
      'ZPUE_TPM_AIR__LLT',
    );

    // Skład wyrobu: trzy jednostki w kolejności katalogowej.
    expect(await screen.findByTestId('mvd-kreator-stacja-blok-sekwencja')).toHaveTextContent(
      'L-L-T',
    );
    expect(screen.getByTestId('mvd-kreator-stacja-blok-jednostka-3')).toHaveTextContent(
      'zestaw bezpieczników',
    );
    // Szerokość, której karta nie podaje, zostaje BRAKIEM.
    expect(screen.getByTestId('mvd-kreator-stacja-blok-szerokosc')).toHaveTextContent(
      'brak w karcie katalogowej',
    );

    // Jednostek nie da się dostawić ani usunąć — to inny wyrób.
    expect(screen.queryByTestId('mvd-kreator-stacja-pole-dodaj')).toBeNull();
    expect(screen.queryByTestId('mvd-kreator-stacja-pole-usun-1')).toBeNull();

    // Aparaty jednostek bloku: rozłączniki w jednostkach liniowych, rozłącznik
    // bezpiecznikowy w jednostce transformatorowej (zgodnie z kartą jednostki).
    await wybierzAparatyPol(['sw-ls-zpue-nal-17kv-630a', 'sw-fuse-eti-vv-17kv-63a']);
    await uzupelnijNnIUziemienie();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());

    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const pola = payload.sn_fields as Array<{
      field_role: string;
      bay_template_ref: string | null;
      catalog_bindings: Record<string, { catalog_item_id?: string }> | null;
      factory_configuration_ref?: string;
      factory_unit_index?: number;
    }>;
    // Tor bloku (POLA-W-TORZE): pierwsza jednostka liniowa jest polem wejściowym stacji.
    expect(pola.map((f) => f.field_role)).toEqual([
      'LINIA_IN',
      'LINIA_OUT',
      'TRANSFORMATOROWE',
    ]);
    // Pola biorą karty katalogowe WYBRANEJ rodziny (nie cudzego pakietu).
    expect(pola.map((f) => f.bay_template_ref)).toEqual(['tpl-tpm-l', 'tpl-tpm-l', 'tpl-tpm-t']);
    // Przynależność do bloku zostaje w modelu — pole RMU nie jest luźną szafą.
    // POLEM PIERWSZEJ KLASY payloadu, tą samą nazwą, którą czyta operacja
    // (dawna metadana `catalog_bindings.factory_configuration` była drugim
    // nazewnictwem tej samej prawdy i żadna operacja stacyjna jej nie czytała).
    for (const pole of pola) {
      expect(pole.factory_configuration_ref).toBe('ZPUE_TPM_AIR__LLT');
      expect(pole.catalog_bindings).not.toHaveProperty('factory_configuration');
    }
    // Numer jednostki ODRÓŻNIA pola bloku: blok LLT ma DWIE jednostki „L",
    // więc bez numeru nie wiadomo, które pole bloku powstaje.
    expect(pola.map((f) => f.factory_unit_index)).toEqual([1, 2, 3]);
  });

  it('tor BLOKOWY RMU: zmiana bloku PRZEBUDOWUJE pola (LLT → LL)', async () => {
    render(<KreatorStacjiSnNn />);
    await wybierzRodzine('ZPUE_TPM_AIR');

    const picker = await screen.findByTestId('mvd-kreator-stacja-blok');
    await userEvent.selectOptions(picker, 'ZPUE_TPM_AIR__LLT');
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-stacja-blok-jednostka-3')).toBeInTheDocument(),
    );

    await userEvent.selectOptions(picker, 'ZPUE_TPM_AIR__LL');
    await waitFor(() =>
      expect(screen.queryByTestId('mvd-kreator-stacja-blok-jednostka-3')).toBeNull(),
    );

    // Blok L-L nie ma jednostki transformatorowej, a kreator zawsze tworzy transformator:
    // transformator nie miałby pola, w którego torze leży (POLA-W-TORZE) — zapis
    // zablokowany, komunikat kieruje do bloku z jednostką transformatorową, a przycisku
    // dostawienia pola w torze blokowym nie ma (to byłby inny wyrób).
    const panel = await screen.findByTestId('mvd-kreator-stacja-brak-pola-tr');
    expect(panel.textContent).toMatch(/blok z jednostką transformatorową/);
    expect(screen.queryByTestId('mvd-kreator-stacja-przywroc-pole-tr')).toBeNull();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  /**
   * PRZEJŚCIE MIĘDZY TORAMI — wejście i wyjście ze zbioru „pola z bloku" muszą
   * mieć JEDNO źródło. Projektant, który obejrzy blok RMU i wróci do rodziny
   * modułowej, nie może zostać z pustą rozdzielnicą (jednostki bloku odeszły
   * razem z wyrobem, a domyślne pola rodzaju stacji już nie wrócą) ani z polami
   * poprzedniego bloku (opisywałyby wyrób, którego nie wybrano).
   */
  it('powrót z toru BLOKOWEGO do MODUŁOWEGO odbudowuje pola rodzaju stacji', async () => {
    render(<KreatorStacjiSnNn />);
    await wybierzRodzine('ZPUE_TPM_AIR');
    await userEvent.selectOptions(
      await screen.findByTestId('mvd-kreator-stacja-blok'),
      'ZPUE_TPM_AIR__LLT',
    );
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-stacja-blok-jednostka-3')).toBeInTheDocument(),
    );

    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-rodzina'),
      'ZPUE_ROTOBLOK',
    );

    // Tor modułowy wraca razem z edytowalną listą pól rodzaju stacji.
    await screen.findByTestId('mvd-kreator-stacja-tor-modularny');
    expect(await screen.findByTestId('mvd-kreator-stacja-pole-dodaj')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-stacja-pole-wiersz-4')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('mvd-kreator-stacja-tor-blok')).toBeNull();

    await wybierzAparatyPol();
    await uzupelnijNnIUziemienie();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());

    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const pola = payload.sn_fields as Array<{
      bay_template_ref: string | null;
      catalog_bindings: Record<string, unknown> | null;
    }>;
    // Pola należą do rodziny modułowej, a przynależność do bloku znika razem
    // z wyborem wyrobu (klucz jest nieobecny, nie pusty) — w OBU nazewnictwach:
    // ani jako pole pierwszej klasy, ani jako dawna metadana wiązań.
    expect(pola.every((f) => f.bay_template_ref?.startsWith('tpl-tpm') !== true)).toBe(true);
    for (const pole of pola) {
      expect(pole).not.toHaveProperty('factory_configuration_ref');
      expect(pole).not.toHaveProperty('factory_unit_index');
      expect(pole.catalog_bindings).not.toHaveProperty('factory_configuration');
    }
  });

  it('tor BLOKOWY RMU × rodzina z DŁUGIEM DANYCH: uczciwy stan zerowy, zero fabrykacji', async () => {
    render(<KreatorStacjiSnNn />);
    await wybierzRodzine('SCHNEIDER_RM6');

    await screen.findByTestId('mvd-kreator-stacja-tor-blok');
    await screen.findByTestId('mvd-kreator-stacja-blok-brak');
    expect(screen.getByTestId('mvd-kreator-stacja-blok-brak')).toHaveTextContent(
      /czekają na kartę producenta/i,
    );
    // Żadnego wymyślonego bloku do wyboru i żadnych pól „w zamian".
    expect(screen.queryByTestId('mvd-kreator-stacja-blok')).toBeNull();
    expect(screen.queryByTestId('mvd-kreator-stacja-pole-wiersz-1')).toBeNull();
  });
});

/**
 * WERDYKT KONFIGURACJI POCHODZI Z BACKENDU (kanon §5) — UI go nie liczy.
 * Dublujemy warstwę SIECI (`fetch`), a nie własną logikę: żądanie i odpowiedź
 * przechodzą przez prawdziwy klient podglądu (`stacjaPodglad`), więc test
 * ćwiczy kontrakt, nie atrapę werdyktu.
 */
describe('KreatorStacjiSnNn — werdykt walidatora backendu', () => {
  const oryginalnyFetch = globalThis.fetch;

  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { ...KONTEKST_PODZIALU };
    snapshotState.error = null;
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    globalThis.fetch = oryginalnyFetch;
    cleanup();
  });

  async function przejdzDoPolZRodzina() {
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzDoKroku('Pola rozdzielnicy SN');
    await waitFor(() => {
      const producent = screen.getByTestId('mvd-kreator-stacja-producent') as HTMLSelectElement;
      expect(producent.querySelector('option[value="ZPUE_WLOSZCZOWA"]')).not.toBeNull();
    });
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-producent'),
      'ZPUE_WLOSZCZOWA',
    );
    await waitFor(() => {
      const rodzina = screen.getByTestId('mvd-kreator-stacja-rodzina') as HTMLSelectElement;
      expect(rodzina.querySelector('option[value="ZPUE_ROTOBLOK"]')).not.toBeNull();
    });
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-rodzina'), 'ZPUE_ROTOBLOK');
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-stacja-aparat-1')).toBeInTheDocument());
  }

  it('konfiguracja W TOKU: walidator milczy — bez zapytania i bez statusu w nagłówku', async () => {
    // Kontrakt prowadzenia: w trakcie pracy kreator nie wysyła sygnałów. Dawniej sprawdzenie
    // ruszało przy każdej zmianie i niekompletna konfiguracja świeciła „odrzucona”.
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    render(<KreatorStacjiSnNn />);
    await przejdzDoPolZRodzina();
    await new Promise((r) => setTimeout(r, 600));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mvd-podglad-status')).toBeNull();
  });

  it('konfiguracja PRZYJĘTA przez walidator → werdykt VALID w nagłówku rozdzielnicy', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ dry_run: true, preview: { inserted_station_id: 'st-1' } }),
    }) as unknown as typeof fetch;

    render(<KreatorStacjiSnNn />);
    await przejdzDoPolZRodzina();
    await wybierzAparatyPol();
    await uzupelnijNnIUziemienie();

    await waitFor(
      () =>
        expect(screen.getByTestId('mvd-podglad-status')).toHaveTextContent(
          'Konfiguracja przyjęta przez walidator',
        ),
      { timeout: 4000 },
    );
    // Werdykt jest odpowiedzią BACKENDU na TĘ SAMĄ operację, z flagą dry_run.
    const [, opcje] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse((opcje as { body: string }).body).operation.payload.dry_run).toBe(true);
  });

  it('konfiguracja ODRZUCONA przez walidator → werdykt INVALID (UI nie łagodzi)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      json: async () => ({ detail: { message_pl: 'Pole spoza rodziny rozdzielnicy.' } }),
    }) as unknown as typeof fetch;

    render(<KreatorStacjiSnNn />);
    await przejdzDoPolZRodzina();
    await wybierzAparatyPol();
    await uzupelnijNnIUziemienie();

    await waitFor(
      () =>
        expect(screen.getByTestId('mvd-podglad-status')).toHaveTextContent(
          'Konfiguracja odrzucona przez walidator',
        ),
      { timeout: 4000 },
    );
  });
});

/**
 * PROWADZENIE PROJEKTANTA (karta PROWADZENIE-KREATORY) — iloczyn cech:
 *   stan formularza {świeży, w toku, zapis z brakiem, konflikt, komplet}
 * × źródło wartości {jedyna zgodna pozycja, kilka pozycji, propozycja szablonu spoza oferty}
 * × wyposażenie pola {aparat wyłączający, rozłącznik bezpiecznikowy}.
 * Wszystko natywnymi klikami i wyborem z list (Zero-Debt pkt 5).
 */
describe('KreatorStacjiSnNn — prowadzenie projektanta (iloczyn cech)', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { ...KONTEKST_PODZIALU };
    snapshotState.error = null;
    closeFormMock.mockReset();
    executeDomainOperationMock.mockReset();
    executeDomainOperationMock.mockResolvedValue({ error: null });
  });

  afterEach(() => cleanup());

  it('świeży formularz: cisza — bez wskazania, bez alertów, zapis aktywny', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    expect(screen.queryByTestId('mvd-kreator-wskazanie')).toBeNull();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    expect(screen.getByTestId('mvd-kreator-stacja-zapisz')).toBeEnabled();
    expect(document.body.textContent).not.toMatch(/Uzupełnij|wymagane pola|Do konfiguracji|Do doboru/);
  });

  it('zapis z brakiem: JEDNO wskazanie „co — po co”, przejście do kroku i fokus na polu', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoKroku('Pola rozdzielnicy SN');
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    const wskazanie = await screen.findByTestId('mvd-kreator-wskazanie');
    expect(wskazanie).toHaveTextContent('Wybierz napięcie strony nN — od niego zależy dobór transformatora.');
    // Krok przestawiony na „Transformator i strona nN”, fokus na wskazanej kontrolce.
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-stacja-nn')).toHaveFocus());
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
    // Wybór wskazanego parametru gasi wskazanie (zdanie nie wisi nad wypełnionym polem).
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-nn'), '0.4');
    await waitFor(() => expect(screen.queryByTestId('mvd-kreator-wskazanie')).toBeNull());
  });

  it('w toku: wybory częściowe nie wywołują żadnego sygnału', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzDoKroku('Pola rozdzielnicy SN');
    expect(screen.queryByTestId('mvd-kreator-wskazanie')).toBeNull();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('konflikt: wartość niedopuszczalna widoczna przy polu OD RAZU, bez klikania zapisu', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoKroku('Uziemienie i punkt neutralny');
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-punkt-neutralny'),
      'resistor_grounded',
    );
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    await userEvent.type(screen.getByTestId('mvd-kreator-stacja-rezystancja-uziemienia'), '-5');
    expect(await screen.findByRole('alert')).toHaveTextContent(/liczbą dodatnią/);
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });

  it('komplet: jedyna karta rodziny wchodzi do pola sama, aparat (kilka zdatnych) wybiera projektant', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzDoKroku('Pola rozdzielnicy SN');
    await waitFor(() => expect(wartosc('mvd-kreator-stacja-producent')).toBe('ZPUE_WLOSZCZOWA'));
    // Producent: jedyny używalny w katalogu → w polu, edytowalny.
    expect(screen.getByTestId('mvd-kreator-stacja-producent')).toBeEnabled();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-rodzina'), 'ZPUE_ROTOBLOK');
    await waitFor(() => expect(wartosc('mvd-kreator-stacja-pole-szablon-1')).toBe('tpl-in'));
    expect(wartosc('mvd-kreator-stacja-aparat-1')).toBe('');
    // Brak etykiety pochodzenia przy wartości dobranej automatycznie (dyrektywa 2026-10-15).
    expect(screen.queryByText(/przyjęto/i)).toBeNull();
    await wybierzAparatyPol();
    await uzupelnijNnIUziemienie();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
  });

  /**
   * Predykaty parami (karta × aparat): karta przyjęta automatycznie jako jedyna zgodna
   * z aparatem zostaje tylko, dopóki jest z nim zgodna — po zmianie aparatu na niezgodny
   * kreator ją przelicza (tu: rodzina nie ma karty pola liniowego z rozłącznikiem, więc
   * karta pustoszeje, bez konfliktu). Kartę wskazaną świadomie zostawia; gdy żadna karta
   * roli nie pasuje do aparatu, konflikt wskazuje APARAT (zmiana karty nic by nie dała).
   * Iloczyn: karta {automat, decyzja projektanta} × aparat {zgodny, niezgodny}.
   */
  // Rodzaj wynikowy przed złożeniem pól (rodzina niewskazana) liczy się ze startowej listy
  // ról — pusta lista dawała fałszywą „stację końcową”. Iloczyn: deklaracja rodzaju
  // w kontekście {brak, odgałęźna} × umiejscowienie {podział odcinka}.
  it.each([
    [{ segment_id: 'seg-1', position_on_segment: 0.5 }, 'Stacja przelotowa'],
    [{ ...KONTEKST_PODZIALU }, 'Stacja odgałęźna'],
  ])('rodzaj w kontroli stacji przed wyborem rodziny: %o → %s', async (kontekstWywolania, rodzaj) => {
    context = { ...kontekstWywolania };
    render(<KreatorStacjiSnNn />);
    const panel = await screen.findByTestId('mvd-kreator-stacja-gotowosc');
    expect(panel).toHaveTextContent(rodzaj);
    expect(panel).not.toHaveTextContent('Stacja końcowa');
  });

  it('karta-automat idzie za aparatem; brak zgodnej karty wskazuje aparat', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    await waitFor(() => expect(wartosc('mvd-kreator-stacja-pole-szablon-1')).toBe('tpl-in'));
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-aparat-1'),
      'sw-cb-abb-vd4-17kv-630a',
    );
    expect(wartosc('mvd-kreator-stacja-pole-szablon-1')).toBe('tpl-in');
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-aparat-1'),
      'sw-ls-zpue-nal-17kv-630a',
    );
    await waitFor(() => expect(wartosc('mvd-kreator-stacja-pole-szablon-1')).toBe(''));
    expect(screen.queryByText(/inny aparat główny|Rodzina nie ma karty pola/)).toBeNull();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-pole-szablon-1'), 'tpl-in');
    expect(wartosc('mvd-kreator-stacja-pole-szablon-1')).toBe('tpl-in');
    expect(await screen.findByText(/Rodzina nie ma karty pola 1 z aparatem/)).toBeInTheDocument();
  });

  // Iloczyn: producent {rodziny, inny, brak} × wymienność {tak, nie} × rola pola.
  it('oferta aparatów pola = producent i rodzaje rodziny (bez innych producentów i reklozera)', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    for (const n of [1, 2, 3, 4]) {
      const select = screen.getByTestId(`mvd-kreator-stacja-aparat-${n}`) as HTMLSelectElement;
      const opcje = [...select.querySelectorAll('option')].map((o) => o.value);
      expect(opcje).not.toContain('sw-cb-siemens-3ah5-17kv-1250a');
      expect(opcje).not.toContain('sw-rec-abb-rec615-17kv-630a');
      expect(opcje).not.toContain('sw-ds-generic-slupowy-17kv-400a');
    }
    // Wkładki bezpiecznikowe (komponent wymienny, bez producenta rozdzielnic) zostają
    // w ofercie pola transformatorowego rodziny ZPUE.
    const tr = screen.getByTestId('mvd-kreator-stacja-aparat-4') as HTMLSelectElement;
    expect([...tr.querySelectorAll('option')].map((o) => o.value)).toContain('sw-fuse-eti-vv-17kv-63a');
  });

  it('nazwy zamiast identyfikatorów: kategorie, karty pól, odcinek', async () => {
    render(<KreatorStacjiSnNn />);
    const kategoria = (await screen.findByTestId(
      'mvd-kreator-stacja-szablon-kategoria',
    )) as HTMLSelectElement;
    await waitFor(() => expect(kategoria.textContent).toContain('Typowe stacje SN/nN'));
    expect(kategoria.textContent).not.toMatch(/typowa sn nn|typowa_sn_nn/);
    await przejdzDoKroku('Rodzaj i umiejscowienie');
    expect(screen.getByTestId('mvd-kreator-stacja-rodzaj')).toHaveTextContent('Odcinek L-1');
    expect(screen.getByTestId('mvd-kreator-stacja-rodzaj')).not.toHaveTextContent('seg-1');
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    const karta = screen.getByTestId('mvd-kreator-stacja-pole-szablon-1') as HTMLSelectElement;
    expect(karta.textContent).toContain('Pole liniowe Rotoblok');
    expect(karta.textContent).not.toMatch(/tpl-in|Zweryfikowane|repo/);
  });

  it('nazwa stacji z kroku „Rodzaj” trafia do operacji w obu kluczach nazwy', async () => {
    context = { placement_mode: 'ENDPOINT_APPEND', endpoint_bus_ref: 'bus-end', run_ref: 'run-1' };
    render(<KreatorStacjiSnNn />);
    await przejdzDoKroku('Rodzaj i umiejscowienie');
    await userEvent.type(screen.getByTestId('mvd-kreator-stacja-nazwa'), 'ST Kwiatowa');
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload.station).toMatchObject({ name: 'ST Kwiatowa', station_name: 'ST Kwiatowa' });
  });

  /**
   * Szablon stacji × aparat pola (przejście 630 kVA, pkt 4 i 6): CT i zabezpieczenie
   * z szablonu trafiają WYŁĄCZNIE do pól z aparatem wyłączającym; pole z rozłącznikiem
   * bezpiecznikowym nie dostaje ani przekaźnika, ani CT; VT nie trafia nigdzie. Przekaźnik
   * jedzie do operacji stacyjnej (przypisanie zabezpieczenia w modelu).
   */
  it('szablon: wyposażenie idzie za aparatem pola, VT nigdzie, przekaźnik jedzie do operacji', async () => {
    render(<KreatorStacjiSnNn />);
    const wybor = (await screen.findByTestId('mvd-kreator-stacja-szablon-wybor')) as HTMLSelectElement;
    await waitFor(() => expect(wybor.querySelector('option[value="tpl_typowa_400"]')).not.toBeNull());
    await userEvent.selectOptions(wybor, 'tpl_typowa_400');
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-szablon-zastosuj'));
    await screen.findByTestId('mvd-kreator-stacja-szablon-zastosowany');

    await przejdzDoKroku('Pola rozdzielnicy SN');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-rodzina'), 'ZPUE_ROTOBLOK');
    await waitFor(() => expect(wartosc('mvd-kreator-stacja-pole-szablon-1')).toBe('tpl-in'));
    // Propozycja szablonu spoza oferty rodziny (Siemens w celce ZPUE) odpada — wybór projektanta.
    expect(wartosc('mvd-kreator-stacja-aparat-1')).toBe('sw-cb-abb-vd4-17kv-630a');
    expect(wartosc('mvd-kreator-stacja-aparat-3')).toBe('');
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-aparat-3'), 'sw-fuse-eti-vv-17kv-63a');

    await przejdzDoKroku('Pomiar i zabezpieczenia');
    await waitFor(() => expect(wartosc('mvd-kreator-stacja-przekaznik-1')).toBe('relay-1'));
    expect(wartosc('mvd-kreator-stacja-ct-1')).toBe('ct-400-5');
    expect(wartosc('mvd-kreator-stacja-przekaznik-3')).toBe('');
    expect(wartosc('mvd-kreator-stacja-ct-3')).toBe('');
    for (const n of [1, 2, 3]) expect(wartosc(`mvd-kreator-stacja-vt-${n}`)).toBe('');

    // Przekaźnik ręcznie w polu z bezpiecznikiem = konflikt od razu przy polu.
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-przekaznik-3'), 'relay-1');
    expect(await screen.findByText(/Zabezpieczenie pola 3 wymaga wyłącznika/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByTestId('mvd-kreator-stacja-przekaznik-3'), '');

    // Rodzaj zabezpieczenia: kody pola liniowego wskazują dwa rodzaje → wskazanie przy zapisie.
    await uzupelnijNnIUziemienie();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    expect(await screen.findByTestId('mvd-kreator-wskazanie')).toHaveTextContent(
      /Wybierz rodzaj zabezpieczenia pola 1/,
    );
    await waitFor(() =>
      expect(screen.getByTestId('mvd-kreator-stacja-rodzaj-zabezpieczenia-1')).toHaveFocus(),
    );
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-rodzaj-zabezpieczenia-1'),
      'NADPRADOWY',
    );
    await userEvent.selectOptions(
      screen.getByTestId('mvd-kreator-stacja-rodzaj-zabezpieczenia-2'),
      'NADPRADOWY',
    );
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));

    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalledTimes(1));
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const pola = payload.sn_fields as Array<{
      field_role: string;
      equipment?: Record<string, Record<string, unknown>>;
    }>;
    expect(pola[0].equipment?.relay).toMatchObject({ catalog_ref: 'relay-1', relay_type: 'NADPRADOWY' });
    expect(pola[0].equipment?.ct).toMatchObject({ catalog_ref: 'ct-400-5' });
    expect(pola[0].equipment).not.toHaveProperty('vt');
    const tr = pola.find((p) => p.field_role === 'TRANSFORMATOROWE');
    expect(tr?.equipment).toBeUndefined();
  });
});

describe('KreatorStacjiSnNn — podgląd na żądanie idzie ścieżką prowadzenia', () => {
  const oryginalnyFetch = globalThis.fetch;

  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { ...KONTEKST_PODZIALU };
    executeDomainOperationMock.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = oryginalnyFetch;
    cleanup();
  });

  it('brak danych: klik „Przelicz podgląd” wskazuje brak i NIE wysyła operacji próbnej', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<KreatorStacjiSnNn />);
    await przejdzDoKroku('Podgląd skutków');
    await userEvent.click(await screen.findByTestId('mvd-kreator-stacja-podglad-przelicz'));
    expect(await screen.findByTestId('mvd-kreator-wskazanie')).toHaveTextContent(
      'Wybierz napięcie strony nN — od niego zależy dobór transformatora.',
    );
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-stacja-nn')).toHaveFocus());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('wskazanie braku pól toru gaśnie, gdy projektant dołoży brakujące pole przyciskiem', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-pole-usun-4'));
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    expect(await screen.findByTestId('mvd-kreator-wskazanie')).toHaveTextContent(/wymaga pól toru/);
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-przywroc-pole-tr'));
    await waitFor(() => expect(screen.queryByTestId('mvd-kreator-wskazanie')).toBeNull());
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
  });
});
