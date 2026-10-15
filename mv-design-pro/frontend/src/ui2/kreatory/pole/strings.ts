/** Teksty PL kreatora „Dodaj pole SN" (G-POLE). Język inżynierski. */

export const POLE_STRINGS = {
  /** Nazwa karty pola bez nazwy handlowej i składu kanonicznego. */
  kartaPolaZapas: 'Karta pola z katalogu',
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

  rolaUziemnika: 'Rola uziemnika pola',
  rolaUziemnikaPomoc: 'Co uziemia uziemnik: pole, ekrany kabla, konstrukcję albo punkt neutralny (rola bez uziemnika w torze jest odrzucana).',
  aparat: 'Rodzaj aparatu',
  aparatPomoc: 'Wyłącznik łączy przy zwarciu (pola z 50/51/67); rozłącznik/odłącznik bez zwarcia.',

  rodzajPomiaru: 'Rodzaj pomiaru',
  rodzajPomiaruPomoc: 'Układ pomiarowy energii leży przy granicy stron, poza torem tranzytu magistrali; pomiar napięcia szyn — w każdej topologii.',
  wierszRodzajPomiaru: 'Rodzaj pomiaru',

  szablonTytul: 'Szablon pola producenta',
  szablonPomoc: 'Karta pola z katalogu rodziny — wnosi skład aparatury i zabezpieczenia pola.',
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
  nazwaPlaceholder: 'np. Pole liniowe wyjściowe L-12',

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
  brakZakresu: 'Wybierz aktywny przypadek obliczeniowy — zapis pola unieważnia jego wyniki.',
  bladZapisu: 'Nie udało się zapisać pola SN.',
  rolaPlaceholder: '— wybierz rolę pola —',
  aparatPlaceholder: '— wybierz rodzaj aparatu —',
  szablonOpcjonalny: 'Opcjonalny',
  szynaDoWskazania: 'Do wskazania na schemacie',
  konfliktNapiecia: (napiecie: string) =>
    `Napięcie znamionowe aparatu jest niższe od napięcia szyny (${napiecie}) — wybierz aparat na wyższe napięcie.`,

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
