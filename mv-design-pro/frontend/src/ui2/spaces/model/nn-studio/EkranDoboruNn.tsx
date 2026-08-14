/**
 * Zakładka DOBÓR — dobór aparatu zabezpieczającego nN + wykres koordynacji
 * (karta P0.9, plan F §2/§5). Czyta `GET /enm/nn-device-selection` (P0.7) —
 * Ib/Iz′/Ik″max są PARAMETRAMI WEJŚCIOWYMI z definicji normy (dobór jest
 * decyzją projektową, nie odczytem z jednego biegu — backend to dokumentuje
 * wprost), więc formularz PYTA o nie, nie zgaduje. Ik″max [kA]→[A] w wykresie
 * to KONWERSJA JEDNOSTKI (jak MW→kW), nie fizyka — wartość już policzona przez
 * backend, tylko przeskalowana do wspólnej osi z Ib/In/Iz′.
 */

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';

import { useAppStateStore } from '../../../../ui/app-state';
import { useOdcinkiKablowNn } from '../../../nav/adapters/nnStudioTreeAdapter';
import { KreatorSiatka, PoleLiczbowe, PoleWyboru } from '../../../kreatory/rama';
import { fetchDeviceSelection, type WidokDoboruNn, type WynikKandydataDoboru } from './nnSiteApi';
import { NN_STUDIO_STRINGS as T } from './strings';

function fmtA(a: number | null): string {
  if (a === null) return '—';
  return a >= 1000 ? `${(a / 1000).toFixed(2).replace('.', ',')} kA` : `${a.toFixed(0)} A`;
}

export function EkranDoboruNn({ stationRef }: { stationRef: string | null }) {
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const odcinki = useOdcinkiKablowNn(stationRef);

  const opcjeSzyn = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const o of odcinki) {
      mapa.set(o.fromBusRef, o.fromBusName);
      mapa.set(o.toBusRef, o.toBusName);
    }
    return [...mapa.entries()].map(([ref, nazwa]) => ({ id: ref, etykieta: nazwa })).sort((a, b) => a.etykieta.localeCompare(b.etykieta, 'pl'));
  }, [odcinki]);

  const [busRef, setBusRef] = useState('');
  const [ibA, setIbA] = useState<number | null>(null);
  const [izPrimeA, setIzPrimeA] = useState<number | null>(null);
  const [ikMaxKa, setIkMaxKa] = useState<number | null>(null);

  type Stan =
    | { readonly rodzaj: 'idle' }
    | { readonly rodzaj: 'ladowanie' }
    | { readonly rodzaj: 'blad'; readonly komunikat: string }
    | { readonly rodzaj: 'gotowe'; readonly dane: WidokDoboruNn };
  const [stan, setStan] = useState<Stan>({ rodzaj: 'idle' });

  const gotoweDoUruchomienia = Boolean(activeCaseId && stationRef && busRef && ibA && ibA > 0 && izPrimeA && izPrimeA > 0);

  const onUruchom = async () => {
    if (!gotoweDoUruchomienia || !activeCaseId || !stationRef) return;
    setStan({ rodzaj: 'ladowanie' });
    try {
      const dane = await fetchDeviceSelection(activeCaseId, stationRef, busRef, ibA!, izPrimeA!, ikMaxKa);
      setStan({ rodzaj: 'gotowe', dane });
    } catch (e) {
      setStan({ rodzaj: 'blad', komunikat: e instanceof Error ? e.message : T.doborBladDanych });
    }
  };

  const dobor = stan.rodzaj === 'gotowe' && stan.dane.status === 'OK' ? stan.dane.dobor ?? null : null;

  const daneWykresu = useMemo(() => {
    if (!dobor) return [];
    return dobor.kandydaci.map((w: WynikKandydataDoboru) => ({
      etykieta: w.kandydat.nazwa,
      in: w.kandydat.in_a,
      zdolnoscA: w.kandydat.zdolnosc_wylaczania_ka != null ? w.kandydat.zdolnosc_wylaczania_ka * 1000 : null,
    }));
  }, [dobor]);

  return (
    <div data-testid="mvd-nn-studio-dobor">
      <p className="mvd-nn-studio-cel">{T.doborCelJednymZdaniem}</p>
      <KreatorSiatka kolumny={2}>
        <PoleWyboru
          etykieta={T.doborWybierzPunkt}
          wartosc={busRef}
          onZmiana={setBusRef}
          opcje={[{ id: '', etykieta: T.doborWybierzPunktPlaceholder }, ...opcjeSzyn]}
          testid="mvd-nn-studio-dobor-szyna"
        />
        <PoleLiczbowe etykieta={T.doborIb} jednostka="A" wartosc={ibA} onZmiana={setIbA} testid="mvd-nn-studio-dobor-ib" />
        <PoleLiczbowe etykieta={T.doborIzPrime} jednostka="A" wartosc={izPrimeA} onZmiana={setIzPrimeA} testid="mvd-nn-studio-dobor-iz" />
        <PoleLiczbowe etykieta={T.doborIkMax} jednostka="kA" wartosc={ikMaxKa} onZmiana={setIkMaxKa} testid="mvd-nn-studio-dobor-ikmax" />
      </KreatorSiatka>
      <button
        type="button"
        className="mvd-nn-studio-btn-glowny"
        data-testid="mvd-nn-studio-dobor-uruchom"
        disabled={!gotoweDoUruchomienia}
        onClick={onUruchom}
      >
        {T.doborUruchom}
      </button>
      {!gotoweDoUruchomienia ? <p className="mvd-nn-studio-info">{T.doborBrakPunktu}</p> : null}

      {stan.rodzaj === 'blad' ? <p className="mvd-nn-studio-blad" data-testid="mvd-nn-studio-dobor-blad">{stan.komunikat}</p> : null}
      {stan.rodzaj === 'gotowe' && stan.dane.status !== 'OK' ? (
        <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-dobor-brak-danych">{stan.dane.reason_pl ?? T.doborBladDanych}</p>
      ) : null}

      {dobor ? (
        <>
          <table className="mvd-nn-studio-tabela-prosta" data-testid="mvd-nn-studio-dobor-tabela">
            <thead>
              <tr>
                <th>{T.doborKolNazwa}</th>
                <th>{T.doborKolIn}</th>
                <th>{T.doborKolZdolnosc}</th>
                <th>{T.doborKolKwalifikacja}</th>
              </tr>
            </thead>
            <tbody>
              {dobor.kandydaci.map((w) => (
                <tr
                  key={w.kandydat.id}
                  data-testid="mvd-nn-studio-dobor-wiersz"
                  className={w.kandydat.id === dobor.rekomendacja?.id ? 'mvd-dobor-rekomendacja' : undefined}
                >
                  <td>{w.kandydat.nazwa}</td>
                  <td className="mvd-num">{w.kandydat.in_a} A</td>
                  <td className="mvd-num">{fmtA(w.kandydat.zdolnosc_wylaczania_ka != null ? w.kandydat.zdolnosc_wylaczania_ka * 1000 : null)}</td>
                  <td>{w.kwalifikuje_sie ? T.doborTak : T.doborNie}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dobor.rekomendacja ? (
            <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-dobor-rekomendacja">
              {T.doborRekomendacja}: {dobor.rekomendacja.nazwa}
            </p>
          ) : (
            <p className="mvd-nn-studio-info" data-testid="mvd-nn-studio-dobor-brak-rekomendacji">{T.doborBrakRekomendacji}</p>
          )}

          <h3 className="mvd-nn-studio-wykres-tytul">{T.doborWykresTytul}</h3>
          <BarChart width={720} height={260} data={daneWykresu} margin={{ top: 12, right: 20, left: 8, bottom: 60 }}>
            <CartesianGrid stroke="var(--mvd-line)" strokeDasharray="3 3" />
            <XAxis dataKey="etykieta" tick={{ fill: 'var(--mvd-muted)', fontSize: 10 }} stroke="var(--mvd-line)" angle={-30} textAnchor="end" height={70} />
            <YAxis
              tick={{ fill: 'var(--mvd-muted)', fontSize: 11 }}
              stroke="var(--mvd-line)"
              label={{ value: T.doborWykresOsY, angle: -90, position: 'insideLeft', fill: 'var(--mvd-muted)', fontSize: 11 }}
            />
            <Tooltip />
            <ReferenceLine y={dobor.ib_a} stroke="var(--mvd-warn)" strokeDasharray="5 5" label={{ value: 'Ib', position: 'right', fill: 'var(--mvd-warn)', fontSize: 10 }} />
            <ReferenceLine y={dobor.iz_prime_a} stroke="var(--mvd-accent)" strokeDasharray="5 5" label={{ value: 'Iz′', position: 'right', fill: 'var(--mvd-accent)', fontSize: 10 }} />
            <Bar dataKey="in" name="In" fill="var(--mvd-accent)" isAnimationActive={false} />
          </BarChart>
        </>
      ) : null}
    </div>
  );
}
