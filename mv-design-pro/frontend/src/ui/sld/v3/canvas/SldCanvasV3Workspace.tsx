/**
 * F8a — `SldCanvasV3Workspace`: punkt osadzenia `SldCanvasV3` w aplikacji
 * (REBUILD_PLAN_V3 §F8 „Feature-flag cutoveru"). Analogiczny do
 * `v2/canvas/SldWorkspaceContainer.tsx` (pomiar rozmiaru kontenera, ENM ze
 * WSPÓLNEGO store'a — zero shadow-modelu), ale MINIMALNY: v3 nie ma jeszcze
 * CAD-edycji/drawer/context-menu/DER-palety (spec §10 inwentarz — poza
 * zakresem F8a, to F8b+ pełna migracja funkcjonalna).
 *
 * Okablowanie (raport F8a, sekcja „co podłączone / co STOP"):
 *  - dane: `useSnapshotStore` — TA SAMA instancja ENM co v2 (żaden nowy
 *    store, żadna kopia modelu — Core Rule #3 „Single Model");
 *  - selekcja: `onElementClick` → `useSelectionStore.selectElement`, TEN SAM
 *    store globalny co v2. Mapowanie testId→SelectedElement jest
 *    OGRANICZONE (patrz `elementIdFromTestId` niżej) — bogatszy
 *    ElementType/nazwa (jak `describeGpzApparatus`/`findBayByRef` w v2)
 *    wymagałby, by `PreviewSymbol.meta` niosło kind/ownerKind elementu, co
 *    jest zmianą `scene/buildScene.ts` — plik NIETYKANY w tym zadaniu (scena
 *    zamrożona poza autoryzowanym zakresem). Fallback użyty tu
 *    (`type: 'DescriptiveElement'`) jest TYM SAMYM fallbackiem, którego v2
 *    używa dla elementów nierozpoznanych (`SldWorkspaceContainer.tsx`:
 *    `selectElement(selected ?? { id, type: 'DescriptiveElement', name: id })`)
 *    — nie nowa semantyka, degradacja zgodna z istniejącym wzorcem;
 *  - nakładka energizacji (k1): STOP-notatka — `overlay` prop NIE podłączony.
 *    `testId` symboli aparatury ma postać `${bayRef}#${symbolId}`
 *    (`buildScene.ts`), a dostępne źródła solvera
 *    (`useRawResultOverlayStore` — payload keyed by `ref_id`, metryki nie
 *    boolean; `SldPowerFlowCompanion` — `energized_branch_refs`/
 *    `energized_bus_refs` keyed by ENM ref) wymagałyby rozwiązania bayRef→
 *    ref ENM per typ aparatu ORAZ scalenia dwóch nieujednoliconych źródeł
 *    (już odnotowane jako STOP w `canvas/overlay.ts` nagłówek, F6b) — decyzja
 *    architektoniczna POZA zakresem F8a. Interfejs `SldV3Overlay` zostaje
 *    nietknięty, gotowy na podłączenie w kolejnej fazie.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { SldCanvasV3 } from './SldCanvasV3';

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
 *  ENM `ref_id` (jak w v2) — patrz STOP-notatka w nagłówku pliku. */
function elementIdFromTestId(testId: string): string {
  const hashIndex = testId.indexOf('#');
  return hashIndex >= 0 ? testId.slice(0, hashIndex) : testId;
}

export function SldCanvasV3Workspace(props: SldCanvasV3WorkspaceProps): JSX.Element {
  const { width: widthOverride, height: heightOverride } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const size = useMeasuredSize(containerRef, 1024, 640, { width: widthOverride, height: heightOverride });

  // Dane: TA SAMA instancja ENM co v2 (`SldWorkspaceContainer` czyta z tego
  // samego store'a) — zero shadow-modelu (Core Rule #3).
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const selectElement = useSelectionStore((state) => state.selectElement);

  const handleElementClick = useCallback(
    (testId: string) => {
      const id = elementIdFromTestId(testId);
      selectElement({ id, type: 'DescriptiveElement', name: id });
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
          onElementClick={handleElementClick}
        />
      ) : null}
    </div>
  );
}
