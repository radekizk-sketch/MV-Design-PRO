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
  typPomoc: 'Typ kabla z katalogu nN (KABEL_NN) — parametry R/X/Iz pochodzą z pozycji katalogowej '
    + '(materializacja przy zapisie, zero parametrów wpisywanych ręcznie).',
  kabel: 'Typ kabla',
  kabelPlaceholder: '— wybierz kabel z katalogu —',
  kabelBlad: 'Nie udało się pobrać katalogu kabli nN.',
  nazwa: 'Nazwa odcinka',
  nazwaPlaceholder: 'np. Kabel nN K1',
  szynaZrodlowa: 'Szyna źródłowa',

  sekcjaParametryTytul: 'Parametry odcinka',
  dlugosc: 'Długość',
  nParallel: 'Liczba torów równoległych',
  nParallelPomoc: 'Kable ułożone równolegle na tej samej trasie — n torów dzieli prąd obciążenia po równo (Iz′ całkowite = n × Iz′ jednego toru).',

  sekcjaUlozenieTytul: 'Warunki ułożenia (korekta obciążalności)',
  ulozeniePomoc: 'Po co: koryguje obciążalność katalogową kabla do rzeczywistych warunków trasy '
    + '(PN-HD 60364-5-52); z czego: środowisko, izolacja, temperatura otoczenia, liczba obwodów '
    + 'w wiązce/wykopie; co daje: Iz′ (obciążalność skorygowaną) liczoną przez backend przy każdym odczycie.',
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
  ibPodgladuPomoc: 'Wyłącznie do podglądu spadku napięcia w tym kreatorze — nie jest zapisywany w operacji '
    + 'domenowej (Ib obwodu wyznacza się osobno przy doborze zabezpieczenia).',
  podgladDeltaU: 'ΔU',
  podgladDeltaUpct: 'ΔU [%]',
  podgladBrak: 'Podaj Ib i wybierz kabel, aby zobaczyć podgląd spadku napięcia.',
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
  walidacjaStopka: 'Uzupełnij wymagane pola przed zapisem.',
  brakZakresu: 'Brak aktywnego przypadku obliczeniowego.',
  bladDodania: 'Nie udało się dodać odcinka nN.',

  teoriaTytul: 'Dobór przekroju kabla nN',
  teoriaOpis: 'Kryteria doboru: obciążalność prądowa (Ib ≤ In ≤ Iz′) i dopuszczalny spadek napięcia — '
    + 'oba weryfikowane osobno (Iz′ przy doborze zabezpieczenia, ΔU w tym podglądzie i w tabeli ODCINKI).',
  teoriaWymog: 'PN-HD 60364-5-52 (obciążalność), IEC 60364-4-43 (dobór zabezpieczenia z Iz′)',
  teoriaPodstawa: 'Norma',
} as const;
