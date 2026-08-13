/*
 * Panel „Diagnoza przebiegu" (przestrzeń „Obliczenia", decyzja D7).
 *
 * Odpowiada na dwa pytania projektanta, gdy obliczenie nie dało wyniku:
 *   1. Dlaczego solver nie zbiegł — werdykt + dowód liczbowy + przebieg
 *      niedopasowania w kolejnych iteracjach (WHITE BOX z artefaktu biegu).
 *   2. Co zostało sprawdzone przed obliczeniem — kontrola dostępności analiz
 *      i braki modelu, które tłumaczą osobliwość układu równań.
 *
 * DEKLARACJA POWIĄZAŃ (SPEC_POWIAZANIA_WARSTW §5):
 *   Subskrybuje: `wyniki-gotowe` (nowy bieg → nowa diagnoza),
 *     `wyniki-niewazne` (zmiana modelu → kontrola przed obliczeniem
 *     przestaje opisywać stan bieżący, więc pobieramy ją ponownie).
 *   Emituje: nic — akcja stanu zerowego woła prop `onPrzejdzDoUruchomienia`,
 *     integrator decyduje, dokąd prowadzi (wzorzec `PanelGotowosci`).
 *   Nawigacja: wchodzące — przestrzeń „Obliczenia"; wychodzące — uruchomienie
 *     obliczenia (stan zerowy „brak biegu").
 *
 * ZERO FIZYKI: każda liczba pochodzi z backendu; ten plik ją wyłącznie
 * formatuje. ZERO KODÓW PRODUKCYJNYCH NA EKRANIE: kody reguł, kody diagnozy i
 * przyczyny przerwania idą przez `kodyDiagnozy.ts`. Backendowe `reason_pl`
 * NIE jest renderowane, bo wkleja do treści surowe kody (E-D01, E-D05…).
 */

import type { ProblemModelu } from './diagnozaApi';
import { useDaneDiagnozy } from './adapters/diagnozaAdapter';
import {
  etykietaDostepnosci,
  etykietaWagi,
  zdanieDiagnozy,
  zdaniePrzyczyny,
  zdaniaBlokad,
} from './kodyDiagnozy';
import {
  DIAGNOZA_STRINGS as T,
  formatIteracjeZLimitem,
  formatLiczbe,
  formatWartoscJednostkowa,
} from './strings';
import './diagnoza.css';

export interface PanelDiagnozyProps {
  /** Stan zerowy „brak biegu" — przejście do uruchomienia obliczenia. */
  onPrzejdzDoUruchomienia: () => void;
}

/** Wiersz „etykieta → wartość" werdyktu (bez wartości pustych na ekranie). */
function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <div className="mvd-diagnoza-wiersz">
      <dt>{etykieta}</dt>
      <dd>{wartosc}</dd>
    </div>
  );
}

function ProblemModeluWpis({ problem }: { problem: ProblemModelu }) {
  return (
    <li className="mvd-diagnoza-problem" data-testid={`mvd-diagnoza-problem-${problem.code}`}>
      <span className={`mvd-diagnoza-waga mvd-diagnoza-waga--${problem.severity.toLowerCase()}`}>
        {etykietaWagi(problem.severity)}
      </span>
      {/* `message_pl` jest gotowym zdaniem inżynierskim backendu — renderujemy
          je wprost, żeby nie mieć dwóch źródeł tej samej treści. */}
      <p className="mvd-diagnoza-problem-tresc">{problem.message_pl}</p>
      {problem.affected_refs.length > 0 && (
        <p className="mvd-diagnoza-problem-refy">
          {T.etykietaDotyczy}: {problem.affected_refs.join(', ')}
        </p>
      )}
      {problem.hints.length > 0 && (
        <>
          <p className="mvd-diagnoza-problem-refy">{T.etykietaWskazowki}:</p>
          <ul className="mvd-diagnoza-wskazowki">
            {problem.hints.map((wskazowka) => (
              <li key={wskazowka}>{wskazowka}</li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

export function PanelDiagnozy({ onPrzejdzDoUruchomienia }: PanelDiagnozyProps) {
  const { stan, preflight, diagnostyka, diagnoza, odswiez } = useDaneDiagnozy();

  if (stan === 'brak-przypadku') {
    return (
      <section className="mvd-diagnoza" aria-labelledby="mvd-diagnoza-tytul">
        <h2 id="mvd-diagnoza-tytul">{T.tytul}</h2>
        <div className="mvd-diagnoza-pusto" data-testid="mvd-diagnoza-brak-przypadku">
          <p>{T.brakPrzypadku}</p>
          <p>{T.brakPrzypadkuOpis}</p>
        </div>
      </section>
    );
  }

  if (stan === 'ladowanie') {
    return (
      <section className="mvd-diagnoza" aria-labelledby="mvd-diagnoza-tytul">
        <h2 id="mvd-diagnoza-tytul">{T.tytul}</h2>
        <div className="mvd-diagnoza-pusto" role="status" data-testid="mvd-diagnoza-ladowanie">
          {T.ladowanie}
        </div>
      </section>
    );
  }

  if (stan === 'blad') {
    return (
      <section className="mvd-diagnoza" aria-labelledby="mvd-diagnoza-tytul">
        <h2 id="mvd-diagnoza-tytul">{T.tytul}</h2>
        <div className="mvd-diagnoza-pusto" role="alert" data-testid="mvd-diagnoza-blad">
          <p>{T.blad}</p>
          <button type="button" className="mvd-diagnoza-akcja" onClick={odswiez}>
            {T.bladPonow}
          </button>
        </div>
      </section>
    );
  }

  const przyczyna = zdaniePrzyczyny(diagnoza?.cause_if_failed ?? null);

  return (
    <section className="mvd-diagnoza" aria-labelledby="mvd-diagnoza-tytul" data-testid="mvd-diagnoza">
      <header className="mvd-diagnoza-naglowek">
        <h2 id="mvd-diagnoza-tytul">{T.tytul}</h2>
        <p className="mvd-diagnoza-podtytul">{T.podtytul}</p>
      </header>

      {/* --- Werdykt ostatniego obliczenia --------------------------------- */}
      <section className="mvd-diagnoza-sekcja" aria-label={T.sekcjaWerdykt}>
        <h3>{T.sekcjaWerdykt}</h3>
        {diagnoza === null ? (
          <div className="mvd-diagnoza-pusto" data-testid="mvd-diagnoza-brak-przebiegu">
            <p>{T.brakPrzebiegu}</p>
            <p>{T.brakPrzebieguOpis}</p>
            <button
              type="button"
              className="mvd-diagnoza-akcja"
              onClick={onPrzejdzDoUruchomienia}
            >
              {T.brakPrzebieguAkcja}
            </button>
          </div>
        ) : (
          <>
            <p className="mvd-diagnoza-werdykt" data-testid="mvd-diagnoza-werdykt">
              {zdanieDiagnozy(diagnoza.code)}
            </p>
            {diagnoza.converged === true && diagnoza.unsolved_node_ids.length === 0 && (
              <p className="mvd-diagnoza-werdykt-dopisek">{T.werdyktBezProblemow}</p>
            )}
            <dl className="mvd-diagnoza-dane">
              {diagnoza.iterative && (
                <>
                  <Wiersz
                    etykieta={T.etykietaIteracje}
                    wartosc={formatIteracjeZLimitem(
                      diagnoza.iterations_count,
                      diagnoza.max_iterations,
                    )}
                  />
                  <Wiersz
                    etykieta={T.etykietaTolerancja}
                    wartosc={formatWartoscJednostkowa(diagnoza.tolerance)}
                  />
                  <Wiersz
                    etykieta={T.etykietaNiedopasowanie}
                    wartosc={formatWartoscJednostkowa(diagnoza.final_mismatch_pu)}
                  />
                </>
              )}
              {przyczyna !== null && (
                <Wiersz etykieta={T.etykietaPrzyczyna} wartosc={przyczyna} />
              )}
              {diagnoza.unsolved_node_ids.length > 0 && (
                <Wiersz
                  etykieta={T.etykietaSzynyBezWyniku}
                  wartosc={diagnoza.unsolved_node_ids.join(', ')}
                />
              )}
              {diagnoza.error_message !== null && (
                <Wiersz
                  etykieta={T.etykietaBladWykonania}
                  wartosc={diagnoza.error_message}
                />
              )}
            </dl>
          </>
        )}
      </section>

      {/* --- Przebieg zbieżności ------------------------------------------- */}
      {diagnoza !== null && diagnoza.iterative && diagnoza.iteration_history.length > 0 && (
        <section className="mvd-diagnoza-sekcja" aria-label={T.sekcjaPrzebiegZbieznosci}>
          <h3>{T.sekcjaPrzebiegZbieznosci}</h3>
          <p className="mvd-diagnoza-opis">{T.sekcjaPrzebiegZbieznosciOpis}</p>
          <table className="mvd-diagnoza-tabela" data-testid="mvd-diagnoza-iteracje">
            <thead>
              <tr>
                <th scope="col">{T.kolIteracja}</th>
                <th scope="col">{T.kolNiedopasowanie}</th>
              </tr>
            </thead>
            <tbody>
              {diagnoza.iteration_history.map((wpis) => (
                <tr key={wpis.iteracja}>
                  <td>{formatLiczbe(wpis.iteracja)}</td>
                  <td>{formatWartoscJednostkowa(wpis.niedopasowanie_pu)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* --- Kontrola przed obliczeniem ------------------------------------ */}
      <section className="mvd-diagnoza-sekcja" aria-label={T.sekcjaKontrola}>
        <h3>{T.sekcjaKontrola}</h3>
        <p className="mvd-diagnoza-opis">{T.sekcjaKontrolaOpis}</p>
        {preflight !== null && preflight.checks.length > 0 ? (
          <table className="mvd-diagnoza-tabela" data-testid="mvd-diagnoza-kontrola">
            <thead>
              <tr>
                <th scope="col">{T.kolAnaliza}</th>
                <th scope="col">{T.kolDostepnosc}</th>
                <th scope="col">{T.kolPowod}</th>
              </tr>
            </thead>
            <tbody>
              {preflight.checks.map((kontrola) => {
                const blokady = zdaniaBlokad(kontrola.blocking_codes);
                return (
                  <tr key={kontrola.analysis_type}>
                    <td>{kontrola.analysis_label_pl}</td>
                    <td>
                      <span
                        className={`mvd-diagnoza-dostepnosc mvd-diagnoza-dostepnosc--${kontrola.status.toLowerCase()}`}
                      >
                        {etykietaDostepnosci(kontrola.status)}
                      </span>
                    </td>
                    <td>
                      {blokady.length === 0 ? (
                        T.kontrolaBezBlokad
                      ) : (
                        <ul className="mvd-diagnoza-blokady">
                          {blokady.map((zdanie) => (
                            <li key={zdanie}>{zdanie}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="mvd-diagnoza-opis">{T.kontrolaWszystkoDostepne}</p>
        )}
      </section>

      {/* --- Braki modelu -------------------------------------------------- */}
      <section className="mvd-diagnoza-sekcja" aria-label={T.sekcjaProblemy}>
        <h3>{T.sekcjaProblemy}</h3>
        <p className="mvd-diagnoza-opis">{T.sekcjaProblemyOpis}</p>
        {diagnostyka !== null && diagnostyka.issues.length > 0 ? (
          <ul className="mvd-diagnoza-problemy" data-testid="mvd-diagnoza-problemy">
            {diagnostyka.issues.map((problem) => (
              <ProblemModeluWpis key={`${problem.code}-${problem.message_pl}`} problem={problem} />
            ))}
          </ul>
        ) : (
          <p className="mvd-diagnoza-opis" data-testid="mvd-diagnoza-bez-problemow">
            {T.problemyBrak}
          </p>
        )}
      </section>
    </section>
  );
}
