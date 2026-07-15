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
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { buildSupplyPathHighlight, isElementEnergized, type SupplyPathHighlight } from '../../v2/canvas/SupplyPathHighlighter';
import { useRawResultOverlayStore, type RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
import { buildSceneV3, type SceneLod } from '../scene/buildScene';
import type { PreviewElementKind } from '../compose/preview';
import { SldCanvasV3, type SldElementClickMeta } from './SldCanvasV3';
import { buildFlowOverlayFromScene, singleHopSegmentRefs, type SegmentFlowOverlay, type SldV3Overlay } from './overlay';

const MIN_CANVAS_WIDTH_PX = 320;
const MIN_CANVAS_HEIGHT_PX = 240;

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
}

/** Pomiar rozmiaru kontenera — analogiczny do `useMeasuredSize` w
 *  `SldWorkspaceContainer.tsx` (nieeksportowane stamtąd — duplikat lokalny,
 *  bo zmiany w v2 mają być minimalne, patrz ograniczenia zadania F8a). */
function useMeasuredSize(
  ref: React.RefObject<HTMLDivElement>,
  fallbackWidth: number,
  fallbackHeight: number,
  override?: { width?: number; height?: number },
): { width: number; height: number } {
  const [size, setSize] = useState<{ width: number; height: number }>(() => ({
    width: override?.width ?? fallbackWidth,
    height: override?.height ?? fallbackHeight,
  }));

  useEffect(() => {
    if (override?.width !== undefined && override?.height !== undefined) {
      const next = { width: override.width, height: override.height };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
      return;
    }
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = {
        width: Math.max(MIN_CANVAS_WIDTH_PX, entry.contentRect.width),
        height: Math.max(MIN_CANVAS_HEIGHT_PX, entry.contentRect.height),
      };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [override?.width, override?.height, ref]);

  return size;
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
  const { width: widthOverride, height: heightOverride } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useMeasuredSize(containerRef, 1024, 640, { width: widthOverride, height: heightOverride });

  // Dane: TA SAMA instancja ENM co v2 (`SldWorkspaceContainer` czyta z tego
  // samego store'a) — zero shadow-modelu (Core Rule #3).
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const selectElement = useSelectionStore((state) => state.selectElement);
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

  const handleElementClick = useCallback(
    (testId: string, meta?: SldElementClickMeta) => {
      const id = meta?.ownerRef ?? elementIdFromTestId(testId);
      const type = elementTypeForKind(meta?.elementKind);
      selectElement(type ? { id, type, name: id } : { id, type: 'DescriptiveElement', name: id });
    },
    [selectElement],
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
        />
      ) : null}
    </div>
  );
}
