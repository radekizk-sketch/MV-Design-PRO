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
  krokAparatura: 'Aparatura pola',
  krokZgodnosc: 'Zgodność przyłączeniowa',
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
  istniejacePole: 'Istniejące pole odpływowe nN',
  istniejacePolePlaceholder: '— wybierz pole odpływowe —',
  istniejacePoleBrak:
    'Rozdzielnia nie ma pól odpływowych nN do wskazania — wybierz nowe pole źródłowe '
    + 'albo dodaj wcześniej pole odpływowe.',
  nazwaNowegoPola: 'Nazwa nowego pola',
  aparatNowegoPola: 'Aparat nowego pola nN',
  aparatPlaceholder: '— wybierz aparat nN —',
  nazwa: 'Nazwa źródła',
  nazwaPlaceholder: 'np. Farma PV Wschód',

  // O13: panel konsekwencji wariantu przyłączenia — opis strukturalny operacji
  // (co powstaje w modelu), bez żadnej wielkości liczbowej.
  konsekwencjeTytul: 'Konsekwencje wybranego wariantu',
  konsekwencjeNn: [
    'Falownik zostaje przyłączony do szyny nN rozdzielni.',
    'Powstaje pole źródłowe nN (nowe z aparatem z katalogu albo wskazane istniejące pole odpływowe).',
    'Transformator blokowy nie jest tworzony; krok doboru toru SN nie występuje.',
    'Wkład zwarciowy i rozpływ mocy źródła liczą się na poziomie nN.',
  ],
  konsekwencjeBlok: [
    'Falownik zostaje przyłączony do strony nN transformatora blokowego SN/nN.',
    'Wymagany jest transformator blokowy stacji albo tor SN zmaterializowany w kroku doboru (transformator + kabel SN + dedykowane pole źródłowe SN).',
    'Transformator blokowy wnosi do modelu własną impedancję i układ połączeń.',
    'Kreator prowadzi dodatkowy krok „Dobór toru SN".',
  ],

  // Krok 2
  sekcjaKatalog: 'Falownik z katalogu',
  katalog: 'Układ PV/BESS/FW',
  katalogPlaceholder: '— wybierz układ z katalogu —',
  katalogBlad: 'Nie udało się pobrać katalogu układów PV/BESS/FW.',
  katalogLadowanieStopka: 'Ładowanie katalogu przekształtników i aparatury nN — zapis chwilę poczeka.',
  katalogPomoc: 'Tabliczka wnosi napięcie, moc znamionową i zdolność Q — z katalogu (ZERO fizyki w UI).',
  liczba: 'Liczba jednostek',
  liczbaPomoc: 'Moc zagregowana = liczba × Pmax jednostki; agregacja po stronie backendu.',
  paramNapiecie: 'Napięcie znamionowe',
  paramMoc: 'Moc znamionowa S',
  paramPmax: 'Moc czynna Pmax (agregat)',
  // O7: jawna semantyka liczby jednostek — zestaw i suma mocy pozornej z tabliczki.
  paramZestaw: 'Zestaw jednostek',
  paramMocAgregat: 'Moc pozorna S (agregat)',
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

  // Krok APARATURA (K9-A O2/O3): wiązania aparaturowe wytwórcy.
  sekcjaAparatura: 'Aparatura pola wytwórcy',
  aparaturaPomoc:
    'Wiązania aparaturowe zapisują się do modelu razem ze źródłem i odblokowują osie '
    + 'gotowości analiz: zabezpieczenia, selektywność, zwarcia niesymetryczne oraz badania '
    + 'przejścia przez zakłócenie. Typy pochodzą z realnych katalogów.',
  aparaturaCt: 'Przekładnik prądowy (CT)',
  aparaturaCtPomoc:
    'Klasa rdzenia z katalogu decyduje o gotowości osi zabezpieczeń (IEC 61869-2).',
  aparaturaVt: 'Przekładnik napięciowy (VT)',
  aparaturaVtPomoc: 'Pomiar napięcia dla zabezpieczeń i automatyki pola wytwórcy.',
  aparaturaZabezpieczenie: 'Zabezpieczenie pola wytwórcy',
  aparaturaZabezpieczeniePomoc:
    'Urządzenie zabezpieczeniowe pola — funkcje deklarowane przez typ zasilają oś '
    + '„Zabezpieczenia" i ocenę doboru funkcji.',
  aparaturaKatalogPlaceholder: '— wybierz typ z katalogu —',
  aparaturaKatalogBlad: 'Nie udało się pobrać katalogu aparatury.',
  // Dane bez katalogu w systemie — pola jawnie bez walidacji katalogowej (dług nazwany).
  aparaturaBezKataloguTytul: 'Dane producenta bez walidacji katalogowej',
  aparaturaBezKatalogu:
    'System nie ma katalogu danych zwarciowych ani modeli dynamicznych falowników — poniższe '
    + 'referencje są zapisywane bez sprawdzenia w katalogu (odpowiedzialność projektanta). '
    + 'Źródło danych: karta katalogowa albo protokół badań producenta.',
  aparaturaDaneZwarciowe: 'Referencja danych zwarciowych urządzenia',
  aparaturaDaneZwarciowePomoc:
    'Składowe symetryczne urządzenia — bez nich zwarcia niesymetryczne (1-fazowe, '
    + '2-fazowe z ziemią) pozostają zablokowane (IEC 60909-3).',
  aparaturaModelDynamiczny: 'Referencja modelu dynamicznego urządzenia',
  aparaturaModelDynamicznyPomoc:
    'Opis zachowania przekształtnika w stanach przejściowych — wymagany do badań '
    + 'przejścia przez zapad (LVRT) i wzrost napięcia (HVRT).',
  aparaturaRefPlaceholder: 'np. oznaczenie dokumentu producenta',
  teoriaAparaturaTytul: 'Teoria: aparatura pola wytwórcy',
  teoriaAparaturaOpis:
    'Pole wytwórcy wymaga toru pomiarowego (przekładnik prądowy i napięciowy) oraz '
    + 'zabezpieczenia. Klasa rdzenia przekładnika prądowego decyduje, czy pomiar nadaje się '
    + 'do celów zabezpieczeniowych (rdzeń klasy P/PR wg IEC 61869-2), a funkcje urządzenia '
    + 'zabezpieczeniowego muszą pokrywać wymagania wynikające ze sposobu pracy punktu '
    + 'neutralnego i ścieżki zwarcia doziemnego.',
  teoriaAparaturaWymog:
    'Dobór funkcji zabezpieczeniowych pola wytwórcy zależy od strony przyłączenia i ścieżki '
    + 'zwarcia doziemnego; ocenę pokrycia funkcji wykonuje system po zapisaniu wiązań.',
  teoriaAparaturaPodstawa:
    'Podstawa: IEC 61869-2 (przekładniki), IEC 60255 (zabezpieczenia), IRiESD OSD.',

  // Krok ZGODNOŚĆ (K9-A O4): profile zgodności przyłączeniowej NC RfG.
  sekcjaZgodnosc: 'Profile zgodności przyłączeniowej (NC RfG)',
  zgodnoscPomoc:
    'Profil operatora i krzywe graniczne zapisują się do modelu razem ze źródłem — zasilają '
    + 'ocenę zgodności NC RfG, badania przejścia przez zakłócenie (LVRT/HVRT) i odpowiedź '
    + 'częstotliwościową P(f).',
  zgodnoscProfil: 'Profil wymagań operatora',
  zgodnoscProfilPlaceholder: '— wybierz profil operatora —',
  zgodnoscProfilPomoc:
    'Zestaw wymagań ogólnego stosowania operatora (moduły A–D). Wybór profilu zawęża '
    + 'listę krzywych granicznych do wymagań tego operatora.',
  zgodnoscLvrt: 'Krzywa graniczna LVRT (zanik napięcia)',
  zgodnoscHvrt: 'Krzywa graniczna HVRT (przepięcie)',
  // NIE „operatora" (karta K-Q): katalog nastaw P(f) przestał być listą wariantów
  // przypisanych operatorom, bo rozporządzenie (UE) 2016/631 art. 13 ust. 2 podaje
  // statyzm jako nastawialny w przedziale 2–12% wspólnie dla wszystkich. Etykieta
  // obiecująca wybór „operatora" opisywałaby listę, której już nie ma, i rozjeżdżała
  // się z tą samą wielkością na karcie wytwórcy („Charakterystyka P(f)").
  zgodnoscPf: 'Charakterystyka P(f)',
  zgodnoscPfPomoc:
    'Statyzm i strefa nieczułości odpowiedzi mocowo-częstotliwościowej. Zakres nastawy '
    + 'wynika z rozporządzenia (UE) 2016/631 art. 13 ust. 2 (2–12%), więc lista NIE zawęża '
    + 'się profilem operatora — inaczej niż obwiednie LVRT/HVRT.',
  zgodnoscKrzywaPlaceholder: '— wybierz krzywą —',
  zgodnoscKrzywePomoc:
    'Obwiednie graniczne napięcie–czas oraz charakterystyka mocowo-częstotliwościowa '
    + 'z wymagań operatora — porównanie z odpowiedzią jednostki wykonuje system.',
  teoriaZgodnoscTytul: 'Teoria: zgodność przyłączeniowa NC RfG',
  teoriaZgodnoscOpis:
    'Moduł wytwarzania energii podlega wymaganiom NC RfG stosownie do typu (A–D, wg mocy '
    + 'i napięcia przyłączenia). Profil operatora określa obwiednie graniczne przetrwania '
    + 'zakłóceń (LVRT/HVRT), wymaganą odpowiedź częstotliwościową P(f) i zdolność do mocy '
    + 'biernej. Krzywe wybrane tutaj są danymi wejściowymi badań zgodności w punkcie '
    + 'przyłączenia.',
  teoriaZgodnoscWymog:
    'Do oceny zgodności wymagany jest profil operatora oraz krzywe LVRT i HVRT; bez nich '
    + 'osie badań przejścia przez zakłócenie pozostają zablokowane.',
  teoriaZgodnoscPodstawa:
    'Podstawa: Rozporządzenie Komisji (UE) 2016/631 (NC RfG), IRiESD/IRiESP, wymagania '
    + 'ogólnego stosowania PTPiREE.',

  // Tryb pracy źródła (K9-A O5) — słownik trybów punktu pracy źródła w modelu.
  trybPracy: 'Tryb pracy źródła',
  trybPracyPomoc:
    'Stan pracy źródła zapisywany w modelu — czytelny dla kart pól i odczytów rozdzielni. '
    + 'Pozostaw „bez wskazania", aby nie zapisywać stanu (odczyt pola przyjmie gotowość).',
  trybPracyBrak: '— bez wskazania —',
  trybPracyOpcje: [
    { id: 'praca_sieciowa', etykieta: 'Praca sieciowa (oddawanie mocy)' },
    { id: 'ladowanie', etykieta: 'Ładowanie (pobór mocy — magazyn)' },
    { id: 'rozladowanie', etykieta: 'Rozładowanie (oddawanie mocy — magazyn)' },
    { id: 'gotowosc', etykieta: 'Gotowość (bez wymiany mocy)' },
    { id: 'odstawione', etykieta: 'Odstawione (wyłączone z ruchu)' },
  ],

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
  wierszAparatura: 'Aparatura pola',
  wierszZgodnosc: 'Profile NC RfG',
  wierszRegulacja: 'Regulacja',
  wierszTrybPracy: 'Tryb pracy',
  aparaturaCzesciowa: (n: number, z: number) => `Wybrano ${n} z ${z}`,
  doKonfiguracji: 'Do konfiguracji',
  bezWskazania: 'Bez wskazania',

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
  brakProjektu:
    'Wiązania aparaturowe i profile wymagają aktywnego projektu — wybierz projekt przed zapisem.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać źródło OZE.',

  // Sekwencja zapisu (K9-A §0.4): każdy etap raportowany uczciwie — bez udawania
  // atomowości, której model nie zapewnia.
  sekwencjaTytul: 'Przebieg zapisu',
  sekwencjaOpis:
    'Zapis składa się z kolejnych operacji na modelu. Przy niepowodzeniu etapu poniżej '
    + 'widać, co już zostało zapisane, a co wymaga uzupełnienia w karcie wytwórcy.',
  sekwencjaKrokZrodlo: 'Utworzenie źródła w modelu',
  sekwencjaKrokWiazania: 'Wiązania aparaturowe i profile zgodności',
  sekwencjaKrokTryb: 'Tryb pracy źródła',
  sekwencjaKrokLimity: 'Limity mocy biernej (adekwatność Q)',
  sekwencjaZapisane: 'zapisane',
  sekwencjaPominiete: 'pominięte (bez wyborów)',
  sekwencjaBlad: 'błąd',
  sekwencjaBladPodsumowanie:
    'Część etapów zapisu nie powiodła się — źródło jest w modelu, brakujące dane uzupełnisz '
    + 'w karcie wytwórcy (wiązania katalogowe) bez ponownego tworzenia elementu.',

  // Readout osi gotowości DER (K9-A O15) — wyłącznie odczyt z modelu (bez lokalnych reguł).
  gotowoscDerTytul: 'Gotowość analiz wytwórcy',
  gotowoscDerOpis:
    'Osie gotowości z modelu — status mówi, czy wytwórca ma dane potrzebne do danej analizy, '
    + 'a powody wskazują brakującą daną i miejsce uzupełnienia.',
  gotowoscDerLadowanie: 'Pobieranie osi gotowości wytwórcy…',
  gotowoscDerBlad: 'Nie udało się pobrać osi gotowości wytwórcy.',
  gotowoscDerStatus: {
    ready: 'gotowa',
    partial: 'częściowa',
    blocked: 'zablokowana',
    not_applicable: 'nie dotyczy',
    no_module: 'brak modułu',
  } as Record<string, string>,

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
  // K9-A O8/O9/O11: pełne parametry progu doboru (konsumowane przez końcówkę doboru).
  doborJednoczesnosc: 'Współczynnik jednoczesności',
  doborJednoczesnoscPomoc:
    'Współczynnik jednoczesności pracy falowników $k_j$ (0–1]. Obniża obciążenie efektywne: '
    + '$S_{ef} = \\Sigma S \\cdot k_j$. Puste = 1,0 (pełna jednoczesność).',
  doborObciazalnoscTr: 'Obciążalność TR',
  doborObciazalnoscTrPomoc:
    'Dopuszczalne obciążenie względne transformatora [pu Sn], np. 1,0 = praca do mocy '
    + 'znamionowej. Próg doboru: $S_n \\cdot \\text{obciążalność} \\ge S_{wym}$.',
  doborRezerwaPole: 'Rezerwa prądowa aparatu pola',
  doborRezerwaPolePomoc: 'Zapas prądu znamionowego aparatu pola SN ponad prąd TR [pu].',
  // uk% TR blokowego: WYŁĄCZNIE odczyt z propozycji — wartość rządzi katalog typu
  // (materializacja nadpisuje wartość z żądania), więc kontrolka edycji byłaby pozorna.
  doborUkTr: 'Napięcie zwarcia uk (z katalogu)',
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
  // V12K-207 (karta F-K7) — warunki UŁOŻENIA kabla w doborze obciążalności.
  doborWarunkiUlozenia: 'Warunki ułożenia kabla',
  doborWarunkiUlozeniaPomoc:
    'Obciążalność z katalogu obowiązuje dla warunków ODNIESIENIA producenta. W ziemi, '
    + 'w wiązce i w grupie kabel przenosi mniej, więc dobór bez korekty jest optymistyczny. '
    + 'Zestawy i współczynniki pochodzą z backendu (podstawa dokumentowa przy każdym).',
  doborWarunkiUlozeniaNiedostepne:
    'Nie udało się pobrać listy warunków ułożenia — dobór policzy się dla warunków '
    + 'katalogowych i tak też zostanie opisany.',
  doborObciazalnoscKatalogowa: 'Obciążalność katalogowa Iz',
  doborObciazalnoscSkorygowana: 'Obciążalność po korekcie I′z',
  doborZalozenieObciazalnosci: 'Założenie obciążalności',
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
