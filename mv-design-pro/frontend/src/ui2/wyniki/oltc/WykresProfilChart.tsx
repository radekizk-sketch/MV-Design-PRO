/*
 * Wykres profilu dobowego OLTC (H2) — Recharts. Pozycja zaczepu i napięcie
 * sterowanej szyny w funkcji kroku czasowego. Tokeny --mvd-*, deterministyczny.
 * Zero fizyki — dane z silnika annual_profile.
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
import type { KrokProfilu } from './oltcBadaniaModel';
import { OLTC_BADANIA_STRINGS as T } from './strings';

interface WykresProfilChartProps {
  kroki: KrokProfilu[];
  branchId: string;
  szerokosc?: number;
  wysokosc?: number;
}

export function WykresProfilChart({
  kroki,
  branchId,
  szerokosc = 720,
  wysokosc = 280,
}: WykresProfilChartProps) {
  const dane = kroki.map((k) => ({
    label: k.label,
    pozycja: k.positions[branchId] ?? null,
    u: k.controlled_bus_kv[branchId] ?? null,
  }));
  return (
    <div data-testid="mvd-oltc-wykres-profil">
      <h3 className="mvd-wyn-wykres-tytul">{T.profilWykresTytul}</h3>
      <LineChart width={szerokosc} height={wysokosc} data={dane} margin={{ top: 12, right: 56, left: 8, bottom: 24 }}>
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
        />
        <YAxis
          yAxisId="poz"
          allowDecimals={false}
          domain={['auto', 'auto']}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          width={48}
        />
        <YAxis
          yAxisId="u"
          orientation="right"
          domain={['auto', 'auto']}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          width={56}
          tickFormatter={(v: number) => v.toFixed(2)}
        />
        <Tooltip
          contentStyle={{ background: 'var(--mvd-panel)', border: '1px solid var(--mvd-line)', color: 'var(--mvd-ink)' }}
        />
        <Legend wrapperStyle={{ color: 'var(--mvd-muted)', fontSize: 11 }} />
        <Line
          yAxisId="poz"
          type="stepAfter"
          dataKey="pozycja"
          name={T.profilPozycja}
          stroke="var(--mvd-accent)"
          strokeWidth={2}
          dot={{ r: 2, fill: 'var(--mvd-accent)' }}
          isAnimationActive={false}
        />
        <Line
          yAxisId="u"
          type="monotone"
          dataKey="u"
          name={T.profilNapiecie}
          stroke="var(--mvd-ok)"
          strokeWidth={2}
          dot={{ r: 2, fill: 'var(--mvd-ok)' }}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
