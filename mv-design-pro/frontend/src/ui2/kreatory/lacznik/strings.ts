/** Teksty PL kreatora „Łącznik sekcyjny SN" (G-SEK). Język inżynierski. */

export const LACZNIK_STRINGS = {
  eyebrow: 'MODEL SIECI · ŁĄCZNIK SEKCYJNY SN',
  cel:
    'Wstaw łącznik na odcinku SN — dzieli ciąg na sekcje i pozwala go sekcjonować. '
    + 'Stan normalny (zamknięty/otwarty) wyznacza punkt normalnie otwarty (NOP); '
    + 'rozpływ mocy honoruje go realnie — otwarty łącznik daje pracę radialną.',
  odznaka: 'Nowy łącznik SN',

  krokAparat: 'Aparat i położenie',
  krokZapis: 'Podsumowanie i zapis',

  typKatalog: 'Aparat łącznika z katalogu',
  typKatalogPlaceholder: '— wybierz aparat SN —',
  typBlad: 'Nie udało się pobrać katalogu aparatów SN.',
  typPomoc: 'Aparat wnosi napięcie i prąd znamionowy oraz zdolność łączeniową — z katalogu.',

  nazwa: 'Nazwa łącznika',
  nazwaPlaceholder: 'np. Ł-sekc. magistrala A',
  rodzaj: 'Rodzaj aparatu',
  rodzajOpcje: [
    { id: 'ROZLACZNIK', etykieta: 'Rozłącznik' },
    { id: 'WYLACZNIK', etykieta: 'Wyłącznik' },
    { id: 'ODLACZNIK', etykieta: 'Odłącznik' },
  ],
  stan: 'Stan normalny',
  stanOpcje: [
    { id: 'closed', etykieta: 'Zamknięty' },
    { id: 'open', etykieta: 'Otwarty (NOP)' },
  ],
  polozenie: 'Położenie na odcinku',
  polozeniePomoc: 'Ułamek długości odcinka (0–1): 0,5 = w połowie. Dzieli odcinek na dwie sekcje.',

  paramNapiecie: 'Napięcie znamionowe',
  paramPrad: 'Prąd znamionowy',
  paramZwarcie: 'Zdolność wyłączania',

  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozpływ mocy uwzględni stan łącznika (otwarty = przerwa galwaniczna, praca radialna); '
    + 'sekcjonowanie wpływa na pewność zasilania i analizę pierścieni.',

  kontrolaTytul: 'Kontrola łącznika',
  wierszOdcinek: 'Odcinek',
  wierszAparat: 'Aparat',
  wierszStan: 'Stan normalny',
  wierszPolozenie: 'Położenie',

  brakOdcinkaTytul: 'Brak wskazania odcinka',
  brakOdcinkaOpis:
    'Zaznacz na schemacie odcinek SN, na którym chcesz wstawić łącznik sekcyjny, '
    + 'a następnie uruchom ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz łącznik SN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem łącznika.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać łącznik.',
} as const;
