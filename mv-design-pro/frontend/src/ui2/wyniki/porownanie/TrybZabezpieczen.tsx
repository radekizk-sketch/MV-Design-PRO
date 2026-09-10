/*
 * TrybZabezpieczen — tryb ZABEZPIECZENIA okna „Porównanie przebiegów" (karta
 * CV-3.3-B2, §0 D1). Wybór dwóch zakończonych przebiegów zabezpieczeń
 * (`GET /projects/{id}/protection-runs`, karta CV-3.3-B), JAWNE uruchomienie
 * porównania w backendzie („Porównaj przebiegi"), prezentacja: podsumowanie
 * jako ZAŁOŻENIA wzorca, zakładki Zmiany stanu/Ranking (tabele wzorca
 * `TabelaWynikow`), szczegół problemu, panel proweniencji (ekspercki) i ślad
 * porównania (White Box: które pola, progi — na żądanie, zwinięty domyślnie).
 *
 * Reużycie (D1/D2, zero duplikacji): TEN SAM mechanizm wyboru A/B co
 * `TrybRozplywu` (`EkranPorownania.tsx`), TEN SAM panel proweniencji
 * (`PanelProweniencji.tsx`), TA SAMA logika etykiety biegu/koperty
 * (`porownanieModel.ts`), TEN SAM deep-link dowodu (R3-C, `dowodPorownania.ts`).
 *
 * Granice (NOT-A-SOLVER / karta §4): fronton NICZEGO nie liczy — wiersze,
 * delty i ranking pochodzą WYŁĄCZNIE z odpowiedzi backendu
 * (`POST /api/protection-comparisons`, klient `ui/protection-comparison/api`,
 * bez własnego klienta). Zero automatyzmu: porównanie rusza tylko po kliknięciu.
 *
 * Dowody (R3-C / K3-G2): wartość z kolumny A otwiera dowód przebiegu A
 * (`wynik.run_a_id`), z kolumny B — przebiegu B, przez deep-link
 * `setWynikiTab('dowod', runId)` (mechanizm R2-B); strona koduje się w
 * `dowodRef` komórki. Kolumny Δ i ranking pozostają bez dowodu — różnica/
 * problem nie mają pojedynczego wywodu WHITE BOX.
 *
 * Zero-state (D2): brak dwóch przebiegów zabezpieczeń do porównania →
 * `fix_navigation` do schematu (SLD), gdzie dziś powstaje bieg zabezpieczeń
 * (obliczenie zwarciowe + „Uruchom Protection", `ui/sld/v2/protection/
 * ProtectionRunButton.tsx`). NIE `useAkcjaUruchomObliczenie`: ta akcja rusza
 * biegi z `ExecutionAnalysisType`, unii BEZ `protection_sn` — bieg zabezpieczeń
 * wymaga uprzedniego biegu zwarciowego i `protection_case_id`, więc jedno
 * kliknięcie „Oblicz" nie ma tu pokrycia w backendzie (zero fabrykacji).
 *
 * Ślad porównania (White Box): kroki przychodzą z
 * `GET /api/protection-comparisons/{id}/trace`, ładowane NA ŻĄDANIE (pierwsze
 * rozwinięcie panelu) — ten sam wzorzec interakcji co `SladSekcyjny`
 * (zwinięty domyślnie), inny kształt danych: kroki niosą pary pole→wartość
 * (`inputs`/`outputs`), nie wywód LaTeX, więc panel jest własny, nie
 * `SladSekcyjny`. Ślad zależy od KONKRETNEGO porównania — resetowany przy
 * każdym nowym „Porównaj przebiegi".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import './porownanie.css';
import { isModeAtLeast, type AdvancementMode } from '../../shell/modeModel';
import { useShellStore } from '../../shell/useShellStore';
import {
  PrzyciskAkcjiStanu,
  SekcjaZalozen,
  TabelaWynikow,
  useAkcjaPrzejdzDoSchematu,
} from '../wzorzec';
import { stronaDowodu } from './dowodPorownania';
import { PanelProweniencji } from './PanelProweniencji';
import {
  createProtectionComparison,
  fetchProtectionRuns,
  getProtectionComparisonTrace,
} from '../../../ui/protection-comparison/api';
import type {
  ProtectionComparisonResult,
  ProtectionComparisonTrace,
  ProtectionRunItem,
} from '../../../ui/protection-comparison/types';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import {
  KLUCZ_PROBLEM,
  KOLUMNY_RANKINGU_ZABEZPIECZEN,
  KOLUMNY_STANOW_ZABEZPIECZEN,
  etykietaPrzebieguZabezpieczen,
  mapaWagWierszyZabezpieczen,
  naWierszeRankinguZabezpieczen,
  naWierszeStanowZabezpieczen,
  naZalozeniaPorownaniaZabezpieczen,
  tylkoZmianyStanowZabezpieczen,
} from './porownanieModel';
import {
  POROWNANIE_STRINGS,
  ZABEZPIECZENIA_POROWNANIE_STRINGS as ZB,
  rodzajProblemuZabezpieczenPL,
  wagaPL,
} from './strings';

/** Ranking nie ma dowodu per komórka (patrz `EkranPorownania.tsx` — ten sam uzasadnienie). */
const BEZ_DOWODU = (): void => {};

type Zakladka = 'stany' | 'ranking';
type StanListy = 'ladowanie' | 'gotowe' | 'blad';
type StanPorownania = 'bezczynny' | 'wtrakcie' | 'blad';
type StanSladu = 'zwiniety' | 'wtrakcie' | 'gotowe' | 'blad';

const ZAKLADKI: readonly { id: Zakladka; etykieta: string }[] = [
  { id: 'stany', etykieta: ZB.zakladkaStany },
  { id: 'ranking', etykieta: ZB.zakladkaRanking },
];

export interface TrybZabezpieczenProps {
  /** Identyfikator projektu — źródło listy przebiegów zabezpieczeń (klient API). */
  projektId: string;
  trybZaawansowania: AdvancementMode;
}

/** Wartość dowolnego pola śladu (`inputs`/`outputs`) → napis, bez arytmetyki. */
function fmtWartoscSladu(wartosc: unknown): string {
  if (wartosc === null || wartosc === undefined) return ZB.kreska;
  if (typeof wartosc === 'boolean') return wartosc ? 'tak' : 'nie';
  if (typeof wartosc === 'number') return String(wartosc).replace('.', ',');
  if (typeof wartosc === 'string') return wartosc;
  return JSON.stringify(wartosc);
}

export function TrybZabezpieczen({ projektId, trybZaawansowania }: TrybZabezpieczenProps) {
  const trybEkspercki = isModeAtLeast(trybZaawansowania, 'expert');

  const [przebiegi, setPrzebiegi] = useState<ProtectionRunItem[]>([]);
  const [stanListy, setStanListy] = useState<StanListy>('ladowanie');
  const [bladListy, setBladListy] = useState<string | null>(null);

  // Nazwa przypadku po `study_case_id` — read-only ze store'u przypadków
  // (brak wpisu → dzisiejsza etykieta, zero zgadywania). Nie inicjuje ładowania.
  const przypadki = useStudyCasesStore((s) => s.cases);
  const nazwyPrzypadkow = useMemo(
    () => new Map(przypadki.map((c) => [c.id, c.name])),
    [przypadki],
  );

  // D2 (karta CV-3.3-B2): zero-state „brak przebiegów" nawiguje do schematu —
  // stąd dziś powstaje bieg zabezpieczeń (SC + „Uruchom Protection"). Zero
  // fabrykacji: `useAkcjaUruchomObliczenie` nie obsługuje `protection_sn`.
  const akcjaSchemat = useAkcjaPrzejdzDoSchematu();

  const [runA, setRunA] = useState('');
  const [runB, setRunB] = useState('');

  const [wynik, setWynik] = useState<ProtectionComparisonResult | null>(null);
  const [stan, setStan] = useState<StanPorownania>('bezczynny');
  const [blad, setBlad] = useState<string | null>(null);

  const [zakladka, setZakladka] = useState<Zakladka>('stany');
  const [wybranyProblem, setWybranyProblem] = useState<string | null>(null);
  const [tylkoZmiany, setTylkoZmiany] = useState(false);

  // Ślad porównania (White Box) — na żądanie, zwinięty domyślnie; zależy od
  // KONKRETNEGO porównania, więc resetowany w `porownaj()` poniżej.
  const [slad, setSlad] = useState<ProtectionComparisonTrace | null>(null);
  const [stanSladu, setStanSladu] = useState<StanSladu>('zwiniety');
  const [bladSladu, setBladSladu] = useState<string | null>(null);

  // Lista przebiegów zabezpieczeń (projektowa, tylko zakończone — filtruje klient).
  useEffect(() => {
    let anulowano = false;
    setStanListy('ladowanie');
    fetchProtectionRuns(projektId)
      .then((lista) => {
        if (anulowano) return;
        setPrzebiegi(lista);
        setStanListy('gotowe');
      })
      .catch((err: unknown) => {
        if (anulowano) return;
        setBladListy(err instanceof Error ? err.message : ZB.bladListy);
        setStanListy('blad');
      });
    return () => {
      anulowano = true;
    };
  }, [projektId]);

  const porownaj = useCallback(async () => {
    if (!runA || !runB) {
      setBlad(ZB.walidacjaBrakAB);
      return;
    }
    if (runA === runB) {
      setBlad(ZB.walidacjaTeSame);
      return;
    }
    setStan('wtrakcie');
    setBlad(null);
    setWynik(null);
    setWybranyProblem(null);
    setSlad(null);
    setStanSladu('zwiniety');
    setBladSladu(null);
    try {
      const rezultat = await createProtectionComparison(runA, runB);
      setWynik(rezultat);
      setStan('bezczynny');
      setZakladka('stany');
    } catch (err) {
      setBlad(err instanceof Error ? err.message : ZB.bladPorownania);
      setStan('blad');
    }
  }, [runA, runB]);

  // R3-C: 2×klik na wartości kolumny A/B otwiera dowód WŁAŚCIWEGO przebiegu —
  // przebieg z pary użytej w porównaniu (run_a_id/run_b_id Z WYNIKU backendu,
  // nie z selektorów — te mogły się zmienić po porównaniu).
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
    () => (wynik ? mapaWagWierszyZabezpieczen(wynik.ranking) : new Map<string, number>()),
    [wynik],
  );
  const wierszeStanow = useMemo(() => {
    if (!wynik) return [];
    const zrodlo = tylkoZmiany ? tylkoZmianyStanowZabezpieczen(wynik.rows) : wynik.rows;
    return naWierszeStanowZabezpieczen(zrodlo, wagi);
  }, [wynik, wagi, tylkoZmiany]);
  const wierszeRankingu = useMemo(
    () => (wynik ? naWierszeRankinguZabezpieczen(wynik.ranking) : []),
    [wynik],
  );

  const problemSzczegol =
    wynik && wybranyProblem !== null ? wynik.ranking[Number(wybranyProblem)] ?? null : null;

  const przyciskZablokowany = !runA || !runB || stan === 'wtrakcie';

  // Ślad porównania: pobranie NA ŻĄDANIE (pierwsze rozwinięcie), jedno wywołanie
  // per `comparison_id` — kolejne zwinięcia/rozwinięcia nie powtarzają żądania.
  const przelaczSlad = useCallback(() => {
    if (!wynik) return;
    if (stanSladu === 'zwiniety') {
      if (slad) {
        setStanSladu('gotowe');
        return;
      }
      setStanSladu('wtrakcie');
      setBladSladu(null);
      getProtectionComparisonTrace(wynik.comparison_id)
        .then((t) => {
          setSlad(t);
          setStanSladu('gotowe');
        })
        .catch((err: unknown) => {
          setBladSladu(err instanceof Error ? err.message : ZB.sladBlad);
          setStanSladu('blad');
        });
      return;
    }
    setStanSladu('zwiniety');
  }, [wynik, slad, stanSladu]);

  return (
    <div className="mvd-por" data-testid="mvd-porzab-ekran">
      <header className="mvd-por-head">
        <div className="mvd-por-head-main">
          <p className="mvd-por-sub">{ZB.podtytul}</p>
        </div>
        {trybEkspercki && wynik && (
          <span className="mvd-por-id mvd-num" data-testid="mvd-porzab-id">
            {wynik.comparison_id}
          </span>
        )}
      </header>

      <section
        className="mvd-por-wybor"
        data-testid="mvd-porzab-wybor"
        aria-label={ZB.wyborTytul}
      >
        <h3 className="mvd-por-wybor-tytul">{ZB.wyborTytul}</h3>
        {stanListy === 'ladowanie' && (
          <p className="mvd-por-info" data-testid="mvd-porzab-lista-ladowanie">
            {ZB.listaWTrakcie}
          </p>
        )}
        {stanListy === 'blad' && (
          <p className="mvd-por-blad" data-testid="mvd-porzab-lista-blad">
            {ZB.bladListy}: {bladListy}
          </p>
        )}
        {stanListy === 'gotowe' && przebiegi.length === 0 && (
          <div className="mvd-por-pusty" data-testid="mvd-porzab-brak-przebiegow">
            <p className="mvd-por-pusty-title">{ZB.brakPrzebiegow}</p>
            <p className="mvd-por-pusty-desc">{ZB.brakPrzebiegowOpis}</p>
            <PrzyciskAkcjiStanu akcja={akcjaSchemat} testid="mvd-porzab-brak-przebiegow" />
          </div>
        )}
        {stanListy === 'gotowe' && przebiegi.length > 0 && (
          <>
            <div className="mvd-por-selektory">
              <SelektorPrzebiegu
                etykieta={ZB.wyborA}
                testId="mvd-porzab-select-a"
                przebiegi={przebiegi}
                wybrany={runA}
                trybEkspercki={trybEkspercki}
                nazwyPrzypadkow={nazwyPrzypadkow}
                onZmiana={setRunA}
              />
              <SelektorPrzebiegu
                etykieta={ZB.wyborB}
                testId="mvd-porzab-select-b"
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
              data-testid="mvd-porzab-przycisk"
            >
              {stan === 'wtrakcie' ? ZB.porownajWTrakcie : ZB.porownaj}
            </button>
          </>
        )}
        {blad && (
          <p className="mvd-por-blad" data-testid="mvd-porzab-blad">
            {blad}
          </p>
        )}
      </section>

      {stan === 'wtrakcie' && (
        <p className="mvd-por-info" data-testid="mvd-porzab-wtrakcie">
          {ZB.wTrakcie}
        </p>
      )}

      {wynik && stan !== 'wtrakcie' && (
        <div className="mvd-wyn" data-testid="mvd-porzab-wynik">
          <SekcjaZalozen zalozenia={naZalozeniaPorownaniaZabezpieczen(wynik.summary)} />

          {/* Proweniencja obu biegów R1 — TEN SAM panel co rozpływ (D1). */}
          {trybEkspercki && (
            <section
              className="mvd-por-proweniencja"
              data-testid="mvd-por-proweniencja"
              aria-label={POROWNANIE_STRINGS.proweniencjaTytul}
            >
              <h3 className="mvd-por-proweniencja-tytul">
                {POROWNANIE_STRINGS.proweniencjaTytul}
              </h3>
              <div className="mvd-por-proweniencja-kolumny">
                <PanelProweniencji etykieta={POROWNANIE_STRINGS.proweniencjaA} dane={wynik.provenance_a} />
                <PanelProweniencji etykieta={POROWNANIE_STRINGS.proweniencjaB} dane={wynik.provenance_b} />
              </div>
            </section>
          )}

          <div className="mvd-por-zakladki" role="tablist" data-testid="mvd-porzab-zakladki">
            {ZAKLADKI.map((z) => (
              <button
                key={z.id}
                type="button"
                role="tab"
                aria-selected={zakladka === z.id}
                className={zakladka === z.id ? 'mvd-por-tab mvd-on' : 'mvd-por-tab'}
                onClick={() => setZakladka(z.id)}
                data-testid={`mvd-porzab-tab-${z.id}`}
              >
                {z.etykieta}
              </button>
            ))}
          </div>

          {zakladka === 'stany' && (
            <label className="mvd-por-filtr" data-testid="mvd-porzab-filtr">
              <input
                type="checkbox"
                checked={tylkoZmiany}
                onChange={(e) => setTylkoZmiany(e.target.checked)}
                data-testid="mvd-porzab-filtr-zmiany"
              />
              <span className="mvd-por-filtr-etyk">{ZB.filtrTylkoZmiany}</span>
              <span className="mvd-por-filtr-opis">{ZB.filtrOpis}</span>
            </label>
          )}

          {zakladka === 'stany' &&
            (wierszeStanow.length === 0 ? (
              <p className="mvd-por-pusto" data-testid="mvd-porzab-stany-puste">
                {tylkoZmiany ? ZB.filtrPusto : ZB.brakStanow}
              </p>
            ) : (
              <TabelaWynikow
                kolumny={KOLUMNY_STANOW_ZABEZPIECZEN}
                wiersze={wierszeStanow}
                onOtworzDowod={otworzDowodPrzebiegu}
                trybZaawansowania={trybZaawansowania}
                kluczWiersza={KLUCZ_PROBLEM}
              />
            ))}

          {zakladka === 'ranking' &&
            (wierszeRankingu.length === 0 ? (
              <p className="mvd-por-pusto" data-testid="mvd-porzab-ranking-puste">
                {ZB.brakRankingu}
              </p>
            ) : (
              <>
                <TabelaWynikow
                  kolumny={KOLUMNY_RANKINGU_ZABEZPIECZEN}
                  wiersze={wierszeRankingu}
                  onOtworzDowod={BEZ_DOWODU}
                  trybZaawansowania={trybZaawansowania}
                  kluczWiersza={KLUCZ_PROBLEM}
                  onWybierzWiersz={setWybranyProblem}
                  wybranyWiersz={wybranyProblem}
                />
                <section
                  className="mvd-por-szczegol"
                  data-testid="mvd-porzab-szczegol"
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
                        <dt>{ZB.szczegolPunkt}</dt>
                        <dd>{problemSzczegol.fault_target_id}</dd>
                      </div>
                      <div className="mvd-por-szczegol-poz">
                        <dt>{POROWNANIE_STRINGS.szczegolWaga}</dt>
                        <dd>{wagaPL(problemSzczegol.severity)}</dd>
                      </div>
                      <div className="mvd-por-szczegol-poz">
                        <dt>{POROWNANIE_STRINGS.szczegolRodzaj}</dt>
                        <dd>{rodzajProblemuZabezpieczenPL(problemSzczegol.issue_code)}</dd>
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

          {/* Ślad porównania (White Box) — na żądanie, zwinięty domyślnie. */}
          <section className="mvd-por-schemat" data-testid="mvd-porzab-slad-sekcja">
            <button
              type="button"
              className="mvd-btn"
              aria-expanded={stanSladu !== 'zwiniety'}
              onClick={przelaczSlad}
              data-testid="mvd-porzab-slad-btn"
            >
              {stanSladu === 'zwiniety' ? ZB.sladPokaz : ZB.sladUkryj}
            </button>
            {stanSladu === 'wtrakcie' && (
              <p className="mvd-por-info" data-testid="mvd-porzab-slad-wtrakcie">
                {ZB.sladWTrakcie}
              </p>
            )}
            {stanSladu === 'blad' && (
              <p className="mvd-por-blad" data-testid="mvd-porzab-slad-blad">
                {ZB.sladBlad}: {bladSladu}
              </p>
            )}
            {stanSladu === 'gotowe' && slad && (
              <div data-testid="mvd-porzab-slad">
                <h3 className="mvd-por-szczegol-tytul">{ZB.sladTytul}</h3>
                {trybEkspercki && (
                  <dl className="mvd-por-szczegol-lista">
                    <div className="mvd-por-szczegol-poz">
                      <dt>{ZB.sladFingerprintA}</dt>
                      <dd className="mvd-num">{slad.library_fingerprint_a ?? ZB.kreska}</dd>
                    </div>
                    <div className="mvd-por-szczegol-poz">
                      <dt>{ZB.sladFingerprintB}</dt>
                      <dd className="mvd-num">{slad.library_fingerprint_b ?? ZB.kreska}</dd>
                    </div>
                    <div className="mvd-por-szczegol-poz">
                      <dt>{ZB.sladUtworzono}</dt>
                      <dd className="mvd-num">{slad.created_at}</dd>
                    </div>
                  </dl>
                )}
                {slad.steps.map((krok, i) => (
                  <section
                    key={`${krok.step}-${i}`}
                    className="mvd-por-szczegol"
                    data-testid={`mvd-porzab-slad-krok-${i}`}
                  >
                    <h4 className="mvd-por-szczegol-tytul">
                      {i + 1}. {krok.description_pl}
                    </h4>
                    {trybEkspercki && <p className="mvd-por-schemat-opis mvd-num">{krok.step}</p>}
                    <div className="mvd-por-proweniencja-kolumny">
                      <dl className="mvd-por-szczegol-lista">
                        <div className="mvd-por-szczegol-poz">
                          <dt>{ZB.sladWejscia}</dt>
                          <dd>{Object.keys(krok.inputs).length === 0 ? ZB.sladBrakPol : null}</dd>
                        </div>
                        {Object.entries(krok.inputs).map(([pole, wartosc]) => (
                          <div key={pole} className="mvd-por-szczegol-poz">
                            <dt className="mvd-num">{pole}</dt>
                            <dd className="mvd-num">{fmtWartoscSladu(wartosc)}</dd>
                          </div>
                        ))}
                      </dl>
                      <dl className="mvd-por-szczegol-lista">
                        <div className="mvd-por-szczegol-poz">
                          <dt>{ZB.sladWyjscia}</dt>
                          <dd>{Object.keys(krok.outputs).length === 0 ? ZB.sladBrakPol : null}</dd>
                        </div>
                        {Object.entries(krok.outputs).map(([pole, wartosc]) => (
                          <div key={pole} className="mvd-por-szczegol-poz">
                            <dt className="mvd-num">{pole}</dt>
                            <dd className="mvd-num">{fmtWartoscSladu(wartosc)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

interface SelektorPrzebieguProps {
  etykieta: string;
  testId: string;
  przebiegi: ProtectionRunItem[];
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
        <option value="">{ZB.wyborPusty}</option>
        {przebiegi.map((run) => (
          <option key={run.id} value={run.id}>
            {etykietaPrzebieguZabezpieczen(
              run,
              trybEkspercki,
              nazwyPrzypadkow.get(run.study_case_id) ?? null,
            )}
          </option>
        ))}
      </select>
    </label>
  );
}
