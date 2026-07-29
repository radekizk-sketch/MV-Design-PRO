/*
 * Teksty i deterministyczne formatery okna „Dobór kompensacji" (karta P42 / D8,
 * strumień OZE). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7); zero
 * literałów UI w JSX. Formatery CZYSTE (wejście→wyjście), bez `Date.now`/losowości
 * (Determinism Rule) — przecinek dziesiętny wg konwencji PL.
 *
 * WIĄŻĄCY WYMÓG WŁAŚCICIELA (V12K-040, opcja B): UI rozdziela DWIE wielkości cosφ
 * pod JEDNOZNACZNIE różnymi nazwami — „cosφ punktu kompensowanego" (podstawa doboru)
 * i „cosφ przekroju sieciowego" (wielkość informacyjna, przepływ sieci). Etykiety
 * poniżej NIGDY nie mylą tych dwóch pojęć.
 *
 * Nazwy sufiksowane `Komp`, bo barrel OZE robi `export *` (kolizje nazw, TS2308).
 */

export const KOMPENSACJA_STRINGS = {
  // Nagłówek okna
  tytul: 'Dobór kompensacji',
  opisWstep:
    'Która bateria kondensatorów z katalogu zapewnia wymagany współczynnik mocy '
    + 'w punkcie przyłączenia. Deterministyczny przegląd rekordów katalogu w rosnącej '
    + 'kolejności mocy — na tej samej ścieżce rozpływu, co pozostałe analizy. Wszystkie '
    + 'wartości pochodzą z backendu.',

  // Dobór węzła i parametrów
  paramWezel: 'Węzeł punktu przyłączenia',
  paramWezelWybierz: '— wybierz węzeł —',
  paramWezelOpis:
    'Co to jest: szyna, w której dobierana jest bateria kondensatorów. Skąd wartości: '
    + 'lista węzłów pochodzi ze snapshotu przebiegu rozpływu. Konsekwencja: kandydaci '
    + 'ograniczeni do baterii o napięciu znamionowym zgodnym z napięciem tej szyny.',
  paramCosfiMin: 'Wymagany cosφ (minimalny)',
  paramCosfiMinOpis:
    'Co to jest: docelowy minimalny współczynnik mocy w punkcie kompensowanym. Zakres '
    + 'typowy: 0,90–1,00. Skąd domyślna: typowy wymóg umowy przyłączeniowej (0,95). '
    + 'Konsekwencja: dobór wskazuje najmniejszą baterię, przy której cosφ punktu ≥ próg.',
  paramNoc: 'Uwzględnij scenariusz nocny',
  paramNocOpis:
    'Co to jest: dodatkowy przegląd z mocą czynną generatorów = 0 (moc bierna źródeł bez '
    + 'zmian). Konsekwencja: dobór musi spełniać wymóg cosφ zarówno w dzień, jak i w nocy.',

  // Przyciski biegu
  przyciskOblicz: 'Dobierz baterię',
  przyciskPrzelicz: 'Przelicz',

  // Stany uczciwe
  brakPrzebiegu: 'Brak zakończonego przebiegu rozpływu mocy',
  brakPrzebieguOpis:
    'Uruchom i zakończ obliczenie rozpływu mocy, aby dobrać baterię kompensacji dla '
    + 'wskazanego punktu przyłączenia.',
  brakWezlow: 'Brak węzłów w bieżącym modelu',
  brakWezlowOpis:
    'Snapshot przebiegu nie zawiera żadnej szyny. Zbuduj model sieci, aby dobrać '
    + 'kompensację.',
  idle: 'Wskaż węzeł punktu przyłączenia i wymagany cosφ, następnie uruchom dobór',
  idleOpis:
    'Jawny bieg przejrzy rekordy katalogu baterii rosnąco po mocy i wskaże najmniejszą '
    + 'spełniającą wymóg cosφ w punkcie kompensowanym.',
  ladowanie: 'Dobór baterii kompensacji…',
  blad: 'Nie udało się dobrać baterii kompensacji',

  // Nota rozdziału dwóch cosφ (wymóg właściciela) + konwencja kanoniczna
  notaCosfiTytul: 'Dwie odrębne wielkości cosφ',
  notaCosfiPunktu:
    'cosφ punktu kompensowanego — z lokalnego bilansu $Q_{\\mathrm{netto}} = Q_{\\mathrm{load}} - Q_{\\mathrm{cap\\,eff}}$. '
    + 'To NA NIM opiera się dobór baterii (kolumna decyzyjna, werdykt „spełnia").',
  notaCosfiPrzekroju:
    'cosφ przekroju sieciowego — cosφ przepływu mocy w przekroju sieci. Wielkość '
    + 'informacyjna; NIE jest miarą skompensowania odbioru i NIE steruje doborem.',
  notaKonwencjaTytul: 'Konwencja kanoniczna znaku',

  // Sekcja stanu wyjściowego (baseline)
  baselineTytul: 'Stan wyjściowy punktu (bez baterii)',
  baselineKomentarz:
    'Bez baterii $Q_{\\mathrm{cap\\,eff}} = 0$, więc cosφ punktu i cosφ przekroju są równe; obie '
    + 'wielkości pokazano jawnie, aby były rozróżnialne również w tabeli kandydatów.',
  baselineCosfiPunktuDzien: 'cosφ punktu kompensowanego (dzień)',
  baselineCosfiPunktuNoc: 'cosφ punktu kompensowanego (noc)',
  baselineCosfiPrzekrojuDzien: 'cosφ przekroju sieciowego (dzień)',
  baselineCosfiPrzekrojuNoc: 'cosφ przekroju sieciowego (noc)',

  // Tabela kandydatów
  tabelaTytul: 'Kandydaci z katalogu (rosnąco po mocy znamionowej)',
  kolRekord: 'Rekord katalogu',
  kolMoc: 'Moc znamionowa',
  kolQcapDzien: 'Q kompensacji efekt. (dzień)',
  kolQcapNoc: 'Q kompensacji efekt. (noc)',
  kolQnettoDzien: 'Q netto punktu (dzień)',
  kolQnettoNoc: 'Q netto punktu (noc)',
  // Kolumny DECYZYJNE — cosφ punktu kompensowanego (podstawa doboru):
  kolCosfiPunktuDzien: 'cosφ punktu kompensowanego (dzień)',
  kolCosfiPunktuNoc: 'cosφ punktu kompensowanego (noc)',
  // Kolumny INFORMACYJNE — cosφ przekroju sieciowego (nie steruje doborem):
  kolCosfiPrzekrojuDzien: 'cosφ przekroju sieciowego (dzień)',
  kolCosfiPrzekrojuNoc: 'cosφ przekroju sieciowego (noc)',
  kolWerdykt: 'Werdykt doboru',
  werdyktSpelnia: 'spełnia',
  werdyktNieSpelnia: 'nie spełnia',

  // Werdykt doboru
  doborTytul: 'Dobór baterii kompensacji',
  doborNaglowekOk: 'Dobrana bateria z katalogu',
  doborMoc: 'Moc znamionowa',
  doborNapiecie: 'Napięcie znamionowe',
  doborCosfiPunktuDzien: 'cosφ punktu kompensowanego po doborze (dzień)',
  doborCosfiPunktuNoc: 'cosφ punktu kompensowanego po doborze (noc)',
  doborCosfiPrzekrojuDzien: 'cosφ przekroju sieciowego po doborze (dzień)',
  doborCosfiPrzekrojuNoc: 'cosφ przekroju sieciowego po doborze (noc)',
  doborPodstawa:
    'Dobór sterowany wyłącznie wielkością cosφ punktu kompensowanego; cosφ przekroju '
    + 'sieciowego pokazany obok jako wielkość informacyjna.',
  brakDoboruTytul: 'Brak doboru',

  // Założenia
  zalWezel: 'Węzeł',
  zalNapiecie: 'Napięcie znamionowe szyny',
  zalCosfiMin: 'Wymagany cosφ (minimalny)',
  zalScenariuszNoc: 'Scenariusz nocny',
  zalScenariuszNocTak: 'uwzględniony',
  zalScenariuszNocNie: 'pominięty',
  zalLiczbaKandydatow: 'Liczba kandydatów z katalogu',
  zalPrzebieg: 'Identyfikator przebiegu',
  zalIdentyfikatorSkrot: 'Identyfikator wejścia (hash)',

  // Ślad WHITE BOX
  sladTytul: 'Ślad doboru (WHITE BOX)',
  sladPokaz: 'Pokaż ślad doboru',
  sladUkryj: 'Ukryj ślad doboru',
  sladSymbolPQ: 'źródło P/Q',
  sladSymbolCosfiPunktu: 'cosφ punktu',
  sladSymbolCosfiPrzekroju: 'cosφ przekroju',
  sladSymbolKonwencja: 'konwencja',
  sladSymbolDecyzja: 'decyzja',
  sladWzorPQ: 'P, Q punktu = wypadkowy przeplyw galezi zasilajacych (branch_results solvera)',
  sladWzorCosfiPunktu: 'cosfi_punktu = |P| / sqrt(P^2 + Q_netto^2); Q_netto = Q_load - Q_cap_eff',
  sladWzorCosfiPrzekroju: 'cosfi_przekroju = |P| / sqrt(P^2 + Q_przekroju^2)',
  sladWzorKonwencja: 'znak kanoniczny mocy (adapter interpretacyjny)',
  sladWzorDecyzja: 'rozstrzygniecie architektoniczne (PowerFlowResult FROZEN)',
  sladPodstawienieKandydaci: 'liczba kandydatow z katalogu',
  sladPodstawienieNoc: 'scenariusz nocny',
  sladNocPominiety: 'pominiety',

  // Jednostki i wartości puste
  jednMvar: 'Mvar',
  jednKv: 'kV',
  kreska: '—',
} as const;

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczbaKomp(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Współczynnik mocy cosφ — 4 miejsca po przecinku; brak danych → kreska. */
export function fmtCosfiKomp(n: number | null): string {
  return n === null ? KOMPENSACJA_STRINGS.kreska : fmtLiczbaKomp(n, 4);
}

/** Moc bierna [Mvar] — 3 miejsca po przecinku; brak danych → kreska. */
export function fmtMvarKomp(n: number | null): string {
  return n === null ? KOMPENSACJA_STRINGS.kreska : fmtLiczbaKomp(n, 3);
}

/** Napięcie [kV] — 2 miejsca po przecinku; brak danych → kreska. */
export function fmtKvKomp(n: number | null): string {
  return n === null ? KOMPENSACJA_STRINGS.kreska : fmtLiczbaKomp(n, 2);
}
