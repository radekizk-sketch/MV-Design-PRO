/**
 * Wspólne typy frameworka kreatorów ui2. ZERO fizyki, ZERO stanu — same
 * kontrakty prezentacji dzielone przez wszystkie kreatory budowy sieci.
 */

/** Pojedyncza opcja listy/przełącznika. */
export interface OpcjaWyboru {
  readonly id: string;
  readonly etykieta: string;
}

/** Stan wiersza gotowości (kontrola kompletności danych kreatora). */
export type StanGotowosci = 'kompletne' | 'ostrzezenie' | 'brak';

/** Wiersz listy gotowości. */
export interface WierszGotowosci {
  readonly etykieta: string;
  readonly stan: StanGotowosci;
  readonly wartosc: string;
}

/** Błąd walidacji pojedynczego pola (klucz pola → komunikat PL). */
export interface BladPola {
  readonly pole: string;
  readonly komunikat: string;
}

/** Status pobrania danych zewnętrznych (katalog, podsumowanie z backendu). */
export type StatusPobrania = 'idle' | 'loading' | 'ready' | 'error';

/** Krok kreatora wielokrokowego (opcjonalny pasek kroków). */
export interface KrokKreatora {
  readonly id: string;
  readonly tytul: string;
}

/** Odczyt komunikatu błędu z listy błędów pól. */
export function bladPola(bledy: readonly BladPola[], pole: string): string | undefined {
  return bledy.find((b) => b.pole === pole)?.komunikat;
}
