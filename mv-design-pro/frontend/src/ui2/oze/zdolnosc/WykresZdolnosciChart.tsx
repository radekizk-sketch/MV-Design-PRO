/*
 * Wykres słupkowy maksymalnej mocy przyłączalnej per węzeł (karta P2) — Recharts.
 * Kolory WYŁĄCZNIE przez tokeny --mvd-* (theme/tokens.css); deterministyczny
 * (stałe wymiary, animacja wyłączona, dane wprost z wyniku — zero losowości, zero
 * `Date.now`). Warstwa prezentacji: rysuje moc przyłączalną policzoną przez
 * backend — bez fizyki i bez korekt. Wzór: `ui2/wyniki/zwarcia/WykresIkssChart`.
 */

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { SlupekZdolnosci } from './zdolnoscModel';
import { ZDOLNOSC_STRINGS, fmtMW } from './strings';

interface WykresZdolnosciChartProps {
  slupki: SlupekZdolnosci[];
  szerokosc?: number;
  wysokosc?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SlupekZdolnosci }>;
}

function DymekZdolnosci({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="mvd-zdol-wykres-dymek" data-testid="mvd-zdol-wykres-dymek">
      <span>{p.etykieta}</span>
      {': '}
      <span className="mvd-num">{fmtMW(p.moc)}</span> {ZDOLNOSC_STRINGS.jednMW}
    </div>
  );
}

export function WykresZdolnosciChart({
  slupki,
  szerokosc = 720,
  wysokosc = 260,
}: WykresZdolnosciChartProps) {
  return (
    <div data-testid="mvd-zdol-wykres">
      <h3 className="mvd-zdol-wykres-tytul">{ZDOLNOSC_STRINGS.wykresTytul}</h3>
      <BarChart
        width={szerokosc}
        height={wysokosc}
        data={slupki}
        margin={{ top: 12, right: 20, left: 8, bottom: 24 }}
      >
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="etykieta"
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
        />
        <YAxis
          domain={[0, 'auto']}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtMW(v)}
          width={72}
        />
        <Tooltip content={<DymekZdolnosci />} cursor={{ fill: 'var(--mvd-sel)' }} />
        <Bar
          dataKey="moc"
          name={ZDOLNOSC_STRINGS.wykresOsY}
          fill="var(--mvd-accent)"
          isAnimationActive={false}
        />
      </BarChart>
    </div>
  );
}
