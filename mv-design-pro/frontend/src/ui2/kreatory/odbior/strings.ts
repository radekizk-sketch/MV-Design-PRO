/** Teksty PL kreatora „Dodaj odbiór nN" (G-NN). Język inżynierski. */

export const ODBIOR_STRINGS = {
  eyebrow: 'MODEL SIECI · ODBIÓR nN',
  cel:
    'Dodaj odbiór na odpływie nN. Podajesz moc czynną i współczynnik mocy $\\cos\\varphi$; '
    + 'prąd i moc pozorną liczy backend, a moc bierną Q operacja wyprowadza z $\\cos\\varphi$. '
    + 'Typ odbioru dobierasz z katalogu; tryb ręczny (ekspercki) pozwala pominąć katalog.',
  odznaka: 'Nowy odbiór nN',

  krokDane: 'Dane odbioru',
  krokZapis: 'Podsumowanie i zapis',

  // Tryb doboru odbioru (katalog-first domyślnie; ten sam wzorzec przełącznika
  // co kreator źródła zasilania — karta D4).
  trybOdbioruTytul: 'Tryb doboru odbioru',
  trybKatalog: 'Z katalogu',
  trybReczny: 'Ręczny (ekspercki)',
  trybRecznyInfo:
    'Tryb ekspercki: dane odbioru wprowadzasz ręcznie, bez pozycji katalogowej. '
    + 'Migawka modelu znakuje taki odbiór jako pochodzenia „EKSPERCKI_RECZNY" — '
    + 'bez wpływu na kategorię katalogu w raportach i kontekście analiz.',
  pochodzenieDanychTytul: 'Pochodzenie danych',
  pochodzenieKatalog: 'Z katalogu',
  pochodzenieReczne: 'Ręczne (ekspercki, bez katalogu)',

  typKatalog: 'Typ odbioru z katalogu',
  typKatalogPlaceholder: '— wybierz typ odbioru —',
  typBlad: 'Nie udało się pobrać katalogu odbiorów.',
  typPomoc: 'Wybór typu wypełnia moc i $\\cos\\varphi$ z katalogu — możesz je potem skorygować.',

  nazwa: 'Nazwa odbioru',
  nazwaPlaceholder: 'np. Odbiór technologiczny hala A',
  moc: 'Moc czynna P',
  cosPhi: 'Współczynnik mocy $\\cos\\varphi$',
  qOverride: 'Moc bierna Q (opcjonalnie)',
  qOverridePomoc: 'Puste = backend wyprowadzi Q z $\\cos\\varphi$. Wpisz, aby narzucić wartość.',
  rodzaj: 'Rodzaj odbioru',
  rodzajOpcje: [
    { id: 'SKUPIONY', etykieta: 'Skupiony' },
    { id: 'ROZPROSZONY', etykieta: 'Rozproszony' },
  ],
  // Fazy przyłączenia (W5-D) — pole `Load.phases` modelu; pozycja pusta = brak
  // wskazania (odbiór liczony jako trójfazowy symetryczny). Identyfikatory
  // 1:1 z `enm/models.py::PhaseSet`.
  fazy: 'Fazy przyłączenia',
  fazyOpcje: [
    { id: '', etykieta: '— nie wskazano (trójfazowy symetryczny) —' },
    { id: 'ABC', etykieta: 'Trójfazowy (L1, L2, L3)' },
    { id: 'A', etykieta: 'Jednofazowy L1 (faza A)' },
    { id: 'B', etykieta: 'Jednofazowy L2 (faza B)' },
    { id: 'C', etykieta: 'Jednofazowy L3 (faza C)' },
    { id: 'AB', etykieta: 'Międzyfazowy L1–L2 (AB)' },
    { id: 'BC', etykieta: 'Międzyfazowy L2–L3 (BC)' },
    { id: 'CA', etykieta: 'Międzyfazowy L3–L1 (CA)' },
  ],
  fazyPomoc:
    'Fazy czyta rozpływ niesymetryczny (napięcia i prądy per faza, VUF). Odbiór bez '
    + 'wskazania liczy się jako trójfazowy symetryczny. Rozpływ niesymetryczny obsługuje '
    + 'odbiory trójfazowe i faza–N (A/B/C); odbiór międzyfazowy (AB/BC/CA) zatrzyma ten '
    + 'bieg nazwaną odmową z wskazaniem odbioru.',
  wierszFazy: 'Fazy przyłączenia',
  fazyNieWskazano: 'nie wskazano — trójfazowy symetryczny',

  // Uziom instalacji odbiorczej (karta W5-E-TTIT) — pole `Load.earth_electrode_r_ohm`.
  uziomTytul: 'Uziom instalacji odbiorczej (układ TT)',
  uziomRa: 'Rezystancja uziomu instalacji $R_A$',
  uziomRaPomoc:
    'Czyta ją pętla doziemna układu TT (IEC 60364-4-41 §411.5): prąd zwarcia doziemnego płynie '
    + 'przez uziom instalacji $R_A$ i uziom stacji $R_B$, a napięcie dotykowe to $R_A \\cdot I_{\\Delta n}$ wyłącznika '
    + 'różnicowoprądowego. Puste = analiza TT odmawia nazwanym kodem (nie podstawia wartości); '
    + 'w układach TN pole nie jest czytane.',
  uziomNiePodano: 'nie podano — pętla TT odmówi kodem nn.brak_r_a',
  wierszUziom: 'Uziom instalacji $R_A$',

  // Model obciążenia (ZIP) — współczynniki czytane przez rozpływ mocy.
  zipTytul: 'Model obciążenia (ZIP)',
  zipNota: '$a + b + c = 1$ osobno dla $P$ i dla $Q$',
  zipPomoc:
    'Model określa, jak pobór zmienia się z napięciem: udział stałoimpedancyjny (a) '
    + 'maleje z kwadratem napięcia, stałoprądowy (b) liniowo, stałomocowy (c) jest od '
    + 'napięcia niezależny. Domyślnie odbiór jest stałomocowy (c = 1) — tak liczył '
    + 'rozpływ do tej pory. Wybór typu z katalogu wypełnia model wartościami pozycji.',
  zipNaglowekP: 'Moc czynna P',
  zipNaglowekQ: 'Moc bierna Q',
  zipAP: 'Udział stałoimpedancyjny mocy czynnej ($a_{P}$)',
  zipBP: 'Udział stałoprądowy mocy czynnej ($b_{P}$)',
  zipCP: 'Udział stałomocowy mocy czynnej ($c_{P}$)',
  zipAQ: 'Udział stałoimpedancyjny mocy biernej ($a_{Q}$)',
  zipBQ: 'Udział stałoprądowy mocy biernej ($b_{Q}$)',
  zipCQ: 'Udział stałomocowy mocy biernej ($c_{Q}$)',
  zipKPf: 'Wrażliwość częstotliwościowa mocy czynnej ($k_{pf}$)',
  zipKQf: 'Wrażliwość częstotliwościowa mocy biernej ($k_{qf}$)',
  zipKPomoc:
    'Względna zmiana poboru na jednostkę względnej zmiany częstotliwości '
    + '(0 = pobór niezależny od częstotliwości).',
  zipSumaP: 'Suma udziałów P',
  zipSumaQ: 'Suma udziałów Q',
  zipWierszModel: 'Model obciążenia',
  zipModelStalaMoc: 'Stała moc (c = 1)',
  zipModelWlasny: 'Własny model ZIP',

  // Podgląd (R1).
  podgladTytul: 'Podgląd odbioru (backend)',
  podgladI: 'Prąd odbioru',
  podgladS: 'Moc pozorna S',
  podgladZrodlo: 'Źródło wyniku',
  podgladZrodloWartosc: 'Obliczenie prądu po stronie serwera (R1)',
  podgladBrak: 'Podaj moc i $\\cos\\varphi$, aby zobaczyć prąd odbioru.',
  // Komunikat NAZYWA PRZYCZYNE (V12K-260). Poprzednia wersja mowila tylko, ze sie
  // nie udalo, a pod spodem ekran dopisywal polecenie podania mocy i cosfi — przy
  // mocy i cosfi JUZ PODANYCH. Projektant szukal brakujacego pola, ktorego nie brakowalo.
  podgladBlad: 'Nie udało się wyznaczyć podglądu prądu — usługa obliczeń nie odpowiedziała. '
    + 'Dane odbioru są kompletne; spróbuj ponownie albo sprawdź połączenie z backendem.',

  // Downstream.
  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Rozpływ mocy uwzględni odbiór (P i Q z $\\cos\\varphi$); rozpływ niesymetryczny rozłoży go '
    + 'na wskazane fazy; analizy łuku, bilansu energii i strat oraz identyfikacja '
    + 'granic policzą jego wpływ.',

  // Kontrola.
  kontrolaTytul: 'Kontrola odbioru',
  wierszOdplyw: 'Odpływ nN',
  wierszMoc: 'Moc P',
  wierszCos: '$\\cos\\varphi$',
  wierszPrad: 'Prąd',

  // Stan zerowy.
  brakOdplywuTytul: 'Brak odpływu nN',
  brakOdplywuOpis:
    'Zaznacz na schemacie odpływ nN, do którego chcesz dołączyć odbiór, '
    + 'a następnie uruchom ten krok.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz odbiór nN',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem odbioru.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać odbiór.',
  // S9-5 (klasa: bramka enable bez sygnału gotowości, `karta_e2e_s95.md`) —
  // katalog odbiorów ładuje się asynchronicznie; zapis z KATALOGOWEJ ścieżki
  // pochodzenia bez niego byłby cichym no-op na pustym `catalog_ref`, więc
  // blokujemy JAWNIE (tryb ręczny katalogu nie potrzebuje — patrz `stanGotowosci`).
  katalogLadowanieStopka: 'Ładowanie katalogu typów odbiorów nN — zapis będzie dostępny po wczytaniu.',

  // Panel teorii (V12K-066: standard „must-have")
  teoriaTytul: 'Teoria: odbiór nN — moc, współczynnik mocy i model obciążenia',
  teoriaOpis:
    'Odbiór reprezentuje pobór mocy czynnej P i biernej Q na szynie nN. Współczynnik mocy $\\cos\\varphi$ '
    + 'wiąże je: $Q = P \\cdot \\tan(\\arccos\\cos\\varphi)$ — im niższy $\\cos\\varphi$, tym większy pobór Q i większe obciążenie '
    + 'sieci oraz straty. Model obciążenia (stała moc / stały prąd / stała impedancja, tzw. ZIP) '
    + 'określa, jak pobór zmienia się z napięciem: odbiory stałomocowe pobierają tę samą P niezależnie '
    + 'od napięcia, impedancyjne — malejącą przy spadku napięcia. Sposób przyłączenia (1‑/3‑fazowe) '
    + 'wpływa na niesymetrię. Rozkład napięć i prądów od tego odbioru liczy solver rozpływu mocy.',
  teoriaWymog:
    '$\\cos\\varphi$ w punkcie przyłączenia powinien spełniać wymagania OSD (zwykle ≥ 0,93 $\\operatorname{tg}\\varphi$ ≤ 0,4); '
    + 'moc przyłączeniowa i model obciążenia muszą odpowiadać rzeczywistemu charakterowi odbioru.',
  teoriaPodstawa: 'Podstawa: PN-EN 50160, IRiESD ($\\operatorname{tg}\\varphi$), model ZIP obciążenia.',
  teoriaJakCzytac:
    'Trójkąt mocy: przyprostokątna pozioma = moc czynna P, pionowa = moc bierna Q, '
    + 'przeciwprostokątna = moc pozorna S. Kąt między P a S rośnie, gdy $\\cos\\varphi$ maleje — im niższy '
    + '$\\cos\\varphi$, tym więcej Q na tę samą P ($Q = P \\cdot \\tan(\\arccos\\cos\\varphi)$). Rzeczywisty pobór liczy rozpływ.',
  wykresAria: 'Trójkąt mocy odbioru w funkcji $\\cos\\varphi$ (P, Q, S)',
  wykresOsP: 'Moc czynna P [pu]',
  wykresOsQ: 'Moc bierna Q [pu]',
  wykresP: 'P (czynna)',
  wykresQ: 'Q (bierna)',
  wykresS: 'S (pozorna)',
} as const;

/**
 * Teksty kreatora „Dodaj odbiór SN" — TA SAMA formatka co odbiór nN (operacja
 * `add_load_sn` reużywa semantyki P/Q/cosφ/ZIP/faz `add_nn_load`); różni się miejsce
 * przyłączenia (szyna SN wskazana na schemacie, nie odpływ nN) i opis.
 */
export const ODBIOR_SN_STRINGS = {
  ...ODBIOR_STRINGS,
  eyebrow: 'MODEL SIECI · ODBIÓR SN',
  cel:
    'Dodaj odbiór przyłączony wprost do szyny SN (np. odbiorca zasilany z rozdzielni SN bez '
    + 'własnej stacji SN/nN w modelu). Podajesz moc czynną i $\\cos\\varphi$; moc bierną Q operacja '
    + 'wyprowadza z $\\cos\\varphi$, prąd liczy backend. Typ odbioru dobierasz z katalogu albo w trybie ręcznym.',
  odznaka: 'Nowy odbiór SN',
  trybRecznyInfo:
    'Tryb ekspercki: dane odbioru wprowadzasz ręcznie, bez pozycji katalogowej. '
    + 'Odbiór bez pozycji katalogu migawka modelu znakuje jako pochodzenia „EKSPERCKI_RECZNY".',
  nazwaPlaceholder: 'np. Odbiorca SN — zakład produkcyjny',
  wierszOdplyw: 'Szyna SN',
  brakOdplywuTytul: 'Brak szyny SN',
  brakOdplywuOpis:
    'Wskaż na schemacie szynę SN (menu kontekstowe szyny → „Dodaj odbiór SN"), '
    + 'do której chcesz przyłączyć odbiór.',
  zapisz: 'Zapisz odbiór SN',
  katalogLadowanieStopka: 'Ładowanie katalogu typów odbiorów — zapis będzie dostępny po wczytaniu.',
  teoriaTytul: 'Teoria: odbiór SN — moc, współczynnik mocy i model obciążenia',
};
