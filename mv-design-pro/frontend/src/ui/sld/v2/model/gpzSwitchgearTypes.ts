/**
 * Typy stanów aparatów rozdzielni i adnotacji regulacji zaczepów — czytane przez
 * adapter ENM → SLD (`canvas/enmToSldAdapter.ts`), model GPZ v3 (`canvas/canonicalGpzModel.ts`)
 * i kontrakt rozdzielni stacji (`station-rozdzielnia/contract.ts`).
 *
 * GPZ-PARYTET cz. 2 (pkt 4): wydzielone z `v2/renderer/GpzSwitchgearTypes.ts` po kasacji
 * martwego `GpzSwitchgearRenderer` (bez konsumenta produkcyjnego); opisy sekcji, pól
 * i sprzęgieł renderera skasowane razem z nim (zero konsumentów po kasacji).
 */

/** Stan łączeniowy CB/DS w polu; brak danej = `unknown` (nigdy domyślnie zamknięty). */
export type GpzApparatusSwitchState = 'closed' | 'open' | 'unknown';

/**
 * Stan uziemnika (Earthing Switch — ES).
 *
 * BHP-krytyczny: jego stan determinuje, czy pole jest bezpieczne do prac
 * (PN-EN 62271-102). Operator MUSI widzieć jednoznacznie.
 *
 *  - 'open'    → pole pod napięciem / nieuziemione (normalny stan pracy)
 *  - 'closed'  → pole uziemione (czerwony marker bezpieczeństwa)
 *  - 'unknown' → brak telemetrii ze sterownika (Invariant 9)
 *  - 'absent'  → pole nie ma uziemnika (np. proste RMU bez ES — symbol nie
 *                 renderowany, niemniej dokumentowany w typie)
 */
export type EarthingSwitchState = 'open' | 'closed' | 'unknown' | 'absent';

/**
 * Adnotacja regulacji zaczepów do wyświetlenia przy symbolu transformatora
 * (karta koordynacyjna SLD-02). Wszystkie wartości pochodzą z modelu
 * (`Transformer.tap_changer`) — prezentacja, nie obliczenie.
 */
export interface OltcGlyphAnnotation {
  /** "OLTC" lub "DETC" (regulation_type != NONE). */
  readonly kind: 'OLTC' | 'DETC';
  /** Pozycja zaczepu jako etykieta, np. "poz. +3", "poz. −4", "poz. 0". */
  readonly positionLabel: string;
  /** Tryb sterowania jako badge: "AUTO" (AUTOMATIC/PROFILE/REMOTE) lub "MAN". */
  readonly modeLabel: 'AUTO' | 'MAN';
  /** Napięcie zadane, np. "nastawa 15.5 kV" (tylko tryb automatyczny). */
  readonly setpointLabel?: string;
}
