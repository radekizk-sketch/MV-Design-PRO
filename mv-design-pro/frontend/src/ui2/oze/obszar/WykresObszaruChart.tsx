/*
 * Wykres obszaru bezpiecznej pracy P–Q węzła (karta P30) — Recharts. Kolory
 * WYŁĄCZNIE przez tokeny --mvd-* (theme/tokens.css); deterministyczny (stałe
 * wymiary, animacja wyłączona, dane wprost z wyniku — zero losowości, zero
 * `Date.now`). Warstwa prezentacji: rysuje dopuszczalne pasmo Q(P) policzone przez
 * backend (linie q_min_dop/q_max_dop) + OPCJONALNĄ nakładkę krzywej producenta
 * wybranego typu falownika (linie z `pq_curve` katalogu) — bez fizyki i bez korekt.
 * Wzór: `ui2/oze/krzywe/WykresPQChart`.
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
import type { PunktObszaru } from './obszarModel';
import { OBSZAR_STRINGS, fmtMWObszar, fmtMvarObszar } from './strings';

interface WykresObszaruChartProps {
  punkty: PunktObszaru[];
  /** Czy dołożona jest nakładka krzywej producenta (steruje widocznością serii). */
  zNakladkaProducenta: boolean;
  szerokosc?: number;
  wysokosc?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PunktObszaru }>;
}

function DymekObszaru({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="mvd-obszar-wykres-dymek" data-testid="mvd-obszar-wykres-dymek">
      <span className="mvd-num">{fmtMWObszar(p.p)}</span> {OBSZAR_STRINGS.jednMW}
      {p.qMin !== undefined && p.qMax !== undefined ? (
        <>
          {': '}
          <span className="mvd-num">{fmtMvarObszar(p.qMin)}</span>
          {OBSZAR_STRINGS.rozdzielaczPasma}
          <span className="mvd-num">{fmtMvarObszar(p.qMax)}</span> {OBSZAR_STRINGS.jednMvar}
        </>
      ) : null}
    </div>
  );
}

export function WykresObszaruChart({
  punkty,
  zNakladkaProducenta,
  szerokosc = 720,
  wysokosc = 320,
}: WykresObszaruChartProps) {
  return (
    <div data-testid="mvd-obszar-wykres">
      <h3 className="mvd-obszar-wykres-tytul">{OBSZAR_STRINGS.wykresTytul}</h3>
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
          tickFormatter={(v: number) => fmtMWObszar(v)}
          label={{
            value: `${OBSZAR_STRINGS.wykresOsX} [${OBSZAR_STRINGS.jednMW}]`,
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
          tickFormatter={(v: number) => fmtMvarObszar(v)}
          width={64}
          label={{
            value: `${OBSZAR_STRINGS.wykresOsY} [${OBSZAR_STRINGS.jednMvar}]`,
            angle: -90,
            position: 'insideLeft',
            fill: 'var(--mvd-muted)',
            fontSize: 11,
          }}
        />
        <Tooltip content={<DymekObszaru />} />
        {/* Legenda u góry — dolna kolidowała z podpisem osi X (insideBottom). */}
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, color: 'var(--mvd-muted)' }} />
        <Line
          type="monotone"
          dataKey="qMax"
          name={OBSZAR_STRINGS.legendaQMax}
          stroke="var(--mvd-accent)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--mvd-accent)' }}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="qMin"
          name={OBSZAR_STRINGS.legendaQMin}
          stroke="var(--mvd-ok)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--mvd-ok)' }}
          connectNulls
          isAnimationActive={false}
        />
        {zNakladkaProducenta ? (
          <Line
            type="monotone"
            dataKey="prodMax"
            name={OBSZAR_STRINGS.legendaProdMax}
            stroke="var(--mvd-warn)"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 2, fill: 'var(--mvd-warn)' }}
            connectNulls
            isAnimationActive={false}
          />
        ) : null}
        {zNakladkaProducenta ? (
          <Line
            type="monotone"
            dataKey="prodMin"
            name={OBSZAR_STRINGS.legendaProdMin}
            stroke="var(--mvd-muted)"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 2, fill: 'var(--mvd-muted)' }}
            connectNulls
            isAnimationActive={false}
          />
        ) : null}
      </LineChart>
    </div>
  );
}
