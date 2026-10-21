/**
 * Uprząż testów: sekcje „z kanwy" prawego inspektora DOKŁADNIE tak, jak montuje je
 * `InspectorEngineeringView` (`useStanPaneluElementu` → `PanelElementuKanwy`), bez reszty
 * inspektora (katalogi, gotowość, karta techniczna), która wymaga własnych atrap backendu.
 * Testy kanwy renderują ją obok `SldCanvasV3Workspace`: klik w obiekt kanwy → selekcja
 * i kontekst kliknięcia → te sekcje. Kanwa sama nie renderuje żadnego panelu.
 * Uprząż pomija `LegacyInspektor` i okno techniczne, które otwiera synchronizacja selekcji;
 * złożenie żywego inspektora (sekcje NAD oknem, bez dubli działań) przypina
 * `ui2/legacy/__tests__/legacyInspektorPanelNadOknem.test.tsx`.
 */
import type { JSX } from 'react';

import { PanelElementuKanwy } from '../PanelElementuKanwy';
import { useStanPaneluElementu } from '../stanPaneluElementu';

export function InspektorKanwyTestowy(): JSX.Element | null {
  const stan = useStanPaneluElementu();
  return stan ? (
    <aside data-testid="inspektor-testowy">
      <PanelElementuKanwy stan={stan} />
    </aside>
  ) : null;
}
