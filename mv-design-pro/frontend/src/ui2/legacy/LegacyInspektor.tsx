/**
 * LegacyInspektor (karta E1.7c) — prawy panel nowej powłoki z mostem do
 * zawartości panelowej starego UI (reguły PRZENIESIONE z AppShellV12
 * `resolvedInspectorContent`):
 *
 * 1. Powierzchnia panelowa (openMode 'replace_right_panel' — formularze
 *    operacji domenowych, karty E-xx) → WorkspaceSurfaceRouter region="panel".
 *    Gdy to okno techniczne otwarte przez synchronizację selekcji (klik obiektu na
 *    schemacie), NAD nim stoją sekcje obiektu z kanwy (karta UI-02b JEDEN-INSPEKTOR:
 *    działania z rejestru menu kanwy, wyniki, stan aparatu, formularz układu
 *    PV/BESS/FW) — `inspektor-elementu/panelNadOknem.ts`.
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
import { PanelElementuKanwy } from '../../ui/network-build/inspektor-elementu/PanelElementuKanwy';
import { usePanelNadOknem } from '../../ui/network-build/inspektor-elementu/panelNadOknem';
import { useNetworkBuildStore } from '../../ui/network-build/networkBuildStore';
import { useSelectionStore } from '../../ui/selection/store';

export interface LegacyInspektorProps {
  /** Inspektor nowej powłoki (E1.3) — renderowany, gdy most nie ma zawartości. */
  fallback: ReactNode;
}

export function LegacyInspektor({ fallback }: LegacyInspektorProps) {
  const activeSurface = useNetworkBuildStore((state) => state.activeSurface);
  const selectedElement = useSelectionStore((state) => state.selectedElements[0] ?? null);

  const panelNadOknem = usePanelNadOknem();

  if (activeSurface && activeSurface.openMode !== 'expand_workspace') {
    if (!panelNadOknem) return <WorkspaceSurfaceRouter region="panel" />;
    return (
      // Jedno przewijanie — treść inspektora (`mvd-inspector-tresc`): sekcje obiektu i okno
      // techniczne mają naturalną wysokość (kolumna flex ściskałaby okno pod paskiem przy
      // 900 px wysokości ekranu). Kontener NIE ma własnej wysokości ani przewijania: okna
      // E-10…E-15 są kolumnami `h-full` z ciałem `flex-1 overflow-auto`, więc kontener
      // o wysokości kadru (dawne `h-full overflow-y-auto`) nadawał oknu wysokość kadru pod
      // panelem elementu — przewijał się kontener, a w nim ciało okna. Pomiar 2026-10-29
      // (UX-04, e2e okna pola Z.10/Z.11.1): ocena pola w trzecim zagnieżdżonym przewijaniu
      // (sekcje karty pola), ostatni wiersz ucięty pod ramką sekcji przy każdej wysokości
      // okna. Przypięte: e2e `ux04-pole-liniowe-zrzuty-screenshot.spec.ts`
      // (`jednoPrzewijanieInspektora`) i `legacyInspektorPanelNadOknem.test.tsx`.
      <div data-testid="inspektor-panel-nad-oknem">
        <PanelElementuKanwy stan={panelNadOknem} />
        <WorkspaceSurfaceRouter region="panel" />
      </div>
    );
  }
  if (selectedElement) {
    return <InspectorEngineeringView />;
  }
  return <>{fallback}</>;
}
