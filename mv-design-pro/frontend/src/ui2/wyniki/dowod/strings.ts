/*
 * Teksty okna „Dowód obliczeń" (karta E9.1 / W-608) — wyłącznie polski język
 * techniczny (MODEL_INTERAKCJI §2.7). Zero literałów UI w JSX; identyfikatory
 * (element_id, input_hash, surowe klucze wielkości) renderowane wyłącznie w trybie
 * eksperckim jako wyrażenia `{...}` z danych. Etykiety pięciu pól kanonu pochodzą
 * z `TRACE_FIELD_LABELS` (ui/results-inspector/types.ts:289) — nie duplikujemy ich
 * tutaj. Read-only, zero fizyki (NOT-A-SOLVER).
 */

export const DOWOD_STRINGS = {
  // Stan pusty (przebieg bez śladu obliczeń)
  brakSladu: 'Przebieg bez śladu obliczeń',
  brakSladuOpis:
    'Ten przebieg nie zawiera śladu WHITE BOX — brak kroków do wyświetlenia. Uruchom obliczenie, aby zobaczyć rozpisany dowód.',

  // Stan ładowania
  ladowanie: 'Wczytywanie śladu obliczeń…',

  // Spis kroków (lewa kolumna)
  spisTytul: 'Kroki obliczeń',
  spisEtykieta: 'Spis kroków dowodu',

  // Powiązanie z modelem
  pokazNaSchemacie: 'Pokaż na schemacie',

  // Nagłówek — odcisk danych wejściowych (tryb ekspercki)
  odciskWejscia: 'Odcisk danych wejściowych',

  // Wartość pusta
  kreska: '—',
} as const;
