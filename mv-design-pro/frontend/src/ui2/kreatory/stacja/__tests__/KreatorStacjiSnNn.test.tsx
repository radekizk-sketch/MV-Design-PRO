/**
 * Testy kreatora „Dodaj stację SN/nN" (Audyt D, faza D2) — realna ścieżka
 * użytkownika (Zero-Debt §5): natywne interakcje (klik kroku, wybór typu z
 * katalogu, klik zapisu), a nie syntetyczne zdarzenia. Mockowane wyłącznie
 * store'y i końcówki API; helpery topologii (segment/napięcie SN) działają
 * na realnym snapshotcie. Weryfikuje, że zapis woła właściwą operację domenową
 * z poprawnym payloadem i wiąże nowy element ze schematem (V12K-073).
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

const appState: { activeCaseId: string | null } = { activeCaseId: 'case-1' };
let context: Record<string, unknown> = { segment_id: 'seg-1', position_on_segment: 0.5 };
const snapshotState = {
  error: null as string | null,
  executeDomainOperation: executeDomainOperationMock,
  snapshot: {
    buses: [
      { ref_id: 'bus-sn', name: 'Szyna SN', voltage_kv: 15 },
      { ref_id: 'bus-end', name: 'Terminal', voltage_kv: 15 },
    ],
    branches: [{ ref_id: 'seg-1', from_bus_ref: 'bus-sn', to_bus_ref: 'bus-end' }],
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

const szablon = (over: Record<string, unknown>) => ({
  template_ref: 'tpl',
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
  szablon({ template_ref: 'tpl-in', bay_kind: 'liniowe_doplywowe', bay_role: 'IN' }),
  szablon({ template_ref: 'tpl-out', bay_kind: 'liniowe_odplywowe', bay_role: 'OUT' }),
  szablon({ template_ref: 'tpl-tr', bay_kind: 'transformatorowe', bay_role: 'TR' }),
  szablon({ template_ref: 'tpl-coupler', bay_kind: 'sprzeglowe_poprzeczne', bay_role: 'COUPLER' }),
];

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
  fetchSwitchgearFamilies: () =>
    Promise.resolve([
      {
        switchgear_family_ref: 'ZPUE_ROTOBLOK',
        manufacturer_ref: 'ZPUE_WLOSZCZOWA',
        family_name: 'Rotoblok',
        series_name: null,
        voltage_levels: [15],
        insulation_type: 'sf6',
        construction_type: 'RMU',
        status: 'verified',
        source_refs: ['kat'],
        notes_pl: null,
      },
    ]),
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
      {
        id: 'sw-cb-abb-vd4-17kv-630a',
        name: 'ABB VD4 17,5 kV 630 A',
        device_kind: 'WYLACZNIK',
        u_n_kv: 17.5,
        i_n_a: 630,
      },
      {
        id: 'sw-cb-abb-vd4-24kv-1250a',
        name: 'ABB VD4 24 kV 1250 A',
        device_kind: 'WYLACZNIK',
        u_n_kv: 24,
        i_n_a: 1250,
      },
      // KOMPLETNOSC-POLA-TR: rozłącznik bezpiecznikowy — realne rozwiązanie pola
      // transformatorowego RMU (i JEDYNY sposób, by sprawdzić, że picker zawęża
      // listę rolą, a nie pokazuje wszystkiego wszędzie).
      {
        id: 'sw-fuse-eti-vv-17kv-63a',
        name: 'ETI VV 17,5 kV 63 A',
        device_kind: 'ROZLACZNIK_BEZPIECZNIKOWY',
        u_n_kv: 17.5,
        i_n_a: 63,
      },
      {
        id: 'sw-ds-abb-ojs-17kv-630a',
        name: 'ABB OJS 17,5 kV 630 A',
        device_kind: 'ODLACZNIK',
        u_n_kv: 17.5,
        i_n_a: 630,
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
          { field_role: 'LINIA_ODG', apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a' },
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

async function wybierzTyp() {
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
  await waitFor(() => {
    expect(screen.getByTestId('mvd-kreator-stacja-zapisz')).not.toBeDisabled();
  });
}

describe('KreatorStacjiSnNn — realna ścieżka', () => {
  beforeEach(() => {
    appState.activeCaseId = 'case-1';
    context = { segment_id: 'seg-1', position_on_segment: 0.5 };
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

  it('uczciwy stan zerowy: brak miejsca osadzenia → blokada zapisu', async () => {
    context = {};
    render(<KreatorStacjiSnNn />);
    // Uczciwy stan zerowy pokazuje krok „Rodzaj i umiejscowienie" (kreator
    // startuje od kroku „Szablon").
    await przejdzDoKroku('Rodzaj i umiejscowienie');
    expect(screen.getByTestId('mvd-kreator-stacja-brak')).toBeInTheDocument();
    // waitFor domyka efekty katalogu (producenci/rodziny/szablony) w act.
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-stacja-zapisz')).toBeDisabled());
  });

  it('blokuje zapis bez aktywnego zakresu obliczeń', async () => {
    appState.activeCaseId = null;
    render(<KreatorStacjiSnNn />);
    await waitFor(() => expect(screen.getByTestId('mvd-kreator-stacja-zapisz')).toBeDisabled());
    expect(executeDomainOperationMock).not.toHaveBeenCalled();
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

  it('bez nazwy przycisk zapisu jest nieaktywny (uczciwy stan zerowy)', async () => {
    render(<KreatorStacjiSnNn />);
    await przejdzDoKroku('Podgląd skutków');
    const przycisk = await screen.findByTestId('mvd-kreator-stacja-szablon-zapisz');
    expect(przycisk).toBeDisabled();
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
    context = { segment_id: 'seg-1', position_on_segment: 0.5 };
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

  it('rezygnacja z pola TR: usunięcie pola → jawny komunikat skutków + operacja BEZ roli TR', async () => {
    executeDomainOperationMock.mockResolvedValue({ error: null });
    render(<KreatorStacjiSnNn />);

    await przejdzDoTransformatora();
    await wybierzTyp();
    await przejdzIWybierzRozdzielnice();

    // Usunięcie pola transformatorowego natywnym klikiem.
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-pole-usun-4'));

    // Kreator NAZYWA skutek rezygnacji (marker na schemacie, ostrzeżenie gotowości,
    // zamknięta droga do dokumentacji wykonawczej) — zamiast milczeć.
    const panel = await screen.findByTestId('mvd-kreator-stacja-brak-pola-tr');
    expect(panel.textContent).toMatch(/znacznik braku pola/);
    expect(panel.textContent).toMatch(/dokumentacji wykonawczej/);

    // Zapis JEST możliwy — to legalny stan roboczy, nie błąd.
    await userEvent.click(screen.getByTestId('mvd-kreator-stacja-zapisz'));
    await waitFor(() => expect(executeDomainOperationMock).toHaveBeenCalled());
    const payload = executeDomainOperationMock.mock.calls[0]?.[2] as Record<string, unknown>;
    const role = (payload.sn_fields as Array<{ field_role: string }>).map((f) => f.field_role);
    expect(role).not.toContain('TRANSFORMATOROWE');
  });

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
        /Brak — konfiguracja niekompletna/,
      );
    });

    // Krok zmieniony na inny — stan pola TR NADAL widoczny (stała kolumna).
    await przejdzDoKroku('Blok nN');
    expect(screen.getByTestId('mvd-kreator-stacja-gotowosc').textContent).toMatch(
      /Brak — konfiguracja niekompletna/,
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
