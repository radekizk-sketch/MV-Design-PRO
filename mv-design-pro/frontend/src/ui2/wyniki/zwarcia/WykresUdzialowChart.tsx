/*
 * Wykres udziałów procentowych wkładów źródeł (karta W-A F2, punkt 5 karty
 * właściciela) — poziome słupki Recharts w konwencji wykresów wyników ui2
 * (`WykresIkssChart`): kolory WYŁĄCZNIE przez tokeny --mvd-*, animacja
 * wyłączona, wymiary deterministyczne (wysokość funkcją liczby słupków —
 * dane, nie losowość). Udziały [%] pochodzą z czystego adaptera
 * `naSlupkiUdzialow` (ta sama arytmetyka prezentacji co kolumna „Udział"
 * tabeli wkładów) — zero fizyki w UI.
 */

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import type { SlupekUdzialu } from './zwarciaModel';
import { fmtProcent, ZWARCIA_STRINGS } from './strings';

interface WykresUdzialowChartProps {
  slupki: SlupekUdzialu[];
  szerokosc?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: SlupekUdzialu }>;
}

function DymekUdzialu({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="mvd-wyn-wykres-dymek" data-testid="mvd-zwarcia-wklady-wykres-dymek">
      <span className="mvd-num">{p.zrodlo}</span>
      {': '}
      <span className="mvd-num">{fmtProcent(p.udzial)}</span> {ZWARCIA_STRINGS.jednProcent}
    </div>
  );
}

export function WykresUdzialowChart({ slupki, szerokosc = 720 }: WykresUdzialowChartProps) {
  if (slupki.length === 0) return null;
  // Wysokość deterministyczna: stała rama + stały moduł na słupek (dane → wymiar).
  const wysokosc = 56 + slupki.length * 32;
  return (
    <div data-testid="mvd-zwarcia-wklady-wykres">
      <h4 className="mvd-wyn-wykres-tytul">{ZWARCIA_STRINGS.wkladyWykresTytul}</h4>
      <BarChart
        layout="vertical"
        width={szerokosc}
        height={wysokosc}
        data={slupki}
        margin={{ top: 8, right: 40, left: 8, bottom: 8 }}
      >
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtProcent(v)}
        />
        <YAxis
          type="category"
          dataKey="zrodlo"
          width={180}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
        />
        <Tooltip content={<DymekUdzialu />} cursor={{ fill: 'var(--mvd-sel)' }} />
        <Bar
          dataKey="udzial"
          name={ZWARCIA_STRINGS.wkladyKolUdzial}
          fill="var(--mvd-accent)"
          isAnimationActive={false}
        />
      </BarChart>
    </div>
  );
}
