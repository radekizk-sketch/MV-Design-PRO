/**
 * inverterModeHelper — tryby pracy inwertera DER (Etap 5/8 z planu).
 *
 * NC RfG Art. 21-23 — control modes inwertera:
 * - cos φ const — stała wartość
 * - cos φ(P) — zależna od mocy czynnej
 * - Q const — stała moc bierna
 * - Q(U) — Volt-Var (zależna od napięcia)
 * - LFSM-O — Limited Frequency Sensitive Mode Over-frequency
 * - LFSM-U — Limited Frequency Sensitive Mode Under-frequency
 */

export type InverterControlMode = 'cos_phi_const' | 'cos_phi_of_p' | 'q_const' | 'q_of_u' | 'p_max';
export type FrequencyMode = 'normal' | 'lfsm_o' | 'lfsm_u' | 'fsm';

export interface InverterModeConfig {
  controlMode: InverterControlMode;
  fixedCosPhi?: number;
  fixedQReactiveMvar?: number;
  cosOfPPoints?: Array<{ pPu: number; cosPhi: number }>;
  qOfUPoints?: Array<{ uPu: number; qPu: number }>;
  frequencyMode: FrequencyMode;
}

export interface InverterValidationResult {
  isValid: boolean;
  issues: string[];
  recommendations: string[];
}

export function validateInverterMode(config: InverterModeConfig): InverterValidationResult {
  const issues: string[] = [];
  const recommendations: string[] = [];

  switch (config.controlMode) {
    case 'cos_phi_const':
      if (config.fixedCosPhi === undefined) {
        issues.push('Tryb cos φ const wymaga zdefiniowanego cos φ.');
      } else if (config.fixedCosPhi < 0.95 || config.fixedCosPhi > 1.0) {
        issues.push(
          `cos φ = ${config.fixedCosPhi} poza zakresem [0.95, 1.0] (NC RfG Art. 21).`,
        );
      }
      break;

    case 'cos_phi_of_p':
      if (!config.cosOfPPoints || config.cosOfPPoints.length < 2) {
        issues.push('Krzywa cos φ(P) wymaga min 2 punktów.');
      } else {
        // Punkty muszą być posortowane po pPu
        const sorted = [...config.cosOfPPoints].sort((a, b) => a.pPu - b.pPu);
        if (sorted[0].pPu !== config.cosOfPPoints[0].pPu) {
          recommendations.push('Punkty cos φ(P) powinny być posortowane rosnąco po P.');
        }
        if (sorted[0].pPu < 0 || sorted[sorted.length - 1].pPu > 1) {
          issues.push(`Zakres P/P_n musi być [0, 1]. Obecnie: [${sorted[0].pPu}, ${sorted[sorted.length - 1].pPu}].`);
        }
        for (const point of sorted) {
          if (Math.abs(point.cosPhi) < 0.85 || Math.abs(point.cosPhi) > 1.0) {
            issues.push(`Wartość cos φ = ${point.cosPhi} w punkcie P/P_n=${point.pPu} poza dopuszczalnym zakresem [0.85, 1.0].`);
          }
        }
      }
      break;

    case 'q_const':
      if (config.fixedQReactiveMvar === undefined) {
        issues.push('Tryb Q const wymaga zdefiniowanej wartości Q [Mvar].');
      }
      break;

    case 'q_of_u':
      if (!config.qOfUPoints || config.qOfUPoints.length < 3) {
        issues.push('Krzywa Q(U) wymaga min 3 punktów dla Volt-Var control.');
      } else {
        // U range musi pokrywać [0.9, 1.1]
        const sorted = [...config.qOfUPoints].sort((a, b) => a.uPu - b.uPu);
        if (sorted[0].uPu > 0.9) {
          issues.push(`Krzywa Q(U) musi zaczynać się przy U ≤ 0.9 p.u. Obecnie: ${sorted[0].uPu}.`);
        }
        if (sorted[sorted.length - 1].uPu < 1.1) {
          issues.push(`Krzywa Q(U) musi kończyć się przy U ≥ 1.1 p.u. Obecnie: ${sorted[sorted.length - 1].uPu}.`);
        }
      }
      break;

    case 'p_max':
      // PV/BESS tryb maxymalizacji mocy czynnej
      break;
  }

  if (config.frequencyMode === 'fsm') {
    recommendations.push('Tryb FSM (Frequency Sensitive Mode) tylko dla bloków typu C/D.');
  }

  return {
    isValid: issues.length === 0,
    issues,
    recommendations,
  };
}

export function describeControlMode(mode: InverterControlMode): string {
  return {
    cos_phi_const: 'Stały współczynnik mocy cos φ',
    cos_phi_of_p: 'cos φ zależny od mocy czynnej (NC RfG Art. 21)',
    q_const: 'Stała moc bierna Q',
    q_of_u: 'Q(U) — Volt-Var control (NC RfG Art. 21)',
    p_max: 'Maksymalizacja mocy czynnej',
  }[mode];
}

export function describeFrequencyMode(mode: FrequencyMode): string {
  return {
    normal: 'Praca normalna bez regulacji f',
    lfsm_o: 'LFSM-O — Limited FSM Over-frequency (NC RfG Art. 13)',
    lfsm_u: 'LFSM-U — Limited FSM Under-frequency (NC RfG Art. 13)',
    fsm: 'FSM — Frequency Sensitive Mode (NC RfG Art. 15)',
  }[mode];
}
