/**
 * earthingSystemHelper — pomocnik konfiguracji systemu uziemienia (Etap 7 z planu).
 *
 * "Earthing system UI: typ TN/IT/TT/Petersen + R0/X0 + cewka rezonansowa wizualnie na SLD"
 *
 * Typy uziemienia:
 * - TN-S, TN-C, TN-C-S — system z bezpośrednim uziemieniem (nN)
 * - IT — system izolowany (SN dla sieci zasilanych z generatorów własnych)
 * - TT — bezpośrednie uziemienie odbiorcy
 * - Petersen — system rezonansowo uziemiony (cewka Petersena dla SN)
 * - Resistor — uziemienie przez rezystor (R_n, dla SN)
 *
 * Normy: PN-EN 50522 (uziemienie systemu), PN-HD 60364-1 (klasyfikacja).
 */

export type EarthingType = 'TN-S' | 'TN-C' | 'TN-C-S' | 'IT' | 'TT' | 'Petersen' | 'Resistor' | 'Solid';

export interface EarthingConfig {
  type: EarthingType;
  voltageLevel: 'SN' | 'WN' | 'nN';
  rgOhm?: number;
  xgOhm?: number;
  petersenInductanceMh?: number;
  resistorOhm?: number;
  zeroSeqImpedance?: { r0: number; x0: number };
}

export interface EarthingValidationResult {
  isValid: boolean;
  issues: string[];
  recommendation?: string;
  faultCurrentA?: number;
}

const SN_VOLTAGES = new Set([6, 10, 15, 20, 30]);
const NN_VOLTAGES = new Set([0.4, 0.5, 0.69]);

export function validateEarthingConfig(
  config: EarthingConfig,
  systemVoltageKv: number,
): EarthingValidationResult {
  const issues: string[] = [];

  // Sprawdź zgodność typu z poziomem napięcia
  if (config.voltageLevel === 'nN') {
    if (!['TN-S', 'TN-C', 'TN-C-S', 'IT', 'TT'].includes(config.type)) {
      issues.push(`Typ ${config.type} nieprawidłowy dla sieci nN (oczekiwane TN-S/TN-C/TN-C-S/IT/TT).`);
    }
    if (!NN_VOLTAGES.has(systemVoltageKv)) {
      issues.push(`Napięcie ${systemVoltageKv} kV nietypowe dla sieci nN (oczekiwane 0.4/0.5/0.69 kV).`);
    }
  } else if (config.voltageLevel === 'SN') {
    if (!['IT', 'Petersen', 'Resistor', 'Solid'].includes(config.type)) {
      issues.push(`Typ ${config.type} nieprawidłowy dla sieci SN (oczekiwane IT/Petersen/Resistor/Solid).`);
    }
    if (!SN_VOLTAGES.has(systemVoltageKv)) {
      issues.push(`Napięcie ${systemVoltageKv} kV nietypowe dla sieci SN.`);
    }
  }

  // Sprawdź parametry per typ
  if (config.type === 'Resistor') {
    if (!config.resistorOhm || config.resistorOhm <= 0) {
      issues.push('Brak wartości rezystora uziemiającego (R_n).');
    } else if (config.resistorOhm < 5 || config.resistorOhm > 100) {
      issues.push(`R_n = ${config.resistorOhm} Ω poza typowym zakresem 5-100 Ω.`);
    }
  }

  if (config.type === 'Petersen') {
    if (!config.petersenInductanceMh || config.petersenInductanceMh <= 0) {
      issues.push('Brak wartości indukcyjności cewki Petersena.');
    }
  }

  // Prąd doziemny
  let faultCurrentA: number | undefined;
  if (config.type === 'Resistor' && config.resistorOhm) {
    const uPhaseV = (systemVoltageKv * 1000) / Math.sqrt(3);
    faultCurrentA = Math.round(uPhaseV / config.resistorOhm);
  } else if (config.type === 'Solid') {
    faultCurrentA = config.zeroSeqImpedance
      ? Math.round(
          ((systemVoltageKv * 1000) / Math.sqrt(3))
          / Math.sqrt(config.zeroSeqImpedance.r0 ** 2 + config.zeroSeqImpedance.x0 ** 2),
        )
      : undefined;
  } else if (config.type === 'IT' || config.type === 'Petersen') {
    faultCurrentA = config.petersenInductanceMh ? 10 : 5;
  }

  const isValid = issues.length === 0;
  let recommendation: string | undefined;
  if (!isValid) {
    if (issues.some((i) => i.includes('Brak wartości'))) {
      recommendation = `Uzupełnij parametry uziemienia (${config.type}) zgodnie z PN-EN 50522.`;
    } else if (issues.some((i) => i.includes('nieprawidłowy'))) {
      recommendation = 'Wybierz typ uziemienia zgodny z poziomem napięcia sieci.';
    }
  }

  return { isValid, issues, recommendation, faultCurrentA };
}

export function describeEarthingType(type: EarthingType): string {
  const descriptions: Record<EarthingType, string> = {
    'TN-S': 'TN-S — przewody PE i N rozdzielone w całej sieci (nN).',
    'TN-C': 'TN-C — wspólny przewód PEN dla PE+N (nN).',
    'TN-C-S': 'TN-C-S — PEN dzielony na PE i N w rozdzielnicy (nN).',
    IT: 'IT — system izolowany od ziemi, kontrola izolacji obowiązkowa.',
    TT: 'TT — bezpośrednie uziemienie odbiorcy, niezależne od źródła.',
    Petersen: 'Cewka Petersena — system rezonansowo uziemiony (SN). Kompensacja prądu doziemnego.',
    Resistor: 'Uziemienie przez rezystor (R_n) — ograniczenie prądu doziemnego (SN).',
    Solid: 'Bezpośrednie uziemienie (Solid) — najprostsze, najwyższy prąd doziemny.',
  };
  return descriptions[type];
}
