/*
 * Teksty i deterministyczne formatery okna „Estymacja stanu (WLS)" (ekran wyników
 * ui2/wyniki/estymacja). Wyłącznie polski język techniczny (MODEL_INTERAKCJI §2.7);
 * zero literałów UI w JSX; identyfikatory (run id, estimate_id, indeksy węzłów)
 * renderowane WYŁĄCZNIE w trybie eksperckim jako wyrażenia `{...}`. Formatery są
 * CZYSTE (wejście→wyjście), bez `Date.now`/losowości (Determinism Rule) —
 * przecinek dziesiętny wg konwencji PL.
 */

/** Poziom istotności statusu (dobór koloru tagu/chipu — wyłącznie prezentacja). */
export type IstotnoscStanu = 'ok' | 'warn' | 'err' | 'neutral';

export const ESTYMACJA_STRINGS = {
  // Nagłówek
  tytul: 'Estymacja stanu (WLS)',
  opisWstep:
    'Estymacja stanu metodą ważonych najmniejszych kwadratów (WLS) na podstawie '
    + 'gotowego przebiegu rozpływu mocy i pomiarów telemetrycznych (SCADA/PMU). '
    + 'Solver liczy estymowany stan (|V|, kąty), rezydua, χ² i detekcję złych danych; '
    + 'ekran tylko przyjmuje pomiary i prezentuje wynik — zero fizyki w UI.',
  runId: 'Identyfikator przebiegu',

  // Stan bez przebiegu rozpływu
  brakPrzebiegu: 'Brak zakończonego przebiegu rozpływu mocy',
  brakPrzebieguOpis:
    'Uruchom i zakończ obliczenie rozpływu mocy — dostarcza topologię sieci '
    + '(macierz Y-bus), na której estymowany jest stan z pomiarów.',

  // Pobieranie wymagań
  wymaganiaLadowanie: 'Wczytywanie wymaganych wejść estymacji…',
  wymaganiaBlad: 'Nie udało się wczytać wymaganych wejść estymacji stanu',

  // Panel „Wymagane wejścia"
  wymaganiaTytul: 'Wymagane wejścia',
  wymBazaMocy: 'Baza mocy',
  wymWezelBilansujacy: 'Węzeł bilansujący (slack)',
  wymLiczbaWezlow: 'Liczba węzłów',
  wymLiczbaStanow: 'Liczba stanów (|V|, kąty)',
  wymMinPomiarow: 'Minimalna liczba pomiarów',
  wymWezlyTytul: 'Węzły grafu (identyfikatory pomiarów)',
  wymKolWezel: 'Węzeł',
  wymKolIndeks: 'Indeks',
  wymKolNapiecie: 'Napięcie znamionowe',
  wymKolRola: 'Rola',
  rolaSlack: 'bilansujący',
  rolaZwykly: '—',

  // Edytor pomiarów
  pomiaryTytul: 'Pomiary telemetryczne (SCADA/PMU)',
  pomiaryOpis:
    'Wartości w jednostkach względnych (pu) na tej samej bazie mocy co Y-bus. '
    + 'Odchylenie standardowe σ musi być dodatnie. Pomiary przepływu (P_ij, Q_ij) '
    + 'wymagają węzła „do" gałęzi.',
  pomiarTyp: 'Typ pomiaru',
  pomiarWezel: 'Węzeł',
  pomiarWezelJ: 'Węzeł „do" (gałąź)',
  pomiarWartosc: 'Wartość [pu]',
  pomiarSigma: 'σ [pu]',
  pomiarWezelPusty: '— wybierz —',
  pomiarWezelJNiedotyczy: 'nie dotyczy',
  pomiarDodaj: 'Dodaj pomiar',
  pomiarUsun: 'Usuń',
  pomiarUsunAria: 'Usuń wiersz pomiaru',

  // Parametry detekcji złych danych
  parametryTytul: 'Parametry detekcji złych danych',
  parametryOpis:
    'Poziom istotności testu chi-kwadrat (α) i próg odrzucenia znormalizowanej '
    + 'rezyduy (LNR). Wartości domyślne: α = 0,01, próg LNR = 3.',
  paramAlfa: 'Poziom istotności α',
  paramProgLnr: 'Próg LNR',

  // Akcja
  estymuj: 'Estymuj',
  estymujPonownie: 'Estymuj ponownie',

  // Stany biegu
  ladowanie: 'Trwa estymacja stanu…',
  blad: 'Nie udało się wykonać estymacji stanu',

  // Błędy walidacji (przed wysłaniem)
  bledyTytul: 'Uzupełnij dane przed estymacją',
  bladBrakPomiarow:
    'Dodaj co najmniej jeden pomiar (typ, węzeł, wartość i σ). Estymacja stanu '
    + 'wymaga pomiarów telemetrycznych — bez nich obliczenie jest niemożliwe.',
  bladWezel: 'wskaż węzeł pomiaru.',
  bladWartosc: 'podaj liczbową wartość pomiaru.',
  bladSigma: 'σ musi być liczbą dodatnią.',
  bladWezelJ: 'pomiar przepływu wymaga węzła „do" gałęzi.',
  bladWezelJRowny: 'węzeł „do" musi być inny niż węzeł pomiaru.',
  bladAlfa: 'Poziom istotności α musi być liczbą z przedziału (0; 1).',
  bladProgLnr: 'Próg LNR musi być liczbą dodatnią.',

  // Podsumowanie wyniku (chipy)
  podsumZbieznosc: 'Zbieżność',
  podsumIteracje: 'Iteracje',
  podsumChi: 'χ² J(x̂)',
  podsumStopnie: 'Stopnie swobody',
  podsumPomiary: 'Pomiary',
  podsumStany: 'Stany',
  zbieznyTak: 'zbieżny',
  zbieznyNie: 'brak zbieżności',

  // Panel detekcji złych danych
  badTytul: 'Detekcja złych danych',
  badTestChi: 'Test χ²',
  badTestChiWykryto: 'wykryto obecność złych danych',
  badTestChiBrak: 'brak wykrycia (dane spójne)',
  badChiWartosc: 'Wartość χ²',
  badChiProg: 'Próg χ²',
  badLnr: 'Największa znormalizowana rezydua (LNR)',
  badLnrProg: 'Próg LNR',
  badLnrPrzekroczony: 'przekroczony — pomiar podejrzany',
  badLnrOk: 'w normie',
  badPodejrzany: 'Pomiar podejrzany',
  badBrakPodejrzanego: 'Brak podejrzanego pomiaru.',

  // Braki danych (uczciwość)
  brakiTytul: 'Węzły bez pomiaru',
  brakiOpis:
    'Węzły, których nie dotyczy żaden pomiar (obserwowalne pośrednio przez model). '
    + 'Nie są to błędy — układ pozostaje obserwowalny.',

  // Tabela estymowanego stanu (węzły)
  wezlyTytul: 'Estymowany stan węzłów',
  kolWezel: 'Węzeł',
  kolNapiecieZnam: 'Napięcie znam.',
  kolModul: '|V|',
  kolKat: 'Kąt',
  kolRola: 'Rola',
  kolIndeksWezla: 'Indeks węzła',

  // Tabela pomiarów (rezydua)
  pomiaryWynikTytul: 'Rezydua pomiarów',
  kolTypPomiaru: 'Typ pomiaru',
  kolWezelPomiaru: 'Węzeł',
  kolWezelJ: 'Węzeł „do"',
  kolWartoscPomiaru: 'Wartość',
  kolSigma: 'σ',
  kolRezyduum: 'Rezyduum r',
  kolRezyduumZnorm: 'Rezyduum znorm. r_N',
  kolFlaga: 'Flaga',
  flagaPodejrzany: 'podejrzany',
  flagaOk: '—',

  // Ślad WHITE BOX (tryb ekspercki)
  sladTytul: 'Ślad obliczeń WLS (WHITE BOX)',
  sladPokaz: 'Pokaż ślad obliczeń',
  sladUkryj: 'Ukryj ślad obliczeń',
  sladKolIteracja: 'Iteracja',
  sladKolChi: 'χ² J(x)',
  sladKolMaxRez: 'max |r|',
  sladKolNormKroku: 'Norma kroku ‖Δx‖',
  sladMacierze:
    'Jakobian H, macierz zysku G, wektor rezyduów r, przyrost Δx i stan x '
    + 'dostępne w każdej iteracji śladu (kontrakt WHITE BOX).',
  ekspEstymateId: 'Identyfikator estymaty',
  ekspWersjaSolvera: 'Wersja solvera',
  ekspWalidacja: 'Status walidacji',

  // Baner walidacji syntetycznej (widoczny niezależnie od trybu — WLS-S3)
  banerSyntetycznyTytul: 'Walidacja syntetyczna (nie SCADA/PMU)',
  banerSyntetycznyOpis:
    'Backend zwrócił status walidacji SYNTETYCZNY — estymata została sprawdzona '
    + 'względem płaskiego stanu odniesienia, a nie względem rzeczywistej telemetrii '
    + 'SCADA/PMU. Wynik nadaje się do analizy metody i topologii, nie do rozliczeń '
    + 'ani decyzji ruchowych opartych na realnym stanie sieci.',

  // Założenia
  zalMetoda: 'Metoda',
  zalMetodaWartosc: 'Ważone najmniejsze kwadraty (WLS), IEC/PowerFactory',
  zalBazaMocy: 'Baza mocy',
  zalSlack: 'Węzeł bilansujący (slack)',
  zalAlfa: 'Poziom istotności α',
  zalProgLnr: 'Próg LNR',

  // Jednostki i wartości puste
  jednPu: 'pu',
  jednKV: 'kV',
  jednStopnie: '°',
  jednMva: 'MVA',
  kreska: '—',
} as const;

/** Jawny znacznik SYNTETYCZNEJ walidacji z backendu (nie mylić z SCADA/PMU). */
export const ZNACZNIK_SYNTETYCZNY = 'SYNTETYCZNY';

// ---------------------------------------------------------------------------
// Formatery deterministyczne (przecinek dziesiętny PL)
// ---------------------------------------------------------------------------

/** Format liczby z przecinkiem dziesiętnym (deterministyczny). */
export function fmtLiczba(n: number, miejsca: number): string {
  return n.toFixed(miejsca).replace('.', ',');
}

/** Moduł napięcia |V| [pu] — 4 miejsca po przecinku. */
export function fmtPu(n: number): string {
  return fmtLiczba(n, 4);
}

/** Kąt napięcia [°] — 2 miejsca po przecinku. */
export function fmtStopnie(n: number): string {
  return fmtLiczba(n, 2);
}

/** Napięcie znamionowe [kV] — 1 miejsce po przecinku. */
export function fmtKV(n: number): string {
  return fmtLiczba(n, 1);
}

/** Rezyduum / σ [pu] — 4 miejsca po przecinku. */
export function fmtRezyduum(n: number): string {
  return fmtLiczba(n, 4);
}

/**
 * Wartość precyzyjna (χ², norma kroku) — 4 cyfry znaczące, deterministycznie.
 * `toPrecision` jest deterministyczne; `parseFloat` usuwa zbędne zera końcowe.
 */
export function fmtDokladny(n: number): string {
  if (n === 0) return '0';
  const p = Number.parseFloat(n.toPrecision(4));
  return String(p).replace('.', ',');
}

/** Istotność zbieżności (dobór koloru chipu). */
export function istotnoscZbieznosci(converged: boolean): IstotnoscStanu {
  return converged ? 'ok' : 'err';
}
