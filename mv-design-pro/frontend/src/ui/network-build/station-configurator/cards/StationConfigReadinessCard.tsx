/**
 * Karta 10 — Gotowość obliczeń (macierz 10 typów, PR-8a brief §8 karta 10).
 */

import type { ReadinessItem } from '../../build-sidebar/ReadinessSection';
import { ReadinessSection } from '../../build-sidebar/ReadinessSection';

export interface StationConfigReadinessCardProps {
  readonly items: readonly ReadinessItem[];
}

export function StationConfigReadinessCard(
  props: StationConfigReadinessCardProps,
): JSX.Element {
  const { items } = props;
  return (
    <div data-testid="station-config-readiness" className="flex flex-col gap-2 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
        Gotowość obliczeń (10 typów)
      </div>
      <div className="text-[10px] text-scada-muted">
        Macierz statusów dla wszystkich obliczeń projektu w kontekście tej stacji.
      </div>
      <ReadinessSection items={items} />
    </div>
  );
}
