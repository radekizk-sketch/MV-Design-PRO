/**
 * antiIslandingValidator — walidacja zabezpieczenia anti-islanding (Etap 5/8 z planu).
 *
 * NC RfG + IEC 62116 — wymagania dla DER < 1 MW (typ A) i ≥ 1 MW (typ B+).
 *
 * Wymagane funkcje zabezpieczenia:
 * - 27 — under-voltage
 * - 59 — over-voltage
 * - 81U — under-frequency
 * - 81O — over-frequency
 * - 81R/ROCOF — rate of change of frequency
 *
 * Typowe ustawienia (PSE/Energa/Tauron/Enea/PGE):
 *   - 27: U < 0.85 p.u., t = 0.2 s
 *   - 59: U > 1.10 p.u., t = 0.2 s
 *   - 81U: f < 47 Hz, t = 0.2 s
 *   - 81O: f > 51 Hz, t = 0.2 s
 *   - ROCOF: df/dt > 2.5 Hz/s, t = 0.1 s
 */

export type DerType = 'PV' | 'BESS' | 'FW' | 'CHP';
export type ProtectionClass = 'typ_a' | 'typ_b' | 'typ_c' | 'typ_d';

export interface AntiIslandingSettings {
  underVoltagePu: number;
  underVoltageTimeS: number;
  overVoltagePu: number;
  overVoltageTimeS: number;
  underFrequencyHz: number;
  underFrequencyTimeS: number;
  overFrequencyHz: number;
  overFrequencyTimeS: number;
  rocofHzPerS: number;
  rocofTimeS: number;
}

export interface AntiIslandingValidationInput {
  derType: DerType;
  installedPowerKva: number;
  settings: AntiIslandingSettings;
  systemFrequencyHz?: number;
}

export type AiVerdict = 'compliant' | 'warning' | 'non_compliant';

export interface AntiIslandingValidationResult {
  verdict: AiVerdict;
  protectionClass: ProtectionClass;
  issues: string[];
  passedChecks: string[];
  recommendation?: string;
}

export function classifyDerProtection(installedPowerKva: number): ProtectionClass {
  if (installedPowerKva < 800) return 'typ_a';
  if (installedPowerKva < 1000) return 'typ_b';
  if (installedPowerKva < 50000) return 'typ_c';
  return 'typ_d';
}

const SETTINGS_TYP_A: AntiIslandingSettings = {
  underVoltagePu: 0.85,
  underVoltageTimeS: 0.2,
  overVoltagePu: 1.10,
  overVoltageTimeS: 0.2,
  underFrequencyHz: 47.0,
  underFrequencyTimeS: 0.2,
  overFrequencyHz: 51.0,
  overFrequencyTimeS: 0.2,
  rocofHzPerS: 2.5,
  rocofTimeS: 0.1,
};

export function getStandardSettings(_protectionClass: ProtectionClass): AntiIslandingSettings {
  // Typ A/B/C/D mają zbliżone wymagania w PL dla podstawowych funkcji
  // Dla typu D dodatkowo wymagane RfG Article 13/14 (LFSM-U/O)
  return { ...SETTINGS_TYP_A };
}

export function validateAntiIslanding({
  derType,
  installedPowerKva,
  settings,
  systemFrequencyHz = 50,
}: AntiIslandingValidationInput): AntiIslandingValidationResult {
  const protectionClass = classifyDerProtection(installedPowerKva);
  const issues: string[] = [];
  const passedChecks: string[] = [];

  // Voltage protection
  if (settings.underVoltagePu < 0.5 || settings.underVoltagePu > 0.95) {
    issues.push(
      `Ustawienie 27 (under-voltage) ${settings.underVoltagePu} p.u. poza zalecanym zakresem 0.5-0.95.`,
    );
  } else {
    passedChecks.push('27 (under-voltage)');
  }

  if (settings.overVoltagePu < 1.05 || settings.overVoltagePu > 1.20) {
    issues.push(
      `Ustawienie 59 (over-voltage) ${settings.overVoltagePu} p.u. poza zalecanym zakresem 1.05-1.20.`,
    );
  } else {
    passedChecks.push('59 (over-voltage)');
  }

  // Frequency protection
  const fLowLimit = systemFrequencyHz - 5; // 45 Hz dla 50 Hz
  const fHighLimit = systemFrequencyHz + 3; // 53 Hz dla 50 Hz
  if (settings.underFrequencyHz < fLowLimit || settings.underFrequencyHz > systemFrequencyHz - 1) {
    issues.push(
      `Ustawienie 81U (under-frequency) ${settings.underFrequencyHz} Hz poza zalecanym zakresem ${fLowLimit}-${systemFrequencyHz - 1} Hz.`,
    );
  } else {
    passedChecks.push('81U (under-frequency)');
  }

  if (settings.overFrequencyHz > fHighLimit || settings.overFrequencyHz < systemFrequencyHz + 0.5) {
    issues.push(
      `Ustawienie 81O (over-frequency) ${settings.overFrequencyHz} Hz poza zalecanym zakresem ${systemFrequencyHz + 0.5}-${fHighLimit} Hz.`,
    );
  } else {
    passedChecks.push('81O (over-frequency)');
  }

  // ROCOF — typ A/B mogą mieć higher threshold, typ C/D wymagają ścisłej zgodności
  const rocofMin = protectionClass === 'typ_a' ? 1.0 : 1.5;
  const rocofMax = 5.0;
  if (settings.rocofHzPerS < rocofMin || settings.rocofHzPerS > rocofMax) {
    issues.push(
      `Ustawienie ROCOF (df/dt) ${settings.rocofHzPerS} Hz/s poza zalecanym zakresem ${rocofMin}-${rocofMax} Hz/s.`,
    );
  } else {
    passedChecks.push('81R/ROCOF');
  }

  // Time settings ≤ 0.2 s dla większości
  const timeChecks: Array<[keyof AntiIslandingSettings, string]> = [
    ['underVoltageTimeS', '27'],
    ['overVoltageTimeS', '59'],
    ['underFrequencyTimeS', '81U'],
    ['overFrequencyTimeS', '81O'],
  ];
  for (const [key, label] of timeChecks) {
    if ((settings[key] as number) > 0.5) {
      issues.push(`Czas zadziałania ${label} = ${settings[key]} s > 0.5 s. Może powodować zbyt późne odłączenie.`);
    }
  }

  // Verdict
  let verdict: AiVerdict;
  if (issues.length === 0) {
    verdict = 'compliant';
  } else if (passedChecks.length >= 4) {
    verdict = 'warning';
  } else {
    verdict = 'non_compliant';
  }

  let recommendation: string | undefined;
  if (verdict !== 'compliant') {
    recommendation = `Skoryguj ustawienia per NC RfG i typ ${protectionClass} dla DER ${derType} ${installedPowerKva} kVA.`;
  }

  return {
    verdict,
    protectionClass,
    issues,
    passedChecks,
    recommendation,
  };
}
