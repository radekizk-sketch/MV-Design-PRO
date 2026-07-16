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
import { useCallback, useMemo, useRef, useState } from 'react';

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ElementType } from '../../../types';
import { useAppStateStore } from '../../../app-state';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { buildSupplyPathHighlight, isElementEnergized, type SupplyPathHighlight } from '../../v2/canvas/SupplyPathHighlighter';
import { useRawResultOverlayStore, type RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { buildSldDataFromSnapshot, type SldDataPayload } from '../../v2/canvas/enmToSldAdapter';
import { SldDetailDrawer, type SldDetailDrawerAction, type SldDetailDrawerData } from '../../v2/canvas/SldDetailDrawer';
import { useDerDragDrop, DerPaletteButton, type DerDragKind } from '../../v2/canvas/useDerDragDrop';
import {
  SldContextMenuController,
  type SldContextMenuRequest,
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
import { buildSceneV3, type SceneLod } from '../scene/buildScene';
import type { PreviewElementKind } from '../compose/preview';
import { SldCanvasV3, type SldElementClickMeta } from './SldCanvasV3';
import { buildFlowOverlayFromScene, singleHopSegmentRefs, type SegmentFlowOverlay, type SldV3Overlay } from './overlay';

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
 *  - 'der' → `undefined` (BRAK MENU — UDOKUMENTOWANA LUKA: v2 rozróżnia
 *    der_pv/der_bess/der_fw jako OSOBNE kategorie menu z różnymi akcjami
 *    domenowymi; `elementKind='der'` v3 jest GENERYCZNE — scena nie niesie
 *    `Generator.gen_type`, więc nie da się wybrać poprawnej kategorii bez
 *    zgadywania (zakazane przez `domain_no_guessing_guard`). Test negatywny
 *    (c) w `__tests__/contextMenu.test.tsx` pokrywa TEN przypadek);
 *  - 'protectionAnnotation' → `undefined` (adnotacja graficzna, nie obiekt
 *    domenowy — brak odpowiednika w v2/SLD_MENU_REGISTRY).
 */
function elementKindForMenu(kind: PreviewElementKind | undefined): SldElementKindForMenu | undefined {
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
    default:
      return undefined;
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
 *    jest ZNANY z akcji użytkownika — `buildDerDropDetailDrawerData`
 *    wyżej): `SldDetailDrawer` domyśla `derKind` do `'PV'`, gdy
 *    `data.derKind` nieustawione (`SldDetailDrawer.tsx` ok. linii 417) —
 *    dla klika w ISTNIEJĄCY DER nieznanego rodzaju (scena v3 nie niesie
 *    `Generator.gen_type`, patrz `elementTypeForKind` nagłówek pliku)
 *    fabrykowałoby to fałszywe „PV" dla realnego BESS/FW. UDOKUMENTOWANA
 *    LUKA, nie regresja — v3 przed tym zadaniem NIE miał drawera dla `der`
 *    w ogóle.
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
  return findBayByRef(snapshot, bayRef)?.substation_ref ?? null;
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
  const flowByOwnerRef = useFlowOverlay(snapshot, rawOverlayPayload);
  const overlay = useMemo<SldV3Overlay>(
    () => ({ ...energizationOverlay, flowByOwnerRef }),
    [energizationOverlay, flowByOwnerRef],
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

  // F8c pkt 3: menu kontekstowe — stan LOKALNY, most do WSPÓŁDZIELONEGO
  // `SldContextMenuController` (`context-menu/`, patrz mapowanie
  // `elementKindForMenu` wyżej).
  const [contextRequest, setContextRequest] = useState<SldContextMenuRequest | null>(null);
  const closeContextMenu = useCallback(() => setContextRequest(null), []);
  const handleElementContextMenu = useCallback(
    (testId: string, meta: SldElementClickMeta | undefined, clientX: number, clientY: number) => {
      // Tło (`sld-v3-background`, `SldCanvasV3` nagłówek onContextMenu) → menu
      // tła; realny element → tabela `elementKindForMenu` (brak dopasowania,
      // np. `elementKind='der'` — UDOKUMENTOWANA LUKA — NIE otwiera menu, bez
      // crasha, bez zgadywania kategorii).
      if (testId === 'sld-v3-background') {
        setContextRequest({ kind: 'background', elementId: null, clientX, clientY });
        return;
      }
      const menuKind = elementKindForMenu(meta?.elementKind);
      if (!menuKind) return;
      const id = meta?.ownerRef ?? elementIdFromTestId(testId);
      setContextRequest({ kind: menuKind, elementId: id, clientX, clientY });
    },
    [],
  );
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

  const handleElementClick = useCallback(
    (testId: string, meta?: SldElementClickMeta) => {
      const id = meta?.ownerRef ?? elementIdFromTestId(testId);

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
      selectElement(type ? { id, type, name: id } : { id, type: 'DescriptiveElement', name: id });

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

  return (
    <div
      ref={containerRef}
      data-testid="sld-canvas-v3-workspace"
      className="relative flex h-full w-full overflow-hidden"
    >
      {snapshot ? (
        <SldCanvasV3
          snapshot={snapshot}
          width={size.width}
          height={size.height}
          overlay={overlay}
          onElementClick={handleElementClick}
          onElementContextMenu={handleElementContextMenu}
          lodOverride={lodOverride}
        />
      ) : null}

      <SldDetailDrawer
        open={detailDrawerData !== null}
        data={detailDrawerData}
        onClose={closeDetailDrawer}
        actions={detailDrawerActions}
      />

      <SldContextMenuController
        request={contextRequest}
        mode={activeMode}
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
    </div>
  );
}
