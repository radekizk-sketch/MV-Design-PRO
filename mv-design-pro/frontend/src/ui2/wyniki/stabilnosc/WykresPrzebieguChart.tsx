/*
 * Wykres przebiegu czasowego stabilności (E-32, karta ST-1) — Recharts.
 * Rysuje U(t)/f(t) w funkcji czasu [s] z przebiegu policzonego przez backend
 * (endpoint results/dynamic-stability/time-series). Kolory WYŁĄCZNIE przez
 * tokeny --mvd-* (theme/tokens.css); deterministyczny (stałe wymiary, animacja
 * wyłączona `isAnimationActive={false}`, dane wprost z wyniku — zero losowości,
 * zero `Date.now`). Serie i etykiety PL pochodzą z metadanych `quantities`
 * backendu (zero fabrykacji). Przełącznik serii, gdy wielkości > 1.
 * Wzór: `ui2/oze/frt/WykresTrajektoriiChart`. ZERO fizyki w UI.
 */

import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';

import { fmtPu, fmtS, type PunktPrzebiegu, type SeriaPrzebiegu } from './model';
import { STABILNOSC_STRINGS as T } from './strings';

interface WykresPrzebieguChartProps {
  punkty: readonly PunktPrzebiegu[];
  serie: readonly SeriaPrzebiegu[];
  szerokosc?: number;
  wysokosc?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: number;
}

const KOLOR_SERII: Record<SeriaPrzebiegu['dataKey'], string> = {
  voltage_pu: 'var(--mvd-accent)',
  frequency_pu: 'var(--mvd-ok)',
};

function DymekPrzebiegu({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="mvd-stabilnosc-wykres-dymek" data-testid="mvd-stabilnosc-wykres-dymek">
      <div className="mvd-num">
        {T.przebiegOsX} = {fmtS(typeof label === 'number' ? label : 0)} {T.jednS}
      </div>
      {payload.map((wpis) => (
        <div key={wpis.name} style={{ color: wpis.color }}>
          {wpis.name}: <span className="mvd-num">{fmtPu(wpis.value ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function WykresPrzebieguChart({
  punkty,
  serie,
  szerokosc = 720,
  wysokosc = 320,
}: WykresPrzebieguChartProps) {
  // Przełącznik serii tylko gdy > 1 wielkość; domyślnie wszystkie widoczne.
  const [ukryte, setUkryte] = useState<ReadonlySet<string>>(() => new Set());
  const przelacz = (klucz: string) =>
    setUkryte((zbior) => {
      const nowy = new Set(zbior);
      if (nowy.has(klucz)) nowy.delete(klucz);
      else nowy.add(klucz);
      return nowy;
    });

  const daneWykresu = punkty.map((p) => ({ ...p }));

  return (
    <div data-testid="mvd-stabilnosc-wykres">
      <h4 className="mvd-stabilnosc-wykres-tytul">{T.przebiegWykresTytul}</h4>

      {serie.length > 1 && (
        <div className="mvd-stabilnosc-serie" data-testid="mvd-stabilnosc-serie">
          <span className="mvd-stabilnosc-serie-tytul">{T.przebiegSerieTytul}</span>
          {serie.map((s) => (
            <button
              key={s.dataKey}
              type="button"
              className="mvd-stabilnosc-serie-btn"
              aria-pressed={!ukryte.has(s.dataKey)}
              onClick={() => przelacz(s.dataKey)}
              data-testid={`mvd-stabilnosc-serie-${s.dataKey}`}
            >
              {s.nazwa}
            </button>
          ))}
        </div>
      )}

      <LineChart
        width={szerokosc}
        height={wysokosc}
        data={daneWykresu}
        margin={{ top: 12, right: 20, left: 8, bottom: 32 }}
      >
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="t_s"
          type="number"
          domain={['auto', 'auto']}
          allowDuplicatedCategory={false}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtS(v)}
          label={{
            value: `${T.przebiegOsX} [${T.jednS}]`,
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
          tickFormatter={(v: number) => fmtPu(v)}
          width={64}
          label={{
            value: `${T.przebiegOsY} [${T.jednPu}]`,
            angle: -90,
            position: 'insideLeft',
            fill: 'var(--mvd-muted)',
            fontSize: 11,
          }}
        />
        <Tooltip content={<DymekPrzebiegu />} />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, color: 'var(--mvd-muted)' }} />
        {serie
          .filter((s) => !ukryte.has(s.dataKey))
          .map((s) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.nazwa}
              stroke={KOLOR_SERII[s.dataKey]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
      </LineChart>
    </div>
  );
}
