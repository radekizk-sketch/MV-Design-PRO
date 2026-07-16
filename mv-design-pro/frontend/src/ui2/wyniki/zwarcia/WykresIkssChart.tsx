/*
 * Wykres słupkowy prądów zwarciowych Ik" per punkt zwarcia (karta E8.2) —
 * Recharts. Kolory WYŁĄCZNIE przez tokeny --mvd-* (theme/tokens.css);
 * deterministyczny (stałe wymiary, animacja wyłączona, dane wprost z wyniku —
 * zero losowości, zero `Date.now`). Warstwa prezentacji: rysuje wartości Ik"
 * policzone przez solver — bez fizyki i bez korekt.
 */

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { SlupekIkss } from './zwarciaModel';
import { fmtKA, ZWARCIA_STRINGS } from './strings';

interface WykresIkssChartProps {
  slupki: SlupekIkss[];
  szerokosc?: number;
  wysokosc?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SlupekIkss }>;
}

function DymekIkss({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="mvd-wyn-wykres-dymek" data-testid="mvd-zwarcia-wykres-dymek">
      <span className="mvd-num">{p.punkt}</span>
      {': '}
      <span className="mvd-num">{fmtKA(p.ikss)}</span> {ZWARCIA_STRINGS.jednKA}
    </div>
  );
}

export function WykresIkssChart({
  slupki,
  szerokosc = 720,
  wysokosc = 260,
}: WykresIkssChartProps) {
  return (
    <div data-testid="mvd-zwarcia-wykres">
      <h3 className="mvd-wyn-wykres-tytul">{ZWARCIA_STRINGS.wykresTytul}</h3>
      <BarChart
        width={szerokosc}
        height={wysokosc}
        data={slupki}
        margin={{ top: 12, right: 20, left: 8, bottom: 24 }}
      >
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="punkt"
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
        />
        <YAxis
          domain={[0, 'auto']}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtKA(v)}
          width={64}
        />
        <Tooltip content={<DymekIkss />} cursor={{ fill: 'var(--mvd-sel)' }} />
        <Bar
          dataKey="ikss"
          name={ZWARCIA_STRINGS.wykresOsY}
          fill="var(--mvd-accent)"
          isAnimationActive={false}
        />
      </BarChart>
    </div>
  );
}
