/**
 * NC RfG Contract — krok 14 Kreatora KOMPLETNEGO.
 *
 * Network Code on Requirements for Generators (Komisja UE rozporządzenie
 * 2016/631) — wymagania przyłączeniowe dla modułów generujących prąd.
 *
 * Moduły (zależne od mocy max i napięcia w PCC):
 *   A — Pmax: 0.8 kW (LV) — 1 MW (MV i HV)
 *   B — Pmax: 1 MW — 50 MW (LV) lub odpowiednio przy MV/HV
 *   C — Pmax: 50 MW — 75 MW
 *   D — Pmax: ≥ 75 MW lub przyłączone do sieci 110 kV+
 *
 * Per ENTSO-E + Implementing Regulations PSE/Energa/Tauron/Enea/PGE.
 */

/** Moduł NC RfG. */
export type NcRfgModule = 'A' | 'B' | 'C' | 'D';

/** Wybór modułu na podstawie mocy + napięcia PCC. */
export function selectNcRfgModule(
  ratedPowerKw: number,
  pccVoltageKv: number,
): NcRfgModule {
  // Threshold per Polska Implementing Decision: A < 200 kW (LV), B 200kW-50MW (MV).
  if (ratedPowerKw < 200) return 'A';
  if (ratedPowerKw < 50_000) {
    return pccVoltageKv >= 110 ? 'C' : 'B';
  }
  if (ratedPowerKw < 75_000) return 'C';
  return 'D';
}

/** Wymaganie z artykułów NC RfG. */
export interface NcRfgRequirement {
  readonly article: string;     // np. "Art. 13.1"
  readonly title: string;
  readonly appliesToModules: ReadonlyArray<NcRfgModule>;
  readonly mandatory: boolean;
  readonly notesPl: string;
}

export const NC_RFG_REQUIREMENTS: readonly NcRfgRequirement[] = [
  {
    article: 'Art. 13.1',
    title: 'Zakres częstotliwości pracy',
    appliesToModules: ['A', 'B', 'C', 'D'],
    mandatory: true,
    notesPl: 'Praca ciągła 49.5-50.5 Hz; ograniczona 47.5-49.5 i 50.5-51.5 Hz',
  },
  {
    article: 'Art. 13.2',
    title: 'Redukcja mocy czynnej przy nadczęstotliwości (P(f) droop)',
    appliesToModules: ['A', 'B', 'C', 'D'],
    mandatory: true,
    notesPl: 'Statyzm 2-12% (typowo 5%) przy f > 50.2 Hz',
  },
  {
    article: 'Art. 14',
    title: 'LFSM-O (Limited Frequency Sensitive Mode — Overfrequency)',
    appliesToModules: ['A', 'B', 'C', 'D'],
    mandatory: true,
    notesPl: 'Próg aktywacji 50.2 Hz, statyzm 5%, czas reakcji ≤ 2 s',
  },
  {
    article: 'Art. 15.2',
    title: 'FRT (Fault Ride-Through) — LVRT',
    appliesToModules: ['B', 'C', 'D'],
    mandatory: true,
    notesPl: 'Krzywa LVRT — pozostanie w sieci podczas zwarć; iniekcja Iq',
  },
  {
    article: 'Art. 15.5',
    title: 'Sygnały sterujące (telesygnalizacja, telesterowanie)',
    appliesToModules: ['B', 'C', 'D'],
    mandatory: true,
    notesPl: 'Pomiary mocy, stanu wyłącznika, U, I, f w czasie rzeczywistym',
  },
  {
    article: 'Art. 16',
    title: 'Regulacja napięcia Q(U)',
    appliesToModules: ['B', 'C', 'D'],
    mandatory: true,
    notesPl: 'Krzywa Q(U) — utrzymanie ±10% mocy biernej dla zarządzania napięciem',
  },
  {
    article: 'Art. 16.3',
    title: 'cos φ(P) charakterystyka',
    appliesToModules: ['B', 'C', 'D'],
    mandatory: false,
    notesPl: 'Zmiana cos φ wraz z mocą czynną — alternatywa dla Q(U)',
  },
  {
    article: 'Art. 17',
    title: 'HVRT (High-Voltage Ride-Through)',
    appliesToModules: ['C', 'D'],
    mandatory: true,
    notesPl: 'Praca przy przepięciach do 130% Un — typowo dla wiatraków offshore',
  },
  {
    article: 'Art. 18',
    title: 'Tolerancja przerw zasilania',
    appliesToModules: ['C', 'D'],
    mandatory: true,
    notesPl: 'Dopuszczalne odłączenie ≤ 300 ms; powrót w 1-30 s',
  },
  {
    article: 'Art. 21',
    title: 'Black-start capability',
    appliesToModules: ['D'],
    mandatory: false,
    notesPl: 'Zdolność do uruchomienia bez zasilania zewnętrznego (rzadko)',
  },
  {
    article: 'Art. 22',
    title: 'Stabilność dynamiczna — grid-forming behaviour',
    appliesToModules: ['C', 'D'],
    mandatory: false,
    notesPl: 'Grid-forming inwerter (vs grid-following) — wsparcie dla stabilności',
  },
  {
    article: 'Art. 24',
    title: 'Anti-islanding (LoM detection)',
    appliesToModules: ['A', 'B', 'C', 'D'],
    mandatory: true,
    notesPl: 'Detekcja utraty sieci i odłączenie w czasie ≤ 2 s',
  },
];

/** Filtrowanie wymagań per moduł. */
export function getRequirementsForModule(
  module: NcRfgModule,
): readonly NcRfgRequirement[] {
  return NC_RFG_REQUIREMENTS.filter((r) => r.appliesToModules.includes(module));
}

/** P(f) droop — redukcja mocy przy nadczęstotliwości. */
export interface PfDroopSettings {
  /** Częstotliwość aktywacji (Hz, typ. 50.2). */
  readonly activationFreqHz: number;
  /** Statyzm % (typ. 5%). */
  readonly droopPct: number;
  /** Czas reakcji (s, ≤ 2). */
  readonly responseTimeSec: number;
}

/** Pierwsze 5 profili OSD per implementing decisions. */
export interface OperatorProfile {
  readonly operatorRef: 'PSE' | 'Energa' | 'Tauron' | 'Enea' | 'PGE';
  readonly pfDroop: PfDroopSettings;
  /** Q(U) settings: dead-band V (pu), max slope (%/pu). */
  readonly quDeadband: number;
  readonly quSlope: number;
  /** LVRT krzywa: czas pełnego zaniku (ms), procent recovery. */
  readonly lvrtZeroVoltageMs: number;
  readonly lvrtRecoveryPct: number;
}

export const OSD_PROFILES: readonly OperatorProfile[] = [
  {
    operatorRef: 'PSE',
    pfDroop: { activationFreqHz: 50.2, droopPct: 5.0, responseTimeSec: 2.0 },
    quDeadband: 0.05,
    quSlope: 4.0,
    lvrtZeroVoltageMs: 150,
    lvrtRecoveryPct: 90,
  },
  {
    operatorRef: 'Energa',
    pfDroop: { activationFreqHz: 50.2, droopPct: 5.0, responseTimeSec: 2.0 },
    quDeadband: 0.05,
    quSlope: 3.0,
    lvrtZeroVoltageMs: 150,
    lvrtRecoveryPct: 90,
  },
  {
    operatorRef: 'Tauron',
    pfDroop: { activationFreqHz: 50.2, droopPct: 4.0, responseTimeSec: 1.5 },
    quDeadband: 0.06,
    quSlope: 3.5,
    lvrtZeroVoltageMs: 200,
    lvrtRecoveryPct: 85,
  },
  {
    operatorRef: 'Enea',
    pfDroop: { activationFreqHz: 50.2, droopPct: 5.0, responseTimeSec: 2.0 },
    quDeadband: 0.05,
    quSlope: 4.0,
    lvrtZeroVoltageMs: 150,
    lvrtRecoveryPct: 90,
  },
  {
    operatorRef: 'PGE',
    pfDroop: { activationFreqHz: 50.2, droopPct: 5.0, responseTimeSec: 2.0 },
    quDeadband: 0.05,
    quSlope: 4.0,
    lvrtZeroVoltageMs: 150,
    lvrtRecoveryPct: 90,
  },
];

/**
 * P(f) reduction at given frequency.
 *   ΔP/Pn = (f - f_activation) / (f_n × droop%)
 */
export function computePfReduction(
  settings: PfDroopSettings,
  actualFreqHz: number,
  nominalFreqHz: number = 50,
): number {
  if (actualFreqHz <= settings.activationFreqHz) return 0;
  const deltaF = actualFreqHz - settings.activationFreqHz;
  return (deltaF / nominalFreqHz) / (settings.droopPct / 100) * 100;
}

/** Compliance summary per moduł. */
export interface NcRfgComplianceResult {
  readonly module: NcRfgModule;
  readonly applicableRequirementsCount: number;
  readonly mandatoryCount: number;
  readonly profilesAvailable: number;
}

export function summarizeNcRfgCompliance(
  module: NcRfgModule,
): NcRfgComplianceResult {
  const reqs = getRequirementsForModule(module);
  const mandatory = reqs.filter((r) => r.mandatory).length;
  return {
    module,
    applicableRequirementsCount: reqs.length,
    mandatoryCount: mandatory,
    profilesAvailable: OSD_PROFILES.length,
  };
}
