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
 * Uczciwe stany (zero fabrykacji):
 * - `odczyt === 'wczytywanie'` → zapytanie w toku — stan odczytu, NIE „niedostępny
 *   w tym przebiegu" (odczyt w toku ≠ brak danych),
 * - `odczyt === 'blad'` → błąd pobrania — komunikat błędu (błąd ≠ brak danych),
 * - `flows === null` → starszy wynik bez pola (kontrakt addytywny) — komunikat,
 * - `flows.length === 0` → policzono, brak prądu w gałęziach (sieć bez źródła
 *   zastępczego i bez falowników zasilających zwarcie).
 * - wkłady pominięte na podstawie tolerancji numerycznej (karta PROG-ZERA-WKLADOW) —
 *   nota z liczbą wpisów i progiem Z ODPOWIEDZI (odbicie jedynej definicji rdzenia,
 *   frontend nie ma własnej stałej) przy każdym stanie z policzonym rozpływem (także
 *   pustej liście), a przy szczegółach audytowych zestawienie wpisów z surowym |I|. Wpis
 *   pominięty to nie zero i nie wiersz tabeli rozpływu.
 * Zero fizyki, zero mutacji, zero wołań API.
 */

import type {
  ShortCircuitBranchFlow,
  WkladPominietyRozplywu,
} from '../../../ui/results-inspector/types';
import { StanDanychWyniku, TabelaWynikow, useNazwaObiektu } from '../wzorzec';
import type { DanePrzyjeteWyniku, OdczytPunktuZwarcia } from './api';
import { ZWARCIA_STRINGS, notaWkladowPominietych } from './strings';
import {
  KLUCZ_POMINIETY,
  KLUCZ_ROZPLYW,
  KOLUMNY_POMINIETYCH,
  KOLUMNY_ROZPLYWU,
  naWierszePominietych,
  naWierszeRozplywu,
} from './zwarciaModel';

export interface RozplywZwarciowyProps {
  /** Nazwa wybranego punktu zwarcia (nagłówek sekcji, pierwszy plan). */
  punktNazwa: string;
  /** Wpisy rozpływu z wiersza kanonicznego; `null` = starszy wynik bez pola. */
  flows: ShortCircuitBranchFlow[] | null;
  /**
   * Wkłady pominięte na podstawie tolerancji numerycznej z TEJ SAMEJ odpowiedzi co
   * `flows`; `null` = brak danych (wiersz inline, starszy wynik).
   */
  pominiete: WkladPominietyRozplywu[] | null;
  /** Próg wkładu pominiętego z odpowiedzi (A, odbicie definicji rdzenia); `null` = brak. */
  progA: number | null;
  /** Stan odczytu dostawcy (`useRozplywZwarciowy`) — rozstrzyga przed `flows`. */
  odczyt: OdczytPunktuZwarcia;
  /**
   * Dane przyjęte I″k punktu z TEJ SAMEJ odpowiedzi co `flows` (zasada nr 4, kontrakt werdyktu
   * §3); `null`/brak = wynik na danych projektu — sekcja nie pokazuje nic.
   */
  danePrzyjete?: DanePrzyjeteWyniku | null;
  szczegolyAudytowe: boolean;
  onOtworzDowod: (ref: string) => void;
}

export function RozplywZwarciowy({
  punktNazwa,
  flows,
  pominiete,
  progA,
  odczyt,
  danePrzyjete = null,
  szczegolyAudytowe,
  onOtworzDowod,
}: RozplywZwarciowyProps) {
  const nazwaObiektu = useNazwaObiektu();
  const odczytany = odczyt === 'gotowe';
  const zestawienie =
    odczytany && flows !== null && pominiete !== null && pominiete.length > 0 && progA !== null ? (
      <div className="mvd-zwarcia-rozplyw-pominiete" data-testid="mvd-zwarcia-rozplyw-pominiete">
        <p className="mvd-zwarcia-wklady-brak-desc" data-testid="mvd-zwarcia-rozplyw-pominiete-nota">
          {notaWkladowPominietych(pominiete.length, progA)}
        </p>
        {szczegolyAudytowe ? (
          <div data-testid="mvd-zwarcia-rozplyw-pominiete-tabela">
            <h4 className="mvd-zwarcia-wklady-tytul">{ZWARCIA_STRINGS.rozplywPominieteTytul}</h4>
            <p className="mvd-zwarcia-wklad-szczegol-opis">{ZWARCIA_STRINGS.rozplywPominieteOpis}</p>
            <TabelaWynikow
              kolumny={KOLUMNY_POMINIETYCH}
              wiersze={naWierszePominietych(pominiete, nazwaObiektu)}
              szczegolyAudytowe={szczegolyAudytowe}
              kluczWiersza={KLUCZ_POMINIETY}
            />
          </div>
        ) : null}
      </div>
    ) : null;

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
      {odczyt === 'wczytywanie' ? (
        <p
          className="mvd-zwarcia-wklady-brak-desc"
          data-testid="mvd-zwarcia-rozplyw-wczytywanie"
          aria-busy="true"
        >
          {ZWARCIA_STRINGS.rozplywWczytywanie}
        </p>
      ) : odczyt === 'blad' ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-rozplyw-blad" role="alert">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.rozplywBlad}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.rozplywBladOpis}</p>
        </div>
      ) : flows === null ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-rozplyw-brak">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.rozplywNiedostepny}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.rozplywNiedostepnyOpis}</p>
        </div>
      ) : flows.length === 0 ? (
        <div className="mvd-zwarcia-wklady-brak" data-testid="mvd-zwarcia-rozplyw-pusty">
          <p className="mvd-zwarcia-wklady-brak-title">{ZWARCIA_STRINGS.rozplywBrakWkladow}</p>
          <p className="mvd-zwarcia-wklady-brak-desc">{ZWARCIA_STRINGS.rozplywBrakWkladowOpis}</p>
          {zestawienie}
        </div>
      ) : (
        <>
          <p className="mvd-zwarcia-wklad-szczegol-opis">{ZWARCIA_STRINGS.rozplywOpis}</p>
          {/* Kontener tabeli wkładów opublikowanych — rozróżnia ją od tabeli zestawienia
              wkładów pominiętych w tej samej sekcji (szczegóły audytowe). */}
          <div data-testid="mvd-zwarcia-rozplyw-tabela">
            <TabelaWynikow
              kolumny={KOLUMNY_ROZPLYWU}
              wiersze={naWierszeRozplywu(flows, nazwaObiektu)}
              onOtworzDowod={onOtworzDowod}
              szczegolyAudytowe={szczegolyAudytowe}
              kluczWiersza={KLUCZ_ROZPLYW}
            />
          </div>
          {zestawienie}
        </>
      )}
      {odczytany && danePrzyjete && (
        <div className="mvd-zwarcia-dane-przyjete" data-testid="mvd-zwarcia-rozplyw-dane">
          <StanDanychWyniku
            stan={danePrzyjete.stan}
            dane={danePrzyjete.dane}
            testId="mvd-zwarcia-rozplyw"
          />
        </div>
      )}
    </section>
  );
}
