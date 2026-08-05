/*
 * Fixtury okna „Wniosek OSD" (karta W-707 / E13). Kształty 1:1 z kontraktem
 * backendu (`application/analyses/wniosek_osd.py::build_wniosek_osd_view`
 * i `ui/ncrfg-tests/api`). Buduje: zakończone przebiegi (rozpływ/zwarcie),
 * minimalne wejście modułu NC RfG, wynik biegu NC RfG oraz pełny widok wniosku.
 */

import type {
  NcRfgModuleInput,
  NcRfgRunResult,
} from '../../../../ui/ncrfg-tests/api';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import type { WidokWniosku } from '../../api';

/** Zakończony przebieg wykonawczy o zadanym rodzaju/statusie. */
export function przebiegFixture(
  id: string,
  analysisType: ExecutionRun['analysis_type'],
  status: ExecutionRun['status'] = 'DONE',
): ExecutionRun {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type: analysisType,
    solver_input_hash: 'hash',
    status,
    started_at: null,
    finished_at: null,
    error_message: null,
  };
}

/** Minimalne, kompletne wejście modułu NC RfG (PV, klasa domyślna). */
export function wejscieModuluFixture(over: Partial<NcRfgModuleInput> = {}): NcRfgModuleInput {
  return {
    der_ref: 'pv-1',
    der_name: 'PV Dach A',
    der_kind: 'PV',
    module_family: 'PPM',
    operator_id: 'enea',
    p_max_kw: 500,
    voltage_kv: 15,
    certificate_status: 'none',
    has_lvrt_curve: true,
    has_hvrt_curve: true,
    has_pf_droop: true,
    has_qu_curve: true,
    has_dynamic_model: true,
    has_scada_communication: true,
    has_disturbance_recorder: true,
    active_power_control_enabled: true,
    stop_generation_enabled: true,
    reduction_generation_enabled: true,
    island_operation_required: false,
    island_operation_capable: false,
    black_start_required: false,
    black_start_capable: false,
    power_oscillation_damping_required: false,
    power_oscillation_damping_enabled: false,
    ...over,
  };
}

/** Wynik biegu NC RfG (tylko pola czytane przez okno — reszta uzupełniona). */
export function wynikNcRfgFixture(): NcRfgRunResult {
  return {
    contract: 'NcRfgPtpireeTestResultV1',
    procedure_version: 'PTPiREE 2024',
    solver_version: '1.0',
    input_hash: 'ncrfg-input-hash',
    deterministic_hash: 'ncrfg-det-hash',
    modules: [],
    certificate_evidence: [],
    test_catalog: [],
    white_box_trace: [],
    report_pl: '',
  };
}

/** Pełny widok wniosku OSD (werdykt zgodny) — 1:1 z kontraktem widoku. */
export function widokWnioskuFixture(over: Partial<WidokWniosku> = {}): WidokWniosku {
  return {
    kontrakt: 'WniosekOkresleniaWarunkowPrzylaczeniaV1',
    tytul: 'Wniosek o określenie warunków przyłączenia do sieci OSD',
    identyfikacja: {
      projekt: 'Farma PV Wschód',
      przypadek: 'Wariant bazowy',
      wnioskodawca: 'Zielona Energia sp. z o.o.',
      adres_przylaczenia: 'ul. Słoneczna 1, Wschód',
      wezel_przylaczenia: 'bus-1',
    },
    bilans_mocy: {
      moc_zainstalowana_zrodel_mva: 1.3,
      moc_zainstalowana_w_punkcie_mva: 0.5,
      liczba_wezlow_ze_zrodlami: 2,
      obciazenie_najwyzsze_pct: 62.5,
      obciazenie_element: 'Transformator T1',
      wspolczynnik_mocy_slack: 0.98,
      bilans_q_status: 'PASS',
      straty_pct: 1.8,
      straty_status: 'PASS',
      podsumowanie_walidacji: {
        spelnione: 5,
        ostrzezenia: 1,
        niespelnione: 0,
        nieobliczone: 2,
      },
    },
    zwarcia_punkt_przylaczenia: {
      bus_ref: 'bus-1',
      nazwa_wezla: 'Szyna GPZ',
      ik_ss_ka: 12.5,
      sk_mva: 325.0,
      ip_ka: 31.2,
      ith_ka: 12.9,
      rodzaj_zwarcia: '3F',
    },
    zgodnosc_nc_rfg: {
      status: 'zgodny',
      etykieta_pl: 'Zgodny z wymaganiami NC RfG',
      liczba_modulow: 1,
      modulow_zgodnych: 1,
      modulow_niezgodnych: 0,
      procedura: 'PTPiREE 2024',
      odeslanie_pl:
        'Szczegółowe werdykty testów zdolności podano w certyfikacie zgodności NC RfG.',
      odcisk_wejscia_nc_rfg_sha256: 'ncrfg-input-hash',
    },
    zalozenia_pl: [
      'Wniosek zestawia gotowe wyniki obliczeń — nie przelicza żadnej wielkości.',
      'Bilans mocy pochodzi z przebiegu rozpływu mocy (run_id: run-lf-1).',
      'Schemat elektryczny dołączany jest do wniosku odrębnie.',
      'Zestawienia materiałowe nie są jeszcze generowane przez narzędzie.',
    ],
    odciski_sekcji_sha256: {
      bilans_mocy: 'odcisk-bilans',
      zwarcia_punkt_przylaczenia: 'odcisk-zwarcia',
      zgodnosc_nc_rfg: 'odcisk-zgodnosc',
    },
    zrodla: {
      pf_run_id: 'run-lf-1',
      sc_run_id: 'run-sc-1',
      nc_rfg_input_hash: 'ncrfg-input-hash',
    },
    input_hash: 'wniosek-input-hash',
    ...over,
  };
}
