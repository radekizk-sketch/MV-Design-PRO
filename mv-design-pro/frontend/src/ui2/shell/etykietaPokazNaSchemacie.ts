/*
 * Etykieta akcji wejścia na schemat — JEDNA w całej aplikacji (karta
 * SLD-SKALA-I-NAWIGACJA, pkt 5). Moduł liściowy (zero importów): słowniki napisów
 * (`ui2/wyniki/*\/strings.ts`) czytają ją bez cyklu przez jedyną drogę
 * `zaznaczElementModelu.ts`, która sama sięga do sklepów i nawigacji.
 */
export const ETYKIETA_POKAZ_NA_SCHEMACIE = 'Pokaż na schemacie';
