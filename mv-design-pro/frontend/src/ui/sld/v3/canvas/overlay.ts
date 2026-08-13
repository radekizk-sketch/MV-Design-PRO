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
import {
  faultFlowColorTokenForWeight,
  relativeFlowWeight,
  type FaultFlowColorToken,
  type ShortCircuitFlowOverlayInput,
} from '../../../sld-overlay/ShortCircuitFlowOverlayAdapter';
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
   * Karta S-B (ZWARCIA-PRO pkt 7, domknięcie GAP V12K-120): strzałki kierunku
   * rozpływu PRĄDU ZWARCIOWEGO per ODCINEK (`meta.ownerRef` — TA SAMA
   * tożsamość LOD-niezależna i TA SAMA przestrzeń refów co `flowByOwnerRef`:
   * `branch_id` wiersza kanonicznego == realny `segmentRef` adaptera, dowód:
   * adapter W-C `ShortCircuitFlowOverlayAdapter` kluczuje elementy gałęzi
   * `branch_id`/'LineBranch' — ta sama przestrzeń co `RawOverlayPayload.
   * elements[ref_id]`, patrz nagłówek pliku). Źródło danych: kanał
   * `useOverlayStore.faultFlow` (wiersz kanoniczny `branch_contributions`,
   * kierunek "from_to"/"to_from" WPROST z FROZEN solvera). Brak wpisu = brak
   * danych rozpływu dla odcinka (§14.2 „overlay wyłączony bez wyniku") —
   * kanwa NIE rysuje strzałki (nie fabrykuje, nie crashuje).
   */
  readonly faultFlowByOwnerRef?: Readonly<Record<string, SegmentFaultFlowOverlay>>;
  /**
   * Karta SLD-P (GAP zarejestrowany w V12K-120/121: „znacznik pulse punktu
   * zwarcia w v3"): ref elementu punktu zwarcia z TEGO SAMEGO kanału co
   * strzałki wyżej (`ShortCircuitFlowOverlayInput.fault_element_ref` —
   * `useOverlayStore.faultFlow`, `row.element_id ?? row.target_id` z ekranu
   * zwarć, `usePokazZwarcieNaSchemacie`). Adapter W-C
   * (`adaptShortCircuitFlowToOverlay`) emituje ten sam ref jako pierwszy
   * element `OverlayPayloadV1` (CRITICAL+pulse) — kanwa v3 dotąd tego nie
   * renderowała (GAP). Rozwiązanie do pozycji ekranowej: `SldCanvasV3.
   * computeFaultPointMarkerPlacement` (dopasowanie po `meta.ownerRef` w
   * scenie EFEKTYWNEGO LOD — symbol lub odcinek geometryczny). Brak wpisu =
   * brak znacznika (§14.2 „overlay wyłączony bez wyniku"), zero fabrykacji.
   */
  readonly faultPointMarkerRef?: string;
  /**
   * S9-2 (AUDYT_JAKOSCI_SLD_2026-08 W-1 „brak znacznika punktu zwarcia"):
   * WSZYSTKIE punkty zwarcia BIEŻĄCEGO przebiegu — nie tylko ten wskazany
   * ręcznie z ekranu zwarć. Bieg zwarciowy liczy komplet punktów
   * (`build_execution_result_set` emituje jeden wiersz na punkt), więc po
   * biegu schemat ma pokazać, GDZIE liczono zwarcia, bez dodatkowego kliknięcia.
   * Refy w przestrzeni RYSUNKU (`meta.ownerRef`, jak `faultPointMarkerRef`).
   * Zbiór pusty / pole nieobecne ⇒ zachowanie sprzed karty (sam
   * `faultPointMarkerRef`).
   */
  readonly faultPointMarkerRefs?: ReadonlySet<string>;
  /**
   * F4/SLD (V12K-092, karta SLD-02 §3.5 „badge wynikowy OLTC"): pozycja
   * końcowa zaczepu + liczba przełączeń per TRANSFORMATOR (`meta.ownerRef`
   * symbolu `transformer2W` sceny = `transformerRef` = ENM `ref_id`, TA SAMA
   * przestrzeń co `element_ref` gałęzi transformatora w resultset_v1 —
   * `build_execution_result_set` kluczuje `element_id or branch_id` gałęzi,
   * którym dla transformatora jest jego `ref_id`, IDENTYCZNIE jak flow overlay
   * dla odcinków). WYŁĄCZNIE post-calc z wyniku solvera (`oltc_control` →
   * resultset_v1 metryki `TAP_POSITION`/`TAP_SWITCH_COUNT`, V12K-089) — ZERO
   * fizyki w UI, ZERO fabrykacji. Brak wpisu = brak wyniku regulacji dla tego
   * transformatora (§14.2 „overlay wyłączony bez wyniku") — kanwa NIE rysuje
   * badge. Uzupełnia glif design-state OLTC z tabliczki (V12K-091): tabliczka
   * pokazuje NASTAWĘ z modelu, badge pokazuje WYNIK po obliczeniu.
   */
  readonly oltcByOwnerRef?: Readonly<Record<string, TransformerOltcOverlay>>;
  /**
   * W4 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §8): LICZBOWE etykiety wynikowe
   * per element (`meta.ownerRef` — TA SAMA przestrzeń refów co pozostałe kanały)
   * — U przy węzłach, obciążenie przęseł, S/straty TR, P/Q generacji (ZE ZNAKIEM,
   * §16), Ik″/ip/Ith przy węzłach. Budowane przez `resultLabels.ts::
   * buildResultLabelsFromScene` WYŁĄCZNIE z `RawOverlayPayload` (ZERO fizyki w
   * UI, formatowanie 1:1). Warstwa RENDERU osobna (`sld-v3-result-labels`),
   * bramkowana odrębnym layerem `resultLabels` (nie `resultOverlays`) —
   * użytkownik włącza liczby niezależnie od strzałek. Brak wpisu = brak
   * metryk dla elementu (zero placeholderów). Typ zaimportowany lokalnie w
   * rendererze/workspace (`ResultLabelEntry`) — tu `unknown`-neutralny alias,
   * by uniknąć cyklu import (resultLabels.ts importuje `SceneV3`, nie ten plik
   * poza `orientedSegmentRefs`).
   */
  readonly resultLabelsByOwnerRef?: Readonly<Record<string, import('./resultLabels').ResultLabelEntry>>;
  /**
   * R2 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.8): flaga NIEAKTUALNOŚCI wyników
   * względem modelu (Case Immutability Rule — zmiana modelu unieważnia wynik
   * przypadku). KONSUMOWANA z ISTNIEJĄCEGO statusu ważności (`SldCanvasV3
   * Workspace` przewierca `useAppStateStore.activeCaseResultStatus === 'OUTDATED'`
   * — ten sam status, którego używa hook świeżości `ui2/freshness/useSwiezosc
   * Wynikow`; ZAKAZ równoległego trackera zmian modelu w warstwie SLD). `true`
   * ⇒ kanwa wyszarza etykiety wyników i pokazuje baner „⚠ wyniki nieaktualne"
   * (etykiety NIE znikają — inżynier ma widzieć, że wartości są stare). Brak/
   * `false` ⇒ prezentacja normalna. Zero fizyki, zero zgadywania — sam sygnał.
   */
  readonly resultsStale?: boolean;
  /**
   * Deklaracja POCHODZENIA nakładki (spec §14.2 „overlay wyłącznie z
   * wyniku", program P-A): z którego przypadku obliczeniowego pochodzą
   * wartości i czy solver zbiegł. Kanwa renderuje badge
   * `sld-v3-overlay-provenance` (róg arkusza) — operator ZAWSZE widzi,
   * czyj wynik ogląda; brak pola = nakładka bez deklaracji (rysunek bazowy
   * lub nakładka cząstkowa bez wyniku przypadku) — badge nie renderuje się.
   */
  readonly provenance?: {
    readonly caseRef?: string;
    readonly converged?: boolean;
    /** R3 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.7): nazwa MODUŁU obliczeniowego
     *  (etykieta polska z `analysis_type` payloadu — istniejący słownik analiz
     *  `workspace/analysisRunContract.formatContractValue`, ZERO nowego słownika).
     *  „Nie zakładać, że użytkownik pamięta aktywny moduł.” */
    readonly analysisTypeLabel?: string;
    /** R3 (wym. 7): identyfikator PRZEBIEGU (`RawOverlayPayload.run_id`) — z
     *  którego biegu solvera pochodzą wartości. */
    readonly runId?: string;
    /** OVERLAY-TIMESTAMP (domyka dług R3/V12K-165): CZAS UKOŃCZENIA BIEGU już
     *  sformatowany polskim formatterem repo (`workspace/routerDisplayHelpers.
     *  formatDateTime`) z `RawOverlayPayload.run_finished_at` (← realny
     *  `CanonicalRun.finished_at`). Kanon V12K-159 wym. 6-7: dane pochodzenia
     *  MUSZĄ nieść timestamp. Brak/`undefined` ⇒ badge NIE renderuje wiersza
     *  czasu (uczciwy brak, zero fabrykacji czasu we froncie). */
    readonly completedAtLabel?: string;
  };
  /**
   * P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8 pkt 5, karta P0.6/G-22): werdykt
   * SWZ (samoczynne wyłączenie zasilania, IEC 60364-4-41) per APARAT odpływu
   * nN — NOWA metryka w nakładce, ADDYTYWNA (zero zmian kanałów U/ΔU/I/
   * loading/Ik wyżej). Klucz = `ownerRef` aparatu odpływu (ENM `ref_id`
   * gałęzi switch/fuse — TA SAMA przestrzeń refów co `nnBreaker`/
   * `nnFuseSwitch` na scenie, `compose/station.ts` `sourceRef`). Źródło:
   * endpoint SWZ per obwód (`GET /{case_id}/enm/swz`, P0.6/G-22) —
   * `buildSwzOverlayFromResponses` niżej WYŁĄCZNIE przepisuje gotowy werdykt
   * 3-stanowy (ZERO fizyki w UI, mapper FROZEN backendu nietknięty). Brak
   * wpisu = brak werdyktu dla tego aparatu (§14.2 „overlay wyłączony bez
   * wyniku") — kanwa NIE rysuje badge'a, nie fabrykuje statusu.
   */
  readonly swzByOwnerRef?: Readonly<Record<string, SwzOverlayEntry>>;
}

// ---------------------------------------------------------------------------
// P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8 pkt 5) — nakładka SWZ: budowniczy
// CZYSTY (§14.2, wzorzec `buildFlowOverlayFromScene`) z odpowiedzi endpointu
// SWZ per obwód (karta P0.6/G-22, `application/analyses/swz/service.py`
// `build_swz_view`) → prezentacja werdyktu 3-stanowego. ZERO fizyki w UI:
// wartości przepisane 1:1 z odpowiedzi backendu, żadna nie jest przeliczana.
// ---------------------------------------------------------------------------

/** Werdykt 3-stanowy SWZ (`network_model/solvers` przez `analyses/swz/
 *  werdykt.py::SwzStatus`, mirror łańcuchów wartości) — trzeci stan
 *  (`'nierozstrzygalne'`) jest OBOWIĄZKOWY (karta P0.6 §0.3): fail-closed,
 *  nigdy „spełnia" bez dowodu liczbowego. */
export type SwzVerdictStatus = 'spełnia' | 'nie spełnia' | 'nierozstrzygalne';

/** Wpis nakładki SWZ jednego aparatu odpływu — WYŁĄCZNIE odczyt z
 *  odpowiedzi endpointu (`SwzApiResponse.swz`), formatowanie dozwolone
 *  (§10), fizyka nie. */
export interface SwzOverlayEntry {
  readonly ownerRef: string;
  readonly status: SwzVerdictStatus;
  readonly przyczynaPl: string;
  readonly ik1MinA: number;
  readonly iaWymaganeA: number | null;
  readonly tWymaganyS: number | null;
  readonly margines: number | null;
}

/**
 * Kształt odpowiedzi `GET /{case_id}/enm/swz?station_ref&bus_ref&breaker_ref`
 * (karta P0.6/G-22, `build_swz_view`) — WYŁĄCZNIE pola czytane przez
 * budowniczy niżej (envelope pełny niesie też `fault_loop_min_scenario`/
 * `missing_data`/`reason_pl`, nieużywane tutaj — warstwa prezentacji SLD
 * potrzebuje wyłącznie gotowego werdyktu, nie śladu solvera pętli zwarcia).
 */
export interface SwzApiResponse {
  readonly status: 'OK' | 'brak danych' | 'nie dotyczy';
  readonly breaker_ref: string;
  readonly swz?: {
    readonly status: SwzVerdictStatus;
    readonly przyczyna_pl: string;
    readonly ik1_min_a: number;
    readonly ia_wymagane_a: number | null;
    readonly t_wymagany_s: number | null;
    readonly margines: number | null;
  };
}

/**
 * Zbuduj nakładkę SWZ z odpowiedzi endpointu per obwód (karta P0.6/G-22,
 * §14.2 „overlay wyłącznie z wyniku"). `status !== 'OK'` (envelope: „brak
 * danych" — solver nie mógł policzyć pętli / „nie dotyczy" — układ nie-TN)
 * ⇒ WPIS POMINIĘTY, uczciwy brak, zero fabrykacji werdyktu bez dowodu.
 * Deterministyczna: to samo wejście ⇒ identyczny wynik (zero DOM/losowości/
 * Date, wzorzec `buildFlowOverlayFromScene`).
 */
export function buildSwzOverlayFromResponses(
  responses: readonly SwzApiResponse[],
): Readonly<Record<string, SwzOverlayEntry>> {
  const out: Record<string, SwzOverlayEntry> = {};
  for (const r of responses) {
    if (r.status !== 'OK' || !r.swz) continue;
    out[r.breaker_ref] = {
      ownerRef: r.breaker_ref,
      status: r.swz.status,
      przyczynaPl: r.swz.przyczyna_pl,
      ik1MinA: r.swz.ik1_min_a,
      iaWymaganeA: r.swz.ia_wymagane_a,
      tWymaganyS: r.swz.t_wymagany_s,
      margines: r.swz.margines,
    };
  }
  return out;
}

/**
 * Ton prezentacji werdyktu SWZ — CZYSTA klasyfikacja STATUSU na jedną z
 * trzech klas renderu (`ok`/`fail`/`unknown`; kolor/ikonę dobiera renderer,
 * ta funkcja WYŁĄCZNIE nazywa klasę). Zero progów liczonych w UI —
 * klasyfikacja WPROST z gotowego, 3-stanowego werdyktu backendu (§0.3 karty
 * P0.6: `'nierozstrzygalne'` fail-closed, nigdy cichy fallback na `'ok'`).
 */
export type SwzPresentationTone = 'ok' | 'fail' | 'unknown';

export function swzPresentationTone(status: SwzVerdictStatus): SwzPresentationTone {
  if (status === 'spełnia') return 'ok';
  if (status === 'nie spełnia') return 'fail';
  return 'unknown';
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

/**
 * F4/SLD (V12K-092) — badge wynikowy OLTC jednego transformatora. `tapPosition`
 * = pozycja końcowa zaczepu z regulacji load-flow (`TAP_POSITION`, całkowita);
 * `switchCount` = liczba przełączeń (`TAP_SWITCH_COUNT`, opcjonalna — brak w
 * wyniku ⇒ nieobecna, NIE fabrykowana jako 0). WYŁĄCZNIE odczyt z metryk
 * resultset_v1 (§10: formatowanie dozwolone, fizyka nie).
 */
export interface TransformerOltcOverlay {
  readonly ownerRef: string;
  readonly tapPosition: number;
  readonly switchCount?: number;
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
 * S9-2 (AUDYT_JAKOSCI_SLD_2026-08 W-1 „0 strzałek rozpływu") — ORIENTACJA
 * odcinka względem gałęzi modelu: `segmentRef → forward`, gdzie `forward`
 * mówi, czy `points[0]` narysowanego odcinka leży po stronie `from_bus_ref`
 * gałęzi. Zbiór kluczy zastępuje bramkę `singleHopSegmentRefs` w kanałach
 * wynikowych (przepływ mocy, etykiety przęseł).
 *
 * DLACZEGO ZMIANA (pomiar na żywej sieci, nie teoria): kryterium F-1 wymagało,
 * by OBA terminale odcinka rozwiązywały się do STACJI (`ownerRef`). Ciąg SN
 * budowany operacjami domenowymi kończy KAŻDY odcinek magistrali węzłem
 * `bus/…/downstream` (mufa, `visual_role: INLINE_TERMINAL`) — węzeł bez
 * właściciela-stacji. Na zmierzonej sieci (GPZ + stacja z szablonu) zbiór F-1
 * był PUSTY dla wszystkich trzech odcinków, więc rozpływ nie miał ANI JEDNEJ
 * strzałki i ANI JEDNEJ etykiety gałęziowej — na każdej realnej sieci, nie w
 * przypadku brzegowym.
 *
 * DOWÓD ORIENTACJI (dana, nie domysł): terminale odcinka niosą `busRef`
 * (rozwiązywalny także dla mufy — to węzeł modelu, tylko nierysowany), a gałąź
 * ENM niesie `from_bus_ref`/`to_bus_ref`. Orientacja jest UDOWODNIONA, gdy para
 * `(fromTerminal.busRef, toTerminal.busRef)` jest równa parze gałęzi
 * (`forward = true`) albo jej dokładnym odwróceniem (`forward = false`).
 * Jakikolwiek inny układ (brak busRef, para wskazująca inne węzły) ⇒ BRAK
 * wpisu: uczciwe „nie wiem" zamiast strzałki w losową stronę.
 *
 * Konwencja `points[0]`: kolejność `segmentPaths` = kolejność geometryczna
 * trasy (`buildCorridorRunGeometry`), a `points[0]` odcinka sceny leży po
 * stronie POCZĄTKU trasy — ta sama konwencja, na której opierała się bramka
 * F-1 (patrz jej nagłówek), tu jedynie udowodniona refem węzła zamiast
 * właścicielem stacji.
 */
export function orientedSegmentRefs(snapshot: EnergyNetworkModel): ReadonlyMap<string, boolean> {
  const sldData = buildSldDataFromSnapshot(snapshot, snapshot.logical_views ?? null, null);
  const branchEnds = new Map<string, { readonly from: string; readonly to: string }>();
  for (const branch of snapshot.branches ?? []) {
    if (branch.from_bus_ref && branch.to_bus_ref) {
      branchEnds.set(branch.ref_id, { from: branch.from_bus_ref, to: branch.to_bus_ref });
    }
  }
  const oriented = new Map<string, boolean>();
  for (const run of sldData.cableRuns ?? []) {
    for (const sp of run.segmentPaths ?? []) {
      const ends = branchEnds.get(sp.segmentRef);
      const fromBus = sp.fromTerminal?.busRef;
      const toBus = sp.toTerminal?.busRef;
      if (!ends || !fromBus || !toBus) continue;
      if (fromBus === ends.from && toBus === ends.to) oriented.set(sp.segmentRef, true);
      else if (fromBus === ends.to && toBus === ends.from) oriented.set(sp.segmentRef, false);
    }
  }
  return oriented;
}

/**
 * GAP V12K-121 (karta SLD-W): rozszerzenie bramki F-1 na przęsła
 * WIELOKAWAŁKOWE (≥2 gałęzie ENM łączone węzłem BEZ stacji — mufa) — DLA
 * STRZAŁEK ZWARCIOWYCH WYŁĄCZNIE (`buildFaultFlowOverlayForSnapshot`, nie
 * `buildFlowOverlayForSnapshot`/przepływ mocy — zakres karty). Zwraca zbiór
 * `segmentRef` — po JEDNYM na przęsło wielokawałkowe (przedstawiciel do
 * jednej strzałki, patrz niżej), do UNII z `orientedSegmentRefs` w
 * wywołaniu bramki (S9-2: dowód per-CZŁON; ta funkcja dowodzi per-ŁAŃCUCH —
 * oba dowody wywodzą orientację z refów węzłów, więc unia jest unią przypadków
 * UDOWODNIONYCH, nie sumą dowodu i założenia).
 *
 * DOWÓD (nie zgadywanie — kryteria odmowy zwracają po prostu mniej/nic):
 * 1. Łańcuch = maksymalny ciąg KOLEJNYCH wpisów `cableRun.segmentPaths`
 *    (kolejność elektryczna z konstrukcji adaptera, `buildCorridorRunGeometry`
 *    w `enmToSldAdapter.ts`), gdzie KAŻDE przejście i→i+1 jest dowiedzione
 *    TOŻSAMOŚCIĄ WĘZŁA (`toTerminal(i).busRef === fromTerminal(i+1).busRef`
 *    — busRef, nie ownerRef/stacja, bo węzeł pośredni nie ma właściciela).
 *    Dowolna gałąź zadeklarowana ODWROTNIE (from/to zamienione względem
 *    kierunku łańcucha) NIGDY nie przejdzie tego dopasowania w SWOIM
 *    slocie (jej `to`/`from` wskazywałyby fizycznie inny węzeł) — „kierunki
 *    mieszane" przerywają łańcuch W TYM MIEJSCU, uczciwe „nie wiem" dla
 *    reszty.
 * 2. Węzeł łączący (mufa) MUSI być użyty DOKŁADNIE 2 razy w CAŁYM modelu
 *    (policzone ze WSZYSTKICH `cableRuns`) — inaczej to węzeł rozgałęziony
 *    (T-złącze), a kierunek przestaje być jednoznaczny (odmowa, nie zgadywanie
 *    które ramię jest „dalej").
 * 3. Węzeł łączący MUSI być bez właściciela stacji (`ownerRef` null) — jeśli
 *    pośredni wpis jest jednak realną stacją, to DWA osobne przęsła
 *    jednokawałkowe (już obsłużone przez `orientedSegmentRefs`), nie jedno
 *    wielokawałkowe — pomijamy scalanie.
 * 4. Granice łańcucha (pierwszy `fromTerminal`, ostatni `toTerminal`) MUSZĄ
 *    rozwiązywać się do realnej stacji — dowiedziona granica przęsła
 *    (dowód granicy przęsła).
 * Łańcuch krótszy niż 2 gałęzie (pojedynczy człon) pomijamy — to już
 * `orientedSegmentRefs`, nie duplikujemy.
 *
 * PRZEDSTAWICIEL (jedna strzałka na przęsło, nie jedna na człon): spośród
 * członów łańcucha WIDOCZNYCH jako własny odcinek sceny w TEJ scenie/LOD
 * (§16-v3 dzieli geometrię proporcjonalnie do długości — degeneracja przy
 * krótkiej trasie zostawia widoczny WYŁĄCZNIE ostatni człon, patrz
 * `buildScene.ts::connectRowStations`), wybieramy NAJDŁUŻSZY kawałek
 * (`scene.segments[...].points`, suma długości Manhattan) — TYLKO jego
 * `segmentRef` trafia do zwracanego zbioru. Orientacja tego przedstawiciela
 * jest UDOWODNIONA identycznie jak w F-1 (jego WŁASNY `fromTerminal`/
 * `toTerminal` odpowiada `points[0]`/`points[last]` JEGO WŁASNEGO kawałka —
 * dowód pkt 1: skoro CAŁY łańcuch jest niedowrócony i uporządkowany zgodnie
 * z kolejnością tablicy `segmentPaths` [= kolejność geometrii
 * `buildCorridorRunGeometry`/podziału `splitPolylineIntoPieces`], każdy człon,
 * łącznie z przedstawicielem, ma `fromTerminal`=strona bliższa początkowi
 * przęsła, `toTerminal`=strona bliższa końcowi — TA SAMA konwencja co
 * pojedynczy człon jednokawałkowy). Remis długości: wygrywa pierwszy w
 * kolejności `scene.segments` (deterministyczne, stabilna kolejność budowy
 * sceny). Człon niewidoczny w TEJ scenie (zdegenerowany podział) po prostu
 * nie bierze udziału w wyborze — jeśli JEDYNY widoczny człon łańcucha to
 * ostatni (fallback), to on automatycznie zostaje przedstawicielem.
 */
export function multiHopFaultFlowSegmentRefs(
  scene: SceneV3,
  snapshot: EnergyNetworkModel,
): ReadonlySet<string> {
  const sldData = buildSldDataFromSnapshot(snapshot, snapshot.logical_views ?? null, null);
  const runs = sldData.cableRuns ?? [];

  // Użycie KAŻDEGO busRef jako końcówki (`fromTerminal`/`toTerminal`) w CAŁYM
  // modelu — węzeł pośredni łańcucha musi wystąpić DOKŁADNIE 2 razy (kryterium
  // odmowy 2 wyżej: rozgałęzienie).
  const busUsage = new Map<string, number>();
  const bump = (busRef: string | null | undefined): void => {
    if (!busRef) return;
    busUsage.set(busRef, (busUsage.get(busRef) ?? 0) + 1);
  };
  for (const run of runs) {
    for (const sp of run.segmentPaths ?? []) {
      bump(sp.fromTerminal?.busRef);
      bump(sp.toTerminal?.busRef);
    }
  }

  const groups: Array<ReadonlySet<string>> = [];
  for (const run of runs) {
    const paths = run.segmentPaths ?? [];
    let i = 0;
    while (i < paths.length) {
      if (!paths[i].fromTerminal?.busRef || !paths[i].toTerminal?.busRef) {
        i += 1;
        continue;
      }
      let j = i;
      while (j + 1 < paths.length) {
        const joinBusRef = paths[j].toTerminal?.busRef;
        const nextFrom = paths[j + 1].fromTerminal;
        if (
          !joinBusRef ||
          !nextFrom?.busRef ||
          nextFrom.busRef !== joinBusRef ||
          nextFrom.ownerRef || // węzeł pośredni musi być mufą, nie stacją (kryterium 3)
          (busUsage.get(joinBusRef) ?? 0) !== 2 // rozgałęzienie (kryterium 2)
        ) {
          break;
        }
        j += 1;
      }
      if (j > i && paths[i].fromTerminal?.ownerRef && paths[j].toTerminal?.ownerRef) {
        groups.push(new Set(paths.slice(i, j + 1).map((p) => p.segmentRef)));
      }
      i = j + 1;
    }
  }
  if (groups.length === 0) return new Set();

  // Wybór przedstawiciela — najdłuższy kawałek WIDOCZNY w tej scenie/LOD.
  const lengthByRef = new Map<string, number>();
  const orderByRef = new Map<string, number>();
  scene.segments.forEach((segment, index) => {
    const ref = segment.meta?.ownerRef;
    if (!ref || segment.meta?.elementKind !== 'segment' || lengthByRef.has(ref)) return;
    let length = 0;
    for (let p = 0; p + 1 < segment.points.length; p += 1) {
      length += Math.abs(segment.points[p + 1].x - segment.points[p].x) + Math.abs(segment.points[p + 1].y - segment.points[p].y);
    }
    lengthByRef.set(ref, length);
    orderByRef.set(ref, index);
  });

  const chosen = new Set<string>();
  for (const group of groups) {
    let bestRef: string | null = null;
    let bestLength = -1;
    let bestOrder = Number.POSITIVE_INFINITY;
    for (const ref of group) {
      const length = lengthByRef.get(ref);
      if (length === undefined) continue; // człon niewidoczny w tej scenie — poza wyborem
      const order = orderByRef.get(ref) ?? Number.POSITIVE_INFINITY;
      if (length > bestLength || (length === bestLength && order < bestOrder)) {
        bestRef = ref;
        bestLength = length;
        bestOrder = order;
      }
    }
    if (bestRef) chosen.add(bestRef);
  }
  return chosen;
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
 * wyłączony bez wyniku" — zero atrap). `orientationByRef` (S9-2, wymagany —
 * patrz `orientedSegmentRefs` wyżej): wpis kierunku powstaje WYŁĄCZNIE dla
 * odcinka, którego ref jest w mapie — orientacja nieudowodniona (ref rysunkowy,
 * niezgodność węzłów) ⇒ brak wpisu, nie błędna strzałka.
 */
export function buildFlowOverlayFromScene(
  scene: SceneV3,
  payload: RawOverlayPayload | null,
  orientationByRef: ReadonlyMap<string, boolean>,
): Readonly<Record<string, SegmentFlowOverlay>> {
  if (!payload || !isLoadFlowPayload(payload)) return {};
  const out: Record<string, SegmentFlowOverlay> = {};
  for (const segment of scene.segments) {
    const ownerRef = segment.meta?.ownerRef;
    if (!ownerRef || segment.meta?.elementKind !== 'segment') continue;
    // S9-2: bramka i ZWROT z JEDNEGO źródła (`orientedSegmentRefs`) — odcinek
    // bez udowodnionej orientacji nie dostaje strzałki, a odcinek z orientacją
    // dostaje ją zgodnie z zadeklarowanym kierunkiem gałęzi, nie z założeniem
    // „points[0] to zawsze strona from".
    const orientedForward = orientationByRef.get(ownerRef);
    if (orientedForward === undefined) continue;
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
      // Zwrot strzałki = znak wyniku ZŁOŻONY z orientacją odcinka: `P_MW` to
      // `p_from_mw` (konwencja gałęzi from→to), więc moc dodatnia płynie wzdłuż
      // `points[0]→points[last]` TYLKO wtedy, gdy `points[0]` jest stroną
      // „from". ZERO fizyki: obie składowe to dane (znak z solvera, orientacja
      // z refów węzłów gałęzi).
      forward: (p.value >= 0) === orientedForward,
      p,
      q: readMetricReading(payload, ownerRef, FLOW_METRIC_CODE_Q),
      i: readMetricReading(payload, ownerRef, FLOW_METRIC_CODE_I),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Karta S-B (ZWARCIA-PRO pkt 7) — budowniczy CZYSTY strzałek kierunku rozpływu
// prądu zwarciowego: scena + wejście kanału kierunku (lub `null`) →
// `faultFlowByOwnerRef`. TEN SAM wzorzec co `buildFlowOverlayFromScene`
// (bramka F-1 `trustedSingleHopRefs`, zero DOM/Date, determinizm) i TA SAMA
// klasyfikacja tercylowa co adapter W-C (`faultFlowColorTokenForWeight` —
// jedna prawda skali/koloru). Zero fizyki: kierunek i wartości WYŁĄCZNIE z
// danych solvera (wiersz kanoniczny `branch_contributions`).
// ---------------------------------------------------------------------------

/** Tokeny kierunku FROZEN solvera (`ShortCircuitBranchContribution.direction`,
 *  `short_circuit_iec60909.py`) — kierunek względem pary from/to GAŁĘZI. */
const FAULT_DIRECTION_FROM_TO = 'from_to';
const FAULT_DIRECTION_TO_FROM = 'to_from';

/**
 * Strzałka rozpływu zwarciowego jednego odcinka — kierunek + największy wkład.
 * `forward`: `true` gdy kierunek solvera to "from_to" — geometrycznie TA SAMA
 * konwencja co `SegmentFlowOverlay.forward` (`points[0]` = strona
 * `fromTerminal` = strona „from" gałęzi dla przęseł jednokawałkowych, patrz
 * kontrakt F-1 wyżej i test kontraktu w `overlay.test.ts`). `iKa` = NAJWIĘKSZY
 * wkład tej gałęzi [kA] (ta sama wielkość, którą adapter W-C waży tercylowo —
 * `maxKa` grupy; superpozycja per źródło nie sumuje się prezentacyjnie bez
 * fazy, więc max jest jedyną uczciwą pojedynczą liczbą). `payloadMaxKa` =
 * największy wkład CAŁEGO wejścia — baza skali względnej grubości strzałki
 * (prymityw `FaultContributionArrow.computeStrokeWidth` z `maxMagnitudeKa` =
 * ta wartość ⇒ grubość ∝ waga względna, spójnie z adapterem W-C).
 */
export interface SegmentFaultFlowOverlay {
  readonly ownerRef: string;
  readonly forward: boolean;
  readonly iKa: number;
  readonly payloadMaxKa: number;
  readonly colorToken: FaultFlowColorToken;
}

/** Wpis rozpływu po bramce mierzalności: znany token kierunku + skończone
 *  `i_ka > 0` (wpis bez prądu mierzalnego nie niesie podstawy strzałki). */
interface MeasurableFaultEntry {
  readonly direction: string;
  readonly iKa: number;
}

/**
 * Nakładka strzałek zwarciowych DLA JEDNEJ sceny (jeden LOD) — WOŁAJĄCY
 * (`SldCanvasV3Workspace.tsx`, wzorzec `buildFlowOverlayForSnapshot`) łączy
 * trzy LOD-y w jeden słownik (ownerRef = tożsamość LOD-niezależna).
 * `input==null` (brak kanału kierunku w `useOverlayStore.faultFlow`) ⇒ `{}`
 * (strzałki WYŁĄCZONE — §14.2 „overlay wyłączony bez wyniku", zero atrap).
 * Bramki uczciwości (każda = brak wpisu, nigdy błędna strzałka):
 *  - ref poza `orientationByRef` (S9-2: orientacja odcinka względem gałęzi
 *    nieudowodniona — ref rysunkowy albo niezgodność węzłów);
 *  - wpisy gałęzi o MIESZANYCH kierunkach (różne źródła pchają w przeciwne
 *    strony — jedna strzałka byłaby fabrykacją wypadkowej bez fazy);
 *  - brak wpisu z mierzalnym `i_ka` (kierunek bez wartości nie ma skali).
 *
 * GAP V12K-121 (karta SLD-W): `orientationByRef` może nieść UNIĘ
 * `orientedSegmentRefs(snapshot)` ∪ przedstawicieli
 * `multiHopFaultFlowSegmentRefs(scene, snapshot)` — wołający
 * (`buildFaultFlowOverlayForSnapshot`) dokłada tych ostatnich do tej samej
 * mapy; ta funkcja nie rozróżnia pochodzenia refu.
 */
export function buildFaultFlowOverlayFromScene(
  scene: SceneV3,
  input: ShortCircuitFlowOverlayInput | null,
  orientationByRef: ReadonlyMap<string, boolean>,
): Readonly<Record<string, SegmentFaultFlowOverlay>> {
  if (!input) return {};
  const byBranch = new Map<string, MeasurableFaultEntry[]>();
  for (const flow of input.flows) {
    if (flow.direction !== FAULT_DIRECTION_FROM_TO && flow.direction !== FAULT_DIRECTION_TO_FROM) continue;
    if (flow.i_ka === null || !Number.isFinite(flow.i_ka) || flow.i_ka <= 0) continue;
    const list = byBranch.get(flow.branch_id) ?? [];
    list.push({ direction: flow.direction, iKa: flow.i_ka });
    byBranch.set(flow.branch_id, list);
  }
  if (byBranch.size === 0) return {};
  let payloadMaxKa = 0;
  for (const entries of byBranch.values()) {
    for (const entry of entries) {
      if (entry.iKa > payloadMaxKa) payloadMaxKa = entry.iKa;
    }
  }
  const out: Record<string, SegmentFaultFlowOverlay> = {};
  for (const segment of scene.segments) {
    const ownerRef = segment.meta?.ownerRef;
    if (!ownerRef || segment.meta?.elementKind !== 'segment') continue;
    if (ownerRef in out) continue; // deterministyczny: pierwszy odcinek wygrywa (ten sam ownerRef ⇒ ten sam wpis)
    const orientedForward = orientationByRef.get(ownerRef);
    if (orientedForward === undefined) continue;
    const entries = byBranch.get(ownerRef);
    if (!entries) continue;
    const direction = entries[0].direction;
    if (entries.some((entry) => entry.direction !== direction)) continue;
    let iKa = 0;
    for (const entry of entries) {
      if (entry.iKa > iKa) iKa = entry.iKa;
    }
    out[ownerRef] = {
      ownerRef,
      // S9-2: zwrot składa kierunek SOLVERA (token gałęzi from→to) z ORIENTACJĄ
      // odcinka na rysunku — ta sama reguła co przepływ mocy wyżej, jedno
      // źródło orientacji dla obu kanałów.
      forward: (direction === FAULT_DIRECTION_FROM_TO) === orientedForward,
      iKa,
      payloadMaxKa,
      colorToken: faultFlowColorTokenForWeight(relativeFlowWeight(iKa, payloadMaxKa)),
    };
  }
  return out;
}

/** §14.2 „overlay wyłączony bez wyniku": brak wpisów ⇒ zero strzałek. */
export function isFaultFlowOverlayEmpty(
  faultFlowByOwnerRef: Readonly<Record<string, SegmentFaultFlowOverlay>> | undefined,
): boolean {
  return !faultFlowByOwnerRef || Object.keys(faultFlowByOwnerRef).length === 0;
}

/**
 * Wyrocznia (dowód, nie założenie — wzorzec `flowOverlayValuesTraceToPayload`):
 * każdy wpis strzałki musi wywodzić się z wejścia kanału kierunku — `forward`
 * zgodne z JEDNOLITYM tokenem kierunku mierzalnych wpisów tej gałęzi, `iKa`
 * BAJT-RÓWNE największemu mierzalnemu `i_ka` gałęzi. `false` przy pierwszym
 * rozjeździe (fabrykacja/nieaktualność) — test negatywny dowodzi, że gryzie.
 */
export function faultFlowOverlayTracesToInput(
  faultFlowByOwnerRef: Readonly<Record<string, SegmentFaultFlowOverlay>> | undefined,
  input: ShortCircuitFlowOverlayInput | null,
  /** S9-2: orientacja odcinków użyta przy budowie (ta sama mapa, co w
   *  builderze). Domyślnie pusta ⇒ orientacja `true` (points[0] po stronie
   *  „from"), czyli reguła sprzed karty — wyrocznia pozostaje zgodna dla
   *  wołających, którzy jej nie podają. */
  orientationByRef: ReadonlyMap<string, boolean> = new Map(),
): boolean {
  if (!faultFlowByOwnerRef) return true;
  for (const [ownerRef, entry] of Object.entries(faultFlowByOwnerRef)) {
    const measurable = (input?.flows ?? []).filter(
      (flow) =>
        flow.branch_id === ownerRef &&
        (flow.direction === FAULT_DIRECTION_FROM_TO || flow.direction === FAULT_DIRECTION_TO_FROM) &&
        flow.i_ka !== null &&
        Number.isFinite(flow.i_ka) &&
        flow.i_ka > 0,
    );
    if (measurable.length === 0) return false;
    const oriented = orientationByRef.get(ownerRef) ?? true;
    const expectedDirection =
      entry.forward === oriented ? FAULT_DIRECTION_FROM_TO : FAULT_DIRECTION_TO_FROM;
    if (measurable.some((flow) => flow.direction !== expectedDirection)) return false;
    let maxKa = 0;
    for (const flow of measurable) {
      if ((flow.i_ka as number) > maxKa) maxKa = flow.i_ka as number;
    }
    if (entry.iKa !== maxKa) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// F4/SLD (V12K-092) — budowniczy CZYSTY badge wynikowego OLTC (§14.2/§3.5):
// scena + wynik solvera (lub `null`) → `oltcByOwnerRef`. Ten SAM wzorzec co
// `buildFlowOverlayFromScene`: allowlista LOAD_FLOW, klucz `ownerRef` symbolu
// `transformer2W` (= `transformerRef` = `element_ref` gałęzi), zero DOM/Date.
// ---------------------------------------------------------------------------

/** Kody metryk OLTC (`result_builder_v1.py` `_METRIC_MAP`, V12K-089):
 *  `TAP_POSITION`/`TAP_SWITCH_COUNT` (całkowite, `format_hint="fixed0"`). */
const OLTC_METRIC_CODE_POSITION = 'TAP_POSITION';
const OLTC_METRIC_CODE_SWITCHES = 'TAP_SWITCH_COUNT';

/**
 * Badge wynikowy OLTC DLA JEDNEJ sceny (jeden LOD) — WOŁAJĄCY
 * (`SldCanvasV3Workspace.tsx`) łączy WSZYSTKIE trzy LOD-y w jeden słownik
 * (`ownerRef` = tożsamość LOD-niezależna, ten sam `transformerRef` na każdym
 * LOD). `payload==null` lub przebieg NIE-rozpływowy (allowlista
 * `isLoadFlowPayload`) ⇒ `{}` (badge WYŁĄCZONY, §14.2 „overlay wyłączony bez
 * wyniku"). Wpis powstaje WYŁĄCZNIE dla symbolu klasy `transformer` z
 * mierzalną `TAP_POSITION` w `payload.elements[ownerRef]` — transformator bez
 * regulacji (brak metryki, resultset addytywny V12K-089) ⇒ brak badge, nie 0.
 */
export function buildOltcOverlayFromScene(
  scene: SceneV3,
  payload: RawOverlayPayload | null,
): Readonly<Record<string, TransformerOltcOverlay>> {
  if (!payload || !isLoadFlowPayload(payload)) return {};
  const out: Record<string, TransformerOltcOverlay> = {};
  for (const symbol of scene.symbols) {
    const ownerRef = symbol.meta?.ownerRef;
    if (!ownerRef || symbol.meta?.elementKind !== 'transformer') continue;
    if (ownerRef in out) continue; // deterministyczny: pierwszy symbol wygrywa
    const posMetric = getMetric(payload, ownerRef, OLTC_METRIC_CODE_POSITION);
    if (!posMetric || posMetric.value === null || posMetric.value === undefined) continue;
    const switchMetric = getMetric(payload, ownerRef, OLTC_METRIC_CODE_SWITCHES);
    out[ownerRef] =
      switchMetric && switchMetric.value !== null && switchMetric.value !== undefined
        ? { ownerRef, tapPosition: posMetric.value, switchCount: switchMetric.value }
        : { ownerRef, tapPosition: posMetric.value };
  }
  return out;
}

/** §14.2 „overlay wyłączony bez wyniku": brak wpisu OLTC ⇒ badge pusty. */
export function isOltcOverlayEmpty(
  oltcByOwnerRef: Readonly<Record<string, TransformerOltcOverlay>> | undefined,
): boolean {
  return !oltcByOwnerRef || Object.keys(oltcByOwnerRef).length === 0;
}

/**
 * Wyrocznia (dowód, nie założenie): każda wartość badge OLTC musi być
 * BAJT-RÓWNA wartości pod tym samym kodem metryki w `payload.elements[
 * ownerRef]`. Zwraca `false` przy pierwszym rozjeździe (fabrykacja/
 * nieaktualność) — test negatywny dowodzi, że wyrocznia gryzie.
 */
export function oltcOverlayTracesToPayload(
  oltcByOwnerRef: Readonly<Record<string, TransformerOltcOverlay>> | undefined,
  payload: RawOverlayPayload | null,
): boolean {
  if (!oltcByOwnerRef) return true;
  for (const [ownerRef, entry] of Object.entries(oltcByOwnerRef)) {
    const el = payload?.elements[ownerRef];
    if (!el) return false;
    const pos = el.metrics?.[OLTC_METRIC_CODE_POSITION];
    if (!pos || pos.value !== entry.tapPosition) return false;
    if (entry.switchCount !== undefined) {
      const sw = el.metrics?.[OLTC_METRIC_CODE_SWITCHES];
      if (!sw || sw.value !== entry.switchCount) return false;
    }
  }
  return true;
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
