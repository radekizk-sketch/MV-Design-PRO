/** Teksty PL kreatora „Wyprowadź magistralę SN" (G-MAG). Język inżynierski. */

export const MAGISTRALA_STRINGS = {
  eyebrow: 'MODEL SIECI · MAGISTRALA SN',
  cel:
    'Wyprowadź ciąg SN z pola liniowego GPZ — pierwszy odcinek kabla lub linii. '
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
  ekranUziemienie: 'Uziemienie ekranu kabla',
  ekranUziemieniePomoc:
    'Deklaracja układu uziemienia ekranu kabla (jednostronne / dwustronne / krzyżowe). '
    + 'Katalogowe R0/X0 obowiązują dla układu odniesienia typu — rozjazd nazywa walidator '
    + '(W-W5-01), nigdy nie przelicza (brak geometrii ułożenia).',

  nazwa: 'Nazwa odcinka',
  nazwaPlaceholder: 'np. Magistrala A / odcinek 1',
  dlugosc: 'Długość odcinka',
  napiecie: 'Napięcie ciągu',
  prad: 'Prąd roboczy odcinka I_B',
  pradPomoc:
    'Prąd płynący przez odcinek (z odbiorami dalej w ciągu). Bez niego obciążalność nie zostanie '
    + 'oceniona, a spadek napięcia backend policzy przy prądzie równym obciążalności typu.',
  cosPhi: 'Współczynnik mocy cosφ',

  // Parametry katalogu (odczyt).
  paramR: 'Rezystancja R',
  paramX: 'Reaktancja X',
  paramIznam: 'Obciążalność Iz',
  // Parametry normowe (V12K-070, M1) — zestaw zależny od rodzaju odcinka.
  paramPrzekroj: 'Przekrój żyły',
  paramMaterial: 'Materiał żyły',
  paramNorma: 'Norma',
  paramTempMax: 'Temperatura dopuszczalna',
  paramC: 'Pojemność C',
  paramB: 'Susceptancja B',
  paramIzolacja: 'Izolacja',
  paramIthPowrot: 'Ith żyły powrotnej (1 s)',
  paramSekcjaNormowa: 'Parametry normowe do obliczeń',

  // Podgląd (backend R1).
  podgladTytul: 'Podgląd doboru (backend)',
  podgladPrad: 'Prąd obliczeniowy',
  podgladPradZObciazalnosci:
    'Prąd roboczy nie podany — spadek policzony przy prądzie równym obciążalności typu (dana przyjęta).',
  podgladDeltaU: 'Spadek napięcia ΔU',
  podgladDeltaUpct: 'ΔU względne',
  podgladRtotal: 'R odcinka',
  podgladXtotal: 'X odcinka',
  podgladZrodlo: 'Źródło wyniku',
  podgladZrodloWartosc: 'Obliczenie ΔU po stronie serwera (solver spadku napięcia)',
  podgladBrak: 'Uzupełnij typ i długość, aby zobaczyć podgląd ΔU.',

  // Kontrola / gotowość.
  kontrolaTytul: 'Kontrola odcinka',
  wierszTyp: 'Typ z katalogu',
  wierszDlugosc: 'Długość',
  wierszDeltaU: 'Spadek ΔU',

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

  // Builder realnej sieci (M2, V12K-071).
  builderTytul: 'Magistrala w budowie',
  builderPusto: 'Dodaj pierwszy odcinek — kolejne dołączysz do jego końca, budując cały ciąg.',
  builderLicznik: (n: number) => (n === 1 ? '1 odcinek' : `${n} odcinków`),
  builderLaczna: 'Łączna długość',
  builderKoniec: 'Koniec ciągu (start kolejnego odcinka)',
  builderDodajKolejny: 'Wybierz „Kolejny odcinek", aby przedłużyć magistralę, albo postaw stację/ZK/odbiór na końcu.',
  builderZakoncz: 'Zakończ budowę',
  builderZakonczTitle: 'Zakończ budowę magistrali i wróć do schematu',
  builderDodaj: 'Dodaj odcinek',
  builderSkumulowany: 'Skumulowany spadek ΔU (z odcinkiem bieżącym)',

  // Ocena doboru przekroju (karta MAGISTRALA-OCENA): rekordy werdyktu z backendu —
  // interfejs nie zna progu, nie porównuje i nie sumuje; etykiety niesie rekord.
  ocenaTytul: 'Ocena doboru przekroju',
  ocenaKartyTytul: 'Ocena doboru przekroju — kryteria, wyniki, limity i podstawy (backend)',
  ocenaPusto: 'Ocena doboru pojawi się po odpowiedzi backendu (typ z katalogu, długość i prąd roboczy odcinka).',
  ocenaBlad: 'Nie udało się pobrać oceny doboru odcinka.',
  ocenaWskazowka: 'Pełne karty oceny (wynik, limit z podstawą, margines, zakres ważności): krok „Długość i podgląd".',
  ocenaIthPomoc:
    'Wytrzymałość cieplna zwarciowa ($I_{th} \\ge I_k \\cdot \\sqrt{t_k}$) — sprawdzana po biegu zwarciowym; katalog podaje Ith żyły powrotnej.',

  // Uczciwy stan zerowy: brak startu ciągu.
  brakStartuTytul: 'Brak miejsca startu ciągu',
  brakStartuStacja:
    'Wybrana stacja nie ma wolnego portu wyjściowego SN. Wskaż stację na końcu ciągu '
    + 'albo głowicę odpływową pola SN na schemacie.',
  brakStartuOgolny:
    'Zaznacz na schemacie głowicę pola liniowego SN albo wolny koniec istniejącego ciągu, '
    + 'z którego chcesz wyprowadzić magistralę.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz odcinek SN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem odcinka.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać odcinek.',
  // S9-5 (klasa: bramka enable bez sygnału gotowości) — katalog kabli/linii
  // ładuje się asynchronicznie z backendu; bez typu z katalogu zapis nie ma
  // z czego policzyć odcinka, więc zapis jest w tym oknie ŚWIADOMIE
  // zablokowany, a nie milczący.
  katalogLadowanieStopka: 'Ładowanie katalogu typów odcinków SN — zapis będzie dostępny po wczytaniu.',
  // S9-5: druga jawna przyczyna blokady zapisu — pole „Długość odcinka" bez
  // dodatniej wartości (klasa: zapis musi ODZWIERCIEDLAĆ to, co realnie
  // wpisano, nie być klikalny niezależnie od stanu pola).
  dlugoscWymaganaStopka: 'Podaj dodatnią długość odcinka, aby odblokować zapis.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: magistrala SN — odcinek linii/kabla i spadek napięcia',
  teoriaOpis:
    'Odcinek magistrali (linia napowietrzna lub kabel) ma rezystancję R i reaktancję X na jednostkę '
    + 'długości (z katalogu przewodu/kabla). Przy przepływie mocy P i Q powstaje spadek napięcia '
    + '$\\Delta U \\approx (R \\cdot P + X \\cdot Q)/U$ oraz straty mocy $\\propto I^2 \\cdot R$ rosnące z kwadratem prądu. Dłuższy odcinek i większe '
    + 'obciążenie → większy spadek napięcia na końcu magistrali. Przekrój przewodu dobiera się do '
    + 'obciążalności prądowej (nagrzewanie) i do dopuszczalnego spadku napięcia. Wszystkie wartości '
    + 'liczbowe (ΔU, straty, prądy) wyznacza solver — katalog wnosi tylko parametry jednostkowe.',
  teoriaOpisKabelLinia:
    'Kabel a linia napowietrzna różnią się parametrami normowymi do obliczeń: kabel ma większą '
    + 'pojemność doziemną C (prąd ładowania, model π), niższą reaktancję X, żyłę powrotną/ekran '
    + '(wytrzymałość cieplna Ith przy zwarciu doziemnym) oraz izolację wyznaczającą temperaturę '
    + 'dopuszczalną (XLPE 90°C / PVC 70°C). Linia napowietrzna ma susceptancję B (małą), wyższą '
    + 'reaktancję X, brak żyły powrotnej i wyższą obciążalność (chłodzenie powietrzem). Dlatego '
    + 'zestaw parametrów pokazany poniżej zależy od rodzaju odcinka.',
  teoriaWymog:
    'Przekrój musi wytrzymać prąd obciążenia długotrwale (Iz ≥ prąd roboczy) i prąd zwarciowy '
    + 'cieplnie ($I_{th} \\ge I_k \\cdot \\sqrt{t_k}$); spadek napięcia na całej magistrali powinien mieścić się w '
    + 'dopuszczalnym zakresie (typowo kilka %).',
  teoriaPodstawa: 'Podstawa: PN-EN 50160 (napięcie), N SEP-E-004 (linie i kable), IEC 60909 (zwarcia), IRiESD.',
  // Karta W3-J (2026-09-16): usunięto fabrykowaną krzywą poglądową (SVG liczący
  // „spadek 4% × (cosφ+sinφ)" bez podstawy fizycznej — R≈X to założenie
  // WYMYŚLONE dla ilustracji, nie parametr katalogowy odcinka). Kreator NIE ma
  // dostępu do wyniku rozpływu dla jeszcze niezapisanej magistrali, więc
  // pokazuje uczciwy stan zamiast liczyć cokolwiek w UI.
  spadekNiedostepnyTytul: 'Spadek napięcia policzy rozpływ mocy po zapisaniu magistrali.',
  spadekNiedostepnyOpis:
    'Rzeczywisty spadek napięcia (ΔU) na tym odcinku zależy od katalogowych parametrów R/X, '
    + 'długości i obciążenia — wyznacza go solver rozpływu mocy dla zapisanego modelu sieci, '
    + 'nie ten formularz. Zapisz magistralę, a następnie uruchom rozpływ, aby zobaczyć wynik.',
} as const;
