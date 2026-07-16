/*
 * EkranZdolnosci — okno „Zdolność przyłączeniowa" (karta P2 / strumień OZE).
 * Dla wybranych węzłów-kandydatów JAWNYM przyciskiem uruchamia przegląd
 * scenariuszy rozpływu (`GET /api/oze-analysis/hosting-capacity`) i prezentuje:
 *   1. tabelę per węzeł (istniejąca generacja, maks. moc przyłączalna, kryterium
 *      wiążące PL: rodzaj + element + wartość z jednostką i progiem),
 *   2. wykres słupkowy mocy przyłączalnej per węzeł (Recharts, tokeny --mvd-*),
 *   3. rozwijany ślad scenariuszy per węzeł (moc → dopuszczalny/nie + element).
 *
 * Zero fizyki, zero ocen lokalnych — rodzaj kryterium, wartości i progi pochodzą
 * WYŁĄCZNIE z backendu. Przebieg rozpływu dobierany z rejestru (LOAD_FLOW/DONE).
 * Węzły-kandydaci ze snapshotu (etykieta = nazwa). Identyfikatory (bus_ref,
 * przebieg, input_hash) wyłącznie w trybie eksperckim.
 */

import { useEffect, useMemo, useState } from 'react';
import './zdolnosc.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSnapshotStore, selectBusOptions } from '../../../ui/topology/snapshotStore';
import {
  pobierzZdolnoscPrzylaczeniowa,
  type WidokZdolnosci,
  type WezelZdolnosci,
  type ZapytanieZdolnosci,
} from '../api';
import { WykresZdolnosciChart } from './WykresZdolnosciChart';
import {
  elementKryterium,
  etykietaWezla,
  istotnoscScenariusza,
  progKryterium,
  rodzajKryteriumPL,
  slupkiZdolnosci,
  statusScenariuszaPL,
  wartoscKryterium,
  wybierzPrzebiegRozplywu,
} from './zdolnoscModel';
import { ZDOLNOSC_STRINGS, fmtMW } from './strings';

const DOMYSLNY_KROK_MW = 0.5;
const DOMYSLNA_LICZBA_KROKOW = 40;

// ---------------------------------------------------------------------------
// Stan pobierania (jawny bieg: idle / ładowanie / błąd / gotowe)
// ---------------------------------------------------------------------------

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
      className={wariant === 'blad' ? 'mvd-zdol-stan mvd-zdol-stan--blad' : 'mvd-zdol-stan'}
      data-testid={testid}
    >
      <p className="mvd-zdol-stan-title">{komunikat}</p>
      {opis && <p className="mvd-zdol-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wiersz węzła + rozwijany ślad scenariuszy
// ---------------------------------------------------------------------------

function WierszWezla({
  wezel,
  trybEkspercki,
  liczbaKolumn,
}: {
  wezel: WezelZdolnosci;
  trybEkspercki: boolean;
  liczbaKolumn: number;
}) {
  const [sladWidoczny, setSladWidoczny] = useState(false);
  const element = elementKryterium(wezel.binding_criterion);
  const wartosc = wartoscKryterium(wezel.binding_criterion);
  const prog = progKryterium(wezel.binding_criterion);
  return (
    <>
      <tr data-testid={`mvd-zdol-wiersz-${wezel.bus_ref}`}>
        <td className="mvd-zdol-td-tekst">
          <button
            type="button"
            className="mvd-zdol-slad-btn"
            aria-expanded={sladWidoczny}
            onClick={() => setSladWidoczny((s) => !s)}
            data-testid={`mvd-zdol-slad-otworz-${wezel.bus_ref}`}
          >
            {sladWidoczny ? ZDOLNOSC_STRINGS.sladUkryj : ZDOLNOSC_STRINGS.sladPokaz}
          </button>
          <span className="mvd-zdol-wezel-nazwa">{etykietaWezla(wezel)}</span>
          {trybEkspercki && (
            <span
              className="mvd-zdol-wezel-id mvd-num"
              aria-label={ZDOLNOSC_STRINGS.kolIdentyfikatorWezla}
            >
              {wezel.bus_ref}
            </span>
          )}
        </td>
        <td className="mvd-num" data-testid={`mvd-zdol-generacja-${wezel.bus_ref}`}>
          {fmtMW(wezel.existing_generation_mw)} {ZDOLNOSC_STRINGS.jednMW}
        </td>
        <td className="mvd-num" data-testid={`mvd-zdol-moc-${wezel.bus_ref}`}>
          {fmtMW(wezel.max_hosting_capacity_mw)} {ZDOLNOSC_STRINGS.jednMW}
        </td>
        <td className="mvd-zdol-td-tekst" data-testid={`mvd-zdol-kryterium-${wezel.bus_ref}`}>
          {rodzajKryteriumPL(wezel.binding_criterion)}
        </td>
        <td className="mvd-zdol-td-tekst">{element ?? ZDOLNOSC_STRINGS.kreska}</td>
        <td className="mvd-num">{wartosc ?? ZDOLNOSC_STRINGS.kreska}</td>
        <td className="mvd-num">{prog ?? ZDOLNOSC_STRINGS.kreska}</td>
      </tr>
      {sladWidoczny && (
        <tr className="mvd-zdol-slad-wiersz" data-testid={`mvd-zdol-slad-${wezel.bus_ref}`}>
          <td colSpan={liczbaKolumn}>
            <span className="mvd-zdol-slad-tytul">{ZDOLNOSC_STRINGS.sladTytul}</span>
            <ol className="mvd-zdol-slad-lista">
              {wezel.scenarios.map((sc, i) => (
                <li key={i} className="mvd-zdol-slad-poz">
                  <span className="mvd-zdol-slad-moc mvd-num">
                    {fmtMW(sc.added_power_mw)} {ZDOLNOSC_STRINGS.jednMW}
                  </span>
                  <span
                    className={`mvd-zdol-slad-status mvd-zdol-slad-status--${istotnoscScenariusza(sc)}`}
                  >
                    {statusScenariuszaPL(sc)}
                  </span>
                  {!sc.acceptable && elementKryterium(sc.binding) && (
                    <span className="mvd-zdol-slad-element">
                      {rodzajKryteriumPL(sc.binding)}
                      {': '}
                      {elementKryterium(sc.binding)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Wynik: tabela + wykres
// ---------------------------------------------------------------------------

function WynikZdolnosci({
  dane,
  trybEkspercki,
}: {
  dane: WidokZdolnosci;
  trybEkspercki: boolean;
}) {
  const slupki = useMemo(() => slupkiZdolnosci(dane.nodes), [dane.nodes]);
  const liczbaKolumn = 7;

  if (dane.nodes.length === 0) {
    return (
      <StanPanel
        komunikat={ZDOLNOSC_STRINGS.brakWezlow}
        wariant="info"
        testid="mvd-zdol-brak-wezlow"
      />
    );
  }

  return (
    <div data-testid="mvd-zdol-wynik">
      <table className="mvd-zdol-tabela" data-testid="mvd-zdol-tabela">
        <thead>
          <tr>
            <th>{ZDOLNOSC_STRINGS.kolWezel}</th>
            <th>{ZDOLNOSC_STRINGS.kolGeneracjaIstniejaca}</th>
            <th>{ZDOLNOSC_STRINGS.kolMocPrzylaczalna}</th>
            <th>{ZDOLNOSC_STRINGS.kolKryterium}</th>
            <th>{ZDOLNOSC_STRINGS.kolElement}</th>
            <th>{ZDOLNOSC_STRINGS.kolWartosc}</th>
            <th>{ZDOLNOSC_STRINGS.kolProg}</th>
          </tr>
        </thead>
        <tbody>
          {dane.nodes.map((wezel) => (
            <WierszWezla
              key={wezel.bus_ref}
              wezel={wezel}
              trybEkspercki={trybEkspercki}
              liczbaKolumn={liczbaKolumn}
            />
          ))}
        </tbody>
      </table>

      <div className="mvd-zdol-wykres-blok">
        <WykresZdolnosciChart slupki={slupki} />
      </div>

      {trybEkspercki && (
        <dl className="mvd-zdol-eksp" data-testid="mvd-zdol-eksp">
          <div className="mvd-zdol-eksp-para">
            <dt>{ZDOLNOSC_STRINGS.ekspPrzebieg}</dt>
            <dd className="mvd-num">{dane.context.trace_id}</dd>
          </div>
          <div className="mvd-zdol-eksp-para">
            <dt>{ZDOLNOSC_STRINGS.ekspIdentyfikatorSkrot}</dt>
            <dd className="mvd-num">{dane.input_hash}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno „Zdolność przyłączeniowa"
// ---------------------------------------------------------------------------

export interface EkranZdolnosciProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranZdolnosci({ trybZaawansowania }: EkranZdolnosciProps) {
  const trybEkspercki = trybZaawansowania === 'expert';

  const runs = useExecutionRunsStore((s) => s.runs);
  const activeRunId = useExecutionRunsStore((s) => s.activeRunId);
  const runId = useMemo(() => wybierzPrzebiegRozplywu(runs, activeRunId), [runs, activeRunId]);

  const snapshot = useSnapshotStore((s) => s.snapshot);
  const opcjeWezlow = useMemo(() => selectBusOptions(snapshot), [snapshot]);

  const [krokMw, setKrokMw] = useState(DOMYSLNY_KROK_MW);
  const [liczbaKrokow, setLiczbaKrokow] = useState(DOMYSLNA_LICZBA_KROKOW);
  const [wybraneWezly, setWybraneWezly] = useState<readonly string[]>([]);

  const [zapytanie, setZapytanie] = useState<ZapytanieZdolnosci | null>(null);
  const [stan, setStan] = useState<StanZasobu>({ rodzaj: 'idle' });

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

  return (
    <div className="mvd-zdol" data-testid="mvd-zdol-ekran">
      <header className="mvd-zdol-naglowek">
        <h2 className="mvd-zdol-tytul">{ZDOLNOSC_STRINGS.tytul}</h2>
        <p className="mvd-zdol-opis">{ZDOLNOSC_STRINGS.opisWstep}</p>
      </header>

      {runId === null ? (
        <StanPanel
          komunikat={ZDOLNOSC_STRINGS.brakPrzebiegu}
          opis={ZDOLNOSC_STRINGS.brakPrzebieguOpis}
          wariant="info"
          testid="mvd-zdol-brak-przebiegu"
        />
      ) : (
        <>
          <section className="mvd-zdol-parametry" data-testid="mvd-zdol-parametry">
            <div className="mvd-zdol-param">
              <label htmlFor="mvd-zdol-krok">{ZDOLNOSC_STRINGS.paramKrok}</label>
              <div className="mvd-zdol-param-pole">
                <input
                  id="mvd-zdol-krok"
                  type="number"
                  min={0}
                  step={0.1}
                  value={krokMw}
                  onChange={(e) => setKrokMw(Number(e.target.value))}
                  data-testid="mvd-zdol-krok"
                />
                <span className="mvd-zdol-param-jedn">{ZDOLNOSC_STRINGS.jednMW}</span>
              </div>
              <p className="mvd-zdol-param-opis">{ZDOLNOSC_STRINGS.paramKrokOpis}</p>
            </div>

            <div className="mvd-zdol-param">
              <label htmlFor="mvd-zdol-max">{ZDOLNOSC_STRINGS.paramMaxKrokow}</label>
              <div className="mvd-zdol-param-pole">
                <input
                  id="mvd-zdol-max"
                  type="number"
                  min={1}
                  step={1}
                  value={liczbaKrokow}
                  onChange={(e) => setLiczbaKrokow(Number(e.target.value))}
                  data-testid="mvd-zdol-max"
                />
              </div>
              <p className="mvd-zdol-param-opis">{ZDOLNOSC_STRINGS.paramMaxKrokowOpis}</p>
            </div>

            <fieldset className="mvd-zdol-wezly" data-testid="mvd-zdol-wezly">
              <legend>{ZDOLNOSC_STRINGS.paramWezly}</legend>
              <div className="mvd-zdol-wezly-lista">
                {opcjeWezlow.map((o) => (
                  <label key={o.ref_id} className="mvd-zdol-wezel-opcja">
                    <input
                      type="checkbox"
                      checked={wybraneWezly.includes(o.ref_id)}
                      onChange={() => przelaczWezel(o.ref_id)}
                      data-testid={`mvd-zdol-wybor-${o.ref_id}`}
                    />
                    <span>{o.name}</span>
                  </label>
                ))}
              </div>
              <p className="mvd-zdol-param-opis">{ZDOLNOSC_STRINGS.paramWezlyDomyslne}</p>
            </fieldset>

            <button
              type="button"
              className="mvd-zdol-oblicz"
              onClick={uruchom}
              data-testid="mvd-zdol-oblicz"
            >
              {zapytanie === null
                ? ZDOLNOSC_STRINGS.przyciskOblicz
                : ZDOLNOSC_STRINGS.przyciskPrzelicz}
            </button>
          </section>

          {stan.rodzaj === 'idle' ? (
            <StanPanel
              komunikat={ZDOLNOSC_STRINGS.brakWyniku}
              opis={ZDOLNOSC_STRINGS.brakWynikuOpis}
              wariant="info"
              testid="mvd-zdol-idle"
            />
          ) : stan.rodzaj === 'ladowanie' ? (
            <StanPanel
              komunikat={ZDOLNOSC_STRINGS.ladowanie}
              wariant="info"
              testid="mvd-zdol-ladowanie"
            />
          ) : stan.rodzaj === 'blad' ? (
            <StanPanel
              komunikat={ZDOLNOSC_STRINGS.blad}
              opis={stan.komunikat}
              wariant="blad"
              testid="mvd-zdol-blad"
            />
          ) : (
            <WynikZdolnosci dane={stan.dane} trybEkspercki={trybEkspercki} />
          )}
        </>
      )}
    </div>
  );
}
