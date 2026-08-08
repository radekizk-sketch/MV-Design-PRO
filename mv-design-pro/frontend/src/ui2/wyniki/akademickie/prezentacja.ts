/*
 * PROJEKT EKRANU analiz specjalistycznych V12.6 — warstwa prezentacji wyniku
 * (ui2/wyniki/akademickie). Powstała po ocenie właściciela 0/10 z 2026-08-07:
 * okno pokazywało projektantowi ZRZUT SŁOWNIKA odpowiedzi backendu — ścieżki
 * kluczy jako podpisy (`modal_analysis.critical_mode.participating_buses[0]`),
 * angielszczyznę (`smallest_eigenvalue`, `alert`, `sanity`), surowe referencje
 * (`gpz/8600…/section/001/bus_sn`) i liczby bez jednostek ani kryterium.
 *
 * Ten plik jest ODPOWIEDZIĄ NA PYTANIE INŻYNIERSKIE, nie mapą kluczy: dla każdego
 * rodzaju analizy deklaruje CO ANALIZA ROZSTRZYGA, KTÓRA wielkość jest werdyktem,
 * WOBEC JAKIEGO kryterium się ją ocenia, jakie wielkości są pomocnicze i w jakich
 * jednostkach. Kompletność wyprowadzona z KODU SOLVERA
 * (`backend/src/network_model/solvers/v126_academic.py`) i kontraktu
 * `V126AnalysisType` — nie z wygody UI.
 *
 * ZERO FIZYKI I ZERO OCEN (CLAUDE.md): werdykt jest CYTATEM pola statusu
 * z odpowiedzi solvera (`odczytaj` + `mapaWerdyktu`), nigdy porównaniem liczb
 * w UI. Tekst kryterium jest OPISEM reguły, którą stosuje solver — służy
 * projektantowi do zrozumienia werdyktu, a nie do jego wyliczenia. Tam, gdzie
 * solver zwraca wartość dopuszczalną (np. `u_touch_allowable_v`), pokazujemy ją
 * jako wartość odniesienia obok wielkości — także wprost z odpowiedzi.
 *
 * ROZSTRZYGNIĘCIE O UCZCIWOŚCI: rodzaje, dla których solver NIE wystawia progu
 * normatywnego (straty/LCC, niepewność, niezawodność), mają `kryterium` mówiące
 * to WPROST — „wielkość projektowa, solver nie wystawia progu normatywnego".
 * Fabrykowanie progu w UI byłoby fizyką w prezentacji.
 *
 * V126-WYGASZENIE (decyzja właściciela 2026-08-07): zbiór rodzajów tego pliku to
 * rodzaje PREZENTOWANE, a nie komplet kontraktu backendu. Rodzaj wycofany z toru
 * projektanta ma wpis z powodem w `nieprezentowane.ts`; parytet
 * „prezentowane + nieprezentowane = komplet" pilnuje strażnik CI backendu.
 * Wycofano też margines obciążalności P–U ze stabilności napięciowej — wielkość
 * bez progu to jeszcze nie powód do wycofania, ale wielkość z przybliżenia
 * o zaszytych stałych, podana jako wynik obliczeń, już tak.
 */

import type { RodzajPrezentowany } from './nieprezentowane';
import type { IstotnoscStanu } from './strings';

// ---------------------------------------------------------------------------
// Odczyt wartości po ścieżce (czysta funkcja, bez zgadywania)
// ---------------------------------------------------------------------------

/**
 * Odczytuje wartość z ładunku wyniku po ścieżce w notacji `a.b[0].c`.
 * Zwraca `undefined`, gdy któregokolwiek ogniwa nie ma — okno pokazuje wtedy
 * uczciwą kreskę, NIGDY wartości podstawionej.
 */
export function odczytaj(payload: unknown, sciezka: string): unknown {
  if (sciezka === '') return payload;
  const segmenty = sciezka.replace(/\[(\d+)\]/g, '.$1').split('.');
  let biezaca: unknown = payload;
  for (const segment of segmenty) {
    if (biezaca === null || biezaca === undefined) return undefined;
    if (Array.isArray(biezaca)) {
      const indeks = Number(segment);
      if (!Number.isInteger(indeks)) return undefined;
      biezaca = biezaca[indeks];
      continue;
    }
    if (typeof biezaca !== 'object') return undefined;
    biezaca = (biezaca as Record<string, unknown>)[segment];
  }
  return biezaca;
}

// ---------------------------------------------------------------------------
// Kontrakt prezentacji rodzaju
// ---------------------------------------------------------------------------

/** Mapa wartości statusu solvera → polski tekst werdyktu i jego istotność. */
export type MapaWerdyktu = Readonly<
  Record<string, { readonly tekst: string; readonly istotnosc: IstotnoscStanu }>
>;

/**
 * Werdykt pojedynczy — pole statusu w ładunku wyniku.
 *
 * `sciezki` jest LISTĄ, bo jeden rodzaj analizy potrafi wystawić werdykt pod
 * różnymi kluczami w zależności od kompletności danych: dobór uziemienia punktu
 * neutralnego melduje `tuning_status` po udanym doborze, a `status`
 * („dane niekompletne") gdy brakuje susceptancji doziemnej gałęzi. Pierwsza
 * OBECNA ścieżka wygrywa — okno nie zgaduje i nie podstawia werdyktu.
 */
export interface WerdyktPojedynczy {
  readonly rodzaj: 'pojedynczy';
  readonly sciezki: readonly string[];
  readonly mapa: MapaWerdyktu;
}

/**
 * Werdykt zbiorczy — status jest POWTÓRZONY w każdym elemencie tablicy
 * (np. status zgodności per węzeł). Okno NIE liczy tu fizyki: zlicza wystąpienia
 * wartości statusu, tak jak licznik wierszy tabeli.
 */
export interface WerdyktZbiorczy {
  readonly rodzaj: 'zbiorczy';
  /** Ścieżka tablicy obiektów. */
  readonly sciezkaTablicy: string;
  /** Klucz pola statusu wewnątrz elementu tablicy. */
  readonly kluczStatusu: string;
  readonly mapa: MapaWerdyktu;
  /** Wartość statusu uznawana za spełnienie kryterium (do zdania zbiorczego). */
  readonly wartoscSpelniona: string;
  /** Rzeczownik obiektów w dopełniaczu mnogim, np. „węzłów", „aparatów". */
  readonly obiektyDopelniacz: string;
}

/** Werdykt liczbowy — wielkość wynikowa BEZ progu normatywnego w solverze. */
export interface WerdyktLiczbowy {
  readonly rodzaj: 'liczbowy';
  readonly sciezka: string;
  readonly jednostka: string;
}

export type WerdyktRodzaju = WerdyktPojedynczy | WerdyktZbiorczy | WerdyktLiczbowy;

/** Wielkość główna ekranu — liczba z jednostką i (gdy solver ją zwraca) odniesieniem. */
export interface WielkoscGlowna {
  readonly sciezka: string;
  readonly etykieta: string;
  readonly jednostka?: string;
  /** Ścieżka wartości dopuszczalnej/odniesienia — WYŁĄCZNIE z odpowiedzi solvera. */
  readonly odniesienieSciezka?: string;
  /** Etykieta odniesienia, np. „dopuszczalne", „tolerancja". */
  readonly odniesienieEtykieta?: string;
}

/** Kolumna tabeli obiektów. */
export interface KolumnaObiektu {
  readonly klucz: string;
  readonly etykieta: string;
  readonly jednostka?: string;
  /** Kolumna statusu — renderowana jako chip werdyktu wg `mapa`. */
  readonly mapaStatusu?: MapaWerdyktu;
}

/** Tabela obiektów analizy (per węzeł / gałąź / aparat / silnik). */
export interface TabelaObiektow {
  readonly sciezka: string;
  readonly tytul: string;
  /** Klucz pola z referencją obiektu — podstawa mostu ref → nazwa na schemacie. */
  readonly kluczRef: string;
  /** Nagłówek kolumny obiektu, np. „Szyna", „Gałąź", „Silnik". */
  readonly etykietaRef: string;
  readonly kolumny: readonly KolumnaObiektu[];
  /**
   * Kolumna obiektu niesie parametr w postaci `<referencja>.<klucz parametru>`
   * (ranking niepewności). Okno rozbija ją na nazwę obiektu i polską nazwę
   * parametru — inaczej ranking pokazuje ścieżkę klucza, czyli kod produkcyjny.
   */
  readonly refZParametrem?: boolean;
}

/** Kompletny projekt prezentacji jednego rodzaju analizy. */
export interface PrezentacjaRodzaju {
  /** Co ta analiza rozstrzyga — jedno zdanie, język inżynierski. */
  readonly pytanie: string;
  /** Wobec czego oceniany jest werdykt (norma albo uczciwe „brak progu"). */
  readonly kryterium: string;
  /** Norma/źródło metody — pokazywane przy kryterium. */
  readonly norma?: string;
  readonly werdykt: WerdyktRodzaju;
  readonly wielkosciGlowne: readonly WielkoscGlowna[];
  readonly tabele: readonly TabelaObiektow[];
  /** Jawny następny krok projektanta po odczytaniu werdyktu. */
  readonly nastepnyKrok: string;
}

// ---------------------------------------------------------------------------
// Wspólne mapy werdyktów (słownictwo statusów solvera V12.6)
// ---------------------------------------------------------------------------

const ZGODNY: MapaWerdyktu = {
  zgodny: { tekst: 'spełnione', istotnosc: 'ok' },
  niezgodny: { tekst: 'niespełnione', istotnosc: 'err' },
};

const SPELNIONY: MapaWerdyktu = {
  spelniony: { tekst: 'spełnione', istotnosc: 'ok' },
  niespelniony: { tekst: 'niespełnione', istotnosc: 'err' },
};

/** Blok wiarygodności `sanity` — wspólny dla wszystkich rodzajów (K-08). */
export const MAPA_WIARYGODNOSCI: MapaWerdyktu = {
  zweryfikowany: { tekst: 'wyniki wiarygodne', istotnosc: 'ok' },
  'poza zakresem wiarygodności': {
    tekst: 'wynik poza zakresem wiarygodności',
    istotnosc: 'err',
  },
  'dane niekompletne': { tekst: 'dane niekompletne', istotnosc: 'warn' },
};

// ---------------------------------------------------------------------------
// PROJEKT — rodzaje kontraktu `V126AnalysisType` PREZENTOWANE projektantowi
// ---------------------------------------------------------------------------

/**
 * Zbiór ZAMKNIĘTY typem `Record<RodzajPrezentowany, …>`: rodzaj dodany w
 * kontrakcie backendu bez projektu ekranu NIE SKOMPILUJE SIĘ — trafi do
 * `RodzajPrezentowany` (dopełnienie rejestru wycofań) i zabraknie go tutaj.
 * Jedyna droga ominięcia to świadomy wpis z powodem w `nieprezentowane.ts`,
 * a nie ciche pominięcie.
 *
 * Strażnik prezentacji (`__tests__/prezentacja.straznik.test.tsx`) sprawdza drugi
 * koniec pary — że każdy prezentowany rodzaj renderuje się BEZ kodów
 * produkcyjnych na ekranie; parytet z kontraktem backendu
 * (`prezentowane + nieprezentowane = komplet`) pilnuje
 * `backend/tests/ci/test_v126_rodzaje_parytet.py`.
 */
export const PREZENTACJA: Record<RodzajPrezentowany, PrezentacjaRodzaju> = {
  // -------------------------------------------------------------------------
  power_quality_harmonics: {
    pytanie:
      'Czy odkształcenie napięcia i prądu w węzłach sieci mieści się w granicach '
      + 'kompatybilności elektromagnetycznej?',
    kryterium:
      'Współczynnik odkształcenia napięcia THD_U ≤ 8 % (PN-EN 50160) i ≤ 5 % '
      + '(IEEE 519); odkształcenie prądu odbiorcy TDD ≤ 5 % (IEEE 519).',
    norma: 'PN-EN 50160 · IEEE 519',
    werdykt: {
      rodzaj: 'zbiorczy',
      sciezkaTablicy: 'nodes',
      kluczStatusu: 'compatibility_status',
      mapa: ZGODNY,
      wartoscSpelniona: 'zgodny',
      obiektyDopelniacz: 'węzłów',
    },
    wielkosciGlowne: [],
    tabele: [
      {
        sciezka: 'nodes',
        tytul: 'Odkształcenie w węzłach sieci',
        kluczRef: 'bus_ref',
        etykietaRef: 'Szyna',
        kolumny: [
          { klucz: 'thd_u_percent', etykieta: 'Odkształcenie napięcia THD_U', jednostka: '%' },
          { klucz: 'tdd_percent', etykieta: 'Odkształcenie prądu TDD', jednostka: '%' },
          { klucz: 'k_factor', etykieta: 'Współczynnik K (obciążenie transformatora)' },
          {
            klucz: 'compatibility_status',
            etykieta: 'Kryterium kompatybilności',
            mapaStatusu: ZGODNY,
          },
        ],
      },
    ],
    nastepnyKrok:
      'Przy przekroczeniu limitu: sprawdź rezonanse w skanie impedancji węzła, '
      + 'a następnie dobierz filtr harmonicznych albo zmień punkt przyłączenia źródła '
      + 'odkształcającego w modelu sieci.',
  },

  // -------------------------------------------------------------------------
  ssci_impedance: {
    pytanie:
      'Czy przekształtnik przyłączony do sieci o danej sztywności nie wejdzie '
      + 'w interakcję podsynchroniczną (rezonans regulacyjny)?',
    kryterium:
      'Werdykt stabilności wg kryterium impedancyjnego Nyquista wystawia okno '
      + '„Stabilność SSCI" — ma własny kontrakt odpowiedzi i własny model prezentacji. '
      + 'Tutaj dostępne są wyłącznie tablice impedancji, z których ten werdykt powstaje.',
    norma: 'kryterium impedancyjne Nyquista (Sun 2011 / Wen 2016)',
    werdykt: {
      rodzaj: 'pojedynczy',
      sciezki: ['sanity.status'],
      mapa: MAPA_WIARYGODNOSCI,
    },
    wielkosciGlowne: [],
    tabele: [],
    nastepnyKrok:
      'Przejdź do okna „Stabilność SSCI" po werdykt Nyquista dla wybranego '
      + 'przekształtnika i węzła przyłączenia.',
  },

  // -------------------------------------------------------------------------
  /*
   * STABILNOŚĆ NAPIĘCIOWA — RODZAJ WYCOFANY Z EKRANU (karta QU-FABRYKACJA,
   * 2026-08-08). Projekt ekranu USUNIĘTY, wpis przeniesiony do rejestru
   * `nieprezentowane.ts` z powodem merytorycznym.
   *
   * DLACZEGO CAŁY RODZAJ, A NIE KOLEJNA TABELA. Karta V126-WYGASZENIE zdjęła
   * stąd rodzinę P–U i zostawiła wskaźnik L, bo „ma jawne kryterium", oraz zapas
   * mocy biernej (krzywa Q–U). Pomiar karty QU-FABRYKACJA pokazał, że KAŻDA
   * z pozostałych wielkości stała na tym samym gruncie:
   *   · zapas Q–U — zdolność wytwórcza brana jako 0,15 · P, zapotrzebowanie jako
   *     0,35 · P, choć `bus.load_mvar` jest w kontrakcie i jest używane obok;
   *     zdolności wytwórczej mocy biernej kontrakt nie niesie w ogóle. Nazwa
   *     „krzywa Q–U" była fałszywym rodowodem — we wzorze nie było napięcia;
   *   · wskaźnik L — `P/S_sc · 4`, mnożnik bez pokrycia w danych i w normie;
   *   · wartość własna — pochodna wskaźnika L, ważona napięciem, które model
   *     wypełnia wartością domyślną kontraktu;
   *   · wspólne wejście wszystkich — moc zwarciowa węzła — podane dla 1 z 315
   *     szyn sieci odniesienia, dla reszty podstawiane z napięcia znamionowego.
   *
   * Solver przestał je wyznaczać (wersja 1.2): pola kontraktu zostają, wartością
   * jest `null` z powodem po polsku. Ekran bez ani jednej liczby to nie jest
   * uczciwy stan zerowy, tylko pusty ekran — dlatego rodzaj schodzi z toru
   * projektanta, a nie zostaje z samymi kreskami.
   *
   * POWRÓT NA EKRAN wymaga POLICZENIA wielkości, nie przywrócenia tabel:
   * krzywa P–U z rozpływu, wskaźnik L z macierzy admitancyjnej przy zbieżnym
   * rozpływie, zdolność wytwórcza mocy biernej doprowadzona do kontraktu
   * wejściowego (`GenLimits` → most ENM→V12.6). Rejestr: QU-FABRYKACJA.
   */


  // -------------------------------------------------------------------------
  reliability_contingency: {
    pytanie:
      'Jak często i jak długo odbiorcy pozostaną bez zasilania i który element '
      + 'sieci jest najgroźniejszy przy awarii?',
    kryterium:
      'Obciążenie gałęzi po wyłączeniu pojedynczego elementu (N-1) ≤ 100 % '
      + 'obciążalności. Wskaźniki SAIDI/SAIFI są wielkościami projektowymi — solver '
      + 'nie wystawia dla nich progu normatywnego (wartości docelowe określa operator).',
    norma: 'IEEE 1366 (definicje wskaźników); kryterium N-1',
    werdykt: {
      rodzaj: 'pojedynczy',
      sciezki: ['sanity.status'],
      mapa: MAPA_WIARYGODNOSCI,
    },
    wielkosciGlowne: [
      {
        sciezka: 'indices.saidi_min_per_year',
        etykieta: 'Średni czas przerw na odbiorcę (SAIDI)',
        jednostka: 'min/rok',
      },
      {
        sciezka: 'indices.saifi_per_year',
        etykieta: 'Średnia liczba przerw na odbiorcę (SAIFI)',
        jednostka: '1/rok',
      },
      {
        sciezka: 'indices.caidi_min_per_interruption',
        etykieta: 'Średni czas trwania jednej przerwy (CAIDI)',
        jednostka: 'min',
      },
      {
        sciezka: 'indices.maifi_per_year',
        etykieta: 'Średnia liczba przerw krótkich (MAIFI)',
        jednostka: '1/rok',
      },
    ],
    tabele: [
      {
        sciezka: 'contingency_ranking',
        tytul: 'Ranking awarii wg dotkliwości',
        kluczRef: 'contingency',
        etykietaRef: 'Wyłączany element',
        kolumny: [
          { klucz: 'order', etykieta: 'Rodzaj awarii' },
          { klucz: 'severity', etykieta: 'Dotkliwość (wskaźnik rankingowy)' },
          { klucz: 'max_loading_percent', etykieta: 'Obciążenie gałęzi po awarii', jednostka: '%' },
        ],
      },
    ],
    nastepnyKrok:
      'Element z czoła rankingu zabezpiecz rezerwą: punkt podziału do przełączenia, '
      + 'drugie zasilanie albo skrócenie czasu odtworzenia (automatyka SZR).',
  },

  // -------------------------------------------------------------------------
  earthing_safety: {
    pytanie:
      'Czy przy zwarciu doziemnym napięcia rażenia na terenie stacji nie zagrażają '
      + 'człowiekowi?',
    kryterium:
      'Napięcie dotykowe rażeniowe ≤ dopuszczalne i napięcie krokowe ≤ dopuszczalne, '
      + 'przy zmierzonym czasie wyłączenia zwarcia. Wartości dopuszczalne liczy solver '
      + 'z rezystywności warstwy powierzchniowej i czasu wyłączenia.',
    norma: 'IEEE 80 (metoda Sverak) · PN-EN 50522',
    werdykt: {
      rodzaj: 'pojedynczy',
      sciezki: ['safety_status'],
      mapa: {
        bezpieczny: { tekst: 'uziom bezpieczny', istotnosc: 'ok' },
        wymaga_ochrony: {
          tekst: 'przekroczenie do 25 % — wymagane środki dodatkowe',
          istotnosc: 'warn',
        },
        niezgodny: { tekst: 'uziom niezgodny — napięcia rażenia przekroczone', istotnosc: 'err' },
      },
    },
    wielkosciGlowne: [
      {
        sciezka: 'u_touch_calculated_v',
        etykieta: 'Napięcie dotykowe rażeniowe',
        jednostka: 'V',
        odniesienieSciezka: 'u_touch_allowable_v',
        odniesienieEtykieta: 'dopuszczalne',
      },
      {
        sciezka: 'u_step_calculated_v',
        etykieta: 'Napięcie krokowe',
        jednostka: 'V',
        odniesienieSciezka: 'u_step_allowable_v',
        odniesienieEtykieta: 'dopuszczalne',
      },
      { sciezka: 'r_g_ohm', etykieta: 'Rezystancja uziomu stacji', jednostka: 'Ω' },
      { sciezka: 'gpr_kv', etykieta: 'Wzrost potencjału uziomu (GPR)', jednostka: 'kV' },
      { sciezka: 'i_g_ka', etykieta: 'Prąd odprowadzany przez uziom', jednostka: 'kA' },
      { sciezka: 'split_factor', etykieta: 'Współczynnik podziału prądu zwarciowego' },
      { sciezka: 'fault_clearing_time_s', etykieta: 'Czas wyłączenia zwarcia', jednostka: 's' },
    ],
    tabele: [],
    nastepnyKrok:
      'Przy przekroczeniu: zagęść siatkę uziomową, dołóż uziomy pionowe albo ułóż '
      + 'warstwę tłucznia o wyższej rezystywności — i przelicz ponownie.',
  },

  // -------------------------------------------------------------------------
  insulation_coordination: {
    pytanie:
      'Czy dobrane ograniczniki przepięć chronią izolację aparatów z wymaganym '
      + 'zapasem?',
    kryterium:
      'Margines ochrony izolacji ≥ 20 % względem napięcia obniżonego ogranicznika '
      + 'przy prądzie 10 kA oraz przewidywane przepięcie dorywcze ≤ napięcie znamionowe '
      + 'ogranicznika.',
    norma: 'IEC 60071 (koordynacja izolacji)',
    werdykt: {
      rodzaj: 'zbiorczy',
      sciezkaTablicy: 'arresters',
      kluczStatusu: 'verification_status',
      mapa: SPELNIONY,
      wartoscSpelniona: 'spelniony',
      obiektyDopelniacz: 'miejsc zainstalowania ograniczników',
    },
    wielkosciGlowne: [],
    tabele: [
      {
        sciezka: 'arresters',
        tytul: 'Ograniczniki przepięć i margines ochrony izolacji',
        kluczRef: 'location_bus_ref',
        etykietaRef: 'Miejsce zainstalowania',
        kolumny: [
          { klucz: 'u_m_kv', etykieta: 'Najwyższe napięcie urządzenia', jednostka: 'kV' },
          { klucz: 'mcov_kv', etykieta: 'Trwałe dopuszczalne napięcie pracy', jednostka: 'kV' },
          { klucz: 'u_rated_kv', etykieta: 'Napięcie znamionowe ogranicznika', jednostka: 'kV' },
          {
            klucz: 'u_residual_at_10ka_kv',
            etykieta: 'Napięcie obniżone przy 10 kA',
            jednostka: 'kV',
          },
          {
            klucz: 'bil_protected_kv',
            etykieta: 'Wytrzymałość udarowa piorunowa izolacji',
            jednostka: 'kV',
          },
          { klucz: 'predicted_tov_kv', etykieta: 'Przewidywane przepięcie dorywcze', jednostka: 'kV' },
          { klucz: 'bil_margin_percent', etykieta: 'Margines ochrony izolacji', jednostka: '%' },
          {
            klucz: 'verification_status',
            etykieta: 'Kryterium ≥ 20 %',
            mapaStatusu: SPELNIONY,
          },
        ],
      },
    ],
    nastepnyKrok:
      'Miejsce bez wymaganego marginesu: dobierz ogranicznik o niższym napięciu '
      + 'obniżonym albo skróć odległość ochronną między ogranicznikiem a aparatem.',
  },

  // -------------------------------------------------------------------------
  earth_fault_detection: {
    pytanie:
      'Jaką metodą wykryć zwarcie doziemne przy danym sposobie uziemienia punktu '
      + 'neutralnego i czy przekaźnik w polu ją obsługuje?',
    kryterium:
      'Metoda zalecana dla danego sposobu uziemienia punktu neutralnego musi być '
      + 'dostępna w wyposażeniu przekaźnika. Nastawa rozruchowa napięcia zerowego '
      + 'w zakresie (0; 100] % napięcia fazowego.',
    norma: 'praktyka sieci SN kompensowanych i uziemionych przez rezystor',
    werdykt: {
      rodzaj: 'pojedynczy',
      sciezki: ['relay_support_status'],
      mapa: {
        spelniony: { tekst: 'przekaźnik obsługuje zalecaną metodę', istotnosc: 'ok' },
        brak_w_przekazniku: {
          tekst: 'zalecanej metody brak w przekaźniku',
          istotnosc: 'err',
        },
      },
    },
    wielkosciGlowne: [
      { sciezka: 'neutral_grounding', etykieta: 'Sposób uziemienia punktu neutralnego' },
      { sciezka: 'recommended_method', etykieta: 'Metoda zalecana' },
      { sciezka: 'alternative_method', etykieta: 'Metoda alternatywna' },
      {
        sciezka: 'settings.u0_start_percent',
        etykieta: 'Nastawa rozruchowa napięcia zerowego',
        jednostka: '%',
      },
      { sciezka: 'settings.p0_set_w', etykieta: 'Nastawa mocy czynnej zerowej', jednostka: 'W' },
      {
        sciezka: 'settings.i5_multiplier',
        etykieta: 'Krotność rozruchu 5. harmonicznej',
        jednostka: '×',
      },
    ],
    tabele: [],
    nastepnyKrok:
      'Brak metody w przekaźniku: dobierz przekaźnik z wymaganą funkcją albo zmień '
      + 'sposób uziemienia punktu neutralnego (analiza „Dobór uziemienia punktu neutralnego").',
  },

  // -------------------------------------------------------------------------
  transient_trv: {
    pytanie:
      'Czy napięcie powrotne po przerwaniu prądu zwarciowego mieści się pod '
      + 'obwiednią wytrzymałości wyłącznika?',
    kryterium:
      'Margines napięcia powrotnego ≥ 10 % względem obwiedni wytrzymałości '
      + 'wyłącznika w całym przebiegu czasowym.',
    norma: 'IEC 62271-100 (obwiednia napięcia powrotnego)',
    werdykt: {
      rodzaj: 'pojedynczy',
      sciezki: ['trv_status'],
      mapa: SPELNIONY,
    },
    wielkosciGlowne: [
      {
        sciezka: 'trv_margin_percent',
        etykieta: 'Najmniejszy margines napięcia powrotnego',
        jednostka: '%',
      },
      {
        sciezka: 'inrush.peak_multiple_in',
        etykieta: 'Krotność prądu załączenia transformatora',
        jednostka: '× I_n',
      },
      {
        sciezka: 'inrush.second_harmonic_percent_of_peak',
        etykieta: 'Udział 2. harmonicznej w prądzie załączenia',
        jednostka: '%',
      },
      {
        sciezka: 'inrush.blocking_87t_recommended',
        etykieta: 'Zalecana blokada różnicowej od 2. harmonicznej',
      },
      { sciezka: 'ferroresonance.risk', etykieta: 'Ryzyko ferrorezonansu' },
      { sciezka: 'ferroresonance.recommendation', etykieta: 'Zalecenie wobec ferrorezonansu' },
    ],
    tabele: [],
    nastepnyKrok:
      'Brak marginesu: dobierz wyłącznik o wyższej wytrzymałości napięcia powrotnego '
      + 'albo dołóż kondensator ograniczający stromość narastania.',
  },

  // -------------------------------------------------------------------------
  motor_starting: {
    pytanie:
      'Czy silnik ruszy pod obciążeniem i czy jego rozruch nie zapadnie napięcia '
      + 'na szynie poniżej dopuszczalnego?',
    kryterium:
      'Zapad napięcia na szynie ≤ 15 %, wskaźnik cieplny rozruchu I²t ≤ 1 (czas '
      + 'rozruchu w granicy czasu utyku) oraz moment rozruchowy większy od momentu '
      + 'oporowego maszyny napędzanej.',
    norma: 'kryteria rozruchowe silników SN (zapad napięcia, czas utyku)',
    werdykt: {
      rodzaj: 'zbiorczy',
      sciezkaTablicy: 'motors',
      kluczStatusu: 'verification_status',
      mapa: ZGODNY,
      wartoscSpelniona: 'zgodny',
      obiektyDopelniacz: 'silników',
    },
    wielkosciGlowne: [],
    tabele: [
      {
        sciezka: 'motors',
        tytul: 'Rozruch silników',
        kluczRef: 'motor_ref',
        etykietaRef: 'Silnik',
        kolumny: [
          { klucz: 'bus_ref', etykieta: 'Szyna przyłączenia' },
          { klucz: 'i_start_a', etykieta: 'Prąd rozruchowy', jednostka: 'A' },
          { klucz: 'voltage_dip_percent', etykieta: 'Zapad napięcia na szynie', jednostka: '%' },
          { klucz: 'torque_start_pu', etykieta: 'Moment rozruchowy', jednostka: 'j.w.' },
          { klucz: 'torque_margin_pu', etykieta: 'Zapas momentu nad oporowym', jednostka: 'j.w.' },
          { klucz: 'thermal_i2t_ratio', etykieta: 'Wykorzystanie czasu utyku I²t' },
          { klucz: 'verification_status', etykieta: 'Kryteria rozruchu', mapaStatusu: ZGODNY },
        ],
      },
    ],
    nastepnyKrok:
      'Silnik niespełniający kryteriów: zastosuj rozruch łagodny (softstart / '
      + 'przemiennik) albo wzmocnij tor zasilania szyny rozruchowej.',
  },

  // -------------------------------------------------------------------------
  hosting_capacity: {
    pytanie:
      'Ile mocy generacji można przyłączyć w węźle, żeby nie przekroczyć granic '
      + 'napięcia ani obciążalności gałęzi?',
    kryterium:
      'Napięcie w zakresie 0,90–1,10 j.w. i prąd gałęzi ≤ obciążalność długotrwała, '
      + 'z prawdopodobieństwem ≥ 95 % w losowaniu obciążenia i generacji.',
    norma: 'metoda probabilistyczna Monte Carlo; granice napięcia PN-EN 50160',
    werdykt: {
      rodzaj: 'pojedynczy',
      sciezki: ['sanity.status'],
      mapa: MAPA_WIARYGODNOSCI,
    },
    wielkosciGlowne: [],
    tabele: [
      {
        sciezka: 'hosting_capacity',
        tytul: 'Zdolność przyłączeniowa węzłów',
        kluczRef: 'bus_ref',
        etykietaRef: 'Szyna',
        kolumny: [
          {
            klucz: 'hosting_capacity_mw',
            etykieta: 'Moc generacji możliwa do przyłączenia',
            jednostka: 'MW',
          },
          {
            klucz: 'critical_limit',
            etykieta: 'Ograniczenie rozstrzygające',
            mapaStatusu: {
              U_max: { tekst: 'granica napięcia', istotnosc: 'warn' },
              I_galaz: { tekst: 'obciążalność gałęzi', istotnosc: 'warn' },
            },
          },
          { klucz: 'confidence_percent', etykieta: 'Poziom ufności', jednostka: '%' },
          { klucz: 'monte_carlo_n', etykieta: 'Liczba losowań' },
          // Uczciwy stan zerowy (karta MOST-WEJSCIA-V126): szyna, do której nie
          // wchodzi żaden element z obciążalnością długotrwałą, ma wynik oparty
          // WYŁĄCZNIE na kryterium napięciowym. Bez tej kolumny ekran pokazywałby
          // „granica napięcia" jako rozstrzygnięcie, przemilczając, że drugiego
          // kryterium w ogóle nie zastosowano — a przed tą kartą liczono je
          // z obciążalności 300 A wziętej z powietrza.
          { klucz: 'brak_danych', etykieta: 'Czego zabrakło' },
        ],
      },
    ],
    nastepnyKrok:
      'Za mała moc przyłączeniowa: wzmocnij tor (przekrój, drugie zasilanie), '
      + 'zastosuj regulację mocy biernej źródła albo przesuń punkt przyłączenia bliżej stacji.',
  },

  // -------------------------------------------------------------------------
  opf_loss_lcc: {
    pytanie:
      'Ile energii traci sieć w ciągu roku i ile te straty kosztują w całym '
      + 'cyklu życia?',
    kryterium:
      'Straty i koszt cyklu życia są wielkościami projektowymi — solver nie wystawia '
      + 'dla nich progu normatywnego. Porównuje się je między wariantami sieci.',
    norma: 'rachunek kosztu cyklu życia (wartość bieżąca strat)',
    werdykt: {
      rodzaj: 'liczbowy',
      sciezka: 'total_losses_kw',
      jednostka: 'kW',
    },
    wielkosciGlowne: [
      { sciezka: 'total_losses_kw', etykieta: 'Straty mocy w sieci', jednostka: 'kW' },
      {
        sciezka: 'transformer_losses_kw',
        etykieta: 'w tym straty w transformatorach',
        jednostka: 'kW',
      },
      { sciezka: 'annual_losses_kwh', etykieta: 'Straty energii w roku', jednostka: 'kWh/rok' },
      {
        sciezka: 'lcc_loss_opex_pv_pln',
        etykieta: 'Koszt strat w cyklu życia (wartość bieżąca)',
        jednostka: 'zł',
      },
      { sciezka: 'annual_co2_kg', etykieta: 'Emisja towarzysząca stratom', jednostka: 'kg CO₂/rok' },
      {
        sciezka: 'decision_variables.nop_position_ref',
        etykieta: 'Punkt podziału sieci przyjęty w wariancie',
      },
    ],
    tabele: [
      {
        sciezka: 'branch_losses',
        tytul: 'Straty w gałęziach',
        kluczRef: 'branch_ref',
        etykietaRef: 'Gałąź',
        kolumny: [
          { klucz: 'loss_kw', etykieta: 'Straty mocy', jednostka: 'kW' },
          { klucz: 'current_a', etykieta: 'Prąd obciążenia', jednostka: 'A' },
        ],
      },
    ],
    nastepnyKrok:
      'Gałąź o największych stratach: rozważ większy przekrój albo przesunięcie '
      + 'punktu podziału sieci — i porównaj warianty w oknie porównania A/B.',
  },

  /*
   * V126-WYGASZENIE (decyzja właściciela 2026-08-07): `benchmark_validation` NIE
   * MA tu projektu ekranu, bo został wycofany z toru projektanta — bada, czy
   * solver odtwarza sieci odniesienia, czyli sprawdza NARZĘDZIE, nie projekt
   * użytkownika. Zdolność żyje dalej w backendzie i w kontroli jakości
   * (`backend/tests/application/reference_networks/test_ieee_benchmark_wiring.py`).
   * Powód wycofania: `nieprezentowane.ts`; rozstrzygnięcie:
   * `docs/v12xx/REJESTR_KONFLIKTOW.md`, wiersz V126-WYGASZENIE.
   */

  // -------------------------------------------------------------------------
  uncertainty_sensitivity: {
    pytanie:
      'Jak bardzo niepewność danych katalogowych przenosi się na wynik i który '
      + 'parametr o tym decyduje?',
    kryterium:
      'Niepewność rozszerzona (k = 2) ≤ 100 % — powyżej tej wartości wynik jest '
      + 'niewiarygodny. Progu normatywnego solver nie wystawia; wynik służy do '
      + 'wskazania parametru wymagającego dokładniejszych danych.',
    norma: 'propagacja niepewności, przedział rozszerzony k = 2',
    werdykt: {
      rodzaj: 'liczbowy',
      sciezka: 'expanded_uncertainty_percent_k2',
      jednostka: '%',
    },
    wielkosciGlowne: [
      {
        sciezka: 'expanded_uncertainty_percent_k2',
        etykieta: 'Niepewność rozszerzona wyniku (k = 2)',
        jednostka: '%',
      },
      { sciezka: 'display_contract', etykieta: 'Sposób podawania wyniku' },
    ],
    tabele: [
      {
        sciezka: 'sensitivity_ranking',
        tytul: 'Parametry decydujące o niepewności wyniku',
        kluczRef: 'parameter',
        etykietaRef: 'Parametr danych wejściowych',
        refZParametrem: true,
        kolumny: [
          {
            klucz: 'sigma_contribution_percent',
            etykieta: 'Wkład do odchylenia wyniku',
            jednostka: '%',
          },
          { klucz: 'share_percent', etykieta: 'Udział w całkowitej niepewności', jednostka: '%' },
        ],
      },
    ],
    nastepnyKrok:
      'Parametr z czoła listy uściślij danymi katalogowymi producenta albo pomiarem '
      + '— to najtańszy sposób zawężenia niepewności wyniku.',
  },

  // -------------------------------------------------------------------------
  neutral_earthing_design: {
    pytanie:
      'Jak uziemić punkt neutralny sieci i jaki dobrać dławik gaszący albo rezystor, '
      + 'żeby ograniczyć prąd zwarcia doziemnego?',
    kryterium:
      'Dla sieci kompensowanej: prąd resztkowy przy przyjętym rozstrojeniu ≤ 10 % '
      + 'prądu pojemnościowego doziemienia. Dla sieci uziemionej przez rezystor: energia '
      + 'wydzielona w rezystorze ≤ energia znamionowa aparatu.',
    norma: 'kompensacja rezonansowa Petersena · IEC 62271-203',
    werdykt: {
      rodzaj: 'pojedynczy',
      sciezki: ['tuning_status', 'thermal_check.status', 'status'],
      mapa: {
        dostrojony: { tekst: 'dławik dostrojony — prąd resztkowy w granicy', istotnosc: 'ok' },
        rozstrojony_poza_10pct: {
          tekst: 'prąd resztkowy powyżej 10 % prądu pojemnościowego',
          istotnosc: 'err',
        },
        'dane niekompletne': { tekst: 'dane niekompletne — dobór niewykonany', istotnosc: 'warn' },
      },
    },
    wielkosciGlowne: [
      { sciezka: 'neutral_earthing_type', etykieta: 'Sposób uziemienia punktu neutralnego' },
      {
        sciezka: 'capacitive_earth_fault_current_a',
        etykieta: 'Prąd pojemnościowy doziemienia sieci',
        jednostka: 'A',
      },
      { sciezka: 'network_line_voltage_kv', etykieta: 'Napięcie międzyfazowe sieci', jednostka: 'kV' },
      { sciezka: 'coil_reactance_ohm', etykieta: 'Reaktancja dławika gaszącego', jednostka: 'Ω' },
      { sciezka: 'coil_inductance_h', etykieta: 'Indukcyjność dławika gaszącego', jednostka: 'H' },
      { sciezka: 'coil_current_rating_a', etykieta: 'Prąd znamionowy dławika', jednostka: 'A' },
      { sciezka: 'detuning_assumed', etykieta: 'Przyjęty stopień rozstrojenia' },
      {
        sciezka: 'residual_current_at_detuning_a',
        etykieta: 'Prąd resztkowy przy rozstrojeniu',
        jednostka: 'A',
      },
      {
        sciezka: 'residual_current_at_resonance_a',
        etykieta: 'Prąd resztkowy w rezonansie',
        jednostka: 'A',
      },
      { sciezka: 'resistor_ohm', etykieta: 'Rezystancja uziemiająca punktu neutralnego', jednostka: 'Ω' },
      {
        sciezka: 'resultant_earth_fault_current_a',
        etykieta: 'Wynikowy prąd zwarcia doziemnego',
        jednostka: 'A',
      },
      {
        sciezka: 'thermal_check.energy_dissipated_j',
        etykieta: 'Energia wydzielona w rezystorze',
        jednostka: 'J',
        odniesienieSciezka: 'thermal_check.energy_rating_j',
        odniesienieEtykieta: 'znamionowa',
      },
    ],
    tabele: [],
    nastepnyKrok:
      'Po doborze wprowadź dławik albo rezystor do modelu punktu neutralnego GPZ '
      + 'i przelicz analizę „Detekcja doziemień" — metoda detekcji zależy od tego doboru.',
  },
};

/**
 * Ścieżki bloku wiarygodności — wspólne dla wszystkich rodzajów (K-08).
 * Prezentowane osobną sekcją, bo to ocena WIARYGODNOŚCI wyniku, a nie
 * zgodności projektu z normą (dwie różne rzeczy, dwa różne miejsca na ekranie).
 */
export const SCIEZKA_WIARYGODNOSCI = {
  status: 'sanity.status',
  naruszenia: 'sanity.violations',
  sprawdzenLacznie: 'sanity.checks_total',
  sprawdzenZdanych: 'sanity.checks_passed',
} as const;

/**
 * Ścieżki UCZCIWEGO STANU NIEKOMPLETNEGO — wspólne dla całego kontraktu V12.6
 * (solver melduje brak danych, zamiast fabrykować werdykt: zakaz cichego fałszu).
 * To KLASA, nie instancja: obsłużone raz dla wszystkich rodzajów, bo każdy
 * z nich może w ten stan wejść przy niekompletnym modelu.
 */
export const SCIEZKA_BRAKOW = {
  komunikat: 'message_pl',
  brakujacePola: 'missing_fields',
} as const;

/**
 * Polskie nazwy WARTOŚCI SŁOWNIKOWYCH zwracanych przez solver.
 *
 * Wykryte przez strażnika prezentacji na realnych odpowiedziach: rodzaje analiz
 * decyzyjnych (detekcja doziemień, dobór uziemienia punktu neutralnego, straty)
 * zwracają kody techniczne jako WARTOŚCI, nie klucze — `petersen_tuned`,
 * `fifth_harmonic`, `min_delta_p_losses`. Bez tego słownika kod produkcyjny
 * wchodził na ekran drugą drogą, obok ścieżek kluczy (KLASA, nie instancja).
 * Wartość spoza słownika zostaje bez zmian — nic nie znika z ekranu.
 */
export const NAZWY_WARTOSCI: Readonly<Record<string, string>> = {
  // Sposób uziemienia punktu neutralnego sieci
  isolated: 'sieć izolowana',
  petersen_tuned: 'kompensowana, dławik dostrojony',
  petersen_detuned: 'kompensowana, dławik rozstrojony',
  petersen_coil: 'dławik gaszący (Petersena)',
  resistor: 'uziemiona przez rezystor',
  resistor_grounded: 'uziemiona przez rezystor',
  solid: 'uziemiona bezpośrednio',
  // Metody detekcji zwarcia doziemnego
  wattmetric: 'wattmetryczna (kierunkowa mocy czynnej zerowej)',
  admittance: 'admitancyjna',
  transient_directional: 'kierunkowa stanu przejściowego',
  fifth_harmonic: '5. harmonicznej prądu zerowego',
  '51N+67N': 'nadprądowa zerowa z kierunkową (51N + 67N)',
  '51N/50N': 'nadprądowa zerowa (51N / 50N)',
  // Cel i strategia doboru wariantu (optymalizacja strat)
  min_delta_p_losses: 'minimalizacja strat mocy',
  minimize_losses_with_voltage_limits: 'minimalizacja strat przy granicach napięcia',
  // Polityka eksportu raportu (kontrakt `AcademicReportV1`)
  frozen_result_and_proof_only:
    'wyłącznie zamrożony wynik i pakiet dowodowy (bez przeliczania przy eksporcie)',
  // Ograniczenie rozstrzygające o zdolności przyłączeniowej
  U_max: 'granica napięcia',
  I_galaz: 'obciążalność gałęzi',
};

/**
 * Polskie nazwy PARAMETRÓW DANYCH WEJŚCIOWYCH występujących w rankingu
 * niepewności (`sensitivity_ranking[].parameter` ma postać `<ref>.<klucz>`).
 * Ranking bez tego słownika pokazywał `transformator … .uk_percent`.
 */
export const NAZWY_PARAMETROW: Readonly<Record<string, string>> = {
  uk_percent: 'napięcie zwarcia transformatora',
  z_ohm: 'impedancja gałęzi',
  s_sc_mva: 'moc zwarciowa w węźle',
};

/**
 * Polskie nazwy pól danych wejściowych, których brak melduje solver
 * (`missing_fields`). Bez tego słownika ekran pokazywałby projektantowi surowe
 * klucze kontraktu — dokładnie defekt oceniony na 0/10.
 */
export const NAZWY_BRAKUJACYCH_POL: Readonly<Record<string, string>> = {
  b0_siemens_per_km: 'susceptancja doziemna gałęzi (b₀)',
  nominal_kv: 'napięcie znamionowe sieci',
  ner_clearing_time_s: 'czas wyłączenia zwarcia doziemnego',
  ner_energy_rating_j: 'energia znamionowa rezystora uziemiającego',
  converter_control_bandwidth_hz: 'pasmo pętli regulacji prądu przekształtnika',
  converter_ref: 'przekształtnik do zbadania',
  benchmark_references: 'wartości referencyjne sieci odniesienia',
};
