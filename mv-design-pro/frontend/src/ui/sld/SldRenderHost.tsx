/**
 * F8a — `SldRenderHost`: JEDYNY punkt osadzenia, w którym `App.tsx` decyduje
 * v2/v3 (SLD_CAD_REBUILD_PLAN_V3.md §F8 „Feature-flag cutoveru").
 * Domyślnie v3 (`sldRenderVersion.ts` → `featureFlags.USE_SLD_CANVAS_V3`);
 * v2 (`SldWorkspaceContainer`, pełna funkcjonalność — CAD-edycja, drawer,
 * context-menu, DER-paleta, nakładki wyników, patrz spec §10) pozostaje
 * dostępny fallbackiem. USUNIĘCIE v2 to F8b — NIETKNIĘTE tu.
 *
 * v3 (`SldCanvasV3Workspace`) jest w tej dostawie WCIĄŻ niekompletny wobec v2
 * (brak CAD-edycji/drawer/DER-palety — spec §10 inwentarz, migracja
 * funkcjonalna F8b+) — konkretnie Conscious Split (Wizard K7,
 * `ConsciousSplitController`/`SplitPreviewPanel`) nie ma w v3 odpowiednika.
 *
 * F8b-1 (REBUILD_PLAN_V3 §F8b, „parytet funkcjonalny v3 przed usunięciem v2",
 * D — pomost split-preview): POLITYKA ZERO REGRESJI wymaga, że żadna funkcja
 * v2 nie może „zniknąć" przy domyślnym v3. Host wymusza AUTOMATYCZNIE ścieżkę
 * v2 (JEDYNA, która umie wyrenderować `SplitPreviewPanel`), gdy wołający
 * przekaże AKTYWNY `splitPreviewState` — NIEZALEŻNIE od `resolveSldRenderVersion()`.
 * Po zakończeniu podglądu (`splitPreviewState` → `null`/`undefined`) host
 * wraca do domyślnej ścieżki (v3) — czysta funkcja propsów, bez dodatkowego
 * stanu: każdy render przelicza to na nowo, więc powrót jest automatyczny.
 * To POMOST do pełnej migracji funkcjonalnej (v3 dostanie własną edycję CAD/
 * Conscious-Split w F8b+/dalszych fazach) — NIE trwałe rozwiązanie; gdy v3
 * przejmie ten workflow, ten branch (i `forceV2ForSplitPreview`) odpada.
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
  // F8b-1 D: pomost split-preview — v3 nie ma jeszcze Conscious Split, więc
  // gdy podgląd jest aktywny, host renderuje v2 NIEZALEŻNIE od flagi
  // cutoveru (patrz nagłówek pliku).
  const forceV2ForSplitPreview = props.splitPreviewState != null;
  if (version === 'v2' || forceV2ForSplitPreview) {
    return <SldWorkspaceContainer {...props} />;
  }
  return <SldCanvasV3Workspace readOnly={props.readOnly} width={props.width} height={props.height} />;
}
