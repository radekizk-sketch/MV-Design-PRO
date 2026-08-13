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

  // --- Magazyn dokumentów (cykl życia; karta F-E8.3) ---------------------
  statusWygenerowany: 'Wygenerowany',
  magazynLabel: 'W magazynie',
  stronyLabel: 'str.',
  akcjaPobierz: 'Pobierz',
  akcjaPodglad: 'Podgląd',

  // --- Q3: CO DALEJ (pasek procesu) --------------------------------------
  // Etykiety kroków USUNIĘTE (karta PULPIT-NBA): pasek procesu konsumuje teraz
  // kanoniczny rejestr etapów `ui2/proces/etapy.ts` i bierze nazwy stamtąd.
  // Trzymanie tu własnej listy kroków było drugim rejestrem etapów.

  powrot: '← Dokumentacja',
  powrotOpis: 'Wróć do przeglądu dokumentacji',
} as const;
