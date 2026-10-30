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
 * ZERO FIZYKI I ZERO OCEN (CLAUDE.md): werdykt jest REKORDEM WERDYKTU WYJAŚNIALNEGO
 * z odpowiedzi backendu (`OcenaKryterium` / `WynikWymagania` pod kluczem `oceny`,
 * kontrakt `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`) renderowanym kartą
 * `KartaWerdyktu`, nigdy porównaniem liczb w UI ani mapą „status → tekst". Tekst kryterium jest OPISEM reguły, którą stosuje solver — służy
 * projektantowi do zrozumienia werdyktu, a nie do jego wyliczenia. Tam, gdzie
 * solver zwraca wartość dopuszczalną (np. `u_touch_allowable_v`), pokazujemy ją
 * jako wartość odniesienia obok wielkości — także wprost z odpowiedzi.
 *
 * UCZCIWOŚĆ NATYCHMIASTOWA (2026-09-23): rodzaje, dla których backend NIE wykonuje
 * oceny (jakość energii — solver harmoniczny niezwalidowany; SSCI — Z_grid bez
 * przekładni transformatora), mają werdykt rodzaju `ocena`: panel pokazuje rekord
 * `NIE_OCENIONO` z odpowiedzi (zdanie, braki, akcja), a liczby solvera — jeśli są —
 * wyłącznie w zwiniętej sekcji audytowej (`sekcjaAudytowa`) pod nagłówkiem z backendu.
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
 * Stan pojedynczy — pole statusu w ładunku wyniku, które NIE jest werdyktem zgodności
 * (dziś: pasmo wiarygodności `sanity.status` niezawodności — kontrola pasma fizycznie
 * możliwego, nie ocena projektu wobec normy). Pierwsza OBECNA ścieżka wygrywa — okno nie
 * zgaduje i nie podstawia stanu.
 */
export interface WerdyktPojedynczy {
  readonly rodzaj: 'pojedynczy';
  readonly sciezki: readonly string[];
  readonly mapa: MapaWerdyktu;
}

/** Werdykt liczbowy — wielkość wynikowa BEZ progu normatywnego w solverze. */
export interface WerdyktLiczbowy {
  readonly rodzaj: 'liczbowy';
  readonly sciezka: string;
  readonly jednostka: string;
}

/**
 * Ocena niewykonana — rekord `NIE_OCENIONO` z odpowiedzi (`application/ocena_niewykonana.py`)
 * pod wskazaną ścieżką. Panel pokazuje zdanie, braki i akcję naprawczą wprost z rekordu.
 */
export interface WerdyktOceny {
  readonly rodzaj: 'ocena';
  readonly sciezka: string;
}

/**
 * Rekordy werdyktu wyjaśnialnego — tablica `OcenaKryterium` / `WynikWymagania` pod wskazaną
 * ścieżką (granica `application/v126_artifacts.py::wynik_v126_dla_powierzchni`, kryteria
 * z rejestru założeń `application/analyses/v126_oceny.py`). Panel renderuje KAŻDY rekord
 * kartą `KartaWerdyktu` — co oceniono, kryterium, wynik z jednostką, limit z podstawą,
 * margines, wyjaśnienie, dowód i zakres ważności; agregat nie zastępuje składowych.
 */
export interface WerdyktRekordow {
  readonly rodzaj: 'rekordy';
  readonly sciezka: string;
}

export type WerdyktRodzaju = WerdyktPojedynczy | WerdyktLiczbowy | WerdyktOceny | WerdyktRekordow;

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
  /**
   * Tabela renderowana WYŁĄCZNIE, gdy ładunek niesie tablicę pod `sciezka` — dla wyników,
   * które ją mają tylko w części przypadków (projekt uziemienia: tablica sieci SN tylko przy
   * kilku sieciach; jedna sieć niesie swoje wielkości wprost w wielkościach głównych).
   */
  readonly tylkoGdyObecna?: boolean;
}

/**
 * Wielkości ŚWIADOMIE niepokazywane, choć solver je zwraca w ładunku wyniku —
 * z powodem renderowanym WPROST na ekranie (karta W2 pkt 5, zero fabrykacji).
 *
 * Różnica wobec `nieprezentowane.ts` (`POWODY_NIEPREZENTOWANIA`): tamten
 * rejestr wygasza CAŁY rodzaj analizy i powód NIE trafia na ekran („ekran ma
 * być KRÓTSZY"); tu metoda detekcji z uzasadnieniem zostaje renderowana jak
 * dziś — pomijane są WYŁĄCZNIE te trzy liczby, a powód pominięcia jest
 * elementem odpowiedzi inżynierskiej (uczciwość wobec BIEŻĄCEGO wyniku), nie
 * czymś do ukrycia.
 */
export interface WielkoscPominieta {
  /** Ścieżki pól pominiętych — kontrola OBECNOŚCI w ładunku steruje tym, czy
   *  nota w ogóle się renderuje (zero noty dla pól, których kontrakt nie niesie). */
  readonly sciezki: readonly string[];
  /** Powód pominięcia — jedno zdanie, renderowane WPROST w miejscu liczb. */
  readonly powod: string;
}

/**
 * Sekcja audytowa rodzaju — liczby solvera, który NIE jest podstawą oceny. Wszystkie
 * ścieżki wskazują w głąb jednego klucza odpowiedzi (`wynik_audytowy`); nagłówek
 * i powody pochodzą z backendu. Sekcja jest zwinięta na starcie.
 */
export interface SekcjaAudytowaRodzaju {
  readonly naglowekSciezka: string;
  readonly powodySciezka: string;
  readonly wiarygodnoscSciezka: string;
  readonly tabele: readonly TabelaObiektow[];
}

/** Kompletny projekt prezentacji jednego rodzaju analizy. */
export interface PrezentacjaRodzaju {
  /*
   * Karta B-02 (2026-09-10): PYTANIE INŻYNIERSKIE, KRYTERIUM i PODSTAWA (norma)
   * ZESZŁY z tego pliku — niesie je katalog backendu
   * (`GET /api/catalog/v126/analysis-catalog`: `pytanie_pl`, `podstawa_oceny`,
   * `bez_podstawy_pl`). Front miał tu drugą kopię tych samych zdań i progów
   * (8 % THD, 20 % marginesu BIL, 10 % TRV…) — dwie prawdy o kryterium na
   * jednym ekranie. Zostaje WYŁĄCZNIE mapa prezentacji ŁADUNKU WYNIKU: która
   * ścieżka niesie ocenę, które wielkości i tabele pokazać, jaki jest następny krok.
   */
  readonly werdykt: WerdyktRodzaju;
  readonly wielkosciGlowne: readonly WielkoscGlowna[];
  /** Wielkości ŚWIADOMIE niepokazywane (karta W2 pkt 5) — puste dla rodzajów
   *  bez takiego pominięcia (dziś: tylko `earth_fault_detection`). */
  readonly wielkosciPominiete?: readonly WielkoscPominieta[];
  readonly tabele: readonly TabelaObiektow[];
  /** Sekcja audytowa — tylko dla rodzajów z oceną niewykonaną i liczbami solvera. */
  readonly sekcjaAudytowa?: SekcjaAudytowaRodzaju;
  /** Jawny następny krok projektanta po odczytaniu wyniku. */
  readonly nastepnyKrok: string;
}

// ---------------------------------------------------------------------------
// Wspólne mapy werdyktów (słownictwo statusów solvera V12.6)
// ---------------------------------------------------------------------------

/** Tryb doziemienia sieci (`network_model.core.uziemienie.TrybDoziemienia`) po polsku. */
const TRYB_DOZIEMIENIA_IZOLACJI: MapaWerdyktu = {
  izolowany: { tekst: 'izolowany', istotnosc: 'neutral' },
  kompensowany: { tekst: 'kompensowany', istotnosc: 'neutral' },
  rezystor: { tekst: 'przez rezystor', istotnosc: 'neutral' },
  bezposrednie: { tekst: 'bezpośrednio', istotnosc: 'neutral' },
};

const CZAS_DOZIEMIENIA_IZOLACJI: MapaWerdyktu = {
  dlugotrwale: { tekst: 'długotrwale', istotnosc: 'neutral' },
  do_wylaczenia: { tekst: 'do wyłączenia (≤ 10 s)', istotnosc: 'neutral' },
};

/**
 * Blok wiarygodności `sanity` — wspólny dla wszystkich rodzajów (K-08). Kontrola
 * sprawdza wyłącznie PASMO fizycznie możliwe — backend nazywa to „w paśmie
 * wiarygodności" (dawniej „zweryfikowany", co twierdziło weryfikację, której nie ma).
 */
export const MAPA_WIARYGODNOSCI: MapaWerdyktu = {
  'w paśmie wiarygodności': { tekst: 'wynik w paśmie wiarygodności', istotnosc: 'ok' },
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
    // Uczciwość natychmiastowa (2026-09-23): solver harmoniczny niezwalidowany — ocena
    // niewykonana, ŻADNA liczba (THD, TDD, K, U_h, skan Z, „rezonanse") na pierwszym
    // planie; tabela węzłów wyłącznie w sekcji audytowej.
    werdykt: { rodzaj: 'ocena', sciezka: 'ocena' },
    wielkosciGlowne: [],
    tabele: [],
    sekcjaAudytowa: {
      naglowekSciezka: 'wynik_audytowy.naglowek_pl',
      powodySciezka: 'wynik_audytowy.powody_pl',
      wiarygodnoscSciezka: 'wynik_audytowy.sanity',
      tabele: [
        {
          sciezka: 'wynik_audytowy.nodes',
          tytul: 'Odkształcenie w węzłach sieci (solver niezwalidowany)',
          kluczRef: 'bus_ref',
          etykietaRef: 'Szyna',
          kolumny: [
            { klucz: 'thd_u_percent', etykieta: 'Odkształcenie napięcia THD_U', jednostka: '%' },
            { klucz: 'tdd_percent', etykieta: 'Odkształcenie prądu TDD', jednostka: '%' },
            { klucz: 'k_factor', etykieta: 'Współczynnik K (obciążenie transformatora)' },
          ],
        },
      ],
    },
    nastepnyKrok:
      'Do czasu solvera harmonicznego z wyrocznią jakość energii w węzłach oceń pomiarem '
      + 'albo obliczeniem zewnętrznym; liczby obecnego solvera służą wyłącznie audytowi.',
  },

  // -------------------------------------------------------------------------
  ssci_impedance: {
    // Uczciwość natychmiastowa (2026-09-23): Z_grid(f) bez przekładni transformatora —
    // ocena niewykonana (rekord `ocena` z backendu), nie chip wiarygodności jako werdykt.
    werdykt: { rodzaj: 'ocena', sciezka: 'ocena' },
    wielkosciGlowne: [],
    tabele: [],
    nastepnyKrok:
      'Okno „Stabilność SSCI" pokazuje wskaźnik strefy ujemnej rezystancji przekształtnika '
      + 'oraz metryki kryterium impedancyjnego jako materiał audytowy.',
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
    // Karta W3-E (2026-09-09): pytanie i kryterium przepisane — poprzednia
    // wersja obiecywała „który element sieci jest najgroźniejszy przy awarii"
    // (odpowiedź rankingu), choć ranking zszedł z ekranu (zdjęty razem z
    // wyliczeniem, nie tylko z tabeli — zob. `nastepnyKrok`).
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
    // Karta W3-E (2026-09-09): tabela `contingency_ranking` SKASOWANA — ranking
    // jest liczony z `_branch_current_a` (prąd gałęzi z obciążenia węzła
    // docelowego, bez sprzężenia sieci) i NIE jest kanonem (kanon = pełny
    // re-solve w `application/analyses/kontyngencje_n1.py`, ekran „Wyniki ›
    // Kontyngencje"). Backend zdejmuje klucz z odpowiedzi (`bez_rankingu_n1`) i
    // dokłada `ranking_n1` — okno pokazuje go jako STAN, nie tabelę
    // (`PanelRankinguNieprezentowanego`, payload-driven, renderuje się dla
    // KAŻDEGO rodzaju niosącego `ranking_n1`, nie tylko dla tego).
    tabele: [],
    nastepnyKrok:
      'Ranking dotkliwości kontyngencji policz na ekranie „Wyniki › Kontyngencje" '
      + '(pełny re-solve rozpływu) — ta analiza daje wyłącznie wskaźniki niezawodności.',
  },

  // -------------------------------------------------------------------------
  earthing_safety: {
    // Werdykt = rekord wymagania „bezpieczeństwo uziomu" z dwiema ocenami składowymi
    // (napięcie dotykowe i krokowe, IEEE 80) — nazywa KRYTERIUM, nie cały uziom stacji
    // (karta V12.7 §0.7: korozja, połączenia wyrównawcze i konserwacja poza zakresem).
    werdykt: { rodzaj: 'rekordy', sciezka: 'oceny' },
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
    // Werdykt = rekord wymagania na KAŻDE miejsce zainstalowania (napięcie trwałej pracy,
    // przepięcie dorywcze, margines ochrony izolacji jako oceny składowe).
    werdykt: { rodzaj: 'rekordy', sciezka: 'oceny' },
    wielkosciGlowne: [],
    tabele: [
      {
        sciezka: 'arresters',
        tytul: 'Ograniczniki przepięć i margines ochrony izolacji',
        kluczRef: 'location_bus_ref',
        etykietaRef: 'Miejsce zainstalowania',
        kolumny: [
          { klucz: 'u_m_kv', etykieta: 'Napięcie najwyższe sieci U_m', jednostka: 'kV' },
          {
            klucz: 'network_neutral',
            etykieta: 'Sposób pracy punktu neutralnego',
            mapaStatusu: TRYB_DOZIEMIENIA_IZOLACJI,
          },
          { klucz: 'earth_fault_factor', etykieta: 'Współczynnik zwarcia doziemnego k' },
          { klucz: 'predicted_tov_kv', etykieta: 'Przepięcie dorywcze przy doziemieniu U_TOV', jednostka: 'kV' },
          {
            klucz: 'tov_duration',
            etykieta: 'Czas trwania doziemienia',
            mapaStatusu: CZAS_DOZIEMIENIA_IZOLACJI,
          },
          { klucz: 'mcov_required_kv', etykieta: 'Wymagane napięcie trwałej pracy', jednostka: 'kV' },
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
          {
            klucz: 'tov_10s_kv',
            etykieta: 'Wytrzymałość ogranicznika na przepięcie dorywcze 10 s',
            jednostka: 'kV',
          },
          { klucz: 'bil_margin_percent', etykieta: 'Margines ochrony izolacji', jednostka: '%' },
        ],
      },
    ],
    nastepnyKrok:
      'Miejsce bez wymaganego marginesu: dobierz ogranicznik o niższym napięciu '
      + 'obniżonym albo skróć odległość ochronną między ogranicznikiem a aparatem.',
  },

  // -------------------------------------------------------------------------
  earth_fault_detection: {
    // Werdykt = rekord „funkcje przekaźnika wymagane przez metodę zalecaną" — z deklaracji
    // funkcji przekaźnika (parametr biegu); bez niej ocena niewykonana, nie „spełnia".
    werdykt: { rodzaj: 'rekordy', sciezka: 'oceny' },
    wielkosciGlowne: [
      { sciezka: 'neutral_grounding', etykieta: 'Sposób uziemienia punktu neutralnego' },
      { sciezka: 'recommended_method', etykieta: 'Metoda zalecana' },
      { sciezka: 'alternative_method', etykieta: 'Metoda alternatywna' },
    ],
    // Karta W2 pkt 5 (zero fabrykacji): `settings.u0_start_percent`/`p0_set_w`/
    // `i5_multiplier` solver FROZEN zwraca jako LITERAŁY bez udokumentowanej
    // podstawy (`network_model/solvers/*` — nie ruszane tą kartą). Metoda
    // detekcji z uzasadnieniem zostaje renderowana jak dziś (`wielkosciGlowne`
    // powyżej); trzy nastawy NIE są renderowane — w ich miejscu powód wprost.
    wielkosciPominiete: [
      {
        sciezki: ['settings.u0_start_percent', 'settings.p0_set_w', 'settings.i5_multiplier'],
        powod:
          'Nastawy nie są prezentowane: solver nie ma dla nich udokumentowanej podstawy — '
          + 'wymagane wymaganie OSD albo karta przekaźnika.',
      },
    ],
    tabele: [],
    nastepnyKrok:
      'Brak metody w przekaźniku: dobierz przekaźnik z wymaganą funkcją albo zmień '
      + 'sposób uziemienia punktu neutralnego (analiza „Dobór uziemienia punktu neutralnego").',
  },

  // -------------------------------------------------------------------------
  transient_trv: {
    // Werdykt = rekord obwiedni napięcia powrotnego: program nie niesie obwiedni TRV
    // IEC 62271-100 (tablic wartości znamionowych) — rekord BRAK_PODSTAWY nazywa lukę;
    // szczyt napięcia powrotnego obwodu jest wielkością wynikową bez oceny.
    werdykt: { rodzaj: 'rekordy', sciezka: 'oceny' },
    wielkosciGlowne: [
      {
        sciezka: 'trv_peak_kv',
        etykieta: 'Szczyt napięcia powrotnego obwodu',
        jednostka: 'kV',
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
    // Werdykt = rekord wymagania na KAŻDY silnik (zapad napięcia, czas rozruchu względem
    // czasu utyku, zapas momentu jako oceny składowe).
    werdykt: { rodzaj: 'rekordy', sciezka: 'oceny' },
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
          { klucz: 'start_time_s', etykieta: 'Czas rozruchu', jednostka: 's' },
          {
            klucz: 'allowable_locked_rotor_time_s',
            etykieta: 'Dopuszczalny czas utyku',
            jednostka: 's',
          },
          { klucz: 'locked_rotor_time_ratio', etykieta: 'Wykorzystanie dopuszczalnego czasu utyku' },
        ],
      },
    ],
    nastepnyKrok:
      'Silnik niespełniający kryteriów: zastosuj rozruch łagodny (softstart / '
      + 'przemiennik) albo wzmocnij tor zasilania szyny rozruchowej.',
  },

  /*
   * V126-WYGASZENIE (decyzja właściciela 2026-08-07): `benchmark_validation` NIE
   * MA tu projektu ekranu, bo został wycofany z toru projektanta — bada, czy
   * solver odtwarza sieci odniesienia, czyli sprawdza NARZĘDZIE, nie projekt
   * użytkownika. Zdolność żyje dalej w backendzie i w kontroli jakości
   * (`backend/tests/golden/parytet_benchmarkow/test_ieee_benchmark_wiring.py`,
   * przeniesiony kartą K2, 2026-09-09).
   * Powód wycofania: `nieprezentowane.ts`; rozstrzygnięcie:
   * `docs/v12xx/REJESTR_KONFLIKTOW.md`, wiersz V126-WYGASZENIE.
   *
   * Karta W3-E (2026-09-09): `hosting_capacity` i `opf_loss_lcc` NIE MAJĄ tu
   * projektu ekranu — DUPLIKUJĄ kanon liczony pełnym rozpływem/rzeczywistymi
   * danymi katalogowymi gdzie indziej (`hosting_capacity`: lokalna impedancja
   * Thevenina bez sprzężenia sieci wobec `application/analyses/
   * hosting_capacity.py`; `opf_loss_lcc`: β = 0,45 zaszyte i zaczep OLTC
   * zawsze 0 wobec `equipment_checks/transformer_losses.py` + badań OLTC).
   * Backend odmawia URUCHOMIENIA nowego biegu (410 `v126.analysis_withdrawn`)
   * — ekran nie ma czego renderować, bo POST nigdy się nie powiedzie. Powód
   * wycofania: `nieprezentowane.ts`; rozstrzygnięcie: `docs/v12xx/
   * REJESTR_KONFLIKTOW.md`, wiersz W3-E.
   */

  // -------------------------------------------------------------------------
  uncertainty_sensitivity: {
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
    // Werdykt = rekordy kryteriów KAŻDEJ galwanicznie połączonej sieci SN (prąd resztkowy
    // dławika wobec prądu pojemnościowego) i KAŻDEGO rezystora (energia doziemienia).
    werdykt: { rodzaj: 'rekordy', sciezka: 'oceny' },
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
      {
        sciezka: 'coil_current_model_a',
        etykieta: 'Prąd dławika modelu przy doziemieniu (z impedancją Z₀ transformatora uziemiającego)',
        jednostka: 'A',
      },
      {
        sciezka: 'detuning_model',
        etykieta: 'Rozstrojenie dławika modelu v = (I_C − I_L)/I_C (dodatnie — niedokompensowanie)',
      },
      {
        sciezka: 'residual_current_a',
        etykieta: 'Prąd resztkowy dławika modelu',
        jednostka: 'A',
      },
      {
        sciezka: 'residual_share_percent',
        etykieta: 'Prąd resztkowy jako udział prądu pojemnościowego doziemienia',
        jednostka: '%',
      },
      {
        sciezka: 'active_component_a',
        etykieta: 'Składowa czynna prądu resztkowego',
        jednostka: 'A',
      },
      {
        sciezka: 'residual_current_at_resonance_a',
        etykieta: 'Prąd resztkowy przy dostrojeniu do rezonansu',
        jednostka: 'A',
      },
      {
        sciezka: 'residual_current_awsc_a',
        etykieta: 'Prąd resztkowy po załączeniu automatyki wymuszania składowej czynnej',
        jednostka: 'A',
      },
      {
        sciezka: 'active_component_awsc_a',
        etykieta: 'Składowa czynna po załączeniu automatyki wymuszania składowej czynnej',
        jednostka: 'A',
      },
      { sciezka: 'resistor_ohm', etykieta: 'Rezystancja uziemiająca punktu neutralnego', jednostka: 'Ω' },
      {
        sciezka: 'resistive_component_a',
        etykieta: 'Składowa czynna prądu doziemienia (prąd rezystora)',
        jednostka: 'A',
      },
      {
        sciezka: 'coil_current_a',
        etykieta: 'Prąd dławika w układzie dławik ‖ rezystor',
        jednostka: 'A',
      },
      {
        sciezka: 'resultant_earth_fault_current_a',
        etykieta: 'Wynikowy prąd zwarcia doziemnego',
        jednostka: 'A',
      },
      {
        // Sprawdzenie cieplne rezystora (IEC 60909-0 §12, IEEE Std C57.32): wielkości
        // rezystora rozstrzygającego — o najkrótszym czasie dopuszczalnym.
        sciezka: 'thermal_check.i_resistor_a',
        etykieta: 'Największy prąd rezystora przy doziemieniu (maksymalny współczynnik napięciowy IEC 60909, z impedancją Z₀ transformatora uziemiającego)',
        jednostka: 'A',
      },
      {
        sciezka: 'thermal_check.i_thermal_a',
        etykieta: 'Prąd zastępczy cieplny rezystora I_th',
        jednostka: 'A',
      },
      {
        sciezka: 'thermal_check.permissible_time_s',
        etykieta: 'Dopuszczalny czas trwania doziemienia dla rezystora',
        jednostka: 's',
        odniesienieSciezka: 'thermal_check.clearing_time_s',
        odniesienieEtykieta: 'czas wyłączenia',
      },
      {
        sciezka: 'thermal_check.energy_dissipated_j',
        etykieta: 'Energia wydzielona w rezystorze',
        jednostka: 'J',
        odniesienieSciezka: 'thermal_check.energy_rating_j',
        odniesienieEtykieta: 'znamionowa',
      },
    ],
    tabele: [
      {
        // Model z kilkoma galwanicznie połączonymi sieciami SN (np. dwie sekcje GPZ przy
        // otwartym sprzęgle): prąd pojemnościowy i dobór KAŻDEJ sieci osobno — z gałęzi
        // i baterii tej sieci, nie z całego modelu.
        sciezka: 'sieci',
        tytul: 'Sieci SN połączone galwanicznie — dobór dla każdej sieci',
        kluczRef: 'szyna_ref',
        etykietaRef: 'Sieć SN (szyna punktu neutralnego)',
        tylkoGdyObecna: true,
        kolumny: [
          {
            klucz: 'capacitive_earth_fault_current_a',
            etykieta: 'Prąd pojemnościowy doziemienia',
            jednostka: 'A',
          },
          { klucz: 'coil_current_rating_a', etykieta: 'Prąd znamionowy dławika', jednostka: 'A' },
          {
            klucz: 'residual_current_a',
            etykieta: 'Prąd resztkowy dławika modelu',
            jednostka: 'A',
          },
          {
            klucz: 'residual_share_percent',
            etykieta: 'Udział prądu resztkowego w prądzie pojemnościowym',
            jednostka: '%',
          },
          { klucz: 'detuning_model', etykieta: 'Rozstrojenie dławika modelu' },
          { klucz: 'resistor_ohm', etykieta: 'Rezystancja uziemiająca', jednostka: 'Ω' },
          {
            klucz: 'resultant_earth_fault_current_a',
            etykieta: 'Wynikowy prąd zwarcia doziemnego',
            jednostka: 'A',
          },
        ],
      },
      {
        // Sprawdzenie cieplne KAŻDEGO rezystora punktu neutralnego w ruchu (zespół z kilkoma
        // rezystorami — np. dwa transformatory uziemiające sekcji): wiersz na rezystor.
        sciezka: 'thermal_check.resistors',
        tytul: 'Obciążalność cieplna rezystorów punktu neutralnego',
        kluczRef: 'ref',
        etykietaRef: 'Rezystor punktu neutralnego',
        tylkoGdyObecna: true,
        kolumny: [
          { klucz: 'r_ohm', etykieta: 'Rezystancja', jednostka: 'Ω' },
          { klucz: 'i_resistor_a', etykieta: 'Największy prąd rezystora', jednostka: 'A' },
          { klucz: 'i_thermal_a', etykieta: 'Prąd zastępczy cieplny I_th', jednostka: 'A' },
          { klucz: 'permissible_time_s', etykieta: 'Czas dopuszczalny', jednostka: 's' },
          { klucz: 'energy_dissipated_j', etykieta: 'Energia wydzielona', jednostka: 'J' },
          { klucz: 'energy_rating_j', etykieta: 'Energia znamionowa', jednostka: 'J' },
        ],
      },
    ],
    nastepnyKrok:
      'Gdy dobór różni się od zespołu uziemiającego w modelu, zmień dławik albo rezystor '
      + 'zespołu w polu ZU stacji i przelicz analizę „Detekcja doziemień" — metoda detekcji '
      + 'zależy od sposobu uziemienia.',
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
  'uziemienie_sn.sieci.c_max': 'współczynnik napięciowy c_max sieci (IEC 60909-0 tab. 1)',
  breaker_rated_voltage_kv: 'napięcie znamionowe wyłącznika U_r',
  trv_natural_frequency_hz: 'częstotliwość własna napięcia powrotnego obwodu',
  trv_tau_s: 'stała czasowa napięcia powrotnego obwodu',
  inrush_multiple_in: 'krotność prądu załączania transformatora',
  'uziemienie_sn.sieci.rezystory': 'rezystor punktu neutralnego zespołu uziemiającego (R, I_n, t_n)',
  'uziemienie_sn.sieci.punkty_neutralne':
    'punkty uziemienia sieci w ruchu (impedancje dławika, rezystora i transformatora uziemiającego)',
  converter_control_bandwidth_hz: 'pasmo pętli regulacji prądu przekształtnika',
  converter_ref: 'przekształtnik do zbadania',
  benchmark_references: 'wartości referencyjne sieci odniesienia',
};
