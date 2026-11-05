/*
 * Sekcja „Sieć składowej zerowej — ślad obliczeń" — ślad WHITE BOX budowy macierzy Y0
 * biegu zwarcia doziemnego (1F, 2F+G): impedancja zerowa źródeł, impedancja zerowa
 * i pojemność doziemna linii i kabli, połączenie transformatorów w składowej zerowej
 * (grupa połączeń + uziemienie punktów neutralnych), droga zerowa baterii kondensatorów,
 * odniesienie numeryczne węzłów bez drogi prądu zerowego. Dane WPROST
 * z `ShortCircuitResults.siec_zerowa` (`enm/mapping.py::build_zero_sequence_zbus_with_trace`
 * — ta sama macierz, którą solver dostał jako Z0-bus). Właściwość CAŁEGO biegu, nie punktu.
 *
 * REUŻYCIE renderera kroku śladu (`KrokDowodu` + `mapujKroki`, `ui2/wyniki/dowod`) —
 * ten sam komponent co „Dowód obliczeń" i ślad podziału prądu; formuła przez KaTeX.
 *
 * Uczciwe stany (zero fabrykacji, zero fizyki):
 * - bieg bez składowej zerowej (3F, 2F) → sekcji nie ma (Y0 nie wchodzi do obliczenia);
 * - bieg doziemny bez pola → starszy wynik bez śladu: komunikat, nie pusta lista.
 */

import '../dowod/dowod.css';

import type { TraceStep } from '../../../ui/results-inspector/types';
import { KrokDowodu, mapujKroki } from '../dowod';
import { ZWARCIA_STRINGS } from './strings';

/** Tokeny `fault_type` wiersza wyniku (kody `ShortCircuitType`), w których solver czyta Z0. */
export const RODZAJE_ZWARCIA_ZE_SKLADOWA_ZEROWA: ReadonlySet<string> = new Set(['1F', '2F+G']);

export interface SladSieciZerowejProps {
  /** Ślad budowy Y0; `undefined` = bieg bez śladu (3F/2F albo starszy wynik). */
  siecZerowa: readonly TraceStep[] | undefined;
  /** `fault_type` wierszy biegu (jeden rodzaj na bieg); `null` = nieznany. */
  rodzajZwarcia: string | null;
  szczegolyAudytowe: boolean;
  testid?: string;
}

export function SladSieciZerowej({
  siecZerowa,
  rodzajZwarcia,
  szczegolyAudytowe,
  testid = 'mvd-zwarcia-siec-zerowa',
}: SladSieciZerowejProps) {
  if (rodzajZwarcia === null || !RODZAJE_ZWARCIA_ZE_SKLADOWA_ZEROWA.has(rodzajZwarcia)) {
    return null;
  }
  const kroki = siecZerowa ? mapujKroki([...siecZerowa]) : [];

  return (
    <section
      className="mvd-zwarcia-slad-rozplywu"
      data-testid={testid}
      aria-label={ZWARCIA_STRINGS.sladZerowejTytul}
    >
      <h3 className="mvd-zwarcia-wklady-tytul">{ZWARCIA_STRINGS.sladZerowejTytul}</h3>
      {kroki.length === 0 ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid={`${testid}-brak`}>
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.sladZerowejNiedostepny}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.sladZerowejNiedostepnyOpis}</p>
        </div>
      ) : (
        <>
          <p className="mvd-zwarcia-wklad-szczegol-opis">{ZWARCIA_STRINGS.sladZerowejOpis}</p>
          <div className="mvd-zwarcia-slad-rozplywu-lista" data-testid={`${testid}-lista`}>
            {kroki.map((krok) => (
              <KrokDowodu key={krok.numer} krok={krok} szczegolyAudytowe={szczegolyAudytowe} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
