/*
 * EkranRankingu — okno „Ranking punktów przyłączenia" (strumień OZE). Dla wybranych
 * węzłów-kandydatów JAWNYM przyciskiem uruchamia JEDEN bieg zdolności przyłączeniowej
 * (`GET /api/oze-analysis/hosting-capacity`, pola D3a) i prezentuje SORTOWALNĄ tabelę
 * na WSPÓLNYM WZORCU EKRANU ANALIZY (`ui2/wyniki/wzorzec`): węzeł, maks. moc
 * przyłączalna (domyślny ranking malejąco), kryterium wiążące PL, przyrost strat przy
 * mocy granicznej [kW], skrajne napięcia przy granicy [p.u.] oraz klasę NC RfG
 * (mapowanie słownikowe z progów katalogu wybranego operatora). Wybór wiersza →
 * szczegół węzła ze śladem scenariuszy (reużycie utili z okna „Zdolność przyłączeniowa").
 *
 * Zero fizyki, zero ocen lokalnych — wszystkie wartości pochodzą z backendu.
 * Przebieg rozpływu dobierany z rejestru (LOAD_FLOW/DONE). Identyfikatory (bus_ref,
 * przebieg) wyłącznie w trybie eksperckim.
 */

import { useEffect, useMemo, useState } from 'react';
import './ranking.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { EkranAnalizy } from '../../wyniki/wzorzec';
import type { WierszZalozenia } from '../../wyniki/wzorzec';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore, selectBusOptions } from '../../../ui/topology/snapshotStore';
import {
  pobierzKatalogKlasNcRfg,
  pobierzZdolnoscPrzylaczeniowa,
  type OdpowiedzKatalogNcRfg,
  type WezelZdolnosci,
  type WidokZdolnosci,
  type ZapytanieZdolnosci,
} from '../api';
import {
  elementKryterium,
  etykietaWezla,
  istotnoscScenariusza,
  rodzajKryteriumPL,
  statusScenariuszaPL,
  wybierzPrzebiegRozplywu,
} from '../zdolnosc/zdolnoscModel';
import { fmtMW } from '../zdolnosc/strings';
import { PrzylaczZrodloPrzycisk } from '../PrzylaczZrodloPrzycisk';
import {
  KLUCZ_WIERSZA_RANKINGU,
  klasaNcRfg,
  klasyOperatora,
  kolumnyRankingu,
  napieciaPrzyGranicy,
  przyrostStratKw,
  wierszeRankingu,
} from './rankingModel';
import { RANKING_STRINGS, fmtMocMW, fmtNapieciaPara, fmtStratyKw } from './strings';
import { useSwiezoscNaglowka } from '../../freshness';

const DOMYSLNY_KROK_MW = 0.5;
const DOMYSLNA_LICZBA_KROKOW = 40;

type StanZasobu =
  | { readonly rodzaj: 'idle' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: WidokZdolnosci };

function StanPanel({
  komunikat,
  opis,
  wariant,
  testid,
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-rank-stan mvd-rank-stan--blad' : 'mvd-rank-stan'}
      data-testid={testid}
    >
      <p className="mvd-rank-stan-title">{komunikat}</p>
      {opis && <p className="mvd-rank-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Szczegół wybranego węzła — podsumowanie + ślad scenariuszy (reużycie P2)
// ---------------------------------------------------------------------------

function SzczegolWezla({
  wezel,
  napiecieKv,
  klasyKatalogu,
  trybEkspercki,
}: {
  wezel: WezelZdolnosci;
  napiecieKv: number | null;
  klasyKatalogu: ReturnType<typeof klasyOperatora>;
  trybEkspercki: boolean;
}) {
  const przyrost = przyrostStratKw(wezel);
  const napiecia = napieciaPrzyGranicy(wezel);
  const klasa = klasaNcRfg(wezel.max_hosting_capacity_mw, napiecieKv, klasyKatalogu);

  return (
    <section className="mvd-rank-szczegol" data-testid="mvd-rank-szczegol">
      <header className="mvd-rank-szczegol-naglowek">
        <h3 className="mvd-rank-szczegol-tytul">{RANKING_STRINGS.szczegolTytul}</h3>
        <span className="mvd-rank-szczegol-nazwa">{etykietaWezla(wezel)}</span>
        {trybEkspercki && (
          <span className="mvd-rank-szczegol-id" aria-label={RANKING_STRINGS.kolIdentyfikator}>
            {wezel.bus_ref}
          </span>
        )}
      </header>

      <dl className="mvd-rank-szczegol-lista">
        <dt>{RANKING_STRINGS.szczegolMoc}</dt>
        <dd className="mvd-num">
          {fmtMocMW(wezel.max_hosting_capacity_mw)} {RANKING_STRINGS.jednMW}
        </dd>
        <dt>{RANKING_STRINGS.szczegolKryterium}</dt>
        <dd>{rodzajKryteriumPL(wezel.binding_criterion)}</dd>
        <dt>{RANKING_STRINGS.szczegolStraty}</dt>
        <dd className="mvd-num">
          {przyrost === null
            ? RANKING_STRINGS.kreska
            : `${fmtStratyKw(przyrost)} ${RANKING_STRINGS.jednKW}`}
        </dd>
        <dt>{RANKING_STRINGS.szczegolNapiecia}</dt>
        <dd className="mvd-num">
          {napiecia === null
            ? RANKING_STRINGS.kreska
            : `${fmtNapieciaPara(napiecia.min, napiecia.max)} ${RANKING_STRINGS.jednPU}`}
        </dd>
        <dt>{RANKING_STRINGS.szczegolKlasa}</dt>
        <dd>{klasa !== null ? `${klasa.id} — ${klasa.description_pl}` : RANKING_STRINGS.kreska}</dd>
      </dl>

      {/* K5-B (H-3 pkt 1): pętla ranking → model — formularz źródła OZE
          z preselekcją wybranego węzła (bus_ref z odpowiedzi backendu). */}
      <PrzylaczZrodloPrzycisk
        busRef={wezel.bus_ref}
        busName={wezel.bus_name ?? null}
        zrodloAkcji="ranking_wezel"
        testid="mvd-rank-przylacz"
      />

      <div>
        <span className="mvd-rank-slad-tytul">{RANKING_STRINGS.sladTytul}</span>
        <ol className="mvd-rank-slad-lista" data-testid="mvd-rank-slad">
          {wezel.scenarios.map((scenariusz, i) => (
            <li key={i} className="mvd-rank-slad-poz">
              <span className="mvd-rank-slad-moc mvd-num">
                {fmtMW(scenariusz.added_power_mw)} {RANKING_STRINGS.jednMW}
              </span>
              <span
                className={`mvd-rank-slad-status mvd-rank-slad-status--${istotnoscScenariusza(scenariusz)}`}
              >
                {statusScenariuszaPL(scenariusz)}
              </span>
              {!scenariusz.acceptable && elementKryterium(scenariusz.binding) && (
                <span className="mvd-rank-slad-element">
                  {rodzajKryteriumPL(scenariusz.binding)}
                  {': '}
                  {elementKryterium(scenariusz.binding)}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Wynik: tabela wzorca + szczegół wybranego węzła
// ---------------------------------------------------------------------------

function WynikRankingu({
  dane,
  runId,
  krokMw,
  liczbaKrokow,
  operatorNazwaPL,
  napiecieWezla,
  klasyKatalogu,
  trybZaawansowania,
}: {
  dane: WidokZdolnosci;
  /**
   * Identyfikator PRZEBIEGU (V12K-265).
   *
   * Naglowek bral go z `dane.context.trace_id`. Pole jest ZLE NAZWANE po stronie
   * backendu: `hosting_capacity.py` wpisuje tam `str(run.id)`, a prawdziwe
   * `trace_id` w tym systemie to skrot tresci artefaktu
   * (`trace_emitters/deterministic_ids.py`), nie identyfikator biegu. Wartosc jest
   * wiec dzis poprawna, ale nazwa klamie — nowy kod nie moze na niej stac.
   * Rodzic zna `runId` z rejestru przebiegow i podaje go tu wprost.
   */
  runId: string | null;
  krokMw: number;
  liczbaKrokow: number;
  operatorNazwaPL: string;
  napiecieWezla: (busRef: string) => number | null;
  klasyKatalogu: ReturnType<typeof klasyOperatora>;
  trybZaawansowania: AdvancementMode;
}) {
  const [wybranyBusRef, setWybranyBusRef] = useState<string | null>(null);
  // V12K-264/265: znacznik swiezosci + panel przyczyn z JEDNEJ derywacji.
  const swiezosc = useSwiezoscNaglowka(runId);

  const kolumny = useMemo(() => kolumnyRankingu(), []);
  const wiersze = useMemo(
    () => wierszeRankingu(dane.nodes, napiecieWezla, klasyKatalogu),
    [dane.nodes, napiecieWezla, klasyKatalogu],
  );

  const zalozenia: WierszZalozenia[] = useMemo(
    () => [
      { etykieta: RANKING_STRINGS.zalKrok, wartosc: fmtMocMW(krokMw), jednostka: RANKING_STRINGS.jednMW },
      { etykieta: RANKING_STRINGS.zalMaxKrokow, wartosc: liczbaKrokow },
      { etykieta: RANKING_STRINGS.zalOperator, wartosc: operatorNazwaPL },
      { etykieta: RANKING_STRINGS.zalLiczbaWezlow, wartosc: dane.nodes.length },
      {
        etykieta: RANKING_STRINGS.kolKlasa,
        wartosc: RANKING_STRINGS.kreska,
        uwaga: RANKING_STRINGS.zalKlasaUwaga,
      },
      {
        etykieta: RANKING_STRINGS.kolStraty,
        wartosc: RANKING_STRINGS.kreska,
        uwaga: RANKING_STRINGS.zalStratyUwaga,
      },
    ],
    [krokMw, liczbaKrokow, operatorNazwaPL, dane.nodes.length],
  );

  if (dane.nodes.length === 0) {
    return (
      <StanPanel komunikat={RANKING_STRINGS.brakWezlow} wariant="info" testid="mvd-rank-brak-wezlow" />
    );
  }

  const wybranyWezel =
    wybranyBusRef !== null ? dane.nodes.find((w) => w.bus_ref === wybranyBusRef) ?? null : null;
  const trybEkspercki = trybZaawansowania === 'expert';

  return (
    <div data-testid="mvd-rank-wynik">
      <EkranAnalizy
        naglowek={{
          analizaPL: RANKING_STRINGS.analizaPL,
          // Ten sam identyfikator, ktorym pytalismy o wynik (linia `pobierzZdolnosc…`),
          // a nie zle nazwane `context.trace_id` — patrz komentarz przy propsie.
          runId: runId ?? undefined,
          ...swiezosc,
        }}
        zalozenia={zalozenia}
        kolumny={kolumny}
        wiersze={wiersze}
        onOtworzDowod={() => {
          /* ranking nie niesie odwołań do dowodów WHITE BOX — brak akcji */
        }}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_WIERSZA_RANKINGU}
        onWybierzWiersz={setWybranyBusRef}
        wybranyWiersz={wybranyBusRef}
      />

      {wybranyWezel !== null ? (
        <SzczegolWezla
          wezel={wybranyWezel}
          napiecieKv={napiecieWezla(wybranyWezel.bus_ref)}
          klasyKatalogu={klasyKatalogu}
          trybEkspercki={trybEkspercki}
        />
      ) : (
        <StanPanel
          komunikat={RANKING_STRINGS.szczegolBrakWyboru}
          wariant="info"
          testid="mvd-rank-brak-wyboru"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno „Ranking punktów przyłączenia"
// ---------------------------------------------------------------------------

export interface EkranRankinguProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranRankingu({ trybZaawansowania }: EkranRankinguProps) {
  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const runId = useMemo(() => wybierzPrzebiegRozplywu(runs, activeRunId), [runs, activeRunId]);

  const snapshot = useSnapshotStore((s) => s.snapshot);
  const opcjeWezlow = useMemo(() => selectBusOptions(snapshot), [snapshot]);
  const napiecieWezla = useMemo(() => {
    const mapa = new Map(opcjeWezlow.map((o) => [o.ref_id, o.voltage_kv]));
    return (busRef: string): number | null => mapa.get(busRef) ?? null;
  }, [opcjeWezlow]);

  const [katalog, setKatalog] = useState<OdpowiedzKatalogNcRfg | null>(null);
  const [operatorId, setOperatorId] = useState<string>('');

  const [krokMw, setKrokMw] = useState(DOMYSLNY_KROK_MW);
  const [liczbaKrokow, setLiczbaKrokow] = useState(DOMYSLNA_LICZBA_KROKOW);
  const [wybraneWezly, setWybraneWezly] = useState<readonly string[]>([]);

  const [zapytanie, setZapytanie] = useState<ZapytanieZdolnosci | null>(null);
  const [stan, setStan] = useState<StanZasobu>({ rodzaj: 'idle' });

  // Katalog klas NC RfG (progi operatorów) — jednorazowo; domyślny operator = pierwszy.
  useEffect(() => {
    let anulowane = false;
    pobierzKatalogKlasNcRfg()
      .then((dane) => {
        if (anulowane) return;
        setKatalog(dane);
        setOperatorId((biezacy) => biezacy || (dane.operators[0]?.operator_id ?? ''));
      })
      .catch(() => {
        /* Brak katalogu → kolumna klasy pokaże „—"; ranking pozostaje sprawny. */
      });
    return () => {
      anulowane = true;
    };
  }, []);

  // Zmiana przebiegu unieważnia poprzedni wynik (stale-result guard).
  useEffect(() => {
    setZapytanie(null);
    setStan({ rodzaj: 'idle' });
  }, [runId]);

  useEffect(() => {
    if (zapytanie === null) return;
    let anulowane = false;
    setStan({ rodzaj: 'ladowanie' });
    pobierzZdolnoscPrzylaczeniowa(zapytanie)
      .then((dane) => {
        if (!anulowane) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        if (anulowane) return;
        const komunikat = err instanceof Error ? err.message : 'Nieznany błąd pobierania';
        setStan({ rodzaj: 'blad', komunikat });
      });
    return () => {
      anulowane = true;
    };
  }, [zapytanie]);

  const przelaczWezel = (ref: string) => {
    setWybraneWezly((biezace) =>
      biezace.includes(ref) ? biezace.filter((r) => r !== ref) : [...biezace, ref],
    );
  };

  const uruchom = () => {
    if (runId === null) return;
    const kandydaci = opcjeWezlow
      .filter((o) => wybraneWezly.includes(o.ref_id))
      .map((o) => o.ref_id);
    setZapytanie({
      runId,
      candidateBusRefs: kandydaci.length > 0 ? kandydaci : undefined,
      stepMw: krokMw,
      maxSteps: liczbaKrokow,
    });
  };

  const klasyKatalogu = useMemo(
    () => klasyOperatora(katalog, operatorId),
    [katalog, operatorId],
  );
  const operatorNazwaPL = useMemo(() => {
    const profil = katalog?.operators.find((o) => o.operator_id === operatorId);
    return profil?.operator_name_pl ?? operatorId;
  }, [katalog, operatorId]);

  return (
    <div className="mvd-rank" data-testid="mvd-rank-ekran">
      <header className="mvd-rank-naglowek">
        <h2 className="mvd-rank-tytul">{RANKING_STRINGS.tytul}</h2>
        <p className="mvd-rank-opis">{RANKING_STRINGS.opisWstep}</p>
      </header>

      {runId === null ? (
        <StanPanel
          komunikat={RANKING_STRINGS.brakPrzebiegu}
          opis={RANKING_STRINGS.brakPrzebieguOpis}
          wariant="info"
          testid="mvd-rank-brak-przebiegu"
        />
      ) : (
        <>
          <section className="mvd-rank-parametry" data-testid="mvd-rank-parametry">
            <div className="mvd-rank-param">
              <label htmlFor="mvd-rank-krok">{RANKING_STRINGS.paramKrok}</label>
              <div className="mvd-rank-param-pole">
                <input
                  id="mvd-rank-krok"
                  type="number"
                  min={0}
                  step={0.1}
                  value={krokMw}
                  onChange={(e) => setKrokMw(Number(e.target.value))}
                  data-testid="mvd-rank-krok"
                />
                <span className="mvd-rank-param-jedn">{RANKING_STRINGS.jednMW}</span>
              </div>
              <p className="mvd-rank-param-opis">{RANKING_STRINGS.paramKrokOpis}</p>
            </div>

            <div className="mvd-rank-param">
              <label htmlFor="mvd-rank-max">{RANKING_STRINGS.paramMaxKrokow}</label>
              <div className="mvd-rank-param-pole">
                <input
                  id="mvd-rank-max"
                  type="number"
                  min={1}
                  step={1}
                  value={liczbaKrokow}
                  onChange={(e) => setLiczbaKrokow(Number(e.target.value))}
                  data-testid="mvd-rank-max"
                />
              </div>
              <p className="mvd-rank-param-opis">{RANKING_STRINGS.paramMaxKrokowOpis}</p>
            </div>

            <div className="mvd-rank-param">
              <label htmlFor="mvd-rank-operator">{RANKING_STRINGS.paramOperator}</label>
              <select
                id="mvd-rank-operator"
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                data-testid="mvd-rank-operator"
              >
                {(katalog?.operators ?? []).map((o) => (
                  <option key={o.operator_id} value={o.operator_id}>
                    {o.operator_name_pl}
                  </option>
                ))}
              </select>
              <p className="mvd-rank-param-opis">{RANKING_STRINGS.paramOperatorOpis}</p>
            </div>

            <fieldset className="mvd-rank-wezly" data-testid="mvd-rank-wezly">
              <legend>{RANKING_STRINGS.paramWezly}</legend>
              <div className="mvd-rank-wezly-lista">
                {opcjeWezlow.map((o) => (
                  <label key={o.ref_id} className="mvd-rank-wezel-opcja">
                    <input
                      type="checkbox"
                      checked={wybraneWezly.includes(o.ref_id)}
                      onChange={() => przelaczWezel(o.ref_id)}
                      data-testid={`mvd-rank-wybor-${o.ref_id}`}
                    />
                    <span>{o.name}</span>
                  </label>
                ))}
              </div>
              <p className="mvd-rank-param-opis">{RANKING_STRINGS.paramWezlyDomyslne}</p>
            </fieldset>

            <button
              type="button"
              className="mvd-rank-oblicz"
              onClick={uruchom}
              data-testid="mvd-rank-oblicz"
            >
              {zapytanie === null
                ? RANKING_STRINGS.przyciskOblicz
                : RANKING_STRINGS.przyciskPrzelicz}
            </button>
          </section>

          {stan.rodzaj === 'idle' ? (
            <StanPanel
              komunikat={RANKING_STRINGS.brakWyniku}
              opis={RANKING_STRINGS.brakWynikuOpis}
              wariant="info"
              testid="mvd-rank-idle"
            />
          ) : stan.rodzaj === 'ladowanie' ? (
            <StanPanel
              komunikat={RANKING_STRINGS.ladowanie}
              wariant="info"
              testid="mvd-rank-ladowanie"
            />
          ) : stan.rodzaj === 'blad' ? (
            <StanPanel
              komunikat={RANKING_STRINGS.blad}
              opis={stan.komunikat}
              wariant="blad"
              testid="mvd-rank-blad"
            />
          ) : (
            <WynikRankingu
              dane={stan.dane}
              runId={runId}
              krokMw={krokMw}
              liczbaKrokow={liczbaKrokow}
              operatorNazwaPL={operatorNazwaPL}
              napiecieWezla={napiecieWezla}
              klasyKatalogu={klasyKatalogu}
              trybZaawansowania={trybZaawansowania}
            />
          )}
        </>
      )}
    </div>
  );
}
