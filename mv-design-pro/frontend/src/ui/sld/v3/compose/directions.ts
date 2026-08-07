/**
 * SLD V3 — nomenklatura kierunków pól liniowych (SLD_CAD_SPEC_V3 §9,
 * WIĄŻĄCA). Zakaz `WE`/`WY`/`ODG` na rysunku: w sieci SN z punktami NO,
 * pierścieniami i OZE kierunek przepływu mocy jest ZMIENNY — pole liniowe
 * identyfikuje się KIERUNKIEM (celem połączenia), nie „wejściem/wyjściem".
 *
 * Dwie warstwy czystych funkcji:
 *  1. `resolveStationDirectionContext` — z `LineRunV1[]` (ENM, kolejność
 *     stacji na ciągu) wyprowadza kod poprzednika/następnika/gałęzi DLA
 *     JEDNEJ stacji. Oddzielone od przypisania do konkretnych pól, żeby
 *     dało się testować niezależnie (rozwiązywanie topologii vs. przypisanie
 *     podpisu do pola).
 *  2. `stationBayCaptions` — z rozwiązanego kontekstu + `snBays` (kolejność
 *     pól w stacji) wyprowadza podpis (`kier. Sxx` / `odg. Sxx` / `null`)
 *     PER POLE, index-aligned do `snBays` — gotowe wejście dla
 *     `measure.bayDirectionCaptions` i `labels.port-caption` (spec §4).
 *
 * DECYZJA (luka spec §9 — role pól nie zawsze rozróżniają kierunek wprost):
 * role jawne ENM (`LINE_IN`/`LINE_OUT`/`LINE_BRANCH`) są jednoznaczne, ale
 * `RMU_LINE`/`GPZ_LINE_BAY` (role generyczne „pole liniowe" — patrz
 * `MINI_BLOCK_FOOTPRINT.defaultSnBayRoles`, `v2/renderer/MiniBlockFootprints.ts`)
 * NIE niosą kierunku w samej roli. Przyjęto konwencję POZYCYJNĄ wśród pól
 * LINIOWYCH tej stacji (w kolejności `snBays`, NIE wśród wszystkich pól):
 * pierwsze pole liniowe = poprzednik (wejście z ciągu), drugie = następnik
 * (wyjście), trzecie i kolejne = odgałęzienia — mirror v2
 * `miniBlockPortRoleLabel` (`MiniBlockRmuRenderer.tsx`), ale liczone WYŁĄCZNIE
 * wśród pól liniowych (v2 liczy pozycję wśród WSZYSTKICH pól stacji, co dla
 * footprintu `mv_lv_sectional` — pole liniowe drugiej sekcji leżące ZA polem
 * TR/SPR pierwszej sekcji — dawałoby błędne „ODG" zamiast „WE" tej sekcji;
 * v3 tej wady NIE dziedziczy, bo liczy pozycję tylko wśród pól LINIOWYCH).
 *
 *  3. F10.2/F10.6 (spec §19.1, V12K-035, POPRAWKA A3): dawny punkt 3 tego
 *     nagłówka (`bayApparatusDesignation`, F6b) opisywał JEDEN oznacznik
 *     „Q0/Q1/T1" na CAŁE pole — to naruszało spec §19.1 („«Q» identyfikuje
 *     KONKRETNY aparat, NIE pole"). Funkcja USUNIĘTA; zastąpiona DWOMA
 *     odrębnymi warstwami: `fieldFunctionalDesignation` niżej (oznaczenie
 *     FUNKCYJNE pola — liniowe/transformatorowe/sprzęgłowe/pomiarowe/
 *     generatorowe, spec §19.1) i `apparatusIdentifiers` (`./apparatusSequence`
 *     — identyfikator PER-APARAT Q/QE/T przy symbolu; `BayPrimaryDevice.
 *     designation` DOMAIN, F10.6, gdy obecny WYGRYWA nad tekstem konwencji
 *     — `data-designation-source="dane"`; fallback konwencji ze znacznikiem
 *     `"konwencja"` gdy dana niedostarczona).
 *  4. `classifyStationTopologicalType` (F10.2, spec §19.3, V12K-034) — rodzaj
 *     stacji (końcowa/przelotowa/odgałęźna/sekcyjna) WYPROWADZONY z topologii
 *     (liczba pól liniowych + obecność sprzęgła w `snBays`), NIE z ręcznej
 *     danej `Substation.station_type`. Mieszka w tym pliku, bo używa TEJ
 *     SAMEJ `isLineLikeRole` co (1)/(2) — jedna prawda „co jest polem
 *     liniowym".
 */

import { FIELD_ROLE, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';
import type { LineRunV1 } from '../../../../types/enm';

/** Surowe tokeny zakazane na rysunku (spec §9) — dopasowanie na CAŁYCH
 *  słowach, wielkość liter jak w ENM/v2 (`bay.designation` bywa `'WE'` itp.,
 *  patrz `MiniBlockRmuRenderer.tsx` `overviewFieldRoleLabel`). EKSPORT (F6b,
 *  spłata długu §9): jedno źródło prawdy dla `layout/measure.ts`
 *  (`bayApparatusDesignation` niżej) i `scene/buildScene.ts`
 *  (`noForbiddenDirectionTokens`) — zero duplikacji regexu w trzech
 *  plikach. */
export const FORBIDDEN_RAW_DIRECTION_TOKENS = /\b(WE|WY|ODG)\b/;

/**
 * F10.2 (spec §19.1, V12K-035): oznaczenie FUNKCYJNE pola — CZYSTA funkcja
 * roli, zero zależności od danych (`bay.designation` NIE jest już czytane
 * tutaj — sidecar pola przestał nieść identyfikator aparatu, spec §19.1
 * „«Q» identyfikuje aparat, NIE pole"). Słownik (spec §19.1: „liniowe /
 * transformatorowe / sprzęgłowe / pomiarowe / potrzeb własnych / generatorowe
 * / inne technologiczne") ograniczony do kategorii REALNIE reprezentowanych
 * w `FieldRole` (§A3-DEC-5 — zero ról-atrap, zakaz rozszerzania `FieldRole`
 * bez danych; inwentaryzacja w raporcie F10.2): „potrzeb własnych"/„inne
 * technologiczne" NIE mają odpowiednika w obecnym enumie — nie są zwracane.
 * DER (`DER_PV`/`DER_BESS`/`DER_FW`) mapowane na „pole generatorowe" (spec
 * §19.1 dopuszcza tę kategorię wprost; rozróżnienie PV/BESS/farma wiatrowa
 * niesie już SYMBOL źródła, nie etykieta funkcyjna pola).
 *
 * UŻYWANA w DWÓCH miejscach, które MUSZĄ się zgadzać (wzór F6b-1):
 * `layout/measure.ts` (`bayColumnRequiredWidth` — rezerwacja szerokości
 * sidecara) i `compose/station.ts` (`composeStation` — realny tekst
 * etykiety `ownerKind:'field-role'`).
 */
export function fieldFunctionalDesignation(role: FieldRole): string {
  switch (role) {
    case FIELD_ROLE.LINE_IN:
    case FIELD_ROLE.LINE_OUT:
    case FIELD_ROLE.LINE_BRANCH:
    case FIELD_ROLE.RMU_LINE:
    case FIELD_ROLE.GPZ_LINE_BAY:
      return 'pole liniowe';
    case FIELD_ROLE.TRANSFORMER:
    case FIELD_ROLE.RMU_TRANSFORMER:
      return 'pole transformatorowe';
    case FIELD_ROLE.COUPLER:
      return 'pole sprzęgłowe';
    case FIELD_ROLE.MEASUREMENT:
      return 'pole pomiarowe';
    case FIELD_ROLE.DER_PV:
    case FIELD_ROLE.DER_BESS:
    case FIELD_ROLE.DER_FW:
      return 'pole generatorowe';
    default:
      return 'pole';
  }
}

/**
 * PROPORCJE (zgłoszenie właściciela 2026-08-07, pkt 4: „CZTERY identyczne «Q1»
 * w jednej rozdzielni bez rozróżnienia pola") — OZNACZNIK POLA na rysunku.
 *
 * CO BYŁO ZŁE (pomiar `scripts/pomiar_proporcje.tsx`, fixtura 53 stacji, L2):
 * **53 z 54 rozdzielni** miały powtórzony oznacznik aparatu (rekord: cztery
 * „Q1" w jednym bloku), a **53 z 53** bloków miały opisy pól NIEROZRÓŻNIALNE
 * między sobą („pole liniowe" ×3 + „pole transformatorowe"). Recenzja NO-GO
 * 2026-07-17 pkt 9 rozstrzygnęła, że rysunek zostaje przy KRÓTKICH Q/QE/T
 * „w obrębie OPISANEGO pola", a identyfikator globalny (`S01.F01.Q2`) żyje w
 * inspektorze (`ui/sld/shared/detailDrawerData.ts`). Zrealizowana była tylko
 * PIERWSZA połowa tej pary: oznaczniki skrócono, a pole nigdy nie dostało
 * OPISU, po którym dałoby się je wskazać — sama ROLA („pole liniowe") powtarza
 * się w rozdzielni tyle razy, ile jest pól tej roli. Reguła KLASA §3
 * (predykaty parami): warunek, na którym stoi krótki oznacznik, musi być
 * SPEŁNIONY, a nie założony.
 *
 * PRYMAT DANYCH (§12.1) I ZAKAZ FABRYKACJI. Numer pola z danych
 * (`Bay.bay_number`, „10"/„23/1") jest oznacznikiem PIERWSZEGO wyboru i tak
 * właśnie działa ścieżka GPZ (`compose/gpz.ts`). Dla pól SN STACJI danej nie
 * ma: read-model `StationFieldSpec` (`v2/canvas/enmToSldAdapter.ts`) nie niesie
 * `bay_number` ani `feeder_short_name` — nazwane wprost jako dług, nie obejście.
 * Zostaje wtedy OSTATNI fallback: deterministyczny licznik pozycyjny w
 * kolejności kompozycji rozdzielnicy — dokładnie ta sama konwencja, którą
 * repo stosuje już w DWÓCH miejscach (pola GPZ oraz identyfikator globalny
 * inspektora). To nie jest wymyślanie danej: to nazwanie POZYCJI, która i tak
 * jest narysowana, tą samą literą, którą projektant zobaczy w inspektorze.
 *
 * KONWENCJA (jedna dla całego rysunku): `F01`, `F02`… pola liniowe · `FT1`…
 * transformatorowe · `FS1`… sprzęgłowe · `FP1`… pomiarowe · `FG1`…
 * generatorowe (DER). Liczniki są ODRĘBNE per klasa roli, więc dodanie pola
 * jednej klasy nie przenumerowuje pozostałych.
 */
export function fieldOrdinalDesignation(role: FieldRole, counters: Map<string, number>): string {
  const cls =
    role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER
      ? 'FT'
      : role === FIELD_ROLE.COUPLER
        ? 'FS'
        : role === FIELD_ROLE.MEASUREMENT
          ? 'FP'
          : role === FIELD_ROLE.DER_PV || role === FIELD_ROLE.DER_BESS || role === FIELD_ROLE.DER_FW
            ? 'FG'
            : 'F';
  const next = (counters.get(cls) ?? 0) + 1;
  counters.set(cls, next);
  return cls === 'F' ? `F${String(next).padStart(2, '0')}` : `${cls}${next}`;
}

/**
 * PROPORCJE — PODPIS POLA rysowany na schemacie: „⟨oznacznik⟩ · ⟨rola⟩"
 * (np. „F01 · pole liniowe"). Oznacznik z `fieldOrdinalDesignation` liczony na
 * TEJ SAMEJ tablicy pól i w TEJ SAMEJ kolejności, w której rozdzielnica jest
 * komponowana — funkcja jest CZYSTA względem `(snBays, index)`, więc
 * `layout/measure.ts` (REZERWACJA szerokości sidecara) i `compose/station.ts`
 * (REALNY tekst etykiety) dostają bit-identyczny wynik. Dwie kopie tej
 * arytmetyki byłyby rozjazdem measure↔compose, czyli kolizją etykiety z
 * sąsiednią kolumną (wzór F6b-1, ta sama zasada co `fieldFunctionalDesignation`).
 *
 * Oznacznik stoi PRZED rolą, bo to on jest członem ROZRÓŻNIAJĄCYM: przy
 * skracaniu etykiety (`core/text.ts` `shortenPreservingIdentity`) człony
 * odpadają od końca, więc z „F01 · liniowe" zostaje „F01 …", a nie
 * „… pole liniowe" powtórzone trzy razy w jednym bloku.
 *
 * DLACZEGO BEZ SŁOWA „pole" (rozstrzygnięcie POMIAREM, nie gustem). Pełna
 * forma „F01 · pole liniowe" jest o 34 j.św. szersza od samej roli, a sidecar
 * wchodzi do rezerwacji KAŻDEJ kolumny pola. Zmierzone na fixturze 53 stacji:
 * arkusz przechodzi z 2 na 3 WIERSZE (bbox 8280×5259 → 7808×6851), a skala
 * dopasowania spada 0,168 → 0,131 (−22%) — czyli cena za powtórzony rzeczownik
 * to CAŁY dodatkowy wiersz arkusza i utrata czytelności przeglądu. Forma
 * „F01 · liniowe" kosztuje 64 j.św. na cały arkusz (8280 → 8344, +0,8%) i
 * NIE zmienia liczby wierszy. Słownik kategorii §19.1 (liniowe /
 * transformatorowe / sprzęgłowe / pomiarowe / generatorowe) zostaje CO DO
 * SŁOWA; odpada wyłącznie rzeczownik „pole", który niesie już sama litera
 * oznacznika (F = pole) i pozycja etykiety przy kolumnie pola.
 */
export function fieldCaptionAt(
  snBays: readonly MiniBlockBayDescriptor[],
  index: number,
): string {
  const counters = new Map<string, number>();
  let oznacznik = '';
  for (let i = 0; i <= index && i < snBays.length; i += 1) {
    oznacznik = fieldOrdinalDesignation(snBays[i].fieldRole, counters);
  }
  const rola = fieldFunctionalDesignation(snBays[index].fieldRole);
  return oznacznik ? `${oznacznik} · ${rola.replace(/^pole /, '')}` : rola;
}

/**
 * F10.2 (spec §19.3, V12K-034): rodzaj stacji WYPROWADZONY z topologii —
 * zastępuje dawne 1:1 mapowanie ręcznej danej `Substation.station_type`
 * (`classifyTopologicalType`, `v2/canvas/enmToSldAdapter.ts`, NIEZMIENIONE —
 * pozostaje jako `props.topologicalType`, źródło WYŁĄCZNIE dla WALIDACJI
 * niezgodności, `scene/buildScene.ts` `buildMeasureInput`, spec §19.3 „dana
 * służy WYŁĄCZNIE walidacji, bez cichego nadpisania rysunku").
 *
 * Reguła (spec §19.3, wyrocznia `station_type_topology_probe`):
 *  1. obecność pola sprzęgła (`FIELD_ROLE.COUPLER`) w `snBays` ⇒ „sekcyjna"
 *     (sprzęgło = dzieli stację na sekcje niezależnie od liczby pól
 *     liniowych — `mv_lv_sectional` ma 2 pola liniowe, ale JEST sekcyjna);
 *  2. inaczej liczba pól liniowych (`isLineLikeRole`) w `snBays`:
 *     0-1 ⇒ „końcowa", 2 (równorzędne) ⇒ „przelotowa", ≥3 ⇒ „odgałęźna".
 *
 * Czysta funkcja `snBays` — zero zależności od `station_type`/ID/nazwy.
 */
export function classifyStationTopologicalType(
  snBays: readonly MiniBlockBayDescriptor[],
): 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna' {
  if (snBays.some((bay) => bay.fieldRole === FIELD_ROLE.COUPLER)) return 'sekcyjna';
  const lineCount = snBays.filter((bay) => isLineLikeRole(bay.fieldRole)).length;
  if (lineCount >= 3) return 'odgałęźna';
  if (lineCount === 2) return 'przelotowa';
  return 'końcowa';
}

/** Kierunek pola liniowego wynikający z pozycji wśród pól liniowych tej
 *  stacji (patrz DECYZJA w nagłówku pliku) — `null` dla pól bez kierunku
 *  liniowego (TR, sprzęgło, pomiar, DER). */
export type LineBayDirection = 'previous' | 'next' | 'branch';

/** EKSPORT (F6a, `scene/buildScene.ts`): rozstrzygnięcie „czy pole liniowe"
 *  potrzebne WPROST przy wyznaczaniu portów wejścia/wyjścia magistrali dla
 *  routingu (który bay jest `previous`/`next`/`branch`) — bez duplikowania
 *  tej listy ról w scenie. */
export function isLineLikeRole(role: FieldRole): boolean {
  return (
    role === FIELD_ROLE.LINE_IN
    || role === FIELD_ROLE.LINE_OUT
    || role === FIELD_ROLE.LINE_BRANCH
    || role === FIELD_ROLE.RMU_LINE
    || role === FIELD_ROLE.GPZ_LINE_BAY
  );
}

/** Klasyfikacja kierunku pola liniowego (spec §9, DECYZJA w nagłówku pliku).
 *  `lineBayPosition`: indeks TEGO pola WŚRÓD pól liniowych tej stacji
 *  (0-based, w kolejności `snBays`) — ignorowany dla ról jawnych. */
/** EKSPORT (F6a): patrz `isLineLikeRole` wyżej — scena musi wiedzieć, KTÓRY
 *  bay stacji jest portem wejścia/wyjścia magistrali (routing), używając
 *  DOKŁADNIE tej samej klasyfikacji co podpisy kierunku (§9), zero cienia. */
export function classifyLineBayDirection(role: FieldRole, lineBayPosition: number): LineBayDirection | null {
  if (role === FIELD_ROLE.LINE_IN) return 'previous';
  if (role === FIELD_ROLE.LINE_OUT) return 'next';
  if (role === FIELD_ROLE.LINE_BRANCH) return 'branch';
  if (role === FIELD_ROLE.RMU_LINE || role === FIELD_ROLE.GPZ_LINE_BAY) {
    if (lineBayPosition === 0) return 'previous';
    if (lineBayPosition === 1) return 'next';
    return 'branch';
  }
  return null; // TR/RMU_TRANSFORMER, COUPLER, MEASUREMENT, DER_* — brak kierunku liniowego
}

function fallbackCaption(designation: string | null | undefined): string | null {
  const trimmed = designation?.trim();
  if (!trimmed) return null;
  // Spec §9: fallback NIGDY nie może zwrócić surowy zakazany token —
  // lepszy brak podpisu niż 'WE'/'WY'/'ODG' na rysunku.
  if (FORBIDDEN_RAW_DIRECTION_TOKENS.test(trimmed)) return null;
  return trimmed;
}

// ---------------------------------------------------------------------------
// 1. Rozwiązywanie kontekstu kierunkowego stacji z `LineRunV1[]` (ENM).
// ---------------------------------------------------------------------------

/** Rozwiązany kontekst kierunkowy JEDNEJ stacji na ciągu — wejście
 *  `stationBayCaptions`. Rozdzielony od surowego `LineRunV1[]`, żeby dało
 *  się testować rozwiązywanie topologii NIEZALEŻNIE od przypisania podpisów
 *  do konkretnych pól. */
export interface StationDirectionContext {
  /** Kod poprzednika na ciągu (stacja lub GPZ) — `null` gdy brak danych
   *  ciągu dla tej stacji (stacja nie znaleziona w żadnym `LineRunV1`). */
  readonly previousNodeCode: string | null;
  /** Kod następnika na ciągu — `null` gdy stacja jest ostatnia na swoim
   *  ciągu lub brak danych ciągu. */
  readonly nextNodeCode: string | null;
  /** Kody pierwszych stacji odgałęzień zaczynających się w TEJ stacji, w
   *  kolejności `lineRuns` (deterministyczne — bez sortowania dodatkowego,
   *  wejście już ma ustaloną kolejność). Index-aligned do KOLEJNYCH pól
   *  odgałęźnych tej stacji (patrz `stationBayCaptions`), NIE do `snBays`. */
  readonly branchNodeCodes: readonly string[];
  /** F10.2 (spec §19.2, D2): `LineRunV1.name` ciągu niosącego poprzednika/
   *  następnika TEJ stacji (ten sam ciąg dla obu — stacja jest NA nim) —
   *  `null` gdy brak danych ciągu LUB `run.name` puste/nieustawione
   *  (degradacja do samego kodu kierunku, wyrocznia `line_bay_caption_probe`
   *  „brak danych linii = sam kier. ⟨kod⟩", NIE błąd). */
  readonly runName: string | null;
  /** F10.2 (spec §19.2): nazwy ciągów odgałęźnych, index-aligned do
   *  `branchNodeCodes` (jak wyżej). */
  readonly branchRunNames: readonly (string | null)[];
}

export interface ResolveStationDirectionContextInput {
  readonly lineRuns: readonly LineRunV1[];
  /** `substation_ref` stacji, dla której liczymy kontekst. */
  readonly stationId: string;
  /** Kod węzła GPZ (skrót nazwy, spec §9) — użyty jako poprzednik pierwszej
   *  stacji głównego ciągu (ciąg bez `parent_run_ref`, pierwsza pozycja). */
  readonly gpzNodeCode: string;
  /** Rozwiązuje `substation_ref` → kod stacji (S01…). `null`, gdy stacja
   *  nieznana (fallback wyłącza podpis kierunku dla tego węzła — lepszy brak
   *  niż błędny kod). */
  readonly stationCodeOf: (substationRef: string) => string | null;
}

/**
 * Wyprowadza poprzednika/następnika/gałęzie DLA JEDNEJ stacji z `LineRunV1[]`
 * (spec §9: „Źródło danych kierunku: kolejność stacji w line_runs"). Stacja
 * może wystąpić w co najwyżej JEDNYM `LineRunV1.stations[]` — pierwsze
 * dopasowanie w kolejności wejścia (deterministyczne, P7).
 */
export function resolveStationDirectionContext(
  input: ResolveStationDirectionContextInput,
): StationDirectionContext {
  const { lineRuns, stationId, gpzNodeCode, stationCodeOf } = input;

  for (const run of lineRuns) {
    const hasStation = run.stations.some((s) => s.substation_ref === stationId);
    if (!hasStation) continue;

    const sorted = [...run.stations].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.substation_ref === stationId);
    const prevEntry = sorted[idx - 1];
    const nextEntry = sorted[idx + 1];

    let previousNodeCode: string | null;
    if (prevEntry) {
      previousNodeCode = stationCodeOf(prevEntry.substation_ref);
    } else if (run.run_kind === 'branch' && run.branch_origin_station_ref) {
      // Pierwsza stacja GAŁĘZI: poprzednikiem jest stacja macierzysta
      // (odgałęzienia), NIE GPZ (spec §9: dla PIERWSZEGO POLA głównego ciągu
      // poprzednikiem jest GPZ — gałąź nie jest głównym ciągiem).
      previousNodeCode = stationCodeOf(run.branch_origin_station_ref);
    } else {
      previousNodeCode = gpzNodeCode;
    }

    const nextNodeCode = nextEntry ? stationCodeOf(nextEntry.substation_ref) : null;

    // F10.2 (spec §19.2): nazwa TEGO ciągu (`run.name`) niesie oba końce
    // (poprzednik/następnik) — stacja jest członkiem JEDNEGO ciągu.
    const runName = run.name?.trim() || null;

    // F10.2 (spec §19.2): pary {code,name} FILTROWANE łącznie po `code`, żeby
    // `branchRunNames` pozostało index-aligned do `branchNodeCodes` (usunięcie
    // wpisu z nierozwiązywalnym kodem NIE może rozjechać dwóch osobnych tablic).
    const branchEntries = lineRuns
      .filter((r) => r.branch_origin_station_ref === stationId)
      .map((r) => {
        const first = [...r.stations].sort((a, b) => a.order - b.order)[0];
        const code = first ? stationCodeOf(first.substation_ref) : null;
        return { code, name: r.name?.trim() || null };
      })
      .filter((entry): entry is { code: string; name: string | null } => entry.code != null);
    const branchNodeCodes = branchEntries.map((e) => e.code);
    const branchRunNames = branchEntries.map((e) => e.name);

    return { previousNodeCode, nextNodeCode, branchNodeCodes, runName, branchRunNames };
  }

  return {
    previousNodeCode: null,
    nextNodeCode: null,
    branchNodeCodes: [],
    runName: null,
    branchRunNames: [],
  };
}

// ---------------------------------------------------------------------------
// 2. Podpis JEDNEGO pola + przypisanie podpisów do wszystkich pól stacji.
// ---------------------------------------------------------------------------

export interface BayDirectionCaptionArgs {
  readonly direction: LineBayDirection | null;
  readonly context: StationDirectionContext;
  /** Indeks TEGO pola wśród pól ODGAŁĘŹNYCH tej stacji (0-based) — używany
   *  WYŁĄCZNIE gdy `direction === 'branch'`; ignorowany w pozostałych
   *  przypadkach. */
  readonly branchIndex: number;
  /** Fallback z ENM (`bay.designation`) gdy brak danych ciągu (spec §9) —
   *  NIGDY nie zwracany surowy jako 'WE'/'WY'/'ODG' (patrz `fallbackCaption`). */
  readonly designationFallback?: string | null;
}

/** F10.2 (spec §19.2, D2): łączy nazwę/numer linii z tekstem kierunku wg
 *  formatu wyroczni `line_bay_caption_probe`: `⟨numer linii⟩ · kier. ⟨kod⟩`.
 *  Brak nazwy (dane linii nieobecne) — DEGRADACJA do samego tekstu kierunku
 *  (`kier. ⟨kod⟩`/`odg. ⟨kod⟩`), NIE błąd (spec §19.2 „brak danych linii =
 *  sam kier. ⟨kod⟩"). */
function combineLineCaption(lineName: string | null, directionText: string): string {
  return lineName ? `${lineName} · ${directionText}` : directionText;
}

/**
 * Podpis kierunku JEDNEGO pola (spec §9/§19.2): `⟨numer linii⟩ · kier. ⟨kod⟩`
 * dla poprzednika/następnika (gdy nazwa ciągu dostępna — `context.runName`),
 * `⟨numer linii⟩ · odg. ⟨kod⟩` dla odgałęzienia (`context.branchRunNames`),
 * degradacja do samego `kier./odg. ⟨kod⟩` gdy nazwa linii nieobecna, `null`
 * dla pól bez kierunku liniowego (TR — etykieta osobno, spec: `TR1 · 630
 * kVA`). Fallback na `bay.designation`, gdy dane ciągu NIEDOSTĘPNE dla
 * danego węzła (kod nierozwiązany) — ale NIGDY surowe 'WE'/'WY'/'ODG'.
 */
export function bayDirectionCaption(args: BayDirectionCaptionArgs): string | null {
  switch (args.direction) {
    case 'previous':
      return args.context.previousNodeCode != null
        ? combineLineCaption(args.context.runName, `kier. ${args.context.previousNodeCode}`)
        : fallbackCaption(args.designationFallback);
    case 'next':
      return args.context.nextNodeCode != null
        ? combineLineCaption(args.context.runName, `kier. ${args.context.nextNodeCode}`)
        : fallbackCaption(args.designationFallback);
    case 'branch': {
      const code = args.context.branchNodeCodes[args.branchIndex];
      const name = args.context.branchRunNames[args.branchIndex] ?? null;
      return code != null ? combineLineCaption(name, `odg. ${code}`) : fallbackCaption(args.designationFallback);
    }
    case null:
      return null;
  }
}

/**
 * Podpisy kierunku WSZYSTKICH pól stacji, index-aligned do `snBays` (spec
 * §4/§5.1/§9) — gotowe wejście dla `measure.ts` (`StationMeasureInput.
 * bayDirectionCaptions`) i `labels.ts` (`PortCaptionOwnerInput.text`).
 */
export function stationBayCaptions(
  snBays: readonly MiniBlockBayDescriptor[],
  context: StationDirectionContext,
): readonly (string | null)[] {
  const lineBayIndices: number[] = [];
  snBays.forEach((bay, index) => {
    if (isLineLikeRole(bay.fieldRole)) lineBayIndices.push(index);
  });

  let branchIndex = 0;
  return snBays.map((bay, index) => {
    const lineBayPosition = lineBayIndices.indexOf(index);
    const direction = classifyLineBayDirection(bay.fieldRole, lineBayPosition);
    const thisBranchIndex = direction === 'branch' ? branchIndex++ : -1;
    return bayDirectionCaption({
      direction,
      context,
      branchIndex: thisBranchIndex,
      designationFallback: bay.designation,
    });
  });
}
