/*
 * Wykres krzywej zdolności P–Q (karta P41) — Recharts. Kolory WYŁĄCZNIE przez
 * tokeny --mvd-* (theme/tokens.css); deterministyczny (stałe wymiary, animacja
 * wyłączona, dane wprost z wyniku — zero losowości, zero `Date.now`). Warstwa
 * prezentacji: rysuje pasmo producenta (linie q_min/q_max vs P) policzone przez
 * backend + nakładkę prostokątnego wymagania operatora (linie referencyjne
 * ±udział·Pn) — bez fizyki i bez korekt. Wzór: `ui2/wyniki/rozplyw/ProfilNapiecChart`.
 */

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PunktWykresuPQ } from './krzyweModel';
import { KRZYWE_STRINGS, fmtMWPQ, fmtMvarPQ } from './strings';

interface WykresPQChartProps {
  punkty: PunktWykresuPQ[];
  wymaganieMin: number;
  wymaganieMax: number;
  szerokosc?: number;
  wysokosc?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PunktWykresuPQ }>;
}

function DymekPQ({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="mvd-krzywe-wykres-dymek" data-testid="mvd-krzywe-wykres-dymek">
      <span className="mvd-num">{fmtMWPQ(p.p)}</span> {KRZYWE_STRINGS.jednMW}
      {': '}
      <span className="mvd-num">{fmtMvarPQ(p.qMin)}</span>
      {KRZYWE_STRINGS.rozdzielaczPasma}
      <span className="mvd-num">{fmtMvarPQ(p.qMax)}</span> {KRZYWE_STRINGS.jednMvar}
    </div>
  );
}

export function WykresPQChart({
  punkty,
  wymaganieMin,
  wymaganieMax,
  szerokosc = 720,
  wysokosc = 300,
}: WykresPQChartProps) {
  return (
    <div data-testid="mvd-krzywe-wykres">
      <h3 className="mvd-krzywe-wykres-tytul">{KRZYWE_STRINGS.wykresTytul}</h3>
      <LineChart
        width={szerokosc}
        height={wysokosc}
        data={punkty}
        margin={{ top: 12, right: 20, left: 8, bottom: 32 }}
      >
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="p"
          type="number"
          domain={['auto', 'auto']}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtMWPQ(v)}
          label={{
            value: `${KRZYWE_STRINGS.wykresOsX} [${KRZYWE_STRINGS.jednMW}]`,
            position: 'insideBottom',
            offset: -8,
            fill: 'var(--mvd-muted)',
            fontSize: 11,
          }}
        />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtMvarPQ(v)}
          width={64}
          label={{
            value: `${KRZYWE_STRINGS.wykresOsY} [${KRZYWE_STRINGS.jednMvar}]`,
            angle: -90,
            position: 'insideLeft',
            fill: 'var(--mvd-muted)',
            fontSize: 11,
          }}
        />
        <Tooltip content={<DymekPQ />} />
        {/* Legenda u góry — dolna kolidowała z podpisem osi X (insideBottom). */}
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, color: 'var(--mvd-muted)' }} />
        <ReferenceLine
          y={wymaganieMax}
          stroke="var(--mvd-warn)"
          strokeDasharray="5 5"
          ifOverflow="extendDomain"
        />
        <ReferenceLine
          y={wymaganieMin}
          stroke="var(--mvd-warn)"
          strokeDasharray="5 5"
          ifOverflow="extendDomain"
        />
        <Line
          type="monotone"
          dataKey="qMax"
          name={KRZYWE_STRINGS.legendaQMax}
          stroke="var(--mvd-accent)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--mvd-accent)' }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="qMin"
          name={KRZYWE_STRINGS.legendaQMin}
          stroke="var(--mvd-ok)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--mvd-ok)' }}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
