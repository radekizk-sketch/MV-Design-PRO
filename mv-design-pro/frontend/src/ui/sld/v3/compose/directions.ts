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
 *  3. `bayApparatusDesignation` (F6b, spłata długu §9 zapisanego w recenzji
 *     F6a) — osobna warstwa: oznacznik APARATU pola (spec §4: „Q0/Q1/T1"),
 *     NIE kierunek. Mieszka w tym pliku, bo współdzieli z (1)/(2) ten sam
 *     zakaz tokenów (`FORBIDDEN_RAW_DIRECTION_TOKENS`, teraz eksportowany) —
 *     `bay.designation` bywa surowym tokenem roli („WE"/„WY"/„ODG") w OBU
 *     kontekstach (kierunek pola vs. oznacznik aparatu).
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

/** Rola pola transformatorowego (spec §3) — predykat WYŁĄCZNIE do numeracji
 *  oznacznika aparatu niżej (`bayApparatusDesignation`). Duplikat minimalnego
 *  jednolinijkowego predykatu z `compose/station.ts` (`isTransformerRole`,
 *  prywatny) — nie eksportujemy jednej wspólnej funkcji dla tak małej
 *  logiki, żeby nie tworzyć dodatkowej zależności w drugą stronę. */
function isTransformerFieldRole(role: FieldRole): boolean {
  return role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER;
}

/**
 * Oznacznik aparatu pola (spec §4: „Q0/Q1/T1") — spłata długu §9 (F6b,
 * REBUILD_PLAN_V3): `bay.designation` z adaptera v2 bywa surowym tokenem
 * ROLI pola (`WE`/`WY`/`ODG`/`TR`/`SPR`/`POM`, patrz `stationFieldDesignation`
 * w `v2/canvas/enmToSldAdapter.ts`), NIE prawdziwym oznacznikiem aparatu —
 * spec §4 chce w tym slocie Q/T, spec §9 zakazuje `WE`/`WY`/`ODG` na
 * rysunku wprost.
 *
 * Reguła:
 *  1. `bay.designation` niepuste i NIE jest zakazanym tokenem kierunku
 *     (`FORBIDDEN_RAW_DIRECTION_TOKENS`) — dane mają PIERWSZEŃSTWO (prawda
 *     danych > konwencja): zwracamy je bez zmian (prawdziwy oznacznik z
 *     danych, np. „Q1", albo inny tekst pola nieobjęty zakazem §9, np.
 *     „TR"/„PV"/„BESS" — te nie są tokenami kierunku, więc nie naruszają §9);
 *  2. inaczej (puste LUB zakazany token) — wyprowadzamy oznacznik
 *     DETERMINISTYCZNIE z roli i pozycji pola w `snBays` (konwencja
 *     energetyczna): pole transformatorowe → `T` + numer WŚRÓD pól
 *     transformatorowych tej stacji; wszystkie inne pola (liniowe/sprzęgło/
 *     pomiar) → `Q` + numer WŚRÓD pól NIE-transformatorowych tej stacji.
 *     Liczenie WYŁĄCZNIE po indeksie w `snBays` (bez `Map`, bez iteracji
 *     niedeterministycznej) — zero losowości, wynik z konstrukcji tablicy.
 *
 * UŻYWANE w DWÓCH miejscach, które MUSZĄ się zgadzać (spec F5: „measure i
 * compose muszą być spójne", nagłówek `compose/station.ts`): `layout/measure.ts`
 * (`bayColumnRequiredWidth` — rezerwacja szerokości sidecara) i
 * `compose/station.ts` (`composeStation` — realny tekst etykiety
 * `ownerKind:'apparatus'`). Jedno źródło prawdy — inaczej rezerwacja miejsca
 * i realny tekst rozjechałyby się przy zmianie konwencji w jednym miejscu.
 */
export function bayApparatusDesignation(
  snBays: readonly MiniBlockBayDescriptor[],
  index: number,
): string {
  const bay = snBays[index];
  const raw = bay.designation.trim();
  if (raw && !FORBIDDEN_RAW_DIRECTION_TOKENS.test(raw)) return raw;

  const wantsTransformer = isTransformerFieldRole(bay.fieldRole);
  let ordinal = 0;
  for (let i = 0; i <= index; i++) {
    if (isTransformerFieldRole(snBays[i].fieldRole) === wantsTransformer) ordinal += 1;
  }
  return wantsTransformer ? `T${ordinal}` : `Q${ordinal}`;
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

    const branchNodeCodes = lineRuns
      .filter((r) => r.branch_origin_station_ref === stationId)
      .map((r) => {
        const first = [...r.stations].sort((a, b) => a.order - b.order)[0];
        return first ? stationCodeOf(first.substation_ref) : null;
      })
      .filter((code): code is string => code != null);

    return { previousNodeCode, nextNodeCode, branchNodeCodes };
  }

  return { previousNodeCode: null, nextNodeCode: null, branchNodeCodes: [] };
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

/**
 * Podpis kierunku JEDNEGO pola (spec §9): `kier. ⟨kod⟩` dla poprzednika/
 * następnika, `odg. ⟨kod⟩` dla odgałęzienia, `null` dla pól bez kierunku
 * liniowego (TR — etykieta osobno, spec: `TR1 · 630 kVA`). Fallback na
 * `bay.designation`, gdy dane ciągu niedostępne dla danego węzła — ale
 * NIGDY surowe 'WE'/'WY'/'ODG'.
 */
export function bayDirectionCaption(args: BayDirectionCaptionArgs): string | null {
  switch (args.direction) {
    case 'previous':
      return args.context.previousNodeCode != null
        ? `kier. ${args.context.previousNodeCode}`
        : fallbackCaption(args.designationFallback);
    case 'next':
      return args.context.nextNodeCode != null
        ? `kier. ${args.context.nextNodeCode}`
        : fallbackCaption(args.designationFallback);
    case 'branch': {
      const code = args.context.branchNodeCodes[args.branchIndex];
      return code != null ? `odg. ${code}` : fallbackCaption(args.designationFallback);
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
