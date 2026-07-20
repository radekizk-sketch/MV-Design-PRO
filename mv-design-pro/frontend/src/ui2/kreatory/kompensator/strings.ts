/** Teksty PL kreatora „Dodaj baterię kondensatorów SN" (G-KOMP). Język inżynierski. */

export const KOMPENSATOR_STRINGS = {
  eyebrow: 'MODEL SIECI · KOMPENSACJA MOCY BIERNEJ',
  cel:
    'Dodaj baterię kondensatorów SN na wybraną szynę — stały kompensator mocy biernej. '
    + 'Moc i napięcie bierzesz z katalogu; susceptancję i prąd liczy backend. '
    + 'Bateria dostarcza moc bierną, podnosi współczynnik mocy i wspiera profil napięcia.',
  odznaka: 'Nowa bateria SN',

  krokTyp: 'Typ baterii i szyna',
  krokZapis: 'Podsumowanie i zapis',

  typKatalog: 'Typ baterii z katalogu',
  typKatalogPlaceholder: '— wybierz typ baterii —',
  typBlad: 'Nie udało się pobrać katalogu baterii kondensatorów SN.',
  typPomoc: 'Typ wnosi moc znamionową [Mvar] i napięcie [kV] — wartości z katalogu, nie z ręki.',

  nazwa: 'Nazwa baterii',
  nazwaPlaceholder: 'np. Bateria SN — pole 3',
  status: 'Stan łącznika',
  statusOpcje: [
    { id: 'closed', etykieta: 'Załączona' },
    { id: 'open', etykieta: 'Wyłączona' },
  ],

  // Parametry katalogu (odczyt).
  paramMvar: 'Moc znamionowa',
  paramKv: 'Napięcie znamionowe',
  paramStraty: 'Straty czynne',

  // Podgląd backendu.
  podgladTytul: 'Podgląd baterii (backend)',
  podgladB: 'Susceptancja B',
  podgladIc: 'Prąd znamionowy baterii',
  podgladZrodlo: 'Źródło wyniku',
  podgladZrodloWartosc: 'Obliczenie po stronie serwera z pierwszych zasad (solver podglądu baterii)',
  podgladBrak: 'Wybierz typ baterii, aby zobaczyć susceptancję i prąd.',
  podgladBlad: 'Nie udało się wyznaczyć podglądu baterii.',
  ostrzezenieNapiecie: 'Napięcie typu nie pasuje do napięcia szyny — dobierz typ dla właściwego napięcia.',

  // Downstream — „co to uruchamia".
  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozpływ mocy (PF) uwzględni baterię jako susceptancję +jB na szynie; analiza '
    + 'adekwatności mocy biernej i straty policzą jej wpływ, a raport ujmie kompensację.',

  // Kontrola / gotowość.
  kontrolaTytul: 'Kontrola baterii',
  wierszTyp: 'Typ z katalogu',
  wierszSzyna: 'Szyna SN',
  wierszMoc: 'Moc Q',
  wierszNapiecie: 'Napięcie',
  wierszStan: 'Stan',

  // Uczciwy stan zerowy.
  brakSzynyTytul: 'Brak wskazania szyny SN',
  brakSzynyOpis:
    'Zaznacz na schemacie szynę SN, do której chcesz dołączyć baterię kondensatorów, '
    + 'a następnie uruchom ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz baterię SN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem baterii.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać baterię.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: kompensacja mocy biernej baterią kondensatorów',
  teoriaOpis:
    'Bateria kondensatorów SN oddaje moc bierną pojemnościową Q = U²·2πf·C, podpierając napięcie '
    + 'i odciążając sieć oraz transformatory z przesyłu Q. Moc baterii silnie zależy od napięcia '
    + '(Q ∝ U²), dlatego katalog podaje Q przy napięciu znamionowym, a rzeczywistą wartość w punkcie '
    + 'pracy liczy solver dla napięcia z rozpływu. Bateria zmniejsza pobór Q z sieci nadrzędnej, '
    + 'poprawia współczynnik mocy i redukuje straty (mniejszy prąd w gałęziach). Zbyt duża '
    + 'kompensacja przy małym obciążeniu grozi jednak przepięciem i przekompensowaniem.',
  teoriaWymog:
    'Moc baterii dobiera się do deficytu mocy biernej i profilu obciążenia; przy bateriach '
    + 'stopniowanych/dławikach istotne są prądy załączania i rezonans z indukcyjnością sieci.',
  teoriaPodstawa:
    'Podstawa: PN-EN 60871 (baterie kondensatorów SN), IRiESD (współczynnik mocy tgφ).',
} as const;
