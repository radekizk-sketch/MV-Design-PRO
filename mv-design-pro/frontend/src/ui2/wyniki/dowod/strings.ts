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
    'Ten przebieg nie zawiera śladu obliczeń — brak kroków do wyświetlenia. Uruchom obliczenie, aby zobaczyć rozpisany dowód.',

  // Stan ładowania
  ladowanie: 'Wczytywanie śladu obliczeń…',

  // Spis kroków (lewa kolumna)
  spisTytul: 'Kroki obliczeń',
  spisEtykieta: 'Spis kroków dowodu',

  // Powiązanie z modelem
  pokazNaSchemacie: 'Pokaż na schemacie',

  // Zakres wywodu (KD-4, luka L-11) — cały przebieg vs wskazany element
  zakresEtykieta: 'Zakres wywodu',
  zakresCaly: 'Cały przebieg',
  zakresBrakKrokow:
    'Ślad tego przebiegu nie wiąże żadnego kroku ze wskazanym elementem — dostępny jest wywód całego przebiegu.',

  // Źródło LaTeX wywodu (KD-4, luka L-10) — dostawca: eksport `.tex` backendu
  latexEyebrow: 'ŹRÓDŁO LATEX',
  latexOpis:
    'Dokument źródłowy .tex zamrożonego artefaktu wywodu — do wklejenia w opracowanie albo do archiwum.',
  latexPokaz: 'Pokaż źródło',
  latexPobieranie: 'Pobieranie…',
  latexKopiuj: 'Kopiuj',
  latexSkopiowano: 'Skopiowano',
  latexKopiaBlad: 'Przeglądarka nie udostępniła schowka — użyj pobrania pliku.',
  latexPobierz: 'Pobierz',
  latexBlad: 'Nie udało się pobrać źródła LaTeX.',

  // Pakiet dowodowy przebiegu (karta PACK-DOWODY) — zamknięty artefakt do
  // opracowania i archiwum: dowód + źródło + wykaz plików + odcisk integralności.
  pakietEyebrow: 'PAKIET DOWODOWY',
  pakietOpis:
    'Zamknięty pakiet obliczenia do opracowania i archiwum — z sumami kontrolnymi plików i odciskiem integralności.',
  pakietPunkt: 'Punkt zwarcia',
  pakietPobierz: 'Pobierz pakiet',
  pakietPobieranie: 'Składanie pakietu…',
  pakietPobrano: 'Pobrano plik:',
  pakietLadowanie: 'Sprawdzanie dostępności pakietu dowodowego…',
  pakietBlad: 'Nie udało się pobrać pakietu dowodowego.',
  pakietBrakOgolny: 'Ten przebieg nie ma dedykowanego pakietu dowodowego.',
  pakietNieaktualne:
    'Wyniki są nieaktualne względem modelu — pakiet udokumentuje stan sprzed zmiany',

  // Nagłówek — odcisk danych wejściowych (tryb ekspercki)
  odciskWejscia: 'Odcisk danych wejściowych',

  // Wartość pusta
  kreska: '—',
} as const;
