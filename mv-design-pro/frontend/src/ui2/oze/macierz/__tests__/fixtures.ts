/*
 * Fixtures 1:1 z kontraktami `ui/ncrfg-tests/api` (karta P39 §3): katalog
 * wymogów, wynik biegu (moduł zgodny / niezgodny / werdykt „niewymagany"),
 * oraz budowniczy DER (StationDerConnection) do testów adaptera i komponentu.
 */

import type { WidokCertyfikatu } from '../../api';
import type {
  NcRfgRunResult,
  NcRfgTestCatalogResponse,
} from '../../../../ui/ncrfg-tests/api';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  type DerKindUnified,
  type StationDerConnection,
} from '../../../../ui/network-build/station-der';

export function derFixture(over: Partial<StationDerConnection> & { id: string }): StationDerConnection {
  const der_kind: DerKindUnified = over.der_kind ?? 'PV';
  return {
    id: over.id,
    project_id: over.project_id ?? 'proj-1',
    station_id: over.station_id ?? 'st-1',
    der_kind,
    name: over.name ?? over.id,
    connection_side: over.connection_side ?? 'nN',
    pcc_ref: over.pcc_ref ?? 'pcc_st-1_szyna-1',
    bay_ref: over.bay_ref ?? null,
    transformer_ref: over.transformer_ref ?? null,
    lv_busbar_ref: over.lv_busbar_ref ?? null,
    connection_node_ref: over.connection_node_ref ?? null,
    internal_cable_ref: over.internal_cable_ref ?? null,
    // Uwaga: rozróżniamy jawny `null` (brak danej) od „nie podano" (undefined → domyślna).
    voltage_level_ref: 'voltage_level_ref' in over ? over.voltage_level_ref! : 'lv_0_4kV',
    catalogs: { ...EMPTY_DER_CATALOGS, ...(over.catalogs ?? {}) },
    profiles: { ...EMPTY_DER_PROFILES, ...(over.profiles ?? {}) },
    nominal_power_kw: 'nominal_power_kw' in over ? over.nominal_power_kw! : 500,
    completeness: over.completeness ?? 'complete',
    readiness: over.readiness ?? { ...EMPTY_DER_READINESS },
    created_at: over.created_at ?? '1970-01-01T00:00:00Z',
    updated_at: over.updated_at ?? '1970-01-01T00:00:00Z',
  };
}

export function katalogFixture(): NcRfgTestCatalogResponse {
  return {
    procedure_version: 'PTPiREE Procedura testowania v3.0',
    source_ref: 'ptpiree-2024',
    operators: [
      { operator_id: 'enea', operator_name_pl: 'Enea Operator', last_revision: '2024-01' },
      { operator_id: 'pge', operator_name_pl: 'PGE Dystrybucja', last_revision: '2024-03' },
    ],
    tests: [
      {
        test_id: 'FREQ_P_F',
        ability_pl: 'Regulacja mocy czynnej od częstotliwości P(f)',
        procedure_basis_pl: 'NC RfG Art. 13, PTPiREE §4.2',
        default_for_modules: ['PV', 'BESS', 'FW'],
        conditional_pl: null,
      },
      {
        test_id: 'FRT_LVRT',
        ability_pl: 'Zdolność przetrwania zapadu napięcia (LVRT)',
        procedure_basis_pl: 'NC RfG Art. 14, PTPiREE §5.1',
        default_for_modules: ['PV', 'BESS', 'FW'],
        conditional_pl: null,
      },
      {
        test_id: 'BLACK_START',
        ability_pl: 'Zdolność rozruchu autonomicznego',
        procedure_basis_pl: 'NC RfG Art. 15, PTPiREE §6.4',
        default_for_modules: [],
        conditional_pl: 'Tylko na żądanie operatora',
      },
    ],
  };
}

export function wynikFixture(): NcRfgRunResult {
  return {
    contract: 'NcRfgPtpireeTestResultV1',
    procedure_version: 'PTPiREE Procedura testowania v3.0',
    solver_version: 'ncrfg-1.0.0',
    input_hash: 'in-abc',
    deterministic_hash: 'det-9f8e7d6c',
    modules: [
      {
        der_ref: 'pv-1',
        der_name: 'PV Dach A',
        operator_id: 'enea',
        operator_name_pl: 'Enea Operator',
        module_type: 'PV',
        module_family: 'PPM',
        p_max_kw: 500,
        voltage_kv: 0.4,
        required_count: 2,
        pass_count: 2,
        fail_count: 0,
        no_data_count: 0,
        not_required_count: 1,
        overall_status: 'zgodny',
        tests: [
          {
            test_id: 'FREQ_P_F',
            ability_pl: 'Regulacja mocy czynnej od częstotliwości P(f)',
            required: true,
            required_reason_pl: 'Wymagane dla modułu typu B.',
            verdict: 'pass',
            summary_pl: 'Droop 5% i martwa strefa 0,2 Hz spełniają wymóg.',
            metrics: { droop_percent: 5, dead_band_hz: 0.2 },
            trace_refs: ['proof://pv-1/FREQ_P_F'],
            fix_actions: [],
          },
          {
            test_id: 'FRT_LVRT',
            ability_pl: 'Zdolność przetrwania zapadu napięcia (LVRT)',
            required: true,
            required_reason_pl: 'Wymagane dla wszystkich modułów.',
            verdict: 'pass',
            summary_pl: 'Krzywa LVRT obecna i zgodna z obwiednią operatora.',
            metrics: { reactive_current_gain: 2 },
            trace_refs: ['proof://pv-1/FRT_LVRT'],
            fix_actions: [],
          },
          {
            test_id: 'BLACK_START',
            ability_pl: 'Zdolność rozruchu autonomicznego',
            required: false,
            required_reason_pl: 'Nieżądane przez operatora dla tego modułu.',
            verdict: 'not_required',
            summary_pl: 'Operator nie wymaga rozruchu autonomicznego.',
            metrics: {},
            trace_refs: [],
            fix_actions: [],
          },
        ],
      },
      {
        der_ref: 'bess-1',
        der_name: 'Magazyn energii 1',
        operator_id: 'enea',
        operator_name_pl: 'Enea Operator',
        module_type: 'BESS',
        module_family: 'PPM',
        p_max_kw: 800,
        voltage_kv: 0.4,
        required_count: 2,
        pass_count: 1,
        fail_count: 1,
        no_data_count: 0,
        not_required_count: 1,
        overall_status: 'niezgodny',
        tests: [
          {
            test_id: 'FREQ_P_F',
            ability_pl: 'Regulacja mocy czynnej od częstotliwości P(f)',
            required: true,
            required_reason_pl: 'Wymagane dla modułu typu B.',
            verdict: 'pass',
            summary_pl: 'Regulacja P(f) skonfigurowana poprawnie.',
            metrics: { droop_percent: 4 },
            trace_refs: ['proof://bess-1/FREQ_P_F'],
            fix_actions: [],
          },
          {
            test_id: 'FRT_LVRT',
            ability_pl: 'Zdolność przetrwania zapadu napięcia (LVRT)',
            required: true,
            required_reason_pl: 'Wymagane dla wszystkich modułów.',
            verdict: 'fail',
            summary_pl: 'Brak krzywej LVRT — moduł nie spełnia wymogu.',
            metrics: { has_lvrt_curve: false },
            trace_refs: ['proof://bess-1/FRT_LVRT'],
            fix_actions: ['Wybierz krzywą LVRT operatora w profilu modułu.'],
          },
          {
            test_id: 'BLACK_START',
            ability_pl: 'Zdolność rozruchu autonomicznego',
            required: false,
            required_reason_pl: 'Nieżądane przez operatora dla tego modułu.',
            verdict: 'not_required',
            summary_pl: 'Operator nie wymaga rozruchu autonomicznego.',
            metrics: {},
            trace_refs: [],
            fix_actions: [],
          },
        ],
      },
    ],
    test_catalog: katalogFixture().tests,
    white_box_trace: [
      {
        step: 1,
        test_id: 'FRT_LVRT',
        key: 'lvrt_profile_check',
        formula: 'U_sim(t) >= U_LVRT,profile(t)',
        data: { u_sim_min_pu: 0.05, u_profile_min_pu: 0.15 },
        substitution: '0,05 >= 0,15',
        result: { spelnione: false },
        unit_check: 'p.u. vs p.u. — zgodne',
        proof_ref: 'proof://bess-1/FRT_LVRT',
      },
    ],
    report_pl: 'Raport zgodności NC RfG.',
  };
}

/**
 * Widok certyfikatu zgodności — 1:1 z `build_certyfikat_view`
 * (backend/src/application/analyses/certyfikat_zgodnosci.py). Projekt niezgodny
 * (jeden moduł niespełniony), 2 moduły, 4 testy razem.
 */
export function certyfikatFixture(): WidokCertyfikatu {
  return {
    kontrakt: 'CertyfikatZgodnosciNcRfgV1',
    tytul: 'Certyfikat zgodności projektu z wymaganiami NC RfG',
    identyfikacja: {
      projekt: 'Sieć testowa',
      przypadek: 'Wariant bazowy',
      procedura: 'PTPiREE Procedura testowania v3.0',
      wersja_narzedzia: 'ncrfg-1.0.0',
    },
    werdykt_zbiorczy: {
      status: 'niezgodny',
      etykieta_pl: 'Projekt niezgodny z wymaganiami NC RfG',
      liczba_modulow: 2,
      modulow_zgodnych: 1,
      modulow_niezgodnych: 1,
    },
    moduly: [
      {
        der_ref: 'pv-1',
        der_name: 'PV Dach A',
        operator_pl: 'Enea Operator',
        klasa: 'PV',
        rodzina: 'PPM',
        p_max_kw: 500,
        voltage_kv: 0.4,
        status: 'zgodny',
        status_pl: 'Zgodny',
        podsumowanie: { wymagane: 2, spelnia: 2, nie_spelnia: 0 },
        testy: [
          {
            test_id: 'FREQ_P_F',
            nazwa_pl: 'Regulacja mocy czynnej od częstotliwości P(f)',
            wymagany: true,
            werdykt: 'pass',
            werdykt_pl: 'spełnia',
            wartosci_pl: 'Droop 5% i martwa strefa 0,2 Hz spełniają wymóg.',
          },
          {
            test_id: 'FRT_LVRT',
            nazwa_pl: 'Zdolność przetrwania zapadu napięcia (LVRT)',
            wymagany: true,
            werdykt: 'pass',
            werdykt_pl: 'spełnia',
            wartosci_pl: 'Krzywa LVRT obecna i zgodna z obwiednią operatora.',
          },
        ],
      },
      {
        der_ref: 'bess-1',
        der_name: 'Magazyn energii 1',
        operator_pl: 'Enea Operator',
        klasa: 'BESS',
        rodzina: 'PPM',
        p_max_kw: 800,
        voltage_kv: 0.4,
        status: 'niezgodny',
        status_pl: 'Niezgodny',
        podsumowanie: { wymagane: 2, spelnia: 1, nie_spelnia: 1 },
        testy: [
          {
            test_id: 'FREQ_P_F',
            nazwa_pl: 'Regulacja mocy czynnej od częstotliwości P(f)',
            wymagany: true,
            werdykt: 'pass',
            werdykt_pl: 'spełnia',
            wartosci_pl: 'Regulacja P(f) skonfigurowana poprawnie.',
          },
          {
            test_id: 'FRT_LVRT',
            nazwa_pl: 'Zdolność przetrwania zapadu napięcia (LVRT)',
            wymagany: true,
            werdykt: 'fail',
            werdykt_pl: 'nie spełnia',
            wartosci_pl: 'Brak krzywej LVRT — moduł nie spełnia wymogu.',
          },
        ],
      },
    ],
    zalozenia_i_zrodla: [
      'Certyfikat zestawia gotowe werdykty z macierzy zgodności NC RfG — nie przelicza testów.',
      'Procedura testowania: PTPiREE Procedura testowania v3.0.',
    ],
    odcisk_wejscia_sha256: 'in-abc',
    odcisk_wyniku_sha256: 'det-9f8e7d6c',
  };
}
