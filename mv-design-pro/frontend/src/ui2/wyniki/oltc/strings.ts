/** Teksty PL ekranu „Badania regulacji OLTC" (V12K-046, H2). Język inżynierski. */

export const OLTC_BADANIA_STRINGS = {
  tytul: 'Regulacja napięcia zaczepami (OLTC)',
  cel:
    'Sprawdź, jak zaczepy transformatora wpływają na napięcie w sieci: jak napięcie zmienia się '
    + 'przy różnych pozycjach, jak regulacja radzi sobie w ciągu doby i którą pozycję najlepiej '
    + 'ustawić. Liczby wylicza program (rozpływ mocy) — tu tylko je oglądasz.',

  rodzajBadania: 'Co chcesz sprawdzić',
  rodzaje: [
    { id: 'sweep', etykieta: 'Jak pozycja zaczepu zmienia napięcie' },
    { id: 'annual_profile', etykieta: 'Jak regulacja pracuje w ciągu doby' },
    { id: 'optimize', etykieta: 'Która pozycja jest najlepsza' },
  ],

  celOptymalizacji: 'Do czego dążymy',
  cele: [
    { id: 'minimize_losses', etykieta: 'Najmniejsze straty' },
    { id: 'maintain_voltage', etykieta: 'Trzymaj zadane napięcie' },
    { id: 'minimize_switching', etykieta: 'Jak najmniej przełączeń' },
  ],
  napiecieCel: 'Napięcie, które chcemy utrzymać',

  opisSweep:
    'Program liczy sieć po kolei dla każdej pozycji zaczepu i pokazuje, jak zmienia się napięcie '
    + 'wybranej szyny oraz straty. Widać, w którą stronę i o ile ruszać zaczepem.',
  opisProfil:
    'Dla kolejnych pór doby (różne obciążenie) regulacja sama dobiera zaczep. Zobaczysz, jak '
    + 'zmienia się pozycja i napięcie szyny oraz ile razy zaczep się przełączył.',
  opisOptim:
    'Program sprawdza wszystkie pozycje zaczepu i wskazuje najlepszą dla wybranego celu — '
    + 'najmniejsze straty, trzymanie napięcia albo jak najmniej przełączeń.',

  profilTytul: 'Pory doby i obciążenie',
  profilKrok: 'Nazwa pory',
  profilSkala: 'Obciążenie (1 = pełne)',
  profilDodaj: '+ Dodaj krok',
  profilUsun: 'Usuń',

  uruchom: 'Uruchom badanie',
  uruchamianie: 'Uruchamianie…',
  brakZakresu: 'Wybierz aktywny przypadek obliczeniowy przed uruchomieniem badania.',

  // Wyniki.
  sweepTytul: 'Napięcie i straty przy różnych pozycjach',
  sweepOsX: 'Pozycja zaczepu',
  sweepNapiecie: 'U sterowanej szyny',
  sweepStraty: 'Straty czynne',
  sweepTabelaPozycja: 'Pozycja',
  sweepTabelaPrzekladnia: 'Przekładnia t',
  sweepTabelaU: 'U szyny',
  sweepTabelaStraty: 'Straty',
  sweepTabelaUmin: 'U min w sieci',
  sweepTabelaUmax: 'U max w sieci',

  profilWykresTytul: 'Pozycja zaczepu i napięcie w ciągu doby',
  profilOsX: 'Krok',
  profilPozycja: 'Pozycja zaczepu',
  profilNapiecie: 'U sterowanej szyny',
  profilPrzelaczenia: (n: number) => `Łączne przełączenia: ${n}`,
  profilPozaPasmem: (n: number) => `Kroki poza pasmem nieczułości: ${n}`,
  profilTabelaKrok: 'Krok',
  profilTabelaSkala: 'Obciążenie',
  profilTabelaPozycja: 'Pozycja',
  profilTabelaU: 'U szyny',
  profilTabelaPrzel: 'Przełączenia',
  profilTabelaPasmo: 'W paśmie',

  optimTytul: 'Najlepsza pozycja zaczepu',
  optimNajlepsza: 'Pozycja optymalna',
  optimStart: 'Pozycja startowa',
  optimPrzelaczenia: 'Wymagane przełączenia',

  // Kryterium dopuszczalności — o werdykcie decyduje wyłącznie to, które pozycje
  // uznano za dopuszczalne, więc kryterium stoi obok werdyktu razem ze źródłem.
  kryteriumTytul: 'Kryterium dopuszczalności pozycji',
  kryteriumZrodlo: 'Skąd kryterium',
  kryteriumNiedostepne: 'Nieustalone — badanie nie wskazuje pozycji ani liczby przełączeń',
  kryteriumPasmo: (celKv: string, polowaKv: string, pasmoKv: string) =>
    `Napięcie szyny nie odbiega od ${celKv} więcej niż o ${polowaKv} `
    + `(połowa pasma nieczułości regulatora ${pasmoKv})`,
  kryteriumOdchylka: (celKv: string) =>
    `Najmniejsza odchyłka napięcia szyny od ${celKv} (bez dodatkowego pasma)`,
  kryteriumZbieznosc: 'Pozycja, dla której rozpływ mocy ma rozwiązanie',
  zrodloPasmo: 'pasmo nieczułości przełącznika zaczepów z modelu + napięcie docelowe badania',
  zrodloOdchylka: 'napięcie docelowe podane w badaniu',
  zrodloZbieznosc: 'wynik rozpływu mocy',
  optimBrakPozycji: 'nie wskazano',
  optimTabelaPozycja: 'Pozycja',
  optimTabelaStraty: 'Straty',
  optimTabelaU: 'U szyny',
  optimTabelaOdchylka: 'Odchyłka U',
  optimTabelaKryterium: 'Wartość kryterium',
  optimTabelaDopuszczalna: 'Dopuszczalna',

  tak: 'tak',
  nie: 'nie',

  stanZerowy: 'Skonfiguruj i uruchom badanie, aby zobaczyć wyniki.',
  bladDomyslny: 'Nie udało się uruchomić badania OLTC.',
} as const;
