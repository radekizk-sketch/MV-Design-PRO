/*
 * EkranKontyngencji — okno „Kontyngencje N-1" (zakładka warsztatu Wyników;
 * karta EKRAN-N1 domyka decyzję D8: backend zdolności powstał kartą N-1-BACKEND
 * i do tej pory nie miał ŻADNEJ powierzchni użytkownika).
 *
 * TOR PRACY (trzy kroki, każdy z jawnym następnym):
 *   1. ZAKRES — zapowiedź z backendu (`/scope`): lista kwalifikowanych elementów
 *      i koszt biegu wyrażony liczbą. Inżynier wybiera: komplet albo wskazane
 *      elementy. Lista NIE jest skracana automatycznie;
 *   2. BIEG — jawny przycisk „Policz kontyngencje" (nigdy automat: komplet N-1
 *      dla dużej sieci to minuty pracy solvera, więc bieg zaczyna się WYŁĄCZNIE
 *      na żądanie);
 *   3. ODCZYT — przypadek bazowy N-0 ZAWSZE nad rankingiem, ranking dotkliwości,
 *      szczegóły wskazanej kontyngencji, sekcja nierozstrzygniętych.
 *
 * ZERO fizyki, ZERO ocen lokalnych, ZERO progów: liczniki, granice, werdykty i
 * uzasadnienia pochodzą wyłącznie z backendu. Okno nie zna reguły kwalifikacji
 * elementu ani reguły wykluczenia — obie przychodzą z zapowiedzi zakresu, więc
 * to, co ekran oferuje, jest DOKŁADNIE tym, co bieg policzy.
 *
 * Przypadek bazowy jest widoczny ZAWSZE, także gdy ma naruszenia: substrat
 * potrafi być przeciążony już w N-0, a ranking kontyngencji czytany bez tego
 * odniesienia sugerowałby, że każde naruszenie jest skutkiem wyłączenia.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import './kontyngencje.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useAppStateStore } from '../../../ui/app-state';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useSwiezoscNaglowka } from '../../freshness';
import { EkranAnalizy, PrzyciskAkcjiStanu, useAkcjaUruchomObliczenie } from '../wzorzec';
import type { AkcjaStanuZerowego } from '../wzorzec';
import {
  fetchMacierzN1,
  fetchZakresN1,
  type Kontyngencja,
  type MacierzResponse,
  type PozycjaNaruszenia,
  type PozycjaPominieta,
  type PrzypadekBazowy,
  type ZakresResponse,
} from './api';
import {
  KLUCZ_WIERSZA_RANKINGU,
  KOLUMNY_RANKINGU,
  naWierszeRankingu,
  naZalozeniaMacierzy,
  przebiegRozplywu,
  refyDoBiegu,
} from './model';
import {
  KONTYNGENCJE_STRINGS as T,
  etykietaKryterium,
  etykietaRodzaju,
  etykietaStatusu,
  fmtLiczba,
  fmtLicznik,
  nazwaElementu,
} from './strings';

type TrybZakresu = 'pelny' | 'wybrane';

type StanZakresu =
  | { readonly rodzaj: 'brakPrzebiegu' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowy'; readonly dane: ZakresResponse };

type StanMacierzy =
  | { readonly rodzaj: 'przedBiegiem' }
  | { readonly rodzaj: 'liczenie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowa'; readonly dane: MacierzResponse };

function StanPanel({
  komunikat,
  opis,
  wariant,
  testid,
  akcja,
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
  akcja?: AkcjaStanuZerowego;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-n1-stan mvd-n1-stan--blad' : 'mvd-n1-stan'}
      data-testid={testid}
    >
      <p className="mvd-n1-stan-title">{komunikat}</p>
      {opis && <p className="mvd-n1-stan-desc">{opis}</p>}
      <PrzyciskAkcjiStanu akcja={akcja} testid={testid} />
    </div>
  );
}

/** Lista naruszeń jednej kategorii — wartość, granica i powód WPROST z backendu. */
function ListaNaruszen({
  pozycje,
  tytul,
  testid,
}: {
  pozycje: readonly PozycjaNaruszenia[];
  tytul: string;
  testid: string;
}) {
  return (
    <section className="mvd-n1-sekcja" data-testid={testid}>
      <h4 className="mvd-n1-sekcja-tytul">
        {tytul} <span className="mvd-n1-licznik">{pozycje.length}</span>
      </h4>
      {pozycje.length === 0 ? (
        <p className="mvd-n1-pusty">{T.brakPozycji}</p>
      ) : (
        <ul className="mvd-n1-lista">
          {pozycje.map((pozycja) => (
            <li key={`${pozycja.check_type}|${pozycja.element_id}`}>
              <span className="mvd-n1-lista-nazwa">
                {nazwaElementu(pozycja.element_name, pozycja.element_ref ?? pozycja.element_id)}
              </span>
              <span className="mvd-n1-lista-wartosc">
                {fmtLiczba(pozycja.wartosc)}
                {pozycja.jednostka ? ` ${pozycja.jednostka}` : ''}
              </span>
              <span className="mvd-n1-lista-powod">{pozycja.powod_pl}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Kryteria, których NIE policzono — brak danej nigdy nie udaje wyniku. */
function ListaPominietych({
  pozycje,
  testid,
}: {
  pozycje: readonly PozycjaPominieta[];
  testid: string;
}) {
  if (pozycje.length === 0) return null;
  return (
    <section className="mvd-n1-sekcja" data-testid={testid}>
      <h4 className="mvd-n1-sekcja-tytul">
        {T.sekcjaPominiete} <span className="mvd-n1-licznik">{pozycje.length}</span>
      </h4>
      <p className="mvd-n1-sekcja-opis">{T.sekcjaPominieteOpis}</p>
      <ul className="mvd-n1-lista">
        {pozycje.map((pozycja) => (
          <li key={`${pozycja.check_type}|${pozycja.element_id}`}>
            <span className="mvd-n1-lista-nazwa">
              {nazwaElementu(pozycja.element_name, pozycja.element_ref ?? pozycja.element_id)}
            </span>
            <span className="mvd-n1-lista-kryterium">{etykietaKryterium(pozycja.check_type)}</span>
            <span className="mvd-n1-lista-powod">{pozycja.powod_pl}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Przypadek bazowy N-0 — ZAWSZE nad rankingiem (uczciwe odniesienie). */
function PanelBazowy({ bazowy }: { bazowy: PrzypadekBazowy }) {
  const bezNaruszen =
    bazowy.przeciazenia.length === 0
    && bazowy.naruszenia_napiecia.length === 0
    && bazowy.odbiory_bez_zasilania.length === 0;
  return (
    <section className="mvd-n1-bazowy" data-testid="mvd-n1-bazowy">
      <h3 className="mvd-n1-blok-tytul">{T.bazowyTytul}</h3>
      <p className="mvd-n1-blok-opis">{T.bazowyOpis}</p>
      <p className="mvd-n1-bazowy-status" data-testid="mvd-n1-bazowy-status">
        {etykietaStatusu(bazowy.status)} — {bazowy.powod_pl}
      </p>
      <dl className="mvd-n1-liczniki">
        <div>
          <dt>{T.kolPrzeciazenia}</dt>
          <dd data-testid="mvd-n1-bazowy-przeciazenia">
            {fmtLicznik(bazowy.dotkliwosc.przeciazenia)}
          </dd>
        </div>
        <div>
          <dt>{T.kolNapiecia}</dt>
          <dd data-testid="mvd-n1-bazowy-napiecia">
            {fmtLicznik(bazowy.dotkliwosc.naruszenia_napiecia)}
          </dd>
        </div>
        <div>
          <dt>{T.kolOdbiory}</dt>
          <dd data-testid="mvd-n1-bazowy-odbiory">
            {fmtLicznik(bazowy.dotkliwosc.odbiory_bez_zasilania)}
          </dd>
        </div>
        <div>
          <dt>{T.kolPominiete}</dt>
          <dd data-testid="mvd-n1-bazowy-pominiete">
            {fmtLicznik(bazowy.dotkliwosc.kryteria_pominiete)}
          </dd>
        </div>
      </dl>
      {bezNaruszen && <p className="mvd-n1-pusty">{T.bazowyBezNaruszen}</p>}
      <ListaNaruszen
        pozycje={bazowy.przeciazenia}
        tytul={T.sekcjaPrzeciazenia}
        testid="mvd-n1-bazowy-lista-przeciazen"
      />
      <ListaNaruszen
        pozycje={bazowy.naruszenia_napiecia}
        tytul={T.sekcjaNapiecia}
        testid="mvd-n1-bazowy-lista-napiec"
      />
      <ListaPominietych pozycje={bazowy.kryteria_pominiete} testid="mvd-n1-bazowy-pominiete-lista" />
    </section>
  );
}

/** Szczegóły wskazanej kontyngencji: co przeciążone, co bez zasilania, ślad. */
function PanelSzczegolow({
  kontyngencja,
  trybZaawansowania,
}: {
  kontyngencja: Kontyngencja;
  trybZaawansowania: AdvancementMode;
}) {
  const slad = kontyngencja.slad;
  return (
    <section className="mvd-n1-szczegoly" data-testid="mvd-n1-szczegoly">
      <h3 className="mvd-n1-blok-tytul">
        {T.szczegolyTytul}: {nazwaElementu(kontyngencja.element_name, kontyngencja.element_ref)}
      </h3>
      <p className="mvd-n1-blok-opis" data-testid="mvd-n1-szczegoly-powod">
        {etykietaRodzaju(kontyngencja.element_kind)} · {etykietaStatusu(kontyngencja.status)} —{' '}
        {kontyngencja.powod_pl}
      </p>

      <ListaNaruszen
        pozycje={kontyngencja.przeciazenia}
        tytul={T.sekcjaPrzeciazenia}
        testid="mvd-n1-szczegoly-przeciazenia"
      />
      <ListaNaruszen
        pozycje={kontyngencja.naruszenia_napiecia}
        tytul={T.sekcjaNapiecia}
        testid="mvd-n1-szczegoly-napiecia"
      />

      <section className="mvd-n1-sekcja" data-testid="mvd-n1-szczegoly-odbiory">
        <h4 className="mvd-n1-sekcja-tytul">
          {T.sekcjaOdbiory}{' '}
          <span className="mvd-n1-licznik">{kontyngencja.odbiory_bez_zasilania.length}</span>
        </h4>
        {kontyngencja.odbiory_bez_zasilania.length === 0 ? (
          <p className="mvd-n1-pusty">{T.brakPozycji}</p>
        ) : (
          <ul className="mvd-n1-lista">
            {kontyngencja.odbiory_bez_zasilania.map((odbior) => (
              <li key={odbior.load_ref}>
                <span className="mvd-n1-lista-nazwa">
                  {nazwaElementu(odbior.load_name, odbior.load_ref)}
                </span>
                <span className="mvd-n1-lista-kryterium">
                  {nazwaElementu(odbior.bus_name, odbior.bus_ref)}
                </span>
                <span className="mvd-n1-lista-wartosc">
                  {fmtLiczba(odbior.p_mw, 3)} {T.jednMw}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mvd-n1-sekcja" data-testid="mvd-n1-szczegoly-szyny">
        <h4 className="mvd-n1-sekcja-tytul">
          {T.sekcjaSzyny}{' '}
          <span className="mvd-n1-licznik">{kontyngencja.szyny_bez_zasilania.length}</span>
        </h4>
        {kontyngencja.szyny_bez_zasilania.length === 0 ? (
          <p className="mvd-n1-pusty">{T.brakPozycji}</p>
        ) : (
          <ul className="mvd-n1-lista mvd-n1-lista--zwarta">
            {kontyngencja.szyny_bez_zasilania.map((szyna) => (
              <li key={szyna}>{szyna}</li>
            ))}
          </ul>
        )}
      </section>

      <ListaPominietych
        pozycje={kontyngencja.kryteria_pominiete}
        testid="mvd-n1-szczegoly-pominiete"
      />

      <section className="mvd-n1-sekcja" data-testid="mvd-n1-szczegoly-slad">
        <h4 className="mvd-n1-sekcja-tytul">{T.sekcjaSlad}</h4>
        <dl className="mvd-n1-slad">
          {slad.wariant_wejscia && (
            <div>
              <dt>{T.sladMechanizm}</dt>
              <dd>{slad.wariant_wejscia.mechanizm_pl}</dd>
            </div>
          )}
          <div>
            <dt>{T.sladMetoda}</dt>
            <dd>{slad.bieg.metoda ?? T.kreska}</dd>
          </div>
          <div>
            <dt>{T.sladIteracje}</dt>
            <dd>{fmtLicznik(slad.bieg.iteracje)}</dd>
          </div>
          {slad.wyspa_zasilana && (
            <>
              <div>
                <dt>{T.sladWyspa}</dt>
                <dd>{slad.wyspa_zasilana.szyny_zasilane}</dd>
              </div>
              {trybZaawansowania === 'expert' && (
                <div>
                  <dt>{T.sladWezelBilansujacy}</dt>
                  <dd>{slad.wyspa_zasilana.wezel_bilansujacy_ref ?? T.kreska}</dd>
                </div>
              )}
            </>
          )}
        </dl>
      </section>
    </section>
  );
}

export interface EkranKontyngencjiProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranKontyngencji({ trybZaawansowania }: EkranKontyngencjiProps) {
  const activeRunId = useAppStateStore((s) => s.activeRunId);
  const runs = useExecutionRunsStore((s) => s.runs);
  const przebieg = useMemo(() => przebiegRozplywu(runs, activeRunId), [runs, activeRunId]);
  const runId = przebieg?.id ?? null;
  const swiezosc = useSwiezoscNaglowka(runId);
  const akcjaBiegu = useAkcjaUruchomObliczenie('LOAD_FLOW');

  const [zakres, setZakres] = useState<StanZakresu>(
    runId ? { rodzaj: 'ladowanie' } : { rodzaj: 'brakPrzebiegu' },
  );
  const [macierz, setMacierz] = useState<StanMacierzy>({ rodzaj: 'przedBiegiem' });
  const [tryb, setTryb] = useState<TrybZakresu>('pelny');
  const [zaznaczone, setZaznaczone] = useState<ReadonlySet<string>>(new Set());
  const [wybranaKontyngencja, setWybranaKontyngencja] = useState<string | null>(null);

  // Zapowiedź zakresu — tania (bez biegu solvera), więc pobierana od razu.
  useEffect(() => {
    if (!runId) {
      setZakres({ rodzaj: 'brakPrzebiegu' });
      return;
    }
    let anulowane = false;
    setZakres({ rodzaj: 'ladowanie' });
    // Zmiana przebiegu unieważnia poprzednią macierz — wynik należy do biegu,
    // z którego powstał (zero mieszania zakresów między przebiegami).
    setMacierz({ rodzaj: 'przedBiegiem' });
    setZaznaczone(new Set());
    setWybranaKontyngencja(null);
    fetchZakresN1(runId)
      .then((dane) => {
        if (!anulowane) setZakres({ rodzaj: 'gotowy', dane });
      })
      .catch((err: unknown) => {
        if (!anulowane) {
          setZakres({
            rodzaj: 'blad',
            komunikat: err instanceof Error ? err.message : T.bladZakresu,
          });
        }
      });
    return () => {
      anulowane = true;
    };
  }, [runId]);

  const daneZakresu = zakres.rodzaj === 'gotowy' ? zakres.dane : null;
  const refy = refyDoBiegu(tryb, daneZakresu, zaznaczone);
  const pustyZakres = refy !== null && refy.length === 0;

  const przelaczElement = useCallback((ref: string) => {
    setZaznaczone((poprzednie) => {
      const nowe = new Set(poprzednie);
      if (nowe.has(ref)) nowe.delete(ref);
      else nowe.add(ref);
      return nowe;
    });
  }, []);

  const zaznaczWszystkie = useCallback(() => {
    setZaznaczone(new Set((daneZakresu?.elementy ?? []).map((element) => element.element_ref)));
  }, [daneZakresu]);

  const odznaczWszystkie = useCallback(() => setZaznaczone(new Set()), []);

  const policz = useCallback(() => {
    if (!runId || pustyZakres) return;
    setMacierz({ rodzaj: 'liczenie' });
    setWybranaKontyngencja(null);
    fetchMacierzN1(runId, refy)
      .then((dane) => setMacierz({ rodzaj: 'gotowa', dane }))
      .catch((err: unknown) => {
        setMacierz({
          rodzaj: 'blad',
          komunikat: err instanceof Error ? err.message : T.bladMacierzy,
        });
      });
  }, [runId, refy, pustyZakres]);

  const daneMacierzy = macierz.rodzaj === 'gotowa' ? macierz.dane : null;
  const kontyngencjaSzczegolow = useMemo(
    () =>
      daneMacierzy?.kontyngencje.find((k) => k.element_ref === wybranaKontyngencja) ?? null,
    [daneMacierzy, wybranaKontyngencja],
  );

  return (
    <div className="mvd-n1" data-testid="mvd-n1-ekran">
      <header className="mvd-n1-naglowek">
        <h2 className="mvd-n1-tytul">{T.tytul}</h2>
        <p className="mvd-n1-opis">{T.opisWstep}</p>
      </header>

      {zakres.rodzaj === 'brakPrzebiegu' && (
        <StanPanel
          komunikat={T.brakPrzebiegu}
          opis={T.brakPrzebieguOpis}
          wariant="info"
          testid="mvd-n1-brak-przebiegu"
          akcja={akcjaBiegu}
        />
      )}
      {zakres.rodzaj === 'ladowanie' && (
        <StanPanel komunikat={T.ladowanieZakresu} wariant="info" testid="mvd-n1-zakres-ladowanie" />
      )}
      {zakres.rodzaj === 'blad' && (
        <StanPanel
          komunikat={T.bladZakresu}
          opis={`${T.bladZakresuOpis} (${zakres.komunikat})`}
          wariant="blad"
          testid="mvd-n1-zakres-blad"
        />
      )}

      {daneZakresu && (
        <section className="mvd-n1-zakres" data-testid="mvd-n1-zakres">
          <h3 className="mvd-n1-blok-tytul">{T.zakresTytul}</h3>
          <p className="mvd-n1-blok-opis">{T.zakresOpis}</p>

          <div
            className="mvd-n1-tryb"
            role="radiogroup"
            aria-label={T.zakresTytul}
            data-testid="mvd-n1-tryb"
          >
            <label className="mvd-n1-tryb-opcja" title={T.trybPelnyOpis}>
              <input
                type="radio"
                name="mvd-n1-tryb"
                value="pelny"
                checked={tryb === 'pelny'}
                onChange={() => setTryb('pelny')}
                data-testid="mvd-n1-tryb-pelny"
              />
              {T.trybPelny}
            </label>
            <label className="mvd-n1-tryb-opcja" title={T.trybWybraneOpis}>
              <input
                type="radio"
                name="mvd-n1-tryb"
                value="wybrane"
                checked={tryb === 'wybrane'}
                onChange={() => setTryb('wybrane')}
                data-testid="mvd-n1-tryb-wybrane"
              />
              {T.trybWybrane}
            </label>
          </div>

          {/* KOSZT PRZED STARTEM — wyłącznie liczby z backendu; ŻADNEGO czasu. */}
          <dl className="mvd-n1-koszt" data-testid="mvd-n1-koszt">
            {tryb === 'pelny' ? (
              <>
                <div>
                  <dt>{T.kosztPelny}</dt>
                  <dd data-testid="mvd-n1-koszt-kontyngencji">
                    {daneZakresu.podsumowanie.kontyngencji} {T.kosztPelnyJedn}
                  </dd>
                </div>
                <div>
                  <dt>{T.kosztBiegow}</dt>
                  <dd data-testid="mvd-n1-koszt-biegow">
                    {daneZakresu.podsumowanie.biegow_rozplywu}
                  </dd>
                </div>
                <div>
                  <dt>{T.kosztWykluczone}</dt>
                  <dd data-testid="mvd-n1-koszt-wykluczonych">
                    {daneZakresu.podsumowanie.wykluczonych}
                  </dd>
                </div>
              </>
            ) : (
              <div>
                <dt>{T.kosztWybrane}</dt>
                <dd data-testid="mvd-n1-koszt-wybranych">
                  {refy?.length ?? 0} {T.kosztPelnyJedn}
                </dd>
              </div>
            )}
          </dl>
          <p className="mvd-n1-uwaga" data-testid="mvd-n1-bez-czasu">
            {T.bezCzasuUwaga}
          </p>

          {tryb === 'wybrane' && (
            <div className="mvd-n1-wybor" data-testid="mvd-n1-wybor">
              <div className="mvd-n1-wybor-akcje">
                <button
                  type="button"
                  className="mvd-n1-przycisk mvd-n1-przycisk--wtorny"
                  onClick={zaznaczWszystkie}
                  data-testid="mvd-n1-zaznacz-wszystkie"
                >
                  {T.zaznaczWszystkie}
                </button>
                <button
                  type="button"
                  className="mvd-n1-przycisk mvd-n1-przycisk--wtorny"
                  onClick={odznaczWszystkie}
                  data-testid="mvd-n1-odznacz-wszystkie"
                >
                  {T.odznaczWszystkie}
                </button>
              </div>
              <ul className="mvd-n1-elementy">
                {daneZakresu.elementy.map((element) => (
                  <li key={element.element_ref}>
                    <label
                      className="mvd-n1-element"
                      title={element.powod_pl ?? undefined}
                      data-testid={`mvd-n1-element-${element.element_ref}`}
                    >
                      <input
                        type="checkbox"
                        checked={zaznaczone.has(element.element_ref)}
                        onChange={() => przelaczElement(element.element_ref)}
                      />
                      <span className="mvd-n1-element-nazwa">
                        {nazwaElementu(element.element_name, element.element_ref)}
                      </span>
                      <span className="mvd-n1-element-rodzaj">
                        {etykietaRodzaju(element.element_kind)}
                      </span>
                      {element.wykluczony && (
                        <span className="mvd-n1-element-wykluczony">{T.wykluczonyZnacznik}</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mvd-n1-start">
            <button
              type="button"
              className="mvd-n1-przycisk"
              onClick={policz}
              disabled={pustyZakres || macierz.rodzaj === 'liczenie'}
              title={pustyZakres ? T.policzPustyZakres : T.policzOpis}
              data-testid="mvd-n1-policz"
            >
              {macierz.rodzaj === 'liczenie' ? T.liczenie : T.policz}
            </button>
            {pustyZakres && (
              <p className="mvd-n1-uwaga" data-testid="mvd-n1-pusty-zakres">
                {T.policzPustyZakres}
              </p>
            )}
          </div>
        </section>
      )}

      {macierz.rodzaj === 'liczenie' && (
        <StanPanel
          komunikat={T.liczenie}
          opis={T.liczenieOpis}
          wariant="info"
          testid="mvd-n1-liczenie"
        />
      )}
      {macierz.rodzaj === 'blad' && (
        <StanPanel
          komunikat={T.bladMacierzy}
          opis={`${T.bladMacierzyOpis} (${macierz.komunikat})`}
          wariant="blad"
          testid="mvd-n1-macierz-blad"
        />
      )}

      {daneMacierzy && (
        <>
          {/* N-0 ZAWSZE nad rankingiem — patrz nagłówek modułu. */}
          <PanelBazowy bazowy={daneMacierzy.przypadek_bazowy} />

          <section className="mvd-n1-ranking" data-testid="mvd-n1-ranking">
            {daneMacierzy.ranking.length === 0 ? (
              <p className="mvd-n1-pusty" data-testid="mvd-n1-ranking-pusty">
                {T.rankingPusty}
              </p>
            ) : (
              <EkranAnalizy
                naglowek={{
                  analizaPL: T.rankingTytul,
                  runId: runId ?? undefined,
                  ...swiezosc,
                }}
                zalozenia={naZalozeniaMacierzy(
                  daneMacierzy.parameters.kryteria,
                  daneMacierzy.podsumowanie.kontyngencji,
                )}
                kolumny={KOLUMNY_RANKINGU}
                wiersze={naWierszeRankingu(daneMacierzy.ranking)}
                onOtworzDowod={() => {}}
                trybZaawansowania={trybZaawansowania}
                kluczWiersza={KLUCZ_WIERSZA_RANKINGU}
                onWybierzWiersz={setWybranaKontyngencja}
                wybranyWiersz={wybranaKontyngencja}
              />
            )}
          </section>

          {kontyngencjaSzczegolow ? (
            <PanelSzczegolow
              kontyngencja={kontyngencjaSzczegolow}
              trybZaawansowania={trybZaawansowania}
            />
          ) : (
            daneMacierzy.ranking.length > 0 && (
              <p className="mvd-n1-pusty" data-testid="mvd-n1-szczegoly-wskaz">
                {T.szczegolyWskaz}
              </p>
            )
          )}

          {daneMacierzy.nierozstrzygniete.length > 0 && (
            <section className="mvd-n1-nierozstrzygniete" data-testid="mvd-n1-nierozstrzygniete">
              <h3 className="mvd-n1-blok-tytul">
                {T.nierozstrzygnieteTytul}{' '}
                <span className="mvd-n1-licznik">{daneMacierzy.nierozstrzygniete.length}</span>
              </h3>
              <p className="mvd-n1-blok-opis">{T.nierozstrzygnieteOpis}</p>
              <ul className="mvd-n1-lista">
                {daneMacierzy.nierozstrzygniete.map((pozycja) => (
                  <li key={pozycja.element_ref} data-testid={`mvd-n1-nier-${pozycja.element_ref}`}>
                    <span className="mvd-n1-lista-nazwa">
                      {nazwaElementu(pozycja.element_name, pozycja.element_ref)}
                    </span>
                    <span className="mvd-n1-lista-kryterium">
                      {etykietaStatusu(pozycja.status)}
                    </span>
                    <span className="mvd-n1-lista-powod">{pozycja.powod_pl}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
