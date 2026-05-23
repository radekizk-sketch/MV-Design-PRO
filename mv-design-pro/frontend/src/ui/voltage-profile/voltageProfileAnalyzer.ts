/**
 * voltageProfileAnalyzer — analiza profilu napięcia wzdłuż ciągu (Etap 11 z planu).
 *
 * "Voltage Profile: feeder selector z preview SLD podświetlającym wybrany ciąg"
 *
 * Pure helpers do agregacji punktów napięcia po wzdłużnej trasie.
 */

export interface BusVoltagePoint {
  busRef: string;
  busName: string;
  distanceKm: number;
  voltagePu: number;
  voltageKv: number;
}

export interface FeederProfile {
  feederRef: string;
  sourceBusRef: string;
  endBusRef: string;
  totalLengthKm: number;
  busVoltages: BusVoltagePoint[];
  worstVoltagePu: number;
  worstVoltageBusRef: string;
  averageVoltagePu: number;
  maxDropPercent: number;
}

export function buildFeederProfile(
  feederRef: string,
  sourceBusRef: string,
  busVoltages: BusVoltagePoint[],
): FeederProfile {
  if (busVoltages.length === 0) {
    return {
      feederRef,
      sourceBusRef,
      endBusRef: sourceBusRef,
      totalLengthKm: 0,
      busVoltages: [],
      worstVoltagePu: 0,
      worstVoltageBusRef: sourceBusRef,
      averageVoltagePu: 0,
      maxDropPercent: 0,
    };
  }

  const sorted = [...busVoltages].sort((a, b) => a.distanceKm - b.distanceKm);
  const totalLengthKm = sorted[sorted.length - 1].distanceKm;
  const endBusRef = sorted[sorted.length - 1].busRef;

  let worstVoltagePu = Number.POSITIVE_INFINITY;
  let worstVoltageBusRef = sorted[0].busRef;
  let sum = 0;
  for (const point of sorted) {
    if (point.voltagePu < worstVoltagePu) {
      worstVoltagePu = point.voltagePu;
      worstVoltageBusRef = point.busRef;
    }
    sum += point.voltagePu;
  }
  const averageVoltagePu = sum / sorted.length;

  const sourceVoltagePu = sorted[0].voltagePu;
  const maxDropPercent = sourceVoltagePu > 0
    ? Math.round(((sourceVoltagePu - worstVoltagePu) / sourceVoltagePu) * 1000) / 10
    : 0;

  return {
    feederRef,
    sourceBusRef,
    endBusRef,
    totalLengthKm,
    busVoltages: sorted,
    worstVoltagePu,
    worstVoltageBusRef,
    averageVoltagePu,
    maxDropPercent,
  };
}

export function classifyFeederProfile(profile: FeederProfile): {
  status: 'ok' | 'warning' | 'critical';
  message: string;
} {
  if (profile.worstVoltagePu < 0.90) {
    return {
      status: 'critical',
      message: `Krytyczny spadek napięcia: ${(profile.worstVoltagePu * 100).toFixed(1)}% na szynie ${profile.worstVoltageBusRef} (limit -10% wg PN-EN 50160).`,
    };
  }
  if (profile.worstVoltagePu < 0.95) {
    return {
      status: 'warning',
      message: `Spadek napięcia: ${(profile.worstVoltagePu * 100).toFixed(1)}% na szynie ${profile.worstVoltageBusRef}.`,
    };
  }
  return {
    status: 'ok',
    message: `Profil w normie: min ${(profile.worstVoltagePu * 100).toFixed(1)}%, średnia ${(profile.averageVoltagePu * 100).toFixed(1)}%.`,
  };
}

export function compareFeederProfiles(
  profileA: FeederProfile,
  profileB: FeederProfile,
): {
  averageDeltaPu: number;
  worstDeltaPu: number;
  improvedBuses: string[];
  degradedBuses: string[];
} {
  const busMapA = new Map(profileA.busVoltages.map((b) => [b.busRef, b.voltagePu]));
  const improvedBuses: string[] = [];
  const degradedBuses: string[] = [];
  let totalDelta = 0;
  let worstDelta = 0;
  let count = 0;

  for (const pointB of profileB.busVoltages) {
    const voltageA = busMapA.get(pointB.busRef);
    if (voltageA === undefined) continue;
    const delta = pointB.voltagePu - voltageA;
    totalDelta += delta;
    if (Math.abs(delta) > Math.abs(worstDelta)) {
      worstDelta = delta;
    }
    if (delta > 0.005) improvedBuses.push(pointB.busRef);
    else if (delta < -0.005) degradedBuses.push(pointB.busRef);
    count++;
  }

  return {
    averageDeltaPu: count > 0 ? totalDelta / count : 0,
    worstDeltaPu: worstDelta,
    improvedBuses,
    degradedBuses,
  };
}
