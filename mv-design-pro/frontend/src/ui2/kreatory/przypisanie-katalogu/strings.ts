/** Teksty PL kreatora „Przypisanie typu katalogowego" (assign_catalog_to_element). */

export const PRZYPISANIE_KATALOGU_STRINGS = {
  eyebrow: 'MODEL SIECI · PRZYPISANIE KATALOGU',
  tytul: 'Przypisanie typu katalogowego',
  cel:
    'Przypisz typ katalogowy do istniejącego elementu — wiąże go z niezmienną pozycją katalogu '
    + '(producent, parametry znamionowe). Katalog-first: parametry fizyczne pochodzą z typu, nie z ręcznego '
    + 'wpisu, co zapewnia spójność i powtarzalność obliczeń.',
  odznaka: 'Katalog → element',

  elementTytul: 'Element docelowy',
  element: 'Element',
  elementPomoc: 'Element modelu, do którego przypisujesz typ. Po przypisaniu backend materializuje '
    + 'parametry znamionowe z katalogu (np. R, X, In).',
  przestrzen: 'Przestrzeń katalogowa',
  przestrzenAuto: 'Wyznaczana automatycznie z typu elementu',

  katalogTytul: 'Pozycja katalogowa',
  identyfikator: 'Identyfikator pozycji katalogowej',
  identyfikatorPlaceholder: 'np. kabel_sn_3x120_al',
  identyfikatorPomoc: 'Identyfikator typu z biblioteki katalogu. Jeśli operacja została uruchomiona z '
    + 'bramki katalogowej, pole jest już wypełnione.',
  wersja: 'Wersja pozycji (opcjonalnie)',
  wersjaPlaceholder: 'np. 2024.1',

  kontrolaTytul: 'Kontrola przypisania',
  wierszElement: 'Element',
  wierszPrzestrzen: 'Przestrzeń',
  wierszPozycja: 'Pozycja katalogowa',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Backend materializuje parametry znamionowe z typu i oznacza element jako związany z katalogiem '
    + '(source_mode = KATALOG). Wyniki sieci wymagają ponownego przeliczenia.',

  brakElementuTytul: 'Brak wskazanego elementu',
  brakElementuOpis: 'Zaznacz na schemacie element, do którego chcesz przypisać typ katalogowy.',

  zapisz: 'Przypisz katalog',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed przypisaniem katalogu.',
  brakElementuWalid: 'Brak identyfikatora elementu docelowego.',
  brakIdentyfikatora: 'Podaj identyfikator pozycji katalogowej.',
  walidacjaStopka: 'Wskaż element i pozycję katalogową, aby przypisać typ.',
  bladDodania: 'Nie udało się przypisać katalogu.',

  // Panel teorii
  teoriaTytul: 'Teoria: zasada katalog-first (Catalog Binding Rule)',
  teoriaOpis:
    'W modelu sieci elementy fizyczne (kable, linie, transformatory, aparaty) NIE przechowują luźno '
    + 'wpisanych parametrów — wiążą się z niezmiennym typem z biblioteki katalogu. Katalog dostarcza '
    + 'komplet danych znamionowych (dla kabla: rezystancja $R$ i reaktancja $X$ na jednostkę długości, '
    + 'obciążalność $I_{dd}$, izolacja; dla transformatora: $S_n$, $u_k\\%$, straty $P_k,\\ P_0$). Przypisanie '
    + 'typu materializuje te wartości do elementu, dzięki czemu obliczenia (rozpływ, zwarcia) są '
    + 'powtarzalne i audytowalne: ta sama pozycja katalogowa zawsze daje te same parametry. To fundament '
    + 'determinizmu — bez wiązania katalogowego wynik zależałby od ręcznych, niekontrolowanych wpisów.',
  teoriaWymog:
    'Każdy element techniczny musi mieć przypięty typ katalogowy przed obliczeniami. Ręczna edycja '
    + 'parametrów katalogowych z pominięciem katalogu jest zakazana — parametry zmieniasz przez podmianę '
    + 'typu, nie przez nadpisanie pól.',
  teoriaPodstawa: 'Podstawa: reguła Catalog Binding (architektura modelu sieci), PN-EN dla typów urządzeń.',
} as const;
