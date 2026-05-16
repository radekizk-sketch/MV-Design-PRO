/**
 * Protection Zone Marker — P0.7 / PLAN_SLD_REWORK F4 — Protection overlay primitive.
 *
 * STATUS: PRIMITIVE (zintegrowane w pełnym overlay redesign w F4)
 * Reference:
 * - docs/sld/SLD_INDUSTRIAL_SCADA_CAD_TARGET.md § 8.1 (Protection — strefy + t51 + margins)
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 6.2
 * - docs/analysis/PROTECTION_CONTRACTS.md (token-only — bez werdyktów)
 *
 * Renderuje "strefę zadziałania" zabezpieczenia jako półprzezroczyste tło wokół
 * obszaru ochranianego + czas zadziałania t51 [s] przy wyłączniku CB.
 *
 * Wg V12.xx canon: PROTECTION jest pure interpretation — żadnych werdyktów
 * "OK / NOK". Tylko TOKEN-ONLY presence: zone box + t51 numeric.
 *
 * USAGE
 * -----
 *   <ProtectionZoneMarker
 *     boxXywh={[100, 50, 200, 80]}
 *     relayLabel="Q01 51-NN"
 *     t51Seconds={0.18}
 *     margin={{ upstream: 0.30, downstream: 0.15 }}
 *   />
 *
 * INVARIANTY:
 * - Token-only (no verdicts) per docs/analysis/PROTECTION_CONTRACTS.md
 * - Deterministyczna geometria
 * - currentColor (theme-driven)
 * - Polskie etykiety (s, kA, brak codenames)
 */

export interface ProtectionMargin {
  /** Margines selektywności do nadrzędnego CB [s]. */
  upstream?: number;
  /** Margines selektywności do podrzędnego CB [s]. */
  downstream?: number;
}

export interface ProtectionZoneMarkerProps {
  /** Bounding box strefy [x, y, width, height] w jednostkach SVG. */
  boxXywh: readonly [number, number, number, number];
  /** Etykieta zabezpieczenia (np. "Q01 51-NN" lub "TR1 87T"). */
  relayLabel: string;
  /** Czas zadziałania t51 [s]. */
  t51Seconds: number;
  /** Marginesy selektywności (opcjonalne — numeric only, no verdicts). */
  margin?: ProtectionMargin;
  /** Czy renderować box (default true) lub tylko etykiety. */
  showBox?: boolean;
  /** Test ID dla E2E lookup. */
  testId?: string;
}

/**
 * Format time per V12.xx canon (polskie separatory, jednostki SI).
 */
export function formatTimeSeconds(seconds: number, decimals = 2): string {
  if (!Number.isFinite(seconds)) return '— s';
  return `${seconds.toFixed(decimals).replace('.', ',')} s`;
}

/**
 * Format protection margin per PROTECTION_CONTRACTS.md (no verdicts).
 *
 * Pokazuje tylko numeric value + jednostka. NIE interpretuje czy margin
 * jest "OK" czy "NOK" — to decyzja analyst'a wyższej warstwy.
 */
export function formatMargin(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return formatTimeSeconds(value, 2);
}

export function ProtectionZoneMarker({
  boxXywh,
  relayLabel,
  t51Seconds,
  margin,
  showBox = true,
  testId = 'sld-protection-zone-marker',
}: ProtectionZoneMarkerProps): JSX.Element {
  const [bx, by, bwRaw, bhRaw] = boxXywh;
  // CR-FIX (code-review ULEPSZENIE #1): SVG <rect> z negative width/height
  // jest spec-error (Chrome ignoruje, Safari crashuje pipeline). Clamp do 0.
  const bw = Math.max(0, Number.isFinite(bwRaw) ? bwRaw : 0);
  const bh = Math.max(0, Number.isFinite(bhRaw) ? bhRaw : 0);

  const t51Label = formatTimeSeconds(t51Seconds);
  const upstreamLabel = formatMargin(margin?.upstream);
  const downstreamLabel = formatMargin(margin?.downstream);

  // Label position: above the box (top-left corner)
  const labelX = bx + 4;
  const labelYRelay = by - 14;
  const labelYTime = by - 2;

  return (
    <g
      data-testid={testId}
      aria-label={`Strefa zabezpieczeń ${relayLabel}, t51 ${t51Label}`}
    >
      {showBox && (
        <rect
          x={bx}
          y={by}
          width={bw}
          height={bh}
          fill="currentColor"
          fillOpacity={0.06}
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="4 2"
          data-testid={`${testId}-box`}
        />
      )}
      <text
        x={labelX}
        y={labelYRelay}
        fontSize={10}
        fontWeight={600}
        fill="currentColor"
        data-testid={`${testId}-relay`}
      >
        {relayLabel}
      </text>
      <text
        x={labelX}
        y={labelYTime}
        fontSize={9}
        fill="currentColor"
        data-testid={`${testId}-t51`}
      >
        t51: {t51Label}
      </text>
      {upstreamLabel !== null && (
        <text
          x={bx + bw - 4}
          y={labelYRelay}
          fontSize={9}
          fill="currentColor"
          textAnchor="end"
          data-testid={`${testId}-margin-upstream`}
        >
          Δt↑ {upstreamLabel}
        </text>
      )}
      {downstreamLabel !== null && (
        <text
          x={bx + bw - 4}
          y={labelYTime}
          fontSize={9}
          fill="currentColor"
          textAnchor="end"
          data-testid={`${testId}-margin-downstream`}
        >
          Δt↓ {downstreamLabel}
        </text>
      )}
    </g>
  );
}
