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

  // K30-5: support multiple analysis types. Display metrics depend on
  // analysis_type w payload (LOAD_FLOW → U_kV+ANGLE, SC_3F → IK_3F + IP).
  const analysisType = payload.analysis_type;
  const isSc3F = analysisType?.toLowerCase().includes('short_circuit') || analysisType === 'SC_3F' || analysisType === 'sc_3f';

  return (
    <g data-testid="sld-v2-result-overlay-layer" data-analysis-type={analysisType} pointerEvents="none">
      {stations.map((st) => {
        const snBusRef = st.id.endsWith('/station')
          ? `${st.id.slice(0, -'/station'.length)}/sn_bus`
          : `${st.id}/sn_bus`;
        const el = payload.elements[snBusRef];
        if (!el) return null;
        const color = severityColor(el.severity);
        const badgeY = st.y - 130;

        // SC_3F: IK_3F_A (initial sc current) + IP_A (peak sc current) + SK_MVA
        const ik3f = isSc3F ? getMetric(payload, snBusRef, 'IK_3F_A') : null;
        const ip = isSc3F ? getMetric(payload, snBusRef, 'IP_A') : null;
        const skMva = isSc3F ? getMetric(payload, snBusRef, 'SK_MVA') : null;
        // LOAD_FLOW: U_kV + ANGLE_DEG
        const uKv = !isSc3F ? getMetric(payload, snBusRef, 'U_kV') : null;
        const angleDeg = !isSc3F ? getMetric(payload, snBusRef, 'ANGLE_DEG') : null;

        const lineCount = isSc3F ? 3 : 2;
        const boxHeight = 18 + lineCount * 16;

        return (
          <g
            key={`result-overlay-${st.id}`}
            data-testid={`sld-v2-result-overlay-${st.id}`}
            transform={`translate(${st.x}, ${badgeY})`}
          >
            <rect
              x={-90}
              y={-18}
              width={180}
              height={boxHeight}
              rx={4}
              ry={4}
              fill="#0A0E14"
              stroke={color}
              strokeWidth={2}
              opacity={0.95}
            />
            {isSc3F ? (
              <>
                {ik3f && (
                  <text x={0} y={2} textAnchor="middle" fill={color} fontFamily={FONT_SANS} fontSize={15} fontWeight={800}>
                    Ik″={formatMetric(ik3f)}
                  </text>
                )}
                {ip && (
                  <text x={0} y={20} textAnchor="middle" fill="#FFD166" fontFamily={FONT_SANS} fontSize={13} fontWeight={700}>
                    Ip={formatMetric(ip)}
                  </text>
                )}
                {skMva && (
                  <text x={0} y={38} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={12} fontWeight={600} opacity={0.85}>
                    Sk={formatMetric(skMva)}
                  </text>
                )}
              </>
            ) : (
              <>
                {uKv && (
                  <text x={0} y={4} textAnchor="middle" fill={color} fontFamily={FONT_SANS} fontSize={16} fontWeight={800}>
                    U={formatMetric(uKv)}
                  </text>
                )}
                {angleDeg && (
                  <text x={0} y={26} textAnchor="middle" fill={COLOR_TEXT_PRIMARY} fontFamily={FONT_SANS} fontSize={13} fontWeight={600} opacity={0.85}>
                    δ={formatMetric(angleDeg)}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}
