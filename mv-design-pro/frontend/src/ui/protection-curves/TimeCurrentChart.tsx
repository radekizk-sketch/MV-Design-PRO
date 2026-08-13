/**
 * FIX-06 — Time-Current Chart Component
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: Analysis layer visualization
 * - PROTECTION_CURVES_IT_SUPERIOR_CONTRACT.md: Log-log rendering
 * - 100% Polish UI labels
 *
 * FEATURES:
 * - Logarithmic I-t chart (log-log scale)
 * - Multiple protection curves overlay
 * - Fault current markers (vertical lines)
 * - Interactive tooltip with trip times
 * - Responsive container
 */

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

import type {
  ProtectionCurve,
  FaultMarker,
  TimeCurrentChartConfig,
  CurvePoint,
} from './types';
import {
  PROTECTION_CURVES_LABELS,
  DEFAULT_CHART_CONFIG,
  CURVE_COLORS,
} from './types';

// =============================================================================
// Types
// =============================================================================

interface TimeCurrentChartProps {
  /** Protection curves to display */
  curves: ProtectionCurve[];
  /** Fault current markers */
  faultMarkers?: FaultMarker[];
  /** Chart configuration */
  config?: TimeCurrentChartConfig;
  /** Selected curve ID (for highlighting) */
  selectedCurveId?: string | null;
  /** Curve click handler */
  onCurveClick?: (curveId: string) => void;
}

interface ChartDataPoint {
  current: number;
  [curveId: string]: number | undefined;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number;
    color: string;
    payload: ChartDataPoint;
  }>;
  label?: number;
  curves: ProtectionCurve[];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate logarithmic scale values.
 */
function generateLogScale(min: number, max: number, numPoints: number): number[] {
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const points: number[] = [];

  for (let i = 0; i < numPoints; i++) {
    const logValue = logMin + ((logMax - logMin) * i) / (numPoints - 1);
    points.push(Math.pow(10, logValue));
  }

  return points;
}

/**
 * Format current value for display.
 */
function formatCurrent(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toFixed(0);
}

/**
 * Format time value for display.
 */
function formatTime(value: number): string {
  if (value >= 1) {
    return value.toFixed(1);
  }
  if (value >= 0.1) {
    return value.toFixed(2);
  }
  return value.toFixed(3);
}

/**
 * Find trip time for a given current from curve points.
 */
function interpolateTripTime(
  current: number,
  points: CurvePoint[]
): number | undefined {
  if (points.length === 0) return undefined;

  // Find surrounding points
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    if (current >= p1.current_a && current <= p2.current_a) {
      // Log-linear interpolation
      const logI = Math.log10(current);
      const logI1 = Math.log10(p1.current_a);
      const logI2 = Math.log10(p2.current_a);
      const logT1 = Math.log10(p1.time_s);
      const logT2 = Math.log10(p2.time_s);

      const ratio = (logI - logI1) / (logI2 - logI1);
      const logT = logT1 + ratio * (logT2 - logT1);

      return Math.pow(10, logT);
    }
  }

  return undefined;
}

// =============================================================================
// Custom Tooltip Component
// =============================================================================

function CustomTooltip({ active, payload, label, curves }: CustomTooltipProps) {
  if (!active || !payload?.length || !label) return null;

  const current = label;

  return (
    <div className="rounded border border-slate-200 bg-white p-3 shadow-lg">
      <p className="mb-2 border-b border-slate-100 pb-2 font-semibold text-slate-900">
        {formatCurrent(current)} A
      </p>
      <div className="space-y-1 text-sm">
        {payload.map((entry) => {
          const curve = curves.find((c) => c.id === entry.dataKey);
          if (!curve || entry.value === undefined) return null;

          return (
            <div key={entry.dataKey} className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-600">{curve.name_pl}:</span>
              <span className="font-mono font-medium text-slate-900">
                {formatTime(entry.value)} s
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Empty State Component
// =============================================================================

/**
 * Stan zerowy wykresu TCC.
 *
 * Zero-Debt (karta NAWIGACJA-JEDEN-KANON): gałąź bez `onAddCurve` prowadziła
 * odnośnikiem `#protection-library` — trasy o tej nazwie NIE MA w żadnym
 * rejestrze, więc klik lądował na stronie „Nieznana trasa interfejsu". Żaden
 * konsument (`ItCurvePanel`, `TccChart`) nie podawał `onAddCurve`, czyli
 * WYŁĄCZNIE ta martwa gałąź była widoczna dla użytkownika. Odnośnik usunięty;
 * został uczciwy stan zerowy z akcją, gdy wołający ją dostarczy.
 */
interface EmptyStateProps {
  onAddCurve?: () => void;
}

function EmptyState({ onAddCurve }: EmptyStateProps = {}) {
  const labels = PROTECTION_CURVES_LABELS.chart;

  return (
    <div
      className="flex h-full flex-col items-center justify-center p-12 text-slate-500"
      data-testid="empty-state-tcc"
    >
      <svg
        className="mb-4 h-12 w-12 text-slate-300"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
        />
      </svg>
      <p className="mb-3">{labels.noData}</p>
      {onAddCurve ? (
        <button
          type="button"
          onClick={onAddCurve}
          data-testid="empty-state-tcc-cta"
          className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          Dodaj krzywą zabezpieczenia
        </button>
      ) : null}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function TimeCurrentChart({
  curves,
  faultMarkers = [],
  config = DEFAULT_CHART_CONFIG,
  selectedCurveId,
  onCurveClick,
}: TimeCurrentChartProps) {
  const labels = PROTECTION_CURVES_LABELS.chart;

  // Filter enabled curves
  const enabledCurves = useMemo(
    () => curves.filter((c) => c.enabled && c.points.length > 0),
    [curves]
  );

  // Generate chart data by sampling all curves at common current points
  const chartData = useMemo(() => {
    if (enabledCurves.length === 0) return [];

    // Generate common current points (logarithmic scale)
    const currents = generateLogScale(
      config.currentRange[0],
      config.currentRange[1],
      100
    );

    return currents.map((current) => {
      const point: ChartDataPoint = { current };

      for (const curve of enabledCurves) {
        const tripTime = interpolateTripTime(current, curve.points);
        if (
          tripTime !== undefined &&
          tripTime >= config.timeRange[0] &&
          tripTime <= config.timeRange[1]
        ) {
          point[curve.id] = tripTime;
        }
      }

      return point;
    });
  }, [enabledCurves, config.currentRange, config.timeRange]);

  // Custom tick generator for log scale
  const logTicks = useMemo(() => {
    const [min, max] = config.currentRange;
    const ticks: number[] = [];
    let value = Math.pow(10, Math.floor(Math.log10(min)));

    while (value <= max) {
      if (value >= min) {
        ticks.push(value);
        // Add intermediate ticks (2, 5)
        if (value * 2 <= max && value * 2 >= min) ticks.push(value * 2);
        if (value * 5 <= max && value * 5 >= min) ticks.push(value * 5);
      }
      value *= 10;
    }

    return ticks.sort((a, b) => a - b);
  }, [config.currentRange]);

  const timeLogTicks = useMemo(() => {
    const [min, max] = config.timeRange;
    const ticks: number[] = [];
    let value = Math.pow(10, Math.floor(Math.log10(min)));

    while (value <= max) {
      if (value >= min) {
        ticks.push(value);
        if (value * 2 <= max && value * 2 >= min) ticks.push(value * 2);
        if (value * 5 <= max && value * 5 >= min) ticks.push(value * 5);
      }
      value *= 10;
    }

    return ticks.sort((a, b) => a - b);
  }, [config.timeRange]);

  // Handle empty state
  if (enabledCurves.length === 0) {
    return (
      <div
        className="rounded border border-slate-200 bg-white"
        style={{ height: config.height }}
      >
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <ResponsiveContainer width="100%" height={config.height}>
        <LineChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 60, bottom: 40 }}
        >
          {config.showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          )}

          {/* X-Axis (Current) - Log scale */}
          <XAxis
            dataKey="current"
            type="number"
            scale="log"
            domain={config.currentRange}
            ticks={logTicks}
            tickFormatter={formatCurrent}
            label={{
              value: labels.xAxisLabel,
              position: 'bottom',
              offset: 20,
              style: { fill: '#64748b', fontSize: 12 },
            }}
            tick={{ fill: '#64748b', fontSize: 11 }}
          />

          {/* Y-Axis (Time) - Log scale */}
          <YAxis
            type="number"
            scale="log"
            domain={config.timeRange}
            ticks={timeLogTicks}
            tickFormatter={formatTime}
            label={{
              value: labels.yAxisLabel,
              angle: -90,
              position: 'left',
              offset: 40,
              style: { fill: '#64748b', fontSize: 12 },
            }}
            tick={{ fill: '#64748b', fontSize: 11 }}
          />

          {/* Tooltip */}
          <Tooltip content={<CustomTooltip curves={enabledCurves} />} />

          {/* Legend */}
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value) => {
              const curve = enabledCurves.find((c) => c.id === value);
              return (
                <span className="text-sm text-slate-700">
                  {curve?.name_pl ?? value}
                </span>
              );
            }}
            onClick={(e) => {
              if (onCurveClick && e.dataKey) {
                onCurveClick(String(e.dataKey));
              }
            }}
          />

          {/* Fault current markers (vertical lines) */}
          {config.showFaultMarkers &&
            faultMarkers.map((marker, idx) => (
              <ReferenceLine
                key={marker.id}
                x={marker.current_a}
                stroke="#dc2626"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{
                  value: `${marker.label_pl}`,
                  position: 'top',
                  fill: '#dc2626',
                  fontSize: 10,
                  // V12K-262: etykiety schodkowane po INDEKSIE markera. Wszystkie
                  // stały na tej samej wysokości, więc dwa prądy zwarciowe w obrębie
                  // jednej dekady osi log (typowo Ik″ 3-fazowy i 1-fazowy tego samego
                  // punktu) nadpisywały się i żadnej nie dało się odczytać.
                  // Przesunięcie zależy tylko od kolejności — render pozostaje
                  // deterministyczny.
                  dy: idx * 13,
                }}
              />
            ))}

          {/* Protection curves */}
          {enabledCurves.map((curve, idx) => (
            <Line
              key={curve.id}
              type="monotone"
              dataKey={curve.id}
              stroke={curve.color || CURVE_COLORS[idx % CURVE_COLORS.length]}
              strokeWidth={selectedCurveId === curve.id ? 3 : 2}
              strokeOpacity={
                selectedCurveId && selectedCurveId !== curve.id ? 0.4 : 1
              }
              dot={false}
              activeDot={{
                r: 6,
                fill: curve.color || CURVE_COLORS[idx % CURVE_COLORS.length],
                stroke: '#fff',
                strokeWidth: 2,
              }}
              name={curve.id}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
