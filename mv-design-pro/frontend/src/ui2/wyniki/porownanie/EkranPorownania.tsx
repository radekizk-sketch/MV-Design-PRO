/*
 * EkranPorownania — konkretyzacja wspólnego wzorca ekranu analizy dla porównania
 * A/B rozpływu mocy (karta E12.1 / W-609). Wybór dwóch zakończonych przebiegów
 * rozpływu, JAWNE uruchomienie porównania w backendzie („Porównaj przebiegi"),
 * prezentacja: podsumowanie jako ZAŁOŻENIA wzorca (A · B · Δ), zakładki
 * Szyny/Gałęzie/Ranking (tabele wzorca `TabelaWynikow`), szczegół problemu.
 *
 * Granice (NOT-A-SOLVER / karta §4): fronton NICZEGO nie liczy — różnice, delty
 * i ranking pochodzą WYŁĄCZNIE z odpowiedzi backendu. Klient API reużyty
 * z `ui/power-flow-comparison/api` (bez własnego klienta). Zero automatyzmu:
 * porównanie rusza tylko po kliknięciu.
 *
 * Dowody (R3-C / K3-G2): wartość z kolumny A otwiera dowód przebiegu A
 * (`wynik.run_a_id`), z kolumny B — przebiegu B (`wynik.run_b_id`) przez
 * deep-link z kontekstem `setWynikiTab('dowod', runId)` (mechanizm R2-B);
 * strona koduje się w `dowodRef` komórki (`dowodPorownania.ts`). Kolumny Δ
 * i ranking pozostają bez dowodu — różnica nie ma pojedynczego wywodu
 * WHITE BOX, a problem rankingu nie jest wartością jednego przebiegu.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import './porownanie.css';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { useShellStore } from '../../shell/useShellStore';
import {
  PrzyciskAkcjiStanu,
  SekcjaZalozen,
  TabelaWynikow,
  useAkcjaUruchomObliczenie,
  usePoprawWModelu,
} from '../wzorzec';
import { stronaDowodu } from './dowodPorownania';
import {
  createPowerFlowComparison,
  fetchPowerFlowRuns,
} from '../../../ui/power-flow-comparison/api';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import type {
  PowerFlowComparisonResult,
  PowerFlowRunItem,
  RunProvenance,
} from '../../../ui/power-flow-comparison/types';
import { POROWNANIE_STRINGS, ZWARCIA_POROWNANIE_STRINGS, rodzajProblemuPL, wagaPL } from './strings';
import { TrybZwarciowy } from './TrybZwarciowy';
import {
  KLUCZ_PROBLEM,
  KOLUMNY_GALEZI,
  KOLUMNY_RANKINGU,
  KOLUMNY_SZYN_DIFF,
  etykietaPrzebiegu,
  mapaWagElementow,
  naLinieProweniencji,
  naWierszeGalezi,
  naWierszeRankingu,
  naWierszeSzynDiff,
  naZalozeniaPorownania,
  tylkoRozniceGalezi,
  tylkoRozniceSzyn,
} from './porownanieModel';

/**
 * Ranking nie ma dowodu per komórka (problem nie jest wartością jednego
 * przebiegu — R3-C) — stabilna pusta akcja; wiersze rankingu nie niosą
 * `dowodRef`, więc wzorzec nie renderuje tam przycisków (zero martwych klików).
 */
const BEZ_DOWODU = (): void => {};

type Zakladka = 'szyny' | 'galezie' | 'ranking';
type StanListy = 'ladowanie' | 'gotowe' | 'blad';
type StanPorownania = 'bezczynny' | 'wtrakcie' | 'blad';

const ZAKLADKI: readonly { id: Zakladka; etykieta: string }[] = [
  { id: 'szyny', etykieta: POROWNANIE_STRINGS.zakladkaSzyny },
  { id: 'galezie', etykieta: POROWNANIE_STRINGS.zakladkaGalezie },
  { id: 'ranking', etykieta: POROWNANIE_STRINGS.zakladkaRanking },
];

export interface EkranPorownaniaProps {
  /** Identyfikator projektu — źródło listy przebiegów rozpływu (klient API). */
  projektId: string;
  trybZaawansowania: AdvancementMode;
}

/** Tryb porównania: rozpływ mocy (E12.1) lub zwarcia (E12.2). */
type TrybPorownania = 'rozplyw' | 'zwarcia';

/**
 * Okno „Porównanie przebiegów" — przełącznik trybu „Rozpływ / Zwarcia" nad
 * właściwym ekranem (karta E12.2 §2.2). Domyślnie tryb rozpływu (dzisiejsze
 * zachowanie, bez regresji). Każdy tryb ma własny stan i własne źródło danych.
 */
export function EkranPorownania({ projektId, trybZaawansowania }: EkranPorownaniaProps) {
  const [tryb, setTryb] = useState<TrybPorownania>('rozplyw');

  return (
    <div className="mvd-por-tryb-host" data-testid="mvd-por-host">
      <div
        className="mvd-por-tryb"
        role="tablist"
        aria-label={ZWARCIA_POROWNANIE_STRINGS.trybLegenda}
        data-testid="mvd-por-tryb"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tryb === 'rozplyw'}
          className={tryb === 'rozplyw' ? 'mvd-por-tab mvd-on' : 'mvd-por-tab'}
          onClick={() => setTryb('rozplyw')}
          data-testid="mvd-por-tryb-rozplyw"
        >
          {ZWARCIA_POROWNANIE_STRINGS.trybRozplyw}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tryb === 'zwarcia'}
          className={tryb === 'zwarcia' ? 'mvd-por-tab mvd-on' : 'mvd-por-tab'}
          onClick={() => setTryb('zwarcia')}
          data-testid="mvd-por-tryb-zwarcia"
        >
          {ZWARCIA_POROWNANIE_STRINGS.trybZwarcia}
        </button>
      </div>
      {tryb === 'rozplyw' ? (
        <TrybRozplywu projektId={projektId} trybZaawansowania={trybZaawansowania} />
      ) : (
        <TrybZwarciowy trybZaawansowania={trybZaawansowania} />
      )}
    </div>
  );
}

function TrybRozplywu({ projektId, trybZaawansowania }: EkranPorownaniaProps) {
  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');

  const [przebiegi, setPrzebiegi] = useState<PowerFlowRunItem[]>([]);
  const [stanListy, setStanListy] = useState<StanListy>('ladowanie');
  const [bladListy, setBladListy] = useState<string | null>(null);

  // Nazwa przypadku po `study_case_id` — read-only ze store'u przypadków
  // (brak wpisu → dzisiejsza etykieta, zero zgadywania). Nie inicjuje ładowania.
  const przypadki = useStudyCasesStore((s) => s.cases);
  const nazwyPrzypadkow = useMemo(
    () => new Map(przypadki.map((c) => [c.id, c.name])),
    [przypadki],
  );

  // K6 / H-5: porównanie potrzebuje przebiegów — stan zerowy uruchamia
  // brakujący przebieg rozpływu zamiast tylko informować o jego braku.
  const akcjaBiegu = useAkcjaUruchomObliczenie('LOAD_FLOW');

  const [runA, setRunA] = useState('');
  const [runB, setRunB] = useState('');

  const [wynik, setWynik] = useState<PowerFlowComparisonResult | null>(null);
  const [stan, setStan] = useState<StanPorownania>('bezczynny');
  const [blad, setBlad] = useState<string | null>(null);

  const [zakladka, setZakladka] = useState<Zakladka>('szyny');
  const [wybranyProblem, setWybranyProblem] = useState<string | null>(null);
  // L-14: filtr „pokaż tylko różnice" — czysta prezentacja na deltach backendu
  // (parytet mostu `#compare`, który miał ten przełącznik).
  const [tylkoRoznice, setTylkoRoznice] = useState(false);

  // Lista przebiegów rozpływu (projektowa, tylko zakończone — filtruje klient).
  useEffect(() => {
    let anulowano = false;
    setStanListy('ladowanie');
    fetchPowerFlowRuns(projektId)
      .then((lista) => {
        if (anulowano) return;
        setPrzebiegi(lista);
        setStanListy('gotowe');
      })
      .catch((err: unknown) => {
        if (anulowano) return;
        setBladListy(err instanceof Error ? err.message : POROWNANIE_STRINGS.bladListy);
        setStanListy('blad');
      });
    return () => {
      anulowano = true;
    };
  }, [projektId]);

  const porownaj = useCallback(async () => {
    if (!runA || !runB) {
      setBlad(POROWNANIE_STRINGS.walidacjaBrakAB);
      return;
    }
    if (runA === runB) {
      setBlad(POROWNANIE_STRINGS.walidacjaTeSame);
      return;
    }
    setStan('wtrakcie');
    setBlad(null);
    setWynik(null);
    setWybranyProblem(null);
    try {
      const rezultat = await createPowerFlowComparison(runA, runB);
      setWynik(rezultat);
      setStan('bezczynny');
      setZakladka('szyny');
    } catch (err) {
      setBlad(err instanceof Error ? err.message : POROWNANIE_STRINGS.bladPorownania);
      setStan('blad');
    }
  }, [runA, runB]);

  // R3-C: 2×klik na wartości kolumny A/B otwiera dowód WŁAŚCIWEGO przebiegu —
  // strona z `dowodRef`, przebieg z pary użytej w porównaniu (run_a_id/run_b_id
  // Z WYNIKU backendu, nie z selektorów — te mogły się zmienić po porównaniu).
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const otworzDowodPrzebiegu = useCallback(
    (ref: string) => {
      if (!wynik) return;
      const strona = stronaDowodu(ref);
      if (strona === null) return;
      setWynikiTab('dowod', strona === 'A' ? wynik.run_a_id : wynik.run_b_id);
    },
    [wynik, setWynikiTab],
  );

  const wagi = useMemo(
    () => (wynik ? mapaWagElementow(wynik.ranking) : new Map<string, number>()),
    [wynik],
  );
  const poprawWModelu = usePoprawWModelu();
  const wierszeSzyn = useMemo(() => {
    if (!wynik) return [];
    const zrodlo = tylkoRoznice ? tylkoRozniceSzyn(wynik.bus_diffs) : wynik.bus_diffs;
    return naWierszeSzynDiff(zrodlo, wagi);
  }, [wynik, wagi, tylkoRoznice]);
  const wierszeGalezi = useMemo(() => {
    if (!wynik) return [];
    const zrodlo = tylkoRoznice ? tylkoRozniceGalezi(wynik.branch_diffs) : wynik.branch_diffs;
    return naWierszeGalezi(zrodlo, wagi);
  }, [wynik, wagi, tylkoRoznice]);
  const wierszeRankingu = useMemo(
    () => (wynik ? naWierszeRankingu(wynik.ranking) : []),
    [wynik],
  );

  const problemSzczegol =
    wynik && wybranyProblem !== null ? wynik.ranking[Number(wybranyProblem)] ?? null : null;

  const przyciskZablokowany = !runA || !runB || stan === 'wtrakcie';

  return (
    <div className="mvd-por" data-testid="mvd-por-ekran">
      <header className="mvd-por-head">
        <div className="mvd-por-head-main">
          <h2 className="mvd-por-title">{POROWNANIE_STRINGS.analiza}</h2>
          <p className="mvd-por-sub">{POROWNANIE_STRINGS.podtytul}</p>
        </div>
        {trybEkspercki && wynik && (
          <span className="mvd-por-id mvd-num" data-testid="mvd-por-id">
            {wynik.comparison_id}
          </span>
        )}
      </header>

      <section className="mvd-por-wybor" data-testid="mvd-por-wybor" aria-label={POROWNANIE_STRINGS.wyborTytul}>
        <h3 className="mvd-por-wybor-tytul">{POROWNANIE_STRINGS.wyborTytul}</h3>
        {stanListy === 'ladowanie' && (
          <p className="mvd-por-info" data-testid="mvd-por-lista-ladowanie">
            {POROWNANIE_STRINGS.listaWTrakcie}
          </p>
        )}
        {stanListy === 'blad' && (
          <p className="mvd-por-blad" data-testid="mvd-por-lista-blad">
            {POROWNANIE_STRINGS.bladListy}: {bladListy}
          </p>
        )}
        {stanListy === 'gotowe' && przebiegi.length === 0 && (
          <div className="mvd-por-pusty" data-testid="mvd-por-brak-przebiegow">
            <p className="mvd-por-pusty-title">{POROWNANIE_STRINGS.brakPrzebiegow}</p>
            <p className="mvd-por-pusty-desc">{POROWNANIE_STRINGS.brakPrzebiegowOpis}</p>
            <PrzyciskAkcjiStanu akcja={akcjaBiegu} testid="mvd-por-brak-przebiegow" />
          </div>
        )}
        {stanListy === 'gotowe' && przebiegi.length > 0 && (
          <>
            <div className="mvd-por-selektory">
              <SelektorPrzebiegu
                etykieta={POROWNANIE_STRINGS.wyborA}
                testId="mvd-por-select-a"
                przebiegi={przebiegi}
                wybrany={runA}
                trybEkspercki={trybEkspercki}
                nazwyPrzypadkow={nazwyPrzypadkow}
                onZmiana={setRunA}
              />
              <SelektorPrzebiegu
                etykieta={POROWNANIE_STRINGS.wyborB}
                testId="mvd-por-select-b"
                przebiegi={przebiegi}
                wybrany={runB}
                trybEkspercki={trybEkspercki}
                nazwyPrzypadkow={nazwyPrzypadkow}
                onZmiana={setRunB}
              />
            </div>
            <button
              type="button"
              className="mvd-btn mvd-por-przycisk"
              onClick={() => void porownaj()}
              disabled={przyciskZablokowany}
              data-testid="mvd-por-przycisk"
            >
              {stan === 'wtrakcie' ? POROWNANIE_STRINGS.porownajWTrakcie : POROWNANIE_STRINGS.porownaj}
            </button>
          </>
        )}
        {blad && (
          <p className="mvd-por-blad" data-testid="mvd-por-blad">
            {blad}
          </p>
        )}
      </section>

      {stan === 'wtrakcie' && (
        <p className="mvd-por-info" data-testid="mvd-por-wtrakcie">
          {POROWNANIE_STRINGS.wTrakcie}
        </p>
      )}

      {wynik && stan !== 'wtrakcie' && (
        <div className="mvd-wyn" data-testid="mvd-por-wynik">
          <SekcjaZalozen zalozenia={naZalozeniaPorownania(wynik.summary)} />

          {/* B1/B5 (karta CV-3.3-B): dowód CO było porównywane — proweniencja
              obu biegów R1 (rodzaj, status, rewizja/scenariusz koperty, odciski).
              Wyłącznie tryb ekspercki: te same surowe identyfikatory techniczne,
              co `comparison_id` w nagłówku i `run.id`/`study_case_id` selektora. */}
          {trybEkspercki && (
            <section
              className="mvd-por-proweniencja"
              data-testid="mvd-por-proweniencja"
              aria-label={POROWNANIE_STRINGS.proweniencjaTytul}
            >
              <h3 className="mvd-por-proweniencja-tytul">{POROWNANIE_STRINGS.proweniencjaTytul}</h3>
              <div className="mvd-por-proweniencja-kolumny">
                <PanelProweniencji etykieta={POROWNANIE_STRINGS.proweniencjaA} dane={wynik.provenance_a} />
                <PanelProweniencji etykieta={POROWNANIE_STRINGS.proweniencjaB} dane={wynik.provenance_b} />
              </div>
            </section>
          )}

          <div className="mvd-por-zakladki" role="tablist" data-testid="mvd-por-zakladki">
            {ZAKLADKI.map((z) => (
              <button
                key={z.id}
                type="button"
                role="tab"
                aria-selected={zakladka === z.id}
                className={zakladka === z.id ? 'mvd-por-tab mvd-on' : 'mvd-por-tab'}
                onClick={() => setZakladka(z.id)}
                data-testid={`mvd-por-tab-${z.id}`}
              >
                {z.etykieta}
              </button>
            ))}
          </div>

          {zakladka !== 'ranking' && (
            <label className="mvd-por-filtr" data-testid="mvd-por-filtr">
              <input
                type="checkbox"
                checked={tylkoRoznice}
                onChange={(e) => setTylkoRoznice(e.target.checked)}
                data-testid="mvd-por-filtr-roznice"
              />
              <span className="mvd-por-filtr-etyk">{POROWNANIE_STRINGS.filtrTylkoRoznice}</span>
              <span className="mvd-por-filtr-opis">{POROWNANIE_STRINGS.filtrOpis}</span>
            </label>
          )}

          {zakladka === 'szyny' &&
            (wierszeSzyn.length === 0 ? (
              <p className="mvd-por-pusto" data-testid="mvd-por-szyny-puste">
                {tylkoRoznice ? POROWNANIE_STRINGS.filtrPusto : POROWNANIE_STRINGS.brakSzyn}
              </p>
            ) : (
              /* F-K4 (znalezisko Z4): wiersz z ISTOTNĄ różnicą prowadzi do szyny
                 w modelu. Akcja jest INSPEKCYJNA: różnica między wariantami nie
                 jest naruszeniem kryterium, więc nie obiecujemy naprawy. */
              <TabelaWynikow
                kolumny={KOLUMNY_SZYN_DIFF}
                wiersze={wierszeSzyn}
                onOtworzDowod={otworzDowodPrzebiegu}
                trybZaawansowania={trybZaawansowania}
                onPoprawWModelu={(klucz) => poprawWModelu(klucz, 'Bus', klucz, 'inspekcja-elementu')}
                rodzajWiersza={() => 'inspekcja-elementu'}
              />
            ))}

          {zakladka === 'galezie' &&
            (wierszeGalezi.length === 0 ? (
              <p className="mvd-por-pusto" data-testid="mvd-por-galezie-puste">
                {tylkoRoznice ? POROWNANIE_STRINGS.filtrPusto : POROWNANIE_STRINGS.brakGalezi}
              </p>
            ) : (
              <TabelaWynikow
                kolumny={KOLUMNY_GALEZI}
                wiersze={wierszeGalezi}
                onOtworzDowod={otworzDowodPrzebiegu}
                trybZaawansowania={trybZaawansowania}
                onPoprawWModelu={(klucz) =>
                  poprawWModelu(klucz, 'LineBranch', klucz, 'inspekcja-elementu')
                }
                rodzajWiersza={() => 'inspekcja-elementu'}
              />
            ))}

          {zakladka === 'ranking' &&
            (wierszeRankingu.length === 0 ? (
              <p className="mvd-por-pusto" data-testid="mvd-por-ranking-puste">
                {POROWNANIE_STRINGS.brakRankingu}
              </p>
            ) : (
              <>
                <TabelaWynikow
                  kolumny={KOLUMNY_RANKINGU}
                  wiersze={wierszeRankingu}
                  onOtworzDowod={BEZ_DOWODU}
                  trybZaawansowania={trybZaawansowania}
                  kluczWiersza={KLUCZ_PROBLEM}
                  onWybierzWiersz={setWybranyProblem}
                  wybranyWiersz={wybranyProblem}
                />
                <section
                  className="mvd-por-szczegol"
                  data-testid="mvd-por-szczegol"
                  aria-label={POROWNANIE_STRINGS.szczegolTytul}
                >
                  <h3 className="mvd-por-szczegol-tytul">{POROWNANIE_STRINGS.szczegolTytul}</h3>
                  {problemSzczegol === null ? (
                    <p className="mvd-por-info">{POROWNANIE_STRINGS.szczegolWybierz}</p>
                  ) : (
                    <dl className="mvd-por-szczegol-lista">
                      <div className="mvd-por-szczegol-poz">
                        <dt>{POROWNANIE_STRINGS.szczegolElement}</dt>
                        <dd>{problemSzczegol.element_ref}</dd>
                      </div>
                      <div className="mvd-por-szczegol-poz">
                        <dt>{POROWNANIE_STRINGS.szczegolWaga}</dt>
                        <dd>{wagaPL(problemSzczegol.severity)}</dd>
                      </div>
                      <div className="mvd-por-szczegol-poz">
                        <dt>{POROWNANIE_STRINGS.szczegolRodzaj}</dt>
                        <dd>{rodzajProblemuPL(problemSzczegol.issue_code)}</dd>
                      </div>
                      <div className="mvd-por-szczegol-poz mvd-por-szczegol-opis">
                        <dt>{POROWNANIE_STRINGS.kolOpis}</dt>
                        <dd>{problemSzczegol.description_pl}</dd>
                      </div>
                    </dl>
                  )}
                </section>
              </>
            ))}
        </div>
      )}
    </div>
  );
}

interface PanelProweniencjiProps {
  etykieta: string;
  dane: RunProvenance;
}

/** Panel proweniencji jednego biegu (A albo B) — karta CV-3.3-B, B1/B5. */
function PanelProweniencji({ etykieta, dane }: PanelProweniencjiProps) {
  return (
    <dl className="mvd-por-proweniencja-panel" data-testid="mvd-por-proweniencja-panel">
      <div className="mvd-por-proweniencja-naglowek">{etykieta}</div>
      {naLinieProweniencji(dane).map((linia) => (
        <div key={linia.etykieta} className="mvd-por-szczegol-poz">
          <dt>{linia.etykieta}</dt>
          <dd className="mvd-num">{linia.wartosc}</dd>
        </div>
      ))}
    </dl>
  );
}

interface SelektorPrzebieguProps {
  etykieta: string;
  testId: string;
  przebiegi: PowerFlowRunItem[];
  wybrany: string;
  trybEkspercki: boolean;
  nazwyPrzypadkow: Map<string, string>;
  onZmiana: (id: string) => void;
}

function SelektorPrzebiegu({
  etykieta,
  testId,
  przebiegi,
  wybrany,
  trybEkspercki,
  nazwyPrzypadkow,
  onZmiana,
}: SelektorPrzebieguProps) {
  return (
    <label className="mvd-por-pole">
      <span className="mvd-por-pole-etyk">{etykieta}</span>
      <select
        className="mvd-por-select"
        value={wybrany}
        onChange={(e) => onZmiana(e.target.value)}
        data-testid={testId}
      >
        <option value="">{POROWNANIE_STRINGS.wyborPusty}</option>
        {przebiegi.map((run) => (
          <option key={run.id} value={run.id}>
            {etykietaPrzebiegu(run, trybEkspercki, nazwyPrzypadkow.get(run.study_case_id) ?? null)}
          </option>
        ))}
      </select>
    </label>
  );
}
