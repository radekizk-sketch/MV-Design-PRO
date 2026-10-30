/** Teksty PL kreatorów edycji istniejącego odcinka kabla nN. Język inżynierski. */

export const ODCINEK_NN_EDYCJA_STRINGS = {
  ulozenieEyebrow: 'SCHEMAT nN · WARUNKI UŁOŻENIA KABLA',
  ulozenieCel:
    'Zmień warunki ułożenia istniejącego odcinka kabla nN — po co: obciążalność katalogowa dotyczy '
    + 'warunków odniesienia, a trasa ma własne; z czego: środowisko, izolacja, temperatura, liczba '
    + 'obwodów; co daje: $I\'_{z}$ odcinka liczone przez backend przy każdym odczycie modelu.',
  ulozenieOdznaka: 'Warunki ułożenia',
  ulozenieZapisz: 'Zapisz warunki ułożenia',
  ulozenieNiekompletne: 'Uzupełnij opis warunków trasy (dla gruntu także rezystywność cieplną).',

  podzialEyebrow: 'SCHEMAT nN · PODZIAŁ ODCINKA',
  podzialCel:
    'Podziel odcinek kabla nN nową szyną pośrednią — po co: punkt przyłączenia odbioru, aparatu '
    + 'albo odgałęzienia w środku trasy; z czego: odległość od początku odcinka; co daje: dwa '
    + 'odcinki tego samego typu o łącznej długości równej pierwotnej.',
  podzialOdznaka: 'Podział odcinka',
  podzialMiejsce: 'Odległość miejsca podziału od początku',
  podzialMiejscePomoc: 'Odcinki dziedziczą typ kabla, wiązanie katalogowe i warunki ułożenia.',
  podzialZapisz: 'Podziel odcinek',

  sekcjaOdcinekTytul: 'Odcinek',
  wierszNazwa: 'Odcinek',
  wierszDlugosc: 'Długość odcinka',
  brakOdcinkaTytul: 'Brak wskazania odcinka kabla nN',
  brakOdcinkaOpis:
    'Wskaż kabel na schemacie nN stacji (menu kontekstowe odcinka) — operacja dotyczy istniejącego odcinka kablowego.',

  anuluj: 'Anuluj',
  brakZakresu: 'Brak aktywnego przypadku obliczeniowego.',
  bladZapisu: 'Nie udało się zapisać zmiany odcinka nN.',
} as const;
