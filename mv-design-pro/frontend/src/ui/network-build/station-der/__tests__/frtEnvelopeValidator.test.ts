import { describe, expect, it } from 'vitest';
import {
  validateFrtTrajectory,
  describeFrtViolation,
  STANDARD_LVRT_PSE,
  STANDARD_HVRT_PSE,
} from '../frtEnvelopeValidator';

describe('validateFrtTrajectory — LVRT', () => {
  it('trajektoria w envelope → passed', () => {
    const result = validateFrtTrajectory({
      trajectory: [
        { timeS: 0, voltagePu: 0.1 },
        { timeS: 0.5, voltagePu: 0.4 },
        { timeS: 3.0, voltagePu: 0.95 },
      ],
      lvrtEnvelope: STANDARD_LVRT_PSE,
    });
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('U poniżej envelope → violation LVRT', () => {
    const result = validateFrtTrajectory({
      trajectory: [
        { timeS: 0, voltagePu: 0.02 }, // < 0.05 limit
      ],
      lvrtEnvelope: STANDARD_LVRT_PSE,
    });
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].type).toBe('LVRT');
  });

  it('U w t=1.5s poniżej envelope → violation', () => {
    // t=1.5s → interpolacja między (0.50, 0.30) i (3.0, 0.85)
    // ratio = (1.5 - 0.5) / 2.5 = 0.4
    // limit = 0.30 + 0.4 × (0.85 - 0.30) = 0.30 + 0.22 = 0.52
    const result = validateFrtTrajectory({
      trajectory: [{ timeS: 1.5, voltagePu: 0.4 }],
      lvrtEnvelope: STANDARD_LVRT_PSE,
    });
    expect(result.passed).toBe(false);
    expect(result.violations[0].envelopeLimit).toBeCloseTo(0.52, 1);
  });
});

describe('validateFrtTrajectory — HVRT', () => {
  it('U powyżej HVRT envelope → violation', () => {
    const result = validateFrtTrajectory({
      trajectory: [{ timeS: 0.5, voltagePu: 1.25 }], // > 1.20 limit at 0.5s
      lvrtEnvelope: STANDARD_LVRT_PSE,
      hvrtEnvelope: STANDARD_HVRT_PSE,
    });
    expect(result.passed).toBe(false);
    expect(result.violations[0].type).toBe('HVRT');
  });

  it('HVRT bez envelope → tylko LVRT sprawdzane', () => {
    const result = validateFrtTrajectory({
      trajectory: [{ timeS: 0.5, voltagePu: 2.0 }], // very high U, ale brak HVRT
      lvrtEnvelope: STANDARD_LVRT_PSE,
    });
    expect(result.passed).toBe(true); // brak LVRT violation
  });
});

describe('envelopeLowerBoundAt', () => {
  it('extrapolacja przed pierwszym punktem', () => {
    const result = validateFrtTrajectory({
      trajectory: [],
      lvrtEnvelope: STANDARD_LVRT_PSE,
    });
    expect(result.envelopeLowerBoundAt(-1)).toBe(0.05);
  });

  it('extrapolacja po ostatnim punkcie', () => {
    const result = validateFrtTrajectory({
      trajectory: [],
      lvrtEnvelope: STANDARD_LVRT_PSE,
    });
    expect(result.envelopeLowerBoundAt(120)).toBe(0.95);
  });

  it('interpolacja liniowa między punktami', () => {
    const result = validateFrtTrajectory({
      trajectory: [],
      lvrtEnvelope: STANDARD_LVRT_PSE,
    });
    // t=0.325s = halfway between (0.15, 0.05) and (0.5, 0.30)
    // → 0.05 + 0.5 × (0.30 - 0.05) = 0.175
    const value = result.envelopeLowerBoundAt(0.325);
    expect(value).toBeCloseTo(0.175, 2);
  });
});

describe('describeFrtViolation', () => {
  it('LVRT description w PL', () => {
    const desc = describeFrtViolation({
      timeS: 0.5,
      voltagePu: 0.2,
      envelopeLimit: 0.30,
      type: 'LVRT',
    });
    expect(desc).toContain('LVRT');
    expect(desc).toContain('spadek');
    expect(desc).toContain('t=0.500');
  });

  it('HVRT description w PL', () => {
    const desc = describeFrtViolation({
      timeS: 0.1,
      voltagePu: 1.4,
      envelopeLimit: 1.30,
      type: 'HVRT',
    });
    expect(desc).toContain('HVRT');
    expect(desc).toContain('wzrost');
  });
});

describe('STANDARD envelopes', () => {
  it('LVRT PSE ma 5 punktów', () => {
    expect(STANDARD_LVRT_PSE).toHaveLength(5);
    expect(STANDARD_LVRT_PSE[0].timeS).toBe(0);
    expect(STANDARD_LVRT_PSE[STANDARD_LVRT_PSE.length - 1].voltagePu).toBe(0.95);
  });

  it('HVRT PSE ma 4 punkty', () => {
    expect(STANDARD_HVRT_PSE).toHaveLength(4);
    expect(STANDARD_HVRT_PSE[0].voltagePu).toBe(1.30);
  });
});
