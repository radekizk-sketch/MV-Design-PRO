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
  zalCzasTrwania: 'Czas trwania zwarcia tk',
  zalLiczbaPunktow: 'Liczba punktów zwarcia',

  // Tabela punktów.
  tabelaTytul: 'Punkty zwarcia — impedancje zastępcze i werdykt',
  tabelaOpis: 'Wielkości bilansu z FROZEN solvera (wiersze kanoniczne przebiegu). '
    + 'Kliknij wiersz, aby zobaczyć składowe Z1/Z2/Z0 i uziemienie punktu.',
  kolPunkt: 'Punkt zwarcia',
  kolRodzaj: 'Rodzaj zwarcia',
  kolZk: '|Zk|',
  kolRk: 'Rk',
  kolXk: 'Xk',
  kolXR: 'X/R',
  kolKappa: 'Współczynnik udaru κ',
  kolIkss: 'Prąd zwarciowy początkowy Ik"',
  kolWerdykt: 'Werdykt raportowalności',
  kolIdentyfikator: 'Identyfikator punktu',

  // Sekcja składowych (ze śladu WHITE BOX).
  skladoweTytul: 'Impedancje składowych Z1 / Z2 / Z0',
  skladoweOpis: 'Wartości pochodzą ze śladu obliczeń WHITE BOX przebiegu (krok „Impedancja '
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
    + 'Składowe Z1/Z2/Z0 są prezentowane wyłącznie ze śladu WHITE BOX — bez niego '
    + 'ekran pokazuje tylko bilans |Zk| z wierszy kanonicznych.',
  skladoweDowod: 'Otwórz pełny dowód obliczeń',
  skladoweDowodOpis: 'Pełny ślad WHITE BOX przebiegu (wszystkie kroki) w zakładce „Dowód obliczeń".',

  // Sekcja uziemienia punktu neutralnego.
  uziemienieTytul: 'Sposób uziemienia punktu neutralnego',
  uziemienieOpis: 'Konfiguracja uziemienia z ZAMROŻONEJ wersji układu tego przebiegu '
    + '(pola `grounding` szyn i `hv_neutral`/`lv_neutral` transformatorów modelu).',
  uziemieniePunktu: 'Uziemienie wybranego punktu (szyna)',
  uziemienieBrakPunktu: 'Model nie określa konfiguracji uziemienia dla szyny wybranego punktu.',
  uziemienieSiec: 'Punkty neutralne w sieci (szyny i transformatory)',
  uziemienieBrakSieci: 'Zamrożona wersja układu nie zawiera żadnej jawnej konfiguracji '
    + 'uziemienia punktu neutralnego. Uzupełnij dane uziemienia w modelu sieci, '
    + 'aby raport sieci zerowej był kompletny.',
  uziemienieSnapshotNiedostepny: 'Wersja układu przebiegu jest niedostępna (błąd pobierania) — '
    + 'konfiguracji uziemienia nie można pokazać.',
  uziemienieAkcjaModel: 'Przejdź do modelu sieci',
  uziemienieStronaGN: 'strona GN',
  uziemienieStronaDN: 'strona DN',
  uziemienieRezystancja: 'R',
  uziemienieReaktancja: 'X',

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
  jednKA: 'kA',
  jednS: 's',
  kreska: '—',
} as const;

/**
 * Słownik PL sposobów uziemienia punktu neutralnego. Klucze = tokeny
 * `GroundingConfig.type` z ENM (enm/models.py:21-24 / types/enm.ts:12-16).
 * Token nierozpoznany pokazywany dosłownie (dane, nie literał UI).
 */
const UZIEMIENIE_PL: Record<string, string> = {
  isolated: 'punkt neutralny izolowany',
  petersen_coil: 'cewka Petersena (kompensacja ziemnozwarciowa)',
  directly_grounded: 'uziemiony bezpośrednio',
  resistor_grounded: 'uziemiony przez rezystor',
};

/** Mapuje token uziemienia ENM na polską nazwę (read-only, bez fizyki). */
export function uziemieniePL(token: string): string {
  return UZIEMIENIE_PL[token] ?? token;
}
