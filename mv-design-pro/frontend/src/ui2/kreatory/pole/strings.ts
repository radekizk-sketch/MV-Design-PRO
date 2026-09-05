/** Teksty PL kreatora „Dodaj pole SN" (G-POLE). Język inżynierski. */

export const POLE_STRINGS = {
  eyebrow: 'MODEL SIECI · POLE ROZDZIELNI SN',
  cel:
    'Dodaj pole rozdzielni SN — miejsce przyłączenia (linia, transformator, sprzęgło, '
    + 'pomiar, źródło OZE) wraz z aparatem łączeniowym. Rola pola wyznacza wymagane '
    + 'zabezpieczenia i dalszą pracę; aparat wnosi zdolność łączeniową z katalogu.',
  odznaka: 'Nowe pole SN',

  krokPole: 'Rola i aparat',
  krokZapis: 'Podsumowanie i zapis',

  // Opcje roli/aparatu (kody backendu + polskie etykiety) mieszkają w polaSnModel.ts
  // (warstwa kontraktu danych) — tu tylko etykiety pól i pomoc, bez surowych kodów.
  rola: 'Rola pola',
  rolaPomoc: 'Rola pola wyznacza wymagane zabezpieczenia (np. 50/51/67, 87T, 27/59/81 dla OZE).',

  aparat: 'Rodzaj aparatu',
  aparatPomoc: 'Wyłącznik łączy przy zwarciu (pola z 50/51/67); rozłącznik/odłącznik bez zwarcia.',

  rodzajPomiaru: 'Rodzaj pomiaru',
  rodzajPomiaruPomoc:
    'Układ pomiarowy energii (rozliczeniowy podstawowy, rezerwowy, równoważny lub '
    + 'pomiarowo-kontrolny — wg standardu układów pomiarowych i IRiESD) mierzy energię przy '
    + 'granicy stron i nie może leżeć w torze tranzytu magistrali. Pomiar napięcia szyn '
    + '(przekładniki napięciowe sekcji rozdzielni) nie jest układem pomiarowym energii — '
    + 'jest wolny w każdej topologii.',
  wierszRodzajPomiaru: 'Rodzaj pomiaru',

  szablonTytul: 'Szablon pola producenta',
  szablonPomoc:
    'Powiąż pole z gotowym szablonem producenta (rodzina rozdzielnicy → szablon pola). '
    + 'Szablon wnosi zabezpieczenia i konfigurację zgodnie z kartą producenta — spójnie ze '
    + 'schematem i koordynacją. Zalecane; przy braku szablonu skonfiguruj aparat ekspercko.',
  rodzina: 'Rodzina rozdzielnicy',
  rodzinaPlaceholder: '— wybierz rodzinę producenta —',
  szablon: 'Szablon pola',
  szablonPlaceholder: '— wybierz szablon pola —',
  szablonBrak: 'Brak szablonu dla tej rodziny i roli — skonfiguruj aparat ekspercko poniżej.',
  aparatSekcja: 'Aparat główny (konfiguracja ekspercka)',
  wierszSzablon: 'Szablon',

  typKatalog: 'Aparat pola z katalogu',
  typKatalogPlaceholder: '— wybierz aparat SN —',
  typBlad: 'Nie udało się pobrać katalogu aparatów SN.',
  typPomoc: 'Aparat wnosi napięcie i prąd znamionowy oraz zdolność łączeniową — z katalogu.',

  nazwa: 'Nazwa pola',
  nazwaPlaceholder: 'np. Pole odpływowe L-12',

  paramNapiecie: 'Napięcie znamionowe',
  paramPrad: 'Prąd znamionowy',
  paramZwarcie: 'Zdolność wyłączania',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Pole wchodzi do topologii rozdzielni i schematu (SLD); rola pola wyznacza '
    + 'wymagane zabezpieczenia polowe i konfigurację przekładników.',

  kontrolaTytul: 'Kontrola pola',
  wierszSzyna: 'Szyna / stacja',
  wierszRola: 'Rola',
  wierszAparat: 'Aparat',

  brakSzynyTytul: 'Brak wskazania szyny SN',
  brakSzynyOpis:
    'Zaznacz na schemacie szynę SN rozdzielni, w której chcesz dodać pole, '
    + 'a następnie uruchom ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz pole SN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem pola.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać pole SN.',
  // S9-5 (klasa: bramka enable bez sygnału gotowości, `karta_e2e_s95.md`) —
  // katalog aparatów pola / rodzin rozdzielnic ładuje się asynchronicznie;
  // zapis bez niego byłby cichym no-op na pustym `catalog_ref`, więc blokujemy JAWNIE.
  katalogLadowanieStopka: 'Ładowanie katalogu aparatów pola SN — zapis będzie dostępny po wczytaniu.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: pole rozdzielnicy SN i skład aparatury',
  teoriaOpis:
    'Pole (cela) rozdzielnicy SN to zestandaryzowana jednostka funkcjonalna: pole liniowe (odpływ), '
    + 'zasilające (dopływ), transformatorowe, pomiarowe czy sprzęgło. Rola pola wyznacza wymagany '
    + 'skład aparatury (wyłącznik / rozłącznik, przekładniki prądowe i napięciowe, uziemnik) oraz '
    + 'komplet zabezpieczeń polowych. Wybór rodziny rozdzielnicy producenta i szablonu pola wiąże '
    + 'dane referencyjne (Reference Engine): sekwencję aparatów wg IEC 62271 i kody zabezpieczeń wg '
    + 'roli — skąd spływają do schematu SLD, oceny zgodności i koordynacji zabezpieczeń.',
  teoriaWymog:
    'Skład pola i zabezpieczenia muszą odpowiadać roli oraz normie IEC 62271; przekładniki dobiera '
    + 'się do prądu i klasy dokładności wymaganej przez zabezpieczenia i pomiary.',
  teoriaPodstawa: 'Podstawa: PN-EN 62271-200 (rozdzielnice SN), wzorce producentów, IRiESD.',

  /**
   * Rodzina o torze BLOK_RMU dostarczana jest blokami fabrycznymi o stałej
   * sekwencji jednostek. Dokładanie pojedynczego pola do takiej rodziny opisuje
   * wyrób inaczej, niż robi go producent — mówimy to wprost, ale NIE blokujemy:
   * o przyjęciu konfiguracji rozstrzyga walidator backendu, nie UI.
   */
  rodzinaBlokowaOpis:
    'Ta rodzina jest dostarczana jako blok fabryczny o stałej sekwencji jednostek (rozdzielnica '
    + 'pierścieniowa nie jest zbiorem luźnych szaf). Pojedyncze pole dokładane tutaj nie opisuje '
    + 'takiego bloku — całą rozdzielnicę RMU składa się w kreatorze stacji, wyborem bloku.',
} as const;
