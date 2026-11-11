/** Teksty PL kreatora „Edycja parametrów elementu" (update_element_parameters). */

export const EDYCJA_PARAMETROW_STRINGS = {
  eyebrow: 'MODEL SIECI · EDYCJA PARAMETRÓW',
  tytul: 'Edycja parametrów elementu',
  cel:
    'Zmień parametry istniejącego elementu modelu (ekspercki override). Operacja przyjmuje mapę '
    + 'parametrów i opcjonalne uzasadnienie zmiany. Parametry pochodzące z katalogu zmieniasz przez '
    + 'podmianę typu, NIE tutaj — Catalog Binding Rule.',
  odznaka: 'Override parametrów',

  elementTytul: 'Element docelowy',
  element: 'Element',
  zrodloParametrow: 'Źródło parametrów',
  elementPomoc: 'Element modelu, którego parametry edytujesz. Backend sprawdza dopuszczalność kluczy '
    + 'dla danego typu elementu (lista dozwolonych pól) i odrzuca niedozwolone.',

  parametryTytul: 'Parametry do ustawienia',
  parametryPomoc: 'Podaj pary parametr → wartość. Liczby, odpowiedzi „tak" / „nie" oraz „brak" '
    + '(brak wartości) są rozpoznawane automatycznie; pozostałe wpisy traktowane są jako tekst.',
  klucz: 'Klucz',
  kluczPlaceholder: 'np. tap_position',
  wartosc: 'Wartość',
  wartoscPlaceholder: 'np. 2, tak, brak',
  wartoscZeSlownika: '— wybierz wartość ze słownika —',
  dodajWiersz: 'Dodaj parametr',
  usunWiersz: 'Usuń',
  powod: 'Uzasadnienie wartości projektanta (opcjonalnie)',
  powodPlaceholder: 'np. karta producenta, tabliczka aparatu istniejącego',

  kontrolaTytul: 'Kontrola edycji',
  wierszElement: 'Element',
  wierszParametry: 'Parametry',
  wierszPowod: 'Uzasadnienie',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Backend nadpisuje wskazane pola elementu (o ile są dozwolone dla jego typu) i oznacza wyniki sieci '
    + 'jako nieaktualne. Zmiana wchodzi do audytu wraz z uzasadnieniem.',

  brakElementuTytul: 'Brak wskazanego elementu',
  brakElementuOpis: 'Zaznacz na schemacie element, którego parametry chcesz edytować.',

  zapisz: 'Zapisz parametry',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem parametrów.',
  brakElementuWalid: 'Brak identyfikatora elementu docelowego.',
  brakParametrow: 'Dodaj co najmniej jeden parametr z kluczem i wartością.',
  walidacjaStopka: 'Wskaż element i przynajmniej jeden parametr, aby zapisać.',
  bladDodania: 'Nie udało się zaktualizować parametrów.',

  // Panel teorii
  teoriaTytul: 'Teoria: override ekspercki a wiązanie katalogowe',
  teoriaOpis:
    'Model sieci rozróżnia dwa źródła parametrów: wartości z katalogu (materializowane z niezmiennego '
    + 'typu, tryb KATALOG) oraz override ekspercki (ręczna korekta pól, tryb EKSPERCKI_RĘCZNY). Ta '
    + 'operacja służy do korekt eksperckich pól dopuszczonych dla danego typu elementu — backend prowadzi '
    + 'listę dozwolonych kluczy i odrzuca próbę zmiany pola spoza niej. Parametrów wynikających z katalogu '
    + '(np. $R,\\ X$ kabla, $u_k\\%$ transformatora) NIE nadpisuje się tutaj — zmienia się je przez podmianę '
    + 'typu katalogowego, aby zachować determinizm i audytowalność. Uzasadnienie zmiany trafia do śladu '
    + 'audytowego.',
  teoriaWymog:
    'Używaj override tylko tam, gdzie katalog nie dostarcza wartości albo istnieje udokumentowana '
    + 'przesłanka pomiarowa. Każda korekta powinna nieść uzasadnienie; parametry katalogowe zostają '
    + 'pod kontrolą katalogu.',
  teoriaPodstawa: 'Podstawa: reguła Catalog Binding + ślad audytowy zmian modelu (architektura ENM).',
  daneModuluTytul: 'Dane modułu NC RfG źródła',
  daneModuluPomoc:
    'Zapisywane są wyłącznie pola zmienione względem modelu — ten sam walidator co przy '
    + 'tworzeniu źródła; brak danej pozostaje brakiem, nigdy wartością typową.',
  // Wartości projektanta aparatu SN (zasada nr 4, V12K-351) — nośnik `overrides` gałęzi.
  aparatTytul: 'Parametry aparatu SN nadane przez projektanta',
  aparatPomoc:
    'Karta katalogowa aparatu nie zawsze podaje czas własny wyłączania i znamiona wytrzymałości — '
    + 'obliczenie przyjmuje wtedy wartość roboczą z jawnym źródłem (profil urządzenia, norma albo '
    + 'założenie inżynierskie). Wpisz wartość z tabliczki, karty producenta albo pomiaru, aby '
    + 'obliczenie użyło jej zamiast karty i propozycji. Puste pole: bez wartości projektanta. Wartość '
    + 'projektanta pozostaje daną przyjętą (ocena obliczeniowa, nie potwierdzony dowód) — '
    + 'uzasadnienie zapisz w polu „Uzasadnienie zmiany”.',
  aparatEtykiety: {
    break_time_s: 'Czas własny wyłączania $t_b$ [s]',
    i_th_ka: 'Prąd krótkotrwały wytrzymywany $I_k$ [kA]',
    i_th_duration_s: 'Znamionowy czas trwania zwarcia $t_k$ [s]',
    i_dyn_ka: 'Prąd szczytowy wytrzymywany $I_p$ [kA]',
  },
  aparatJednostki: {
    break_time_s: 's',
    i_th_ka: 'kA',
    i_th_duration_s: 's',
    i_dyn_ka: 'kA',
  },
  aparatPlaceholder: 'puste — bez wartości projektanta',
  aparatZKarty: 'Puste pole: dana karty katalogowej',
  aparatPropozycja: 'Puste pole: wartość robocza dla danych karty',
  aparatBrak: 'Puste pole: brak danej karty i brak propozycji — parametr nie dotyczy albo nie ma podstawy',
  aparatRodzajZrodla: {
    PROFIL_URZADZENIA: 'profil typowy urządzenia',
    NORMA: 'norma',
    ZALOZENIE_INZYNIERSKIE: 'założenie inżynierskie',
  } as Readonly<Record<string, string>>,
  aparatBladLiczby: 'Wartość musi być liczbą (separator dziesiętny: przecinek albo kropka).',
  wierszAparat: 'Wartości projektanta aparatu',
  bledneWartosciAparatu: 'Wartość parametru aparatu nie jest liczbą — popraw pole oznaczone niżej.',
  // Karta PODSTAWA-Q: wartości projektanta parametrów zwarciowych maszyny wirującej —
  // nośnik `overrides` generatora; nazwy, jednostki i propozycje z rejestru backendu.
  maszynaTytul: 'Parametry zwarciowe maszyny wirującej nadane przez projektanta',
  maszynaPomoc:
    'Tabliczka maszyny nie zawsze podaje moc znamionową, reaktancję podprzejściową, współczynnik mocy, '
    + 'liczbę par biegunów, krotność prądu zablokowanego wirnika i sprawność — obliczenie zwarciowe '
    + '(IEC 60909-0) przyjmuje wtedy wartość roboczą rejestru (założenie inżynierskie; moc znamionowa '
    + '— z punktu pracy elementu) i oznacza wyniki jako oparte na danej przyjętej. Wpisz wartość '
    + 'z tabliczki albo karty producenta, aby obliczenie użyło jej zamiast tabliczki elementu '
    + 'i propozycji. Puste pole: bez wartości projektanta.',
  maszynaPlaceholder: 'puste — bez wartości projektanta',
  maszynaZTabliczki: 'Puste pole: dana tabliczki elementu',
  maszynaWyznaczenie: 'Puste pole: dana tabliczki elementu,',
  maszynaPropozycja: 'Puste pole: wartość robocza',
  maszynaRejestrNiedostepny:
    'Opis parametrów maszyny jest chwilowo niedostępny — odśwież widok, aby nadać wartości.',
  maszynaBladLiczby: 'Wartość musi być liczbą (separator dziesiętny: przecinek albo kropka).',
  wierszMaszyna: 'Wartości projektanta maszyny',
  bledneWartosciMaszyny:
    'Wartość parametru maszyny nie jest liczbą — popraw pole oznaczone niżej.',
  bledneDaneModulu:
    'Dane modułu NC RfG zawierają błędy pól — popraw je przed zapisem (pola oznaczone niżej).',
  // Linia napowietrzna 110 kV: przewód z katalogu i geometria słupa (dana projektu).
  liniaWnTytul: 'Linia napowietrzna 110 kV — przewód i geometria słupa',
  liniaWnPomoc:
    'Rezystancja, reaktancja i susceptancja linii 110 kV (składowa zgodna i zerowa) wynikają '
    + 'z przewodu z katalogu (PN-EN 50182) i geometrii słupa — oblicza je backend z jawnym '
    + 'śladem wzorów. Puste pole geometrii: obliczenie biegnie z wartością roboczą (jakość '
    + 'ESTIMATED, kompletność dowodu niepełna) — podaj dane z projektu słupa, aby ją zastąpić. '
    + 'Parametry zmierzone albo podane przez OSD wprowadza się trybem parametrów ręcznych.',
  liniaWnPrzewod: 'Przewód fazowy (katalog przewodów linii 110 kV)',
  liniaWnPrzewodPomoc:
    'Wybór przewodu przypisuje typ z katalogu do linii; parametry linii przelicza backend.',
  liniaWnPrzewodWybierz: '— wybierz przewód fazowy —',
  liniaWnFazyPomoc:
    'Położenia przewodów fazowych w przekroju linii: x — odległość od osi słupa, y — średnia '
    + 'wysokość przewodu nad ziemią w przęśle (wysokość zawieszenia pomniejszona o 2/3 zwisu). '
    + 'Podaj wszystkie trzy fazy albo żadnej.',
  liniaWnFaza: 'Faza',
  liniaWnPlaceholder: 'puste — wartość robocza',
  liniaWnPustePole: 'Puste pole: wartość robocza —',
  liniaWnWiazka: 'Liczba przewodów w wiązce fazy',
  liniaWnWiazkaPlaceholder: 'puste — przewód pojedynczy (1)',
  liniaWnOdstep: 'Odstęp przewodów w wiązce [m]',
  liniaWnOdstepPlaceholder: 'wymagany przy wiązce',
  liniaWnTrybOdgromowych: 'Przewody odgromowe',
  liniaWnTrybyOdgromowych: {
    robocze: 'Nie podano — wartość robocza',
    brak: 'Linia bez przewodu odgromowego',
    podane: 'Położenia z projektu słupa',
  } as Readonly<Record<'robocze' | 'brak' | 'podane', string>>,
  liniaWnOdgromowy: 'Przewód odgromowy',
  liniaWnTypOdgromowego: 'Typ przewodu odgromowego (katalog)',
  liniaWnOdgromowyRoboczy: '— nie podano: wartość robocza —',
  liniaWnRezystywnosc: 'Rezystywność gruntu ρ [Ω·m]',
  liniaWnPodglad: 'Podgląd parametrów linii',
  liniaWnKompletnoscPelna:
    'Kompletność dowodu: pełna — wszystkie dane linii pochodzą z projektu i katalogu.',
  liniaWnKompletnoscNiepelna:
    'Kompletność dowodu: niepełna — część danych linii to wartości robocze (jakość ESTIMATED).',
  liniaWnSkladowaProjektu: 'dana projektu',
  liniaWnSkladowaRobocza: 'wartość robocza',
  liniaWnBladFaz:
    'Podaj obie współrzędne (liczby) dla wszystkich trzech faz albo zostaw wszystkie puste.',
  liniaWnBladWiazki: 'Liczba przewodów w wiązce musi być liczbą całkowitą nie mniejszą niż 1.',
  liniaWnBladOdgromowych:
    'Podaj obie współrzędne (liczby) co najmniej jednego przewodu odgromowego.',
  liniaWnBladLiczby: 'Wartość musi być liczbą (separator dziesiętny: przecinek albo kropka).',
  bledneDaneLiniiWn: 'Dane linii 110 kV zawierają błąd pola — popraw pole oznaczone niżej.',
  wierszLiniaWn: 'Dane linii 110 kV',
  liniaWnBezZmian: 'Bez zmian',
  liniaWnDoZapisu: 'Zmienione',
} as const;
