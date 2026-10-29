/**
 * Teksty PL kreatora „Zespół uziemiający SN" (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA).
 *
 * Etykiety pól są TYMI SAMYMI słowami, którymi backend nazywa pola w komunikatach operacji
 * `add_zespol_uziemiajacy_sn` (`backend/src/enm/slownik_komunikatow.py`, przypięte testem
 * `test_nazwy_pol_sa_slowami_frontu`) — projektant widzi w odmowie to, co w formularzu.
 */

export const ZESPOL_UZIEMIAJACY_STRINGS = {
  eyebrow: 'MODEL SIECI · UZIEMIENIE PUNKTU NEUTRALNEGO SN',
  cel:
    'Postaw zespół uziemiający sekcji SN: transformator uziemiający ZNyn11 i element punktu '
    + 'neutralnego — dławik gaszący (Z.13), dławik i rezystor równolegle (Z.14), rezystor '
    + '(Z.15) albo uziemienie bezpośrednie. Zespół jest jedynym nośnikiem uziemienia sieci SN: '
    + 'z niego liczy się składowa zerowa zwarć doziemnych, prąd pojemnościowy i stopień '
    + 'kompensacji, zgodność przekładników napięciowych i droga doziemna pól.',
  odznaka: 'Zespół uziemiający SN',

  krokUklad: 'Miejsce i układ punktu neutralnego',
  krokElementy: 'Elementy punktu neutralnego',
  krokZapis: 'Automatyka i zapis',

  // Miejsce.
  miejsce: 'Miejsce (pole ZU albo szyna SN)',
  nazwa: 'Nazwa zespołu',
  nazwaPomoc: 'Puste pole — nazwa nadana przez model.',

  // Wariant (Z.13 / Z.14 / Z.15 / bezpośrednie).
  wariant: 'Układ punktu neutralnego',
  wariantDlawik: 'Dławik gaszący (Z.13)',
  wariantDlawikRezystor: 'Dławik i rezystor równolegle (Z.14)',
  wariantRezystor: 'Rezystor (Z.15)',
  wariantBezposrednie: 'Uziemienie bezpośrednie',
  wariantPomoc:
    'ENEA Zeszyt 1 §16: sieć kablowa — rezystor (Z.15); sieć napowietrzno-kablowa — dławik '
    + 'gaszący, z automatyką AWSC (Z.13) albo z rezystorem równolegle (Z.14).',

  // Pola kontraktu `add_zespol_uziemiajacy_sn` (słowa backendu — test parytetu).
  typTransformatora: 'Typ transformatora uziemiającego',
  typTransformatoraPlaceholder: '— wybierz transformator uziemiający —',
  typTransformatoraBlad: 'Nie udało się pobrać katalogu transformatorów uziemiających.',
  typDlawika: 'Typ dławika gaszącego',
  typDlawikaPlaceholder: '— wybierz dławik gaszący —',
  typDlawikaBlad: 'Nie udało się pobrać katalogu dławików gaszących.',
  typRezystora: 'Typ rezystora uziemiającego',
  typRezystoraPlaceholder: '— wybierz rezystor uziemiający —',
  typRezystoraBlad: 'Nie udało się pobrać katalogu rezystorów uziemiających.',
  odlacznikDlawika: 'Odłącznik dławika',
  nastawaDlawika: 'Nastawa dławika [A]',
  nastawaDlawikaPomoc:
    'Pusta nastawa — wartość robocza z dostrojenia do prądu pojemnościowego sieci '
    + '(jawnie oznaczona w wyjaśnieniu obliczeń).',
  awsc: 'Rezystor wymuszający AWSC',
  awscOpis:
    'Automatyka wymuszania składowej czynnej (Z.13): po zwłoce załącza rezystor równolegle '
    + 'do dławika na czas załączenia — zwarcie doziemne liczy się w obu stanach automatyki.',
  pradAwsc: 'Prąd wymuszany AWSC [A]',
  czasZalaczeniaAwsc: 'Czas załączenia AWSC [s]',
  zwlokaAwsc: 'Zwłoka załączenia AWSC [s]',
  stronaAwsc: 'Strona przyłączenia rezystora AWSC',
  stronaPierwotna: 'Uzwojenie pierwotne (punkt neutralny)',
  stronaWtorna: 'Uzwojenie wtórne dławika (500 V)',
  odlacznikRezystora: 'Odłącznik rezystora',
  bezposrednie: 'Uziemienie bezpośrednie punktu neutralnego',
  spz: 'SPZ zespołu',
  spzOpis: 'SPZ pola zespołu — dopuszczalny wyłącznie przy rezystorze w punkcie neutralnym.',
  wylaczenieOdTr: 'Wyłączenie od transformatorów WN/SN',
  wylaczenieOdTrOpis:
    'Wyłączenie transformatora WN/SN wyłącza zespół (przy rezystorze — wymóg §16).',
  brakTransformatorowWnSn: 'W modelu nie ma transformatorów WN/SN.',

  stanZamkniety: 'zamknięty',
  stanOtwarty: 'otwarty',

  // Kontrola / gotowość.
  kontrolaTytul: 'Kontrola zespołu',
  wierszMiejsce: 'Miejsce',
  wierszTransformator: 'Transformator uziemiający',
  wierszElement: 'Element punktu neutralnego',
  wierszKompletne: 'Kompletne',
  wierszDoKonfiguracji: 'Do konfiguracji',
  wierszBrak: 'Brak',

  podsumowanieTytul: 'Podsumowanie zespołu',
  paramUn: 'Napięcie znamionowe U_n',
  paramZ0: 'Impedancja zerowa uzwojenia Z_0,TU',
  paramZakres: 'Zakres regulacji dławika',
  paramR: 'Rezystancja rezystora R_N',
  paramIn: 'Prąd znamionowy rezystora',
  wartoscRobocza: 'wartość robocza katalogu typowego (do potwierdzenia kartą producenta)',

  // Downstream.
  downstreamTytul: 'Co to uruchamia',
  downstreamOpis:
    'Zespół uziemia punkt neutralny sekcji: zwarcia doziemne (Ik1, IEC 60909) liczą się '
    + 'z jego impedancji zerowej Z_0,ZU = Z_0,TU + 3·Z_N, dowód przekładników napięciowych '
    + 'czyta sposób uziemienia z modelu, a pola sekcji dostają drogę doziemną.',

  // Uczciwy stan zerowy.
  brakMiejscaTytul: 'Brak wskazania pola ZU albo szyny SN',
  brakMiejscaOpis:
    'Zaznacz na schemacie pole zespołu uziemiającego (albo szynę SN sekcji), a następnie '
    + 'uruchom ten krok — zespół przyłącza się do zacisku pola albo wprost do szyny.',

  wstecz: '← Wstecz',
  dalej: 'Dalej →',
  licznik: (n: number, z: number) => `Krok ${n} z ${z}`,
  zapisz: 'Zapisz zespół uziemiający',
  anuluj: 'Anuluj',
  brakZakresu: 'Wybierz aktywny zakres obliczeń przed zapisem zespołu.',
  walidacjaStopka: 'Uzupełnij wymagane pola, aby zapisać zespół uziemiający.',
  katalogLadowanieStopka:
    'Ładowanie katalogu elementów zespołu uziemiającego — zapis będzie dostępny po wczytaniu.',

  teoriaTytul: 'Teoria: uziemienie punktu neutralnego sieci SN',
  teoriaOpis:
    'Transformator uziemiający ZNyn11 wyprowadza sztuczny punkt neutralny sieci SN zasilanej '
    + 'z uzwojenia w trójkąt. Element w punkcie neutralnym decyduje o prądzie zwarcia '
    + 'doziemnego: dławik kompensuje prąd pojemnościowy sieci, rezystor ogranicza prąd do '
    + 'wartości czynnej wykrywalnej przez zabezpieczenia, a układ równoległy łączy obie cechy.',
  teoriaWymog:
    'Bocznik zerowy zespołu: $Z_{0,\\mathrm{ZU}} = Z_{0,\\mathrm{TU}} + 3\\,Z_N$; dławik '
    + '$X_L = U_n/(\\sqrt{3}\\,I_L)$, rezystor $R_N = U_n/(\\sqrt{3}\\,I_R)$, układ Z.14 '
    + '$Z_N = R_N \\parallel jX_L$.',
  teoriaPodstawa:
    'Podstawa: IEC 60909-0:2016 §6 (składowe symetryczne), ENEA Zeszyt 1 §16 '
    + '(rysunki Z.13, Z.14, Z.15).',
} as const;
