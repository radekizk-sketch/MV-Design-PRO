/*
 * ZAPIS TECHNICZNY (karta #145) — jedno miejsce na SUROWY zapis śladu obliczeń, którego
 * interfejs nie może przetłumaczyć na język inżyniera, bo pochodzi z rdzenia zamrożonego
 * (bramka B-01: klucze danych, kody statusów i wzory ASCII silnika prób NC RfG) albo jest
 * otwartym słownikiem kluczy solvera (dane wejścia/wyjścia kroku śladu koordynacji).
 *
 * Zasada karty #145 (§0 pkt 3): tekst rdzenia zamrożonego NIE stoi surowo na pierwszym
 * planie — trafia do widoku audytowego z JAWNYM podpisem. Ten komponent jest tym
 * widokiem: sekcja zwinięta domyślnie, z tytułem mówiącym wprost, że zawartość jest
 * zapisem technicznym (klucze i kody silnika), a nie tekstem dla projektanta. Klasy
 * `mvd-audyt`/`mvd-audyt-lista` są wspólne z `InformacjeAudytowe` — ten sam wygląd i
 * ta sama reguła pomiaru strażnika `e2e/wyniki-jezyk-inzyniera.spec.ts` (zawartość
 * widoku audytowego nie jest pierwszym planem).
 *
 * Różnica wobec `InformacjeAudytowe`: tamten niesie METADANE (pary etykieta → wartość:
 * identyfikatory, odciski, wersje) wyłącznie w trybie eksperckim; ten niesie TREŚĆ
 * śladu (dowolny węzeł React — lista kroków, tabela kluczy), dostępną w każdym trybie
 * (jawność obliczeń WHITE BOX), ale zawsze zwiniętą i podpisaną.
 */

import { useState, type ReactNode } from 'react';

import { WZORZEC_STRINGS } from './strings';

export interface ZapisTechnicznyProps {
  /** Co zawiera zapis (np. „ślad silnika prób NC RfG") — dopisywane do tytułu. */
  readonly podpis: string;
  readonly children: ReactNode;
  readonly testid?: string;
}

export function ZapisTechniczny({ podpis, children, testid = 'mvd-zapis-techniczny' }: ZapisTechnicznyProps) {
  const [otwarty, setOtwarty] = useState(false);
  return (
    <section className="mvd-audyt" data-testid={testid}>
      <button
        type="button"
        className="mvd-audyt-przelacz"
        aria-expanded={otwarty}
        data-testid={`${testid}-przelacz`}
        onClick={() => setOtwarty((stan) => !stan)}
      >
        <span className="mvd-audyt-tytul">{WZORZEC_STRINGS.zapisTechnicznyTytul(podpis)}</span>
      </button>
      {otwarty && (
        <div className="mvd-audyt-lista" data-testid={`${testid}-tresc`}>
          <p className="mvd-audyt-etyk">{WZORZEC_STRINGS.zapisTechnicznyOpis}</p>
          {children}
        </div>
      )}
    </section>
  );
}
