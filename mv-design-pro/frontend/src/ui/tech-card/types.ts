/**
 * TechCard — kontrakt jednolitej karty technicznej.
 *
 * To jest pierwszy szkielet ujednoliconej karty obiektu inżynierskiego.
 * Zastępuje równolegle istniejące inspektory/property-grid/karty kontekstowe
 * jednym kontraktem dla 7 typów obiektów projektowych:
 *
 *   - gpz, station, zksn, branch_pole, line_segment, bay, der
 *
 * Reguły:
 *  - Język polski techniczny w etykietach i akcjach.
 *  - Surowe identyfikatory, hashe i ref/seg trafiają wyłącznie do bloku
 *    diagnostyki technicznej, nigdy do głównej treści.
 *  - Treść wynika z domeny i katalogu. Brak wartości obliczonych w karcie.
 *  - Walidacja semantyczna operacji odbywa się w command-busie, nie w karcie.
 *
 * @see docs/sld/STACJE_ELEKTROENERGETYCZNE_PROJECT_STANDARD.md §5
 */

import type { CardAction, CardField, CardSection } from '../network-build/cards/ObjectCard';

export type TechCardKind =
  | 'gpz'
  | 'station'
  | 'zksn'
  | 'branch_pole'
  | 'line_segment'
  | 'bay'
  | 'der';

/**
 * Wspólny kontrakt karty technicznej. Specyficzne pola powyżej kontraktu
 * (np. `transformer_kva`, `length_m`, `branch_ports`) trafiają do sekcji
 * `parameters` jako pola katalogowe lub instancyjne.
 */
export interface TechCardSubject {
  /** Klasa obiektu projektowego — ustala domyślne sekcje i akcje. */
  readonly kind: TechCardKind;

  /** Publiczna nazwa do nagłówka karty (po polsku technicznym). */
  readonly displayName: string;

  /**
   * Publiczna etykieta typu (np. „Stacja przelotowa SN/nN",
   * „ZKSN (złączka kablowa SN)", „Słup rozgałęźny linii napowietrznej").
   */
  readonly typeLabelPl: string;

  /**
   * Wewnętrzny identyfikator domeny. Trafia wyłącznie do bloku diagnostyki,
   * nie do nagłówka karty.
   */
  readonly technicalId: string;

  /** Status uzupełnienia danych projektowych: ok = dane pełne. */
  readonly status?: 'ok' | 'warning' | 'error' | 'none';

  /**
   * Sekcje karty w kolejności wyświetlania. Pierwsze powinny być sekcje
   * inżynierskie (rola, układ, katalog), na końcu pomocnicze.
   */
  readonly sections: readonly CardSection[];

  /** Akcje projektowe (operacje na modelu, edycja katalogu, akcje naprawcze). */
  readonly actions?: readonly CardAction[];

  /**
   * Diagnostyka techniczna — wyłącznie surowe identyfikatory, ścieżki,
   * hashe i powiązania techniczne. Karta domyślnie ukrywa tę sekcję.
   */
  readonly diagnostics?: readonly CardField[];

  /** Komunikat blokady gotowości obliczeniowej (jeśli dotyczy). */
  readonly readinessBlocker?: string | null;
}

/**
 * Predykat: zwraca `true`, gdy podana karta dotyczy obiektu, który
 * wizualnie i semantycznie odpowiada rozdzielnicy SN.
 *
 * Używany m.in. przez SLD v2 do decyzji o renderze station-like switchgear
 * (stacja, ZKSN, GPZ — wszystkie z polami i szyną).
 */
export function isSwitchgearSubject(subject: TechCardSubject): boolean {
  return subject.kind === 'gpz' || subject.kind === 'station' || subject.kind === 'zksn';
}
