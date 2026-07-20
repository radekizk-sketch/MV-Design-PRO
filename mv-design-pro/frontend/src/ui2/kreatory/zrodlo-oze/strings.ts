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
  sekcjaRegulacja: 'Tryb regulacji mocy biernej i czynnej',
  regulacja: 'Tryb regulacji mocy biernej',
  regulacjaPomoc:
    'Po co: falownik OZE utrzymuje napięcie i współczynnik mocy w punkcie przyłączenia. '
    + 'Tryb wyznacza, jak źródło oddaje/pobiera moc bierną Q. Wybór realnie wpływa na wynik '
    + 'rozpływu mocy (kanoniczny model falownika). Stały cosφ — Q proporcjonalna do P wg '
    + 'zadanego cosφ; Q(U) (napięciowo-jałowa) — Q zależna od napięcia szyny (statyzm); '
    + 'P(U) — ograniczanie mocy czynnej od napięcia (nie modelowane w rozpływie ustalonym); '
    + '„Bez regulacji" — źródło pasywne (Q = 0).',
  cosPhiCel: 'Docelowy współczynnik mocy cosφ',
  cosPhiCelPomoc:
    'Wartość rządząca trybem stałego cosφ. cosφ < 1 → falownik oddaje/pobiera Q '
    + '(Q/|P| = tan(arccos cosφ)). Sugerowane: 0,95 (NC RfG typ B/C zwykle wymaga zdolności '
    + '±0,95, tj. ±0,3287·Pn). cosφ = 1 → brak Q (tryb pasywny).',
  quNachylenie: 'Nachylenie Q(U) (statyzm)',
  quNachyleniePomoc:
    'Wartość rządząca trybem Q(U) [pu Q na pu U]: o ile zmienia się Q na jednostkę zmiany '
    + 'napięcia względem pasma nieczułości. Sugerowane: 2–5 (typ. 4). 0 → tryb pasywny.',
  quPasmoDol: 'Pasmo Q(U) — napięcie dolne',
  quPasmoGora: 'Pasmo Q(U) — napięcie górne',
  quPasmoPomoc:
    'Napięciowe pasmo nieczułości charakterystyki Q(U) [pu U]: w zakresie dolne–górne źródło '
    + 'nie oddaje/pobiera Q (Q = 0), reakcja włącza się dopiero poza pasmem. Sugerowane: '
    + '0,95–1,05 pu (NC RfG). Puste = punkt 1,0/1,0 (reakcja natychmiastowa przy dowolnej odchyłce).',
  qMin: 'Q min (pobór, podwzbudzenie)',
  qMax: 'Q max (oddawanie, nadwzbudzenie)',
  qPomoc:
    'Zakres mocy biernej falownika [Mvar] — klamra dla trybu regulacji. Puste = zakres z '
    + 'tabliczki katalogowej. NC RfG (typ B/C): zdolność co najmniej ±0,3287·Pn (cosφ 0,95).',
  mocRobocza: 'Moc robocza P (nastawa)',
  mocRoboczaPomoc:
    'Zadana moc czynna [MW] w punkcie pracy studium. Puste = moc znamionowa agregatu '
    + '(liczba × Pmax). Dla magazynu: dodatnia = rozładowanie, ujemna = ładowanie.',
  statyzmPf: 'Statyzm P(f) / LFSM',
  statyzmPfPomoc:
    'Po co: ograniczanie mocy czynnej przy wzroście częstotliwości (LFSM-O), a dla magazynu '
    + 'także jej podnoszenie przy spadku (LFSM-U). Statyzm [%Pn na %f]: mniejsza wartość = '
    + 'ostrzejsza reakcja. Realnie zmienia moc czynną w rozpływie przy odchyłce częstotliwości '
    + 'studium (przy 50 Hz brak wpływu). Sugerowane: 5% (typ. 2–12% wg operatora). '
    + 'Puste = bez regulacji P(f).',
  pfDeadband: 'Pasmo nieczułości P(f)',
  pfDeadbandPomoc:
    'Zakres wokół 50 Hz bez reakcji [Hz]. Sugerowane: 0,2 Hz (LFSM-O aktywne od 50,2 Hz wg '
    + 'NC RfG). Aktywne tylko, gdy podano statyzm P(f).',
  regulacjaPasywnaOstrzezenie:
    'Wybrany tryb regulacji jest nieaktywny — uzupełnij wartość rządzącą (cosφ albo nachylenie '
    + 'Q(U)), inaczej źródło pracuje pasywnie (Q = 0) i wybór trybu nie wpływa na rozpływ.',
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
