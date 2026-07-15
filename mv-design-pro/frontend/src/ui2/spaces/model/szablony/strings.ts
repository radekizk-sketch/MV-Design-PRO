/*
 * Teksty przeglądarki szablonów stacji (przestrzeń „Model sieci", okno W-203,
 * karta E3.1) — wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7).
 * Centralizacja tekstu = jedno źródło etykiet (importowane wprost przez testy
 * jako oczekiwane wartości) oraz brak literałów w JSX (zgodność z guardem
 * terminologii UI, który skanuje tekst JSX/propsy `label`/`title`).
 */

export const SZABLONY_STRINGS = {
  // Nagłówek okna
  tytul: 'Przeglądarka szablonów stacji',
  podtytul: 'Biblioteka gotowych wariantów stacji SN/nn — wybierz grupę, przejrzyj, zastosuj.',

  // Drzewko ról A–E
  drzewkoEtykieta: 'Role sieciowe',
  ladowanieDrzewka: 'Wczytywanie biblioteki szablonów…',
  bladDrzewkaTytul: 'Nie udało się wczytać biblioteki szablonów',
  sprobujPonownie: 'Spróbuj ponownie',

  // Wybór grupy / stan pusty
  wybierzGrupe: 'Wybierz grupę z drzewka po lewej, aby zobaczyć warianty.',
  ladowanieGrupy: 'Wczytywanie wariantów…',
  bladGrupyTytul: 'Nie udało się wczytać wariantów tej grupy',
  pustaGrupa: 'Brak szablonów w tej grupie',
  pustoPoFiltrach: 'Brak szablonów spełniających filtry',

  // Kafel wariantu
  liczbaPolSkrot: 'pól SN',
  opisZastosowania: 'Zastosowanie',
  wlasny: 'własny',

  // Filtry
  filtryTytul: 'Filtry',
  filtrSzukaj: 'Szukaj (moc, napięcie, słowa kluczowe)',
  filtrSzukajPlaceholder: 'np. 630 kVA, 15/0,4 kV, prosument…',
  filtrLiczbaPol: 'Liczba pól SN',
  filtrLiczbaPolOd: 'od',
  filtrLiczbaPolDo: 'do',
  filtrWyczysc: 'Wyczyść filtry',

  // Panel szczegółów
  szczegolyTytul: 'Szczegóły szablonu',
  szczegolyBrakWyboru: 'Kliknij wariant, aby zobaczyć szczegóły.',
  szczegolyTransformator: 'Transformator',
  szczegolyPolaSn: 'Pola rozdzielnicy SN',
  szczegolyOdplywyNn: 'Odpływy nn',
  szczegolyZrodla: 'Źródła / magazyny (DER)',
  szczegolyZabezpieczenia: 'Zabezpieczenia pól SN',
  szczegolyPomiary: 'Pomiary',
  szczegolyParametryEdytowalne: 'Parametry edytowalne',
  szczegolyBrakDer: 'Brak źródeł OZE w tym szablonie',
  zastosujIEdytuj: 'Zastosuj i edytuj',

  // Menu kontekstowe
  menuPorownaj: 'Porównaj',
  menuPorownajUsun: 'Usuń z porównania',
  menuPorownajPelne: 'Porównanie pełne (wybierz max. 2 warianty)',
  menuWymaganiaDanych: 'Pokaż wymagania danych',
  menuWymaganiaDanychNiedostepne: 'Niedostępne w tej karcie — patrz TODO-KARTA',

  // Porównanie
  porownanieTytul: 'Porównanie szablonów',
  porownanieCecha: 'Cecha',
  porownanieRoznica: 'Różnica',
  porownanieIdentyczne: 'identyczne',
  porownanieRozne: 'różne',
  porownanieZamknij: 'Zamknij porównanie',
  porownanieWierszLiczbaPol: 'Liczba pól SN',
  porownanieWierszRolePol: 'Role pól SN',
  porownanieWierszTransformator: 'Transformator',
  porownanieWierszLiczbaTransformatorow: 'Liczba transformatorów',
  porownanieWierszOdplywyNn: 'Odpływy nn',
  porownanieWierszDer: 'Źródła / magazyny (DER)',
  porownanieWierszAparatyNn: 'Aparaty nn',
  porownanieWierszZabezpieczenia: 'Zabezpieczenia pól SN',
} as const;
