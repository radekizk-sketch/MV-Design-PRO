/**
 * LegacyInspektor (karta E1.7c) — prawy panel nowej powłoki z mostem do
 * zawartości panelowej starego UI (reguły PRZENIESIONE z AppShellV12
 * `resolvedInspectorContent`):
 *
 * 1. Powierzchnia panelowa (openMode 'replace_right_panel' — formularze
 *    operacji domenowych, karty E-xx) → WorkspaceSurfaceRouter region="panel".
 * 2. Selekcja w globalnym store selekcji (kanwa SLD) → karta techniczna
 *    elementu (InspectorEngineeringView).
 * 3. W pozostałych przypadkach → inspektor nowej powłoki (fallback, E1.3).
 *
 * Świadoma różnica wobec starej ramy (rejestr wygaszania): panel prowadzenia
 * budowy (GuidedBuildActionPanel) nie jest mostkowany — jego funkcje są
 * osiągalne przez menu kontekstowe kanwy SLD i wyszukiwarkę poleceń;
 * pełne przejęcie = karty U2.
 */

import type { ReactNode } from 'react';

import { WorkspaceSurfaceRouter } from '../../ui/workspace';
import { InspectorEngineeringView } from '../../ui/network-build/InspectorEngineeringView';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../ui/selection/store';

export interface LegacyInspektorProps {
  /** Inspektor nowej powłoki (E1.3) — renderowany, gdy most nie ma zawartości. */
  fallback: ReactNode;
}

export function LegacyInspektor({ fallback }: LegacyInspektorProps) {
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);

  if (activeSurface && activeSurface.openMode !== 'expand_workspace') {
    return <WorkspaceSurfaceRouter region="panel" />;
  }
  if (selectedElement) {
    return <InspectorEngineeringView />;
  }
  return <>{fallback}</>;
}
