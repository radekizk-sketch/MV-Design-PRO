/**
 * F8a — `SldRenderHost`: JEDYNY punkt osadzenia, w którym `App.tsx` decyduje
 * v2/v3 (SLD_CAD_REBUILD_PLAN_V3.md §F8 „Feature-flag cutoveru").
 * Domyślnie v3 (`sldRenderVersion.ts` → `featureFlags.USE_SLD_CANVAS_V3`);
 * v2 (`SldWorkspaceContainer`, pełna funkcjonalność — CAD-edycja, drawer,
 * context-menu, DER-paleta, nakładki wyników, patrz spec §10) pozostaje
 * dostępny fallbackiem. USUNIĘCIE v2 to F8b — NIETKNIĘTE tu.
 *
 * v3 (`SldCanvasV3Workspace`) jest w tej dostawie MINIMALNY (brak CAD-edycji/
 * drawer/DER-palety/nakładek — patrz nagłówek tego pliku i raport F8a) — więc
 * `splitPreviewState`/`onSplitConfirm`/`onSplitCancel` (Wizard K7) nie mają
 * dziś odpowiednika w v3 i są IGNOROWANE w tej gałęzi (celowo, nie
 * przeoczenie — funkcjonalność do doniesienia w migracji funkcjonalnej F8b).
 */
import type { SplitStatePreviewReady } from './v2/workflow/ConsciousSplitController';
import { SldWorkspaceContainer } from './v2/canvas/SldWorkspaceContainer';
import { SldCanvasV3Workspace } from './v3/canvas/SldCanvasV3Workspace';
import { resolveSldRenderVersion } from './sldRenderVersion';

export interface SldRenderHostProps {
  readonly readOnly?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly splitPreviewState?: SplitStatePreviewReady | null;
  readonly onSplitConfirm?: () => void;
  readonly onSplitCancel?: () => void;
}

export function SldRenderHost(props: SldRenderHostProps = {}): JSX.Element {
  const version = resolveSldRenderVersion();
  if (version === 'v2') {
    return <SldWorkspaceContainer {...props} />;
  }
  return <SldCanvasV3Workspace readOnly={props.readOnly} width={props.width} height={props.height} />;
}
