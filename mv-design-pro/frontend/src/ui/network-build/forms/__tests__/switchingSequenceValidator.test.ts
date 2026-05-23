import { describe, expect, it } from 'vitest';
import {
  attemptOperation,
  isSafeToConnect,
  isSafeForMaintenance,
  describeState,
  describeNextRecommendation,
  type ApparatusState,
} from '../switchingSequenceValidator';

const ALL_OPEN: ApparatusState = {
  disconnector: 'open',
  circuitBreaker: 'open',
  earthSwitch: 'open',
};

const CONNECTED: ApparatusState = {
  disconnector: 'closed',
  circuitBreaker: 'closed',
  earthSwitch: 'open',
};

const EARTHED: ApparatusState = {
  disconnector: 'open',
  circuitBreaker: 'open',
  earthSwitch: 'closed',
};

describe('attemptOperation — close_cb', () => {
  it('allowed gdy DS closed + ES open', () => {
    const ds_closed: ApparatusState = { ...ALL_OPEN, disconnector: 'closed' };
    const r = attemptOperation(ds_closed, { type: 'close_cb' });
    expect(r.isAllowed).toBe(true);
    expect(r.newState?.circuitBreaker).toBe('closed');
  });

  it('blokowane gdy DS open', () => {
    const r = attemptOperation(ALL_OPEN, { type: 'close_cb' });
    expect(r.isAllowed).toBe(false);
    expect(r.warningPL).toContain('odłącznika');
  });

  it('blokowane gdy ES closed (zwarcie do ziemi) z DS closed', () => {
    const dsAndEs: ApparatusState = {
      disconnector: 'closed',
      circuitBreaker: 'open',
      earthSwitch: 'closed',
    };
    const r = attemptOperation(dsAndEs, { type: 'close_cb' });
    expect(r.isAllowed).toBe(false);
    expect(r.warningPL).toContain('NIEBEZPIECZNE');
  });
});

describe('attemptOperation — open_cb', () => {
  it('zawsze allowed', () => {
    expect(attemptOperation(CONNECTED, { type: 'open_cb' }).isAllowed).toBe(true);
    expect(attemptOperation(ALL_OPEN, { type: 'open_cb' }).isAllowed).toBe(true);
  });
});

describe('attemptOperation — DS', () => {
  it('close_ds blokowane gdy CB closed', () => {
    const r = attemptOperation(CONNECTED, { type: 'close_ds' });
    expect(r.isAllowed).toBe(false);
    expect(r.warningPL).toContain('nie może');
  });

  it('open_ds blokowane gdy CB closed', () => {
    const r = attemptOperation(CONNECTED, { type: 'open_ds' });
    expect(r.isAllowed).toBe(false);
  });

  it('close_ds allowed gdy ES open + CB open', () => {
    const r = attemptOperation(ALL_OPEN, { type: 'close_ds' });
    expect(r.isAllowed).toBe(true);
  });
});

describe('attemptOperation — ES', () => {
  it('close_es wymaga CB i DS open', () => {
    const r1 = attemptOperation(ALL_OPEN, { type: 'close_es' });
    expect(r1.isAllowed).toBe(true);

    const r2 = attemptOperation(CONNECTED, { type: 'close_es' });
    expect(r2.isAllowed).toBe(false);
  });

  it('open_es zawsze allowed', () => {
    expect(attemptOperation(EARTHED, { type: 'open_es' }).isAllowed).toBe(true);
  });
});

describe('safety predicates', () => {
  it('isSafeToConnect', () => {
    expect(isSafeToConnect(CONNECTED)).toBe(true);
    expect(isSafeToConnect(ALL_OPEN)).toBe(false);
    expect(isSafeToConnect(EARTHED)).toBe(false);
  });

  it('isSafeForMaintenance', () => {
    expect(isSafeForMaintenance(EARTHED)).toBe(true);
    expect(isSafeForMaintenance(CONNECTED)).toBe(false);
  });
});

describe('describeState + describeNextRecommendation', () => {
  it('describeState format', () => {
    expect(describeState(CONNECTED)).toContain('CB zamknięty');
    expect(describeState(EARTHED)).toContain('ES zamknięty');
  });

  it('describeNextRecommendation pole pod napięciem', () => {
    expect(describeNextRecommendation(CONNECTED)).toContain('napięciem');
  });

  it('describeNextRecommendation konserwacja', () => {
    expect(describeNextRecommendation(EARTHED)).toContain('konserwacja');
  });

  it('describeNextRecommendation separacja', () => {
    expect(describeNextRecommendation(ALL_OPEN)).toContain('separacja');
  });
});
