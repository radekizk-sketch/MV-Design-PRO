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
    + '„Bez regulacji" — źródło pasywne ($Q = 0$).',
  cosPhiCel: 'Docelowy współczynnik mocy cosφ',
  cosPhiCelPomoc:
    'Wartość rządząca trybem stałego cosφ. $\\cos\\varphi < 1$ → falownik oddaje/pobiera Q '
    + '($Q/|P| = \\tan(\\arccos\\cos\\varphi)$). Sugerowane: 0,95 (NC RfG typ B/C zwykle wymaga zdolności '
    + '±0,95, tj. $\\pm 0{,}3287 \\cdot P_n$). $\\cos\\varphi = 1$ → brak Q (tryb pasywny).',
  quNachylenie: 'Nachylenie Q(U) (statyzm)',
  quNachyleniePomoc:
    'Wartość rządząca trybem Q(U) [pu Q na pu U]: o ile zmienia się Q na jednostkę zmiany '
    + 'napięcia względem pasma nieczułości. Sugerowane: 2–5 (typ. 4). 0 → tryb pasywny.',
  quPasmoDol: 'Pasmo Q(U) — napięcie dolne',
  quPasmoGora: 'Pasmo Q(U) — napięcie górne',
  quPasmoPomoc:
    'Napięciowe pasmo nieczułości charakterystyki Q(U) [pu U]: w zakresie dolne–górne źródło '
    + 'nie oddaje/pobiera Q ($Q = 0$), reakcja włącza się dopiero poza pasmem. Sugerowane: '
    + '0,95–1,05 pu (NC RfG). Puste = punkt 1,0/1,0 (reakcja natychmiastowa przy dowolnej odchyłce).',
  qMin: 'Q min (pobór, podwzbudzenie)',
  qMax: 'Q max (oddawanie, nadwzbudzenie)',
  qPomoc:
    'Zakres mocy biernej falownika [Mvar] — klamra dla trybu regulacji. Puste = zakres z '
    + 'tabliczki katalogowej. NC RfG (typ B/C): zdolność co najmniej $\\pm 0{,}3287 \\cdot P_n$ (cosφ 0,95).',
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
  frtTytul: 'Przejście przez zakłócenie (FRT)',
  frtOpis:
    'Deklaracja zdolności jednostki do przetrwania zaniku napięcia (LVRT) i przepięcia (HVRT) '
    + 'wg charakterystyk NC RfG. Zasila ocenę zgodności NC RfG (margines badań FRT). '
    + 'Deklaracja projektanta — nie wynika z karty katalogowej.',
  frtLvrt: 'Charakterystyka LVRT (zanik napięcia)',
  frtHvrt: 'Charakterystyka HVRT (przepięcie)',
  frtOpcje: [
    { id: 'nie', etykieta: 'Nie / brak danych' },
    { id: 'tak', etykieta: 'Tak — zaprogramowana' },
  ],
  regulacjaPasywnaOstrzezenie:
    'Wybrany tryb regulacji jest nieaktywny — uzupełnij wartość rządzącą (cosφ albo nachylenie '
    + 'Q(U)), inaczej źródło pracuje pasywnie ($Q = 0$) i wybór trybu nie wpływa na rozpływ.',
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

  // Panele teorii kroków 1–2 (V12K-066: standard „must-have")
  teoriaTechTytul: 'Teoria: technologia i sposób przyłączenia',
  teoriaTechOpis:
    'Technologia (PV / magazyn / elektrownia wiatrowa) wyznacza katalog falowników, model '
    + 'zwarciowy (źródło przekształtnikowe ma ograniczony, sterowany prąd zwarciowy — inny niż '
    + 'maszyna synchroniczna) oraz wymagania przyłączeniowe NC RfG/PTPiREE. Sposób przyłączenia: '
    + 'bezpośrednio do szyny nN (falownik nN, brak transformatora blokowego) albo przez '
    + 'transformator blokowy SN/nN, gdy napięcie falownika różni się od napięcia rozdzielni — '
    + 'transformator wnosi wtedy własną impedancję i grupę połączeń do modelu.',
  teoriaTechWymog:
    'Dobór pola i aparatu nN musi odpowiadać prądowi znamionowemu i zwarciowemu źródła; '
    + 'przyłączenie przez transformator blokowy wymaga zgodności napięć uzwojeń z szyną.',
  teoriaTechPodstawa:
    'Podstawa: NC RfG (typ modułu wg mocy i napięcia), IRiESD OSD, PN-EN 62271 (aparatura).',
  teoriaKatalogTytul: 'Teoria: falownik z katalogu i moc zagregowana',
  teoriaKatalogOpis:
    'Falownik dobierany jest z katalogu (zasada „catalog-first"): tabliczka wnosi napięcie '
    + 'znamionowe, moc pozorną S, zakres mocy biernej Q i certyfikat PTPiREE — bez ręcznego '
    + 'wpisywania parametrów fizycznych w UI (zero fizyki w UI). Moc zagregowana źródła = liczba '
    + 'jednostek × Pmax jednostki; agregację i wszystkie wyniki liczy backend. Certyfikat PTPiREE '
    + '(WOŚ — Warunki Ogólne Świadczenia) potwierdza zgodność falownika z wymaganiami NC RfG i jest '
    + 'niezbędny do oceny zgodności w punkcie przyłączenia.',
  teoriaKatalogWymog:
    'Do oceny zgodności NC RfG falownik musi mieć powiązany certyfikat PTPiREE (WOŚ). '
    + 'Brak certyfikatu = niekompletne dane do badań przyłączeniowych.',
  teoriaKatalogPodstawa:
    'Podstawa: NC RfG (2016/631), procedura PTPiREE WOŚ, karty katalogowe producentów falowników.',

  // Krok DOBÓR toru SN (D2 — RECENZJA_DER_SN_DOBORY_2026-07)
  krokDobor: 'Dobór toru SN',
  sekcjaDobor: 'Dobór transformatora, kabla i aparatu pola',
  doborPomoc:
    'System proponuje z REALNYCH katalogów najmniejszy transformator blokowy, przekrój kabla SN '
    + 'i aparat głównego pola SN dla podanych falowników. Propozycję możesz zastosować jednym '
    + 'kliknięciem albo wybrać własne elementy — wynik liczbowy zawsze z backendu (zero fizyki w UI).',
  doborDlugoscKabla: 'Długość kabla SN',
  doborDlugoscKablaPomoc: 'Długość odcinka przyłączeniowego SN [km] — potrzebna do sprawdzenia spadku napięcia ΔU.',
  doborRezerwaTr: 'Rezerwa mocy TR',
  doborRezerwaTrPomoc: 'Zapas ponad moc pozorną falowników [pu], np. 0,1 = +10%.',
  doborRezerwaKabel: 'Rezerwa prądowa kabla',
  doborRezerwaKabelPomoc: 'Zapas obciążalności kabla ponad prąd TR [pu].',
  doborMaxDeltaU: 'Dopuszczalna zmiana napięcia',
  doborMaxDeltaUPomoc:
    'Dopuszczalna zmiana napięcia na odcinku kabla SN [%] — kryterium obejmuje MODUŁ zmiany, '
    + 'czyli zarówno spadek, jak i wzrost napięcia (przy generacji wiążący jest wzrost).',
  // V12K-203 — przypadek pracy toru DER sprawdzany w doborze.
  doborCosPhi: 'cos φ toru',
  doborCosPhiPomoc:
    'Współczynnik mocy falowników w sprawdzanym przypadku pracy. Wyznacza moc pozorną '
    + '(S = ΣP / cos φ), czyli moc transformatora blokowego, oraz udział mocy biernej w zmianie '
    + 'napięcia na kablu. cos φ = 1 oznacza pracę bez mocy biernej.',
  doborCharakterQ: 'Charakter mocy biernej falownika',
  doborCharakterQPobor: 'Pobór Q (indukcyjny — regulacja Q(U))',
  doborCharakterQOddawanie: 'Oddawanie Q (pojemnościowy)',
  doborCharakterQPomoc:
    'Kierunek mocy CZYNNEJ nie jest wyborem — tor oddaje moc do sieci, więc napięcie w punkcie '
    + 'przyłączenia rośnie. Wyborem jest moc bierna: pobór Q (tak działa regulacja Q(U) falownika) '
    + 'TŁUMI wzrost napięcia i pozwala zwykle na mniejszy przekrój; oddawanie Q wzrost powiększa.',
  doborCharakterQBezZnaczenia:
    'Przy cos φ = 1 falownik nie wymienia mocy biernej (sin φ = 0), więc charakter Q nie wpływa '
    + 'na dobór. Ustaw cos φ < 1, aby sprawdzić wpływ regulacji Q(U).',
  doborZmianaNapiecia: (wzrost: boolean) => (wzrost ? 'Wzrost napięcia' : 'Spadek napięcia'),
  doborWzrostInfo:
    'Tor generacji podnosi napięcie w punkcie przyłączenia — to ograniczenie wiodące przy '
    + 'przyłączaniu OZE. Wartość poniżej jest modułem zmiany; kryterium |ΔU%| sprawdza backend.',
  doborNapiecieSn: 'Napięcie szyny SN',
  doborZaproponuj: 'Zaproponuj dobór',
  doborZastosuj: 'Zastosuj propozycję',
  doborPobieranie: 'Dobieranie z katalogów…',
  doborBrakKontekstu: 'Wskaż szynę SN stacji, aby dobrać tor (napięcie szyny SN wyznacza dobór).',
  doborBrakFalownika: 'Wybierz falownik z katalogu w poprzednim kroku, aby dobrać tor.',
  doborPropTr: 'Transformator blokowy',
  doborPropKabel: 'Kabel SN',
  doborPropPole: 'Aparat pola SN',
  doborProgTr: 'Próg mocy (ΣS·k·(1+rezerwa))',
  doborProgKabel: 'Próg obciążalności (I_TR·(1+rezerwa))',
  doborProgPole: 'Próg prądu (I_TR·(1+rezerwa))',
  doborPradTr: 'Prąd znamionowy TR (strona SN)',
  doborOdrzucono: (n: number) => `Kandydatów odrzuconych: ${n}`,
  doborZastosowano: 'Propozycja zastosowana do toru.',
  teoriaDoborTytul: 'Teoria: dobór toru DER po stronie SN',
  teoriaDoborOpis:
    'Dobór wychodzi z parametrów elektrycznych, nie z rysunku. Moc pozorna źródła '
    + '$S = \\Sigma P / \\cos\\varphi$ (gdy podano cosφ). Transformator blokowy: najmniejsza moc znamionowa '
    + 'spełniająca $S_n \\cdot \\text{obciążalność} \\ge S \\cdot k_j \\cdot (1 + \\text{rezerwa})$ przy zgodnych '
    + 'napięciach stron SN/nN. Prąd znamionowy TR (strona SN) $I_{TR} = S_n / (\\sqrt{3} \\cdot U_{SN})$. Kabel SN: '
    + 'najmniejszy przekrój z $I_z \\ge I_{TR} \\cdot (1 + \\text{rezerwa})$ oraz $\\Delta U\\% \\le \\Delta U_{dop}$, gdzie '
    + '$\\Delta U = \\sqrt{3} \\cdot I \\cdot (R\\cos\\varphi + X\\sin\\varphi)$. Aparat pola SN: najmniejszy prąd znamionowy '
    + '$I_n \\ge I_{TR} \\cdot (1 + \\text{rezerwa})$ przy $U_n \\ge$ napięcie sieci.',
  teoriaDoborWymog:
    'Kaskada prądowa toru: $I_{TR} \\le I_z\\ \\text{kabla} \\le I_n\\ \\text{pola}$. Wybór słabszy niż propozycja '
    + 'jest dopuszczalny tylko, gdy nie narusza twardych walidacji (moc TR, napięcia, obciążalność).',
  teoriaDoborPodstawa:
    'Podstawa: PN-EN 60076 (transformatory), PN-HD 60364 / IEC 60502 (kable, obciążalność, ΔU), '
    + 'PN-EN 62271 (aparatura SN).',

  // Panel teorii + charakterystyki NC RfG (G-OZE-B5)
  teoriaTytul: 'Teoria i charakterystyka NC RfG',
  teoriaRozwin: 'Pokaż teorię i wykres charakterystyki',
  teoriaZwin: 'Ukryj teorię i wykres',
  teoriaPodstawa:
    'Podstawa: Rozporządzenie Komisji (UE) 2016/631 (NC RfG) + wymagania ogólnego stosowania '
    + 'PTPiREE/OSD. Wykres jest poglądowy — pokazuje kształt prawa regulacji wynikający z Twoich '
    + 'nastaw. Rzeczywiste Q i redukcję P w punkcie pracy liczy solver (rozpływ mocy).',
} as const;

/** Teksty PL podsumowania kreatora: auto-bieg + raport zgodności + BOM (D4). */
export const PODSUMOWANIE_STRINGS = {
  sekcjaAutoBieg: 'Obliczenia po zapisie',
  autoBiegOpis:
    'Po zapisie źródła system uruchomi obliczenia na zmaterializowanym modelu (rozpływ mocy '
    + '+ zwarcia) istniejącym mechanizmem przebiegów — bez ponownego budowania modelu.',
  autoBieg: 'Uruchom obliczenia po zapisie',
  zapiszDoMagazynu: 'Zapisz raport i listę materiałową do Dokumentacji',
  zapiszDoMagazynuOpis:
    'Raport zgodności i lista materiałowa trafią do huba Dokumentacji projektu (magazyn dokumentów).',
  opcjeTakNie: [
    { id: 'tak', etykieta: 'Tak' },
    { id: 'nie', etykieta: 'Nie' },
  ],

  // Fazy
  fazaZapis: 'Zapisywanie źródła…',
  fazaBieg: 'Obliczenia w toku (rozpływ + zwarcia)…',
  fazaDokumenty: 'Składanie raportu i listy materiałowej…',

  // Status biegu
  statusTytul: 'Status obliczeń',
  statusDone: '✓ Bieg analiz ukończony (rozpływ + zwarcia).',
  statusFailed: '❌ Bieg analiz nieudany — wyniki niedostępne.',
  statusRunning: '⏳ Bieg analiz w toku.',
  statusPominiety: 'Auto-bieg pominięty — obliczenia uruchomisz w przestrzeni „Obliczenia".',

  // Raport zgodności
  raportTytul: 'Raport zgodności toru DER-SN',
  raportZgodny: 'Projekt zgodny',
  raportZUwagami: 'Projekt zgodny z uwagami',
  raportNiezgodny: 'Projekt niezgodny',
  raportPodsumowanie: (pass: number, warn: number, fail: number) =>
    `Spełnione: ${pass} · Uwagi: ${warn} · Błędy: ${fail}`,
  raportBrak: 'Raport zgodności dotyczy toru DER przyłączonego po stronie SN (transformator blokowy).',

  // Lista materiałowa
  bomTytul: 'Lista materiałowa toru',
  bomKolLp: 'Lp',
  bomKolElement: 'Element',
  bomKolTyp: 'Typ katalogowy',
  bomKolParametry: 'Parametry',
  bomKolIlosc: 'Ilość',
  bomBrak: 'Lista materiałowa dotyczy toru DER przyłączonego po stronie SN.',

  // Nawigacja
  otworzDokumentacje: 'Otwórz Dokumentację',
  zakoncz: 'Zakończ',
  bladDokumentow: 'Nie udało się pobrać dokumentów toru DER-SN.',
} as const;

/** Teoria + opis osi wykresów charakterystyk NC RfG (poglądowych). */
export const NCRFG_TEORIA = {
  cosPhi: {
    tytul: 'Stały współczynnik mocy cosφ',
    opis:
      'Falownik utrzymuje zadany cosφ niezależnie od punktu pracy — moc bierna jest '
      + 'proporcjonalna do czynnej: $Q = P \\cdot \\tan(\\arccos\\cos\\varphi)$. Przy cosφ = 0,95 daje to '
      + '$|Q| \\approx 0{,}3287 \\cdot P$. Tryb prosty, nie reaguje na napięcie sieci — nadaje się, gdy OSD '
      + 'zadaje stałą wartość cosφ w punkcie przyłączenia (PPP).',
    wymog:
      'NC RfG typ B/C: moduł musi mieć zdolność pracy w zakresie co najmniej cosφ 0,95 '
      + 'indukcyjnie–pojemnościowo ($\\pm 0{,}3287 \\cdot P_n$) przy mocy znamionowej.',
    jakCzytac:
      'Linia robocza wychodzi z początku pod kątem $\\varphi = \\arccos(\\cos\\varphi)$. Im niższy cosφ, tym '
      + 'stromsza linia (więcej Q na jednostkę P). Szary klin = wymagane pasmo zdolności ±0,95.',
  },
  qu: {
    tytul: 'Regulacja Q(U) — napięciowo-jałowa (volt-var)',
    opis:
      'Moc bierna zależy od napięcia w PPP: w paśmie nieczułości (martwej strefie) wokół '
      + 'napięcia znamionowego $Q = 0$; poza pasmem Q rośnie liniowo ze statyzmem. Przy napięciu '
      + 'wyższym od górnej granicy pasma źródło POBIERA Q (rozładowuje sieć), przy niższym od '
      + 'dolnej — ODDAJE Q (podpiera napięcie). Zakres ograniczają Qmin/Qmax. To podstawowy '
      + 'tryb wsparcia napięcia lokalnego w sieciach z dużym nasyceniem OZE.',
    wymog:
      'NC RfG: charakterystyka Q(U) z nastawialnym pasmem nieczułości i nachyleniem; typowe '
      + 'pasmo 0,95–1,05 pu, statyzm dobierany przez OSD. Reakcja tylko poza pasmem.',
    jakCzytac:
      'Płaski odcinek na środku = pasmo nieczułości ($Q = 0$). Nachylenie ramion = statyzm '
      + '(większy = ostrzejsza reakcja). Poziome plateau = ograniczenie Qmin/Qmax.',
  },
  pf: {
    tytul: 'Statyzm P(f) / LFSM — ograniczanie mocy od częstotliwości',
    opis:
      'Przy wzroście częstotliwości powyżej pasma nieczułości (LFSM-O, np. od 50,2 Hz) źródło '
      + 'liniowo redukuje moc czynną — stabilizuje system przy nadmiarze generacji. Magazyny i '
      + 'źródła z rezerwą mogą też PODNOSIĆ moc przy spadku częstotliwości (LFSM-U, np. poniżej '
      + '49,8 Hz). Statyzm $s = \\frac{\\Delta P / P_n}{\\Delta f / f_n}$ [%]: mniejszy statyzm = ostrzejsza reakcja. '
      + 'Przy częstotliwości znamionowej (50 Hz) tryb nie zmienia mocy.',
    wymog:
      'NC RfG: LFSM-O obowiązkowy dla typów B/C/D — próg zwykle 50,2 Hz, statyzm 2–12% '
      + '(typ. 5%). LFSM-U wymagany dla źródeł ze zdolnością zwiększania mocy.',
    jakCzytac:
      'Płaski odcinek = pasmo nieczułości ($P = 100\\ \\%$). Opadające ramię w prawo = redukcja '
      + 'przy nadczęstotliwości (LFSM-O); rosnące ramię w lewo (jeśli aktywne) = LFSM-U.',
  },
  wylaczone: {
    tytul: 'Bez regulacji (źródło pasywne)',
    opis:
      'Źródło pracuje ze stałą mocą bierną $Q = 0$ — nie wspiera napięcia ani częstotliwości. '
      + 'Dopuszczalne tylko dla najmniejszych modułów (typ A) lub gdy OSD nie wymaga regulacji.',
    wymog: 'Dla typów B/C/D NC RfG wymaga aktywnych trybów regulacji Q i P(f).',
    jakCzytac: 'Brak charakterystyki — moc bierna stała ($Q = 0$) niezależnie od napięcia i częstotliwości.',
  },
  osU: 'Napięcie U [pu]',
  osQ: 'Moc bierna Q',
  osF: 'Częstotliwość f [Hz]',
  osP: 'Moc czynna P/Pn [%]',
  osPn: 'Moc czynna P [pu]',
  qOddawanie: '+ oddawanie',
  qPobor: '− pobór',
  pasmoNieczulosci: 'pasmo nieczułości',
  brakCharakterystyki: 'Wybierz tryb regulacji, aby zobaczyć charakterystykę.',
  wymogPrefix: 'Wymóg NC RfG: ',
} as const;
