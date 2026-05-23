/**
 * frtEnvelopeValidator — walidacja trajektorii U(t) na FRT envelope (Etap 8 z planu).
 *
 * "Real-time walidacja: trajektoria U(t) z PF/SC na FRT envelope (PASS/FAIL)"
 *
 * NC RfG Annex II — FRT (Fault Ride Through) wymaga że DER pozostaje przyłączony
 * podczas zaniku napięcia zgodnie z określonym envelope.
 *
 * Typowy LVRT envelope (PSE):
 *   t=0      U_min = 0.05 p.u.
 *   t=0.15s  U_min = 0.05 p.u.
 *   t=0.50s  U_min = 0.30 p.u.
 *   t=3.0s   U_min = 0.85 p.u.
 *   t > 3s   U_min = 0.95 p.u.
 *
 * HVRT (over-voltage ride through):
 *   t < 0.1s  U_max = 1.30 p.u.
 *   t > 0.1s  U_max = 1.20 p.u.
 *   t > 60s   U_max = 1.10 p.u.
 */

export interface VoltageTrajectoryPoint {
  timeS: number;
  voltagePu: number;
}

export interface FrtEnvelopePoint {
  timeS: number;
  voltagePu: number;
}

export interface FrtValidationInput {
  trajectory: VoltageTrajectoryPoint[];
  lvrtEnvelope: FrtEnvelopePoint[];
  hvrtEnvelope?: FrtEnvelopePoint[];
}

export interface FrtViolation {
  timeS: number;
  voltagePu: number;
  envelopeLimit: number;
  type: 'LVRT' | 'HVRT';
}

export interface FrtValidationResult {
  passed: boolean;
  violations: FrtViolation[];
  envelopeLowerBoundAt: (timeS: number) => number;
  envelopeUpperBoundAt: (timeS: number) => number;
}

export const STANDARD_LVRT_PSE: FrtEnvelopePoint[] = [
  { timeS: 0, voltagePu: 0.05 },
  { timeS: 0.15, voltagePu: 0.05 },
  { timeS: 0.50, voltagePu: 0.30 },
  { timeS: 3.0, voltagePu: 0.85 },
  { timeS: 60.0, voltagePu: 0.95 },
];

export const STANDARD_HVRT_PSE: FrtEnvelopePoint[] = [
  { timeS: 0, voltagePu: 1.30 },
  { timeS: 0.1, voltagePu: 1.30 },
  { timeS: 0.5, voltagePu: 1.20 },
  { timeS: 60.0, voltagePu: 1.10 },
];

function interpolateEnvelope(envelope: FrtEnvelopePoint[], timeS: number): number {
  if (envelope.length === 0) return 0;
  if (timeS <= envelope[0].timeS) return envelope[0].voltagePu;
  if (timeS >= envelope[envelope.length - 1].timeS) {
    return envelope[envelope.length - 1].voltagePu;
  }
  for (let i = 0; i < envelope.length - 1; i++) {
    const p1 = envelope[i];
    const p2 = envelope[i + 1];
    if (timeS >= p1.timeS && timeS <= p2.timeS) {
      const ratio = (timeS - p1.timeS) / (p2.timeS - p1.timeS);
      return p1.voltagePu + (p2.voltagePu - p1.voltagePu) * ratio;
    }
  }
  return envelope[envelope.length - 1].voltagePu;
}

export function validateFrtTrajectory({
  trajectory,
  lvrtEnvelope,
  hvrtEnvelope,
}: FrtValidationInput): FrtValidationResult {
  const violations: FrtViolation[] = [];

  for (const point of trajectory) {
    const lowerBound = interpolateEnvelope(lvrtEnvelope, point.timeS);
    if (point.voltagePu < lowerBound) {
      violations.push({
        timeS: point.timeS,
        voltagePu: point.voltagePu,
        envelopeLimit: lowerBound,
        type: 'LVRT',
      });
    }
    if (hvrtEnvelope) {
      const upperBound = interpolateEnvelope(hvrtEnvelope, point.timeS);
      if (point.voltagePu > upperBound) {
        violations.push({
          timeS: point.timeS,
          voltagePu: point.voltagePu,
          envelopeLimit: upperBound,
          type: 'HVRT',
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    envelopeLowerBoundAt: (t) => interpolateEnvelope(lvrtEnvelope, t),
    envelopeUpperBoundAt: (t) =>
      hvrtEnvelope ? interpolateEnvelope(hvrtEnvelope, t) : Infinity,
  };
}

export function describeFrtViolation(violation: FrtViolation): string {
  const direction = violation.type === 'LVRT' ? 'spadek' : 'wzrost';
  return `${violation.type} ${direction} przy t=${violation.timeS.toFixed(3)} s: U=${violation.voltagePu.toFixed(2)} p.u. (limit ${violation.envelopeLimit.toFixed(2)} p.u.)`;
}
