/**
 * Sekcja „Ocena zabezpieczeń na biegu zwarciowym" ekranu E-28 — uruchomienie biegu oceny
 * zabezpieczeń z modelu (`protection_sn`) i jego wynik na ścieżce projektanta.
 *
 * Karta BIEG-ZABEZPIECZEN-Z-MODELU: urządzenia i nastawy z modelu, prąd przekaźnika z rozpływu
 * zwarciowego wskazanego biegu, czasy z rdzenia IEC 60255. Sekcja:
 *  - wskazuje bieg zwarciowy (najnowszy 3F/2F wariantu maksymalnego albo minimalnego — ten sam
 *    wybór co koordynacja, `useBiegiKoordynacji`),
 *  - uruchamia bieg oceny (POST utworzenie + wykonanie) i pokazuje jego wynik,
 *  - po wejściu na ekran wczytuje ostatni zakończony bieg oceny projektu (wynik nie znika po
 *    nawigacji) ze statusem świeżości — zmiana nastaw w modelu czyni wynik nieaktualnym,
 *  - pokazuje oceny z rekordem werdyktu wyjaśnialnego, odmowy z akcją naprawczą (droga do
 *    edycji w modelu, E-27) i pominięte z przyczyną.
 * ZERO fizyki w UI — wszystkie liczby z backendu.
 */

import { useCallback, useEffect, useState } from 'react';

import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { fetchProtectionRuns } from '../../../ui/protection-comparison/api';
import { WIARYGODNOSC_PL } from '../../../ui/protection-comparison/types';
import { useBiegiKoordynacji } from '../../../ui/protection-coordination/biegiKoordynacji';
import { EtykietaWerdyktu } from '../wzorzec/KartaWerdyktu';
import {
  pobierzWynikOcenyZabezpieczen,
  uruchomOceneZabezpieczen,
  type OcenaUrzadzeniaWPunkcie,
  type WynikOcenyZabezpieczen,
} from './ocenaZabezpieczenApi';
import { KOORDYNACJA_STRINGS as T } from './strings';

type Wariant = 'max' | 'min';
type Stan = 'wczytywanie' | 'bezczynny' | 'wToku' | 'blad';

function liczba(wartosc: number | null, miejsca: number): string {
  return wartosc === null
    ? '—'
    : wartosc.toLocaleString('pl-PL', {
      maximumFractionDigits: miejsca,
      minimumFractionDigits: miejsca,
    });
}

function etykietaStopnia(ocena: OcenaUrzadzeniaWPunkcie): string {
  if (ocena.stopien_decydujacy === null) return T.ocenaNieZadziala;
  // Stopień decydujący zawsze jest w śladzie stopni punktu (backend `czas_urzadzenia`);
  // brak = kreska, nigdy kod funkcji na pierwszym planie.
  return ocena.stopnie.find((s) => s.funkcja === ocena.stopien_decydujacy)?.etykieta_pl ?? '—';
}

export function SekcjaOcenyZabezpieczen({
  projectId,
  caseId,
}: {
  projectId: string;
  caseId: string;
}) {
  const biegi = useBiegiKoordynacji();
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const [wariant, setWariant] = useState<Wariant>('max');
  const [wynik, setWynik] = useState<WynikOcenyZabezpieczen | null>(null);
  const [stan, setStan] = useState<Stan>('wczytywanie');
  const [blad, setBlad] = useState<string | null>(null);

  // Ostatni zakończony bieg oceny projektu — wynik przeżywa nawigację.
  useEffect(() => {
    let anulowano = false;
    setStan('wczytywanie');
    fetchProtectionRuns(projectId)
      .then(async (lista) => {
        const ostatni = lista[0];
        const odczyt = ostatni ? await pobierzWynikOcenyZabezpieczen(ostatni.id) : null;
        if (anulowano) return;
        setWynik(odczyt);
        setStan('bezczynny');
      })
      .catch((err: unknown) => {
        if (anulowano) return;
        setBlad(err instanceof Error ? err.message : String(err));
        setStan('blad');
      });
    return () => {
      anulowano = true;
    };
  }, [projectId]);

  // Wariant bez biegu przełącza się na dostępny (wybór widoczny w polu wyboru).
  useEffect(() => {
    if (!biegi[wariant] && biegi[wariant === 'max' ? 'min' : 'max']) {
      setWariant(wariant === 'max' ? 'min' : 'max');
    }
  }, [biegi, wariant]);

  const scRunId = biegi[wariant];

  const uruchom = useCallback(async () => {
    if (!scRunId) return;
    setStan('wToku');
    setBlad(null);
    try {
      const runId = await uruchomOceneZabezpieczen(projectId, caseId, scRunId);
      setWynik(await pobierzWynikOcenyZabezpieczen(runId));
      setStan('bezczynny');
    } catch (err) {
      setBlad(err instanceof Error ? err.message : String(err));
      setStan('blad');
    }
  }, [caseId, projectId, scRunId]);

  const doEdycji = () => openRouteSurface('E-27');

  return (
    <section className="mvd-koordynacja-ocena" data-testid="mvd-ocena-zabezpieczen">
      <h3>{T.ocenaTytul}</h3>
      <p className="mvd-koordynacja-ocena-opis">{T.ocenaOpis}</p>

      <div className="mvd-koordynacja-ocena-pasek">
        <label>
          {T.ocenaWariant}{' '}
          <select
            value={wariant}
            onChange={(e) => setWariant(e.target.value as Wariant)}
            data-testid="mvd-ocena-zabezpieczen-wariant"
          >
            <option value="max" disabled={!biegi.max}>{T.ocenaWariantMax}</option>
            <option value="min" disabled={!biegi.min}>{T.ocenaWariantMin}</option>
          </select>
        </label>
        <button
          type="button"
          className="mvd-koordynacja-akcja"
          disabled={!scRunId || stan === 'wToku'}
          onClick={() => void uruchom()}
          data-testid="mvd-ocena-zabezpieczen-uruchom"
        >
          {stan === 'wToku' ? T.ocenaWToku : T.ocenaUruchom}
        </button>
      </div>
      {!biegi.max && !biegi.min ? (
        <p className="mvd-koordynacja-ocena-uwaga" data-testid="mvd-ocena-zabezpieczen-brak-biegu">
          {T.ocenaBrakBiegu}
        </p>
      ) : null}
      {stan === 'wczytywanie' ? <p>{T.ocenaWczytywanie}</p> : null}
      {blad ? (
        <p className="mvd-koordynacja-ocena-blad" role="alert" data-testid="mvd-ocena-zabezpieczen-blad">
          {blad}
        </p>
      ) : null}
      {stan !== 'wczytywanie' && !wynik && !blad ? (
        <p data-testid="mvd-ocena-zabezpieczen-brak-wyniku">{T.ocenaBrakWyniku}</p>
      ) : null}

      {wynik ? (
        <div data-testid="mvd-ocena-zabezpieczen-wynik">
          {wynik.result_status === 'OUTDATED' ? (
            <p className="mvd-koordynacja-ocena-uwaga" data-testid="mvd-ocena-zabezpieczen-nieaktualny">
              <strong>{T.ocenaNieaktualna}:</strong> {wynik.result_status_reason_pl}
            </p>
          ) : null}
          <p data-testid="mvd-ocena-zabezpieczen-podsumowanie">
            {T.ocenaPodsumowanie(
              wynik.summary.total_evaluations,
              wynik.summary.trips_count,
              wynik.summary.no_trip_count,
              wynik.summary.unreliable_count,
            )}
          </p>
          {wynik.evaluations.length > 0 ? (
            <table className="mvd-koordynacja-ocena-tabela">
              <thead>
                <tr>
                  <th>{T.ocenaKolUrzadzenie}</th>
                  <th>{T.ocenaKolPunkt}</th>
                  <th>{T.ocenaKolPrad}</th>
                  <th>{T.ocenaKolStopien}</th>
                  <th>{T.ocenaKolCzas}</th>
                  <th>{T.ocenaKolWiarygodnosc}</th>
                  <th>{T.ocenaKolOcena}</th>
                </tr>
              </thead>
              <tbody>
                {wynik.evaluations.map((o) => (
                  <tr
                    key={`${o.device_id}::${o.fault_target_id}`}
                    data-testid={`mvd-ocena-zabezpieczen-wiersz-${o.device_id}-${o.fault_target_id}`}
                  >
                    <td>{o.nazwa_urzadzenia_pl}</td>
                    <td>{o.nazwa_punktu_pl}</td>
                    <td className="mvd-mono">{liczba(o.i_fault_a, 1)}</td>
                    <td>{etykietaStopnia(o)}</td>
                    <td className="mvd-mono">{liczba(o.t_trip_s, 3)}</td>
                    <td title={o.wiarygodnosc_powod_pl}>{WIARYGODNOSC_PL[o.wiarygodnosc]}</td>
                    <td>
                      <EtykietaWerdyktu etykieta={o.ocena.etykieta} status={o.ocena.status_maszynowy} />{' '}
                      <span className="mvd-koordynacja-ocena-zdanie">
                        {o.ocena.wyjasnienie.zdanie_pl}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {wynik.odmowy.length > 0 ? (
            <div className="mvd-koordynacja-ocena-uwaga" data-testid="mvd-ocena-zabezpieczen-odmowy">
              <h4>{T.ocenaOdmowyTytul}</h4>
              <ul>
                {wynik.odmowy.map((o) => (
                  <li key={o.urzadzenie_ref}>
                    <strong>{o.nazwa_pl}:</strong>{' '}
                    {o.braki.map((b) => `${b.komunikat_pl} ${b.akcja_naprawcza_pl}`).join(' ')}{' '}
                    <button
                      type="button"
                      className="mvd-koordynacja-akcja"
                      onClick={doEdycji}
                      data-testid={`mvd-ocena-zabezpieczen-uzupelnij-${o.urzadzenie_ref}`}
                    >
                      {T.ocenaUzupelnij}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {wynik.pominiete.length > 0 ? (
            <div data-testid="mvd-ocena-zabezpieczen-pominiete">
              <h4>{T.ocenaPominieteTytul}</h4>
              <ul>
                {wynik.pominiete.map((p) => (
                  <li key={p.urzadzenie_ref}>
                    {p.nazwa_pl}: {p.powod_pl}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
