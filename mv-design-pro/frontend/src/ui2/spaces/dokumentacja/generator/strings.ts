/**
 * Teksty PL generatora raportu w powloce ui2 (karta KD-4, luka L-15).
 * Jezyk inzynierski: po co · z czego · co daje. Zero identyfikatorow w strefie
 * pierwszoplanowej, zero kryptonimow.
 */

export const GEN_STRINGS = {
  tytul: 'Generator raportu technicznego',
  cel: 'Złóż dokument z zakończonego obliczenia: wybierz przebieg, zakres i sekcje, potem pobierz plik.',

  // --- Krok 1: przebieg ---------------------------------------------------
  przebiegEyebrow: 'PRZEBIEG ŹRÓDŁOWY',
  przebiegOpis: 'Raport powstaje z JEDNEGO zakończonego obliczenia — jego wyniki i ślad trafiają do dokumentu.',
  przebiegBrak: 'Brak zakończonego obliczenia — nie ma z czego złożyć raportu.',
  przebiegBrakAkcja: 'Przejdź do obliczeń',
  przebiegEtykieta: 'Przebieg',

  // --- Krok 2: kompozycja -------------------------------------------------
  kompozycjaEyebrow: 'SKŁAD DOKUMENTU',
  kompozycjaOpis: 'Każde ustawienie jedzie do backendu jako parametr eksportu — dokument realnie się zmienia.',
  profilEtykieta: 'Profil odbiorcy',
  poziomEtykieta: 'Poziom szczegółowości',
  zakresEtykieta: 'Zakres danych',
  sekcjeEtykieta: 'Sekcje dokumentu',
  sekcjeUwaga: 'Bez wskazania sekcji dokument dostaje zestaw domyślny dla wybranego poziomu.',
  tabelaEtykieta: 'Tabela wiodąca',
  tabelaBrak: 'Bez wskazania',
  tabelaUwaga: 'Ma znaczenie tylko przy zakresie „Aktywna tabela".',

  // --- Krok 3: wytworzenie ------------------------------------------------
  eksportEyebrow: 'WYTWÓRZ DOKUMENT',
  raportGrupa: 'Raport techniczny',
  dowodGrupa: 'Pakiet dowodowy WHITE BOX',
  dowodOpis: 'Formalny wywód obliczeń (liczba → wzór → wynik). Skład dokumentu go nie dotyczy — pakiet jest pełny z definicji.',
  zapiszDoMagazynu: 'Zapisz kopię w magazynie dokumentów projektu',
  zapiszOpis: 'Zapisany dokument pojawia się na liście w przeglądzie dokumentacji (z datą, rozmiarem i odciskiem).',
  pracuje: 'Generowanie…',

  // --- Brama dokumentacji wykonawczej (KOMPLETNOSC-POLA-TR) ---------------
  bramaPwTytul: 'Projekt nie jest gotowy do dokumentacji wykonawczej',
  bramaPwOpis:
    'Profil „Wykonawczy" opisuje, co i jak ma zostać zbudowane, więc wymaga modelu bez luk '
    + 'konfiguracyjnych. Poniższe braki zamykają tę drogę; pozostałe profile i obliczenia '
    + 'działają bez zmian.',
  bramaPwPrzejdz: 'Pokaż w panelu gotowości',
  sukces: 'Wygenerowano plik',
  blad: 'Nie udało się wygenerować dokumentu',

  powrot: '← Dokumentacja',
} as const;

/** Etykiety PL profili raportu (1:1 z `REPORT_PROFILE_LABELS` backendu). */
export const PROFILE_PL = {
  osd: 'OSD (operator sieci)',
  wykonawczy: 'Wykonawczy',
  audytowy: 'Audytowy',
} as const;

/** Etykiety PL poziomow szczegolowosci (1:1 z `REPORT_DETAIL_LABELS`). */
export const POZIOM_PL = {
  minimalny: 'Minimalny',
  standardowy: 'Standardowy',
  pelny: 'Pełny',
} as const;

/** Etykiety PL zakresow (1:1 z `REPORT_SCOPE_LABELS`). */
export const ZAKRES_PL = {
  whole_run: 'Cały model',
  active_table: 'Aktywna tabela',
} as const;

/** Etykiety PL sekcji (1:1 z `REPORT_SECTION_LABELS`). */
export const SEKCJA_PL = {
  summary: 'Podsumowanie',
  results: 'Wyniki tabelaryczne',
  catalog: 'Kontekst katalogowy',
  trace: 'Wywód szczegółowy',
} as const;
