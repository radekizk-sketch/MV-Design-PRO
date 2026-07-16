/*
 * Model danych + adaptery okna „Macierz wymogów NC RfG per moduł" (karta P39).
 *
 * WARSTWA PREZENTACJI (NOT-A-SOLVER): zero fizyki, zero ocen własnych. Adaptery
 * wyłącznie:
 *   1. `zbudujModuly`  — projektują realne źródło DER (useStationDerStore) na
 *      wejścia biegu; napięcie WYŁĄCZNIE z modelu (poziom napięcia przyłączenia),
 *      brak → jawny stan „brak danych" (ZAKAZ zgadywania — inaczej niż stara
 *      zakładka NcRfgTestsTab.tsx:129-132, która zgadywała 15 kV).
 *   2. `zbudujWejscieModulu` — składa NcRfgModuleInput z opisu modułu + zdolności.
 *   3. `mapujMacierz` — odwzorowują `NcRfgRunResult` na siatkę test × moduł.
 *
 * Determinizm: kolejność modułów = kolejność `selectAllDers` (sort po id);
 * kolejność wierszy = kolejność katalogu testów. Brak `Date.now`/losowości.
 */

import type {
  NcRfgCertificateStatus,
  NcRfgModuleInput,
  NcRfgModuleResult,
  NcRfgRunResult,
  NcRfgTestCatalogResponse,
  NcRfgTestDefinition,
  NcRfgTestResult,
  NcRfgVerdict,
} from '../../../ui/ncrfg-tests/api';
import {
  getLvVoltageLevel,
  type DerKindUnified,
  type StationDerConnection,
} from '../../../ui/network-build/station-der';

// =============================================================================
// Typy warstwy prezentacji
// =============================================================================

/** Trzy jawne pochodzenia danej wejściowej (uczciwość źródła danych). */
export type PochodzenieDanej = 'model' | 'katalog' | 'deklarowane';

/** Powód, dla którego moduł nie może zostać objęty biegiem. */
export type PowodBlokady = 'brak_napiecia' | 'brak_mocy';

/** Zdolności techniczne modułu (odwzorowanie flag `has_*`/`*_enabled` wejścia). */
export interface ZdolnosciModulu {
  readonly hasLvrtCurve: boolean;
  readonly hasHvrtCurve: boolean;
  readonly hasPfDroop: boolean;
  readonly hasQuCurve: boolean;
  readonly hasDynamicModel: boolean;
  readonly hasScadaCommunication: boolean;
  readonly hasDisturbanceRecorder: boolean;
  readonly activePowerControlEnabled: boolean;
  readonly stopGenerationEnabled: boolean;
  readonly reductionGenerationEnabled: boolean;
  readonly islandOperationRequired: boolean;
  readonly islandOperationCapable: boolean;
  readonly blackStartRequired: boolean;
  readonly blackStartCapable: boolean;
  readonly powerOscillationDampingRequired: boolean;
  readonly powerOscillationDampingEnabled: boolean;
}

export type KluczZdolnosci = keyof ZdolnosciModulu;

/** Parametry nastaw modułu (łańcuchy z formularza; parsowane przy biegu). */
export interface NumeryczneModulu {
  readonly pMinKw: string;
  readonly droopPercent: string;
  readonly deadBandHz: string;
  readonly rampPctPerMin: string;
  readonly cosPhiMin: string;
  readonly qMin: string;
  readonly qMax: string;
  readonly reactiveCurrentGain: string;
  readonly pRecoveryTimeS: string;
  readonly thduPercent: string;
}

export type KluczNumeryczny = keyof NumeryczneModulu;

/** Opis pojedynczego modułu wytwórczego (kolumna macierzy). */
export interface OpisModulu {
  readonly derRef: string;
  readonly nazwa: string;
  readonly rodzaj: DerKindUnified;
  readonly mocKw: number | null;
  readonly napiecieKv: number | null;
  readonly certyfikat: NcRfgCertificateStatus;
  /** null = moduł gotowy do biegu; wartość = jawny powód braku danych. */
  readonly powodBlokady: PowodBlokady | null;
  readonly zdolnosci: ZdolnosciModulu;
  /** Pochodzenie każdej zdolności (katalog / deklarowane). */
  readonly pochodzenieZdolnosci: Readonly<Record<KluczZdolnosci, PochodzenieDanej>>;
  readonly numeryczne: NumeryczneModulu;
}

/** Stan pojedynczej komórki macierzy (test × moduł). */
export type StanKomorki = 'brak_biegu' | 'wynik' | 'brak_danych_modul';

export interface KomorkaMacierzy {
  readonly derRef: string;
  readonly testId: string;
  readonly stan: StanKomorki;
  readonly werdykt: NcRfgVerdict | null;
  /** Pełny wynik testu (do panelu szczegółu) — tylko gdy stan === 'wynik'. */
  readonly wynik: NcRfgTestResult | null;
  /** Powód braku danych modułu (gdy stan === 'brak_danych_modul'). */
  readonly powodModulu: PowodBlokady | null;
}

/** Wiersz macierzy = jeden wymóg/test × wszystkie moduły. */
export interface WierszMacierzy {
  readonly test: NcRfgTestDefinition;
  readonly komorki: readonly KomorkaMacierzy[];
}

/** Podsumowanie per moduł. */
export interface PodsumowanieModulu {
  readonly derRef: string;
  readonly nazwa: string;
  readonly overallStatus: string;
  readonly requiredCount: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly noDataCount: number;
  readonly zablokowany: boolean;
}

/** Podsumowanie całego projektu. */
export interface PodsumowanieProjektu {
  readonly liczbaModulow: number;
  readonly zgodne: number;
  readonly niezgodne: number;
  readonly brakDanych: number;
  readonly wymaganeRazem: number;
  readonly spelnioneRazem: number;
}

// =============================================================================
// Rozwiązanie napięcia przyłączenia — WYŁĄCZNIE z modelu (ZAKAZ zgadywania)
// =============================================================================

/**
 * Napięcie przyłączenia [kV] z modelu — z poziomu napięcia przyłączenia
 * (`voltage_level_ref` → katalog poziomów napięć nN/SN, `nominal_kv`). Brak
 * jednoznacznej danej modelowej → `null` (moduł trafi w stan „brak danych").
 * NIE stosujemy domyślnej wartości 15 kV ani wnioskowania z `connection_side`.
 */
export function rozwiazNapiecieKv(der: StationDerConnection): number | null {
  if (!der.voltage_level_ref) return null;
  const poziom = getLvVoltageLevel(der.voltage_level_ref);
  if (poziom && Number.isFinite(poziom.nominal_kv) && poziom.nominal_kv > 0) {
    return poziom.nominal_kv;
  }
  return null;
}

/** Status certyfikatu z modelu/katalogu (wzór NcRfgTestsTab.tsx:134-138). */
export function rozwiazCertyfikat(der: StationDerConnection): NcRfgCertificateStatus {
  const ref = der.catalogs.ptpiree_certificate_ref;
  const device = der.catalogs.device_catalog_ref;
  return ref || device?.includes('ptpiree') ? 'ptpiree_verified' : 'unknown';
}

// =============================================================================
// Adapter: realne źródło DER → opisy modułów
// =============================================================================

const DOMYSLNE_NUMERYCZNE: NumeryczneModulu = {
  pMinKw: '',
  droopPercent: '5',
  deadBandHz: '0.2',
  rampPctPerMin: '10',
  cosPhiMin: '0.95',
  qMin: '-0.33',
  qMax: '0.33',
  reactiveCurrentGain: '2',
  pRecoveryTimeS: '1',
  thduPercent: '',
};

/** Zdolności wstępne + pochodzenie z realnego DER (read-only, bez mutacji). */
function zdolnosciWstepne(der: StationDerConnection): {
  zdolnosci: ZdolnosciModulu;
  pochodzenie: Record<KluczZdolnosci, PochodzenieDanej>;
} {
  const lvrt = Boolean(der.profiles.lvrt_curve_ref);
  const hvrt = Boolean(der.profiles.hvrt_curve_ref);
  const pf = Boolean(der.profiles.pf_curve_ref || der.profiles.regulation_profile_ref);
  const qu = Boolean(der.profiles.regulation_profile_ref);
  const dyn = Boolean(der.catalogs.dynamic_model_ref);

  const zdolnosci: ZdolnosciModulu = {
    hasLvrtCurve: lvrt,
    hasHvrtCurve: hvrt,
    hasPfDroop: pf,
    hasQuCurve: qu,
    hasDynamicModel: dyn,
    hasScadaCommunication: false,
    hasDisturbanceRecorder: false,
    activePowerControlEnabled: false,
    stopGenerationEnabled: false,
    reductionGenerationEnabled: false,
    islandOperationRequired: false,
    islandOperationCapable: false,
    blackStartRequired: false,
    blackStartCapable: false,
    powerOscillationDampingRequired: false,
    powerOscillationDampingEnabled: false,
  };

  // Pochodzenie: zdolności odczytane z katalogu/profilu → 'katalog';
  // pozostałe (nieprzechowywane w modelu) → 'deklarowane'.
  const pochodzenie: Record<KluczZdolnosci, PochodzenieDanej> = {
    hasLvrtCurve: lvrt ? 'katalog' : 'deklarowane',
    hasHvrtCurve: hvrt ? 'katalog' : 'deklarowane',
    hasPfDroop: pf ? 'katalog' : 'deklarowane',
    hasQuCurve: qu ? 'katalog' : 'deklarowane',
    hasDynamicModel: dyn ? 'katalog' : 'deklarowane',
    hasScadaCommunication: 'deklarowane',
    hasDisturbanceRecorder: 'deklarowane',
    activePowerControlEnabled: 'deklarowane',
    stopGenerationEnabled: 'deklarowane',
    reductionGenerationEnabled: 'deklarowane',
    islandOperationRequired: 'deklarowane',
    islandOperationCapable: 'deklarowane',
    blackStartRequired: 'deklarowane',
    blackStartCapable: 'deklarowane',
    powerOscillationDampingRequired: 'deklarowane',
    powerOscillationDampingEnabled: 'deklarowane',
  };

  return { zdolnosci, pochodzenie };
}

/**
 * Projekcja realnego źródła DER na opisy modułów macierzy. Kolejność wejścia
 * jest już deterministyczna (`selectAllDers` sortuje po id).
 */
export function zbudujModuly(ders: readonly StationDerConnection[]): OpisModulu[] {
  return ders.map((der) => {
    const napiecieKv = rozwiazNapiecieKv(der);
    const mocKw =
      typeof der.nominal_power_kw === 'number' && der.nominal_power_kw > 0
        ? der.nominal_power_kw
        : null;
    const powodBlokady: PowodBlokady | null =
      mocKw === null ? 'brak_mocy' : napiecieKv === null ? 'brak_napiecia' : null;
    const { zdolnosci, pochodzenie } = zdolnosciWstepne(der);

    return {
      derRef: der.id,
      nazwa: der.name,
      rodzaj: der.der_kind,
      mocKw,
      napiecieKv,
      certyfikat: rozwiazCertyfikat(der),
      powodBlokady,
      zdolnosci,
      pochodzenieZdolnosci: pochodzenie,
      numeryczne: DOMYSLNE_NUMERYCZNE,
    };
  });
}

// =============================================================================
// Adapter: opis modułu → NcRfgModuleInput (wejście biegu)
// =============================================================================

function parsujOpcjonalna(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Składa NcRfgModuleInput z opisu modułu. Zwraca `null`, gdy moduł jest
 * zablokowany (brak mocy lub napięcia) — taki moduł NIE trafia do biegu.
 */
export function zbudujWejscieModulu(
  opis: OpisModulu,
  operatorId: string,
): NcRfgModuleInput | null {
  if (opis.powodBlokady !== null || opis.mocKw === null || opis.napiecieKv === null) {
    return null;
  }
  const z = opis.zdolnosci;
  const n = opis.numeryczne;
  return {
    der_ref: opis.derRef,
    der_name: opis.nazwa,
    der_kind: opis.rodzaj,
    module_family: 'PPM',
    operator_id: operatorId,
    p_max_kw: opis.mocKw,
    p_min_kw: parsujOpcjonalna(n.pMinKw),
    voltage_kv: opis.napiecieKv,
    certificate_status: opis.certyfikat,
    has_lvrt_curve: z.hasLvrtCurve,
    has_hvrt_curve: z.hasHvrtCurve,
    has_pf_droop: z.hasPfDroop,
    has_qu_curve: z.hasQuCurve,
    has_dynamic_model: z.hasDynamicModel,
    has_scada_communication: z.hasScadaCommunication,
    has_disturbance_recorder: z.hasDisturbanceRecorder,
    active_power_control_enabled: z.activePowerControlEnabled,
    stop_generation_enabled: z.stopGenerationEnabled,
    reduction_generation_enabled: z.reductionGenerationEnabled,
    island_operation_required: z.islandOperationRequired,
    island_operation_capable: z.islandOperationCapable,
    black_start_required: z.blackStartRequired,
    black_start_capable: z.blackStartCapable,
    power_oscillation_damping_required: z.powerOscillationDampingRequired,
    power_oscillation_damping_enabled: z.powerOscillationDampingEnabled,
    droop_percent: parsujOpcjonalna(n.droopPercent),
    dead_band_hz: parsujOpcjonalna(n.deadBandHz),
    ramp_rate_pct_per_min: parsujOpcjonalna(n.rampPctPerMin),
    cos_phi_min: parsujOpcjonalna(n.cosPhiMin),
    q_range_pct_pn_min: parsujOpcjonalna(n.qMin),
    q_range_pct_pn_max: parsujOpcjonalna(n.qMax),
    reactive_current_gain: parsujOpcjonalna(n.reactiveCurrentGain),
    p_recovery_time_s: parsujOpcjonalna(n.pRecoveryTimeS),
    harmonic_thdu_percent: parsujOpcjonalna(n.thduPercent),
  };
}

// =============================================================================
// Adapter: NcRfgRunResult → siatka macierzy
// =============================================================================

function znajdzWynikModulu(
  wynik: NcRfgRunResult | null,
  derRef: string,
): NcRfgModuleResult | null {
  if (!wynik) return null;
  return wynik.modules.find((m) => m.der_ref === derRef) ?? null;
}

/**
 * Buduje siatkę macierzy: wiersze = testy z katalogu procedury, kolumny =
 * moduły. Werdykty pochodzą WYŁĄCZNIE z `NcRfgRunResult`. Moduły zablokowane
 * (brak danych) renderują kolumnę w stanie „brak danych modułu".
 */
export function mapujMacierz(
  katalog: NcRfgTestCatalogResponse | null,
  wynik: NcRfgRunResult | null,
  moduly: readonly OpisModulu[],
): WierszMacierzy[] {
  const definicje = katalog?.tests ?? wynik?.test_catalog ?? [];
  return definicje.map((test) => {
    const komorki: KomorkaMacierzy[] = moduly.map((modul) => {
      if (modul.powodBlokady !== null) {
        return {
          derRef: modul.derRef,
          testId: test.test_id,
          stan: 'brak_danych_modul',
          werdykt: null,
          wynik: null,
          powodModulu: modul.powodBlokady,
        };
      }
      const wynikModulu = znajdzWynikModulu(wynik, modul.derRef);
      const wynikTestu = wynikModulu?.tests.find((t) => t.test_id === test.test_id) ?? null;
      if (!wynikTestu) {
        return {
          derRef: modul.derRef,
          testId: test.test_id,
          stan: 'brak_biegu',
          werdykt: null,
          wynik: null,
          powodModulu: null,
        };
      }
      return {
        derRef: modul.derRef,
        testId: test.test_id,
        stan: 'wynik',
        werdykt: wynikTestu.verdict,
        wynik: wynikTestu,
        powodModulu: null,
      };
    });
    return { test, komorki };
  });
}

/** Podsumowanie per moduł (z wyniku biegu; moduł zablokowany → brak danych). */
export function podsumowanieModulu(
  opis: OpisModulu,
  wynik: NcRfgRunResult | null,
): PodsumowanieModulu {
  const zablokowany = opis.powodBlokady !== null;
  const w = zablokowany ? null : znajdzWynikModulu(wynik, opis.derRef);
  return {
    derRef: opis.derRef,
    nazwa: opis.nazwa,
    overallStatus: zablokowany ? 'brak_danych' : (w?.overall_status ?? 'brak_danych'),
    requiredCount: w?.required_count ?? 0,
    passCount: w?.pass_count ?? 0,
    failCount: w?.fail_count ?? 0,
    noDataCount: w?.no_data_count ?? 0,
    zablokowany,
  };
}

/** Podsumowanie całego projektu — agregacja z wyniku biegu i modułów. */
export function podsumowanieProjektu(
  moduly: readonly OpisModulu[],
  wynik: NcRfgRunResult | null,
): PodsumowanieProjektu {
  let zgodne = 0;
  let niezgodne = 0;
  let brakDanych = 0;
  let wymaganeRazem = 0;
  let spelnioneRazem = 0;

  for (const modul of moduly) {
    const p = podsumowanieModulu(modul, wynik);
    wymaganeRazem += p.requiredCount;
    spelnioneRazem += p.passCount;
    if (p.overallStatus === 'zgodny') zgodne += 1;
    else if (p.overallStatus === 'niezgodny') niezgodne += 1;
    else brakDanych += 1;
  }

  return {
    liczbaModulow: moduly.length,
    zgodne,
    niezgodne,
    brakDanych,
    wymaganeRazem,
    spelnioneRazem,
  };
}
