/**
 * SLD Overlay Demo — P0.7 + GAP-4 integration.
 *
 * STATUS: SHOWCASE COMPONENT
 * Reference:
 * - Test architect audyt GAP-4: "overlay primitives unused — dead components"
 * - frontend/src/ui/sld-overlay/{FaultContributionArrow,PowerFlowArrow,
 *   ProtectionZoneMarker}.tsx
 *
 * Demonstration komponent — łączy wszystkie 3 overlay primitives w 1 SVG
 * canvas, pokazując jak są używane razem. Może być importowany do storybook'a
 * lub jako standalone debug panel.
 *
 * USAGE
 * -----
 *   <SldOverlayDemo data={demoData} />
 *
 * @returns SVG canvas z 3 demonstracjami primitiveów
 */

import { FaultContributionArrow } from './FaultContributionArrow';
import { PowerFlowArrow } from './PowerFlowArrow';
import { ProtectionZoneMarker } from './ProtectionZoneMarker';

export interface SldOverlayDemoFaultContribution {
  readonly fromXy: readonly [number, number];
  readonly toXy: readonly [number, number];
  readonly magnitudeKa: number;
  readonly sourceLabel: string;
}

export interface SldOverlayDemoPowerFlow {
  readonly fromXy: readonly [number, number];
  readonly toXy: readonly [number, number];
  readonly activeMw: number;
  readonly reactiveMvar: number;
  readonly loadingPct: number;
}

export interface SldOverlayDemoProtectionZone {
  readonly boxXywh: readonly [number, number, number, number];
  readonly relayLabel: string;
  readonly t51Seconds: number;
  readonly margin?: { upstream?: number; downstream?: number };
}

export interface SldOverlayDemoData {
  readonly faultContributions: readonly SldOverlayDemoFaultContribution[];
  readonly powerFlows: readonly SldOverlayDemoPowerFlow[];
  readonly protectionZones: readonly SldOverlayDemoProtectionZone[];
}

export interface SldOverlayDemoProps {
  data: SldOverlayDemoData;
  /** Width of the canvas (default 800). */
  width?: number;
  /** Height of the canvas (default 400). */
  height?: number;
  /** Test ID dla E2E lookup. */
  testId?: string;
}

/**
 * Default demo dataset — pokazuje typowy scenariusz industrial:
 * - 2 strzałki contributions SC (GPZ + Generator)
 * - 1 PF arrow (high loading)
 * - 1 Protection zone
 */
export const DEFAULT_DEMO_DATA: SldOverlayDemoData = {
  faultContributions: [
    {
      fromXy: [50, 100],
      toXy: [400, 100],
      magnitudeKa: 8.5,
      sourceLabel: 'GPZ',
    },
    {
      fromXy: [50, 200],
      toXy: [400, 200],
      magnitudeKa: 1.2,
      sourceLabel: 'Generator A',
    },
  ],
  powerFlows: [
    {
      fromXy: [50, 300],
      toXy: [600, 300],
      activeMw: 4.2,
      reactiveMvar: 1.5,
      loadingPct: 87,
    },
  ],
  protectionZones: [
    {
      boxXywh: [400, 50, 200, 100],
      relayLabel: 'Q01 51-NN',
      t51Seconds: 0.18,
      margin: { upstream: 0.3, downstream: 0.15 },
    },
  ],
};

export function SldOverlayDemo({
  data,
  width = 800,
  height = 400,
  testId = 'sld-overlay-demo',
}: SldOverlayDemoProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      data-testid={testId}
      aria-label="Demonstracja prymityw overlay SLD (SC + PF + Protection)"
    >
      {data.faultContributions.map((fc, idx) => (
        <FaultContributionArrow
          key={`fc-${idx}`}
          fromXy={fc.fromXy}
          toXy={fc.toXy}
          magnitudeKa={fc.magnitudeKa}
          sourceLabel={fc.sourceLabel}
          testId={`${testId}-fc-${idx}`}
        />
      ))}
      {data.powerFlows.map((pf, idx) => (
        <PowerFlowArrow
          key={`pf-${idx}`}
          fromXy={pf.fromXy}
          toXy={pf.toXy}
          activeMw={pf.activeMw}
          reactiveMvar={pf.reactiveMvar}
          loadingPct={pf.loadingPct}
          testId={`${testId}-pf-${idx}`}
        />
      ))}
      {data.protectionZones.map((pz, idx) => (
        <ProtectionZoneMarker
          key={`pz-${idx}`}
          boxXywh={pz.boxXywh}
          relayLabel={pz.relayLabel}
          t51Seconds={pz.t51Seconds}
          margin={pz.margin}
          testId={`${testId}-pz-${idx}`}
        />
      ))}
    </svg>
  );
}
