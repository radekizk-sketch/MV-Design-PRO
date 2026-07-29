/**
 * Typy zdarzen magistrali powloki — kontrakt E15.1.
 *
 * Zrodlo kontraktu (WIAZACE): docs/uiux/karty/U1_E15_1_MAGISTRALA.md §3,
 * docs/uiux/SPEC_POWIAZANIA_WARSTW_2026-07.md §5-6.
 *
 * Magistrala NIE jest drugim zrodlem prawdy — wylacznie tlumaczy zmiany
 * istniejacych store'ow (zustand) na zdarzenia konsumowane przez okna powloki.
 * Zbior typow ponizej jest ZAMKNIETY i musi pozostac zgodny slowo w slowo
 * z karta zadania — rozszerzenie wymaga aktualizacji karty.
 */

/**
 * Model sieci zmieniony (nowa rewizja snapshotu ENM po operacji domenowej).
 * `zakres` = identyfikatory elementow objetych zmiana (utworzonych/zaktualizowanych/
 * usunietych), do selektywnego przerysowania zamiast pelnego odswiezenia.
 */
export interface ZdarzenieModelZmieniony {
  typ: 'model-zmieniony';
  rev: number;
  zakres: string[];
}

/** Wyniki przebiegu obliczen dla danego przypadku sa gotowe (run: DONE). */
export interface ZdarzenieWynikiGotowe {
  typ: 'wyniki-gotowe';
  runId: string;
  przypadekId: string;
}

/**
 * Wyniki oznaczone jako nieaktualne wzgledem biezacej rewizji modelu.
 * Case Immutability Rule (CLAUDE.md): zmiana modelu uniewaznia WSZYSTKIE
 * wyniki wszystkich przypadkow — jedyna dopuszczalna przyczyna w tym kontrakcie
 * to 'model-zmieniony'.
 */
export interface ZdarzenieWynikiNiewazne {
  typ: 'wyniki-niewazne';
  przyczyna: 'model-zmieniony';
  rev: number;
}

/**
 * Zmiana selekcji globalnej — obiekt zaznaczony w dowolnym oknie jest zaznaczony
 * wszedzie (kreator / SLD / drzewo / siatka wlasciwosci / wyniki / inspektor).
 * `zrodlo` = identyfikator okna emitujacego zmiane.
 */
export interface ZdarzenieSelekcja {
  typ: 'selekcja';
  obiektId: string | null;
  zrodlo: string;
}

/** Zmiana aktywnego przypadku obliczeniowego (Study Case). */
export interface ZdarzeniePrzypadekAktywny {
  typ: 'przypadek-aktywny';
  przypadekId: string;
}

/** Zmiana gotowosci analitycznej (liczba blokad / ostrzezen). */
export interface ZdarzenieGotowoscZmieniona {
  typ: 'gotowosc-zmieniona';
  blokady: number;
  ostrzezenia: number;
}

/** Suma typow zdarzen magistrali — dokladnie zbior z karty zadania §3. */
export type ZdarzenieMagistrali =
  | ZdarzenieModelZmieniony
  | ZdarzenieWynikiGotowe
  | ZdarzenieWynikiNiewazne
  | ZdarzenieSelekcja
  | ZdarzeniePrzypadekAktywny
  | ZdarzenieGotowoscZmieniona;

/** Dyskryminator typu zdarzenia (pole `typ`). */
export type TypZdarzenia = ZdarzenieMagistrali['typ'];

/** Wariant zdarzenia zawezony do konkretnego typu. */
export type ZdarzenieTypu<T extends TypZdarzenia> = Extract<ZdarzenieMagistrali, { typ: T }>;

/** Obsluznik zdarzenia — funkcja bez wartosci zwracanej, wywolywana synchronicznie. */
export type ObsluznikZdarzenia<T extends ZdarzenieMagistrali = ZdarzenieMagistrali> = (
  zdarzenie: T,
) => void;
