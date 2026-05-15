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
import { FONT_SANS } from '../theme/tokens';
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

/**
 * K30-6: derive operational severity z konkretnych metric values.
 * Backend severity bywa zawsze INFO — frontend dolicza alarm thresholds
 * per industrial standards.
 *
 * SC_3F (IEC 60909 + IEC 62271 breaker ratings):
 *   Ik" > 25 kA → CRITICAL (typical 12kV/630A breaker overload)
 *   Ik" > 20 kA → IMPORTANT
 *   Ik" > 15 kA → WARNING (high but within range)
 *   else → INFO
 *
 * LOAD_FLOW (PN-EN 50160 voltage tolerance ±10%):
 *   |U/Un - 1| > 10% → CRITICAL
 *   |U/Un - 1| > 7%  → IMPORTANT
 *   |U/Un - 1| > 5%  → WARNING
 *   else → INFO
 */
function deriveOperationalSeverity(
  isSc3F: boolean,
  metric: number | null | undefined,
  nominal: number = 15,
): string {
  if (metric === null || metric === undefined) return 'INFO';
  if (isSc3F) {
    if (metric > 25) return 'CRITICAL';
    if (metric > 20) return 'IMPORTANT';
    if (metric > 15) return 'WARNING';
    return 'INFO';
  }
  // LOAD_FLOW: metric is U in kV
  const pu = Math.abs(metric / nominal - 1);
  if (pu > 0.1) return 'CRITICAL';
  if (pu > 0.07) return 'IMPORTANT';
  if (pu > 0.05) return 'WARNING';
  return 'INFO';
}

interface CableRunForOverlay {
  readonly id: string;
  readonly segmentRefs?: readonly string[];
  readonly segmentPaths?: ReadonlyArray<{
    readonly segmentRef: string;
    readonly pathPoints: ReadonlyArray<{ x: number; y: number }>;
  }>;
}

interface ResultOverlayLayerProps {
  readonly stations: readonly StationOnRunRendererProps[];
  /** K30-6: cable runs dla branch overlay (P/Q/I display po segmencie kabla) */
  readonly cableRuns?: readonly CableRunForOverlay[];
}

export function ResultOverlayLayer(props: ResultOverlayLayerProps): JSX.Element | null {
  const { stations, cableRuns } = props;
  const payload = useRawResultOverlayStore((state) => state.payload);
  if (!payload) return null;

  // K30-5: support multiple analysis types. Display metrics depend on
  // analysis_type w payload (LOAD_FLOW → U_kV+ANGLE, SC_3F → IK_3F + IP).
  const analysisType = payload.analysis_type;
  const isSc3F = analysisType?.toLowerCase().includes('short_circuit') || analysisType === 'SC_3F' || analysisType === 'sc_3f';

  // K30-6: anchor legend pozycji w prawym górnym rogu wzdłuż pierwszej stacji
  const firstStation = stations[0];
  const legendX = firstStation ? firstStation.x - 200 : 100;
  const legendY = firstStation ? firstStation.y - 280 : 80;

  return (
    <g data-testid="sld-v2-result-overlay-layer" data-analysis-type={analysisType} pointerEvents="none">
      {/* K30-6: legenda severity z analysis_type + thresholds + quality */}
      <g data-testid="sld-v2-overlay-legend" transform={`translate(${legendX}, ${legendY})`}>
        <rect x={0} y={0} width={240} height={140} rx={4} ry={4} fill="#0A0E14" stroke="#3A4A5C" strokeWidth={1.5} opacity={0.95} />
        <text x={10} y={20} fill="#DDF7FF" fontFamily={FONT_SANS} fontSize={13} fontWeight={800}>
          {`OVERLAY: ${isSc3F ? 'ZWARCIE 3-FAZOWE' : 'ROZPŁYW MOCY'}`}
        </text>
        {/* K30-6: solver quality status badge */}
        {(() => {
          const qs = payload.quality_status;
          const ps = payload.proof_status;
          if (!qs && !ps) return null;
          const qualityOk = qs !== 'failed';
          const proofComplete = ps === 'complete';
          const qsColor = qs === 'failed' ? '#FF6B6B' : qs === 'partial' ? '#FFD166' : '#7EE0B5';
          return (
            <g data-testid="sld-v2-overlay-quality-badge" transform="translate(150, 0)">
              <rect x={0} y={6} width={84} height={16} rx={2} ry={2} fill={qsColor} opacity={0.85} />
              <text x={42} y={18} textAnchor="middle" fill="#0A0E14" fontFamily={FONT_SANS} fontSize={10} fontWeight={900}>
                {qualityOk && proofComplete ? 'QUALITY OK' : qs === 'failed' ? 'SOLVER FAIL' : 'PARTIAL'}
              </text>
            </g>
          );
        })()}
        {isSc3F ? (
          <>
            <circle cx={20} cy={42} r={6} fill={BADGE_COLOR_INFO} />
            <text x={32} y={46} fill={BADGE_COLOR_INFO} fontFamily={FONT_SANS} fontSize={11} fontWeight={600}>
              Ik″ ≤ 15 kA  (bezpieczne)
            </text>
            <circle cx={20} cy={60} r={6} fill={BADGE_COLOR_WARNING} />
            <text x={32} y={64} fill={BADGE_COLOR_WARNING} fontFamily={FONT_SANS} fontSize={11} fontWeight={600}>
              15-20 kA  (wysokie)
            </text>
            <circle cx={20} cy={78} r={6} fill={BADGE_COLOR_IMPORTANT} />
            <text x={32} y={82} fill={BADGE_COLOR_IMPORTANT} fontFamily={FONT_SANS} fontSize={11} fontWeight={600}>
              20-25 kA  (uwaga)
            </text>
            <circle cx={20} cy={96} r={6} fill={BADGE_COLOR_CRITICAL} />
            <text x={32} y={100} fill={BADGE_COLOR_CRITICAL} fontFamily={FONT_SANS} fontSize={11} fontWeight={600}>
              {'> 25 kA  (>nom. wył.)'}
            </text>
          </>
        ) : (
          <>
            <circle cx={20} cy={42} r={6} fill={BADGE_COLOR_INFO} />
            <text x={32} y={46} fill={BADGE_COLOR_INFO} fontFamily={FONT_SANS} fontSize={11} fontWeight={600}>
              U ±5%  (norma)
            </text>
            <circle cx={20} cy={60} r={6} fill={BADGE_COLOR_WARNING} />
            <text x={32} y={64} fill={BADGE_COLOR_WARNING} fontFamily={FONT_SANS} fontSize={11} fontWeight={600}>
              ±5-7%
            </text>
            <circle cx={20} cy={78} r={6} fill={BADGE_COLOR_IMPORTANT} />
            <text x={32} y={82} fill={BADGE_COLOR_IMPORTANT} fontFamily={FONT_SANS} fontSize={11} fontWeight={600}>
              ±7-10%
            </text>
            <circle cx={20} cy={96} r={6} fill={BADGE_COLOR_CRITICAL} />
            <text x={32} y={100} fill={BADGE_COLOR_CRITICAL} fontFamily={FONT_SANS} fontSize={11} fontWeight={600}>
              {'> ±10%  (PN-EN 50160)'}
            </text>
          </>
        )}
      </g>
      {stations.map((st) => {
        const snBusRef = st.id.endsWith('/station')
          ? `${st.id.slice(0, -'/station'.length)}/sn_bus`
          : `${st.id}/sn_bus`;
        const el = payload.elements[snBusRef];
        if (!el) return null;
        // K30-32: anchor voltage badge closer to station body (was st.y-130 floating).
        // Position 60px above station origin — visually adjacent z explicit leader line
        // connecting badge → station bus, eliminating "floating" per user K30-29.
        const badgeY = st.y - 60;

        // SC_3F: IK_3F_A (initial sc current) + IP_A (peak sc current) + SK_MVA
        const ik3f = isSc3F ? getMetric(payload, snBusRef, 'IK_3F_A') : null;
        const ip = isSc3F ? getMetric(payload, snBusRef, 'IP_A') : null;
        void getMetric; void snBusRef;  // skMva removed K30-52 (overlay shrunk)
        // LOAD_FLOW: U_kV + ANGLE_DEG
        const uKv = !isSc3F ? getMetric(payload, snBusRef, 'U_kV') : null;
        const angleDeg = !isSc3F ? getMetric(payload, snBusRef, 'ANGLE_DEG') : null;

        // K30-6: operational severity z thresholds (override backend INFO).
        const derivedSeverity = isSc3F
          ? deriveOperationalSeverity(true, ik3f?.value ?? null)
          : deriveOperationalSeverity(false, uKv?.value ?? null);
        const color = severityColor(derivedSeverity);

        // K30-52: shrink overlay 180×big → 84×compact (sticker-style),
        // eliminuje dominację stacji visualnie. Single line, monospace.
        const lineCount = isSc3F ? 2 : 1;
        const boxHeight = 8 + lineCount * 11;

        // K30-32: explicit leader line from badge bottom → station bus
        // (eliminates "floating overlay" appearance per user K30-29 feedback).
        const leaderLineDy = Math.max(0, st.y - badgeY - boxHeight + 4);
        return (
          <g
            key={`result-overlay-${st.id}`}
            data-testid={`sld-v2-result-overlay-${st.id}`}
            transform={`translate(${st.x}, ${badgeY})`}
          >
            {/* Leader line: badge bottom → station bus */}
            <line
              x1={0}
              y1={-4 + boxHeight}
              x2={0}
              y2={-4 + boxHeight + leaderLineDy}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.6}
              data-testid={`sld-v2-result-overlay-leader-${st.id}`}
            />
            <rect
              x={-42}
              y={-4}
              width={84}
              height={boxHeight}
              rx={2}
              ry={2}
              fill="#0A0E14"
              stroke={color}
              strokeWidth={1.2}
              opacity={0.95}
            />
            {isSc3F ? (
              <>
                {ik3f && (
                  <text x={0} y={5} textAnchor="middle" fill={color} fontFamily="monospace" fontSize={9} fontWeight={800}>
                    {`Ik″ ${formatMetric(ik3f)}`}
                  </text>
                )}
                {ip && (
                  <text x={0} y={16} textAnchor="middle" fill="#FFD166" fontFamily="monospace" fontSize={8} fontWeight={700}>
                    {`Ip ${formatMetric(ip)}`}
                  </text>
                )}
              </>
            ) : (
              <>
                {uKv && (
                  <text x={0} y={6} textAnchor="middle" fill={color} fontFamily="monospace" fontSize={10} fontWeight={800}>
                    {`U=${uKv.value?.toFixed(2) ?? '—'}kV ${angleDeg?.value != null ? (angleDeg.value >= 0 ? `+${angleDeg.value.toFixed(1)}` : angleDeg.value.toFixed(1)) + '°' : ''}`}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}

      {/* K30-6: branch overlay — P/Q/I_A na każdym segmencie kabla. */}
      {cableRuns?.map((run) =>
        run.segmentPaths?.map((sp) => {
          const el = payload.elements[sp.segmentRef];
          if (!el) return null;
          // LOAD_FLOW: P_MW + Q_MVAR + I_A; SC_3F: IK_3F_A
          const pMw = !isSc3F ? getMetric(payload, sp.segmentRef, 'P_MW') : null;
          const qMvar = !isSc3F ? getMetric(payload, sp.segmentRef, 'Q_MVAR') : null;
          const iA = !isSc3F ? getMetric(payload, sp.segmentRef, 'I_A') : null;
          const ik3fBranch = isSc3F ? getMetric(payload, sp.segmentRef, 'IK_3F_A') : null;
          // Wybierz punkt środkowy segmentu dla label position
          const points = sp.pathPoints;
          if (points.length < 2) return null;
          let midX = 0, midY = 0;
          // Wybierz najdłuższy horizontal segment
          let longest = -1;
          for (let i = 0; i < points.length - 1; i++) {
            const a = points[i], b = points[i + 1];
            if (Math.abs(a.y - b.y) > 0.5) continue;
            const len = Math.abs(b.x - a.x);
            if (len > longest) {
              longest = len;
              midX = (a.x + b.x) / 2;
              midY = a.y;
            }
          }
          if (longest < 0) {
            // fallback: midpoint pierwszej pary
            midX = (points[0].x + points[1].x) / 2;
            midY = (points[0].y + points[1].y) / 2;
          }
          // Pokaż badge TYLKO gdy mamy realną wartość (NIE nominalne nulle)
          const hasLfData = (pMw && pMw.value !== null && pMw.value !== 0)
            || (iA && iA.value !== null && iA.value !== 0);
          const hasScData = ik3fBranch && ik3fBranch.value !== null && ik3fBranch.value !== 0;
          if (!hasLfData && !hasScData) return null;
          const branchSeverity = isSc3F
            ? deriveOperationalSeverity(true, ik3fBranch?.value ?? null)
            : deriveOperationalSeverity(false, iA?.value ?? null, 400 /* nominal cable ampacity ref */);
          const branchColor = severityColor(branchSeverity);
          return (
            <g
              key={`branch-overlay-${sp.segmentRef}`}
              data-testid={`sld-v2-branch-overlay-${sp.segmentRef}`}
              transform={`translate(${midX}, ${midY + 26})`}
            >
              <rect x={-44} y={-9} width={88} height={18} rx={3} ry={3} fill="#0A0E14" stroke={branchColor} strokeWidth={1.2} opacity={0.92} />
              {isSc3F && ik3fBranch ? (
                <text x={0} y={4} textAnchor="middle" fill={branchColor} fontFamily={FONT_SANS} fontSize={11} fontWeight={700}>
                  {`Ik″ ${formatMetric(ik3fBranch)}`}
                </text>
              ) : pMw && qMvar ? (
                <text x={0} y={4} textAnchor="middle" fill={branchColor} fontFamily={FONT_SANS} fontSize={10} fontWeight={700}>
                  {`P ${pMw.value?.toFixed(2)}MW`}
                </text>
              ) : iA ? (
                <text x={0} y={4} textAnchor="middle" fill={branchColor} fontFamily={FONT_SANS} fontSize={11} fontWeight={700}>
                  {`I ${formatMetric(iA)}`}
                </text>
              ) : null}
            </g>
          );
        }),
      )}
    </g>
  );
}
