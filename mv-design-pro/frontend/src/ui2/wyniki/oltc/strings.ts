/** Teksty PL ekranu „Badania regulacji OLTC" (V12K-046, H2). Język inżynierski. */

export const OLTC_BADANIA_STRINGS = {
  tytul: 'Badania regulacji OLTC',
  cel:
    'Analizy przełącznika zaczepów pod obciążeniem na aktywnym przypadku: wrażliwość na '
    + 'pozycję, profil dobowy i dobór optymalny. Wszystkie wartości liczy backend (rozpływ).',

  rodzajBadania: 'Rodzaj badania',
  rodzaje: [
    { id: 'sweep', etykieta: 'Wrażliwość — przemiatanie pozycji' },
    { id: 'annual_profile', etykieta: 'Profil dobowy — szereg czasowy' },
    { id: 'optimize', etykieta: 'Optymalizacja — dobór pozycji' },
  ],

  celOptymalizacji: 'Cel optymalizacji',
  cele: [
    { id: 'minimize_losses', etykieta: 'Minimalizacja strat' },
    { id: 'maintain_voltage', etykieta: 'Utrzymanie napięcia' },
    { id: 'minimize_switching', etykieta: 'Minimalizacja przełączeń' },
  ],
  napiecieCel: 'Napięcie docelowe',

  opisSweep:
    'Rozpływ przy każdej stałej pozycji zaczepu (pełny zakres). Pokazuje napięcie sterowanej '
    + 'szyny i straty w funkcji pozycji.',
  opisProfil:
    'Pętla regulacji OLTC uruchamiana dla kolejnych kroków profilu obciążeń. Pokazuje pozycję '
    + 'i napięcie szyny w czasie oraz liczbę przełączeń.',
  opisOptim:
    'Dobór pozycji zaczepu jako zmiennej decyzyjnej (enumeracja pełnego zakresu). Wskazuje '
    + 'pozycję optymalną wg wybranego celu.',

  profilTytul: 'Kroki profilu obciążeń',
  profilKrok: 'Etykieta',
  profilSkala: 'Mnożnik obciążenia',
  profilDodaj: '+ Dodaj krok',
  profilUsun: 'Usuń',

  uruchom: 'Uruchom badanie',
  uruchamianie: 'Uruchamianie…',
  brakZakresu: 'Wybierz aktywny przypadek obliczeniowy przed uruchomieniem badania.',

  // Wyniki.
  sweepTytul: 'Wrażliwość na pozycję zaczepu',
  sweepOsX: 'Pozycja zaczepu',
  sweepNapiecie: 'U sterowanej szyny',
  sweepStraty: 'Straty czynne',
  sweepTabelaPozycja: 'Pozycja',
  sweepTabelaPrzekladnia: 'Przekładnia t',
  sweepTabelaU: 'U szyny',
  sweepTabelaStraty: 'Straty',
  sweepTabelaUmin: 'U min w sieci',
  sweepTabelaUmax: 'U max w sieci',

  profilWykresTytul: 'Profil dobowy pozycji i napięcia',
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

  optimTytul: 'Dobór optymalny pozycji',
  optimNajlepsza: 'Pozycja optymalna',
  optimStart: 'Pozycja startowa',
  optimPrzelaczenia: 'Wymagane przełączenia',
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
