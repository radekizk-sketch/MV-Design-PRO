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
        // K30-4: badge enlarged dla industrial readability (font 9→16, box 72→140).
        // Position above station: -120 (was -80, accommodates new 200px station height).
        const badgeY = st.y - 130;
        return (
          <g
            key={`result-overlay-${st.id}`}
            data-testid={`sld-v2-result-overlay-${st.id}`}
            transform={`translate(${st.x}, ${badgeY})`}
          >
            <rect
              x={-70}
              y={-16}
              width={140}
              height={uKv && angleDeg ? 50 : 26}
              rx={4}
              ry={4}
              fill="#0A0E14"
              stroke={color}
              strokeWidth={2}
              opacity={0.95}
            />
            {uKv && (
              <text
                x={0}
                y={4}
                textAnchor="middle"
                fill={color}
                fontFamily={FONT_SANS}
                fontSize={16}
                fontWeight={800}
              >
                U={formatMetric(uKv)}
              </text>
            )}
            {angleDeg && (
              <text
                x={0}
                y={26}
                textAnchor="middle"
                fill={COLOR_TEXT_PRIMARY}
                fontFamily={FONT_SANS}
                fontSize={13}
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
