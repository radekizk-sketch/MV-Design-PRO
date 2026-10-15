/** Teksty PL kreatora „Odcinek nN" (add_nn_cable_segment). Język inżynierski. */

export const ODCINEK_NN_STRINGS = {
  eyebrow: 'nN STUDIO · ODCINEK KABLOWY',
  tytul: 'Nowy odcinek nN',
  cel: 'Wyprowadź kabel nN z wybranej szyny do nowej szyny odbiorczej — po co: przedłuża tor '
    + 'zasilania w głąb instalacji; z czego: typ kabla z katalogu nN; co daje: nowy punkt, od '
    + 'którego można dalej rozbudowywać obwód (kolejny odcinek, rozdzielnica, aparat, odbiór).',
  odznaka: 'Nowy odcinek',

  brakStartuTytul: 'Brak punktu startowego',
  brakStartuOpis: 'Wskaż szynę nN (w drzewie nN STUDIO albo na schemacie), z której ma wychodzić odcinek.',

  sekcjaTypTytul: 'Kabel',
  typPomoc: 'Typ kabla nN z katalogu — R, X i Iz wchodzą do modelu z pozycji katalogowej.',
  kabel: 'Typ kabla',
  kabelPlaceholder: '— wybierz kabel z katalogu —',
  kabelBlad: 'Nie udało się pobrać katalogu kabli nN.',
  nazwa: 'Nazwa odcinka',
  nazwaPlaceholder: 'np. Kabel nN nr 1',
  szynaZrodlowa: 'Szyna źródłowa',

  sekcjaParametryTytul: 'Parametry odcinka',
  dlugosc: 'Długość',
  nParallel: 'Liczba torów równoległych',
  nParallelPomoc: 'Liczba równoległych torów tego samego kabla — dzielą prąd po równo (Iz′ = n × Iz′ toru).',
  ekranUziemienie: 'Uziemienie ekranu kabla',
  ekranUziemieniePomoc:
    'Sposób uziemienia ekranu — katalogowe R0/X0 dotyczą układu odniesienia typu kabla.',

  sekcjaUlozenieTytul: 'Warunki ułożenia (korekta obciążalności)',
  ulozeniePomoc: 'Warunki ułożenia trasy — z nich backend koryguje obciążalność katalogową do Iz′ (PN-HD 60364-5-52).',
  ulozenieKatalogowe: 'Warunki katalogowe (bez korekty)',
  ulozenieWlasne: 'Opisz warunki trasy',
  srodowisko: 'Środowisko ułożenia',
  srodowiskoPowietrze: 'Powietrze',
  srodowiskoGrunt: 'Grunt',
  izolacja: 'Izolacja żyły',
  temperatura: 'Temperatura otoczenia',
  liczbaObwodow: 'Liczba obwodów w wiązce/wykopie',
  rezystywnoscGruntu: 'Rezystywność cieplna gruntu',

  sekcjaPodgladTytul: 'Podgląd spadku napięcia',
  ibPodgladu: 'Prąd obliczeniowy Ib (do podglądu ΔU)',
  ibPodgladuPomoc: 'Prąd tylko do podglądu spadku w tym kreatorze — nie zapisuje się w modelu.',
  podgladDeltaU: 'ΔU',
  podgladDeltaUpct: 'ΔU [%]',
  podgladBrak: 'Podgląd spadku napięcia pojawi się po wyborze kabelu, długości, Ib i cosφ.',
  cosPhiPodgladu: 'cosφ obciążenia (do podglądu ΔU)',
  cosPhiPodgladuPomoc: 'Wyłącznie do podglądu spadku napięcia — nie jest zapisywany w operacji.',
  srodowiskoPlaceholder: '— wybierz środowisko —',
  izolacjaPlaceholder: '— wybierz izolację —',
  konfliktCosPhi: 'cosφ musi być w zakresie (0, 1].',
  konfliktDlugosci: 'Długość odcinka musi być dodatnia.',
  podgladBlad: 'Podgląd spadku napięcia niedostępny — spróbuj ponownie.',
  izPrimaBrak: 'Podgląd obciążalności skorygowanej (Iz′) warunkami ułożenia nie jest jeszcze dostępny '
    + 'z tego kreatora — brakuje dedykowanego endpointu podglądu dla nN (solver `wspolczynniki_nn` liczy '
    + 'korektę wyłącznie przy zapisie operacji). Iz′ zobaczysz w tabeli ODCINKI po zapisaniu odcinka.',

  paramSekcjaNormowa: 'Parametry z katalogu',
  paramPrzekroj: 'Przekrój',
  paramR: 'R\'',
  paramX: 'X\'',
  paramIzNominalne: 'Iz (katalogowe, przed korektą ułożenia)',
  paramMaterial: 'Materiał żyły',
  paramLiczbaZyl: 'Liczba żył',

  kontrolaTytul: 'Kontrola odcinka',
  wierszSzyna: 'Szyna źródłowa',
  wierszKabel: 'Typ kabla',
  wierszDlugosc: 'Długość',

  downstreamTytul: 'Co dalej',
  downstreamOpis: 'Nowa szyna kończąca odcinek staje się punktem, od którego możesz poprowadzić kolejny '
    + 'odcinek, dodać rozdzielnicę nN, aparat zabezpieczający albo odbiór/źródło.',

  builderTytul: 'Zbudowane w tej sesji',
  builderPusto: 'Jeszcze żaden odcinek nie został dodany w tej sesji.',
  builderDodaj: 'Dodaj i kontynuuj',
  builderZakoncz: 'Zakończ',
  builderNastepny: 'Wskaż kolejny punkt w drzewie albo kontynuuj z nowej szyny.',

  zapisz: 'Zapisz odcinek',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny przypadek obliczeniowy — zapis odcinka unieważnia jego wyniki.',
  brakKablaWalid: 'Wybierz kabel nN z katalogu — R, X i obciążalność odcinka pochodzą z pozycji katalogowej.',
  brakDlugosciWalid: 'Podaj długość odcinka — od niej zależą impedancja pętli zwarcia i spadek napięcia.',
  brakSrodowiskaWalid: 'Wybierz środowisko ułożenia — od niego zależą współczynniki obciążalności Iz′.',
  brakIzolacjiWalid: 'Wybierz izolację żyły — wyznacza dopuszczalną temperaturę i obciążalność.',
  brakTemperaturyWalid: 'Podaj temperaturę otoczenia — koryguje obciążalność długotrwałą kabla.',
  brakObwodowWalid: 'Podaj liczbę obwodów w wiązce/wykopie — koryguje obciążalność przez grupowanie.',
  brakRezystywnosciWalid: 'Podaj rezystywność cieplną gruntu — wymagana dla ułożenia w gruncie.',
  bladDodania: 'Nie udało się dodać odcinka nN.',

  teoriaTytul: 'Dobór przekroju kabla nN',
  teoriaOpis: 'Kryteria doboru: obciążalność prądowa (Ib ≤ In ≤ Iz′) i dopuszczalny spadek napięcia — '
    + 'oba weryfikowane osobno (Iz′ przy doborze zabezpieczenia, ΔU w tym podglądzie i w tabeli ODCINKI).',
  teoriaWymog: 'PN-HD 60364-5-52 (obciążalność), IEC 60364-4-43 (dobór zabezpieczenia z Iz′)',
  teoriaPodstawa: 'Norma',
} as const;
