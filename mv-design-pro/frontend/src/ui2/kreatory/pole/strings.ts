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
} as const;
