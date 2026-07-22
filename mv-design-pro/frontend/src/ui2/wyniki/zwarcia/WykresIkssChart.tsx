/*
 * Wykres słupkowy wielkości zwarciowych per punkt zwarcia (karta E8.2; W-A F2) —
 * Recharts. Kolory WYŁĄCZNIE przez tokeny --mvd-* (theme/tokens.css);
 * deterministyczny (stałe wymiary, animacja wyłączona, dane wprost z wyniku —
 * zero losowości, zero `Date.now`). Warstwa prezentacji: rysuje wartości
 * policzone przez solver — bez fizyki i bez korekt.
 *
 * Karta W-A F2 (pkt 12): props uogólnione ADDYTYWNIE — domyślne wartości
 * zachowują dotychczasowy kontrakt Ik" 1:1 (tytuł, format kA, jednostka);
 * przełącznik wielkości (`WykresZwarc`) podaje tytuł/format/jednostkę wybranej
 * wielkości (ip/Ith/Sk"/I²t). Pole danych `ikss` = stały dataKey (patrz
 * `SlupekIkss` w `zwarciaModel.ts`).
 */

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { SlupekIkss } from './zwarciaModel';
import { fmtKA, ZWARCIA_STRINGS } from './strings';

interface WykresIkssChartProps {
  slupki: SlupekIkss[];
  szerokosc?: number;
  wysokosc?: number;
  /** Tytuł wykresu (domyślnie tytuł Ik" — kontrakt 1:1). */
  tytul?: string;
  /** Pełna nazwa prezentowanej wielkości (seria/dymek). */
  nazwaWielkosci?: string;
  /** Deterministyczny formater wartości (domyślnie kA, przecinek PL). */
  format?: (n: number) => string;
  /** Jednostka prezentacji (dymek). */
  jednostka?: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SlupekIkss }>;
  format?: (n: number) => string;
  jednostka?: string;
}

function DymekIkss({ active, payload, format = fmtKA, jednostka = ZWARCIA_STRINGS.jednKA }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="mvd-wyn-wykres-dymek" data-testid="mvd-zwarcia-wykres-dymek">
      <span className="mvd-num">{p.punkt}</span>
      {': '}
      <span className="mvd-num">{format(p.ikss)}</span> {jednostka}
    </div>
  );
}

export function WykresIkssChart({
  slupki,
  szerokosc = 720,
  wysokosc = 260,
  tytul = ZWARCIA_STRINGS.wykresTytul,
  nazwaWielkosci = ZWARCIA_STRINGS.wykresOsY,
  format = fmtKA,
  jednostka = ZWARCIA_STRINGS.jednKA,
}: WykresIkssChartProps) {
  return (
    <div data-testid="mvd-zwarcia-wykres">
      <h3 className="mvd-wyn-wykres-tytul">{tytul}</h3>
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
          tickFormatter={(v: number) => format(v)}
          width={64}
        />
        <Tooltip
          content={<DymekIkss format={format} jednostka={jednostka} />}
          cursor={{ fill: 'var(--mvd-sel)' }}
        />
        <Bar
          dataKey="ikss"
          name={nazwaWielkosci}
          fill="var(--mvd-accent)"
          isAnimationActive={false}
        />
      </BarChart>
    </div>
  );
}
