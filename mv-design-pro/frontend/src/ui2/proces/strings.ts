/*
 * Teksty modułu procesu (mapa etapów E1–E8 + następna najlepsza akcja).
 * Wyłącznie polski język inżynierski (MODEL_INTERAKCJI §2.7). Jedno źródło
 * etykiet — testy importują te same stałe zamiast powtarzać literały.
 *
 * ZAKAZ identyfikatorów kodowych w tekście pierwszoplanowym (guard
 * `ui_terminology_guard.py`, reguła nowej IA): opis problemu gotowości bierze
 * się z komunikatu backendu (`message_pl`), a kod techniczny zostaje w warstwie
 * „szczegóły techniczne" panelu gotowości.
 */

export const PROCES_STRINGS = {
  // --- mapa procesu ---------------------------------------------------------
  mapaTytul: 'Etapy pracy',
  mapaOpis: 'Kliknij etap, aby przejść do jego miejsca pracy.',
  mapaBiezacyOpis: 'Etap bieżący',

  // --- etapy osi projektanta (E1–E8) ---------------------------------------
  e1Nazwa: 'Zlecenie i dane wejściowe',
  e1Cel: 'Zbierz warunki przyłączenia od operatora i dane wyjściowe zlecenia.',
  e2Nazwa: 'Budowa modelu sieci',
  e2Cel: 'Zbuduj model: stacje, magistrale, źródła zasilania i odbiory.',
  e3Nazwa: 'Gotowość obliczeniowa',
  e3Cel: 'Usuń blokady, aby model dopuszczał uruchomienie obliczeń.',
  e4Nazwa: 'Warianty i obliczenia',
  e4Cel: 'Zdefiniuj warianty pracy i policz zwarcia oraz rozpływ mocy.',
  e5Nazwa: 'Interpretacja wyników',
  e5Cel: 'Odczytaj werdykty, wartości i założenia wykonanych obliczeń.',
  e6Nazwa: 'Decyzje projektowe',
  e6Cel: 'Popraw dobory w modelu na podstawie odczytanych wyników.',
  e7Nazwa: 'Zgodność i uzgodnienia',
  e7Cel: 'Sprawdź zgodność źródeł i przygotuj uzgodnienia z operatorem.',
  e8Nazwa: 'Dokumentacja i odbiór',
  e8Cel: 'Wygeneruj dokumenty projektu i zamknij odbiór.',

  // --- następna najlepsza akcja --------------------------------------------
  nbaEyebrow: 'Następna najlepsza akcja',
  nbaEtapPrefiks: 'Etap',

  nbaOtworzProjektTytul: 'Otwórz projekt',
  nbaOtworzProjektOpis: 'Bez otwartego projektu nie ma modelu ani obliczeń.',
  nbaOtworzProjektAkcja: 'Otwórz projekt',

  nbaUstalGotowoscTytul: 'Ustal gotowość modelu',
  nbaUstalGotowoscOpis:
    'Gotowości tego modelu nikt jeszcze nie policzył — bez niej nie wiadomo, czy wolno liczyć.',
  nbaUstalGotowoscAkcja: 'Przejdź do gotowości',

  nbaUsunBlokadeAkcja: 'Przejdź do naprawy',
  /** Ile blokad zostaje po tej jednej — liczba prosto z kontraktu gotowości. */
  nbaPozostaleBlokady: (pozostalo: number) =>
    pozostalo === 0
      ? 'To ostatnia blokada — po jej usunięciu model dopuści obliczenia.'
      : `Po tej naprawie zostanie jeszcze ${pozostalo} blokad(y) gotowości.`,

  nbaUruchomObliczeniaTytul: 'Uruchom obliczenia',
  nbaUruchomObliczeniaOpis:
    'Model nie ma blokad gotowości, a żadne obliczenie nie zostało jeszcze zakończone.',
  nbaUruchomObliczeniaAkcja: 'Przejdź do obliczeń',

  nbaPrzeliczPonownieTytul: 'Przelicz ponownie',
  nbaPrzeliczPonownieOpis:
    'Model zmienił się po ostatnim obliczeniu — dotychczasowe wyniki są nieaktualne.',
  nbaPrzeliczPonownieAkcja: 'Przejdź do obliczeń',

  nbaPrzejdzDoWynikowTytul: 'Odczytaj wyniki',
  nbaPrzejdzDoWynikowOpis: 'Obliczenia są zakończone, a wyniki aktualne względem modelu.',
  nbaPrzejdzDoWynikowAkcja: 'Przejdź do wyników',
} as const;
