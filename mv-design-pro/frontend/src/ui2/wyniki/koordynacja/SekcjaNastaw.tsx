/**
 * Sekcja „Nastawy nadprądowe I>/I>>" — metoda Hoppela/IRiESD, jedyna metodyka
 * nastaw w systemie (karta W3-C1, kasacja V12K-189 — druga metodyka miała ZERO
 * producentów biegów i ZERO konsumentów frontendu).
 *
 * Tor pracy (kontrakt ekranu prowadzącego, FLOW_PROJEKTANTA §0.3):
 *  - kotwica = ostatni ZAKOŃCZONY bieg zwarcia trójfazowego gałęzi maksymalnej
 *    (c_max) tego przypadku — ta sama droga do biegów, którą zna `EkranKoordynacji`
 *    (`useExecutionRunsStore`); backend jest jedynym sędzią „czy to c_max" (dostępność
 *    sprawdza to samo, czego wymaga budowa — predykaty parami, karta W3-C1),
 *  - brak kotwicy → uczciwy stan zerowy z akcją „Uruchom zwarcie 3F (c_max)",
 *  - dostępność → wybór chronionego odcinka i kolejnej szyny (listy z odpowiedzi;
 *    pusta lista niesie powód, nie ogólnik),
 *  - parametry inżynierskie (c_min, Δt, k_b, k_bth) jako jawne pola z wartością
 *    domyślną opisaną źródłem — nic ukrytego,
 *  - wynik: I>, I>>, sprawdzenie cieplne, SPZ, uwagi silnika — każda liczba z
 *    odpowiedzi backendu, ZERO liczenia w UI,
 *  - pobranie pakietu dowodowego (ZIP) tym samym zapytaniem,
 *  - dopasowanie do aparatu z katalogu analitycznego.
 */

import { useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import type { ExecutionRun } from '../../../ui/study-cases/types';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useShellStore } from '../../shell/useShellStore';
import {
  BrakKotwicyNastaw,
  PARAMETRY_NASTAW_DOMYSLNE,
  adresPakietuDowodowego,
  fetchAparatyKatalogu,
  fetchDopasowanieAparatu,
  fetchDostepnoscNastaw,
  fetchNastawy,
  type AparatKatalogu,
  type DopasowanieAparatu,
  type DostepnoscNastaw,
  type OdpowiedzNastaw,
  type ParametryNastaw,
} from './nastawyApi';
import { KOORDYNACJA_STRINGS as T } from './strings';

type FazaKotwicy = 'szukanie' | 'brak' | 'gotowa' | 'blad';
type FazaWyniku = 'idle' | 'liczenie' | 'gotowe' | 'blad';
type FazaDopasowania = 'idle' | 'liczenie' | 'gotowe' | 'blad';

/** Kandydaci na kotwicę: zwarcia trójfazowe ZAKOŃCZONE, najnowsze najpierw —
 * ten sam kontrakt runStore, którego `EkranKoordynacji` używa do stanu zerowego
 * (`maZakonczonyPrzebieg`); TU dodatkowo sortujemy, bo próbujemy kandydatów po
 * kolei (backend jest jedynym sędzią „czy to c_max", patrz nagłówek modułu). */
function kandydaciKotwicy(runs: readonly ExecutionRun[]): readonly ExecutionRun[] {
  return runs
    .filter((r) => r.analysis_type === 'SC_3F' && r.status === 'DONE')
    .slice()
    .sort((a, b) =>
      String(b.finished_at ?? '').localeCompare(String(a.finished_at ?? '')),
    );
}

function WierszWarunku({
  etykieta,
  wartosc,
  jednostka,
  spelniony,
}: {
  etykieta: string;
  wartosc: number;
  jednostka: string;
  spelniony?: boolean;
}) {
  return (
    <tr>
      <th scope="row">{etykieta}</th>
      <td>
        {wartosc.toFixed(1)} {jednostka}
      </td>
      <td>
        {spelniony === undefined ? '—' : (
          <span data-tone={spelniony ? 'ok' : 'warn'}>{spelniony ? 'Spełniony' : 'NIE spełniony'}</span>
        )}
      </td>
    </tr>
  );
}

function TabelaDopasowania({ dopasowanie }: { dopasowanie: DopasowanieAparatu }) {
  const wpisyNastaw = Object.entries(dopasowanie.mapped_settings);
  const wpisyVendor = Object.entries(dopasowanie.vendor_mapping.vendor_settings);
  return (
    <div className="mvd-koordynacja-dopasowanie-wynik" data-testid="mvd-koordynacja-dopasowanie-wynik">
      <p data-testid="mvd-koordynacja-dopasowanie-werdykt" data-tone={dopasowanie.compatible ? 'ok' : 'bad'}>
        {dopasowanie.compatible ? T.nastawyDopasowanieZgodny : T.nastawyDopasowanieNiezgodny}
      </p>
      {dopasowanie.violations.length > 0 ? (
        <div>
          <h5>{T.nastawyDopasowanieNaruszenia}</h5>
          <ul>
            {dopasowanie.violations.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {wpisyNastaw.length > 0 ? (
        <table className="mvd-koordynacja-nastawy-tabela">
          <thead>
            <tr>
              <th scope="col">Nastawa logiczna</th>
              <th scope="col">{T.nastawyKolumnaWartosc}</th>
            </tr>
          </thead>
          <tbody>
            {wpisyNastaw.map(([klucz, wartosc]) => (
              <tr key={klucz}>
                <th scope="row">{klucz}</th>
                <td>{String(wartosc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {dopasowanie.vendor_mapping.vendor === null ? (
        <p data-tone="idle">{T.nastawyDopasowanieBrakVendora}</p>
      ) : wpisyVendor.length > 0 ? (
        <div>
          <h5>
            {T.nastawyDopasowanieNastawyAparatu} ({dopasowanie.vendor_mapping.vendor})
          </h5>
          <table className="mvd-koordynacja-nastawy-tabela">
            <tbody>
              {wpisyVendor.map(([klucz, wartosc]) => (
                <tr key={klucz}>
                  <th scope="row">{klucz}</th>
                  <td>{String(wartosc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {dopasowanie.assumptions.length > 0 ? (
        <p className="mvd-koordynacja-dopasowanie-zalozenia">
          {T.nastawyDopasowanieZalozenia}: {dopasowanie.assumptions.join(', ')}
        </p>
      ) : null}
    </div>
  );
}

export function SekcjaNastaw({ caseId }: { caseId: string }) {
  const setActiveSpace = useShellStore((s) => s.setActiveSpace);
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const przebiegi = useExecutionRunsStore((s) => s.runs);

  const [fazaKotwicy, setFazaKotwicy] = useState<FazaKotwicy>('szukanie');
  const [runId, setRunId] = useState<string | null>(null);
  const [dostepnosc, setDostepnosc] = useState<DostepnoscNastaw | null>(null);
  const [powodBrakuKotwicy, setPowodBrakuKotwicy] = useState<string | null>(null);
  const [bladKotwicy, setBladKotwicy] = useState<string | null>(null);

  const [linia, setLinia] = useState<string>('');
  const [szyna, setSzyna] = useState<string>('');
  const [parametry, setParametry] = useState<ParametryNastaw>(PARAMETRY_NASTAW_DOMYSLNE);

  const [fazaWyniku, setFazaWyniku] = useState<FazaWyniku>('idle');
  const [odpowiedz, setOdpowiedz] = useState<OdpowiedzNastaw | null>(null);
  const [bladWyniku, setBladWyniku] = useState<string | null>(null);

  const [aparaty, setAparaty] = useState<readonly AparatKatalogu[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [fazaDopasowania, setFazaDopasowania] = useState<FazaDopasowania>('idle');
  const [dopasowanie, setDopasowanie] = useState<DopasowanieAparatu | null>(null);
  const [bladDopasowania, setBladDopasowania] = useState<string | null>(null);

  const kandydaci = useMemo(() => kandydaciKotwicy(przebiegi), [przebiegi]);

  // Krok 1: znajdź kotwicę — spróbuj kandydatów SC_3F DONE od najnowszego,
  // pierwszy `dostepny: true` wygrywa. Backend (nie UI) osądza c_max.
  useEffect(() => {
    const controller = new AbortController();
    setFazaKotwicy('szukanie');
    setRunId(null);
    setDostepnosc(null);
    setPowodBrakuKotwicy(null);
    setBladKotwicy(null);
    setLinia('');
    setSzyna('');
    setFazaWyniku('idle');
    setOdpowiedz(null);

    if (kandydaci.length === 0) {
      setFazaKotwicy('brak');
      return () => controller.abort();
    }

    (async () => {
      let ostatniPowod: string | null = null;
      for (const kandydat of kandydaci) {
        try {
          const wynik = await fetchDostepnoscNastaw(kandydat.id, { signal: controller.signal });
          if (wynik.dostepny) {
            setRunId(kandydat.id);
            setDostepnosc(wynik);
            setFazaKotwicy('gotowa');
            return;
          }
          ostatniPowod = wynik.powod_pl;
        } catch (e: unknown) {
          if (controller.signal.aborted) return;
          if (e instanceof BrakKotwicyNastaw) continue;
          setBladKotwicy(e instanceof Error ? e.message : T.nastawyBlad);
          setFazaKotwicy('blad');
          return;
        }
      }
      if (controller.signal.aborted) return;
      setPowodBrakuKotwicy(ostatniPowod);
      setFazaKotwicy('brak');
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kandydaci, caseId]);

  // Lista aparatów katalogu — niezależna od kotwicy, wczytana raz.
  useEffect(() => {
    const controller = new AbortController();
    fetchAparatyKatalogu({ signal: controller.signal })
      .then((lista) => {
        if (!controller.signal.aborted) setAparaty(lista);
      })
      .catch(() => {
        // Lista aparatów jest wzbogaceniem sekcji dopasowania — jej brak nie
        // wywraca nastaw, sekcja dopasowania po prostu nie ma czego zaoferować.
      });
    return () => controller.abort();
  }, []);

  const liniaWybrana = dostepnosc?.linie.find((l) => l.line_id === linia) ?? null;
  const szynyKandydujace = liniaWybrana?.nastepne_szyny_kandydujace ?? [];

  async function policzNastawy() {
    if (!runId || !linia || !szyna) return;
    setFazaWyniku('liczenie');
    setBladWyniku(null);
    setOdpowiedz(null);
    setDopasowanie(null);
    setFazaDopasowania('idle');
    try {
      const wynik = await fetchNastawy(runId, linia, szyna, parametry);
      setOdpowiedz(wynik);
      setFazaWyniku('gotowe');
    } catch (e: unknown) {
      setBladWyniku(e instanceof Error ? e.message : T.nastawyBlad);
      setFazaWyniku('blad');
    }
  }

  async function dopasujAparat(idAparatu: string) {
    setDeviceId(idAparatu);
    if (!runId || !linia || !szyna || !idAparatu) return;
    setFazaDopasowania('liczenie');
    setBladDopasowania(null);
    try {
      const wynik = await fetchDopasowanieAparatu(runId, idAparatu, linia, szyna, parametry);
      setDopasowanie(wynik);
      setFazaDopasowania('gotowe');
    } catch (e: unknown) {
      setBladDopasowania(e instanceof Error ? e.message : T.nastawyBlad);
      setFazaDopasowania('blad');
    }
  }

  if (!activeProjectId) return null;

  if (fazaKotwicy === 'szukanie') {
    return (
      <section className="mvd-koordynacja-nastawy" data-testid="mvd-koordynacja-nastawy-ladowanie">
        <h3>{T.nastawyTytul}</h3>
        <p>{T.nastawyLadowanie}</p>
      </section>
    );
  }

  if (fazaKotwicy === 'blad') {
    return (
      <section className="mvd-koordynacja-stan" data-testid="mvd-koordynacja-nastawy-blad" data-tone="bad">
        <h3>{T.nastawyBlad}</h3>
        <p>{bladKotwicy ?? T.nastawyBlad}</p>
      </section>
    );
  }

  if (fazaKotwicy === 'brak') {
    return (
      <section className="mvd-koordynacja-stan" data-testid="mvd-koordynacja-nastawy-brak" data-tone="idle">
        <h3>{T.nastawyBrakKotwicyTytul}</h3>
        <p>{powodBrakuKotwicy ?? T.nastawyBrakKotwicyOpis}</p>
        <button
          type="button"
          className="mvd-koordynacja-akcja"
          data-testid="mvd-koordynacja-nastawy-brak-akcja"
          onClick={() => setActiveSpace('obliczenia')}
        >
          {T.nastawyBrakKotwicyAkcja}
        </button>
      </section>
    );
  }

  if (dostepnosc === null) return null; // nieosiągalne (fazaKotwicy === 'gotowa' implikuje dostepnosc), strażnik typu

  return (
    <section className="mvd-koordynacja-nastawy" data-testid="mvd-koordynacja-nastawy">
      <h3>{T.nastawyTytul}</h3>
      <p>{T.nastawyOpis}</p>

      {dostepnosc.linie.length === 0 ? (
        <div data-testid="mvd-koordynacja-nastawy-brak-odcinkow" data-tone="idle">
          <h4>{T.nastawyBrakOdcinkowTytul}</h4>
          <p>{T.nastawyBrakOdcinkowOpis}</p>
        </div>
      ) : (
        <>
          <div className="mvd-koordynacja-nastawy-wybor">
            <label htmlFor="mvd-nastawy-linia">{T.nastawyWybierzOdcinek}</label>
            <select
              id="mvd-nastawy-linia"
              data-testid="mvd-koordynacja-nastawy-select-linia"
              value={linia}
              onChange={(e) => {
                setLinia(e.target.value);
                setSzyna('');
                setFazaWyniku('idle');
                setOdpowiedz(null);
              }}
            >
              <option value="">{T.nastawyWybierzOdcinekPlaceholder}</option>
              {dostepnosc.linie.map((l) => (
                <option key={l.line_id} value={l.line_id}>
                  {l.nazwa}
                </option>
              ))}
            </select>

            {linia ? (
              szynyKandydujace.length === 0 ? (
                <p data-testid="mvd-koordynacja-nastawy-brak-szyn" data-tone="idle">
                  {T.nastawyBrakSzynKandydujacych}
                </p>
              ) : (
                <>
                  <label htmlFor="mvd-nastawy-szyna">{T.nastawyWybierzSzyne}</label>
                  <select
                    id="mvd-nastawy-szyna"
                    data-testid="mvd-koordynacja-nastawy-select-szyna"
                    value={szyna}
                    onChange={(e) => setSzyna(e.target.value)}
                  >
                    <option value="">{T.nastawyWybierzSzynePlaceholder}</option>
                    {szynyKandydujace.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </>
              )
            ) : null}
          </div>

          {linia && szyna ? (
            <div className="mvd-koordynacja-nastawy-parametry" data-testid="mvd-koordynacja-nastawy-parametry">
              <h4>{T.nastawyParametryTytul}</h4>
              <label>
                {T.nastawyParametrCMin} <span className="mvd-koordynacja-param-zrodlo">({T.nastawyParametrCMinZrodlo})</span>
                <input
                  type="number"
                  step="0.01"
                  data-testid="mvd-koordynacja-nastawy-param-c-min"
                  value={parametry.c_min}
                  onChange={(e) => setParametry({ ...parametry, c_min: Number(e.target.value) })}
                />
              </label>
              <label>
                {T.nastawyParametrDeltaT} <span className="mvd-koordynacja-param-zrodlo">({T.nastawyParametrDeltaTZrodlo})</span>
                <input
                  type="number"
                  step="0.01"
                  data-testid="mvd-koordynacja-nastawy-param-delta-t"
                  value={parametry.delta_t_s}
                  onChange={(e) => setParametry({ ...parametry, delta_t_s: Number(e.target.value) })}
                />
              </label>
              <label>
                {T.nastawyParametrKb} <span className="mvd-koordynacja-param-zrodlo">({T.nastawyParametrKbZrodlo})</span>
                <input
                  type="number"
                  step="0.01"
                  data-testid="mvd-koordynacja-nastawy-param-k-b"
                  value={parametry.k_b}
                  onChange={(e) => setParametry({ ...parametry, k_b: Number(e.target.value) })}
                />
              </label>
              <label>
                {T.nastawyParametrKbth} <span className="mvd-koordynacja-param-zrodlo">({T.nastawyParametrKbthZrodlo})</span>
                <input
                  type="number"
                  step="0.01"
                  data-testid="mvd-koordynacja-nastawy-param-k-bth"
                  value={parametry.k_bth}
                  onChange={(e) => setParametry({ ...parametry, k_bth: Number(e.target.value) })}
                />
              </label>
              <button
                type="button"
                className="mvd-koordynacja-akcja"
                data-testid="mvd-koordynacja-nastawy-policz"
                onClick={() => void policzNastawy()}
              >
                {T.nastawyLiczSzynaPrzycisk}
              </button>
            </div>
          ) : null}

          {fazaWyniku === 'liczenie' ? <p data-testid="mvd-koordynacja-nastawy-liczenie">{T.nastawyLiczenie}</p> : null}
          {fazaWyniku === 'blad' ? (
            <p data-testid="mvd-koordynacja-nastawy-wynik-blad" data-tone="bad">
              {bladWyniku}
            </p>
          ) : null}

          {fazaWyniku === 'gotowe' && odpowiedz ? (
            <div data-testid="mvd-koordynacja-nastawy-wynik">
              <p
                data-testid="mvd-koordynacja-nastawy-werdykt"
                data-tone={odpowiedz.wynik.overall_valid ? 'ok' : 'warn'}
              >
                {odpowiedz.wynik.overall_valid ? T.nastawyWynikKompletny : T.nastawyWynikNiepelny}
              </p>

              <h4>{T.nastawySekcjaZwloczna}</h4>
              <table className="mvd-koordynacja-nastawy-tabela">
                <tbody>
                  <tr>
                    <th scope="row">{T.nastawyPradNastawy}</th>
                    <td>{odpowiedz.wynik.delayed.i_setting_a.toFixed(1)} A</td>
                  </tr>
                  <tr>
                    <th scope="row">{T.nastawyCzasNastawy}</th>
                    <td>{odpowiedz.wynik.delayed.t_setting_s.toFixed(2)} s</td>
                  </tr>
                  <tr>
                    <th scope="row">{T.nastawyCzulosc}</th>
                    <td>{odpowiedz.wynik.delayed.sensitivity_ratio.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <h4>{T.nastawySekcjaBezzwloczna}</h4>
              <table className="mvd-koordynacja-nastawy-tabela">
                <thead>
                  <tr>
                    <th scope="col">{T.nastawyKolumnaWarunek}</th>
                    <th scope="col">{T.nastawyKolumnaWartosc}</th>
                    <th scope="col">Stan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Nastawa I&gt;&gt;</th>
                    <td>{odpowiedz.wynik.instantaneous.i_setting_a.toFixed(1)} A</td>
                    <td>
                      <span data-tone={odpowiedz.wynik.instantaneous.range_valid ? 'ok' : 'warn'}>
                        {odpowiedz.wynik.instantaneous.range_valid ? T.nastawyZakresIstnieje : T.nastawyZakresBrak}
                      </span>
                    </td>
                  </tr>
                  <WierszWarunku
                    etykieta={T.nastawyWarunekSelektywnosc}
                    wartosc={odpowiedz.wynik.instantaneous.i_min_selectivity_a}
                    jednostka="A"
                  />
                  <WierszWarunku
                    etykieta={T.nastawyWarunekCieplny}
                    wartosc={odpowiedz.wynik.instantaneous.i_max_thermal_a}
                    jednostka="A"
                  />
                  <WierszWarunku
                    etykieta={T.nastawyWarunekCzulosc}
                    wartosc={odpowiedz.wynik.instantaneous.i_max_sensitivity_a}
                    jednostka="A"
                  />
                </tbody>
              </table>

              <h4>{T.nastawySekcjaCieplna}</h4>
              <table className="mvd-koordynacja-nastawy-tabela">
                <tbody>
                  <tr>
                    <th scope="row">{T.nastawyPradDopuszczalny}</th>
                    <td>{odpowiedz.wynik.thermal.i_th_dop_a.toFixed(1)} A</td>
                  </tr>
                  <tr>
                    <th scope="row">{T.nastawyMargines}</th>
                    <td>{odpowiedz.wynik.thermal.margin_percent.toFixed(1)} %</td>
                  </tr>
                  <tr>
                    <th scope="row">Werdykt</th>
                    <td>
                      <span data-tone={odpowiedz.wynik.thermal.is_adequate ? 'ok' : 'bad'}>
                        {odpowiedz.wynik.thermal.is_adequate ? T.nastawyWytrzymujeTak : T.nastawyWytrzymujeNie}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <h4>{T.nastawySekcjaSpz}</h4>
              <p data-tone={odpowiedz.wynik.spz.blocking_recommended ? 'warn' : 'ok'}>
                {odpowiedz.wynik.spz.blocking_recommended ? T.nastawySpzBlokada : T.nastawySpzDozwolone}
              </p>

              {odpowiedz.wynik.summary_notes.length > 0 ? (
                <div data-testid="mvd-koordynacja-nastawy-uwagi">
                  <h4>{T.nastawyUwagiSilnika}</h4>
                  <ul>
                    {odpowiedz.wynik.summary_notes.map((uwaga) => (
                      <li key={uwaga}>{uwaga}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {odpowiedz.dostepnosc_pakietu ? (
                <a
                  href={adresPakietuDowodowego(runId ?? '', linia, szyna, parametry)}
                  className="mvd-koordynacja-akcja"
                  data-testid="mvd-koordynacja-nastawy-pobierz-zip"
                >
                  {T.nastawyPobierzZip}
                </a>
              ) : null}

              <section className="mvd-koordynacja-dopasowanie" data-testid="mvd-koordynacja-dopasowanie">
                <h4>{T.nastawyDopasowanieTytul}</h4>
                <p>{T.nastawyDopasowanieOpis}</p>
                <label htmlFor="mvd-nastawy-aparat">{T.nastawyWybierzAparat}</label>
                <select
                  id="mvd-nastawy-aparat"
                  data-testid="mvd-koordynacja-dopasowanie-select-aparat"
                  value={deviceId}
                  onChange={(e) => void dopasujAparat(e.target.value)}
                >
                  <option value="">{T.nastawyWybierzAparatPlaceholder}</option>
                  {aparaty.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name_pl}
                    </option>
                  ))}
                </select>

                {fazaDopasowania === 'liczenie' ? <p>{T.nastawyLiczenie}</p> : null}
                {fazaDopasowania === 'blad' ? (
                  <p data-testid="mvd-koordynacja-dopasowanie-blad" data-tone="bad">
                    {bladDopasowania}
                  </p>
                ) : null}
                {fazaDopasowania === 'gotowe' && dopasowanie ? (
                  <TabelaDopasowania dopasowanie={dopasowanie} />
                ) : null}
              </section>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
