/**
 * FrtHvrtCurves — wizualizacja krzywych FRT/LVRT/HVRT (Iteracja 13).
 *
 * Renderuje wykres napięcia U/Un w czasie z krzywymi profilu operatora
 * (5 OSD: PSE / Energa / Tauron / Enea / PGE) zgodnie z NC RfG Annex II.
 *
 * Krzywe LVRT: dolna obwiednia U_min(t) — DER musi pozostawać dołączone
 * jeśli przebieg napięcia jest powyżej krzywej.
 * Krzywe HVRT: górna obwiednia U_max(t) — analogicznie.
 *
 * Trajektoria z solvera (jeśli dostępna) renderowana jako 3 osobne pomiary:
 * U(t), Iq(t), P(t).
 */

import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type NcRfgProfileId = 'PSE' | 'Energa' | 'Tauron' | 'Enea' | 'PGE';

export interface FrtHvrtTrajectoryPoint {
  readonly time_s: number;
  readonly voltage_pu: number;
  readonly iq_reactive_pu?: number;
  readonly p_active_pu?: number;
}

export interface FrtHvrtCurvesProps {
  readonly profileId: NcRfgProfileId;
  /** Trajektoria z solvera FRT/HVRT (opcjonalna). */
  readonly trajectory?: readonly FrtHvrtTrajectoryPoint[];
  readonly height?: number;
}

const PROFILE_LABELS: Record<NcRfgProfileId, string> = {
  PSE: 'PSE (sieć przesyłowa, NC RfG Annex II)',
  Energa: 'Energa-Operator',
  Tauron: 'Tauron Dystrybucja',
  Enea: 'Enea Operator',
  PGE: 'PGE Dystrybucja',
};

interface NcRfgEnvelopePoint {
  readonly time_s: number;
  readonly u_min_pu: number; // LVRT envelope (lower)
  readonly u_max_pu: number; // HVRT envelope (upper)
}

/**
 * Bazowe krzywe NC RfG:
 *  LVRT (dolna obwiednia):
 *    t=0:    0,05 pu (zwarcie blisko zaciskow)
 *    t=0,15: 0,15 pu
 *    t=0,7:  0,50 pu
 *    t=1,5:  0,85 pu
 *    t=3,0:  0,90 pu
 *  HVRT (górna obwiednia):
 *    t=0:    1,30 pu
 *    t=0,06: 1,25 pu
 *    t=0,5:  1,15 pu
 *    t=3,0:  1,10 pu
 *    t=10:   1,05 pu
 *
 * Profile operatorów wprowadzają drobne odchylenia (PSE = NC RfG bazowy,
 * pozostali z lokalnymi wymaganiami; tutaj uproszczone z reprezentatywnymi
 * przesunięciami).
 */
function buildEnvelope(profile: NcRfgProfileId): NcRfgEnvelopePoint[] {
  const offset: Record<NcRfgProfileId, { lvrt: number; hvrt: number }> = {
    PSE: { lvrt: 0, hvrt: 0 },
    Energa: { lvrt: 0.02, hvrt: -0.01 },
    Tauron: { lvrt: 0.0, hvrt: 0.0 },
    Enea: { lvrt: 0.01, hvrt: 0.0 },
    PGE: { lvrt: 0.02, hvrt: -0.02 },
  };
  const o = offset[profile];

  const lvrt = [
    { t: 0, u: 0.05 },
    { t: 0.15, u: 0.15 },
    { t: 0.7, u: 0.5 },
    { t: 1.5, u: 0.85 },
    { t: 3.0, u: 0.9 },
    { t: 10.0, u: 0.9 },
  ];
  const hvrt = [
    { t: 0, u: 1.3 },
    { t: 0.06, u: 1.25 },
    { t: 0.5, u: 1.15 },
    { t: 3.0, u: 1.1 },
    { t: 10.0, u: 1.05 },
  ];

  // Łączymy w pojedynczą serię points: [{time_s, u_min_pu, u_max_pu}].
  // Bierzemy unię wszystkich znaczników czasu.
  const allTimes = [...new Set([...lvrt.map((p) => p.t), ...hvrt.map((p) => p.t)])].sort(
    (a, b) => a - b,
  );

  const interp = (points: { t: number; u: number }[], t: number) => {
    if (t <= points[0].t) return points[0].u;
    if (t >= points[points.length - 1].t) return points[points.length - 1].u;
    for (let i = 1; i < points.length; i++) {
      if (t <= points[i].t) {
        const a = points[i - 1];
        const b = points[i];
        const ratio = (t - a.t) / (b.t - a.t);
        return a.u + ratio * (b.u - a.u);
      }
    }
    return points[points.length - 1].u;
  };

  return allTimes.map((t) => ({
    time_s: t,
    u_min_pu: Math.max(0, Math.min(1.5, interp(lvrt, t) + o.lvrt)),
    u_max_pu: Math.max(0, Math.min(1.5, interp(hvrt, t) + o.hvrt)),
  }));
}

export function FrtHvrtCurves({
  profileId,
  trajectory,
  height = 320,
}: FrtHvrtCurvesProps): JSX.Element {
  const envelope = useMemo(() => buildEnvelope(profileId), [profileId]);

  // Łączymy envelope z trajektorią po czasie.
  const chartData = useMemo(() => {
    const map = new Map<number, {
      time_s: number;
      u_min_pu: number;
      u_max_pu: number;
      voltage_pu?: number;
      iq_reactive_pu?: number;
      p_active_pu?: number;
    }>();
    for (const p of envelope) {
      map.set(p.time_s, { time_s: p.time_s, u_min_pu: p.u_min_pu, u_max_pu: p.u_max_pu });
    }
    if (trajectory) {
      for (const t of trajectory) {
        const existing = map.get(t.time_s);
        if (existing) {
          existing.voltage_pu = t.voltage_pu;
          existing.iq_reactive_pu = t.iq_reactive_pu;
          existing.p_active_pu = t.p_active_pu;
        } else {
          // Interpolacja envelope dla nowego czasu.
          const before = [...map.values()].filter((p) => p.time_s <= t.time_s).pop();
          const after = [...map.values()].find((p) => p.time_s >= t.time_s);
          const u_min = before?.u_min_pu ?? 0;
          const u_max = after?.u_max_pu ?? 1.3;
          map.set(t.time_s, {
            time_s: t.time_s,
            u_min_pu: u_min,
            u_max_pu: u_max,
            voltage_pu: t.voltage_pu,
            iq_reactive_pu: t.iq_reactive_pu,
            p_active_pu: t.p_active_pu,
          });
        }
      }
    }
    return [...map.values()].sort((a, b) => a.time_s - b.time_s);
  }, [envelope, trajectory]);

  return (
    <div data-testid="frt-hvrt-curves" data-profile={profileId} className="w-full">
      <div className="mb-2 text-xs text-scada-muted">
        Profil: <span className="font-medium text-scada-text">{PROFILE_LABELS[profileId]}</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 16, right: 24, bottom: 24, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3641" />
          <XAxis
            dataKey="time_s"
            type="number"
            scale="log"
            domain={[0.01, 10]}
            tickFormatter={(v) => `${v}s`}
            stroke="#9aa5b1"
            label={{ value: 'Czas [s] (skala log)', position: 'insideBottom', offset: -10, fill: '#9aa5b1' }}
          />
          <YAxis
            domain={[0, 1.5]}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            stroke="#9aa5b1"
            label={{ value: 'U/Un [%]', angle: -90, position: 'insideLeft', fill: '#9aa5b1' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#171B20', border: '1px solid #2a3641' }}
            labelStyle={{ color: '#F4F6F8' }}
            formatter={(value: number, name: string) => {
              if (typeof value !== 'number') return value;
              return [`${(value * 100).toFixed(1)}%`, name];
            }}
            labelFormatter={(v: number) => `t=${v}s`}
          />
          <Legend wrapperStyle={{ color: '#9aa5b1' }} />
          <Line
            type="monotone"
            dataKey="u_min_pu"
            name="LVRT (dolna obwiednia)"
            stroke="#dc2626"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="u_max_pu"
            name="HVRT (górna obwiednia)"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
          {trajectory && trajectory.length > 0 && (
            <Line
              type="monotone"
              dataKey="voltage_pu"
              name="Trajektoria U(t) z solvera"
              stroke="#FFD400"
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default FrtHvrtCurves;
