/** Teksty PL kreatora „Wyprowadź magistralę SN" (G-MAG). Język inżynierski. */

export const MAGISTRALA_STRINGS = {
  eyebrow: 'MODEL SIECI · MAGISTRALA SN',
  cel:
    'Wyprowadź ciąg SN z pola odpływowego GPZ — pierwszy odcinek kabla lub linii. '
    + 'Parametry bierzesz z katalogu; spadek napięcia i prąd liczy backend. '
    + 'Na końcu odcinka zawiesisz stację, odbiory albo kolejny odcinek.',
  odznaka: 'Nowy odcinek SN',

  krokTyp: 'Rodzaj i typ odcinka',
  krokParametry: 'Długość i podgląd',
  krokZapis: 'Podsumowanie i zapis',

  rodzaj: 'Rodzaj odcinka',
  rodzaje: [
    { id: 'KABEL', etykieta: 'Kabel SN' },
    { id: 'LINIA', etykieta: 'Linia napowietrzna SN' },
  ],
  typKatalog: 'Typ z katalogu',
  typKatalogPlaceholder: '— wybierz typ odcinka —',
  typKabelBlad: 'Nie udało się pobrać katalogu kabli SN.',
  typLiniaBlad: 'Nie udało się pobrać katalogu linii SN.',
  typPomoc: 'Typ wnosi rezystancję, reaktancję i prąd znamionowy — wartości z katalogu, nie z ręki.',

  nazwa: 'Nazwa odcinka',
  nazwaPlaceholder: 'np. Magistrala A / odcinek 1',
  dlugosc: 'Długość odcinka',
  napiecie: 'Napięcie ciągu',
  prad: 'Prąd obciążenia (do podglądu ΔU)',
  pradPomoc: 'Domyślnie prąd znamionowy typu. Podaj przewidywane obciążenie, aby zobaczyć realny spadek.',
  cosPhi: 'Współczynnik mocy cosφ',

  // Parametry katalogu (odczyt).
  paramR: 'Rezystancja R',
  paramX: 'Reaktancja X',
  paramIznam: 'Prąd znamionowy',

  // Podgląd (backend R1).
  podgladTytul: 'Podgląd doboru (backend)',
  podgladDeltaU: 'Spadek napięcia ΔU',
  podgladDeltaUpct: 'ΔU względne',
  podgladRtotal: 'R odcinka',
  podgladXtotal: 'X odcinka',
  podgladZrodlo: 'Źródło wyniku',
  podgladZrodloWartosc: 'Obliczenie ΔU po stronie serwera (R1)',
  podgladBrak: 'Uzupełnij typ i długość, aby zobaczyć podgląd ΔU.',
  podgladBlad: 'Nie udało się wyznaczyć podglądu ΔU.',
  podgladOstrzezenieIznam: 'Prąd obciążenia przekracza prąd znamionowy typu — dobierz większy przekrój.',

  // Kontrola / gotowość.
  kontrolaTytul: 'Kontrola odcinka',
  wierszTyp: 'Typ z katalogu',
  wierszDlugosc: 'Długość',
  wierszDeltaU: 'Spadek ΔU',
  wierszObciazenie: 'Obciążalność',
  stanKompletne: 'Kompletne',
  stanBrak: 'Do uzupełnienia',
  stanOstrzezenie: 'Sprawdź',

  nastepnyOpis:
    'Po zapisie odcinka aplikacja od razu otworzy wybrany krok na jego końcu — '
    + 'stację SN/nN, ZK SN, słup rozgałęźny albo kolejny odcinek magistrali.',

  // Następny krok flow (realna operacja domenowa po zapisie).
  krokNastepnyTytul: 'Co postawić na końcu odcinka',
  krokNastepnyPomoc: 'Wybór uruchamia realny krok budowy — nie jest to sama etykieta.',
  nextOpcje: [
    { id: 'station', etykieta: 'Stacja SN/nN' },
    { id: 'zksn', etykieta: 'ZK SN (mufa/złącze)' },
    { id: 'branch_pole', etykieta: 'Słup rozgałęźny' },
    { id: 'continue', etykieta: 'Kolejny odcinek' },
  ],
  nextBranchPoleBlokada:
    'Słup rozgałęźny można wstawić tylko na odcinku napowietrznym SN. Dla kabla wybierz ZK SN.',

  // Uczciwy stan zerowy: brak startu ciągu.
  brakStartuTytul: 'Brak miejsca startu ciągu',
  brakStartuStacja:
    'Wybrana stacja nie ma wolnego portu wyjściowego SN. Wskaż stację na końcu ciągu '
    + 'albo głowicę odpływową pola SN na schemacie.',
  brakStartuOgolny:
    'Zaznacz na schemacie głowicę pola odpływowego SN albo wolny koniec istniejącego ciągu, '
    + 'z którego chcesz wyprowadzić magistralę.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz odcinek SN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem odcinka.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać odcinek.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: magistrala SN — odcinek linii/kabla i spadek napięcia',
  teoriaOpis:
    'Odcinek magistrali (linia napowietrzna lub kabel) ma rezystancję R i reaktancję X na jednostkę '
    + 'długości (z katalogu przewodu/kabla). Przy przepływie mocy P i Q powstaje spadek napięcia '
    + '≈ (R·P + X·Q)/U oraz straty mocy ∝ I²·R rosnące z kwadratem prądu. Dłuższy odcinek i większe '
    + 'obciążenie → większy spadek napięcia na końcu magistrali. Przekrój przewodu dobiera się do '
    + 'obciążalności prądowej (nagrzewanie) i do dopuszczalnego spadku napięcia. Wszystkie wartości '
    + 'liczbowe (ΔU, straty, prądy) wyznacza solver — katalog wnosi tylko parametry jednostkowe.',
  teoriaWymog:
    'Przekrój musi wytrzymać prąd obciążenia długotrwale i prąd zwarciowy cieplnie; spadek napięcia '
    + 'na całej magistrali powinien mieścić się w dopuszczalnym zakresie (typowo kilka %).',
  teoriaPodstawa: 'Podstawa: PN-EN 50160 (napięcie), N SEP-E-004 (linie i kable), IRiESD.',
  teoriaJakCzytac:
    'Linia = napięcie wzdłuż magistrali od źródła (1,0 pu) do końca odcinka. Nachylenie zależy '
    + 'poglądowo od cosφ (niższy cosφ → stromszy spadek: większy udział składowej biernej na '
    + 'reaktancji). Pasmo poniżej limitu = poza dopuszczalnym zakresem napięcia. Rzeczywisty ΔU '
    + '(z katalogowego R/X, długości i obciążenia) liczy rozpływ mocy.',
  wykresAria: 'Poglądowy profil napięcia wzdłuż magistrali w funkcji cosφ',
  wykresOsX: 'Pozycja wzdłuż magistrali',
  wykresOsU: 'Napięcie U [pu]',
  wykresLimit: 'dopuszczalny limit',
  wykresZrodlo: 'źródło',
} as const;
