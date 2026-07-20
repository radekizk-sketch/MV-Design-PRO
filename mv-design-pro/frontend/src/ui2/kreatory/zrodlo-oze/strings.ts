/** Teksty PL kreatora „Dodaj źródło OZE/DER" (G-OZE-UI). Język inżynierski. */

export const OZE_STRINGS = {
  eyebrow: 'MODEL SIECI · ŹRÓDŁO OZE/DER',
  cel:
    'Dodaj źródło przekształtnikowe (PV / magazyn energii / elektrownia wiatrowa) — '
    + 'z falownikiem z katalogu, trybem regulacji mocy biernej i przyłączeniem do rozdzielni. '
    + 'Tryb regulacji (Q(U)/cosφ) realnie wpływa na rozpływ mocy; tabliczka wnosi wkład '
    + 'zwarciowy i dane do oceny zgodności NC RfG.',
  odznaka: 'Nowe źródło OZE',

  krokTechnologia: 'Technologia i przyłączenie',
  krokKatalog: 'Falownik i moc',
  krokRegulacja: 'Regulacja mocy biernej',
  krokZapis: 'Podsumowanie i zapis',

  // Krok 1
  sekcjaTechnologia: 'Technologia źródła',
  technologia: 'Technologia',
  technologiaPomoc: 'PV/BESS/FW wyznacza katalog falowników, model zwarciowy i wymagania NC RfG.',
  wariant: 'Sposób przyłączenia',
  wariantPomoc:
    'Bezpośrednio do szyny nN (falownik nN) albo przez transformator blokowy SN/nN '
    + '(gdy napięcie falownika ≠ napięcie rozdzielni).',
  transformator: 'Transformator blokowy',
  transformatorPlaceholder: '— wybierz transformator SN/nN —',
  transformatorBrak: 'Brak transformatora blokowego w stacji — dodaj transformator albo wybierz przyłączenie do szyny nN.',
  umiejscowienie: 'Umiejscowienie pola',
  umiejscowienieNowe: 'Nowe pole źródłowe',
  umiejscowienieIstniejace: 'Istniejące pole odpływowe',
  nazwaNowegoPola: 'Nazwa nowego pola',
  aparatNowegoPola: 'Aparat nowego pola nN',
  aparatPlaceholder: '— wybierz aparat nN —',
  nazwa: 'Nazwa źródła',
  nazwaPlaceholder: 'np. Farma PV Wschód',

  // Krok 2
  sekcjaKatalog: 'Falownik z katalogu',
  katalog: 'Układ PV/BESS/FW',
  katalogPlaceholder: '— wybierz układ z katalogu —',
  katalogBlad: 'Nie udało się pobrać katalogu układów PV/BESS/FW.',
  katalogPomoc: 'Tabliczka wnosi napięcie, moc znamionową i zdolność Q — z katalogu (ZERO fizyki w UI).',
  liczba: 'Liczba jednostek',
  liczbaPomoc: 'Moc zagregowana = liczba × Pmax jednostki; agregacja po stronie backendu.',
  paramNapiecie: 'Napięcie znamionowe',
  paramMoc: 'Moc znamionowa S',
  paramPmax: 'Moc czynna Pmax (agregat)',
  ptpireeTytul: 'Certyfikat PTPiREE',
  ptpireeBrak: 'Falownik bez powiązanego certyfikatu PTPiREE — ocena zgodności NC RfG wymaga uzupełnienia.',

  // Krok 3
  sekcjaRegulacja: 'Tryb regulacji mocy biernej',
  regulacja: 'Tryb regulacji',
  regulacjaPomoc:
    'Q(U) i cosφ realnie wpływają na rozpływ mocy (kanoniczny PF falownika). '
    + '„Bez regulacji" = źródło pasywne (Q = 0).',
  qMin: 'Q min',
  qMax: 'Q max',
  qPomoc: 'Zakres mocy biernej falownika [Mvar]; puste = zakres z tabliczki katalogowej.',
  mocRobocza: 'Moc robocza P',
  mocRoboczaPomoc: 'Zadana moc czynna [MW]; puste = moc znamionowa agregatu.',
  statyzmPf: 'Statyzm P(f) / LFSM',
  statyzmPfPomoc:
    'Statyzm regulacji mocy czynnej od częstotliwości [%Pn na %f]. Realnie zmienia moc '
    + 'czynną w rozpływie przy odchyłce częstotliwości studium (przy 50 Hz brak wpływu). '
    + 'Puste = bez regulacji P(f).',
  sekcjaBess: 'Praca magazynu (BESS)',
  bessTryb: 'Tryb pracy magazynu',
  socMin: 'SOC min',
  socMax: 'SOC max',
  socPomoc: 'Stan naładowania — zakres pracy magazynu [%].',

  // Downstream
  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Źródło wchodzi do topologii i schematu (SLD); tryb regulacji zasila rozpływ mocy '
    + 'falownika (Q(U)/cosφ), tabliczka — wkład zwarciowy maszynowy, ocenę siły sieci '
    + '(grid strength), adekwatność mocy biernej i badania zgodności NC RfG/PTPiREE.',

  // Gotowość
  kontrolaTytul: 'Kontrola źródła',
  wierszStacja: 'Rozdzielnia',
  wierszTechnologia: 'Technologia',
  wierszPrzylaczenie: 'Przyłączenie',
  wierszFalownik: 'Falownik',
  wierszRegulacja: 'Regulacja',

  brakStacjiTytul: 'Brak wskazania rozdzielni',
  brakStacjiOpis:
    'Zaznacz na schemacie rozdzielnię (szynę nN), do której chcesz przyłączyć źródło OZE, '
    + 'a następnie uruchom ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz źródło OZE',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem źródła.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać źródło OZE.',
} as const;
