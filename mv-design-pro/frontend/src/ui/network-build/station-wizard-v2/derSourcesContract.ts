/**
 * DER Sources Contract — krok 11 Kreatora KOMPLETNEGO.
 *
 * Źródła OZE: PV (strings DC), BESS (degradacja, SOC, RT eff), FW (P(v),
 * cut-in/out).
 *
 * PV (per IEC 61730 + 62548):
 *   - Voc string ≤ Vmax_dc_inverter (typ. 1100 V dla SN string inverter)
 *   - Vmpp string w zakresie MPPT range
 *   - DC/AC ratio typ. 1.1-1.3 (oversize DC dla peak harvest)
 *
 * BESS (per IEC 62933):
 *   - C-rate (charge/discharge w jednostkach Cnom/h)
 *   - SOC range typ. 10-90% dla cycling
 *   - RT efficiency typ. 85-95% (PCS + battery losses)
 *   - SOH degradation rate (cycles + calendar)
 *
 * FW (per IEC 61400):
 *   - P(v) curve (cut-in 3 m/s, rated 12 m/s, cut-out 25 m/s)
 *   - Type 3 DFIG / Type 4 full converter
 */

/** Typ źródła DER. */
export type DerKind = 'PV' | 'BESS' | 'FW';

/** Profil PV string. */
export interface PvStringSpec {
  /** Number of modules per string. */
  readonly modulesPerString: number;
  /** Module Voc at STC (V). */
  readonly moduleVocV: number;
  /** Module Vmpp at STC (V). */
  readonly moduleVmppV: number;
  /** Module Pmax (W). */
  readonly modulePmaxW: number;
  /** Coefficient of Voc with temperature (%/K, typ. -0.30). */
  readonly tempCoeffVocPctPerK: number;
  /** Min ambient temperature (°C, typ. -25). */
  readonly minAmbientTempC: number;
}

export interface PvStringCheckResult {
  /** Max Voc string (przy minimum temperaturze). */
  readonly stringVocMaxV: number;
  /** Vmpp string at STC. */
  readonly stringVmppStcV: number;
  /** Total string power (W). */
  readonly stringPmaxW: number;
  /** Czy Voc string ≤ inverter Vmax_dc. */
  readonly vocWithinInverterLimit: boolean;
  /** Czy Vmpp string w MPPT range. */
  readonly vmppInMpptRange: boolean;
}

export function checkPvString(
  spec: PvStringSpec,
  inverterVmaxDcV: number,
  inverterMpptMinV: number,
  inverterMpptMaxV: number,
): PvStringCheckResult {
  // Voc max (przy minimum temperatury — Voc rośnie przy spadku T).
  const tempDelta = 25 - spec.minAmbientTempC; // ile K poniżej STC=25°C
  const vocCorrection = 1 + (Math.abs(spec.tempCoeffVocPctPerK) / 100) * tempDelta;
  const stringVocMax = spec.modulesPerString * spec.moduleVocV * vocCorrection;
  const stringVmppStc = spec.modulesPerString * spec.moduleVmppV;
  const stringPmax = spec.modulesPerString * spec.modulePmaxW;
  return {
    stringVocMaxV: stringVocMax,
    stringVmppStcV: stringVmppStc,
    stringPmaxW: stringPmax,
    vocWithinInverterLimit: stringVocMax <= inverterVmaxDcV,
    vmppInMpptRange: stringVmppStc >= inverterMpptMinV && stringVmppStc <= inverterMpptMaxV,
  };
}

/** Profil BESS. */
export interface BessSpec {
  /** Nominalna pojemność (kWh). */
  readonly nominalEnergyKwh: number;
  /** Moc znamionowa PCS (kW). */
  readonly ratedPowerKw: number;
  /** C-rate maksymalna (1/h). */
  readonly maxCRate: number;
  /** Sprawność round-trip (%, typ. 85-95). */
  readonly roundTripEfficiencyPct: number;
  /** SOC min (%, typ. 10). */
  readonly socMinPct: number;
  /** SOC max (%, typ. 90). */
  readonly socMaxPct: number;
  /** Degradacja na cykl pełen (%, typ. 0.01-0.05). */
  readonly degradationPerCyclePct: number;
  /** Degradacja kalendarzowa rocznie (%, typ. 1-3). */
  readonly calendarDegradationPerYearPct: number;
}

export interface BessLifetimeProjection {
  /** Użyteczna energia (kWh) = Enom × (SOCmax - SOCmin) / 100. */
  readonly usableEnergyKwh: number;
  /** Pełnych cykli rocznie. */
  readonly fullCyclesPerYear: number;
  /** SOH (State of Health) po N latach (%). */
  readonly sohAfterYears: number;
  /** Rok osiągnięcia EOL (80% SOH). */
  readonly yearsToEol80Pct: number;
}

export function projectBessLifetime(
  spec: BessSpec,
  yearsOperation: number,
  cyclesPerYear: number,
): BessLifetimeProjection {
  const usable = spec.nominalEnergyKwh * (spec.socMaxPct - spec.socMinPct) / 100;
  const cyclicDegradation =
    yearsOperation * cyclesPerYear * spec.degradationPerCyclePct;
  const calendarDegradation = yearsOperation * spec.calendarDegradationPerYearPct;
  const totalDegradation = cyclicDegradation + calendarDegradation;
  const soh = Math.max(0, 100 - totalDegradation);
  // EOL: 100 - 20 = 80% SOH. Reverse: znajdz rok gdy total = 20%.
  const annualDeg = cyclesPerYear * spec.degradationPerCyclePct + spec.calendarDegradationPerYearPct;
  const yearsToEol = annualDeg > 0 ? 20 / annualDeg : Infinity;
  return {
    usableEnergyKwh: usable,
    fullCyclesPerYear: cyclesPerYear,
    sohAfterYears: soh,
    yearsToEol80Pct: yearsToEol,
  };
}

/** Profil turbiny wiatrowej. */
export interface WindTurbineSpec {
  /** Moc znamionowa (kW). */
  readonly ratedPowerKw: number;
  /** Prędkość rozruchu cut-in (m/s, typ. 3.0). */
  readonly cutInSpeedMs: number;
  /** Prędkość znamionowa (m/s, typ. 12-13). */
  readonly ratedSpeedMs: number;
  /** Prędkość wyłączenia cut-out (m/s, typ. 25). */
  readonly cutOutSpeedMs: number;
  /** Typ generatora. */
  readonly generatorType: 'DFIG_T3' | 'FULL_CONVERTER_T4' | 'SCIG' | 'PMSG';
  /** Średnica rotora (m). */
  readonly rotorDiameterM: number;
  /** Wysokość piasty (m). */
  readonly hubHeightM: number;
}

/**
 * Aproksymacja krzywej mocy P(v) — kubiczna w zakresie cut-in → rated.
 */
export function computeWindTurbinePower(
  spec: WindTurbineSpec,
  windSpeedMs: number,
): number {
  if (windSpeedMs < spec.cutInSpeedMs) return 0;
  if (windSpeedMs >= spec.cutOutSpeedMs) return 0;
  if (windSpeedMs >= spec.ratedSpeedMs) return spec.ratedPowerKw;
  // Cubic curve between cut-in and rated.
  const factor =
    Math.pow(windSpeedMs - spec.cutInSpeedMs, 3) /
    Math.pow(spec.ratedSpeedMs - spec.cutInSpeedMs, 3);
  return spec.ratedPowerKw * factor;
}

/** Powierzchnia tarcza rotora (m²). */
export function computeRotorSweptArea(spec: WindTurbineSpec): number {
  return Math.PI * Math.pow(spec.rotorDiameterM / 2, 2);
}
