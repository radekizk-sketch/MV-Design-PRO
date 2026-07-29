/**
 * F8a — `SldCanvasV3Workspace`: punkt osadzenia `SldCanvasV3` w aplikacji
 * (REBUILD_PLAN_V3 §F8 „Feature-flag cutoveru"). Analogiczny do
 * `v2/canvas/SldWorkspaceContainer.tsx` (pomiar rozmiaru kontenera, ENM ze
 * WSPÓLNEGO store'a — zero shadow-modelu), ale MINIMALNY: v3 nie ma jeszcze
 * CAD-edycji/drawer/context-menu/DER-palety (spec §10 inwentarz — poza
 * zakresem F8a, to F8b+ pełna migracja funkcjonalna).
 *
 * F8b-1 (REBUILD_PLAN_V3 §F8b, zadanie „parytet funkcjonalny v3 przed
 * usunięciem v2" — B: selekcja z realnym typem, C: nakładka energizacji z
 * realnych wyników) DOMKNĘŁO dwa STOP-y z F8a:
 *
 *  - selekcja (B): `onElementClick` teraz dostaje TAKŻE `meta.ownerRef`/
 *    `meta.elementKind` (`SldCanvasV3.tsx`, `PreviewSymbol.meta` z
 *    `scene/buildScene.ts`, F8b-1 A) — `elementTypeForKind` niżej mapuje
 *    małą, zamkniętą unię `PreviewElementKind` na `ElementType` v2 (literały
 *    zweryfikowane względem `SldWorkspaceContainer.tsx`: 'Station'/
 *    'TransformerBranch'/'Bus'/'LineBranch'/'Switch'; DER generic → 'Generator',
 *    bo `elementKind='der'` nie rozróżnia PV/BESS/generator/FW — mapowanie
 *    v2 PV→PVInverter/BESS→BESSInverter/FW→Generator wymaga danych `Generator.
 *    gen_type`, których scena nie niesie; `'Generator'` jest NAJBLIŻSZYM
 *    istniejącym literałem, poprawa względem dzisiejszego `DescriptiveElement`
 *    dla WSZYSTKICH DER, nie regresja). Fallback `'DescriptiveElement'`
 *    WYŁĄCZNIE dla `elementKind` nieznanego/nieobecnego (id wtedy z
 *    `elementIdFromTestId`, stary heurystyczny fallback — zachowany dla
 *    testId bez `ownerRef`, np. przyszłe symbole poza autoryzacją F8b-1 A);
 *
 *  - nakładka energizacji (C): `useEnergizationOverlay` niżej. ŹRÓDŁO —
 *    `buildSupplyPathHighlight` (`v2/canvas/SupplyPathHighlighter.ts`),
 *    czysta topologia operatorska (BFS od źródeł przez zamknięte łączniki,
 *    ZERO fizyki — jego własny nagłówek: „Reguła architektoniczna: brak
 *    fizyki"). UZASADNIENIE WYBORU (zbadano DWÓCH kandydatów z STOP-notatki
 *    F6b/`overlay.ts`, ŻADEN z nich nie jest tym, co v2 faktycznie pokazuje
 *    dziś operatorowi):
 *    (1) `SldPowerFlowCompanion` — architektonicznie „jedna prawda" dla
 *        energizacji SOLVEROWEJ (`enmToSldAdapter.ts` P-A: `buildSldDataFrom
 *        Snapshot(snapshot, logicalViews, powerFlow)`), ALE `SldWorkspace
 *        Container.tsx:1087` woła adapter z DWOMA argumentami (`buildSldData
 *        FromSnapshot(snapshot, logicalViews)`, `powerFlow=undefined`) —
 *        NIGDY nie dostaje companion w produkcyjnym drzewie renderu. Martwe
 *        w praktyce (ćwiczone tylko w izolowanym `v2/station-rozdzielnia/*`,
 *        które NIE jest zamontowane w drzewie aplikacji — sprawdzone: brak
 *        importu poza własnym katalogiem). STOP: prawdziwe podłączenie
 *        solvera do nakładki v3 to F9.5 („Nakładka przepływu mocy") — kiedy
 *        v2 faktycznie dostanie companion, v3 powinien czytać TEN SAM;
 *    (2) `useRawResultOverlayStore`/`RawOverlayPayload` — faktycznie
 *        podłączony w produkcji (`SldCanvasV2.tsx:792`), ALE zasila
 *        `lfDerived` (odchylenie napięcia %, obciążenie kabla %) i
 *        `computeStationAlarmSeverity` — INNY WYMIAR nakładki (SEWERITY
 *        METRYKI, nie boolowa energizacja toru). Mapowanie tego na
 *        `energizedByTestId` byłoby SEMANTYCZNIE BŁĘDNE (konflacja
 *        „przekroczony próg napięcia" z „pod napięciem"). STOP: kandydat na
 *        OSOBNĄ nakładkę „stan/alarm" w przyszłości (poza zakresem F8b-1 C).
 *    Realny mechanizm v2 (`station.energized`/`cableRun.energized` — kolor
 *    toru w `SldCanvasV2.tsx` `stationReadinessMarker`/`COLOR_FIELD_TRUNK_
 *    ENERGIZED`) to WŁAŚNIE fallback topologiczny `buildSupplyPathHighlight`
 *    wywoływany WEWNĄTRZ `buildSldDataFromSnapshot` (linia „P-A POWER-FLOW
 *    TOR" w `enmToSldAdapter.ts`) — bo `SldWorkspaceContainer` nie dostarcza
 *    companion. Ten SAM wynik jest już eksponowany jako `SldDataPayload.
 *    supplyPath` (`enmToSldAdapter.ts`, komentarz: „Renderery mogą
 *    subskrybować flagę energized... gdy tryb operatorski Pokaż tor
 *    zasilania jest aktywny"). v3 woła `buildSupplyPathHighlight` PROSTO
 *    (lżej niż budowanie całego `SldDataPayload`) — sam wynik jest identyczny.
 *    Mapowanie ref→testId używa `meta.ownerRef` (F8b-1 A) — WYŁĄCZNIE dla
 *    `elementKind` 'station'/'bus'/'segment' (spec §6 P5: stan łącznika to
 *    GEOMETRIA glifu, NIE nakładka koloru — aparaty/transformatory/DER mają
 *    `ownerRef=bayRef`, który nie jest bus/branch/substation/generator refem
 *    w `SupplyPathHighlight`, więc próba dopasowania dałaby fałszywe „false"
 *    (brak = nieznany ref, NIE „beznapięciowy") — apparatus/transformer/der
 *    są ŚWIADOMIE WYŁĄCZONE z nakładki). Bez danych (`ownerRef` nieustawiony,
 *    lub ref nie rozpoznany przez topologię — np. GPZ-wewnętrzne segmenty
 *    kotwiczone na `sectionId`, luka znana z f6-1) → BRAK wpisu w
 *    `energizedByTestId` → rysunek bazowy mono (spec §6 P5) — „Bez danych →
 *    mono" zachowane.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ElementType } from '../../../types';
import { useAppStateStore } from '../../../app-state';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { buildSupplyPathHighlight, isElementEnergized, type SupplyPathHighlight } from '../../v2/canvas/SupplyPathHighlighter';
import {
  previousPayloadForAnalysis,
  useRawResultOverlayStore,
  type RawOverlayPayload,
} from '../../../sld-overlay/rawResultOverlayStore';
// Karta S-B (ZWARCIA-PRO pkt 7): kanał KIERUNKU rozpływu prądu zwarciowego —
// zasilany przez ekran zwarć (`ui2/wyniki/zwarcia/pokazNaSchemacie.ts`,
// `loadFaultFlow` PO `loadOverlay`), czyszczony automatycznie przy podmianie
// overlay (loadOverlay zeruje faultFlow — invariant store'a).
import { useOverlayStore } from '../../../sld-overlay/overlayStore';
import type { ShortCircuitFlowOverlayInput } from '../../../sld-overlay/ShortCircuitFlowOverlayAdapter';
import { buildSldDataFromSnapshot, type SldDataPayload } from '../../v2/canvas/enmToSldAdapter';
import { SldDetailDrawer, type SldDetailDrawerAction, type SldDetailDrawerData, type SldDetailDrawerSavePayload } from '../../v2/canvas/SldDetailDrawer';
import { DerPersistenceApiError, postDerGeneratorConfig } from '../../v2/canvas/derPersistenceApi';
import { notify } from '../../../notifications/store';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { useDerDragDrop, DerPaletteButton, type DerDragKind } from '../../v2/canvas/useDerDragDrop';
import {
  SldContextMenuController,
  type SldContextMenuRequest,
  type SldMenuContext,
} from '../../../context-menu/SldContextMenuController';
import { getMenuActions, type SldElementKindForMenu } from '../../v2/command/SldCommandService';
import { selectStationDistributionTransformers } from '../../../network-build/stationTransformerSelection';
import { useMeasuredSize } from '../../shared/useMeasuredSize';
import {
  buildDerDropDetailDrawerData,
  buildDetailDrawerDataForKind,
  buildStationDetailDrawerData,
  findBayByRef,
  findSubstationByRef,
  mapKindToMenuKind,
} from '../../shared/detailDrawerData';
import {
  DRAWER_ACTION_LABEL_PL,
  parseGpzApparatusSelectionId,
  useSldActionExecutor,
} from '../../shared/sldActionExecutor';
// F12-B (spec §10.1 ARCH-4, plan §F12): sześć ostatnich osiągalnych funkcji
// kontenera v2 bez odpowiednika v3 — patrz sekcja montażu na dole pliku dla
// szczegółowego mapowania na punkty F12-B 1-6.
import { SldExportFormatMenu } from '../../v2/export/SldExportFormatMenu';
import { NetworkHierarchyTree } from '../../v2/domain/NetworkHierarchyTree';
import { buildNetworkHierarchyFromSnapshot } from '../../shared/networkHierarchyFromSnapshot';
import { ProofPacksPanel } from '../../v2/proof/ProofPacksPanel';
import { StationInternalView } from '../../v2/canvas/StationInternalView';
import { buildStationInternalViewData } from '../../shared/stationInternalViewData';
import { LassoSelector, pointInLasso, rectFromPoints, type LassoRect } from '../../v2/canvas/LassoSelector';
import { worldToScreen } from '../../v2/viewport/ViewportController';
import { SYMBOL_DEFS } from '../symbols/defs';
import {
  CANVAS_LAYER_IDS,
  CANVAS_LAYER_LABELS_PL,
  L2_SUBLAYER_IDS,
  L2_SUBLAYER_LABELS_PL,
  L2_SUBLAYER_MEMBERS,
  l2SublayerState,
  toggleL2Sublayer,
  type CanvasLayerId,
  type CanvasLayerVisibility,
  type L2SublayerId,
} from './layers';
import type { ViewportTransform } from './camera';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../scene/buildScene';
import type { PreviewElementKind } from '../compose/preview';
import type { DerSourceKind } from '../compose/sourceKind';
import { SldCanvasV3, type SldElementClickMeta } from './SldCanvasV3';
// SCHEMAT-10 S4 (V12K-135/136): paleta jasna + kadr fit-do-treści WYŁĄCZNIE
// dla toru eksportu — patrz nagłówki `export/exportPalette.ts`/`exportFrame.ts`.
import { applyContentFitFrame } from '../export/exportFrame';
import { toLightTechnicalExportSvg } from '../export/exportPalette';
import {
  buildFaultFlowOverlayFromScene,
  buildFlowOverlayFromScene,
  buildOltcOverlayFromScene,
  multiHopFaultFlowSegmentRefs,
  singleHopSegmentRefs,
  type SegmentFaultFlowOverlay,
  type SegmentFlowOverlay,
  type SldV3Overlay,
  type TransformerOltcOverlay,
} from './overlay';
import {
  applyResultLabelFilter,
  buildResultLabelsFromScene,
  DEFAULT_RESULT_LABEL_FILTER,
  resultLabelsHaveExceedances,
  type ResultLabelComparison,
  type ResultLabelComparisonMode,
  type ResultLabelEntry,
  type ResultLabelFilter,
  type ResultLabelKind,
  type ResultLabelQuantity,
} from './resultLabels';
import { formatContractValue } from '../../../workspace/analysisRunContract';
import { formatDateTime } from '../../../workspace/routerDisplayHelpers';

const MIN_CANVAS_WIDTH_PX = 320;
const MIN_CANVAS_HEIGHT_PX = 240;
// F8c pkt 7: `useMeasuredSize` wyciągnięty do `../../shared/useMeasuredSize.ts`
// (była tu funkcja modułowa duplikująca v2, patrz docstring modułu
// współdzielonego dla pełnego porównania linia-po-linii).

export interface SldCanvasV3WorkspaceProps {
  /** Tryb tylko-do-odczytu — v3 nie ma jeszcze CAD-edycji (spec §10, poza
   *  zakresem F8a), więc propem NIE ma dziś wpływu na renderowaną treść;
   *  przyjmowany dla zgodności sygnatury z `SldWorkspaceContainerProps`
   *  (host `SldRenderHost` przekazuje te same propsy do obu wersji). */
  readonly readOnly?: boolean;
  /** Override szerokości kanwy — używane w testach/wbudowaniu. */
  readonly width?: number;
  /** Override wysokości kanwy — używane w testach/wbudowaniu. */
  readonly height?: number;
  /** Przelotowy prop do `SldCanvasV3.lodOverride` (escape hatch testowy/
   *  embedding, patrz docstring tam) — Workspace go dotąd nie eksponował.
   *  Dodany F8c pkt 3/4 wyłącznie żeby testy mogły deterministycznie
   *  wymusić LOD z widocznymi DER/aparaturą bez symulowania zoomu kółkiem
   *  (domyślny LOD Workspace to 0 — tylko topologia). Brak propa = brak
   *  zmiany zachowania (LOD wynika z kamery jak dziś). */
  readonly lodOverride?: SceneLod;
}

/** `testId` aparatury ma postać `${bayRef}#${symbolId}` (`buildScene.ts`);
 *  L0/NOP mają testId syntetyczne (`sld-v3-l0-*`/`sld-v3-nop-*`) bez `#`.
 *  Wycinamy prefiks przed `#`, żeby dla aparatury `id` odpowiadał realnemu
 *  ENM `ref_id` (jak w v2). FALLBACK — używany WYŁĄCZNIE, gdy klik nie niesie
 *  `meta.ownerRef` (F8b-1 A pokrywa dziś WSZYSTKIE symbole sceny, więc to jest
 *  obrona na przyszłość/nieznane przypadki, nie ścieżka główna). */
function elementIdFromTestId(testId: string): string {
  const hashIndex = testId.indexOf('#');
  return hashIndex >= 0 ? testId.slice(0, hashIndex) : testId;
}

/**
 * F8b-1 B: `PreviewElementKind` → `ElementType` v2 (literały zweryfikowane
 * względem `v2/canvas/SldWorkspaceContainer.tsx`: 'Station' (linia ~1732),
 * 'TransformerBranch' (~1797/1804), 'Bus' (~1818), 'LineBranch' (~1269/1789),
 * 'Switch' (mapa `apparatusKind`→{type:'Switch',...} dla breaker/disconnect_
 * bus/switch_disconnector/earthing_switch/fuse — większość bucketu 'apparatus';
 * CT/VT/cableHead w v2 mapują na 'Measurement'/'PortBranch', ale `elementKind`
 * v3 jest jedną, zamkniętą kategorią 'apparatus' — 'Switch' jest reprezentacją
 * większościową, udokumentowane uproszczenie, NIE regresja: v3 dziś dawał
 * 'DescriptiveElement' dla WSZYSTKICH). DER generic → 'Generator' (patrz
 * nagłówek pliku). F9.4 (runda korekcyjna po recenzji Opusa, F-3): `'source'`
 * (sieć zewnętrzna, glif `gridSource`, `compose/gpz.ts` — ODRĘBNA kategoria
 * od `'der'` od F9.4, patrz `compose/preview.tsx` `PreviewElementKind`
 * docstring) → `'Source'` (literał v2 ISTNIEJE, `ui/types.ts`: „A: GPZ /
 * Źródło SN") — BRAKOWAŁO tej gałęzi (spadała na `default`/`DescriptiveElement`,
 * klik w symbol sieci zewnętrznej nie selekcjonował poprawnego typu).
 * `undefined` dla nierozpoznanej kategorii → wołający spada na
 * `DescriptiveElement`.
 */
export function elementTypeForKind(kind: PreviewElementKind | undefined): ElementType | undefined {
  switch (kind) {
    case 'station':
      return 'Station';
    case 'transformer':
      return 'TransformerBranch';
    case 'der':
      return 'Generator';
    case 'source':
      return 'Source';
    case 'bus':
      return 'Bus';
    case 'segment':
      return 'LineBranch';
    case 'apparatus':
      return 'Switch';
    default:
      return undefined;
  }
}

/**
 * F8c pkt 3 (checklista bramkująca §F8c, „Context-menu"): `PreviewElementKind`
 * v3 → `SldElementKindForMenu` (`SldCommandService`/`SLD_MENU_REGISTRY`,
 * WSPÓŁDZIELONY moduł `context-menu/`) — TA SAMA metoda co
 * `elementTypeForKind` wyżej (jawna, zamknięta tabela, `undefined` = brak
 * menu, NIE zgadywanie). Zweryfikowane względem `v2/canvas/
 * SldWorkspaceContainer.tsx::mapKindToMenuKind` (vocabulary v2 jest
 * SZERSZY — v2 rozróżnia więcej `kind` niż v3 `elementKind` — więc to NIE
 * jest reużycie tamtej funkcji, tylko ANALOGICZNA, mniejsza tabela dla
 * mniejszej unii v3):
 *  - 'station' → 'station' (dopasowanie wprost);
 *  - 'transformer' → 'apparatus' (jak w v2: kind='transformer' →
 *    menuKind='apparatus' — transformator nie ma własnej kategorii menu);
 *  - 'apparatus' → 'apparatus' (dopasowanie wprost);
 *  - 'source' → 'gpz' (sieć zewnętrzna/GPZ, jak w v2 kind='gpz' →
 *    menuKind='gpz' — v3 `elementKind='source'` to TA SAMA kategoria
 *    domenowa, inna nazwa w unii v3, patrz nagłówek pliku F9.4);
 *  - 'bus' → 'section' (szyna/sekcja rozdzielni SN — najbliższy odpowiednik
 *    v2 'section'; v3 nie rozróżnia dziś szyny GPZ od sekcji, jak
 *    `elementTypeForKind('bus') → 'Bus'` niżej nie rozróżnia ich też);
 *  - 'segment' → 'cable_segment_sn' (DOMYŚLNIE — v3 `PreviewSegment.meta.kind`
 *    niesie tylko poziom napięcia (bus/sn/lv/leader/protectionTrip/
 *    measurementLink), NIE rozróżnia kabel-vs-napowietrzna; v2 ma tę samą
 *    niepewność domyślnie na 'cable_segment_sn' gdy kind nie precyzuje
 *    'overhead_line_sn' — UDOKUMENTOWANA LUKA, nie regresja);
 *  - 'der' → kategoria PODTYPU wg `meta.derKind` (DER-MENU-V3, Karta SLD-P,
 *    GAP P-1 — LUKA ZAMKNIĘTA): scena v3 niesie TERAZ `derKind` (REALNA
 *    wartość `SldSourceView.kind` z łańcucha adaptera, `compose/station.ts` →
 *    `scene/buildScene.ts` `meta.derKind`), więc mapowanie na OSOBNE kategorie
 *    v2 działa BEZ zgadywania: `pv → 'der_pv'`, `bess → 'der_bess'`,
 *    `wind → 'der_fw'` (pełne menu podtypu: `open-*-config`/`show-frt-hvrt`/
 *    `delete-*`, `SldCommandService.ts`). `generator`/`unknown` oraz BRAK
 *    `derKind` → 'der' GENERYCZNE (uczciwa degradacja — `domain_no_guessing_
 *    guard`: v2 nie ma osobnej kategorii dla `generator`, a `unknown` to
 *    honest-unknown; menu niesie tylko akcje bez zależności od podtypu
 *    `show-ncrfg`/`show-results`). Testy (a)/(b) w
 *    `__tests__/contextMenu.test.tsx` pokrywają oba tory (derPv → menu podtypu;
 *    derGenerator → menu generyczne);
 *  - 'protectionAnnotation' → `undefined` (adnotacja graficzna, nie obiekt
 *    domenowy — brak odpowiednika w v2/SLD_MENU_REGISTRY).
 */
function elementKindForMenu(
  kind: PreviewElementKind | undefined,
  derKind: DerSourceKind | undefined,
): SldElementKindForMenu | undefined {
  switch (kind) {
    case 'station':
      return 'station';
    case 'transformer':
      return 'apparatus';
    case 'apparatus':
      return 'apparatus';
    case 'source':
      return 'gpz';
    case 'bus':
      return 'section';
    case 'segment':
      return 'cable_segment_sn';
    case 'der':
      // DER-MENU-V3: podtyp z REALNEGO `derKind` — TYLKO trzy rozpoznane
      // rodzaje mapują na osobne kategorie v2; `generator`/`unknown`/brak
      // danych → 'der' generyczne (zero fabrykacji podtypu).
      return derSubtypeMenuKind(derKind);
    default:
      return undefined;
  }
}

/**
 * DER-MENU-V3 (Karta SLD-P): `DerSourceKind` (REALNA wartość łańcucha) →
 * kategoria menu v2. JAWNA, zamknięta tabela — WYŁĄCZNIE `pv`/`bess`/`wind`
 * mają osobne kategorie (`der_pv`/`der_bess`/`der_fw`, `SLD_MENU_REGISTRY`);
 * `generator` (brak kategorii v2), `unknown` (honest-unknown) i `undefined`
 * (brak danych) degradują do 'der' generycznego — NIGDY domysł podtypu
 * (`domain_no_guessing_guard`).
 */
function derSubtypeMenuKind(derKind: DerSourceKind | undefined): SldElementKindForMenu {
  switch (derKind) {
    case 'pv':
      return 'der_pv';
    case 'bess':
      return 'der_bess';
    case 'wind':
      return 'der_fw';
    case 'generator':
    case 'unknown':
    case undefined:
      return 'der';
  }
}

/**
 * F11.4-B / ARCH-4 (spec §10.1 „pełna migracja budowniczych danych drawera"):
 * `elementKind` v3 → `kind` przyjmowany przez `buildDetailDrawerDataForKind`
 * (`shared/detailDrawerData.ts` — TA SAMA wartość co v2 `onSelectElement`
 * `kind`). JAWNA, zamknięta tabela; `undefined` = drawer się NIE otwiera dla
 * tego `elementKind` (bez zgadywania).
 *  - 'station' → 'station' (dopasowanie wprost, działa od F8c pkt 2).
 *  - 'source' → 'gpz' (sieć zewnętrzna — v2 `kind==='gpz'` mapuje na TEN SAM
 *    drawer 'station' przez `mapKindToDrawerKind`; `ownerRef` dla `source`
 *    to `Source.id` ENM, INNY namespace niż `Substation.ref_id` — gdy
 *    budowniczy nie znajdzie pasującej stacji, zwraca `null` (uczciwy brak,
 *    NIE crash) zgodnie z regułą tej funkcji).
 *  - 'segment' → 'cable_segment_sn' (realny drawer `cable_run` przez
 *    `buildCableRunDetailDrawerData`; v3 nie rozróżnia dziś kabel/napowietrzna
 *    — ta sama niepewność co domyślne zachowanie v2 opisane przy
 *    `elementKindForMenu` wyżej).
 *  - 'bus' → 'section' — `mapKindToDrawerKind('section')` nie rozpoznaje
 *    tego `kind` (zwraca `null`), TAK SAMO jak w v2 (v2 nigdy nie miał
 *    dedykowanego drawera sekcji/szyny) — jawna tabela zamiast pominięcia
 *    kategorii, żeby przyszły drawer sekcji zadziałał tu bez zmian w v3.
 *  - 'transformer'/'apparatus' → OBSŁUGIWANE OSOBNO w
 *    `buildDetailDrawerDataForElementKind` (nie tą tabelą) — `meta.ownerRef`
 *    dla tych `elementKind` w kompozycji stacji to BAY ref, NIE ref
 *    konkretnego urządzenia/transformatora (`compose/station.ts`, linia
 *    `ownerRef: s.bayRef ?? s.sourceRef` — scena v3 nie niesie osobnego
 *    identyfikatora per symbol). Budowniczy `buildStationBranchDetailDrawerData`
 *    przyjmuje `id` jako ref DOMENOWY; surowe przekazanie bayRef
 *    prowadziłoby do arbitralnego doboru `stationContext`
 *    (`sldData.stations[0]`, fallback ostatniego wyboru poprawny w v2 —
 *    tam `id` zawsze rozwiązywalny — ale NIE w v3). Dlatego transformer/
 *    apparatus mają DEDYKOWANĄ ścieżkę rozwiązywania stacji-właściciela
 *    poniżej zamiast wpisu w tej tabeli.
 *  - 'der' → `undefined` (poza przepływem drop-z-palety, gdzie `derKind`
 *    jest ZNANY z akcji użytkownika — `buildDerDropDetailDrawerData` wyżej).
 *    DER-MENU-V3 (Karta SLD-P) domknęła kanał danych rodzaju DER dla MENU
 *    (`meta.derKind` niesie TERAZ realny `SldSourceView.kind`, patrz
 *    `elementKindForMenu` wyżej), ale NIE dla drawera: drawer typu `'der'`
 *    w `SldDetailDrawer.tsx` (domyślne `data?.derKind ?? 'PV'`, ok. linii 421)
 *    to FORMULARZ TWORZENIA nowego DER (przepływ dropu), a nie panel
 *    ISTNIEJĄCEGO źródła — nie istnieje builder danych drawera dla
 *    klikniętego, już obecnego DER (odpowiednik `buildStationDetailDrawerData`
 *    dla stacji). Domyślne „PV" jest więc domyślną wartością FORMULARZA
 *    kreacji (gdzie `derKind` i tak zawsze pochodzi z akcji dropu), NIE
 *    fabrykacją rodzaju istniejącego DER — v3 nie otwiera dziś drawera dla
 *    klika w istniejący DER. Zbudowanie takiego panelu (z `meta.derKind`
 *    jako realnym rodzajem) to ODRĘBNY dostawca poza zakresem menu (raport
 *    DER-MENU-V3, jawny dług), nie luka domykalna tym samym kanałem.
 *  - 'protectionAnnotation' → `undefined` (adnotacja graficzna, nie obiekt
 *    domenowy).
 */
function elementKindForDrawer(kind: PreviewElementKind | undefined): string | undefined {
  switch (kind) {
    case 'station':
      return 'station';
    case 'source':
      return 'gpz';
    case 'segment':
      return 'cable_segment_sn';
    case 'bus':
      return 'section';
    default:
      return undefined;
  }
}

/**
 * Rozwiązuje `Substation.ref_id` właściciela bay-a (`Bay.substation_ref`,
 * ENM FK — realna relacja, NIE zgadywanie) z `bayRef`, którą `apparatus`
 * niesie jako `meta.ownerRef` w kompozycji STACJI (`compose/station.ts`,
 * `ownerRef: s.bayRef ?? s.sourceRef`).
 *
 * UDOKUMENTOWANA LUKA (zweryfikowana empirycznie, fixture
 * `sldSubstrate52s.enm.json`): dla `apparatus` GPZ (`compose/gpz.ts`
 * `gpzSymbolToPreview`, `ownerRef: sourceRef ?? bayRef ?? transformerRef ??
 * sectionId` — TEN SAM priorytet `bayRef`) bay GPZ NIE JEST rekordem
 * `snapshot.bays` (`findBayByRef` zwraca `null` — bay GPZ żyje w odrębnej
 * substrukturze GPZ, nie w płaskiej liście `Bay` ENM) — funkcja zwraca wtedy
 * `null`, KOREKTA `stationCode` w `buildDetailDrawerDataForElementKind`
 * niżej cicho nie następuje (budowniczy współdzielony zostaje przy swoim
 * fallbacku `sldData.stations[0]` — potencjalnie NIEPOPRAWNY breadcrumb dla
 * aparatu GPZ, ale `label`/`kind`/`menuKind` drawera są poprawne; drawer się
 * OTWIERA, nie crashuje). Dla aparatu STACJI (bay w `snapshot.bays`) korekta
 * działa poprawnie.
 */
function stationRefForBayOwner(snapshot: EnergyNetworkModel | null, bayRef: string): string | null {
  const direct = findBayByRef(snapshot, bayRef)?.substation_ref;
  if (direct) return direct;
  // Adaptacja flex (2026-07-17, pomiar na modelu z REALNEGO backendu —
  // fixtura `openTrunkChain.enm.json`): `snapshot.bays` bywa PUSTE (pola
  // stacji żyją w `meta.field_specs`, nie w płaskiej liście `Bay`), a bay-ref
  // symbolu jest syntetyczny (`stn/⟨id⟩/sn_field/⟨n⟩`). Wtedy stacja-właściciel
  // z GRAMATYKI refów: prefiks własności `stn/⟨id⟩` (dwa pierwsze człony
  // ścieżki — TA SAMA konwencja co `ownerScope` w `scene/crossings.ts`),
  // dopasowany do realnego rekordu `snapshot.substations` (relacja
  // potwierdzona rekordem, nie sam string).
  const scope = bayRef.split('/').slice(0, 2).join('/');
  if (!scope.startsWith('stn/')) return null;
  const station = (snapshot?.substations ?? []).find((s) => (s.ref_id ?? '').startsWith(`${scope}/`));
  return station?.ref_id ?? null;
}

/**
 * Dla `elementKind==='transformer'`: `ownerRef` → REALNY ref transformatora.
 * DWIE ścieżki (zweryfikowane empirycznie na `sldSubstrate52s.enm.json`):
 *  1. GPZ (`compose/gpz.ts` `gpzSymbolToPreview`): `ownerRef` = `GpzElementMeta.
 *     transformerRef` (fallback po `sourceRef`/`bayRef`, oba nieustawione dla
 *     symbolu transformatora) — TO JUŻ jest realny ref transformatora w
 *     `snapshot.transformers` (dopasowanie WPROST, bez rozwiązywania stacji).
 *  2. Stacja (`compose/station.ts`: `ownerRef: s.bayRef ?? s.sourceRef`) —
 *     `ownerRef` to BAY ref (scena nie niesie osobnego refu transformatora
 *     per symbol) — rozwiązanie: bay→stacja (`stationRefForBayOwner`)
 *     →pierwszy transformator dystrybucyjny stacji
 *     (`selectStationDistributionTransformers`, TA SAMA funkcja, której
 *     budowniczy współdzielony używa dla gałęzi 'station'/'transformer' —
 *     jedna prawda o wyborze transformatora, zero nowej heurystyki).
 * Próba (1) PRZED (2) — jeśli `ownerRef` już jest realnym refem
 * transformatora, rozwiązywanie przez bay jest zbędne (i zawiodłoby, bo
 * `ownerRef` GPZ nie jest bay-em). `null`, gdy ŻADNA ścieżka nie rozwiąże —
 * wołający NIE otwiera wtedy drawera (uczciwy brak).
 */
function resolveTransformerRefForOwnerRef(snapshot: EnergyNetworkModel | null, ownerRef: string): string | null {
  const directMatch = (snapshot?.transformers ?? []).find(
    (t) => t.ref_id === ownerRef || t.id === ownerRef,
  );
  if (directMatch) return directMatch.ref_id ?? directMatch.id ?? ownerRef;

  const stationRef = stationRefForBayOwner(snapshot, ownerRef);
  if (!stationRef) return null;
  const station = findSubstationByRef(snapshot, stationRef);
  const tr = selectStationDistributionTransformers(snapshot, station)[0];
  return tr?.ref_id ?? tr?.id ?? null;
}

/**
 * Dyspozytor otwierania drawera dla `handleElementClick` — spina
 * `elementKindForDrawer` (station/gpz/segment/bus) z DEDYKOWANYMI ścieżkami
 * transformer/apparatus (rozwiązywanie refu/stacji-właściciela z `ownerRef`,
 * patrz funkcje wyżej). `null` = drawer się NIE otwiera.
 *
 * `apparatus`: scena v3 nie niesie refu POJEDYNCZEGO urządzenia (tylko
 * `bayRef`), więc `apparatusState`/`parentBayLabel` w zwróconym obiekcie
 * ZOSTAJĄ `null` (budowniczy nie znajduje dopasowania w
 * `primary_device_states`/`equipment_refs` po samym `bayRef`) —
 * UDOKUMENTOWANA LUKA, NIE fabrykowany stan. `stationCode`/
 * `parentStationLabel` w budowniczym współdzielonym spadłyby na arbitralny
 * `sldData.stations[0]` (fallback v2, tam martwy, bo `id` tam zawsze
 * rozwiązywalny — tu NIE) — KORYGOWANE tu dla aparatu STACJI, rozwiązanego
 * z `Bay.substation_ref` (realna relacja ENM, nie zgadywanie); dla aparatu
 * GPZ korekta nie następuje (bay GPZ poza `snapshot.bays`, patrz
 * `stationRefForBayOwner` nagłówek) — UDOKUMENTOWANA LUKA, drawer się mimo
 * to otwiera (nie crash, `label` poprawny).
 */
function buildDetailDrawerDataForElementKind(
  snapshot: EnergyNetworkModel | null,
  sldData: SldDataPayload,
  overlayPayload: RawOverlayPayload | null,
  elementKind: PreviewElementKind | undefined,
  id: string,
): SldDetailDrawerData | null {
  if (elementKind === 'station') {
    return buildStationDetailDrawerData(snapshot, sldData, overlayPayload, id);
  }
  if (elementKind === 'transformer') {
    const transformerRef = resolveTransformerRefForOwnerRef(snapshot, id);
    if (!transformerRef) return null;
    return buildDetailDrawerDataForKind('transformer', transformerRef, { snapshot, sldData, overlayPayload });
  }
  if (elementKind === 'apparatus') {
    const apparatusDrawerData = buildDetailDrawerDataForKind('apparatus', id, { snapshot, sldData, overlayPayload });
    if (!apparatusDrawerData) return null;
    const stationRef = stationRefForBayOwner(snapshot, id);
    const correctedStationCode = stationRef
      ? sldData.stations.find((s) => s.id === stationRef)?.stationCode ?? apparatusDrawerData.stationCode
      : apparatusDrawerData.stationCode;
    return { ...apparatusDrawerData, stationCode: correctedStationCode };
  }
  const drawerKind = elementKindForDrawer(elementKind);
  if (!drawerKind) return null;
  return buildDetailDrawerDataForKind(drawerKind, id, { snapshot, sldData, overlayPayload });
}

const ALL_SCENE_LODS: readonly SceneLod[] = [0, 1, 2];

/**
 * F8b-1 C: nakładka energizacji — patrz uzasadnienie źródła w nagłówku pliku.
 * Buduje `energizedByTestId` dla WSZYSTKICH TRZECH LOD naraz (scena ma inny
 * zestaw testId per LOD — L0 ma `stationCollapsed`, L1/L2 mają aparaturę per
 * pole — kanwa wybiera efektywny LOD z kamery, więc nakładka musi pokrywać
 * wszystkie possible testId, nie tylko jednego LOD). WYŁĄCZNIE `elementKind`
 * 'station'/'bus'/'segment' — apparatus/transformer/der mają `ownerRef=bayRef`,
 * który nie odpowiada żadnej kategorii `SupplyPathHighlight` (patrz nagłówek).
 * `ownerRef` bywa kompozytem zakotwiczonym w realnym refie z sufiksem `#...`
 * (konwencja `compose/station.ts`/`compose/gpz.ts`, np. `${stationId}#sn-bus`)
 * — bazowy ref (przed `#`) jest tym, co `SupplyPathHighlight` faktycznie niesie
 * (stację/gałąź/szynę), więc dopasowanie odcina sufiks.
 */
const OVERLAY_ELIGIBLE_KINDS: ReadonlySet<PreviewElementKind> = new Set(['station', 'bus', 'segment']);

function baseRefOf(ownerRef: string): string {
  const hashIndex = ownerRef.indexOf('#');
  return hashIndex >= 0 ? ownerRef.slice(0, hashIndex) : ownerRef;
}

export function buildEnergizationOverlay(snapshot: EnergyNetworkModel): SldV3Overlay {
  const highlight: SupplyPathHighlight = buildSupplyPathHighlight(snapshot);
  // F8b-1 FIX (recenzja): klucz = meta.ownerRef (tożsamość LOD-niezależna),
  // NIE testId — fallback testId dla odcinków jest indeksowy
  // (`sld-v3-segment-${index}`) i KOLIDUJE między LOD-ami (60 vs 390
  // odcinków): słownik z trzech LOD-ów nadpisywał wpisy CUDZYCH elementów
  // (odcinek LOD0 #5 dostawał stan odcinka LOD2 #5). Ten sam ownerRef na
  // różnych LOD-ach to TEN SAM element sieci — nadpisanie identycznego
  // wpisu jest neutralne. Kanwa preferuje `energizedByOwnerRef`.
  const energizedByOwnerRef: Record<string, boolean> = {};
  for (const lod of ALL_SCENE_LODS) {
    const scene = buildSceneV3(snapshot, lod);
    scene.symbols.forEach((symbol) => {
      const meta = symbol.meta;
      if (!meta?.ownerRef || !meta.elementKind || !OVERLAY_ELIGIBLE_KINDS.has(meta.elementKind)) return;
      energizedByOwnerRef[meta.ownerRef] = isElementEnergized(highlight, baseRefOf(meta.ownerRef));
    });
    scene.segments.forEach((segment) => {
      const meta = segment.meta;
      if (!meta?.ownerRef || !meta.elementKind || !OVERLAY_ELIGIBLE_KINDS.has(meta.elementKind)) return;
      energizedByOwnerRef[meta.ownerRef] = isElementEnergized(highlight, baseRefOf(meta.ownerRef));
    });
  }
  return { energizedByTestId: {}, energizedByOwnerRef };
}

const EMPTY_OVERLAY: SldV3Overlay = { energizedByTestId: {} };

/** F8b-1 C: memoizowana na `snapshot` (buduje 3 sceny — koszt akceptowalny,
 *  ta sama skala co `SldCanvasV3`'s `sceneByLod`, jednorazowo przy zmianie
 *  sieci, nie per-frame). */
function useEnergizationOverlay(snapshot: EnergyNetworkModel | null): SldV3Overlay {
  return useMemo(() => (snapshot ? buildEnergizationOverlay(snapshot) : EMPTY_OVERLAY), [snapshot]);
}

/**
 * F9.5 (spec §14.2, „Nakładka przepływu mocy"): łączy `buildFlowOverlayFromScene`
 * (`overlay.ts`, budowniczy CZYSTY jednej sceny) ze WSZYSTKICH TRZECH LOD
 * naraz — TEN SAM wzorzec co `buildEnergizationOverlay` wyżej (ownerRef jest
 * tożsamością LOD-niezależną, patrz `overlay.ts` nagłówek, więc scalanie
 * trzech słowników jest neutralne: ten sam `ownerRef` na różnych LOD daje
 * identyczny wpis). Źródło `payload`: `useRawResultOverlayStore` — prawdziwy,
 * produkcyjnie zasilany przez `App.tsx` store (patrz `overlay.ts` nagłówek
 * F9.5 dla pełnego uzasadnienia wyboru kanału i UDOKUMENTOWANEJ luki
 * backendu, przez którą ten kanał jest DZIŚ pusty dla gałęzi na KAŻDYM
 * realnym przebiegu — `{}` w tym wypadku, spec §14.2 „overlay wyłączony bez
 * wyniku", nie błąd tej funkcji).
 */
export function buildFlowOverlayForSnapshot(
  snapshot: EnergyNetworkModel,
  payload: RawOverlayPayload | null,
): Readonly<Record<string, SegmentFlowOverlay>> {
  if (!payload) return {};
  // F-1 (recenzja Opusa): zbiór refów jednokawałkowych liczony RAZ per
  // wywołanie (ten sam adapter co buildSceneV3) — kierunek emitowany
  // wyłącznie dla przęseł o udowodnionej orientacji, patrz
  // `overlay.ts::singleHopSegmentRefs`.
  const trustedRefs = singleHopSegmentRefs(snapshot);
  const merged: Record<string, SegmentFlowOverlay> = {};
  for (const lod of ALL_SCENE_LODS) {
    Object.assign(merged, buildFlowOverlayFromScene(buildSceneV3(snapshot, lod), payload, trustedRefs));
  }
  return merged;
}

/** Memoizowana na `snapshot`+`payload` (zmiana wyniku solvera — nowy przebieg
 *  aktywny — przelicza nakładkę; zmiana snapshotu bez wyniku daje `{}`, nie
 *  `undefined`, żeby `SldCanvasV3` mógł zawsze scalić bez rozgałęzień null). */
function useFlowOverlay(
  snapshot: EnergyNetworkModel | null,
  payload: RawOverlayPayload | null,
): Readonly<Record<string, SegmentFlowOverlay>> {
  return useMemo(
    () => (snapshot ? buildFlowOverlayForSnapshot(snapshot, payload) : {}),
    [snapshot, payload],
  );
}

/**
 * F4/SLD (V12K-092): badge wynikowy OLTC ze WSZYSTKICH trzech LOD — TEN SAM
 * wzorzec co `buildFlowOverlayForSnapshot` (ownerRef = tożsamość
 * LOD-niezależna). Źródło `payload`: `useRawResultOverlayStore` (produkcyjnie
 * zasilany przez `App.tsx`, ten sam kanał co flow overlay). Przebieg nie-LF /
 * brak metryk OLTC ⇒ `{}` (badge wyłączony, §14.2).
 */
export function buildOltcOverlayForSnapshot(
  snapshot: EnergyNetworkModel,
  payload: RawOverlayPayload | null,
): Readonly<Record<string, TransformerOltcOverlay>> {
  if (!payload) return {};
  const merged: Record<string, TransformerOltcOverlay> = {};
  for (const lod of ALL_SCENE_LODS) {
    Object.assign(merged, buildOltcOverlayFromScene(buildSceneV3(snapshot, lod), payload));
  }
  return merged;
}

function useOltcOverlay(
  snapshot: EnergyNetworkModel | null,
  payload: RawOverlayPayload | null,
): Readonly<Record<string, TransformerOltcOverlay>> {
  return useMemo(
    () => (snapshot ? buildOltcOverlayForSnapshot(snapshot, payload) : {}),
    [snapshot, payload],
  );
}

/**
 * W4 (RECENZJA_L2_POLA_WYPOSAZENIE_2026-07 §8): LICZBOWE etykiety wynikowe ze
 * WSZYSTKICH trzech LOD — TEN SAM wzorzec co `buildFlowOverlayForSnapshot`
 * (ownerRef = tożsamość LOD-niezależna, scalanie neutralne). Bramka przęseł =
 * `singleHopSegmentRefs` (jednoznaczna tożsamość gałęzi, jak flow). Źródło
 * `payload`: `useRawResultOverlayStore` (produkcyjnie z `App.tsx`). Brak
 * wyniku/metryk ⇒ `{}` (warstwa wyłączona, §8 „gdy wyniki są").
 */
export function buildResultLabelsForSnapshot(
  snapshot: EnergyNetworkModel,
  payload: RawOverlayPayload | null,
  comparison?: ResultLabelComparison,
): Readonly<Record<string, ResultLabelEntry>> {
  if (!payload) return {};
  const trustedRefs = singleHopSegmentRefs(snapshot);
  const merged: Record<string, ResultLabelEntry> = {};
  for (const lod of ALL_SCENE_LODS) {
    Object.assign(merged, buildResultLabelsFromScene(buildSceneV3(snapshot, lod), payload, trustedRefs, comparison));
  }
  return merged;
}

function useResultLabelsOverlay(
  snapshot: EnergyNetworkModel | null,
  payload: RawOverlayPayload | null,
  comparison: ResultLabelComparison | undefined,
): Readonly<Record<string, ResultLabelEntry>> {
  return useMemo(
    () => (snapshot ? buildResultLabelsForSnapshot(snapshot, payload, comparison) : {}),
    [snapshot, payload, comparison],
  );
}

/**
 * Karta S-B (ZWARCIA-PRO pkt 7): strzałki kierunku rozpływu prądu zwarciowego
 * ze WSZYSTKICH trzech LOD — TEN SAM wzorzec co `buildFlowOverlayForSnapshot`
 * (ownerRef = tożsamość LOD-niezależna; bramka F-1 `singleHopSegmentRefs` —
 * kierunek emitowany wyłącznie dla przęseł o udowodnionej orientacji
 * geometrycznej). Źródło `input`: kanał `useOverlayStore.faultFlow`
 * (wiersz kanoniczny `branch_contributions`, ekran zwarć „Pokaż na
 * schemacie"). Brak kanału ⇒ `{}` (strzałki wyłączone, §14.2).
 *
 * GAP V12K-121 (karta SLD-W): bramka rozszerzona o `multiHopFaultFlowSegmentRefs`
 * — przedstawiciel przęsła wielokawałkowego liczony RAZ, na scenie
 * NAJPEŁNIEJSZEGO LOD (`ALL_SCENE_LODS` ostatni = 2, najdrobniejsza geometria
 * — §16-v3 dzieli tam kawałki na WSZYSTKIE człony łańcucha, `connectRowStations`
 * „lod === 2" = etykiety/szczegół pełny), NIE per LOD w pętli niżej: `ownerRef`
 * MUSI pozostać tożsamością LOD-niezależną (kontrakt tego pliku) — licząc
 * przedstawiciela osobno na każdym LOD, różne LOD-y mogłyby wybrać RÓŻNYCH
 * członów tej samej grupy (podział §16-v3 jest proporcjonalny do długości
 * TRASY TEGO LOD, nie do realnej elektrycznej długości członu), a scalony
 * słownik niósłby WIĘCEJ niż jeden wpis na przęsło — dwie strzałki zamiast
 * jednej. Ten sam, RAZ wybrany zbiór jest dokładany do `trustedRefs` na
 * WSZYSTKICH trzech przebiegach pętli — przepływ mocy (`buildFlowOverlayForSnapshot`
 * wyżej) NIETKNIĘTY.
 */
export function buildFaultFlowOverlayForSnapshot(
  snapshot: EnergyNetworkModel,
  input: ShortCircuitFlowOverlayInput | null,
): Readonly<Record<string, SegmentFaultFlowOverlay>> {
  if (!input) return {};
  const trustedRefs = singleHopSegmentRefs(snapshot);
  const richestLod = ALL_SCENE_LODS[ALL_SCENE_LODS.length - 1];
  const chainRefs = multiHopFaultFlowSegmentRefs(buildSceneV3(snapshot, richestLod), snapshot);
  const trusted = chainRefs.size === 0 ? trustedRefs : new Set([...trustedRefs, ...chainRefs]);
  const merged: Record<string, SegmentFaultFlowOverlay> = {};
  for (const lod of ALL_SCENE_LODS) {
    Object.assign(merged, buildFaultFlowOverlayFromScene(buildSceneV3(snapshot, lod), input, trusted));
  }
  return merged;
}

function useFaultFlowOverlay(
  snapshot: EnergyNetworkModel | null,
  input: ShortCircuitFlowOverlayInput | null,
): Readonly<Record<string, SegmentFaultFlowOverlay>> {
  return useMemo(
    () => (snapshot ? buildFaultFlowOverlayForSnapshot(snapshot, input) : {}),
    [snapshot, input],
  );
}

// ---------------------------------------------------------------------------
// F12-B pkt 5 (spec §10.1 ARCH-4, „LassoSelector — selekcja obszarem"):
// hit-test PURE funkcja — v2 `LassoSelector.pointInLasso` jest wołany
// WYŁĄCZNIE w testach (grep całego `src/`: zero produkcyjnych wywołań poza
// `v2/canvas/LassoSelector.test.tsx`) — v2 renderuje prostokąt lasso wyłącznie
// WIZUALNIE, nigdy nie liczy trafień. v3 dostarcza REALNY hit-test (nie
// odtworzenie martwego kodu v2, tylko dokończenie funkcji zgodnie ze spec
// §10.1 F12-B pkt 5: „symbole sceny efektywnego LOD, których środek bboxa
// (przez SYMBOL_DEFS) po transformacji kamery (worldToScreen) wpada w rect").
// ---------------------------------------------------------------------------

export interface LassoSelectionCandidate {
  readonly ownerRef: string;
  readonly elementKind: PreviewElementKind;
}

/**
 * Symbole sceny (LOD efektywny wołającego), których środek bboxa (world,
 * `SYMBOL_DEFS[symbolId].width/height`) po `worldToScreen(point, transform)`
 * wpada w `rect` (screen-space, ten sam układ co `LassoRect` z pointer
 * eventów kanwy — `transform` mapuje 1:1 world→CSS-px kanwy, bo
 * `SldCanvasV3`'s `viewBox` jest skonstruowany z DOKŁADNIE tego samego
 * `ViewportTransform`, patrz `canvas/camera.ts` `cameraViewBox`). Elementy
 * bez `ownerRef`/`elementKind` (adnotacje bez identyfikatora domenowego) są
 * pomijane — zero zgadywania. Deduplikacja po `ownerRef` (ten sam element
 * logiczny nie powinien trafić selekcji dwa razy). Czysta funkcja (zero
 * DOM) — testowalna bez renderu/PointerEvent (patrz nagłówek pliku F8a k3
 * dla precedensu ograniczeń jsdom).
 */
export function symbolsInLassoRect(
  scene: SceneV3,
  rect: LassoRect,
  transform: ViewportTransform,
): readonly LassoSelectionCandidate[] {
  const hits: LassoSelectionCandidate[] = [];
  const seen = new Set<string>();
  for (const symbol of scene.symbols) {
    const ownerRef = symbol.meta?.ownerRef;
    const elementKind = symbol.meta?.elementKind;
    if (!ownerRef || !elementKind || seen.has(ownerRef)) continue;
    const def = SYMBOL_DEFS[symbol.symbolId];
    const worldCenter = { x: symbol.x + def.width / 2, y: symbol.y + def.height / 2 };
    const screenCenter = worldToScreen(worldCenter, transform);
    if (pointInLasso(screenCenter, rect)) {
      seen.add(ownerRef);
      hits.push({ ownerRef, elementKind });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// F12-B pkt 4 (spec §10.1 ARCH-4, „LayerTogglePanel jako realny filtr"):
// panel warstw v3 — WŁASNY lekki komponent (NIE `v2/lod/LayerTogglePanel`,
// który jest sprzężony z `LodPolicy`/13-warstwowym słownikiem v2 —
// niekompatybilny, patrz `v3/canvas/layers.ts` nagłówek). Wizualnie wzorowany
// na `LayerTogglePanel` (checkboxy, PL, reset) — inny stan/inny zestaw
// warstw.
// ---------------------------------------------------------------------------

function SldV3LayerTogglePanel(props: {
  readonly visibility: CanvasLayerVisibility;
  readonly onToggleLayer: (layerId: CanvasLayerId) => void;
  readonly onToggleSublayer: (sublayer: L2SublayerId) => void;
  readonly onResetAll: () => void;
  readonly className?: string;
}): JSX.Element {
  const { visibility, onToggleLayer, onToggleSublayer, onResetAll, className } = props;
  return (
    <section
      className={[
        'flex flex-col gap-1 rounded border border-scada-border bg-scada-panel/95 p-2 text-[11px] text-scada-text shadow-lg',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Panel warstw schematu jednokreskowego (v3)"
      data-testid="sld-v3-layer-toggle-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b border-scada-border pb-1">
        <span className="font-semibold uppercase tracking-wider text-scada-muted">
          Podwarstwy L2 ({L2_SUBLAYER_IDS.length})
        </span>
        <button
          type="button"
          onClick={onResetAll}
          data-testid="sld-v3-layer-panel-reset"
          className="text-scada-muted hover:text-scada-text"
        >
          Reset
        </button>
      </header>
      {/* W5 (§18): grupowanie warstw renderu w podwarstwy L2. Master-toggle
          podwarstwy (checkbox z tri-state „mixed") + zagnieżdżone per-warstwowe
          checkboxy (granularność zachowana, testid bez zmian). */}
      <ul className="flex flex-col gap-1">
        {L2_SUBLAYER_IDS.map((sublayer) => {
          const state = l2SublayerState(visibility, sublayer);
          return (
            <li key={sublayer} className="flex flex-col gap-0.5">
              <label className="flex cursor-pointer items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={state === 'on'}
                  ref={(el) => {
                    if (el) el.indeterminate = state === 'mixed';
                  }}
                  onChange={() => onToggleSublayer(sublayer)}
                  data-testid={`sld-v3-l2-sublayer-toggle-${sublayer}`}
                  data-sublayer-state={state}
                />
                <span>{L2_SUBLAYER_LABELS_PL[sublayer]}</span>
              </label>
              <ul className="ml-4 flex flex-col gap-0.5">
                {L2_SUBLAYER_MEMBERS[sublayer].map((layerId) => {
                  const checked = visibility[layerId] !== false;
                  return (
                    <li key={layerId}>
                      <label className="flex cursor-pointer items-center gap-2 py-0.5 text-scada-muted">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleLayer(layerId)}
                          data-testid={`sld-v3-layer-toggle-${layerId}`}
                        />
                        <span>{CANVAS_LAYER_LABELS_PL[layerId]}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// R3 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.17) — panel FILTRÓW warstwy
// wynikowej. WZORZEC 1:1 z `SldV3LayerTogglePanel` (checkboxy, PL, reset) —
// osobny stan/zakres (wielkości P/Q/S/I/U/obciążenie · klasy źródła/TR/linie/
// szyny · „tylko przekroczenia”). Filtr działa WYŁĄCZNIE na warstwie etykiet
// (mapa `ownerRef→ResultLabelEntry`), NIE na scenie — inwariant geometrii §11.
// ---------------------------------------------------------------------------

const RESULT_FILTER_QUANTITY_LABELS_PL: Readonly<Record<ResultLabelQuantity, string>> = {
  P: 'Moc czynna P',
  Q: 'Moc bierna Q',
  S: 'Moc pozorna S',
  I: 'Prądy I',
  U: 'Napięcia U',
  loading: 'Obciążenie',
};
const RESULT_FILTER_QUANTITY_IDS: readonly ResultLabelQuantity[] = ['P', 'Q', 'S', 'I', 'U', 'loading'];

const RESULT_FILTER_CLASS_LABELS_PL: Readonly<Record<ResultLabelKind, string>> = {
  source: 'Źródła',
  transformer: 'Transformatory',
  branch: 'Linie',
  bus: 'Szyny',
};
const RESULT_FILTER_CLASS_IDS: readonly ResultLabelKind[] = ['source', 'transformer', 'branch', 'bus'];

/** R4 (wym. 10) — etykiety PL trybów porównawczych. */
const RESULT_COMPARISON_MODE_LABELS_PL: Readonly<Record<'off' | ResultLabelComparisonMode, string>> = {
  off: 'Wyłączone',
  delta: 'Różnica Δ',
  previous: 'Poprzednia → bieżąca',
};
const RESULT_COMPARISON_MODE_IDS: readonly ('off' | ResultLabelComparisonMode)[] = ['off', 'delta', 'previous'];

function SldV3ResultFilterPanel(props: {
  readonly filter: ResultLabelFilter;
  readonly hasExceedances: boolean;
  readonly onToggleQuantity: (quantity: ResultLabelQuantity) => void;
  readonly onToggleClass: (kind: ResultLabelKind) => void;
  readonly onToggleOnlyExceedances: () => void;
  readonly onResetAll: () => void;
  readonly comparisonMode: 'off' | ResultLabelComparisonMode;
  readonly comparisonAvailable: boolean;
  readonly comparisonBlockedReason: string | null;
  readonly onSetComparisonMode: (mode: 'off' | ResultLabelComparisonMode) => void;
  readonly className?: string;
}): JSX.Element {
  const {
    filter,
    hasExceedances,
    onToggleQuantity,
    onToggleClass,
    onToggleOnlyExceedances,
    onResetAll,
    comparisonMode,
    comparisonAvailable,
    comparisonBlockedReason,
    onSetComparisonMode,
    className,
  } = props;
  return (
    <section
      className={[
        'flex flex-col gap-1 rounded border border-scada-border bg-scada-panel/95 p-2 text-[11px] text-scada-text shadow-lg',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Panel filtrów warstwy wynikowej (v3)"
      data-testid="sld-v3-result-filter-panel"
    >
      <header className="flex items-center justify-between gap-2 border-b border-scada-border pb-1">
        <span className="font-semibold uppercase tracking-wider text-scada-muted">Filtry wyników</span>
        <button
          type="button"
          onClick={onResetAll}
          data-testid="sld-v3-result-filter-reset"
          className="text-scada-muted hover:text-scada-text"
        >
          Reset
        </button>
      </header>
      <span className="mt-1 font-semibold uppercase tracking-wider text-scada-muted">Wielkości</span>
      <ul className="flex flex-col gap-0.5">
        {RESULT_FILTER_QUANTITY_IDS.map((quantity) => (
          <li key={quantity}>
            <label className="flex cursor-pointer items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={filter.quantities[quantity]}
                onChange={() => onToggleQuantity(quantity)}
                data-testid={`sld-v3-result-filter-quantity-${quantity}`}
              />
              <span>{RESULT_FILTER_QUANTITY_LABELS_PL[quantity]}</span>
            </label>
          </li>
        ))}
      </ul>
      <span className="mt-1 font-semibold uppercase tracking-wider text-scada-muted">Klasy elementów</span>
      <ul className="flex flex-col gap-0.5">
        {RESULT_FILTER_CLASS_IDS.map((kind) => (
          <li key={kind}>
            <label className="flex cursor-pointer items-center gap-2 py-0.5">
              <input
                type="checkbox"
                checked={filter.classes[kind]}
                onChange={() => onToggleClass(kind)}
                data-testid={`sld-v3-result-filter-class-${kind}`}
              />
              <span>{RESULT_FILTER_CLASS_LABELS_PL[kind]}</span>
            </label>
          </li>
        ))}
      </ul>
      {/* R3 (wym. 17): „tylko przekroczenia” — AKTYWNE wyłącznie gdy payload
        * niesie przekroczenia (severity>INFO); inaczej wyszarzone z tytułem
        * wyjaśniającym (zero dead-click). */}
      <label
        className={[
          'mt-1 flex items-center gap-2 border-t border-scada-border pt-1',
          hasExceedances ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
        ].join(' ')}
        title={hasExceedances ? undefined : 'Brak przekroczeń w bieżącym wyniku'}
      >
        <input
          type="checkbox"
          checked={filter.onlyExceedances}
          disabled={!hasExceedances}
          onChange={onToggleOnlyExceedances}
          data-testid="sld-v3-result-filter-only-exceedances"
        />
        <span>Tylko przekroczenia</span>
      </label>
      {/* R4 (wym. 10/15): TRYB PORÓWNAWCZY — etykieta pokazuje Δ lub
        * „poprzednia → bieżąca" + mini trend ↑/↓/→. DOSTĘPNY wyłącznie, gdy
        * istnieje poprzedni bieg TEJ analizy i wyniki NIE są nieaktualne
        * (OUTDATED ⇒ zablokowany z wyjaśnieniem — zero mylących delt). */}
      <div
        className={[
          'mt-1 flex flex-col gap-0.5 border-t border-scada-border pt-1',
          comparisonAvailable ? '' : 'opacity-50',
        ].join(' ')}
        data-testid="sld-v3-result-comparison"
        data-comparison-available={comparisonAvailable ? 'true' : 'false'}
        title={comparisonAvailable ? undefined : comparisonBlockedReason ?? undefined}
      >
        <span className="font-semibold uppercase tracking-wider text-scada-muted">Tryb porównawczy</span>
        <ul className="flex flex-col gap-0.5">
          {RESULT_COMPARISON_MODE_IDS.map((mode) => (
            <li key={mode}>
              <label
                className={[
                  'flex items-center gap-2 py-0.5',
                  comparisonAvailable ? 'cursor-pointer' : 'cursor-not-allowed',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="sld-v3-result-comparison-mode"
                  checked={comparisonMode === mode}
                  disabled={!comparisonAvailable}
                  onChange={() => onSetComparisonMode(mode)}
                  data-testid={`sld-v3-result-comparison-mode-${mode}`}
                />
                <span>{RESULT_COMPARISON_MODE_LABELS_PL[mode]}</span>
              </label>
            </li>
          ))}
        </ul>
        {!comparisonAvailable && comparisonBlockedReason && (
          <span
            className="text-scada-muted"
            data-testid="sld-v3-result-comparison-blocked"
          >
            {comparisonBlockedReason}
          </span>
        )}
      </div>
    </section>
  );
}

export function SldCanvasV3Workspace(props: SldCanvasV3WorkspaceProps): JSX.Element {
  const { width: widthOverride, height: heightOverride, lodOverride } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useMeasuredSize(
    containerRef,
    1024,
    640,
    { width: widthOverride, height: heightOverride },
    MIN_CANVAS_WIDTH_PX,
    MIN_CANVAS_HEIGHT_PX,
  );

  // Dane: TA SAMA instancja ENM co v2 (`SldWorkspaceContainer` czyta z tego
  // samego store'a) — zero shadow-modelu (Core Rule #3).
  const snapshot = useSnapshotStore((state) => state.snapshot);
  // F8c pkt 2: `logicalViews` — TEN SAM pole store'a co v2 (`useSnapshotStore`
  // WSPÓLNY), wymagany przez `buildSldDataFromSnapshot` (poniżej) dla
  // `sldData.stations[].*` (fallbacki drawera stacji, patrz `shared/
  // detailDrawerData.ts::buildStationDetailDrawerData`).
  const logicalViews = useSnapshotStore((state) => state.logicalViews);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const activeMode = useAppStateStore((state) => state.activeMode);
  const activeCaseResultStatus = useAppStateStore((state) => state.activeCaseResultStatus);
  const energizationOverlay = useEnergizationOverlay(snapshot);
  // F9.5: `useRawResultOverlayStore` — TEN SAM globalny store, który `App.tsx`
  // zasila fetch'em wyniku aktywnego przebiegu, NIEZALEŻNIE od wersji kanwy
  // (patrz `overlay.ts`/`buildFlowOverlayForSnapshot` nagłówki dla pełnego
  // uzasadnienia i udokumentowanej luki backendu).
  const rawOverlayPayload = useRawResultOverlayStore((state) => state.payload);
  // R4 (wym. 10/15): bufor POPRZEDNIEGO payloadu per analiza (store,
  // frontend-only) — źródło Δ/trendu trybu porównawczego.
  const previousByAnalysisType = useRawResultOverlayStore((state) => state.previousByAnalysisType);
  const flowByOwnerRef = useFlowOverlay(snapshot, rawOverlayPayload);
  const oltcByOwnerRef = useOltcOverlay(snapshot, rawOverlayPayload);
  // Karta S-B: kanał kierunku rozpływu zwarciowego (ekran zwarć „Pokaż na
  // schemacie" → `loadFaultFlow`; podmiana overlay innego przebiegu zeruje
  // kanał w store — strzałki SC nie przeżywają cudzego wyniku).
  const faultFlowInput = useOverlayStore((state) => state.faultFlow);
  const faultFlowByOwnerRef = useFaultFlowOverlay(snapshot, faultFlowInput);
  // Karta SLD-P (GAP V12K-120/121 „znacznik pulse punktu zwarcia"): TEN SAM
  // kanał `faultFlow` niesie `fault_element_ref` — kanwa dotąd czytała z niego
  // wyłącznie `flows` (strzałki), ref punktu zwarcia był ignorowany.
  const faultPointMarkerRef = faultFlowInput?.fault_element_ref;
  // R2 (§wym.8): status NIEAKTUALNOŚCI wyników KONSUMOWANY z ISTNIEJĄCEGO
  // `activeCaseResultStatus` (ten sam status, którego używa hook świeżości
  // `ui2/freshness/useSwiezoscWynikow`; Case Immutability Rule — zmiana modelu
  // ustawia status OUTDATED). ZAKAZ równoległego trackera zmian modelu w warstwie
  // SLD — czytamy gotowy status. Flaga aktywna WYŁĄCZNIE gdy overlay niesie
  // wynik (payload) I status to OUTDATED — stary wynik nie może udawać aktualnego.
  // Liczona PRZED warstwą etykiet, bo bramkuje tryb porównawczy (wym. 10).
  const resultsStale = rawOverlayPayload != null && activeCaseResultStatus === 'OUTDATED';
  // R4 (wym. 10/15): TRYB PORÓWNAWCZY — stan LOKALNY renderu (domyślnie „off",
  // zgodność z akceptacją R2: sonda metryk przy domyślnych ustawieniach).
  const [comparisonMode, setComparisonMode] = useState<'off' | ResultLabelComparisonMode>('off');
  // R4 (§0.4): poprzedni payload TEJ SAMEJ analizy (ref-do-ref, kod-do-kodu).
  const previousPayload = useMemo(
    () => previousPayloadForAnalysis(previousByAnalysisType, rawOverlayPayload?.analysis_type),
    [previousByAnalysisType, rawOverlayPayload?.analysis_type],
  );
  // R4 (§0.4): porównanie DOSTĘPNE tylko, gdy istnieje poprzedni bieg TEJ analizy
  // ORAZ wyniki NIE są nieaktualne (OUTDATED ⇒ tryb zablokowany — zero mylących
  // delt ze starego modelu). Inaczej brak obiektu porównania ⇒ warstwa bazowa.
  const comparisonAvailable = previousPayload != null && !resultsStale;
  // R4 (§0.4): powód niedostępności trybu porównawczego — jawny komunikat
  // (OUTDATED ma pierwszeństwo nad brakiem poprzednika). `null` = dostępny.
  const comparisonBlockedReason = resultsStale
    ? 'Wyniki nieaktualne — porównanie zablokowane'
    : previousPayload == null
      ? 'Brak poprzedniego biegu do porównania'
      : null;
  const comparison = useMemo<ResultLabelComparison | undefined>(
    () =>
      comparisonMode !== 'off' && comparisonAvailable && previousPayload
        ? { previousPayload, mode: comparisonMode }
        : undefined,
    [comparisonMode, comparisonAvailable, previousPayload],
  );
  // W4 (§8): kanał liczbowych etykiet wynikowych — TEN SAM `rawOverlayPayload`
  // co flow/OLTC (jeden wynik aktywnego przebiegu), bramkowany w kanwie
  // ODRĘBNYM layerem `resultLabels`. R4: `comparison` wzbogaca linie o Δ/trend.
  const resultLabelsByOwnerRef = useResultLabelsOverlay(snapshot, rawOverlayPayload, comparison);
  // R3 (wym. 17): FILTRY widoczności warstwy wynikowej — stan LOKALNY renderu.
  // Domyślnie WSZYSTKO widoczne (zgodność z akceptacją R2 i inwariantem
  // geometrii: filtr działa WYŁĄCZNIE na warstwie etykiet — mapa `ownerRef→
  // ResultLabelEntry`, scena/geometria niezmienna).
  const [resultFilter, setResultFilter] = useState<ResultLabelFilter>(DEFAULT_RESULT_LABEL_FILTER);
  // R3 (wym. 17): brama filtra „tylko przekroczenia” — aktywny WYŁĄCZNIE gdy
  // payload NIESIE przekroczenia (severity>INFO); inaczej kontrolka wyszarzona
  // (zero dead-click). Liczone z niefiltrowanych etykiet (kontrakt backendu).
  const hasExceedances = useMemo(
    () => resultLabelsHaveExceedances(resultLabelsByOwnerRef),
    [resultLabelsByOwnerRef],
  );
  const filteredResultLabels = useMemo(
    () => applyResultLabelFilter(resultLabelsByOwnerRef, resultFilter),
    [resultLabelsByOwnerRef, resultFilter],
  );
  // R3 (wym. 7) + OVERLAY-TIMESTAMP: POCHODZENIE wyniku — moduł (etykieta PL z
  // `analysis_type` przez ISTNIEJĄCY słownik `formatContractValue`) + identyfikator
  // przebiegu (`run_id`) + CZAS UKOŃCZENIA BIEGU (`run_finished_at`, realny
  // `CanonicalRun.finished_at`) sformatowany ISTNIEJĄCYM formatterem repo
  // (`formatDateTime`, pl-PL). Domyka dług R3 (kanon V12K-159 wym. 6-7: pochodzenie
  // musi nieść timestamp). Brak `run_finished_at` ⇒ brak wiersza czasu (uczciwy
  // brak, zero fabrykacji). Brak payloadu = brak deklaracji.
  const provenance = useMemo(
    () =>
      rawOverlayPayload
        ? {
            analysisTypeLabel: formatContractValue(rawOverlayPayload.analysis_type),
            runId: rawOverlayPayload.run_id,
            completedAtLabel: rawOverlayPayload.run_finished_at
              ? formatDateTime(rawOverlayPayload.run_finished_at)
              : undefined,
          }
        : undefined,
    [rawOverlayPayload],
  );
  const overlay = useMemo<SldV3Overlay>(
    () => ({ ...energizationOverlay, flowByOwnerRef, oltcByOwnerRef, faultFlowByOwnerRef, faultPointMarkerRef, resultLabelsByOwnerRef: filteredResultLabels, resultsStale, provenance }),
    [energizationOverlay, flowByOwnerRef, oltcByOwnerRef, faultFlowByOwnerRef, faultPointMarkerRef, filteredResultLabels, resultsStale, provenance],
  );

  // F8c pkt 2: `SldDataPayload` — TEN SAM adapter co v2 (`enmToSldAdapter.ts`,
  // jawnie WSPÓŁDZIELONY per REBUILD_PLAN_V3 §F8c), wołany z DWOMA
  // argumentami (`snapshot`, `logicalViews`) — TA SAMA sygnatura co produkcyjne
  // wywołanie w `SldWorkspaceContainer.tsx` (bez `powerFlow` companion, patrz
  // nagłówek pliku — martwe w v2 dziś z tego samego powodu). Używany
  // WYŁĄCZNIE jako źródło fallbacków drawera stacji (`buildStationDetailDrawerData`).
  const sldData = useMemo(() => buildSldDataFromSnapshot(snapshot, logicalViews), [snapshot, logicalViews]);

  // F8c pkt 2: drawer szczegółów — stan LOKALNY (DODATEK do selekcji
  // globalnej, patrz `handleElementClick` niżej). Zamknięcie: przycisk/Escape
  // WEWNĄTRZ `SldDetailDrawer` (K30-88, zachowanie reużyte bez zmian).
  const [detailDrawerData, setDetailDrawerData] = useState<SldDetailDrawerData | null>(null);
  const closeDetailDrawer = useCallback(() => setDetailDrawerData(null), []);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const setSnapshot = useSnapshotStore((state) => state.setSnapshot);

  // Parytet K30-87/F12-C (luka wykryta adaptacją e2e critical-der-config,
  // 2026-07-17): v3 montował drawer BEZ handlera zapisu — CTA „Zapisz" w
  // ogóle się nie renderowało, więc konfiguracja DER z palety była ślepą
  // uliczką. Handler przeniesiony 1:1 z historycznego SldWorkspaceContainer
  // (v2, skasowany w F12-C): POST generatora przez WSPÓŁDZIELONE
  // `derPersistenceApi`, snapshot z odpowiedzi wprost do store'a (jedna
  // prawda modelu), zamknięcie drawera po sukcesie, błędy przez `notify`.
  const handleDetailDrawerSave = useCallback(async (payload: SldDetailDrawerSavePayload) => {
    const label = detailDrawerData?.label ?? payload.elementId ?? '—';

    if (payload.kind !== 'der') {
      closeDetailDrawer();
      return;
    }
    if (!activeProjectId || !activeCaseId) {
      notify('Nie można zapisać DER: wybierz aktywny projekt i przypadek.', 'error');
      return;
    }
    if (!payload.elementId || !payload.derConfig) {
      notify('Nie można zapisać DER: wskaż stację i dane formularza.', 'error');
      return;
    }

    try {
      const response = await postDerGeneratorConfig(activeProjectId, activeCaseId, {
        station_ref: payload.elementId,
        der_kind: payload.derConfig.derKind,
        power_mw: payload.derConfig.powerMw,
        connection_variant: payload.derConfig.connectionVariant,
        catalog_ref: payload.derConfig.inverterCatalogRef,
        source_name: `${payload.derConfig.derKind} ${label}`,
        quantity: 1,
        nc_rfg_module: payload.derConfig.ncRfgModule,
      });
      setSnapshot(response);
      notify(`Zapisano konfigurację DER: ${label}.`, 'success');
      closeDetailDrawer();
    } catch (error) {
      const message = error instanceof DerPersistenceApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Nie udało się zapisać konfiguracji DER.';
      notify(message, 'error');
    }
  }, [activeCaseId, activeProjectId, closeDetailDrawer, detailDrawerData, setSnapshot]);

  // Parytet K30-91/F12-C (ta sama luka co onSave — drawer montowany bez CTA
  // „Otwórz konfigurację"): przejście z drawera do pełnej powierzchni
  // konfiguracyjnej, przeniesione 1:1 z historycznego SldWorkspaceContainer
  // (cable_run → E-12 konfigurator odcinka SN; węzeł → E-14/E-15).
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const openDetailConfiguration = useCallback(() => {
    if (!detailDrawerData?.elementId) return;
    if (detailDrawerData.kind === 'cable_run') {
      openRouteSurface('E-12', {
        entityRef: detailDrawerData.elementId,
        entityType: 'segment',
        subjectKind: 'helper_context',
        payload: { defaultCard: 'trasa' },
      });
      setDetailDrawerData(null);
      return;
    }
    if (detailDrawerData.kind === 'node') {
      const screenCode = detailDrawerData.nodeSpec?.nodeKind === 'branch_pole' ? 'E-15' : 'E-14';
      openRouteSurface(screenCode, {
        entityRef: detailDrawerData.elementId,
        entityType: detailDrawerData.nodeSpec?.nodeKind === 'branch_pole' ? 'branch_pole' : 'zksn',
        subjectKind: 'helper_context',
      });
      setDetailDrawerData(null);
    }
  }, [detailDrawerData, openRouteSurface]);
  const canOpenDetailConfiguration = detailDrawerData?.kind === 'cable_run' || detailDrawerData?.kind === 'node';

  // F8c pkt 3: menu kontekstowe — stan LOKALNY, most do WSPÓŁDZIELONEGO
  // `SldContextMenuController` (`context-menu/`, patrz mapowanie
  // `elementKindForMenu` wyżej).
  const [contextRequest, setContextRequest] = useState<SldContextMenuRequest | null>(null);
  const closeContextMenu = useCallback(() => setContextRequest(null), []);
  const handleElementContextMenu = useCallback(
    (testId: string, meta: SldElementClickMeta | undefined, clientX: number, clientY: number) => {
      // Tło (`sld-v3-background`, `SldCanvasV3` nagłówek onContextMenu) → menu
      // tła; realny element → tabela `elementKindForMenu` (brak dopasowania,
      // np. `elementKind='protectionAnnotation'` — UDOKUMENTOWANA LUKA — NIE
      // otwiera menu, bez crasha, bez zgadywania kategorii). DER-MENU-V3:
      // `elementKind='der'` wybiera kategorię PODTYPU wg `meta.derKind`
      // (der_pv/der_bess/der_fw dla pv/bess/wind; generyczne `der` dla
      // generator/unknown/braku danych), patrz `elementKindForMenu` nagłówek.
      if (testId === 'sld-v3-background') {
        setContextRequest({ kind: 'background', elementId: null, clientX, clientY });
        return;
      }
      const menuKind = elementKindForMenu(meta?.elementKind, meta?.derKind);
      if (!menuKind) return;
      // K5-A: szyna GPZ niesie KANONICZNY Bus ref w `meta.busRef`
      // (ADAPTER-BUSREF) — preferowany nad kompozytem sceny
      // (`${sectionId}#bus-primary`), żeby operacje domenowe menu sekcji
      // (add_sn_bay / add_shunt_compensator_sn / add_surge_arrester_sn)
      // dostały realny ref ENM. Pozostałe elementy: bez zmiany.
      const id = meta?.busRef ?? meta?.ownerRef ?? elementIdFromTestId(testId);
      setContextRequest({ kind: menuKind, elementId: id, clientX, clientY });
    },
    [],
  );
  // K5-A: kontekst dostępności akcji menu — dla stacji sprawdzamy realne FK
  // `substation.bus_refs` → szyna nN (0 < U < 1 kV); bez stacji/żądania =
  // `undefined` (brak danych, zero zgadywania — akcje bez blokady).
  const contextMenuAvailability = useMemo<SldMenuContext | undefined>(() => {
    if (!contextRequest || contextRequest.kind !== 'station' || !contextRequest.elementId) {
      return undefined;
    }
    const station = (snapshot?.substations ?? []).find(
      (candidate) => candidate.ref_id === contextRequest.elementId || candidate.id === contextRequest.elementId,
    );
    if (!station) return undefined;
    const hasNnBus = (station.bus_refs ?? []).some((busRef) => {
      const bus = (snapshot?.buses ?? []).find(
        (candidate) => candidate.ref_id === busRef || candidate.id === busRef,
      );
      return bus != null && bus.voltage_kv > 0 && bus.voltage_kv < 1;
    });
    return { stationHasNnBus: hasNnBus };
  }, [contextRequest, snapshot]);
  // F11.4-B / ARCH-3 (spec §10.1: „wykonawca akcji domenowych na v3: BRAMKA
  // REALNA, wdrażana"): `onAction` woła TEN SAM wykonawca co v2
  // (`useSldActionExecutor`, `shared/sldActionExecutor.ts`) — nawigacja
  // (`ACTION_TO_SCREEN`), formularze operacji domenowych
  // (`buildSldOperationContext`), usuwanie z potwierdzeniem, komunikaty PL —
  // zero duplikacji, jedna prawda z v2. Menu zamyka się PO wywołaniu akcji
  // (dawniej: WYŁĄCZNIE zamykało menu, UDOKUMENTOWANA LUKA F8c — teraz
  // domknięta).
  const handleAction = useSldActionExecutor({ readOnly: props.readOnly ?? false });
  const handleContextMenuAction = useCallback(
    (actionId: string, kind: SldElementKindForMenu, elementId: string | null) => {
      handleAction(actionId, kind, elementId);
      closeContextMenu();
    },
    [handleAction, closeContextMenu],
  );

  // F11.4-B / ARCH-3: akcje drawera — TEN SAM wzorzec co v2
  // (`SldWorkspaceContainer.detailDrawerActions`): `getMenuActions` +
  // `DRAWER_ACTION_LABEL_PL` WSPÓŁDZIELONE (`shared/sldActionExecutor.ts`),
  // wykonawca `handleAction` wyżej — obie strony czytają jedną prawdę.
  const detailDrawerActions = useMemo<SldDetailDrawerAction[]>(() => {
    if (!detailDrawerData?.elementId) return [];
    const menuKind = mapKindToMenuKind(detailDrawerData.menuKind ?? detailDrawerData.kind ?? '');
    if (!menuKind) return [];
    const apparatusKind = parseGpzApparatusSelectionId(detailDrawerData.elementId)?.apparatusKind;
    return getMenuActions(menuKind, {
      hasResults: activeCaseResultStatus === 'FRESH',
      apparatusKind,
    }).map((action) => ({
      id: action.id,
      labelPl: DRAWER_ACTION_LABEL_PL[action.id] ?? action.labelPl,
      group: action.group,
      disabledReasonPl: action.disabled ? action.disabledReasonPl ?? 'Akcja niedostępna dla bieżącego obiektu.' : undefined,
      onClick: () => handleAction(action.id, menuKind, detailDrawerData.elementId),
    }));
  }, [activeCaseResultStatus, detailDrawerData, handleAction]);

  // F8c pkt 4: paleta DER — hook + przycisk RENDER-AGNOSTYCZNE (v2
  // `useDerDragDrop`/`DerPaletteButton`, zero zmian), reużyte wprost.
  // Mechanizm REALNY w v2 (zweryfikowany w `SldWorkspaceContainer.tsx`):
  // klik przycisku uzbraja (`startDrag`), NASTĘPNY klik w stację „zrzuca"
  // (`dropOnStation`) — NIE natywne HTML5 dragover/drop (`hoverStation` w
  // hooku jest DEAD CODE w v2 — sprawdzone grepem, zero wywołań w
  // `SldWorkspaceContainer.tsx`). v3 odtwarza REALNY mechanizm, nie
  // hipotetyczny.
  const derDrag = useDerDragDrop();

  // F12-B pkt 2 (spec §10.1 ARCH-4, „NetworkHierarchyTree"): hierarchia
  // GPZ→Sekcja→Pole — budowa WSPÓŁDZIELONA z v2 (`shared/
  // networkHierarchyFromSnapshot.ts`, zero zmiany zachowania).
  const networkHierarchy = useMemo(() => buildNetworkHierarchyFromSnapshot(snapshot), [snapshot]);
  const [hierarchyPanelOpen, setHierarchyPanelOpen] = useState(false);

  // F12-B pkt 3 (spec §10.1 ARCH-4, „ProofPacksPanel"): `hasNetworkModel` —
  // TA SAMA definicja co v2 `!isEmpty` (`SldWorkspaceContainer.tsx`:
  // `sldData.gpzs/stations/cableRuns/ders` wszystkie puste ⇒ `isEmpty`).
  const [proofPanelOpen, setProofPanelOpen] = useState(false);
  const hasNetworkModel = useMemo(
    () =>
      sldData.gpzs.length > 0
      || sldData.stations.length > 0
      || sldData.cableRuns.length > 0
      || sldData.ders.length > 0,
    [sldData],
  );

  // F12-B pkt 4 (spec §10.1 ARCH-4, „LayerTogglePanel jako realny filtr"):
  // stan LOKALNY warstw v3 (`v3/canvas/layers.ts`) — brak wpisu = widoczna
  // (spec „brak propa = wszystko widoczne", przekazywane 1:1 do `SldCanvasV3.
  // layerVisibility`, filtr WYŁĄCZNIE renderu — patrz `SldCanvasV3.tsx`).
  const [layerVisibility, setLayerVisibility] = useState<CanvasLayerVisibility>({});
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const handleToggleLayer = useCallback((layerId: CanvasLayerId) => {
    setLayerVisibility((prev) => ({ ...prev, [layerId]: prev[layerId] === false ? true : false }));
  }, []);
  // W5 (§18): master-toggle podwarstwy L2 — ustawia widoczność WSZYSTKICH warstw
  // wchodzących w skład podwarstwy (czysta `toggleL2Sublayer`, `./layers`).
  const handleToggleSublayer = useCallback((sublayer: L2SublayerId) => {
    setLayerVisibility((prev) => toggleL2Sublayer(prev, sublayer));
  }, []);
  const handleResetLayers = useCallback(() => setLayerVisibility({}), []);

  // R3 (wym. 17): handlery FILTRÓW warstwy wynikowej. Toggle wielkości/klasy;
  // „tylko przekroczenia” gaśnie sama, gdy payload nie niesie przekroczeń.
  const handleToggleQuantity = useCallback((quantity: ResultLabelQuantity) => {
    setResultFilter((prev) => ({
      ...prev,
      quantities: { ...prev.quantities, [quantity]: !prev.quantities[quantity] },
    }));
  }, []);
  const handleToggleClass = useCallback((kind: ResultLabelKind) => {
    setResultFilter((prev) => ({
      ...prev,
      classes: { ...prev.classes, [kind]: !prev.classes[kind] },
    }));
  }, []);
  const handleToggleOnlyExceedances = useCallback(() => {
    setResultFilter((prev) => ({ ...prev, onlyExceedances: !prev.onlyExceedances }));
  }, []);
  const handleResetResultFilter = useCallback(() => setResultFilter(DEFAULT_RESULT_LABEL_FILTER), []);
  // R4 (wym. 10): wybór trybu porównawczego (off / Δ / poprzednia→bieżąca).
  const handleSetComparisonMode = useCallback((mode: 'off' | ResultLabelComparisonMode) => {
    setComparisonMode(mode);
  }, []);

  // F12-B pkt 5 (spec §10.1 ARCH-4, „LassoSelector"): stan kamery (transform+
  // LOD) zgłaszany przez `SldCanvasV3.onCameraChange` — jedyny sposób, w jaki
  // ten workspace może poznać AKTUALNY `ViewportTransform` (kamera jest
  // stanem WEWNĘTRZNYM kanwy od F6b), potrzebny do `worldToScreen` w
  // `symbolsInLassoRect` (hit-test wyżej).
  const [cameraState, setCameraState] = useState<{ readonly transform: ViewportTransform; readonly lod: SceneLod } | null>(null);
  const handleCameraChange = useCallback((transform: ViewportTransform, lod: SceneLod) => {
    setCameraState((prev) => (prev && prev.transform === transform && prev.lod === lod ? prev : { transform, lod }));
  }, []);

  // F12-B pkt 1 (spec §10.1 ARCH-4, „SldExportFormatMenu — eksport SVG/PNG"):
  // TEN SAM wzorzec co v2 `handleExportSvg` (`SldWorkspaceContainer.tsx`),
  // selektor kanwy v3 (`sld-canvas-v3` zamiast `sld-canvas-v2`).
  //
  // SCHEMAT-10 S4 (V12K-135/136, D11/D12): dawniej — surowa serializacja
  // ekranu (dark, kadr kamery) BEZ normalizacji, mimo że `SldExportFormatMenu`
  // reklamuje ten sam kanał jako „SVG (light_technical)" (V12K-007 invariant
  // v2 `exportSvg.ts` NIE obejmuje v3 — v3 koduje kolor jako hex konkretny,
  // nie `currentColor`, patrz `export/exportPalette.ts` nagłówek) — DWA
  // przyciski eksportu SVG (ten button + dropdown niżej) dawały DWA różne
  // (i oba niepełne) wyniki. Teraz: JEDNA funkcja, poprawna end-to-end —
  // (1) klon węzła ekranu (NIE żywy — kadr/paleta eksportu nie mogą zmieniać
  // widoku użytkownika), (2) kadr fit-do-treści z bboxa sceny AKTUALNEGO LOD
  // (`applyContentFitFrame`, D12 „reszta" — ignoruje kamerę/aspekt
  // kontenera), (3) paleta jasna (`toLightTechnicalExportSvg`, D11) na
  // zserializowanym markupie. Zwraca nazwę pliku (jak `downloadSldSvg`) albo
  // `null`, gdy nie ma czego eksportować — ten sam kontrakt zwrotny co
  // `SldExportFormatMenu.onExportSvgOverride`, więc JEDNA implementacja
  // zasila OBA punkty wejścia (button + dropdown) bez duplikacji.
  const handleExportSvg = useCallback((): string | null => {
    const svgEl = containerRef.current?.querySelector<SVGSVGElement>('svg[data-testid="sld-canvas-v3"]');
    if (!svgEl || !snapshot) return null;
    const lod = lodOverride ?? cameraState?.lod ?? 2;
    const scene = buildSceneV3(snapshot, lod);
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    applyContentFitFrame(clone, scene);
    const serializer = new XMLSerializer();
    const svgStr = toLightTechnicalExportSvg(serializer.serializeToString(clone));
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = 'schemat_sld.svg';
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return filename;
  }, [snapshot, lodOverride, cameraState]);

  // F12-B pkt 5: lasso — nakładka screen-space AKTYWNA (pointer-events: auto)
  // WYŁĄCZNIE gdy Shift wciśnięty (albo trwa przeciągnięcie rozpoczęte pod
  // Shift) — zwykły drag BEZ Shift przechodzi NIEZMIENIONY do `SldCanvasV3`
  // (pan/zoom kamery nietknięte, spec §10.1 F12-B pkt 5 wymóg wprost).
  const [shiftHeld, setShiftHeld] = useState(false);
  const [lassoRect, setLassoRect] = useState<LassoRect | null>(null);
  const lassoStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectElements = useSelectionStore((state) => state.selectElements);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftHeld(false);
    };
    // Bezpiecznik: utrata fokusu okna z wciśniętym Shift (np. alt-tab) nie
    // może zostawić lasso trwale uzbrojonego (brak `keyup` poza oknem).
    const onBlur = () => setShiftHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const handleLassoPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.shiftKey || event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const start = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    lassoStartRef.current = start;
    setLassoRect({ x: start.x, y: start.y, width: 0, height: 0 });
  }, []);

  const handleLassoPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!lassoStartRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const end = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    setLassoRect(rectFromPoints(lassoStartRef.current, end));
  }, []);

  const handleLassoPointerUp = useCallback(() => {
    const activeRect = lassoStartRef.current ? lassoRect : null;
    lassoStartRef.current = null;
    if (activeRect && snapshot && cameraState) {
      const lod = lodOverride ?? cameraState.lod;
      const scene = buildSceneV3(snapshot, lod);
      const hits = symbolsInLassoRect(scene, activeRect, cameraState.transform);
      // Zaznaczenie WIELOKROTNE (spec §10.1 F12-B pkt 5: „jeżeli store ma API
      // multi-select, użyj go") — `useSelectionStore.selectElements` istnieje
      // (Iteracja 12, `ui/selection/store.ts`), więc lasso ustawia CAŁY zbiór
      // trafień naraz. Brak trafień = zero akcji (selekcja bieżąca zostaje).
      if (hits.length > 0) {
        selectElements(
          hits.map((hit) => ({
            id: hit.ownerRef,
            type: elementTypeForKind(hit.elementKind) ?? 'DescriptiveElement',
            name: hit.ownerRef,
          })),
        );
      }
    }
    setLassoRect(null);
  }, [snapshot, cameraState, lodOverride, lassoRect, selectElements]);

  // F12-B pkt 6 (spec §10.1 ARCH-4, „StationInternalView — dwuklik stacji"):
  // budowa danych WSPÓŁDZIELONA z v2 (`shared/stationInternalViewData.ts`).
  const [internalStationId, setInternalStationId] = useState<string | null>(null);
  const closeInternalStation = useCallback(() => setInternalStationId(null), []);
  const internalStationData = useMemo(
    () => buildStationInternalViewData(snapshot, sldData, internalStationId, size),
    [snapshot, sldData, internalStationId, size],
  );
  // Wybór pola/transformatora WEWNĄTRZ wnętrza stacji otwiera drawer
  // szczegółów — TEN SAM budowniczy współdzielony co selekcja na scenie
  // głównej (`buildDetailDrawerDataForKind`, już importowany wyżej). v2 ma
  // tu dodatkowo rozgałęzienia po syntetycznych id (`/pv/protection/…`) dla
  // wnętrza DER na nN — v3 `buildStationInternalViewData` (jak v2) niesie
  // `bayId`/`transformerId` jako PROSTE refy ENM (`bay.ref_id`/
  // `transformer.ref_id`, patrz moduł współdzielony), więc te syntetyczne
  // gałęzie v2 nie mają tu odpowiednika danych — UDOKUMENTOWANA LUKA (nie
  // uproszczenie): drill-down PV/BESS/FW wewnątrz wnętrza stacji (v2
  // `onSelectBay` rozpoznaje `/pv/…` sub-ścieżki z `describeStationInternalElement`)
  // nie jest dziś odtworzony w v3 — `StationInternalView` (współdzielony
  // komponent) sam nie generuje takich sub-id z danych `buildStationInternalViewData`
  // (`bays: stationBays.map(...)`, brak `ders` per-bay w tej strukturze), więc
  // gałąź `elementId.includes('/pv/...')` byłaby dziś martwa niezależnie.
  const handleSelectInternalBay = useCallback(
    (bayId: string) => {
      const drawerData = buildDetailDrawerDataForKind('bay', bayId, {
        snapshot,
        sldData,
        overlayPayload: rawOverlayPayload,
      });
      if (drawerData) setDetailDrawerData(drawerData);
    },
    [snapshot, sldData, rawOverlayPayload],
  );
  const handleSelectInternalTransformer = useCallback(
    (transformerId: string) => {
      const drawerData = buildDetailDrawerDataForKind('transformer', transformerId, {
        snapshot,
        sldData,
        overlayPayload: rawOverlayPayload,
      });
      if (drawerData) setDetailDrawerData(drawerData);
    },
    [snapshot, sldData, rawOverlayPayload],
  );
  const handleElementDoubleClick = useCallback((testId: string, meta?: SldElementClickMeta) => {
    // Wzorzec v2 `onDoubleClickStation` (`SldCanvasV2.tsx`): dwuklik OTWIERA
    // drill-down WYŁĄCZNIE dla stacji — inne elementKind ignorowane (spójne z
    // v2, gdzie `onDoubleClickDer` jest osobnym, dedykowanym callbackiem, a
    // reszta elementów nie ma zachowania na dwuklik).
    if (meta?.elementKind !== 'station') return;
    const id = meta?.ownerRef ?? elementIdFromTestId(testId);
    setInternalStationId(id);
  }, []);

  const handleElementClick = useCallback(
    (testId: string, meta?: SldElementClickMeta) => {
      // Normalizacja tożsamości ODCINKA: scena adresuje KAWAŁKI przęsła
      // sufiksami tras (`seg/⟨id⟩/segment_L`, `…/branch_segment_R_L` —
      // `incomingSegmentRef`), ale kontrakty domenowe (drawer, E-12,
      // wyniki) operują refem kanonicznym `seg/⟨id⟩/segment`. Bez tej
      // normalizacji klik w kawałek otwierał drawer z refem, którego API
      // nie zna (luka wykryta adaptacją e2e sld-editor-real-backend-flex).
      const rawId = meta?.ownerRef ?? elementIdFromTestId(testId);
      const id = meta?.elementKind === 'segment'
        ? rawId.replace(/_(?:[LR]_)*[LR]$/, '')
        : rawId;

      // F8c pkt 4: drag DER uzbrojony — klik w STACJĘ „zrzuca" (jak v2
      // K30-78: `if (kind === 'station' && derDrag.state)`); klik gdziekolwiek
      // indziej podczas uzbrojenia = ANULUJ bez akcji (v2 nie ma tej reguły —
      // tam jedyna droga anulowania to przycisk „Anuluj"/zmiana route surface,
      // niedostępne w v3 bez route surface; „anuluj na klik gdzie indziej" to
      // ŚWIADOMA, bezpieczna reguła v3, żeby użytkownik nie utknął uzbrojony —
      // patrz test (b) `derPalette.test.tsx`).
      if (derDrag.state) {
        if (meta?.elementKind === 'station') {
          const dropResult = derDrag.dropOnStation(id);
          if (dropResult) {
            // F11.4-B: `buildDerDropDetailDrawerData` — WSPÓŁDZIELONA z v2
            // (dawniej zduplikowana tu, patrz nagłówek modułu współdzielonego).
            setDetailDrawerData(buildDerDropDetailDrawerData(sldData, id, dropResult.kind));
          }
        } else {
          derDrag.cancel();
        }
        return;
      }

      const type = elementTypeForKind(meta?.elementKind);
      // §16-v3/adaptacja flex: selekcja TRANSFORMATORA niesie REALNY ref
      // transformatora (ta sama rozdzielczość, której używa drawer —
      // `resolveTransformerRefForOwnerRef`), nie bay-ref symbolu — inspektor
      // inżynierski (`InspectorEngineeringView`, selekcja globalna) rozwiązuje
      // element po ref_id; bay-ref pokazywałby pusty/obcy panel.
      const selectId =
        meta?.elementKind === 'transformer'
          ? resolveTransformerRefForOwnerRef(snapshot, id) ?? id
          : id;
      selectElement(type ? { id: selectId, type, name: selectId } : { id, type: 'DescriptiveElement', name: id });

      // F11.4-B / ARCH-4 (spec §10.1 „pełna migracja budowniczych danych
      // drawera"): otwieranie drawera rozszerzone POZA stację —
      // `elementKindForDrawer` niżej mapuje `elementKind` v3 na `kind`
      // budowniczego współdzielonego. Brak dopasowania/`null` z budowniczego
      // = drawer się NIE otwiera (uczciwy brak, bez crasha, bez zgadywania) —
      // jeśli już otwarty dla innego elementu, zostaje (spójne z v2:
      // `handleSelectElement` też nie zamyka drawera na niezmapowany `kind`).
      const drawerData = buildDetailDrawerDataForElementKind(snapshot, sldData, rawOverlayPayload, meta?.elementKind, id);
      if (drawerData) setDetailDrawerData(drawerData);
    },
    [derDrag, rawOverlayPayload, selectElement, sldData, snapshot],
  );

  // R3 (wym. 6): AKTYWACJA etykiety wynikowej — klik w blok liczbowy prowadzony
  // TĄ SAMĄ ścieżką co klik w element (`handleElementClick`: selekcja +
  // istniejący panel wyników `SldDetailDrawer`). Klasa etykiety
  // (`ResultLabelKind`) mapuje 1:1 na `elementKind` sceny — zero nowego panelu,
  // zero nowej ścieżki danych (reuse). Deep-link do White Box/proof: brak
  // działającej ścieżki z v3 kanwy (kanwa czyta payload wynikowy, nie ślad
  // proof) — JAWNY DŁUG R3 (rejestr braków), NIE atrapa.
  const handleResultLabelActivate = useCallback(
    (ownerRef: string, kind: ResultLabelKind) => {
      const elementKind: PreviewElementKind =
        kind === 'branch' ? 'segment' : kind === 'bus' ? 'bus' : kind === 'transformer' ? 'transformer' : 'source';
      handleElementClick(ownerRef, { ownerRef, elementKind });
    },
    [handleElementClick],
  );

  return (
    <div
      ref={containerRef}
      data-testid="sld-canvas-v3-workspace"
      data-readonly={props.readOnly ? 'true' : 'false'}
      className="relative flex h-full w-full overflow-hidden"
    >
      {snapshot ? (
        <SldCanvasV3
          snapshot={snapshot}
          width={size.width}
          height={size.height}
          overlay={overlay}
          onElementClick={handleElementClick}
          onElementDoubleClick={handleElementDoubleClick}
          onElementContextMenu={handleElementContextMenu}
          lodOverride={lodOverride}
          layerVisibility={layerVisibility}
          onResultLabelActivate={handleResultLabelActivate}
          onCameraChange={handleCameraChange}
        />
      ) : null}

      {/* F12-B pkt 5: nakładka lasso screen-space. `pointer-events` AUTO
          WYŁĄCZNIE gdy Shift wciśnięty (albo trwa przeciągnięcie rozpoczęte
          pod Shift) — w przeciwnym razie przezroczysta dla zdarzeń, więc
          zwykły drag/klik trafia NIEZMIENIONY do `SldCanvasV3` poniżej
          (pan/zoom/selekcja nietknięte). z-index NIŻSZY niż doki (10 < 20/30),
          żeby przyciski dokowane pozostały klikalne nawet z wciśniętym Shift. */}
      <div
        data-testid="sld-v3-lasso-capture"
        className="absolute inset-0 z-10"
        style={{ pointerEvents: shiftHeld || lassoRect ? 'auto' : 'none', cursor: shiftHeld ? 'crosshair' : undefined }}
        onPointerDown={handleLassoPointerDown}
        onPointerMove={handleLassoPointerMove}
        onPointerUp={handleLassoPointerUp}
        onPointerCancel={handleLassoPointerUp}
      >
        {lassoRect && (
          <svg className="pointer-events-none absolute inset-0" width="100%" height="100%">
            <LassoSelector visible rect={lassoRect} />
          </svg>
        )}
      </div>

      {/* F12-C (spec §10.1 ARCH-4): pusty stan — pierwszy krok projektowy z
          jawnym CTA GPZ i katalogami, przeniesiony 1:1 z kontenera v2
          (te same testid/etykiety PL; akcje przez WSPÓŁDZIELONY wykonawca
          `handleAction`, więc zachowanie identyczne — `insert-gpz` otwiera
          formularz `add_grid_source_sn`, `open-catalogs` nawigację E-38). */}
      {!hasNetworkModel && (
        <div
          data-testid="sld-empty-state"
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
        >
          <div className="pointer-events-none max-w-md rounded border border-scada-border bg-scada-panel/95 p-6 text-center text-scada-text shadow-xl">
            <div className="mb-2 text-sm font-bold uppercase tracking-widest text-scada-muted">
              Schemat jednokreskowy
            </div>
            <h2 className="mb-3 text-lg font-semibold text-scada-text">
              Wybierz wariant GPZ i rozpocznij ciąg SN
            </h2>
            <p className="text-sm leading-6 text-scada-muted">
              Zacznij od kompletnego układu GPZ z rozdzielnią SN, sekcjami szyn
              i polami liniowymi. Potem wyprowadź odcinek katalogowy i zakończ
              go stacją, ZK SN, słupem rozgałęźnym albo kolejnym węzłem ciągu.
            </p>
            <div className="mt-4 flex flex-col items-stretch gap-2">
              <button
                type="button"
                data-testid="sld-empty-state-insert-gpz"
                className="pointer-events-auto rounded border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleAction('insert-gpz', 'background', null);
                }}
              >
                Wstaw Główny Punkt Zasilający
              </button>
              <button
                type="button"
                data-testid="sld-empty-state-open-catalogs"
                className="pointer-events-auto rounded border border-scada-border bg-scada-surface px-4 py-2 text-sm text-scada-text hover:bg-scada-hover-nav focus:outline-none focus:ring-2 focus:ring-scada-border"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleAction('open-catalogs', 'background', null);
                }}
              >
                Przeglądaj katalogi techniczne
              </button>
              <a
                href="#kreator-stacji-v2"
                data-testid="sld-empty-state-open-station-wizard"
                className="pointer-events-auto rounded border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-center text-sm font-medium text-emerald-300 hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Otwórz konfigurację stacji (17 kroków)
              </a>
            </div>
            <p className="mt-3 text-xs text-scada-muted">
              Po wstawieniu GPZ karta techniczna poprowadzi przez sekcje szyn,
              pola liniowe, odcinki, stacje i układy PV/BESS/FW.
            </p>
          </div>
        </div>
      )}

      <SldDetailDrawer
        open={detailDrawerData !== null}
        data={detailDrawerData}
        onClose={closeDetailDrawer}
        onSave={handleDetailDrawerSave}
        onOpenConfiguration={canOpenDetailConfiguration ? openDetailConfiguration : undefined}
        actions={detailDrawerActions}
      />

      <SldContextMenuController
        request={contextRequest}
        mode={activeMode}
        context={contextMenuAvailability}
        onAction={handleContextMenuAction}
        onClose={closeContextMenu}
      />

      {/* F8c pkt 4: paleta DER — TEN SAM wygląd/przyciski co v2 (`DerPaletteButton`
          reużyty wprost, patrz v2 `sld-v2-der-palette`), zamontowana
          bezwarunkowo (v3 nie ma dziś odpowiednika `canPlaceDerOnStation`/
          wyboru stacji z v2 — poza zakresem tego zadania, DODATEK czysto
          addytywny). */}
      <div
        className="pointer-events-auto absolute top-3 z-30 flex items-center gap-1 rounded border border-scada-border bg-scada-panel/95 px-2 py-1 shadow-lg"
        data-testid="sld-v3-der-palette"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      >
        <span style={{ fontSize: 9, color: '#7E8790', marginRight: 4, fontWeight: 700, letterSpacing: 0.5 }}>
          UKŁADY PV/BESS/FW:
        </span>
        {(['PV', 'BESS', 'FW'] as DerDragKind[]).map((kind) => (
          <DerPaletteButton
            key={kind}
            kind={kind}
            onStart={derDrag.startDrag}
            disabled={derDrag.state !== null && derDrag.state.kind !== kind}
            active={derDrag.state?.kind === kind}
          />
        ))}
        {derDrag.state && (
          <span style={{ fontSize: 9, color: '#B9C2CC', marginLeft: 4 }}>
            ▸ Wskaż stację dla {derDrag.state.kind}
            <button
              type="button"
              data-testid="sld-v3-der-cancel"
              onClick={derDrag.cancel}
              style={{ marginLeft: 6, color: '#F25F5F', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Anuluj
            </button>
          </span>
        )}
      </div>

      {/* F12-B pkt 1 (spec §10.1 ARCH-4, „SldExportFormatMenu — eksport
          SVG/PNG"): dok prawy-górny — paleta DER zajmuje górny-środek, zero
          kolizji. */}
      <div
        className="pointer-events-auto absolute right-3 top-3 z-30 flex items-center gap-1"
        data-testid="sld-v3-export-dock"
      >
        <button
          type="button"
          onClick={handleExportSvg}
          data-testid="sld-v3-export-svg"
          title="Eksportuj schemat SLD jako plik SVG"
          className="h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-mono-eng text-[10px] font-semibold text-scada-text shadow-lg hover:bg-scada-hover-nav"
        >
          ↓ SVG
        </button>
        <SldExportFormatMenu
          svgSelector='svg[data-testid="sld-canvas-v3"]'
          projectName={undefined}
          caseLabel={undefined}
          onExportSvgOverride={handleExportSvg}
        />
      </div>

      {/* F12-B pkt 2 (spec §10.1 ARCH-4, „NetworkHierarchyTree"): dok
          lewy-górny. */}
      <div
        className="pointer-events-auto absolute left-3 top-3 z-20 flex flex-col items-start gap-1"
        data-testid="sld-v3-hierarchy-tree-dock"
      >
        <button
          type="button"
          onClick={() => setHierarchyPanelOpen((prev) => !prev)}
          data-testid="sld-v3-hierarchy-tree-toggle"
          aria-label={hierarchyPanelOpen ? 'Zamknij drzewo układu' : 'Otwórz drzewo układu'}
          title={hierarchyPanelOpen ? 'Zamknij drzewo układu' : 'Drzewo układu sieci'}
          className="h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-mono-eng text-[10px] font-semibold text-scada-text shadow-lg hover:bg-scada-hover-nav"
        >
          {hierarchyPanelOpen ? '◂ Drzewo układu' : '▸ Drzewo układu'}
        </button>
        {hierarchyPanelOpen && (
          <NetworkHierarchyTree hierarchy={networkHierarchy} className="w-[240px]" />
        )}
      </div>

      {/* F12-B pkt 3 (spec §10.1 ARCH-4, „ProofPacksPanel"): dok lewy-dolny. */}
      <div
        className="pointer-events-auto absolute bottom-3 left-3 z-20 flex flex-col items-start gap-1"
        data-testid="sld-v3-proof-packs-dock"
      >
        <button
          type="button"
          onClick={() => setProofPanelOpen((prev) => !prev)}
          data-testid="sld-v3-proof-packs-toggle"
          aria-expanded={proofPanelOpen}
          aria-label={proofPanelOpen ? 'Zamknij panel dowodów inżynierskich' : 'Otwórz panel dowodów inżynierskich'}
          title={proofPanelOpen ? 'Zamknij panel dowodów' : 'Dowody inżynierskie (8)'}
          className="h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-mono-eng text-[10px] font-semibold text-scada-text shadow-lg hover:bg-scada-hover-nav"
        >
          {proofPanelOpen ? '▾ Dowody (8)' : '▸ Dowody (8)'}
        </button>
        {proofPanelOpen && (
          <ProofPacksPanel hasNetworkModel={hasNetworkModel} className="max-h-[150px] w-[216px] overflow-y-auto" />
        )}
      </div>

      {/* F12-B pkt 4 (spec §10.1 ARCH-4, „LayerTogglePanel jako realny
          filtr"): dok prawy-dolny. */}
      <div className="pointer-events-auto absolute bottom-3 right-3 z-20 flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setLayerPanelOpen((prev) => !prev)}
          data-testid="sld-v3-layer-panel-toggle"
          aria-label={layerPanelOpen ? 'Zamknij panel warstw' : `Otwórz panel warstw (${CANVAS_LAYER_IDS.length})`}
          title={layerPanelOpen ? 'Zamknij panel warstw' : `Warstwy (${CANVAS_LAYER_IDS.length})`}
          className="h-7 rounded border border-scada-border bg-scada-panel/95 px-2 font-mono-eng text-[10px] font-semibold text-scada-text shadow-lg hover:bg-scada-hover-nav"
        >
          {layerPanelOpen ? '▾ Warstwy' : `▴ Warstwy (${CANVAS_LAYER_IDS.length})`}
        </button>
        {layerPanelOpen && (
          <>
            {/* R3 (wym. 17): panel filtrów warstwy wynikowej — TEN SAM dok co
              * przełącznik warstw (rozszerzenie, nie osobne miejsce). */}
            <SldV3ResultFilterPanel
              filter={resultFilter}
              hasExceedances={hasExceedances}
              onToggleQuantity={handleToggleQuantity}
              onToggleClass={handleToggleClass}
              onToggleOnlyExceedances={handleToggleOnlyExceedances}
              onResetAll={handleResetResultFilter}
              comparisonMode={comparisonMode}
              comparisonAvailable={comparisonAvailable}
              comparisonBlockedReason={comparisonBlockedReason}
              onSetComparisonMode={handleSetComparisonMode}
              className="w-[240px]"
            />
            <SldV3LayerTogglePanel
              visibility={layerVisibility}
              onToggleLayer={handleToggleLayer}
              onToggleSublayer={handleToggleSublayer}
              onResetAll={handleResetLayers}
              className="w-[240px]"
            />
          </>
        )}
      </div>

      {/* F12-B pkt 6 (spec §10.1 ARCH-4, „StationInternalView"): drill-down
          stacji — overlay z wewnętrznym SLD, wzorzec wrappera 1:1 z v2. */}
      {internalStationData && (
        <div
          data-testid="station-internal-view"
          data-view-mode="side-drawer"
          className="pointer-events-none absolute bottom-3 right-3 top-3 z-40 flex max-w-[min(760px,calc(100%-1.5rem))] items-start justify-end"
        >
          <div
            className="pointer-events-auto max-h-full overflow-auto rounded border border-scada-border bg-scada-panel shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <StationInternalView
              {...internalStationData}
              onClose={closeInternalStation}
              onSelectBay={handleSelectInternalBay}
              onSelectTransformer={handleSelectInternalTransformer}
            />
            <div className="flex justify-end gap-2 border-t border-scada-border bg-scada-surface px-4 py-2">
              <button
                type="button"
                className="rounded border border-scada-border px-3 py-1 text-sm text-scada-text hover:bg-scada-hover-nav"
                onClick={closeInternalStation}
                data-testid="station-internal-close"
              >
                Zamknij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
