/*
 * Wykres trajektorii FRT/HVRT (karta U4 P38) — Recharts. Kolory WYŁĄCZNIE przez
 * tokeny --mvd-* (theme/tokens.css); deterministyczny (stałe wymiary, animacja
 * wyłączona `isAnimationActive={false}`, dane wprost z wyniku — zero losowości,
 * zero `Date.now`). Warstwa prezentacji: rysuje napięcie U(t) modułu na tle
 * OBWIEDNI profilu operatora (łamana z punktów krzywej odpowiedzi) oraz serie
 * P(t)/Iq(t) przełączalne przyciskami. Legenda PL. Bez fizyki i bez korekt.
 * Wzór: `ui2/oze/krzywe/WykresPQChart`.
 */

import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PunktObwiedniWykresu, PunktTrajektoriiWykresu } from './frtModel';
import { FRT_STRINGS, fmtPuFrt, fmtSFrt } from './strings';

interface WykresTrajektoriiChartProps {
  trajektoria: PunktTrajektoriiWykresu[];
  obwiednia: PunktObwiedniWykresu[];
  szerokosc?: number;
  wysokosc?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: number;
}

function DymekFrt({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="mvd-frt-wykres-dymek" data-testid="mvd-frt-wykres-dymek">
      <div className="mvd-num">
        {FRT_STRINGS.wykresOsX} = {fmtSFrt(typeof label === 'number' ? label : 0)}{' '}
        {FRT_STRINGS.jednS}
      </div>
      {payload.map((wpis) => (
        <div key={wpis.name} style={{ color: wpis.color }}>
          {wpis.name}: <span className="mvd-num">{fmtPuFrt(wpis.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function WykresTrajektoriiChart({
  trajektoria,
  obwiednia,
  szerokosc = 720,
  wysokosc = 320,
}: WykresTrajektoriiChartProps) {
  const [pokazP, setPokazP] = useState(false);
  const [pokazIq, setPokazIq] = useState(false);

  return (
    <div data-testid="mvd-frt-wykres">
      <h3 className="mvd-frt-wykres-tytul">{FRT_STRINGS.wykresTytul}</h3>

      <div className="mvd-frt-serie" data-testid="mvd-frt-serie">
        <span className="mvd-frt-serie-tytul">{FRT_STRINGS.serieTytul}</span>
        <button
          type="button"
          className="mvd-frt-serie-btn"
          aria-pressed={pokazP}
          onClick={() => setPokazP((s) => !s)}
          data-testid="mvd-frt-serie-p"
        >
          {FRT_STRINGS.seriaP}
        </button>
        <button
          type="button"
          className="mvd-frt-serie-btn"
          aria-pressed={pokazIq}
          onClick={() => setPokazIq((s) => !s)}
          data-testid="mvd-frt-serie-iq"
        >
          {FRT_STRINGS.seriaIq}
        </button>
      </div>

      <LineChart
        width={szerokosc}
        height={wysokosc}
        margin={{ top: 12, right: 20, left: 8, bottom: 32 }}
      >
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="czas"
          type="number"
          domain={['auto', 'auto']}
          allowDuplicatedCategory={false}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtSFrt(v)}
          label={{
            value: `${FRT_STRINGS.wykresOsX} [${FRT_STRINGS.jednS}]`,
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
          tickFormatter={(v: number) => fmtPuFrt(v)}
          width={64}
          label={{
            value: `${FRT_STRINGS.wykresOsY} [${FRT_STRINGS.jednPu}]`,
            angle: -90,
            position: 'insideLeft',
            fill: 'var(--mvd-muted)',
            fontSize: 11,
          }}
        />
        <Tooltip content={<DymekFrt />} />
        {/* Legenda u góry — dolna kolidowała z podpisem osi X (insideBottom). */}
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, color: 'var(--mvd-muted)' }} />
        <Line
          data={obwiednia}
          type="stepAfter"
          dataKey="napiecie"
          name={FRT_STRINGS.legendaObwiednia}
          stroke="var(--mvd-warn)"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={{ r: 2, fill: 'var(--mvd-warn)' }}
          isAnimationActive={false}
        />
        <Line
          data={trajektoria}
          type="monotone"
          dataKey="napiecie"
          name={FRT_STRINGS.legendaNapiecie}
          stroke="var(--mvd-accent)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        {pokazP && (
          <Line
            data={trajektoria}
            type="monotone"
            dataKey="p"
            name={FRT_STRINGS.legendaP}
            stroke="var(--mvd-ok)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        )}
        {pokazIq && (
          <Line
            data={trajektoria}
            type="monotone"
            dataKey="iq"
            name={FRT_STRINGS.legendaIq}
            stroke="var(--mvd-sel)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </div>
  );
}
