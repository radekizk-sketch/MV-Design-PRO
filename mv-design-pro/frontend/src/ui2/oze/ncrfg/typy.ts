/*
 * Kontrakt V2 zgodności NC RfG / PTPiREE — lustro 1:1 modeli backendu (karta AB-1a Pakiet D2).
 *
 * JEDYNE typy frontendu dla końcówek NC RfG i dokumentów zgodności. Źródła (`backend/src`):
 *   - `network_model/solvers/ncrfg_ptpiree/contracts.py` — wejście biegu, wynik testu, wynik
 *     modułu, wynik biegu (`NcRfgPtpireeTestResultV2`), dowód certyfikatu urządzenia;
 *   - `catalog/profiles/nc_rfg/loader.py` — `DokumentWarstwy`, `KlasyfikacjaModulu`, profil
 *     operatora (kształt `GET /api/ncrfg-tests/catalog`);
 *   - `enm/nastawy_modulu.py` — nastawy zabezpieczeń modułu;
 *   - `application/ncrfg_compliance/{bieg,ocena_wymagan,model_bridge}.py` — koperta biegu,
 *     ocena wymagań modułu, zgodność przypadku;
 *   - `application/analyses/{certyfikat_zgodnosci,sekcja_zgodnosci_ncrfg,wniosek_osd}.py` +
 *     `api/oze_analysis_runs.py` — certyfikat zgodności i wniosek do OSD (widoki i braki 422).
 *
 * Pola w `snake_case`, bez przemianowań; daty (`date`) jako łańcuch ISO. Rekordy werdyktu
 * (`OcenaKryterium`, `WynikWymagania`, `PodstawaWymagania`, `ClaimKind`) importowane z
 * `ui2/wyniki/wzorzec/werdykt.ts` — nie dublowane. Kontrakt V2 NIE MA agregatu modułu, statusu
 * certyfikatu z żądania ani werdyktu zbiorczego dokumentu — tych pól tu nie ma i nie wolno ich
 * dopisywać po stronie klienta.
 */

import type { NastawyZabezpieczenModulu } from '../../../types/enm';
import type {
  ClaimKind,
  OcenaKryterium,
  PodstawaWymagania,
  StanZrodla,
  WynikWymagania,
} from '../../wyniki/wzorzec/werdykt';

// =============================================================================
// Słowniki (Literal backendu)
// =============================================================================

/** `contracts.PtpireeDerKind`. */
export type RodzajDer = 'PV' | 'BESS' | 'FW' | 'OTHER';
/** `contracts.PtpireeModuleFamily` — moduł parku energii albo synchroniczny (bez modułu morskiego). */
export type RodzinaModulu = 'PPM' | 'SyPGM';
/** `loader.TypModulu`. */
export type TypModulu = 'A' | 'B' | 'C' | 'D';
/** `loader.TypModuluZProgiem`. */
export type TypModuluZProgiem = 'B' | 'C' | 'D';
/** `loader.Technologia`. */
export type Technologia = 'PPM' | 'SPGM' | 'MAGAZYN';
/** `contracts.ZrodloDanych`. */
export type ZrodloDanych = 'ZATWIERDZONY_MODEL' | 'ZADANIE_KLIENTA';
/** `model_bridge.PowodPominieciaDer`. */
export type PowodPominieciaDer = 'brak_mocy' | 'brak_napiecia';
/**
 * `contracts.PtpireeVerdict` — enum WEWNĘTRZNY testu (filtry/sortowanie backendu), wyprowadzany
 * z `ocena.status_maszynowy`. Interfejs go nie pokazuje: etykieta i semantyka są w `ocena`.
 */
export type WerdyktWewnetrznyTestu = 'pass' | 'fail' | 'no_data' | 'not_required';

// =============================================================================
// Profil regulacyjny (`catalog/profiles/nc_rfg/loader.py`)
// =============================================================================

/** `DokumentWarstwy` — wersja procedury / warstwy profilu (obiekt, NIE łańcuch). */
export interface DokumentWarstwy {
  readonly tytul: string;
  readonly wydanie: string | null;
  readonly status: StanZrodla;
  readonly adres: string | null;
  readonly obowiazuje_od: string | null;
  readonly uwagi_pl: string | null;
}

/**
 * `KlasyfikacjaModulu` — wynik klasyfikacji art. 5 z progami, podstawą i powodem
 * (`GET /api/ncrfg-tests/modul` oraz `modules[i].klasyfikacja`). `modul === null` — moduł
 * poniżej progu istotności (wymagania NC RfG nie mają zastosowania; `powod_pl` to nazywa).
 */
export interface KlasyfikacjaModulu {
  readonly modul: TypModulu | null;
  readonly prog_min_kw: number;
  readonly progi_kw: Readonly<Record<TypModuluZProgiem, number>>;
  readonly napiecie_d_kv: number;
  readonly podstawa: PodstawaWymagania;
  readonly powod_pl: string;
}

/** `NcRfgModuleType` — klasa modułu z progami operatora (dane katalogowe do pokazania). */
export interface KlasaModuluProfilu {
  readonly id: TypModulu;
  readonly threshold_kw_min: number;
  readonly threshold_kw_max: number | null;
  readonly napiecie_ponizej_kv: number | null;
  readonly description_pl: string;
}

/** `NcRfgFrequencyResponse`. */
export interface OdpowiedzCzestotliwosciowaProfilu {
  readonly steady_state_hz_min: number;
  readonly steady_state_hz_max: number;
  readonly transient_hz_min: number;
  readonly transient_hz_max: number;
  readonly pf_droop_percent: number;
  readonly dead_band_hz: number;
  readonly ramp_rate_pct_per_min: number;
  readonly zrodlo: PodstawaWymagania;
}

/** `NcRfgReactivePower`. */
export interface MocBiernaProfilu {
  readonly q_range_pct_pn_min: number;
  readonly q_range_pct_pn_max: number;
  readonly cos_phi_min: number;
  readonly voltage_control_modes: readonly string[];
  readonly zrodlo: PodstawaWymagania;
}

/** `NcRfgRideThroughPoint`. */
export interface PunktObwiedniFrtProfilu {
  readonly time_s: number;
  readonly voltage_pu: number;
}

/** `NcRfgVoltageLevels` (klucz `ride_through` katalogu). */
export interface ObwiednieFrtProfilu {
  readonly lvrt: readonly PunktObwiedniFrtProfilu[];
  readonly hvrt: readonly PunktObwiedniFrtProfilu[];
  readonly lvrt_typy: readonly TypModulu[];
  readonly hvrt_typy: readonly TypModulu[];
  readonly lvrt_zrodlo: PodstawaWymagania;
  readonly hvrt_zrodlo: PodstawaWymagania;
}

/** `NcRfgPRecovery`. */
export interface OdbudowaMocyProfilu {
  readonly required_for_modules: readonly TypModulu[];
  readonly p_recovery_time_s: number;
  readonly p_recovery_rate_pct_per_s: number;
  readonly zrodlo: PodstawaWymagania;
}

/** Wpis `operators[i]` katalogu (`api/ncrfg_ptpiree_tests.py::get_ncrfg_test_catalog`). */
export interface ProfilOperatoraNcRfg {
  readonly operator_id: string;
  readonly operator_name_pl: string;
  readonly last_revision: string;
  readonly wersja_profilu: string;
  readonly module_types: readonly KlasaModuluProfilu[];
  readonly klasyfikacja_zrodlo: PodstawaWymagania;
  readonly frequency_response: OdpowiedzCzestotliwosciowaProfilu;
  readonly reactive_power: MocBiernaProfilu;
  readonly p_recovery_after_fault: OdbudowaMocyProfilu;
  readonly ride_through: ObwiednieFrtProfilu;
}

/** `NcRfgPtpireeTestDefinition` — test kanonu T01–T20 z rejestrem zdolności dowodowej. */
export interface DefinicjaTestuNcRfg {
  readonly test_id: string;
  readonly ability_pl: string;
  readonly procedure_basis_pl: string;
  readonly default_for_modules: readonly string[];
  readonly required_without_certificate_for: readonly string[];
  readonly conditional_pl: string | null;
  readonly zdolnosc_id: string;
  readonly rodzaj_twierdzenia: ClaimKind;
}

/** `GET /api/ncrfg-tests/catalog`. */
export interface KatalogNcRfg {
  readonly procedure_version: DokumentWarstwy;
  readonly operators: readonly ProfilOperatoraNcRfg[];
  readonly tests: readonly DefinicjaTestuNcRfg[];
}

// =============================================================================
// Wejście biegu „co-jeśli" (`POST /api/ncrfg-tests/run`)
// =============================================================================

/**
 * `enm/nastawy_modulu.py::NastawyZabezpieczenModulu` i `enm/deklaracje_modulu.py::
 * DeklaracjeModulu` — JEDNO lustro w `types/enm.ts` (ten sam kontrakt niesie model `Generator`
 * i wejście biegu „co-jeśli"); tu wyłącznie re-eksport.
 */
export type { DeklaracjeModulu, NastawyZabezpieczenModulu } from '../../../types/enm';

/** Pola wartości nastaw w kolejności słownika Banku Nastaw (`nastawy_modulu.POLA_NASTAW`). */
export const POLA_NASTAW = [
  'u_min_pu',
  'u_min_czas_s',
  'u_max_pu',
  'u_max_czas_s',
  'f_min_hz',
  'f_min_czas_s',
  'f_max_hz',
  'f_max_czas_s',
  'rocof_hz_s',
  'rocof_czas_s',
  'przesuniecie_fazy_deg',
] as const satisfies readonly (keyof NastawyZabezpieczenModulu)[];

export type PoleNastawy = (typeof POLA_NASTAW)[number];

/** `contracts.NcRfgPtpireeModuleInput` — dokładnie pola kontraktu (`extra="forbid"`). */
export interface WejscieModuluNcRfg {
  readonly der_ref: string;
  readonly der_name: string | null;
  readonly der_kind: RodzajDer;
  readonly module_family: RodzinaModulu;
  readonly operator_id: string;
  readonly p_max_kw: number;
  readonly p_min_kw: number | null;
  readonly voltage_kv: number;
  readonly modul_istniejacy: boolean | null;
  readonly data_umowy_przylaczeniowej: string | null;
  readonly nastawy_zabezpieczen_modulu: NastawyZabezpieczenModulu | null;
  readonly has_lvrt_curve: boolean;
  readonly has_hvrt_curve: boolean;
  readonly has_pf_droop: boolean;
  readonly has_qu_curve: boolean;
  readonly has_dynamic_model: boolean;
  /**
   * Deklaracje zdolności modułu (T05, T12, T13, T18, T19) — TRÓJSTANOWE: `null` = nie
   * zadeklarowano (test daje ocenę niewykonaną z nazwanym brakiem), `false` = zadeklarowano
   * brak funkcji, `true` = zadeklarowano funkcję (plan AB O-50 pkt 6). Pola ścisłe po stronie
   * backendu: wyłącznie `true`/`false`/`null`, nigdy `0`/`1`/napis.
   */
  readonly has_scada_communication: boolean | null;
  readonly has_disturbance_recorder: boolean | null;
  readonly active_power_control_enabled: boolean | null;
  readonly stop_generation_enabled: boolean | null;
  readonly reduction_generation_enabled: boolean | null;
  /** Wymaganie zdolności dodatkowej w programie badań operatora (T18) — `false` = nie wskazano. */
  readonly island_operation_required: boolean;
  readonly island_operation_capable: boolean | null;
  readonly black_start_required: boolean;
  readonly black_start_capable: boolean | null;
  readonly power_oscillation_damping_required: boolean;
  readonly power_oscillation_damping_enabled: boolean | null;
  readonly droop_percent: number | null;
  readonly dead_band_hz: number | null;
  readonly ramp_rate_pct_per_min: number | null;
  readonly cos_phi_min: number | null;
  readonly q_range_pct_pn_min: number | null;
  readonly q_range_pct_pn_max: number | null;
  readonly reactive_current_gain: number | null;
  readonly p_recovery_time_s: number | null;
  readonly harmonic_thdu_percent: number | null;
  readonly cease_generation_time_s: number | null;
}

/** `contracts.NcRfgPtpireeRunRequest` — moduły i (opcjonalnie) podzbiór testów. Nic więcej. */
export interface ZadanieBieguNcRfg {
  readonly modules: readonly WejscieModuluNcRfg[];
  readonly requested_test_ids?: readonly string[];
}

// =============================================================================
// Wynik biegu (`NcRfgPtpireeRunResponse`)
// =============================================================================

/** `contracts.DowodCertyfikatu` — rekord wykazu PTPiREE dopasowany PO STRONIE SERWERA. */
export interface DowodCertyfikatu {
  readonly rekord_id: string;
  readonly producent: string;
  readonly model: string;
  readonly numer_dokumentu: string;
  readonly data_akceptacji: string | null;
  readonly wersja_wipwc: string;
  readonly wersja_wos: string | null;
  readonly zakres_typow: readonly TypModulu[];
  readonly warunek_waznosci: string | null;
  readonly adres_zrodla: string | null;
  readonly podstawa: PodstawaWymagania;
}

/** `contracts.NcRfgTraceStep` — krok śladu WHITE BOX (wzór ASCII solvera). */
export interface KrokSladuNcRfg {
  readonly step: number;
  readonly test_id: string;
  readonly key: string;
  readonly formula: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly substitution: string;
  readonly result: Readonly<Record<string, unknown>>;
  readonly unit_check: string;
  readonly proof_ref: string;
}

/** `contracts.NcRfgPtpireeTestResult` — rekord `ocena` + pola pochodne (kopie z rekordu). */
export interface WynikTestuNcRfg {
  readonly test_id: string;
  readonly ability_pl: string;
  readonly required: boolean;
  readonly required_reason_pl: string;
  readonly verdict: WerdyktWewnetrznyTestu;
  readonly summary_pl: string;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly trace_refs: readonly string[];
  readonly ocena: OcenaKryterium;
}

/** `contracts.NcRfgPtpireeModuleResult` — bez agregatu i bez liczników (O-13). */
export interface WynikModuluNcRfg {
  readonly der_ref: string;
  readonly der_name: string | null;
  readonly operator_id: string;
  readonly operator_name_pl: string;
  readonly module_type: TypModulu | null;
  readonly klasyfikacja: KlasyfikacjaModulu;
  readonly der_kind: RodzajDer;
  readonly module_family: RodzinaModulu;
  readonly technologia: Technologia;
  readonly modul_istniejacy: boolean | null;
  readonly data_umowy_przylaczeniowej: string | null;
  readonly wersja_procedury: DokumentWarstwy;
  readonly profile_version: string;
  readonly profile_hash: string;
  readonly p_max_kw: number;
  readonly voltage_kv: number;
  readonly dowod_certyfikatu: DowodCertyfikatu | null;
  readonly zrodlo_danych: ZrodloDanych;
  readonly tests: readonly WynikTestuNcRfg[];
}

/** `ocena_wymagan.OcenaWymaganModulu` — rekordy W modułu w kolejności profilu. */
export interface OcenaWymaganModulu {
  readonly der_ref: string;
  readonly der_name: string | null;
  readonly klasyfikacja: KlasyfikacjaModulu;
  readonly technologia: Technologia;
  readonly zrodlo_danych: ZrodloDanych;
  readonly wymagania: readonly WynikWymagania[];
}

/** `bieg.NcRfgPtpireeRunResponse` (kontrakt `NcRfgPtpireeTestResultV2`). */
export interface BiegNcRfg {
  readonly contract: 'NcRfgPtpireeTestResultV2';
  readonly procedure_version: DokumentWarstwy;
  readonly solver_version: string;
  readonly input_hash: string;
  readonly deterministic_hash: string;
  readonly modules: readonly WynikModuluNcRfg[];
  readonly test_catalog: readonly DefinicjaTestuNcRfg[];
  readonly white_box_trace: readonly KrokSladuNcRfg[];
  readonly report_pl: string;
  readonly ocena_wymagan: readonly OcenaWymaganModulu[];
}

// =============================================================================
// Zgodność przypadku (`GET /api/ncrfg-tests/cases/{case_id}/compliance`)
// =============================================================================

/** `model_bridge.NcRfgDerPominiety` — DER modelu nieobjęty biegiem, z powodem. */
export interface DerPominiety {
  readonly der_ref: string;
  readonly der_name: string | null;
  readonly powod: PowodPominieciaDer;
  readonly powod_pl: string;
}

/** `model_bridge.NcRfgCertyfikatOdrzucony` — tabliczka wskazuje rekord, serwer go nie potwierdził. */
export interface CertyfikatOdrzucony {
  readonly der_ref: string;
  readonly rekord_ref: string | null;
  readonly powod_pl: string;
}

/**
 * `bieg.NcRfgWejsciaPrzypadkuResponse` (`GET /api/ncrfg-tests/cases/{case_id}/wejscia`) —
 * wejścia modułów złożone z ZATWIERDZONEGO modelu przypadku przez most backendu (te same, które
 * ocenia zgodność przypadku): formularz wstępny biegu „co-jeśli". `pola_z_modelu` (po
 * `der_ref`) — pola z wartością z danych modelu (pochodzenie „z modelu"); `pominiete` — DER
 * modelu, których most nie objął, z powodem.
 */
export interface WejsciaPrzypadkuNcRfg {
  readonly case_id: string;
  readonly operator_id: string;
  readonly modules: readonly WejscieModuluNcRfg[];
  readonly pola_z_modelu: Readonly<Record<string, readonly (keyof WejscieModuluNcRfg)[]>>;
  readonly pominiete: readonly DerPominiety[];
}

/** `bieg.NcRfgCaseComplianceResponse` — `bieg === null` dokładnie wtedy, gdy `der_count === 0`. */
export interface ZgodnoscPrzypadkuNcRfg {
  readonly case_id: string;
  readonly operator_id: string;
  readonly der_count: number;
  readonly pominiete: readonly DerPominiety[];
  readonly certyfikaty_odrzucone: readonly CertyfikatOdrzucony[];
  readonly bieg: BiegNcRfg | null;
}

// =============================================================================
// Dokumenty formalne: sekcja modułu (`sekcja_zgodnosci_ncrfg.sekcja_modulu`)
// =============================================================================

/** `werdykt.dokument.PozycjaBloku` — wiersz dokumentu formalnego (etykieta, treść). */
export interface PozycjaBloku {
  readonly etykieta_pl: string;
  readonly tresc_pl: string;
}

/** Wymaganie w sekcji modułu: rekord W i blok dokumentu (te same zdania co DOCX/PDF). */
export interface WymaganieSekcji {
  readonly rekord: WynikWymagania;
  readonly blok: readonly PozycjaBloku[];
}

/** `sekcja_modulu()` — dane, na których stoją rekordy, i rekordy W modułu. */
export interface SekcjaModuluNcRfg {
  readonly der_ref: string;
  readonly der_name: string | null;
  readonly operator_pl: string;
  readonly p_max_kw: number;
  readonly voltage_kv: number;
  readonly klasyfikacja: KlasyfikacjaModulu;
  readonly technologia: Technologia;
  readonly zrodlo_danych: ZrodloDanych;
  readonly dowod_certyfikatu: DowodCertyfikatu | null;
  readonly certyfikat_odrzucony: CertyfikatOdrzucony | null;
  readonly wiersze: readonly PozycjaBloku[];
  readonly wymagania: readonly WymaganieSekcji[];
}

// =============================================================================
// Certyfikat zgodności (`POST /api/oze-analysis/compliance-certificate(.docx/.pdf)?case_id=`)
// =============================================================================

/** `CertyfikatZgodnosciRequest` — dane modułów pochodzą WYŁĄCZNIE z modelu przypadku. */
export interface ZadanieCertyfikatu {
  readonly nazwa_projektu: string;
  readonly nazwa_przypadku: string | null;
  readonly operator_id: string;
}

/** Blok `identyfikacja` widoku certyfikatu. */
export interface IdentyfikacjaCertyfikatu {
  readonly projekt: string;
  readonly przypadek: string | null;
  readonly case_id: string;
  readonly operator_id: string;
  readonly procedura: DokumentWarstwy;
  readonly wersja_narzedzia: string;
}

/** `build_certyfikat_view()` — kontrakt `CertyfikatZgodnosciNcRfgV2`, bez werdyktu zbiorczego. */
export interface WidokCertyfikatu {
  readonly kontrakt: 'CertyfikatZgodnosciNcRfgV2';
  readonly tytul: string;
  readonly identyfikacja: IdentyfikacjaCertyfikatu;
  readonly moduly: readonly SekcjaModuluNcRfg[];
  readonly zalozenia_i_zrodla: readonly string[];
  readonly odcisk_wejscia_sha256: string;
  readonly odcisk_wyniku_sha256: string;
}

/**
 * `ocena_wymagan.BrakWymaganiaModulu` (`brak_json`) — rekord W blokujący dokument, przypisany do
 * modułu, którego dotyczy (plan AB O-50 pkt 7): odbiorca grupuje braki po `der_ref`.
 */
export interface BrakWymaganiaModulu {
  readonly der_ref: string;
  readonly der_name: string | null;
  readonly rekord: WynikWymagania;
}

/** `ocena_wymagan.brak_pl` — zdanie rekordu W braku z modułem, którego dotyczy. */
export interface ZdanieBrakuModulu {
  readonly der_ref: string;
  readonly der_name: string | null;
  readonly zdanie_pl: string;
}

/** `CertyfikatBrakiError.detail()` — treść 422 „czego brakuje do certyfikatu". */
export interface BrakiCertyfikatu {
  readonly komunikat: string;
  readonly braki: readonly BrakWymaganiaModulu[];
  readonly braki_pl: readonly ZdanieBrakuModulu[];
  readonly pominiete: readonly DerPominiety[];
  readonly pominiete_pl: readonly string[];
}

// =============================================================================
// Wniosek do OSD (`POST /api/oze-analysis/osd-application(.docx/.pdf)?case_id=`)
// =============================================================================

/** `WniosekOsdRequest` — zgodność NC RfG pochodzi WYŁĄCZNIE z modelu przypadku. */
export interface ZadanieWniosku {
  readonly nazwa_projektu: string;
  readonly nazwa_przypadku: string | null;
  readonly wnioskodawca: string | null;
  readonly adres_przylaczenia: string | null;
  readonly pf_run_id: string;
  readonly sc_run_id: string;
  readonly bus_ref: string;
  readonly operator_id: string;
}

/** Blok `identyfikacja` widoku wniosku. */
export interface IdentyfikacjaWniosku {
  readonly projekt: string;
  readonly przypadek: string | null;
  readonly wnioskodawca: string | null;
  readonly adres_przylaczenia: string | null;
  readonly wezel_przylaczenia: string;
}

/** Liczności walidacji ENERGETYCZNEJ rozpływu (backend) — nie dotyczą NC RfG. */
export interface PodsumowanieWalidacjiWniosku {
  readonly spelnione: number;
  readonly ostrzezenia: number;
  readonly niespelnione: number;
  readonly nieobliczone: number;
}

/** `wniosek_osd._bilans_mocy_sekcja`. */
export interface SekcjaBilansuWniosku {
  readonly moc_zainstalowana_zrodel_mva: number;
  readonly moc_zainstalowana_w_punkcie_mva: number | null;
  readonly liczba_wezlow_ze_zrodlami: number;
  readonly obciazenie_najwyzsze_pct: number | null;
  readonly obciazenie_element: string | null;
  readonly wspolczynnik_mocy_slack: number | null;
  readonly bilans_q_status: string;
  readonly straty_pct: number | null;
  readonly straty_status: string;
  readonly podsumowanie_walidacji: PodsumowanieWalidacjiWniosku;
}

/** `wniosek_osd._zwarcia_sekcja`. */
export interface SekcjaZwarciaWniosku {
  readonly bus_ref: string;
  readonly nazwa_wezla: string;
  readonly ik_ss_ka: number | null;
  readonly sk_mva: number | null;
  readonly ip_ka: number | null;
  readonly ith_ka: number | null;
  readonly rodzaj_zwarcia: string | null;
}

/** `wniosek_osd._zgodnosc_sekcja` — ten sam serializer modułów co certyfikat, bez agregatu. */
export interface SekcjaZgodnosciWniosku {
  readonly case_id: string;
  readonly operator_id: string;
  readonly procedura: DokumentWarstwy;
  readonly moduly: readonly SekcjaModuluNcRfg[];
  readonly odeslanie_pl: string;
  readonly odcisk_wejscia_nc_rfg_sha256: string;
}

/** `build_wniosek_osd_view()` — kontrakt `WNIOSEK_OSD_CONTRACT`. */
export interface WidokWniosku {
  readonly kontrakt: string;
  readonly tytul: string;
  readonly identyfikacja: IdentyfikacjaWniosku;
  readonly bilans_mocy: SekcjaBilansuWniosku;
  readonly zwarcia_punkt_przylaczenia: SekcjaZwarciaWniosku;
  readonly zgodnosc_nc_rfg: SekcjaZgodnosciWniosku;
  readonly zalozenia_pl: readonly string[];
  readonly odciski_sekcji_sha256: Readonly<Record<string, string>>;
  readonly zrodla: {
    readonly pf_run_id: string;
    readonly sc_run_id: string;
    readonly nc_rfg_input_hash: string;
    readonly case_id: string;
  };
  readonly input_hash: string;
}

/** `WniosekOsdBrakiError.detail()` — braki tekstowe, rekordy W zgodności i źródła pominięte. */
export interface BrakiWniosku {
  readonly komunikat: string;
  readonly braki: readonly string[];
  readonly braki_ncrfg: readonly BrakWymaganiaModulu[];
  readonly braki_ncrfg_pl: readonly ZdanieBrakuModulu[];
  readonly pominiete: readonly DerPominiety[];
  readonly pominiete_pl: readonly string[];
}
