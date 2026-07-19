/*
 * Wykres wrażliwości OLTC (H2) — Recharts. Kolory WYŁĄCZNIE tokeny --mvd-*;
 * deterministyczny (stałe wymiary, animacja wyłączona, dane wprost z backendu).
 * Zero fizyki — rysuje wartości policzone przez silnik sweep.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PunktSweep } from './oltcBadaniaModel';
import { OLTC_BADANIA_STRINGS as T } from './strings';

interface WykresSweepChartProps {
  punkty: PunktSweep[];
  szerokosc?: number;
  wysokosc?: number;
}

export function WykresSweepChart({ punkty, szerokosc = 720, wysokosc = 280 }: WykresSweepChartProps) {
  const dane = punkty.map((p) => ({
    position: p.position,
    u: p.controlled_bus_kv,
    straty: p.losses_mw,
  }));
  return (
    <div data-testid="mvd-oltc-wykres-sweep">
      <h3 className="mvd-wyn-wykres-tytul">{T.sweepTytul}</h3>
      <LineChart width={szerokosc} height={wysokosc} data={dane} margin={{ top: 12, right: 56, left: 8, bottom: 24 }}>
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="position"
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          label={{ value: T.sweepOsX, position: 'insideBottom', offset: -12, fill: 'var(--mvd-muted)' }}
        />
        <YAxis
          yAxisId="u"
          domain={['auto', 'auto']}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          width={56}
          tickFormatter={(v: number) => v.toFixed(2)}
        />
        <YAxis
          yAxisId="straty"
          orientation="right"
          domain={['auto', 'auto']}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          width={56}
          tickFormatter={(v: number) => v.toFixed(3)}
        />
        <Tooltip
          contentStyle={{ background: 'var(--mvd-panel)', border: '1px solid var(--mvd-line)', color: 'var(--mvd-ink)' }}
        />
        <Legend wrapperStyle={{ color: 'var(--mvd-muted)', fontSize: 11 }} />
        <Line
          yAxisId="u"
          type="monotone"
          dataKey="u"
          name={T.sweepNapiecie}
          stroke="var(--mvd-accent)"
          strokeWidth={2}
          dot={{ r: 2, fill: 'var(--mvd-accent)' }}
          isAnimationActive={false}
        />
        <Line
          yAxisId="straty"
          type="monotone"
          dataKey="straty"
          name={T.sweepStraty}
          stroke="var(--mvd-warn)"
          strokeWidth={2}
          dot={{ r: 2, fill: 'var(--mvd-warn)' }}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
