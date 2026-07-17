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
 * porównanie rusza tylko po kliknięciu. Brak dowodów per komórka w kontrakcie
 * porównania → wzorzec dostaje pustą akcję dowodu.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import './porownanie.css';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { SekcjaZalozen, TabelaWynikow } from '../wzorzec';
import {
  createPowerFlowComparison,
  fetchPowerFlowRuns,
} from '../../../ui/power-flow-comparison/api';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import type {
  PowerFlowComparisonResult,
  PowerFlowRunItem,
} from '../../../ui/power-flow-comparison/types';
import { POROWNANIE_STRINGS, rodzajProblemuPL, wagaPL } from './strings';
import {
  KLUCZ_PROBLEM,
  KOLUMNY_GALEZI,
  KOLUMNY_RANKINGU,
  KOLUMNY_SZYN_DIFF,
  etykietaPrzebiegu,
  mapaWagElementow,
  naWierszeGalezi,
  naWierszeRankingu,
  naWierszeSzynDiff,
  naZalozeniaPorownania,
} from './porownanieModel';

/** Brak dowodów per komórka w kontrakcie porównania — stabilna pusta akcja. */
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

export function EkranPorownania({ projektId, trybZaawansowania }: EkranPorownaniaProps) {
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

  const [runA, setRunA] = useState('');
  const [runB, setRunB] = useState('');

  const [wynik, setWynik] = useState<PowerFlowComparisonResult | null>(null);
  const [stan, setStan] = useState<StanPorownania>('bezczynny');
  const [blad, setBlad] = useState<string | null>(null);

  const [zakladka, setZakladka] = useState<Zakladka>('szyny');
  const [wybranyProblem, setWybranyProblem] = useState<string | null>(null);

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

  const wagi = useMemo(
    () => (wynik ? mapaWagElementow(wynik.ranking) : new Map<string, number>()),
    [wynik],
  );
  const wierszeSzyn = useMemo(
    () => (wynik ? naWierszeSzynDiff(wynik.bus_diffs, wagi) : []),
    [wynik, wagi],
  );
  const wierszeGalezi = useMemo(
    () => (wynik ? naWierszeGalezi(wynik.branch_diffs, wagi) : []),
    [wynik, wagi],
  );
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

          {zakladka === 'szyny' &&
            (wierszeSzyn.length === 0 ? (
              <p className="mvd-por-pusto" data-testid="mvd-por-szyny-puste">
                {POROWNANIE_STRINGS.brakSzyn}
              </p>
            ) : (
              <TabelaWynikow
                kolumny={KOLUMNY_SZYN_DIFF}
                wiersze={wierszeSzyn}
                onOtworzDowod={BEZ_DOWODU}
                trybZaawansowania={trybZaawansowania}
              />
            ))}

          {zakladka === 'galezie' &&
            (wierszeGalezi.length === 0 ? (
              <p className="mvd-por-pusto" data-testid="mvd-por-galezie-puste">
                {POROWNANIE_STRINGS.brakGalezi}
              </p>
            ) : (
              <TabelaWynikow
                kolumny={KOLUMNY_GALEZI}
                wiersze={wierszeGalezi}
                onOtworzDowod={BEZ_DOWODU}
                trybZaawansowania={trybZaawansowania}
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
