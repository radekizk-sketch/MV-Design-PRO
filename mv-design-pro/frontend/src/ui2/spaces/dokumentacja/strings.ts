/**
 * Teksty PL huba „Dokumentacja" (karta F-E8.1; runda R2 — uproszczenie,
 * „minimum informacji – maksimum decyzji"). Wyłącznie polski język techniczny;
 * zero surowych identyfikatorów w strefie pierwszoplanowej.
 */

export const DOK_STRINGS = {
  tytul: 'Dokumentacja',
  cel: 'Wygeneruj dokumenty odbiorowe z zakończonych obliczeń.',

  // --- Q1: OBLICZENIA (czy zakończyły się poprawnie?) --------------------
  statusEyebrow: 'OBLICZENIA',
  statusZakonczone: 'Obliczenia zakończone',
  statusUklad: 'układ',
  statusBrak: 'Brak zakończonego obliczenia — dokumenty z obliczeń będą dostępne po jego wykonaniu.',
  statusAkcja: 'Przejdź do obliczeń',

  // --- Q2: DOKUMENTY (co mogę wygenerować?) ------------------------------
  dokumentyEyebrow: 'DOKUMENTY DO WYGENEROWANIA',
  zawartoscLabel: 'Zawartość',
  dowodFormalny: 'DOWÓD FORMALNY',

  statusDoWygenerowania: 'Do wygenerowania',
  statusWymagaPrzebiegu: 'Wymaga: zakończony przebieg',
  statusWymagaProjektu: 'Wymaga: otwarty projekt',

  // --- Q3: CO DALEJ (pasek procesu) --------------------------------------
  procesEyebrow: 'CO DALEJ',
  procesProjekt: 'Projekt',
  procesObliczenia: 'Obliczenia',
  procesDokumentacja: 'Dokumentacja',
  procesEksport: 'Eksport',
  procesWniosek: 'Wniosek OSD',

  powrot: '← Dokumentacja',
  powrotOpis: 'Wróć do przeglądu dokumentacji',
} as const;
