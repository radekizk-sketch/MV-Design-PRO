/** Teksty PL kreatora „Dodaj generator synchroniczny SN" (add_generator_sn). Język inżynierski. */

export const GENERATOR_SN_STRINGS = {
  eyebrow: 'MODEL SIECI · GENERATOR SYNCHRONICZNY SN',
  cel:
    'Dołącz generator synchroniczny wprost do szyny SN — po co: blok wytwórczy (np. elektrociepłownia, '
    + 'agregat SN) bez przekształtnika; z czego: tabliczka znamionowa z katalogu albo podana ręcznie '
    + 'i moc czynna jako nastawa studium; co daje: węzeł generacji w rozpływie mocy (PQ albo PV '
    + 'z regulacją napięcia).',
  odznaka: 'Nowy generator SN',

  sekcjaTabliczkaTytul: 'Tabliczka znamionowa',
  trybTabliczki: 'Źródło tabliczki',
  trybKatalog: 'Typ z katalogu',
  trybReczna: 'Tabliczka podana ręcznie',
  trybRecznaInfo:
    'Tabliczka podana ręcznie trafia do modelu jako dane projektanta (tryb ekspercki), bez pozycji '
    + 'katalogu. Napięcie znamionowe pominięte przyjmie wartość napięcia szyny — jako założenie '
    + 'robocze, widoczne w danych przyjętych elementu i do zmiany w modelu.',
  typKatalog: 'Typ generatora',
  typKatalogPlaceholder: '— wybierz typ generatora —',
  typBlad: 'Nie udało się pobrać katalogu generatorów synchronicznych.',
  katalogPusty:
    'Katalog nie zawiera typów generatorów synchronicznych dostępnych dla projektu — podaj tabliczkę ręcznie.',
  ratedMva: 'Moc pozorna znamionowa $S_{n}$',
  ratedKv: 'Napięcie znamionowe $U_{n}$',
  ratedKvPomoc: 'Puste = napięcie szyny (założenie robocze zapisane przy elemencie).',
  tabliczkaQmin: 'Q min z tabliczki',
  tabliczkaQmax: 'Q max z tabliczki',
  tabliczkaQPomoc: 'Granice zdolności biernej maszyny (konwencja generatorowa). Puste = brak danej.',

  sekcjaPracaTytul: 'Nastawy studium',
  pMw: 'Moc czynna P',
  pMwPomoc: 'Nastawa studium — moc czynna oddawana przez generator w tym modelu.',
  trybPracy: 'Tryb pracy',
  trybPracyOpcje: [
    { id: 'stala_moc_bierna', etykieta: 'Stała moc bierna (węzeł PQ)' },
    { id: 'regulacja_napiecia', etykieta: 'Regulacja napięcia (węzeł PV)' },
  ],
  qMvar: 'Moc bierna Q',
  qMvarPomoc: 'Puste = brak nastawy mocy biernej (nie 0 Mvar).',
  uSet: 'Nastawa napięcia U',
  qMin: 'Q min (nastawa)',
  qMax: 'Q max (nastawa)',
  qGranicePomoc: 'Puste = granice z tabliczki znamionowej.',
  nazwa: 'Nazwa generatora',
  nazwaPlaceholder: 'np. Generator EC — blok 1',

  kontrolaTytul: 'Kontrola generatora',
  wierszSzyna: 'Szyna SN',
  wierszTabliczka: 'Tabliczka',
  wierszMoc: 'Moc czynna P',
  wierszTryb: 'Tryb pracy',
  tabliczkaZKatalogu: 'Z katalogu',
  tabliczkaReczna: 'Podana ręcznie',

  brakSzynyTytul: 'Brak wskazania szyny SN',
  brakSzynyOpis:
    'Wskaż na schemacie szynę sekcji SN (menu kontekstowe sekcji → „Dodaj generator synchroniczny").',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozpływ mocy ujmie generator jako węzeł PQ albo PV (regulacja napięcia w granicach Q); bilans '
    + 'mocy i raport ujmą jego generację.',

  zapisz: 'Zapisz generator',
  anuluj: 'Anuluj',
  walidacjaStopka: 'Uzupełnij wymagane pola przed zapisem.',
  katalogLadowanieStopka: 'Trwa wczytywanie katalogu generatorów…',
  brakZakresu: 'Brak aktywnego przypadku obliczeniowego.',
  bladDodania: 'Nie udało się dodać generatora synchronicznego.',
} as const;
