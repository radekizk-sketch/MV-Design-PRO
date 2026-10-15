/*
 * Wykres przebiegów czasowych biegu dynamiki (karta AB-P1 §0.8) — Recharts, ten sam
 * zestaw komponentów co dotychczasowe wykresy przebiegów ui2 (LineChart, oś X liczbowa
 * w sekundach, kolory wyłącznie tokenami --mvd-*, animacje wyłączone — render
 * deterministyczny).
 *
 * Wierność danym backendu:
 *  - jedna próbka = jeden punkt; w chwili zdarzenia dwa punkty o tym samym czasie (strona
 *    `L` tuż przed i `P` tuż po) — skok jest rysowany pionowo w TEJ chwili i znaczony
 *    kropką po obu stronach, nigdy wygładzany między chwilami (`type="linear"`);
 *  - `null` = przerwa linii (`connectNulls={false}`), nie zero;
 *  - chwile zdarzeń = pionowe linie osi zdarzeń; wszystkie wykresy ekranu dzielą oś
 *    czasu (`syncId`), więc kursor czasu przesuwa się razem.
 * ZERO fizyki: żadna wartość nie jest tu liczona ani przeliczana.
 */

import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';

import { fmtLiczba, symbolJednostki, type WierszWykresu } from './model';
import { DYNAMIKA_STRINGS as T } from './strings';

/** Paleta kategoryczna serii (tokeny `--mvd-seria-1…8`, zwalidowane dla obu motywów).
 *  Kolor idzie za POZYCJĄ serii w stałej kolejności; od 9. serii ten sam odcień wraca
 *  z innym wzorem kreski (kodowanie złożone — nigdy wygenerowany nowy odcień). Dawna
 *  paleta (6 kolorów, w tym `--mvd-sel` i `--mvd-muted`) rysowała część serii prawie
 *  niewidocznie na tle panelu (oględziny 2026-10-15). */
const KOLORY = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--mvd-seria-${n})`);
const KRESKI = ['', '7 3', '2 3'] as const;

function kolorSerii(i: number): string {
  return KOLORY[i % KOLORY.length];
}

function kreskaSerii(i: number): string {
  return KRESKI[Math.floor(i / KOLORY.length) % KRESKI.length];
}

/** Legenda POD polem wykresu (HTML): pełna wysokość dla przebiegów, tekst w kolorze
 *  tekstu, tożsamość serii niesie próbka linii z jej kolorem i kreską — jak w oknach
 *  wykresów narzędzi klasy PowerFactory/ETAP (legenda poza obszarem rysowania). */
function LegendaSerii({ serie }: { readonly serie: readonly SeriaWykresu[] }) {
  return (
    <ul className="mvd-dynamika-legenda" data-testid="mvd-dynamika-legenda">
      {serie.map((seria, i) => (
        <li key={seria.klucz} className="mvd-dynamika-legenda-pozycja">
          <svg width="26" height="10" aria-hidden="true" className="mvd-dynamika-legenda-probka">
            <line
              x1="1"
              y1="5"
              x2="25"
              y2="5"
              stroke={kolorSerii(i)}
              strokeWidth={2}
              strokeDasharray={kreskaSerii(i) || undefined}
            />
          </svg>
          <span>{seria.etykieta}</span>
        </li>
      ))}
    </ul>
  );
}

export interface SeriaWykresu {
  readonly klucz: string;
  readonly etykieta: string;
}

export interface WykresPrzebiegowProps {
  readonly jednostka: string;
  readonly serie: readonly SeriaWykresu[];
  readonly wiersze: readonly WierszWykresu[];
  readonly chwileZdarzen: readonly number[];
  readonly szerokosc?: number;
  readonly wysokosc?: number;
}

interface DymekProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | null; color?: string; payload?: WierszWykresu }>;
  label?: number;
  jednostka: string;
}

function Dymek({ active, payload, label, jednostka }: DymekProps) {
  if (!active || !payload?.length) return null;
  const strona = payload[0]?.payload?.strona;
  return (
    <div className="mvd-dynamika-dymek" data-testid="mvd-dynamika-dymek">
      <div className="mvd-num">
        {T.osCzasu} = {fmtLiczba(typeof label === 'number' ? label : null, 6)} {T.jednS}
        {strona === 'L' && ` (${T.stronaL})`}
        {strona === 'P' && ` (${T.stronaP})`}
      </div>
      {payload.map((wpis) => (
        <div key={wpis.name} style={{ color: wpis.color }}>
          {wpis.name}:{' '}
          <span className="mvd-num">
            {wpis.value === null || wpis.value === undefined
              ? T.brakProbki
              : `${fmtLiczba(wpis.value, 6)} ${symbolJednostki(jednostka)}`}
          </span>
        </div>
      ))}
    </div>
  );
}

interface KropkaProps {
  cx?: number;
  cy?: number;
  payload?: WierszWykresu;
  stroke?: string;
  value?: number | null;
}

/** Kropka WYŁĄCZNIE na próbkach zdarzenia (strona L/P) — znacznik nieciągłości. */
function KropkaZdarzenia({ cx, cy, payload, stroke, value }: KropkaProps) {
  if (cx === undefined || cy === undefined || value === null || value === undefined) {
    return <g />;
  }
  if (payload?.strona !== 'L' && payload?.strona !== 'P') return <g />;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={2.5}
      fill={payload.strona === 'L' ? 'var(--mvd-panel)' : stroke}
      stroke={stroke}
      strokeWidth={1.2}
    />
  );
}

export function WykresPrzebiegow({
  jednostka,
  serie,
  wiersze,
  chwileZdarzen,
  szerokosc = 760,
  wysokosc = 260,
}: WykresPrzebiegowProps) {
  const symbol = symbolJednostki(jednostka);
  return (
    <div className="mvd-dynamika-wykres" data-testid={`mvd-dynamika-wykres-${jednostka}`}>
      <LineChart
        width={szerokosc}
        height={wysokosc}
        data={[...wiersze]}
        syncId="mvd-dynamika"
        margin={{ top: 8, right: 20, left: 8, bottom: 28 }}
      >
        <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
        <XAxis
          dataKey="t_s"
          type="number"
          domain={['dataMin', 'dataMax']}
          allowDuplicatedCategory
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtLiczba(v, 4)}
          label={{
            value: `${T.osCzasu} [${T.jednS}]`,
            position: 'insideBottom',
            offset: -6,
            fill: 'var(--mvd-muted)',
            fontSize: 11,
          }}
        />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
          stroke="var(--mvd-line)"
          tickFormatter={(v: number) => fmtLiczba(v, 4)}
          width={64}
          label={{
            value: `[${symbol}]`,
            angle: -90,
            position: 'insideLeft',
            fill: 'var(--mvd-muted)',
            fontSize: 11,
          }}
        />
        {chwileZdarzen.map((t) => (
          <ReferenceLine
            key={t}
            x={t}
            stroke="var(--mvd-muted)"
            strokeDasharray="4 2"
            ifOverflow="extendDomain"
          />
        ))}
        <Tooltip content={<Dymek jednostka={jednostka} />} isAnimationActive={false} />
        {serie.map((seria, i) => (
          <Line
            key={seria.klucz}
            type="linear"
            dataKey={seria.klucz}
            name={seria.etykieta}
            stroke={kolorSerii(i)}
            strokeDasharray={kreskaSerii(i)}
            strokeWidth={2}
            dot={<KropkaZdarzenia />}
            activeDot={{ r: 3 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
      <LegendaSerii serie={serie} />
    </div>
  );
}
