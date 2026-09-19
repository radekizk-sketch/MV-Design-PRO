/*
 * INFORMACJE AUDYTOWE (karta V12.7 §0.3) — JEDEN komponent dla metadanych
 * produkcyjnych (identyfikator przebiegu, odcisk deterministyczny, wersja
 * solvera, odcisk danych wejściowych, odcisk modelu/pakietu…) na WSZYSTKICH
 * ekranach wyników. Metadane te NIE są pierwszym planem ekranu inżyniera —
 * projektant czyta wielkość, kryterium, wynik i wniosek, nie identyfikatory
 * techniczne. Ten sam zestaw wierszy zostaje DOSTĘPNY (nie usunięty z
 * kontraktu ani z pakietu dowodowego): tutaj — zwinięty, wyłącznie w trybie
 * eksperckim; w „Pakiecie dowodowym → Metadane reprodukowalności" (osobne
 * komponenty tamtej sekcji, np. `wyniki/dowod/PakietDowodowy.tsx`) — zawsze.
 *
 * Zero fizyki, zero zgadywania: komponent renderuje WYŁĄCZNIE wiersze, które
 * dostał — nie wie, skąd pochodzi `run_id` czy `model_hash`, każdy ekran
 * przekazuje własny zestaw (klasa metadanych jest wspólna, źródło danych nie).
 */

import { useState } from 'react';

import { WZORZEC_STRINGS } from './strings';

export interface WierszInformacjiAudytowych {
  readonly etykieta: string;
  readonly wartosc: string;
}

export interface InformacjeAudytoweProps {
  /** Wiersze metadanych (etykieta → wartość) — puste = komponent się nie renderuje. */
  readonly wiersze: readonly WierszInformacjiAudytowych[];
  /** Widoczność WYŁĄCZNIE w trybie eksperckim (karta V12.7 §0.3) — poza nim `null`. */
  readonly trybEkspercki: boolean;
  readonly testid?: string;
}

/**
 * Sekcja zwijana z metadanymi produkcyjnymi — zwinięta domyślnie, widoczna
 * TYLKO w trybie eksperckim (`trybEkspercki`). Brak wierszy albo tryb
 * podstawowy/rozszerzony → komponent nie renderuje nic (uczciwy brak, nie
 * pusta ramka).
 */
export function InformacjeAudytowe({
  wiersze,
  trybEkspercki,
  testid = 'mvd-informacje-audytowe',
}: InformacjeAudytoweProps) {
  const [otwarte, setOtwarte] = useState(false);
  if (!trybEkspercki || wiersze.length === 0) return null;
  return (
    <section className="mvd-audyt" data-testid={testid}>
      <button
        type="button"
        className="mvd-audyt-przelacz"
        aria-expanded={otwarte}
        data-testid={`${testid}-przelacz`}
        onClick={() => setOtwarte((stan) => !stan)}
      >
        <span className="mvd-audyt-tytul">{WZORZEC_STRINGS.informacjeAudytoweTytul}</span>
        <span className="mvd-audyt-licznik mvd-num">{wiersze.length}</span>
      </button>
      {otwarte && (
        <dl className="mvd-audyt-lista" data-testid={`${testid}-lista`}>
          {wiersze.map((wiersz) => (
            <div className="mvd-audyt-wiersz" key={wiersz.etykieta}>
              <dt className="mvd-audyt-etyk">{wiersz.etykieta}</dt>
              <dd className="mvd-audyt-wartosc mvd-num">{wiersz.wartosc}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
