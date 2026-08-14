/**
 * Zakładka ZWARCIA — Ik1(l) per odpływ nN (karta P0.9, plan F §2). Czyta
 * `GET /enm/fault-loop-feeders` (P0.6) — pętla zwarcia jednofazowego w
 * KAŻDYM punkcie każdego odpływu, ta sama fizyka co widok „u źródła".
 *
 * Oś X = kolejność punktu na trasie odpływu (`hop_count`, liczba odcinków od
 * transformatora) — endpoint NIE niesie skumulowanej długości trasy w metrach
 * (tylko `length_km` per gałąź osobno), więc oś jest topologiczna, nie
 * fizyczna metrażowo; podpisana wprost, żeby nie sugerować metrów. Zero
 * fizyki w UI — Ik1 min/max czyta się WPROST z odpowiedzi.
 */

import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';

import { useAppStateStore } from '../../../../ui/app-state';
import { fetchFeederFaultLoop, type OdplywNn, type WidokOdplywowNn } from './nnSiteApi';
import { NN_STUDIO_STRINGS as T } from './strings';

function fmtA(a: number): string {
  return a >= 1000 ? `${(a / 1000).toFixed(2).replace('.', ',')} kA` : `${a.toFixed(0)} A`;
}

type Stan =
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokOdplywowNn };

interface PunktWykresu {
  readonly etykieta: string;
  readonly ikMin: number | null;
  readonly ikMax: number | null;
}

function punktyOdplywu(odplyw: OdplywNn): PunktWykresu[] {
  return [...odplyw.points]
    .sort((a, b) => a.hop_count - b.hop_count)
    .map((p) => ({
      etykieta: p.bus_ref,
      ikMin: p.status === 'OK' && p.fault_loop ? p.fault_loop.ik_min_a : null,
      ikMax: p.status === 'OK' && p.fault_loop ? p.fault_loop.ik_max_a : null,
    }));
}

export function EkranZwarcNn({ stationRef }: { stationRef: string | null }) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const [stan, setStan] = useState<Stan>({ rodzaj: 'ladowanie' });
  const [wybranyOdplyw, setWybranyOdplyw] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCaseId || !stationRef) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    fetchFeederFaultLoop(activeCaseId, stationRef)
      .then((dane) => {
        if (!anulowane) {
          setStan({ rodzaj: 'gotowe', dane });
          setWybranyOdplyw(dane.feeders[0]?.feeder_root_branch_ref ?? null);
        }
      })
      .catch((e: unknown) => {
        if (!anulowane) setStan({ rodzaj: 'blad', komunikat: e instanceof Error ? e.message : T.zwarciaBrakDanych });
      });
    return () => {
      anulowane = true;
    };
  }, [activeCaseId, stationRef]);

  const odplyw = useMemo(() => {
    if (stan.rodzaj !== 'gotowe') return null;
    return stan.dane.feeders.find((f) => f.feeder_root_branch_ref === wybranyOdplyw) ?? null;
  }, [stan, wybranyOdplyw]);

  const punkty = useMemo(() => (odplyw ? punktyOdplywu(odplyw) : []), [odplyw]);

  if (stan.rodzaj === 'ladowanie') {
    return <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-zwarcia-ladowanie">Wczytywanie…</p>;
  }
  if (stan.rodzaj === 'blad') {
    return <p className="mvd-nn-studio-blad" data-testid="mvd-nn-studio-zwarcia-blad">{stan.komunikat}</p>;
  }

  if (stan.dane.status === 'nie dotyczy') {
    return <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-zwarcia-nie-dotyczy">{stan.dane.reason_pl ?? T.zwarciaNieDotyczy}</p>;
  }
  if (stan.dane.status === 'brak danych' || stan.dane.feeders.length === 0) {
    return <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-zwarcia-brak">{T.zwarciaBrakOdplywow}</p>;
  }

  return (
    <div data-testid="mvd-nn-studio-zwarcia">
      <p className="mvd-nn-studio-cel">{T.zwarciaCelJednymZdaniem}</p>
      <label className="mvd-nn-studio-pole-etykieta" htmlFor="mvd-nn-studio-zwarcia-odplyw">
        {T.zwarciaWybierzOdplyw}
      </label>
      <select
        id="mvd-nn-studio-zwarcia-odplyw"
        className="mvd-pole-select"
        data-testid="mvd-nn-studio-zwarcia-odplyw"
        value={wybranyOdplyw ?? ''}
        onChange={(e) => setWybranyOdplyw(e.target.value)}
      >
        {stan.dane.feeders.map((f) => (
          <option key={f.feeder_root_branch_ref} value={f.feeder_root_branch_ref}>
            {f.feeder_root_branch_ref}
          </option>
        ))}
      </select>

      {punkty.length > 0 ? (
        <LineChart width={720} height={280} data={punkty} margin={{ top: 12, right: 20, left: 8, bottom: 40 }}>
          <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="etykieta"
            tick={{ fill: 'var(--mvd-muted)', fontSize: 10 }}
            stroke="var(--mvd-line)"
            angle={-30}
            textAnchor="end"
            height={60}
            label={{ value: T.zwarciaOsX, position: 'insideBottom', offset: -4, fill: 'var(--mvd-muted)', fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
            stroke="var(--mvd-line)"
            tickFormatter={(v: number) => fmtA(v)}
            width={72}
            label={{ value: T.zwarciaOsY, angle: -90, position: 'insideLeft', fill: 'var(--mvd-muted)', fontSize: 11 }}
          />
          <Tooltip formatter={(v: number) => fmtA(v)} />
          <Legend />
          <Line type="monotone" dataKey="ikMin" name={T.zwarciaSeriaMin} stroke="var(--mvd-warn)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="ikMax" name={T.zwarciaSeriaMax} stroke="var(--mvd-accent)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
        </LineChart>
      ) : (
        <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-zwarcia-brak-punktow">{T.zwarciaBrakDanych}</p>
      )}
    </div>
  );
}
