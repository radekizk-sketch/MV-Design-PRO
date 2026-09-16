/*
 * Wykres profilu napięć szyn (karta E8.1) — Recharts. Kolory WYŁĄCZNIE przez
 * tokeny --mvd-* (theme/tokens.css); deterministyczny (stałe wymiary, animacja
 * wyłączona, dane wprost z wyniku — zero losowości, zero `Date.now`). Warstwa
 * prezentacji: rysuje wartości policzone przez solver + linie odniesienia
 * kryterium ostrzeżenia — bez fizyki i bez korekt. Karta W3-J: linie
 * odniesienia WYŁĄCZNIE z kryteriów przekazanych w odpowiedzi (`kryteria`
 * prop); brak kryteriów (starszy zapisany wynik) = wykres BEZ linii
 * odniesienia, nie z domyślnymi liczbami.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { KryteriaNapieciowe } from '../../../ui/power-flow-results/types';
import type { PunktProfilu } from './adapters/rozplywAdapter';
import { fmtPU, ROZPLYW_STRINGS } from './strings';

interface ProfilNapiecChartProps {
  punkty: PunktProfilu[];
  /** Karta W3-J — linie odniesienia (min/max ostrzeżenia); brak = bez linii. */
  kryteria?: KryteriaNapieciowe;
  szerokosc?: number;
  wysokosc?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PunktProfilu }>;
}

function DymekProfilu({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="mvd-wyn-wykres-dymek" data-testid="mvd-rozplyw-wykres-dymek">
      <span className="mvd-num">{p.szyna}</span>
      {': '}
      <span className="mvd-num">{fmtPU(p.napiecie)}</span> {ROZPLYW_STRINGS.jednPU}
    </div>
  );
}

export function ProfilNapiecChart({
  punkty,
  kryteria,
  szerokosc = 720,
  wysokosc = 260,
}: ProfilNapiecChartProps) {
  return (
    <div data-testid="mvd-rozplyw-wykres">
      <h3 className="mvd-wyn-wykres-tytul">{ROZPLYW_STRINGS.wykresTytul}</h3>
      <LineChart
        width={szerokosc}
        height={wysokosc}
        data={punkty}
        margin={{ top: 12, right: 20, left: 8, bottom: 24 }}
      >
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="szyna"
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
        />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtPU(v)}
          width={56}
        />
        <Tooltip content={<DymekProfilu />} />
        {kryteria ? (
          <>
            <ReferenceLine
              y={kryteria.ostrzezenie_max_pu}
              stroke="var(--mvd-warn)"
              strokeDasharray="5 5"
            />
            <ReferenceLine
              y={kryteria.ostrzezenie_min_pu}
              stroke="var(--mvd-warn)"
              strokeDasharray="5 5"
            />
          </>
        ) : null}
        <Line
          type="monotone"
          dataKey="napiecie"
          name={ROZPLYW_STRINGS.wykresOsY}
          stroke="var(--mvd-accent)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--mvd-accent)' }}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
