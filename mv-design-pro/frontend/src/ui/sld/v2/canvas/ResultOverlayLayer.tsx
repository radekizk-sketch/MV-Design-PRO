/**
 * ResultOverlayLayer — SVG layer renderujący wyniki obliczeń
 * (LOAD_FLOW / SC_3F / etc.) na canvas v2 SLD.
 *
 * K30-3 / NO-GO #9 fix: SldWorkspaceContainer dotychczas NIE pokazywał
 * wyników obliczeń (user feedback "nie widać wyników obliczeń"). Layer
 * dodaje text badge per station/branch z metricami z backend
 * ResultsContractV1 (raw payload via useRawResultOverlayStore).
 *
 * Mapowanie ref ID:
 *   station_id="stn/{hash}/station" → bus_ref="stn/{hash}/sn_bus"
 *   cable_run.segmentRef = bus->bus branch ref_id (matched bezpośrednio)
 *
 * UI: małe etykiety nad stacją z napięciem SN [kV] + kątem [°];
 * przy nadmiarze wartości severity color coded.
 */
import { COLOR_TEXT_PRIMARY, FONT_SANS } from '../theme/tokens';
import {
  useRawResultOverlayStore,
  getMetric,
  formatMetric,
} from '../../../sld-overlay/rawResultOverlayStore';
import type { StationOnRunRendererProps } from '../renderer/StationOnRunRenderer';

const BADGE_COLOR_INFO = '#7EE0B5';
const BADGE_COLOR_WARNING = '#FFD166';
const BADGE_COLOR_IMPORTANT = '#FF8B5C';
const BADGE_COLOR_CRITICAL = '#FF6B6B';

function severityColor(severity: string | undefined): string {
  if (severity === 'CRITICAL') return BADGE_COLOR_CRITICAL;
  if (severity === 'IMPORTANT') return BADGE_COLOR_IMPORTANT;
  if (severity === 'WARNING') return BADGE_COLOR_WARNING;
  return BADGE_COLOR_INFO;
}

interface ResultOverlayLayerProps {
  readonly stations: readonly StationOnRunRendererProps[];
}

export function ResultOverlayLayer(props: ResultOverlayLayerProps): JSX.Element | null {
  const { stations } = props;
  const payload = useRawResultOverlayStore((state) => state.payload);
  if (!payload) return null;

  return (
    <g data-testid="sld-v2-result-overlay-layer" pointerEvents="none">
      {stations.map((st) => {
        // station ID "stn/{hash}/station" → bus ref "stn/{hash}/sn_bus"
        const snBusRef = st.id.endsWith('/station')
          ? `${st.id.slice(0, -'/station'.length)}/sn_bus`
          : `${st.id}/sn_bus`;
        const el = payload.elements[snBusRef];
        if (!el) return null;
        const uKv = getMetric(payload, snBusRef, 'U_kV');
        const angleDeg = getMetric(payload, snBusRef, 'ANGLE_DEG');
        const color = severityColor(el.severity);
        // Badge powyżej stacji (transform: -32 px) — nie koliduje z label name (30)
        // ani type label (48).
        const badgeY = st.y - 80;
        return (
          <g
            key={`result-overlay-${st.id}`}
            data-testid={`sld-v2-result-overlay-${st.id}`}
            transform={`translate(${st.x}, ${badgeY})`}
          >
            <rect
              x={-36}
              y={-9}
              width={72}
              height={uKv && angleDeg ? 28 : 14}
              rx={3}
              ry={3}
              fill="#0A0E14"
              stroke={color}
              strokeWidth={1.2}
              opacity={0.92}
            />
            {uKv && (
              <text
                x={0}
                y={2}
                textAnchor="middle"
                fill={color}
                fontFamily={FONT_SANS}
                fontSize={9}
                fontWeight={800}
              >
                U={formatMetric(uKv)}
              </text>
            )}
            {angleDeg && (
              <text
                x={0}
                y={14}
                textAnchor="middle"
                fill={COLOR_TEXT_PRIMARY}
                fontFamily={FONT_SANS}
                fontSize={8}
                fontWeight={600}
                opacity={0.85}
              >
                δ={formatMetric(angleDeg)}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
