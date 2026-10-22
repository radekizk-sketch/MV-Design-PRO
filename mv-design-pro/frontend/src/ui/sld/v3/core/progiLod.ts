/**
 * Progi skali przełączania poziomu szczegółu (LOD) — JEDNO źródło dla kamery
 * (`canvas/camera.ts` `DEFAULT_LOD_THRESHOLDS`, wyprowadzenie wartości tam) i dla
 * kompozycji, która planuje rysunek pod NAJMNIEJSZĄ skalę, przy której jest rysowana.
 *
 * Karta GPZ-H5-SLD etap 2 (wymaganie 5): kompozycja GPZ rezerwuje pasma oznaczeń pól na
 * pismo powiększone do progu czytelności przy skali `PROG_SKALI_L0_L1` (poniżej GPZ jest
 * zwinięty do glifu L0), więc w kadrze „Dopasuj widok" oznaczenie nie jest skracane.
 * Druga kopia liczby 0,6 w kompozycji rozjechałaby się z kamerą przy pierwszej zmianie
 * progu (reguła KLASA §3).
 */
export const PROG_SKALI_L0_L1 = 0.6;
export const PROG_SKALI_L1_L2 = 1.2;
