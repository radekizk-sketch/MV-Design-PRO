/**
 * SLD V3 — APARAT ARKUSZA przy dolnej krawędzi rysunku: stałe ekranowe podpisów
 * ramki („Widok: …", „Skala …") rysowanych przez `sheet/Frame.tsx`.
 *
 * Do karty SLD-SKALA-I-NAWIGACJA moduł układał JEDEN dolny pas chromu dla dwóch
 * właścicieli: podpisów arkusza i ekranowego wskaźnika „Ukryto N opisów” (karta
 * RAMKA-TNIE-PODPISY: wskaźnik ustępował podpisom). Wskaźnik został usunięty —
 * gęstość napisów jest funkcją skali (R3), a tożsamość nie znika (R4) — więc
 * zostały wyłącznie stałe podpisów arkusza, z jednym konsumentem.
 *
 * Moduł jest CZYSTY (bez React/DOM).
 */

/** Odstęp podpisów dolnych arkusza (skala) od ramki [px EKRANU]. */
export const SHEET_CAPTION_OFFSET_SCREEN_PX = 20;

/** Grubość kreski ramki arkusza [px EKRANU] — stała ekranowa (S9-7:
 *  `screenFixedLength(1.5, scale)`), więc ramka ma tę samą wagę przy każdym
 *  zoomie. */
export const SHEET_BORDER_STROKE_SCREEN_PX = 1.5;

/** Treść podpisu skali arkusza — jedno źródło dla renderu ramki i testów. */
export function sheetScaleCaptionText(scaleLabel: string): string {
  return `Skala ${scaleLabel}`;
}
