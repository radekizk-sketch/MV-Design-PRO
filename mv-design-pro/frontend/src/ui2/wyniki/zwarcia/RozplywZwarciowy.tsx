/*
 * Sekcja „Rozpływ prądu zwarciowego" (karta W-C, ZWARCIA-PRO F4 pkt 2;
 * V12K-132 pkt 7) — prądy zwarciowe w gałęziach dla wybranego punktu zwarcia
 * od źródła zastępczego (Thevenin / sieć nadrzędna) ORAZ źródeł falownikowych.
 * Dane WPROST z wiersza kanonicznego (`ShortCircuitRow.branch_contributions` —
 * FROZEN solver z opcją addytywną + projekcja `_sc_rozplyw_galeziowy`).
 * Reużywa tabelę wspólnego wzorca (`TabelaWynikow`); rozróżnienie źródła PL
 * („sieć nadrzędna" vs nazwa maszyny z modelu) w `zrodloRozplywuPL`; gałęzie i węzły
 * nazwane mostem nazw wyników (karta #145).
 *
 * Uczciwe stany (zero fabrykacji) — błąd i pobieranie rozpoznane PRZED „brak pola"
 * (dawniej oba trafiały w komunikat „starszy wynik… uruchom ponownie", co przy błędzie
 * serwera albo w trakcie pobierania kazało projektantowi przeliczać bez potrzeby):
 * - `blad` → błąd pobrania (HTTP/sieć) — komunikat błędu, nie „starszy wynik",
 * - `ladowanie` → pobieranie danych punktu w toku,
 * - `flows === null` → starszy wynik bez pola (kontrakt addytywny) — komunikat,
 * - `flows.length === 0` → policzono, brak prądu w gałęziach (sieć bez źródła
 *   zastępczego i bez falowników zasilających zwarcie).
 * Zero fizyki, zero mutacji, zero wołań API.
 */

import type { ShortCircuitBranchFlow } from '../../../ui/results-inspector/types';
import type { AdvancementMode } from '../../shell/modeModel';
import { TabelaWynikow, useNazwaObiektu } from '../wzorzec';
import { ZWARCIA_STRINGS } from './strings';
import { KLUCZ_ROZPLYW, KOLUMNY_ROZPLYWU, naWierszeRozplywu } from './zwarciaModel';

export interface RozplywZwarciowyProps {
  /** Nazwa wybranego punktu zwarcia (nagłówek sekcji, pierwszy plan). */
  punktNazwa: string;
  /** Wpisy rozpływu z wiersza kanonicznego; `null` = starszy wynik bez pola. */
  flows: ShortCircuitBranchFlow[] | null;
  /** Błąd pobrania (HTTP/sieć) z dostawcy, rozpoznany osobno od „brak danych". */
  blad: boolean;
  /** Pobieranie danych punktu w toku — osobno od „brak danych" i od błędu. */
  ladowanie: boolean;
  trybZaawansowania: AdvancementMode;
  onOtworzDowod: (ref: string) => void;
}

export function RozplywZwarciowy({
  punktNazwa,
  flows,
  blad,
  ladowanie,
  trybZaawansowania,
  onOtworzDowod,
}: RozplywZwarciowyProps) {
  const nazwaObiektu = useNazwaObiektu();
  return (
    <section
      className="mvd-zwarcia-rozplyw"
      data-testid="mvd-zwarcia-rozplyw"
      aria-label={ZWARCIA_STRINGS.rozplywTytul}
    >
      <h3 className="mvd-zwarcia-wklady-tytul">
        {ZWARCIA_STRINGS.rozplywTytul}
        {': '}
        <span className="mvd-zwarcia-wklady-punkt">{punktNazwa}</span>
      </h3>
      {blad ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-rozplyw-blad">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.rozplywBlad}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.rozplywBladOpis}</p>
        </div>
      ) : ladowanie ? (
        <p className="mvd-zwarcia-wklady-brak-desc" data-testid="mvd-zwarcia-rozplyw-ladowanie">
          {ZWARCIA_STRINGS.rozplywLadowanie}
        </p>
      ) : flows === null ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-rozplyw-brak">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.rozplywNiedostepny}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.rozplywNiedostepnyOpis}</p>
        </div>
      ) : flows.length === 0 ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-rozplyw-pusty">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.rozplywBrakWkladow}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.rozplywBrakWkladowOpis}</p>
        </div>
      ) : (
        <>
          <p className="mvd-zwarcia-wklad-szczegol-opis">{ZWARCIA_STRINGS.rozplywOpis}</p>
          <TabelaWynikow
            kolumny={KOLUMNY_ROZPLYWU}
            wiersze={naWierszeRozplywu(flows, nazwaObiektu)}
            onOtworzDowod={onOtworzDowod}
            trybZaawansowania={trybZaawansowania}
            kluczWiersza={KLUCZ_ROZPLYW}
          />
        </>
      )}
    </section>
  );
}
