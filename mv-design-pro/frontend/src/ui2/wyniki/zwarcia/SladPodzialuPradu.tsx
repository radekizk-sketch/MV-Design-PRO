/*
 * SladPodzialuPradu — sekcja „Podział prądu zwarciowego — ślad obliczeń"
 * (karta WB-ROZPLYW) pod tabelą rozpływu (`RozplywZwarciowy`) wybranego punktu
 * zwarcia. Ślad WHITE BOX podziału prądu zwarciowego od źródła zastępczego
 * (Thevenin / sieć nadrzędna) na gałęzie (TH-1, `branch_flow_trace` —
 * `network_model/solvers/short_circuit_iec60909.py::_build_branch_contributions_for_thevenin`).
 * Dostawca na żądanie `useRozplywZwarciowy` (`zwarcia/api.ts`) — TA SAMA
 * odpowiedź endpointu co tabela rozpływu wyżej (jedno wywołanie, jeden
 * dostawca dla obu sekcji).
 *
 * REUŻYCIE istniejącego renderera kroku śladu WHITE BOX (kanon pięciu pól:
 * Wzór → Dane wejściowe → Podstawienie → Wynik → Uwagi, formuła LaTeX przez
 * KaTeX) — `KrokDowodu` + `mapujKroki` (`ui2/wyniki/dowod`), TEN SAM komponent,
 * którym ekran „Dowód obliczeń" pokazuje ślad solvera (SC/PF `white_box_trace`).
 * Ta sekcja NIE buduje drugiego renderera kroku.
 *
 * Uczciwe stany (zero fabrykacji, zero fizyki — wyłącznie odczyt/prezentacja):
 * - `blad === true` → błąd pobrania (HTTP/sieć), rozpoznany OSOBNO od „brak
 *   danych" — komunikat błędu, nie cisza,
 * - `trace === null` → starszy wynik bez kolumny śladu (kontrakt addytywny) —
 *   komunikat, nie pusta lista i nie ukrycie sekcji bez informacji,
 * - `trace.length === 0` → policzono, ale ten punkt nie ma wkładu prądu od
 *   sieci zastępczej (ślad dokumentuje WYŁĄCZNIE tę rodzinę wkładu — superpozycja
 *   falownikowa nie ma śladu; `branch_contributions` bywa niepusty mimo to).
 *
 * Kroki TH-1 nie niosą `element_id` (solver go nie emituje dla tej rodziny
 * śladu) — przycisk „Pokaż na schemacie" `KrokDowodu` nie renderuje się dla
 * żadnego kroku (zero fabrykacji odsyłacza, którego backend nie daje).
 */

import '../dowod/dowod.css';

import type { TraceStep } from '../../../ui/results-inspector/types';
import type { AdvancementMode } from '../../shell/modeModel';
import { KrokDowodu, mapujKroki } from '../dowod';
import { ZWARCIA_STRINGS } from './strings';

export interface SladPodzialuPraduProps {
  /** Nazwa wybranego punktu zwarcia (nagłówek sekcji, pierwszy plan). */
  punktNazwa: string;
  /** Kroki śladu podziału Thevenina (TH-1); `null` = starszy wynik bez śladu. */
  trace: TraceStep[] | null;
  /** Błąd pobrania (HTTP/sieć) z dostawcy, rozpoznany osobno od „brak danych". */
  blad: boolean;
  trybZaawansowania: AdvancementMode;
}

export function SladPodzialuPradu({
  punktNazwa,
  trace,
  blad,
  trybZaawansowania,
}: SladPodzialuPraduProps) {
  const kroki = trace ? mapujKroki(trace) : [];

  return (
    <section
      className="mvd-zwarcia-slad-rozplywu"
      data-testid="mvd-zwarcia-slad-rozplywu"
      aria-label={ZWARCIA_STRINGS.sladRozplywuTytul}
    >
      <h3 className="mvd-zwarcia-wklady-tytul">
        {ZWARCIA_STRINGS.sladRozplywuTytul}
        {': '}
        <span className="mvd-zwarcia-wklady-punkt">{punktNazwa}</span>
      </h3>
      {blad ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-slad-rozplywu-blad">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.sladRozplywuBlad}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.sladRozplywuBladOpis}</p>
        </div>
      ) : trace === null ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-slad-rozplywu-brak">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.sladRozplywuNiedostepny}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.sladRozplywuNiedostepnyOpis}</p>
        </div>
      ) : kroki.length === 0 ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-slad-rozplywu-pusty">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.sladRozplywuPusty}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.sladRozplywuPustyOpis}</p>
        </div>
      ) : (
        <>
          <p className="mvd-zwarcia-wklad-szczegol-opis">{ZWARCIA_STRINGS.sladRozplywuOpis}</p>
          <div
            className="mvd-zwarcia-slad-rozplywu-lista"
            data-testid="mvd-zwarcia-slad-rozplywu-lista"
          >
            {kroki.map((krok) => (
              <KrokDowodu key={krok.numer} krok={krok} trybZaawansowania={trybZaawansowania} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
