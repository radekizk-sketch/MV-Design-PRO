/**
 * Zakładka SWZ — heatmapa problematycznych obwodów + margines per odpływ
 * (karta P0.9, plan F §2/§5). Orkiestracja DWÓCH gotowych endpointów P0.6:
 * `fault-loop-feeders` (najgorszy punkt każdego odpływu) → `swz` (werdykt
 * 3-stanowy w tym punkcie). Aparat chroniący odpływ jest wyznaczony z
 * `feeder_root_branch_ref` (pierwsza gałąź trasy) — GDY jest to gałąź
 * wyłącznika/rozłącznika/bezpiecznika; gdy pierwsza gałąź jest kablem (brak
 * jeszcze zamodelowanego aparatu u początku odpływu), werdykt jest
 * NIEROZSTRZYGALNY z jawnym powodem (trzeci stan — zero fabrykacji: żaden
 * inny algorytm „znajdź aparat" nie jest tu wynajdywany).
 *
 * Margines SWZ pochodzi WPROST z `SwzResult.margines` (backend, `werdykt.py`)
 * — wykres tylko rysuje gotową liczbę, nie liczy Ik1min/Ia sam.
 */

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { fetchFeederFaultLoop, fetchSwz, type WidokSwz } from './nnSiteApi';
import { NN_STUDIO_STRINGS as T } from './strings';

const TYPY_APARATU = new Set(['switch', 'breaker', 'disconnector', 'fuse']);

interface WierszSwz {
  readonly feederRef: string;
  readonly worstBusRef: string | null;
  readonly swz: WidokSwz | 'brak-aparatu' | null;
}

function fmtA(a: number): string {
  return a >= 1000 ? `${(a / 1000).toFixed(2).replace('.', ',')} kA` : `${a.toFixed(0)} A`;
}

function klasaWerdyktu(w: WierszSwz): string {
  if (w.swz === 'brak-aparatu' || w.swz === null) return 'mvd-swz-nierozstrzygalne';
  if (w.swz.status !== 'OK' || !w.swz.swz) return 'mvd-swz-nierozstrzygalne';
  if (w.swz.swz.status === 'spełnia') return 'mvd-swz-spelnia';
  if (w.swz.swz.status === 'nie spełnia') return 'mvd-swz-nie-spelnia';
  return 'mvd-swz-nierozstrzygalne';
}

function etykietaWerdyktu(w: WierszSwz): string {
  if (w.swz === 'brak-aparatu') return T.swzBrakAparatu;
  if (w.swz === null || w.swz.status !== 'OK' || !w.swz.swz) return T.swzWerdyktNierozstrzygalne;
  if (w.swz.swz.status === 'spełnia') return T.swzWerdyktSpelnia;
  if (w.swz.swz.status === 'nie spełnia') return T.swzWerdyktNieSpelnia;
  return T.swzWerdyktNierozstrzygalne;
}

export function EkranSwzNn({ stationRef }: { stationRef: string | null }) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const [wiersze, setWiersze] = useState<WierszSwz[] | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [nieDotyczy, setNieDotyczy] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCaseId || !stationRef) return;
    let anulowane = false;
    setWiersze(null);
    setBlad(null);
    setNieDotyczy(null);

    fetchFeederFaultLoop(activeCaseId, stationRef)
      .then(async (dane) => {
        if (anulowane) return;
        if (dane.status === 'nie dotyczy') {
          setNieDotyczy(dane.reason_pl ?? T.swzNieDotyczy);
          setWiersze([]);
          return;
        }
        if (dane.status === 'brak danych' || dane.feeders.length === 0) {
          setWiersze([]);
          return;
        }
        const wynikPromises = dane.feeders.map(async (feeder): Promise<WierszSwz> => {
          const rootBranch = snapshot?.branches.find((b) => b.ref_id === feeder.feeder_root_branch_ref);
          if (!rootBranch || !TYPY_APARATU.has(rootBranch.type) || !feeder.worst_point_bus_ref) {
            return { feederRef: feeder.feeder_root_branch_ref, worstBusRef: feeder.worst_point_bus_ref, swz: 'brak-aparatu' };
          }
          try {
            const swz = await fetchSwz(activeCaseId, stationRef, feeder.worst_point_bus_ref, rootBranch.ref_id);
            return { feederRef: feeder.feeder_root_branch_ref, worstBusRef: feeder.worst_point_bus_ref, swz };
          } catch {
            return { feederRef: feeder.feeder_root_branch_ref, worstBusRef: feeder.worst_point_bus_ref, swz: null };
          }
        });
        const wynik = await Promise.all(wynikPromises);
        if (!anulowane) setWiersze(wynik);
      })
      .catch((e: unknown) => {
        if (!anulowane) setBlad(e instanceof Error ? e.message : T.swzBrakDanych);
      });
    return () => {
      anulowane = true;
    };
  }, [activeCaseId, stationRef, snapshot]);

  const daneWykresu = useMemo(
    () =>
      (wiersze ?? [])
        .filter((w) => w.swz !== 'brak-aparatu' && w.swz !== null && w.swz.status === 'OK' && w.swz.swz?.margines != null)
        .map((w) => ({ etykieta: w.feederRef, margines: (w.swz as WidokSwz).swz!.margines! })),
    [wiersze],
  );

  if (blad) return <p className="mvd-nn-studio-blad" data-testid="mvd-nn-studio-swz-blad">{blad}</p>;
  if (nieDotyczy) return <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-swz-nie-dotyczy">{nieDotyczy}</p>;
  if (wiersze === null) return <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-swz-ladowanie">Wczytywanie…</p>;
  if (wiersze.length === 0) return <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-swz-brak">{T.swzBrakOdplywow}</p>;

  return (
    <div data-testid="mvd-nn-studio-swz">
      <p className="mvd-nn-studio-cel">{T.swzCelJednymZdaniem}</p>
      <table className="mvd-nn-studio-tabela-prosta mvd-nn-studio-heatmapa" data-testid="mvd-nn-studio-swz-heatmapa">
        <thead>
          <tr>
            <th>{T.swzKolOdplyw}</th>
            <th>{T.swzKolNajgorszyPunkt}</th>
            <th>{T.swzKolWerdykt}</th>
            <th>{T.swzKolIk1min}</th>
            <th>{T.swzKolIaWymagane}</th>
            <th>{T.swzKolMargines}</th>
          </tr>
        </thead>
        <tbody>
          {wiersze.map((w) => {
            const swzOk = w.swz !== 'brak-aparatu' && w.swz !== null && w.swz.status === 'OK' ? w.swz.swz : null;
            return (
              <tr key={w.feederRef} data-testid="mvd-nn-studio-swz-wiersz" className={klasaWerdyktu(w)}>
                <td>{w.feederRef}</td>
                <td>{w.worstBusRef ?? '—'}</td>
                <td data-testid={`mvd-nn-studio-swz-werdykt-${w.feederRef}`}>{etykietaWerdyktu(w)}</td>
                <td className="mvd-num">{swzOk ? fmtA(swzOk.ik1_min_a) : '—'}</td>
                <td className="mvd-num">{swzOk?.ia_wymagane_a != null ? fmtA(swzOk.ia_wymagane_a) : '—'}</td>
                <td className="mvd-num">{swzOk?.margines != null ? swzOk.margines.toFixed(2).replace('.', ',') : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {daneWykresu.length > 0 ? (
        <>
          <h3 className="mvd-nn-studio-wykres-tytul">{T.swzWykresTytul}</h3>
          <BarChart width={720} height={240} data={daneWykresu} margin={{ top: 12, right: 20, left: 8, bottom: 40 }}>
            <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
            <XAxis dataKey="etykieta" tick={{ fill: 'var(--mvd-muted)', fontSize: 10 }} stroke="var(--mvd-line)" angle={-30} textAnchor="end" height={60} />
            <YAxis
              tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
              stroke="var(--mvd-line)"
              label={{ value: T.swzWykresOsY, angle: -90, position: 'insideLeft', fill: 'var(--mvd-muted)', fontSize: 11 }}
            />
            <Tooltip />
            <ReferenceLine y={1} stroke="var(--mvd-warn)" strokeDasharray="5 5" label={{ value: T.swzProgLinia, position: 'right', fill: 'var(--mvd-warn)', fontSize: 10 }} />
            <Bar dataKey="margines" fill="var(--mvd-accent)" isAnimationActive={false} />
          </BarChart>
        </>
      ) : null}
    </div>
  );
}
