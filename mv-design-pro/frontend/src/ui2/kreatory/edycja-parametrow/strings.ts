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
  parametryPomoc: 'Podaj pary klucz → wartość. Wartości liczbowe, logiczne (true/false) i puste (null) '
    + 'są wykrywane automatycznie; pozostałe traktowane jako tekst.',
  klucz: 'Klucz',
  kluczPlaceholder: 'np. tap_position',
  wartosc: 'Wartość',
  wartoscPlaceholder: 'np. 2, true, null',
  wartoscZeSlownika: '— wybierz wartość ze słownika —',
  dodajWiersz: 'Dodaj parametr',
  usunWiersz: 'Usuń',
  powod: 'Uzasadnienie zmiany (opcjonalnie)',
  powodPlaceholder: 'np. korekta wg pomiaru terenowego',

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
    break_time_s: 'Czas własny wyłączania t_b [s]',
    i_th_ka: 'Prąd krótkotrwały wytrzymywany I_k [kA]',
    i_th_duration_s: 'Znamionowy czas trwania zwarcia t_k [s]',
    i_dyn_ka: 'Prąd szczytowy wytrzymywany I_p [kA]',
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
  bledneDaneModulu:
    'Dane modułu NC RfG zawierają błędy pól — popraw je przed zapisem (pola oznaczone niżej).',
} as const;
