import { etykietaPunktuNeutralnegoPL } from '../../../types/uziemienie';

/*
 * Teksty PL ekranu „Składowe symetryczne i sieć zerowa" (dostawca E-29,
 * karta P-3, FLOW §0.3 „kontrakt ekranu prowadzącego"). Wyłącznie polski
 * język techniczny; identyfikatory wyłącznie w trybie eksperckim.
 */

export const SKLADOWE_STRINGS = {
  eyebrow: 'SKŁADOWE SYMETRYCZNE',
  tytul: 'Składowe symetryczne i sieć zerowa',
  cel: 'Sprawdź, jak impedancje składowych (zgodnej, przeciwnej i zerowej) oraz sposób '
    + 'uziemienia punktu neutralnego kształtują prąd zwarcia niesymetrycznego — na podstawie '
    + 'zakończonego przebiegu zwarciowego IEC 60909 i jego śladu obliczeń.',

  // Stan zerowy (brak zakończonego przebiegu zwarcia niesymetrycznego).
  zeroTytul: 'Brak zakończonego przebiegu zwarcia niesymetrycznego',
  zeroOpis: 'Ekran interpretuje wynik zwarcia jednofazowego (1F), dwufazowego (2F) lub '
    + 'dwufazowego z ziemią (2F+Z). Uruchom obliczenie zwarciowe niesymetryczne, aby '
    + 'zobaczyć impedancje składowych i kontekst sieci zerowej.',
  zeroAkcja: 'Przejdź do obliczeń',

  // Aktywny bieg zwarcia jest symetryczny (3F) — jawne przełączenie kontekstu (karta K8).
  symetrycznyTytul: 'Aktywny przebieg zwarciowy jest trójfazowy (symetryczny)',
  symetrycznyOpis: 'Składowe symetryczne i sieć zerowa dotyczą zwarć niesymetrycznych. Na schemacie, '
    + 'w panelu dolnym i na pasku stanu jest przebieg zwarcia trójfazowego. Pokaż najnowszy przebieg '
    + 'zwarcia niesymetrycznego — zmieni się on także na schemacie i w panelu dolnym.',
  symetrycznyAkcja: 'Pokaż przebieg zwarcia niesymetrycznego',

  // Stany dostawcy danych.
  ladowanieTytul: 'Ładowanie wyniku zwarciowego',
  ladowanieOpis: 'Widok pobiera wiersze kanoniczne, ślad obliczeń i wersję układu przebiegu.',
  bladTytul: 'Nie udało się pobrać wyniku zwarciowego',
  bladOpis: 'Backend nie zwrócił wierszy kanonicznych dla wskazanego przebiegu. '
    + 'Spróbuj ponownie z przestrzeni obliczeń.',

  // Założenia przebiegu.
  zalTytul: 'Założenia przebiegu',
  zalRodzaj: 'Rodzaj zwarcia',
  zalMetoda: 'Metoda obliczeń',
  zalMetodaWartosc: 'IEC 60909',
  zalWspolczynnikC: 'Współczynnik napięciowy c',
  zalWspolczynnikCPerWezel: 'różny dla węzłów — zob. kolumny „c" i „Podstawa c" w tabeli punktów',
  zalCzasTrwania: 'Czas trwania zwarcia tk',
  zalLiczbaPunktow: 'Liczba punktów zwarcia',

  // Tabela punktów.
  tabelaTytul: 'Punkty zwarcia — impedancje zastępcze i werdykt',
  tabelaOpis: 'Wielkości bilansu z kanonicznego wyniku solvera (tylko odczyt). '
    + 'Kliknij wiersz, aby zobaczyć składowe Z1/Z2/Z0 i uziemienie punktu.',
  kolPunkt: 'Punkt zwarcia',
  kolRodzaj: 'Rodzaj zwarcia',
  kolZk: '|Zk|',
  kolRk: 'Rk',
  kolXk: 'Xk',
  kolXR: 'X/R',
  kolKappa: 'Współczynnik udaru κ',
  kolIkss: 'Prąd zwarciowy początkowy Ik"',
  kolC: 'c',
  kolCZrodlo: 'Podstawa c',
  kolWerdykt: 'Werdykt raportowalności',
  kolIdentyfikator: 'Identyfikator punktu',

  // Sekcja składowych (ze śladu WHITE BOX).
  skladoweTytul: 'Impedancje składowych Z1 / Z2 / Z0',
  skladoweOpis: 'Wartości pochodzą ze śladu pełnej jawności obliczeń przebiegu (krok „Impedancja '
    + 'zastępcza w punkcie zwarcia") — prezentacja read-only, zero obliczeń w interfejsie.',
  skladowaZ1: 'Składowa zgodna Z1',
  skladowaZ2: 'Składowa przeciwna Z2',
  skladowaZ0: 'Składowa zerowa Z0',
  skladoweBrakZ0: 'Składowa zerowa nie uczestniczy w tym rodzaju zwarcia '
    + '(ślad przebiegu nie niesie Z0 dla tego punktu).',
  skladoweWzor: 'Wzór na impedancję zastępczą',
  skladowePodstawienie: 'Podstawienie wartości przebiegu',
  skladoweBrak: 'Ślad obliczeń tego przebiegu nie niesie kroku impedancji zastępczej '
    + 'dla wybranego punktu — składowych nie można pokazać bez fabrykacji.',
  skladoweSladNiedostepny: 'Ślad obliczeń przebiegu jest niedostępny (błąd pobierania). '
    + 'Składowe Z1/Z2/Z0 są prezentowane wyłącznie ze śladu obliczeń — bez niego '
    + 'ekran pokazuje tylko bilans |Zk| z wierszy kanonicznych.',
  skladoweDowod: 'Otwórz pełny dowód obliczeń',
  skladoweDowodOpis: 'Pełny ślad obliczeń przebiegu (wszystkie kroki) w zakładce „Dowód obliczeń".',

  // Sekcja uziemienia punktu neutralnego.
  uziemienieTytul: 'Sposób uziemienia punktu neutralnego',
  uziemienieOpis: 'Konfiguracja uziemienia z zamrożonej wersji układu tego przebiegu '
    + '(zespoły uziemiające sieci SN, punkt neutralny sieci 110 kV za granicą modelu '
    + 'oraz punkty neutralne górnego i dolnego napięcia transformatorów modelu).',
  uziemieniePunktu: 'Uziemienie na szynie wybranego punktu (zespół uziemiający albo źródło)',
  uziemienieBrakPunktu: 'Na szynie wybranego punktu model nie ma zespołu uziemiającego ani '
    + 'źródła z opisem punktu neutralnego — uziemienie sieci tej szyny pokazuje lista niżej.',
  uziemienieSiec: 'Punkty neutralne w sieci (zespoły uziemiające, źródła i transformatory)',
  uziemienieBrakSieci: 'Zamrożona wersja układu nie zawiera żadnej jawnej konfiguracji '
    + 'uziemienia punktu neutralnego. Uzupełnij dane uziemienia w modelu sieci, '
    + 'aby raport sieci zerowej był kompletny.',
  uziemienieSnapshotNiedostepny: 'Wersja układu przebiegu jest niedostępna (błąd pobierania) — '
    + 'konfiguracji uziemienia nie można pokazać.',
  uziemienieAkcjaModel: 'Przejdź do modelu sieci',
  uziemienieStronaGN: 'strona GN',
  uziemienieStronaDN: 'strona DN',
  uziemienieZrodlo: 'punkt neutralny sieci 110 kV za granicą modelu (źródło)',
  uziemienieZespol: 'zespół uziemiający sieci SN',
  zespolBezposrednie: 'uziemienie bezpośrednie',
  zespolDlawik: 'dławik gaszący',
  zespolDlawikAwsc: 'dławik gaszący z rezystorem wymuszającym AWSC',
  zespolRezystor: 'rezystor uziemiający',
  zespolBezElementu: 'bez elementu w punkcie neutralnym (brak modelu)',
  uziemienieRezystancja: 'R',
  uziemienieReaktancja: 'X',

  // Doziemienie sieci SN wg sposobu pracy punktu neutralnego (solver doziemienie_sn).
  doziemienieTytul: 'Doziemienie sieci SN wg sposobu pracy punktu neutralnego',
  doziemienieOpis: 'Prąd w miejscu doziemienia, jego charakter, napięcie składowej zerowej '
    + 'i napięcia faz zdrowych liczone modelem właściwym dla sposobu pracy punktu neutralnego '
    + 'sieci tego punktu: sieć izolowana — prąd pojemnościowy, kompensowana — prąd resztkowy, '
    + 'z rezystorem — prąd rezystancyjno-pojemnościowy, uziemiona bezpośrednio — prąd '
    + 'zwarciowy IEC 60909.',
  doziemienieBrakWiersza: 'Wybrany punkt nie niesie doziemienia sieci SN (zwarcie inne niż '
    + 'jednofazowe, punkt poza siecią SN albo starszy przebieg).',
  doziemieniePrad: 'Prąd w miejscu doziemienia',
  doziemienieIC: 'Prąd pojemnościowy sieci $I_C$',
  doziemienieIL: 'Prąd indukcyjny dławików $I_L$',
  doziemienieIW: 'Składowa czynna $I_w$',
  doziemienieV: 'Rozstrojenie $v = (I_C - I_L)/I_C$ (dodatnie — niedokompensowanie)',
  doziemienieUF: 'Napięcie fazowe $U_f$',
  doziemienieU0: 'Napięcie składowej zerowej $U_0$',
  doziemienieUB: 'Napięcie fazy zdrowej B $U_b$',
  doziemienieUC: 'Napięcie fazy zdrowej C $U_c$',
  doziemienieK: 'Współczynnik zwarcia doziemnego $k$',
  doziemienieZF: 'Impedancja w miejscu doziemienia $Z_f$',
  doziemienieWzor: 'Wzór',
  doziemienieUziemienie: 'Układ punktu neutralnego w stanie przebiegu',
  doziemieniePodstawa: 'Podstawa',
  doziemienieBrak: 'Brak wyniku',
  doziemieniePodwojne: 'Podwójne doziemienie',
  doziemienieZastrzezenia: 'Zastrzeżenia',
  doziemienieDanePrzyjete: 'Dane przyjęte (wartości robocze)',
  doziemienieNiepelny: 'Wynik na wartościach roboczych albo z brakiem — dowód niepełny.',
  doziemienieSlad: 'Ślad obliczenia (model zastosowany dla sposobu pracy punktu neutralnego)',

  // Raportowalność wybranego punktu.
  raportTytul: 'Raportowalność wybranego punktu',
  raportStatus: 'Werdykt raportowalności',
  raportUzasadnienie: 'Status uzasadnienia',
  raportOgraniczenia: 'Ograniczenia raportowe',
  raportBrakOgraniczen: 'brak ograniczeń',
  raportBrakStatusu: 'Starszy wynik nie niesie werdyktu raportowalności (uczciwy brak).',

  // Następny krok / powrót.
  nastepnyEyebrow: 'NASTĘPNY KROK',
  nastepnyOpis: 'Komplet prądów punktu (Ik", ip, Ith, Sk") znajdziesz w oknie „Zwarcia" '
    + 'przestrzeni Wyniki; pełny wywód kroków — w zakładce „Dowód obliczeń".',
  powrotHub: '← Wróć do analiz technicznych',
  powrotOpis: 'Wróć do przeglądu analiz technicznych',

  // Jednostki i wartości puste.
  jednOhm: 'Ω',
  jednA: 'A',
  jednV: 'V',
  jednKA: 'kA',
  jednS: 's',
  kreska: '—',
} as const;

/** Mapuje token uziemienia ENM na polską nazwę — JEDEN słownik (`types/uziemienie.ts`,
 *  W5-A); token nierozpoznany pokazywany dosłownie (dane, nie literał UI). */
export function uziemieniePL(token: string): string {
  return etykietaPunktuNeutralnegoPL(token);
}
