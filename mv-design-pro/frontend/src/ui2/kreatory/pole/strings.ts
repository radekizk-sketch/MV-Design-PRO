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
} as const;
