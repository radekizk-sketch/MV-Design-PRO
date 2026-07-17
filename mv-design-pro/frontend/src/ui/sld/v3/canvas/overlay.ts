/**
 * SLD V3 F6b — kontrakt nakładki stanu kanwy (SLD_CAD_SPEC_V3 §6 „Hierarchia
 * graficzna": P5 energizacja = KOLOR nakładki, NIE geometria; REBUILD_PLAN_V3
 * F6b). Stany łączników (closed/open/unknown) NIE są tu — to GEOMETRIA glifu,
 * już zdecydowana w `PreviewSymbol.state` przez `buildSceneV3` (dane ENM),
 * spec §6 „Stany łączników: wypełnienie/kąt symbolu (jak dziś w kanonicznym)".
 *
 * ---------------------------------------------------------------------------
 * F8b-1 (REBUILD_PLAN_V3 §F8b, zadanie „parytet funkcjonalny v3" — C):
 * STOP-notatka F6b PONIŻEJ ROZSTRZYGNIĘTA. Podłączone w `SldCanvasV3
 * Workspace.tsx` (`useEnergizationOverlay`/`buildEnergizationOverlay`) —
 * WOŁAJĄCY mapuje refs→testId przez `PreviewSymbol.meta.ownerRef`/
 * `PreviewSegment.meta.ownerRef` (F8b-1 A, `buildScene.ts` — spłata długu k1
 * opisanego niżej: odcinki NIESĄ ownerRef/elementKind, patrz `classifyStation
 * SegmentKind`/`connectRowStations`/GPZ mappery). Kontrakt `SldV3Overlay`
 * (`energizedByTestId`) NIETKNIĘTY — ownerRef→testId dzieje się w Workspace,
 * DOKŁADNIE jak przewidziała ta notatka, nie w `SldCanvasV3`.
 *
 * ---------------------------------------------------------------------------
 * F9.5 (REBUILD_PLAN_V3 §F9.5, „Nakładka przepływu mocy" — spec §14.2):
 * ---------------------------------------------------------------------------
 * ŹRÓDŁO (śledztwo zakresu tej dostawy, patrz raport agenta): STOP-notatka
 * niżej wskazywała `SldPowerFlowCompanion` jako „kandydata na F9.5" —
 * ZWERYFIKOWANE PONOWNIE tu: `SldPowerFlowCompanion` jest NADAL martwy w
 * drzewie produkcyjnym (`SldWorkspaceContainer.tsx` wciąż woła adapter z
 * `powerFlow=undefined`) — NIE wskrzeszony. Zamiast tego:
 * `useRawResultOverlayStore` (`ui/sld-overlay/rawResultOverlayStore.ts`)
 * JEST prawdziwym, produkcyjnie osiągalnym kanałem — zasilany przez
 * `App.tsx` (fetch `/api/execution/runs/{run_id}/results/v1`) NIEZALEŻNIE
 * od tego, która wersja kanwy (v2/v3) jest zamontowana (globalny store
 * zustand, poza drzewem SLD). Klucz `RawOverlayPayload.elements[ref_id]`
 * dla gałęzi = realny `segmentRef`/`branch_id` — TA SAMA przestrzeń co
 * `PreviewSegment.meta.ownerRef` dla segmentów `elementKind==='segment'`
 * (dowód: `scene/buildScene.ts` `incomingSegmentRef` zwraca DOKŁADNIE
 * `SegmentTerminalRef.segmentRef` z `cableRun.segmentPaths` — ten sam
 * `sp.segmentRef`, którego v2 `ResultOverlayLayer.tsx` (`payload.elements[
 * sp.segmentRef]`) już używa jako klucza). Zero nowego mapowania refów
 * potrzebne — `buildFlowOverlayFromScene` niżej czyta wprost po `ownerRef`.
 *
 * DŁUG SPŁACONY W F9.6 (c) (historia — luka istniała w chwili dostawy F9.5,
 * patrz `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md` F9.6):
 * `enm/canonical_analysis.py::build_execution_result_set` dla
 * `run.analysis_type == "PF"` wołała WYŁĄCZNIE `build_bus_results(run)`
 * (węzły: U_kV/kąt) — NIGDY `build_branch_results(run)` (istniejącej,
 * poprawnej funkcji zwracającej `p_mw`/`q_mvar`/`i_a` per gałąź, użytej
 * gdzie indziej przez `/analysis-runs/{run_id}/results/branches`), więc
 * `RawOverlayPayload.elements` dla LOAD_FLOW nie niosło elementów gałęzi.
 * F9.6 (c) dołożyła pętlę po `build_branch_results(run)` w tej samej gałęzi
 * PF (aliasując `p_mw`/`q_mvar` na klucze `p_from_mw`/`q_from_mvar`
 * rozpoznawane przez `_METRIC_MAP`, zero zmiany `build_branch_results` ani
 * `PowerFlowResult` — Frozen Result API nietknięte) — `buildFlowOverlayFromScene`
 * niżej dostaje dziś realne dane na KAŻDYM przebiegu LOAD_FLOW (test kontraktu:
 * `backend/tests/test_canonical_analysis_api.py
 * ::test_resultset_v1_includes_branch_elements_for_load_flow`). Dodatkowo
 * naprawiono (d): v2 `ResultOverlayLayer.tsx`/`SldCanvasV2.tsx` czytały kod
 * metryki `'Q_MVAR'` (wielkie litery), podczas gdy backend
 * (`result_builder_v1.py` `_METRIC_MAP`) emituje kod `'Q_Mvar'` (mieszana
 * wielkość liter) — rozjazd kluczy, Q nigdy się nie rozwiązywał nawet w v2;
 * `buildFlowOverlayFromScene` niżej używa POPRAWNEGO kodu `'Q_Mvar'`
 * (zweryfikowanego wprost w źródle backendu) od zawsze, nie kopiował błędu v2.
 * ZNALEZISKO POZA ZAKRESEM F9.6 — NAPRAWIONE w F9.8 (2026-07-15, patrz
 * `docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md` §F9.8 i `PLANS.md` §3.-1):
 * weryfikacja (f) na realnej sieci referencyjnej ujawniła, że znak
 * `p_from_mw` zwracany przez `canonical_analysis.py`'s PF pipeline dla
 * prostej sieci zasilanie→odbiór wychodził PRZECIWNY do znaku uzyskanego z
 * tych samych R/X/P/Q wprost przez `PowerFlowInput`/`PQSpec` (niskopoziomowy
 * solver) — podwójna negacja: `enm/mapping.py::map_enm_to_network_graph`
 * buduje `Node.active_power` w konwencji generacyjnej (celowo, przybite
 * testem `test_enm_mapping.py`), a `canonical_analysis.py::_execute_power_flow`
 * przekazywała tę wartość WPROST jako `PQSpec.p_mw`, którą
 * `power_flow_newton_internal.py::build_power_spec_v2` neguje ponownie
 * oczekując konwencji obciążeniowej. Naprawione konwersją gen→load NA
 * GRANICY budowy `PQSpec` (`canonical_analysis.py` oraz analogiczny
 * `application/reference_networks/sld_substrate_power_flow.py`); `mapping.py`
 * i solver NIETKNIĘTE (oba poprawne na własnych warunkach). Dowód fizyczny:
 * `backend/tests/test_canonical_analysis_api.py
 * ::test_resultset_v1_load_flow_direction_and_voltage_drop_are_physically_correct`
 * (p_from_mw>0 zasilanie→odbiór, v_pu(odbiór)<v_pu(zasilanie) na realnym
 * resultset v1). Frontend (ten plik) czyta znak WPROST z wyniku solvera
 * (spec §14.2 — zero własnej heurystyki) — strzałka dziedziczy teraz
 * POPRAWNY kierunek bez żadnej zmiany w tym pliku.
 *
 * PODZIAŁ RÓL (F9.5, po rozszerzeniu autoryzacji przez nadzorcę o
 * `SldCanvasV3.tsx`): ten plik dostarcza kontrakt + budowniczy CZYSTY
 * (`buildFlowOverlayFromScene`, węzłowo bezpieczny — brak DOM/React,
 * importowalny ze `scripts/sld_v3_acceptance.mjs` jak `buildSceneV3`) oraz
 * wyrocznię (`flowOverlayValuesTraceToPayload`). `SldCanvasV3Workspace.tsx`
 * spina go z realnym `useRawResultOverlayStore` i przekazuje do
 * `SldCanvasV3` przez ISTNIEJĄCY prop `overlay`. Rysowanie (grot +
 * wartości, warstwa `sld-v3-flow-overlay`) mieszka w `SldCanvasV3.tsx`
 * (`SceneFlowOverlayNode`/`flowOverlayGeometry`/`formatFlowLabelPl`) —
 * element NAKŁADKI inline SVG, NIE symbol sceny (`symbols/defs.ts`
 * nietknięte: kontrakt siatkowy symbolu nie obejmuje dowolnie obracanego
 * grota wzdłuż trasy).
 *
 * ŹRÓDŁO (uzasadnienie w `SldCanvasV3Workspace.tsx` nagłówek, skrót): ŻADEN z
 * dwóch kandydatów niżej nie jest tym, co v2 faktycznie pokazuje operatorowi
 * dziś — realny mechanizm to fallback topologiczny `buildSupplyPathHighlight`
 * (`v2/canvas/SupplyPathHighlighter.ts`, ZERO fizyki), wywoływany WEWNĄTRZ
 * `enmToSldAdapter.ts::buildSldDataFromSnapshot`, bo `SldWorkspaceContainer`
 * (produkcyjny host v2) NIGDY nie dostarcza solver companion:
 *  (a) `useRawResultOverlayStore` — podłączony w produkcji, ale zasila
 *      METRYKI (odchylenie napięcia/obciążenie/severity), INNY wymiar
 *      nakładki niż boolowa energizacja toru;
 *  (b) `SldPowerFlowCompanion` — architektonicznie „jedna prawda" solverowa,
 *      ale MARTWY w produkcyjnym drzewie renderu (nigdy nie dostarczony do
 *      adaptera przez `SldWorkspaceContainer.tsx`) — kandydat na PRAWDZIWE
 *      podłączenie solvera w F9.5 („Nakładka przepływu mocy").
 *
 * OGRANICZENIE ZNANE (dziedziczone z F6a, SPŁACONE w F8b-1 A): `SceneV3`
 * niesie teraz `meta.ownerRef` per symbol I per segment (stacje, łączniki
 * między stacjami, zejścia lateralne, GPZ) — nakładka energizacji per ODCINEK
 * jest możliwa dla WSZYSTKICH klas segmentu z rozwiązywalnym ownerRef, nie
 * tylko GPZ. Pozostałe znane luki (dokumentacja, NIE regresja): (1) `elementKind`
 * 'apparatus'/'transformer'/'der' mają `ownerRef=bayRef`, który nie odpowiada
 * żadnej kategorii `SupplyPathHighlight` (bus/branch/transformer/substation/
 * generator/source ref) — ŚWIADOMIE wyłączone z nakładki (spec §6: stan
 * łącznika to geometria, nie kolor; próba dopasowania dałaby fałszywe „false"
 * dla WSZYSTKICH aparatów, patrz `SldCanvasV3Workspace.ts`); (2) segmenty GPZ
 * zakotwiczone na `sectionId` (np. `${sectionId}#bus-primary`) nie rozwiązują
 * się przez `SupplyPathHighlight` (sectionId ≠ bus/substation ref) — GPZ
 * wewnętrzne szyny/sekcje bez nakładki, znana luka adaptera (f6-1/f6-3,
 * rozszerzenie sectionId→busRef to zmiana adaptera poza zakresem F8b-1).
 */
import type { RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { getMetric } from '../../../sld-overlay/rawResultOverlayStore';
import type { EnergyNetworkModel } from '../../../../types/enm';
import { buildSldDataFromSnapshot } from '../../v2/canvas/enmToSldAdapter';
import type { SceneV3 } from '../scene/buildScene';

export interface SldV3Overlay {
  /**
   * Energizacja per `testId` elementu sceny (`symbol.meta.testId` /
   * `segment.meta.testId` ze `SceneV3`, patrz ograniczenie znane wyżej dla
   * odcinków bez testId). `true` = pod napięciem (nakładka koloru akcentu),
   * `false` = beznapięciowy (nakładka wygaszenia). Brak wpisu (klucz
   * nieobecny) = brak danych solvera dla tego elementu — kanwa rysuje
   * rysunek bazowy mono, bez nakładki (spec §6 P5).
   */
  readonly energizedByTestId: Readonly<Record<string, boolean>>;
  /**
   * F8b-1 FIX (recenzja): energizacja per `meta.ownerRef` elementu sceny —
   * tożsamość NIEZALEŻNA OD LOD (ten sam element = ten sam ownerRef na
   * każdym poziomie), w odróżnieniu od `testId`, którego FALLBACK jest
   * indeksowy (`sld-v3-segment-${index}`) i KOLIDUJE między LOD-ami
   * (60 vs 390 odcinków) — słownik budowany z trzech LOD-ów nadpisywał
   * wpisy cudzych elementów (odcinek LOD0 #5 dostawał stan odcinka LOD2 #5).
   * Kanwa PREFERUJE ten słownik, gdy element ma `meta.ownerRef`;
   * `energizedByTestId` pozostaje dla elementów bez ownerRef i dla
   * zgodności z istniejącymi konsumentami.
   */
  readonly energizedByOwnerRef?: Readonly<Record<string, boolean>>;
  /**
   * F9.5 (SLD_CAD_SPEC_V3 §14.2 „Wizualizacja przepływu mocy" — nakładka,
   * ZERO fizyki w UI): kierunek + wartości MW/Mvar/A per ODCINEK (`meta.
   * ownerRef` elementu sceny, TA SAMA tożsamość LOD-niezależna co
   * `energizedByOwnerRef` — segmenty nie-GPZ NIOSĄ już `ownerRef` od F8b-1,
   * dług k1 z opisu zadania F9.5 jest SPŁACONY, patrz `scene/buildScene.ts`
   * `incomingSegmentRef`/testy `buildScene.test.ts` „łączniki między
   * stacjami… ownerRef = realny segmentRef"). Klucz `flowByOwnerRef` = TEN
   * SAM `ownerRef`, który dla odcinków klasy `elementKind==='segment'`
   * (§6 kind 'sn'/'lv', czyli tor SN/nN — NIE szyna) JEST realnym
   * `segmentRef` z adaptera (`SegmentTerminalRef`, `enmToSldAdapter.ts`) —
   * IDENTYCZNY klucz przestrzeni co `RawOverlayPayload.elements[ref_id]`
   * dla elementów klasy `branch` (dowód: v2 `ResultOverlayLayer.tsx`
   * `payload.elements[sp.segmentRef]`, ten sam `segmentRef`). Brak wpisu =
   * brak danych solvera dla tego odcinka (§14.2 wyrocznia: „overlay
   * wyłączony bez wyniku") — kanwa NIE rysuje strzałki (nie fabrykuje,
   * nie crashuje).
   */
  readonly flowByOwnerRef?: Readonly<Record<string, SegmentFlowOverlay>>;
  /**
   * Deklaracja POCHODZENIA nakładki (spec §14.2 „overlay wyłącznie z
   * wyniku", program P-A): z którego przypadku obliczeniowego pochodzą
   * wartości i czy solver zbiegł. Kanwa renderuje badge
   * `sld-v3-overlay-provenance` (róg arkusza) — operator ZAWSZE widzi,
   * czyj wynik ogląda; brak pola = nakładka bez deklaracji (rysunek bazowy
   * lub nakładka cząstkowa bez wyniku przypadku) — badge nie renderuje się.
   */
  readonly provenance?: {
    readonly caseRef: string;
    readonly converged: boolean;
  };
}

/** Pojedyncza wartość liczbowa z wyniku solvera + jednostka — WYŁĄCZNIE
 *  odczyt (`RawMetricValue.value`/`unit`), zero przeliczeń fizycznych (§10:
 *  formatowanie dozwolone, fizyka nie). */
export interface FlowMetricReading {
  readonly value: number;
  readonly unit: string;
}

/**
 * Przepływ mocy jednego odcinka — kierunek + do trzech wartości (P/Q/I).
 * `forward`: `true` gdy znak `P_MW` z wyniku jest NIEUJEMNY. Spec §14.2
 * (cytat DOSŁOWNY): „kierunek/wartość każdego odcinka pochodzi z wyniku
 * power-flow (brak wartości wpisanych w UI)" — implementacja realizuje to
 * wymaganie odczytem ZNAKU `P_MW` WPROST z wyniku solvera (r2, korekta
 * F9.7: poprzednia wersja tego komentarza parafrazowała spec jako „kierunek
 * strzałki = znak P z wyniku", co nie jest dosłownym brzmieniem §14.2 —
 * treść niezmieniona, tylko cytat sprowadzony do litery spec), zero
 * interpretacji własnej. Geometryczne
 * znaczenie `forward` (który koniec `segment.points` jest „początkiem"):
 * dla WSZYSTKICH konektorów międzystacyjnych/GPZ→stacja `scene/buildScene.ts`
 * buduje `points[0]` = strona `fromTerminal` (adapter), `points[last]` =
 * strona `toTerminal` — TA SAMA konwencja co znak `p_from_mw` backendu
 * (dodatni = moc płynie OD węzła „from" DO węzła „to", `result_builder_v1.py`
 * `_METRIC_MAP["p_from_mw"]`); `forward=true` ⇒ strzałka `points[0]→points[
 * last]`, `forward=false` ⇒ odwrócona. Renderer (`SldCanvasV3.tsx`
 * `flowOverlayGeometry`) rozwiązuje to geometrycznie — ten kontrakt niesie
 * WYŁĄCZNIE dane, nie rysuje.
 */
export interface SegmentFlowOverlay {
  readonly ownerRef: string;
  readonly forward: boolean;
  readonly p?: FlowMetricReading;
  readonly q?: FlowMetricReading;
  readonly i?: FlowMetricReading;
}

// ---------------------------------------------------------------------------
// F9.5 — budowniczy CZYSTY (§14.2): scena + wynik solvera (lub `null`) →
// `flowByOwnerRef`. Zero DOM/losowości/Date (P7) — determinizm: to samo
// wejście ⇒ identyczny wynik (JSON.stringify porównywalny, patrz test).
// ---------------------------------------------------------------------------

/** Kody metryk backendu (`result_builder_v1.py` `_METRIC_MAP`) — WPROST z
 *  wyniku, zero reinterpretacji. Uwaga `Q_Mvar` (mieszana wielkość liter,
 *  NIE `Q_MVAR` — patrz nagłówek pliku, znaleziony rozjazd z v2). */
const FLOW_METRIC_CODE_P = 'P_MW';
const FLOW_METRIC_CODE_Q = 'Q_Mvar';
const FLOW_METRIC_CODE_I = 'I_A';

/** §14.2 + F-3 (recenzja Opusa): ALLOWLISTA zamiast denylisty — nakładka
 *  czyta WYŁĄCZNIE przebieg rozpływu mocy. Realna wartość emitowana przez
 *  backend dla PF: `"LOAD_FLOW"` (`canonical_analysis.py`
 *  `_execution_analysis_type_for_run`: `run.analysis_type=="PF"` →
 *  `"LOAD_FLOW"`, przenoszone 1:1 przez `build_execution_result_set` →
 *  `build_resultset_v1(analysis_type=...)` → `/api/execution/runs/{run_id}/
 *  results/v1` → `RawOverlayPayload.analysis_type`). Payload NIEZNANEGO typu
 *  (SC_3F, PHASE_STATE_SN, DYNAMIC_STABILITY, SOURCE_COMPLIANCE, przyszłe)
 *  ⇒ nakładka pusta — uczciwe nic zamiast czytania `P_MW` z niewiadomego
 *  przebiegu. Denylista sprzed poprawki przepuszczałaby każdy nowy typ. */
function isLoadFlowPayload(payload: RawOverlayPayload): boolean {
  return (payload.analysis_type?.toLowerCase() ?? '') === 'load_flow';
}

/**
 * F-1 (recenzja Opusa, kryt. 9): zbiór `segmentRef` odcinków JEDNOKAWAŁKOWYCH
 * — jedynych, dla których kierunek strzałki jest UDOWODNIONY geometrycznie.
 *
 * Problem: `PreviewSegment.meta.ownerRef` konektora = `incomingSegmentRef`
 * (`buildScene.ts`) = segmentRef OSTATNIEGO kawałka przęsła (ten, którego
 * `toTerminal.ownerRef === stacja docelowa`). Geometrycznie `points[0]` leży
 * ZAWSZE po stronie stacji poprzedniej. Dla przęsła JEDNOKAWAŁKOWEGO
 * `fromTerminal.ownerRef` tego samego kawałka == stacja poprzednia — strona
 * `points[0]` jest stroną „from" gałęzi, więc znak `p_from_mw` mapuje się na
 * zwrot geometrii wprost (kontrakt testowany w `overlay.test.ts` na realnej
 * scenie). Dla przęsła WIELOKAWAŁKOWEGO „from" gałęzi to węzeł POŚREDNI
 * (mufa) — adapter NIE rozwiązuje tam `ownerRef` (kontrakt adaptera:
 * „ownerRef rozwiązuje się do stacji WYŁĄCZNIE na granicy", nagłówek
 * `buildScene.ts`), orientacja gałęzi w modelu względem przebiegu trasy jest
 * NIEUDOWODNIONA — strzałka mogłaby wskazać źle bez ostrzeżenia. DECYZJA
 * (opcja „uczciwe nie wiem" z recenzji): budowniczy emituje wpis kierunku
 * WYŁĄCZNIE dla refów z tego zbioru; przęsła wielokawałkowe NIE dostają
 * strzałki, dopóki F9.6 nie dostarczy udowodnionej tożsamości per-kawałek.
 *
 * Kryterium członkostwa: kawałek ma OBA terminale rozwiązane
 * (`fromTerminal.ownerRef` i `toTerminal.ownerRef` niepuste) — z kontraktu
 * adaptera wynika, że to zachodzi WYŁĄCZNIE dla kawałka będącego CAŁYM
 * przęsłem granica→granica. Ten sam adapter i to samo wywołanie co
 * `buildSceneV3` (`snapshot.logical_views ?? null`) — zero cienia elektryki.
 *
 * Skutek uboczny (zamierzony, domyka V-2 z recenzji wizualnej): odcinki
 * RYSUNKOWE o refach kompozytowych (`…#der-row-trunk`, `…#lv-drop-…`) nigdy
 * nie są w tym zbiorze — nie są gałęziami solvera, więc nie dostają strzałek
 * ani etykiet (koniec podwójnych etykiet na wierszu DER).
 */
export function singleHopSegmentRefs(snapshot: EnergyNetworkModel): ReadonlySet<string> {
  const sldData = buildSldDataFromSnapshot(snapshot, snapshot.logical_views ?? null, null);
  const refs = new Set<string>();
  for (const run of sldData.cableRuns ?? []) {
    for (const sp of run.segmentPaths ?? []) {
      if (sp.fromTerminal?.ownerRef && sp.toTerminal?.ownerRef) refs.add(sp.segmentRef);
    }
  }
  return refs;
}

function readMetricReading(
  payload: RawOverlayPayload,
  ownerRef: string,
  code: string,
): FlowMetricReading | undefined {
  const metric = getMetric(payload, ownerRef, code);
  if (!metric || metric.value === null || metric.value === undefined) return undefined;
  return { value: metric.value, unit: metric.unit };
}

/**
 * Nakładka przepływu DLA JEDNEJ sceny (jeden LOD) — WOŁAJĄCY
 * (`SldCanvasV3Workspace.tsx`, analogicznie do `buildEnergizationOverlay`)
 * łączy wyniki ze WSZYSTKICH trzech LOD-ów w jeden słownik `flowByOwnerRef`
 * (ownerRef jest tożsamością LOD-niezależną — ten sam realny `segmentRef`
 * na każdym LOD, patrz nagłówek pliku). `payload==null` (brak przebiegu w
 * `useRawResultOverlayStore`) lub przebieg NIE-rozpływowy (allowlista
 * `isLoadFlowPayload`, F-3) ⇒ `{}` (nakładka WYŁĄCZONA, spec §14.2 „overlay
 * wyłączony bez wyniku" — zero atrap). `trustedSingleHopRefs` (F-1, wymagany
 * — patrz `singleHopSegmentRefs` wyżej): wpis kierunku powstaje WYŁĄCZNIE
 * dla odcinka, którego ref jest w zbiorze — kierunek nieudowodniony
 * (przęsło wielokawałkowe / ref rysunkowy) ⇒ brak wpisu, nie błędna strzałka.
 */
export function buildFlowOverlayFromScene(
  scene: SceneV3,
  payload: RawOverlayPayload | null,
  trustedSingleHopRefs: ReadonlySet<string>,
): Readonly<Record<string, SegmentFlowOverlay>> {
  if (!payload || !isLoadFlowPayload(payload)) return {};
  const out: Record<string, SegmentFlowOverlay> = {};
  for (const segment of scene.segments) {
    const ownerRef = segment.meta?.ownerRef;
    if (!ownerRef || segment.meta?.elementKind !== 'segment') continue;
    if (!trustedSingleHopRefs.has(ownerRef)) continue;
    const p = readMetricReading(payload, ownerRef, FLOW_METRIC_CODE_P);
    // §14.2 (dosłownie): „kierunek/wartość pochodzi z wyniku power-flow" —
    // tu zrealizowane jako odczyt znaku P_MW WPROST z wyniku (r2, F9.7:
    // cytat sprowadzony do litery spec, treść bez zmian). Brak P mierzalnego
    // ⇒ brak kierunku wyprowadzalnego ⇒ CAŁY wpis pomijamy
    // (Q/I samodzielnie, bez P, nie niosą kierunku — nie fabrykujemy strzałki
    // bez podstawy w znaku wyniku).
    if (!p) continue;
    out[ownerRef] = {
      ownerRef,
      forward: p.value >= 0,
      p,
      q: readMetricReading(payload, ownerRef, FLOW_METRIC_CODE_Q),
      i: readMetricReading(payload, ownerRef, FLOW_METRIC_CODE_I),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// F9.5 — wyrocznia `flow_overlay_probe` (spec §11.13/§14.2).
// ---------------------------------------------------------------------------

/** §14.2 „overlay wyłączony bez wyniku": brak przebiegu (lub przebieg bez
 *  ani jednej rozwiązanej gałęzi) ⇒ nakładka pusta — zero strzałek, zero
 *  atrap, zero crasha (kanwa woła to na `overlay.flowByOwnerRef ?? {}`). */
export function isFlowOverlayEmpty(flowByOwnerRef: Readonly<Record<string, SegmentFlowOverlay>> | undefined): boolean {
  return !flowByOwnerRef || Object.keys(flowByOwnerRef).length === 0;
}

/**
 * §14.2 „kierunek/wartość każdego odcinka pochodzi z wyniku power-flow (brak
 * wartości wpisanych w UI)": DOWÓD, nie założenie — dla KAŻDEGO wpisu
 * nakładki, każda z niesionych wartości (p/q/i) musi być BAJT-RÓWNA
 * wartości pod tym samym kodem metryki w `payload.elements[ownerRef]`, a
 * `forward` musi być zgodne ze znakiem `p.value`. Zwraca `false` przy
 * PIERWSZYM rozjeździe (fabrykacja/nieaktualność) — używane przez test
 * negatywny (spec §11 wymóg: „test negatywny dowodzący że wyrocznia gryzie").
 */
export function flowOverlayValuesTraceToPayload(
  flowByOwnerRef: Readonly<Record<string, SegmentFlowOverlay>> | undefined,
  payload: RawOverlayPayload | null,
): boolean {
  if (!flowByOwnerRef) return true;
  for (const [ownerRef, entry] of Object.entries(flowByOwnerRef)) {
    // §14.2 (dosłownie: „kierunek/wartość pochodzi z wyniku power-flow"),
    // zrealizowane tu jako: `forward` MUSI odpowiadać znakowi `p.value`
    // NIESIONEGO w tym samym wpisie (nie osobnej wartości) — r2 (F9.7):
    // cytat sprowadzony do litery spec, treść dowodu bez zmian.
    // budowniczy zawsze dołącza `p` (patrz `buildFlowOverlayFromScene`: brak P
    // ⇒ cały wpis pomijany), więc `entry.p` nieobecne tu jest samo w sobie
    // dowodem fabrykacji (kierunek bez podstawy w wyniku).
    if (!entry.p || entry.forward !== (entry.p.value >= 0)) return false;
    const el = payload?.elements[ownerRef];
    if (!el) return false;
    const checks: readonly [FlowMetricReading | undefined, string][] = [
      [entry.p, FLOW_METRIC_CODE_P],
      [entry.q, FLOW_METRIC_CODE_Q],
      [entry.i, FLOW_METRIC_CODE_I],
    ];
    for (const [reading, code] of checks) {
      if (!reading) continue;
      const sourceMetric = el.metrics?.[code];
      if (!sourceMetric || sourceMetric.value !== reading.value || sourceMetric.unit !== reading.unit) return false;
    }
  }
  return true;
}
