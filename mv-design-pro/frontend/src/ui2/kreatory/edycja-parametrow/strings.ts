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
} as const;
