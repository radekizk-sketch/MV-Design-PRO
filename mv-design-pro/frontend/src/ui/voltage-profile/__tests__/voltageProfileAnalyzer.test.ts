import { describe, expect, it } from 'vitest';
import {
  buildFeederProfile,
  classifyFeederProfile,
  compareFeederProfiles,
} from '../voltageProfileAnalyzer';

const busVoltages = [
  { busRef: 'bus-source', busName: 'GPZ', distanceKm: 0, voltagePu: 1.0, voltageKv: 15 },
  { busRef: 'bus-1', busName: 'Stacja A', distanceKm: 2.5, voltagePu: 0.98, voltageKv: 14.7 },
  { busRef: 'bus-2', busName: 'Stacja B', distanceKm: 5.0, voltagePu: 0.96, voltageKv: 14.4 },
  { busRef: 'bus-end', busName: 'Stacja C', distanceKm: 8.0, voltagePu: 0.93, voltageKv: 13.95 },
];

describe('buildFeederProfile', () => {
  it('liczy total length + worst voltage', () => {
    const profile = buildFeederProfile('feeder-1', 'bus-source', busVoltages);
    expect(profile.totalLengthKm).toBe(8.0);
    expect(profile.worstVoltagePu).toBe(0.93);
    expect(profile.worstVoltageBusRef).toBe('bus-end');
  });

  it('liczy average voltage', () => {
    const profile = buildFeederProfile('feeder-1', 'bus-source', busVoltages);
    expect(profile.averageVoltagePu).toBeCloseTo(0.9675, 3);
  });

  it('maxDropPercent = % spadku od source', () => {
    const profile = buildFeederProfile('feeder-1', 'bus-source', busVoltages);
    expect(profile.maxDropPercent).toBeCloseTo(7.0, 1);
  });

  it('sortuje po distance', () => {
    const unsorted = [...busVoltages].reverse();
    const profile = buildFeederProfile('feeder-1', 'bus-source', unsorted);
    expect(profile.busVoltages[0].distanceKm).toBe(0);
    expect(profile.busVoltages[profile.busVoltages.length - 1].distanceKm).toBe(8.0);
  });

  it('puste → safe defaults', () => {
    const profile = buildFeederProfile('f', 'source', []);
    expect(profile.totalLengthKm).toBe(0);
    expect(profile.busVoltages).toHaveLength(0);
  });
});

describe('classifyFeederProfile', () => {
  it('ok gdy worst ≥ 0.95', () => {
    const profile = buildFeederProfile('f', 's', busVoltages.slice(0, 2));
    const r = classifyFeederProfile(profile);
    expect(r.status).toBe('ok');
  });

  it('warning gdy 0.90 ≤ worst < 0.95', () => {
    const profile = buildFeederProfile('f', 's', busVoltages);
    const r = classifyFeederProfile(profile);
    expect(r.status).toBe('warning');
  });

  it('critical gdy worst < 0.90', () => {
    const profile = buildFeederProfile('f', 's', [
      ...busVoltages,
      { busRef: 'bus-bad', busName: 'X', distanceKm: 12, voltagePu: 0.85, voltageKv: 12.75 },
    ]);
    const r = classifyFeederProfile(profile);
    expect(r.status).toBe('critical');
    expect(r.message).toContain('PN-EN 50160');
  });
});

describe('compareFeederProfiles', () => {
  it('liczy deltas między dwoma profilami', () => {
    const profileA = buildFeederProfile('f', 's', busVoltages);
    const improvedVoltages = busVoltages.map((b) => ({ ...b, voltagePu: b.voltagePu + 0.01 }));
    const profileB = buildFeederProfile('f', 's', improvedVoltages);

    const cmp = compareFeederProfiles(profileA, profileB);
    expect(cmp.improvedBuses.length).toBeGreaterThan(0);
    expect(cmp.degradedBuses).toHaveLength(0);
    expect(cmp.averageDeltaPu).toBeCloseTo(0.01, 2);
  });

  it('detekcja degradacji', () => {
    const profileA = buildFeederProfile('f', 's', busVoltages);
    const degradedVoltages = busVoltages.map((b) => ({ ...b, voltagePu: b.voltagePu - 0.02 }));
    const profileB = buildFeederProfile('f', 's', degradedVoltages);

    const cmp = compareFeederProfiles(profileA, profileB);
    expect(cmp.degradedBuses.length).toBeGreaterThan(0);
  });
});
