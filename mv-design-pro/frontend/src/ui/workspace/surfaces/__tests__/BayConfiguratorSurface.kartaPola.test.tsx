/**
 * Karta pola SN na powierzchni E-11 — jeden model pola, katalog producenta, zaciski.
 *
 * Ścieżka realna: prawdziwe `useFieldReadModel` (trasa `field-view`), prawdziwe
 * `useKatalogPola` (trasy katalogu przez `ui/catalog/api.ts`), prawdziwe magazyny. Podstawiony
 * jest wyłącznie `fetch` (odpowiedzi backendu w kształcie kontraktu).
 *
 * Iloczyn cech: {referencja: brak / pole w modelu / pole spoza modelu} × {aparaty: tylko
 * w modelu pola (złożone z łączników gałęzi), puste `Bay.primary_devices` w migawce} ×
 * {katalog: brak powiązania / szablon+rodzina znalezione / szablon spoza katalogu / rodzina
 * spoza katalogu / rodzina `requires_catalog` / rodzina `user_defined` / niezgodność rodzin /
 * błąd HTTP katalogu} × {zaciski: brak / wolny + przyłączony} × {edycja nazwy natywnym klikiem}.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../app-state';
import { wyczyscPamiecKataloguPola } from '../../../field/useKatalogPola';
import type { FieldReadModelItem, FieldReadModelResponse } from '../../../field/useFieldReadModel';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { EnergyNetworkModel, Port } from '../../../../types/enm';
import type { WorkspaceSurfaceDescriptor } from '../../types';
import { BayConfiguratorSurface } from '../BayConfiguratorSurface';

let licznikPrzypadku = 0;

function surface(entityRef: string | null): WorkspaceSurfaceDescriptor {
  return {
    surfaceId: 'karta-pola',
    screenCode: 'E-11',
    surfaceKind: 'edycyjny',
    titlePl: 'Pole SN',
    entityRef,
    entityType: 'sn_bay',
    parentSurfaceId: null,
    tabId: null,
    routeState: { route: 'unknown', payload: {} },
    breadcrumbs: [],
    supportsMiniSld: true,
    sizeClass: 'C',
    stackLevel: 0,
    openMode: 'expand_workspace',
    subjectKind: 'entity',
    subjectRef: entityRef,
  };
}

function snapshot(ports: Port[] | null, napiecieSzynyKv: number | null = null): EnergyNetworkModel {
  return {
    header: { revision: 3 },
    buses: napiecieSzynyKv === null
      ? []
      : [{ id: 'bus-1', ref_id: 'bus-1', name: 'Szyna', voltage_kv: napiecieSzynyKv, phase_system: '3ph' }],
    branches: [], transformers: [], sources: [], loads: [], generators: [],
    substations: [{ id: 'st-1', ref_id: 'st-1', name: 'Stacja 1', bus_refs: ['bus-1'] }],
    bays: [{
      id: 'bay-1', ref_id: 'bay_ref_1', name: 'Pole liniowe 1', bay_role: 'OUT',
      substation_ref: 'st-1', bus_ref: 'bus-1', equipment_refs: [],
      // Migawka NIE niesie aparatów — model pola składa je z łączników gałęzi po stronie
      // backendu. Karta czytająca migawkę zamiast modelu pola pokazałaby „brak aparatów".
      primary_devices: [],
      ports,
    }],
  } as unknown as EnergyNetworkModel;
}

function item(templateRef: string | null, familyRef: string | null): FieldReadModelItem {
  return {
    bay_id: 'bay-1',
    bay_ref: 'bay_ref_1',
    bay_name: 'Pole liniowe 1',
    canonical_model: {
      schema_version: 'v10.bay.1',
      created_from: 'szablon',
      integrity_status: 'kompletny',
      base_model: {
        bay_ref: 'bay_ref_1',
        bay_role: 'LINIA_OUT',
        specialization: 'BRAK',
        substation_ref: 'st-1',
        primary_devices: [
          {
            device_ref: 'cb-1', catalog_ref: 'cat:cb', symbol_ref: 'symbol:cb', kind: 'CB',
            placement: 'MIDSTREAM', is_controllable: true, switch_state: null,
          },
          {
            device_ref: 'ds-1', catalog_ref: 'cat:ds', symbol_ref: 'symbol:ds', kind: 'DS',
            placement: 'UPSTREAM', is_controllable: true, switch_state: null,
          },
        ],
        measurement_chain: null,
        secondary_units: [],
        secondary_architecture: { type: 'brak', measurement_provider: 'brak' },
        protection_config: null,
        control_surface: {
          controllable_device_refs: [], open_requires_confirmation: true,
          close_requires_confirmation: true, kas_available: false,
          local_remote_transfer_supported: false,
        },
        interlocks: { entries: [] },
        source_endpoint: null,
        bay_template_ref: templateRef,
        switchgear_family_ref: familyRef,
        szablon_standardu_ref: 'ENEA_SN_LINIA',
        szablon_standardu_nazwa_pl: 'Pole liniowe SN (ENEA)',
        sklad: [
          {
            gniazdo_ref: 'W',
            gniazdo_nazwa_pl: 'wyłącznik pola',
            rodzaj: 'CB',
            rodzaj_pl: 'wyłącznik',
            device_ref: 'bay-1::gn::W',
            linked_ref: null,
            catalog_ref: null,
            catalog_namespace: null,
            status: 'WYMAGANE_STANDARDEM_BRAK',
            opis_pl: 'Gniazdo „wyłącznik pola” (Pole liniowe SN) jest wymagane standardem, a pole nie ma w nim aparatu — wskaż typ z katalogu.',
            podstawa_pl: 'ENEA Zeszyt 1, zał. Z.2',
            interpretacja_pl: null,
            wymagania: [],
          },
        ],
      },
      runtime_state: null,
      scenario_state: null,
      project_results_ref: null,
    },
    project_results: null,
  } as unknown as FieldReadModelItem;
}

const SZABLON = {
  template_ref: 'ZPUE__ROTOBLOK__L',
  base_template: { template_ref: 'kanon', devices: [], ports: [] },
  manufacturer_ref: 'ZPUE',
  switchgear_family_ref: 'ZPUE__ROTOBLOK',
  bay_kind: 'liniowe_odplywowe',
  bay_role: 'OUT',
  source_status: 'repo_verified',
  source_refs: ['karta-ZPUE-2025', 'strona-produktu'],
  version: '1.2',
  hash: 'h',
  notes_pl: null,
  template_name_pl: 'Pole liniowe Rotoblok',
  template_code: 'L',
};

function rodzina(status: string, ref = 'ZPUE__ROTOBLOK'): Record<string, unknown> {
  return {
    switchgear_family_ref: ref,
    manufacturer_ref: 'ZPUE',
    family_name: 'Rotoblok',
    series_name: null,
    network_voltages_kv: [15, 20],
    um_classes_kv: [17.5, 24],
    insulation_type: 'air',
    construction_type: 'jednoczlonowa',
    busbar_system: 'single',
    tor_konfiguracji: 'MODULARNY',
    status,
    source_refs: ['karta-ZPUE-2025'],
    notes_pl: null,
  };
}

const PRODUCENCI = [{
  manufacturer_ref: 'ZPUE', name: 'ZPUE S.A.', normalized_code: 'ZPUE', country: 'PL',
  status: 'verified', source_refs: ['krs'], notes_pl: null,
}];

interface Odpowiedzi {
  readonly pole: FieldReadModelItem;
  readonly szablony?: unknown[];
  readonly rodziny?: unknown[];
  readonly katalogHttp?: number;
}

function podstawFetch(odp: Odpowiedzi) {
  const widok: FieldReadModelResponse = {
    case_id: 'x',
    enm_revision: 3,
    view_status: { data_source: 'ENM_FIELD_READ_MODEL', result_state: 'NONE', has_field_data: true },
    summary: {
      total_fields: 1, migrated_count: 0, requires_completion_count: 0, source_fields_count: 0,
      coupler_fields_count: 0, fields_with_results_count: 0,
    },
    fields: [odp.pole],
  };
  const json = (body: unknown, status = 200) => Promise.resolve({
    ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Service Unavailable',
    json: async () => body,
  });
  const stub = vi.fn((url: string | URL) => {
    const u = url.toString();
    if (u.includes('/enm/field-view')) return json(widok);
    if (u.startsWith('/api/catalog/') && odp.katalogHttp) {
      return json({ detail: 'Katalog producentów chwilowo niedostępny.' }, odp.katalogHttp);
    }
    if (u.startsWith('/api/catalog/complete-bay-templates')) return json(odp.szablony ?? [SZABLON]);
    if (u.startsWith('/api/catalog/switchgear-families')) return json(odp.rodziny ?? [rodzina('repo_verified')]);
    if (u.startsWith('/api/catalog/manufacturers')) return json(PRODUCENCI);
    // Karta W5-C: katalog aparatów pola SN — odpytywany dopiero po „Zmień wyposażenie".
    if (
      u.startsWith('/api/catalog/mv-apparatus-types') || u.startsWith('/api/catalog/ct-types')
      || u.startsWith('/api/catalog/vt-types') || u.startsWith('/api/catalog/surge-arrester-types')
      || u.startsWith('/api/catalog/field-element-types') || u.startsWith('/api/catalog/bay-standard-templates')
    ) {
      return json([]);
    }
    return json({}, 404);
  });
  vi.stubGlobal('fetch', stub);
  return stub;
}

function ustawModel(ports: Port[] | null = null, napiecieSzynyKv: number | null = null): void {
  licznikPrzypadku += 1;
  // Unikalny przypadek na test: pamięć `field-view` jest kluczowana przypadkiem i rewizją.
  useAppStateStore.setState({ activeCaseId: `case-karta-${licznikPrzypadku}` });
  useSnapshotStore.setState({ snapshot: snapshot(ports, napiecieSzynyKv) });
}

function wartosc(klucz: string): string {
  return screen.getByTestId(`engineering-field-${klucz}`).textContent ?? '';
}

describe('Karta pola SN (E-11) — jeden model pola', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
    wyczyscPamiecKataloguPola();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pole spoza modelu: jawny komunikat, bez sekcji i bez zapytań o katalog', async () => {
    const stub = podstawFetch({ pole: item(null, null) });
    ustawModel();
    render(<BayConfiguratorSurface surface={surface('NIE-ISTNIEJE')} />);
    expect(await screen.findByTestId('bay-card-missing')).toHaveTextContent('nie występuje w modelu');
    expect(screen.queryByTestId('bay-card-sections')).not.toBeInTheDocument();
    expect(stub.mock.calls.some(([u]) => String(u).startsWith('/api/catalog/'))).toBe(false);
  });

  it('aparaty z modelu pola, nie z migawki (migawka ma puste primary_devices)', async () => {
    podstawFetch({ pole: item(null, null) });
    ustawModel();
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() => expect(screen.getByTestId('engineering-field-device_0')).toBeInTheDocument());
    expect(wartosc('device_0')).toContain('Wyłącznik');
    expect(wartosc('device_1')).toContain('Odłącznik');
    // Rola z kanonu ról pól — nagłówek i schemat pola, nigdy kod roli.
    expect(screen.queryByText('LINIA_OUT')).not.toBeInTheDocument();
    expect(screen.getByTestId('bay-svg-renderer')).toBeInTheDocument();
  });

  it('brak powiązania z katalogiem: zdanie, bez zapytań o katalog', async () => {
    const stub = podstawFetch({ pole: item(null, null) });
    ustawModel();
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() => expect(screen.getByTestId('engineering-field-catalog_binding')).toBeInTheDocument());
    expect(wartosc('catalog_binding')).toContain('bez szablonu producenta');
    expect(stub.mock.calls.some(([u]) => String(u).startsWith('/api/catalog/'))).toBe(false);
  });

  it('szablon i rodzina z katalogu: nazwy, status źródła, liczby z rekordu katalogu', async () => {
    podstawFetch({ pole: item('ZPUE__ROTOBLOK__L', 'ZPUE__ROTOBLOK') });
    ustawModel();
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() => expect(screen.getByTestId('engineering-field-template_name')).toBeInTheDocument());
    expect(wartosc('template_name')).toContain('Pole liniowe Rotoblok · L');
    expect(wartosc('template_kind')).toContain('Pole liniowe wyjściowe');
    expect(wartosc('template_source_status')).toContain('Zweryfikowany w repozytorium');
    expect(wartosc('template_source_refs')).toContain('2');
    expect(wartosc('family_name')).toContain('Rotoblok');
    expect(wartosc('manufacturer')).toContain('ZPUE S.A.');
    expect(wartosc('construction')).toContain('Jednoczłonowa');
    expect(wartosc('network_voltages')).toContain('15, 20');
    expect(wartosc('network_voltages')).toContain('kV');
    expect(wartosc('um_classes')).toContain('17,5, 24');
    expect(wartosc('family_buildable')).toContain('Tak');
    expect(screen.queryByTestId('engineering-field-family_mismatch')).not.toBeInTheDocument();
  });

  it('szablon spoza katalogu i rodzina spoza katalogu: dwa jawne stany', async () => {
    podstawFetch({ pole: item('NIEZNANY', 'NIEZNANA'), szablony: [], rodziny: [] });
    ustawModel();
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() => expect(screen.getByTestId('engineering-field-template_missing')).toBeInTheDocument());
    expect(wartosc('template_missing')).toContain('nie występuje w katalogu');
    expect(wartosc('family_missing')).toContain('nie występuje w katalogu');
  });

  it.each([
    ['requires_catalog', 'Wymaga karty katalogowej producenta'],
    ['deprecated', 'wycofana z oferty'],
    // Backend (`POTWIERDZONE_STATUSY_RODZINY`) nie dopuszcza `user_defined` — karta nie może
    // twierdzić inaczej (wcześniej trzy kopie predykatu we froncie dopuszczały ten status).
    ['user_defined', 'nie dopuszcza budowania'],
  ])('rodzina o statusie %s: „Nie" z powodem', async (status, powod) => {
    podstawFetch({ pole: item(null, 'ZPUE__ROTOBLOK'), rodziny: [rodzina(status)] });
    ustawModel();
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() => expect(screen.getByTestId('engineering-field-family_buildable')).toBeInTheDocument());
    expect(wartosc('family_buildable')).toContain('Nie');
    expect(wartosc('family_buildable')).toContain(powod);
  });

  it('rodzina pola różna od rodziny szablonu: jawna niezgodność', async () => {
    podstawFetch({
      pole: item('ZPUE__ROTOBLOK__L', 'INNA_RODZINA'),
      rodziny: [rodzina('repo_verified'), rodzina('repo_verified', 'INNA_RODZINA')],
    });
    ustawModel();
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() => expect(screen.getByTestId('engineering-field-family_mismatch')).toBeInTheDocument());
    expect(wartosc('family_mismatch')).toContain('różni się');
  });

  it('błąd HTTP katalogu: zdanie backendu w karcie, nie pusta sekcja', async () => {
    podstawFetch({ pole: item('ZPUE__ROTOBLOK__L', null), katalogHttp: 503 });
    ustawModel();
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() => expect(screen.getByTestId('engineering-field-catalog_state')).toHaveTextContent('chwilowo niedostępny'));
  });

  it('zaciski: brak jawnych zacisków to stan, nie pustka', async () => {
    podstawFetch({ pole: item(null, null) });
    ustawModel(null);
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() => expect(screen.getByTestId('engineering-field-no_ports')).toBeInTheDocument());
    expect(wartosc('no_ports')).toContain('nie zawiera jawnych zacisków');
  });

  it('zaciski: rodzaj z kanonu portów, napięcie z modelu, stan przyłączenia', async () => {
    podstawFetch({ pole: item(null, null) });
    ustawModel([
      { id: 'p-1', kind: 'sn_output', nominal_voltage_kv: 15, substation_ref: 'st-1', occupied_by: 'kab-1' },
      { id: 'p-2', kind: 'sn_reserve', nominal_voltage_kv: 15, substation_ref: 'st-1', occupied_by: null },
    ]);
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() => expect(screen.getByTestId('engineering-field-port_0')).toBeInTheDocument());
    expect(wartosc('port_0')).toContain('Wyjście SN · 15 kV');
    expect(wartosc('port_0')).toContain('Przyłączony');
    expect(wartosc('port_1')).toContain('Wolny');
  });

  it('zmiana nazwy pola natywnym klikiem wysyła operację domenową modelu', async () => {
    podstawFetch({ pole: item(null, null) });
    ustawModel();
    const operacja = vi.fn().mockResolvedValue(null);
    useSnapshotStore.setState({ executeDomainOperation: operacja });
    const user = userEvent.setup();
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    const pole = await screen.findByTestId('engineering-field-name');
    await user.click(within(pole).getByRole('button'));
    const wejscie = within(pole).getByRole('textbox');
    await user.clear(wejscie);
    await user.type(wejscie, 'Pole L-7{Enter}');
    await act(async () => undefined);
    expect(operacja).toHaveBeenCalledWith(
      useAppStateStore.getState().activeCaseId,
      'update_element_parameters',
      { element_ref: 'bay-1', parameters: { name: 'Pole L-7' } },
    );
  });
  // Karty W5-C i GPZ-H5-APARATURA: wyposażenie pola — skład pola z modelu odczytu pola,
  // zapis natywnym klikiem przez operację `set_bay_equipment` magazynu. Iloczyn:
  // napięcie szyny pola {SN 15 kV, brak napięcia w migawce, nN 0,4 kV} → edytor
  // {jest, jest, brak} (pole nN ma własne operacje nN, nie wyposażenie pola SN).
  it.each([
    [15, true],
    [null, true],
    [0.4, false],
  ])('szyna pola %s kV: edytor wyposażenia SN obecny = %s', async (napiecie, obecny) => {
    podstawFetch({ pole: item(null, null) });
    ustawModel(null, napiecie);
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await screen.findByTestId('bay-card-sections');
    expect(screen.queryByTestId('wyposazenie-pola') !== null).toBe(obecny);
  });

  it('wyposażenie pola: skład z modelu pola i zapis operacją magazynu', async () => {
    const stub = podstawFetch({ pole: item(null, null) });
    ustawModel(null, 15);
    const operacja = vi.fn().mockResolvedValue({
      snapshot: {},
      wyposazenie_pola: { bay_ref: 'bay_ref_1', szablon_standardu_ref: null, sklad: [] },
    });
    useSnapshotStore.setState({ executeDomainOperation: operacja });
    const user = userEvent.setup();
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() =>
      expect(screen.getByTestId('wyposazenie-pola-sklad-wiersz-0').getAttribute('data-status')).toBe(
        'WYMAGANE_STANDARDEM_BRAK',
      ),
    );
    expect(screen.getByTestId('wyposazenie-pola-sklad-wiersz-0')).toHaveTextContent('zał. Z.2');
    expect(screen.getByTestId('wyposazenie-pola-standard')).toHaveTextContent('Pole liniowe SN (ENEA)');
    expect(stub.mock.calls.some(([u]) => String(u).startsWith('/api/catalog/mv-apparatus-types'))).toBe(false);
    await user.click(screen.getByTestId('wyposazenie-pola-edytuj'));
    await waitFor(() =>
      expect(stub.mock.calls.some(([u]) => String(u).startsWith('/api/catalog/mv-apparatus-types'))).toBe(true),
    );
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-tryb'), 'wyczysc');
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    expect(operacja).toHaveBeenCalledWith(
      useAppStateStore.getState().activeCaseId,
      'set_bay_equipment',
      { bay_ref: 'bay_ref_1', mode: 'wyczysc' },
    );
    expect(await screen.findByTestId('wyposazenie-pola-wynik')).toBeInTheDocument();
    expect(screen.getByTestId('wyposazenie-pola-sklad-pusty')).toBeInTheDocument();
  });

  /**
   * Karta GPZ-H5-APARATURA: pole na szynie 110 kV (granica zasilania sieci SN) nie ma edytora
   * wyposażenia — lustro odmowy `bay_equipment.bay_hv_boundary`. Iloczyn napięcia szyny
   * {nN 0,4 kV, SN 15 kV, SN 66 kV, WN 110 kV, WN 220 kV, brak szyny}: jawne zdanie granicy tylko
   * dla WN, edytor tylko dla SN, pole nN bez obu (ma własne operacje rozdzielnicy nN).
   */
  it.each([
    [0.4, false, false],
    [15, false, true],
    [66, false, true],
    [110, true, false],
    [220, true, false],
    [null, false, true],
  ])('szyna %s kV: zdanie granicy 110 kV %s, edytor wyposażenia %s', async (kv, granica, edytor) => {
    podstawFetch({ pole: item(null, null) });
    ustawModel(null, kv);
    render(<BayConfiguratorSurface surface={surface('bay-1')} />);
    await waitFor(() => expect(screen.getByTestId('engineering-field-device_0')).toBeInTheDocument());
    if (edytor) {
      await waitFor(() => expect(screen.getByTestId('wyposazenie-pola-edytuj')).toBeInTheDocument());
    } else {
      expect(screen.queryByTestId('wyposazenie-pola-edytuj')).not.toBeInTheDocument();
    }
    const zdanie = screen.queryByTestId('bay-card-granica-wn');
    if (granica) {
      expect(zdanie).toHaveTextContent('Pole 110 kV jest granicą zasilania sieci SN');
      expect(zdanie).toHaveTextContent('Scenariusze łączeniowe');
    } else {
      expect(zdanie).not.toBeInTheDocument();
    }
  });
});
