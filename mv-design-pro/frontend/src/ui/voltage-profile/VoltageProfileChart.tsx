/**
 * FIX-04 — Voltage Profile Chart Component
 *
 * CANONICAL ALIGNMENT:
 * - SYSTEM_SPEC.md: READ-ONLY result display (Analysis layer)
 * - wizard_screens.md: RESULT_VIEW mode
 * - ui_canonical_parity.md: Voltage profile visualization
 * - 100% Polish UI labels
 *
 * FEATURES:
 * - Voltage profile along feeder path
 * - Configurable Umin/Umax limits
 * - Violation highlighting
 * - Interactive tooltip with bus details
 * - Profile data table
 */

import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';

import type {
  NetworkSnapshot,
  PowerFlowResultForProfile,
  ProfileDataPoint,
  VoltageProfileConfig,
} from './types';
import {
  DEFAULT_PROFILE_CONFIG,
  VOLTAGE_PROFILE_LABELS,
  VOLTAGE_STATUS_COLORS,
  VIOLATION_COLORS,
} from './types';
import { extractFeeders, calculateProfileData, getProfileStats, formatVoltage, formatDistance } from './utils';
import { FeederSelector } from './FeederSelector';
import { ProfileOptions } from './ProfileOptions';

// =============================================================================
// Types
// =============================================================================

interface VoltageProfileChartProps {
  /** Power flow result */
  pfResult: PowerFlowResultForProfile;
  /** Network snapshot */
  networkSnapshot: NetworkSnapshot;
  /** Optional source bus ID for feeder extraction */
  sourceBusId?: string;
  /** Initial Umin limit */
  umin?: number;
  /** Initial Umax limit */
  umax?: number;
  /** Chart height in pixels */
  height?: number;
  /** Close handler */
  onClose?: () => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ProfileDataPoint }>;
  label?: number;
}

// =============================================================================
// Custom Tooltip Component
// =============================================================================

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  const labels = VOLTAGE_PROFILE_LABELS.tooltip;
  const violationLabels = VOLTAGE_PROFILE_LABELS.violations;

  return (
    <div className="rounded border border-slate-200 bg-white p-3 shadow-lg">
      <p className="mb-2 font-semibold text-slate-900">{data.bus_name}</p>
      <div className="space-y-1 text-sm">
        <p className="text-slate-600">
          {labels.distance}: <span className="font-mono font-medium text-slate-900">{formatDistance(data.distance_km)} km</span>
        </p>
        <p className="text-slate-600">
          {labels.voltage_pu}: <span className="font-mono font-medium text-slate-900">{formatVoltage(data.voltage_pu)} p.u.</span>
        </p>
        <p className="text-slate-600">
          {labels.voltage_kv}: <span className="font-mono font-medium text-slate-900">{data.voltage_kv.toFixed(2)} kV</span>
        </p>
        <p className="text-slate-600">
          {labels.deviation}: <span className={`font-mono font-medium ${data.deviation_pct > 0 ? 'text-amber-600' : data.deviation_pct < 0 ? 'text-blue-600' : 'text-slate-900'}`}>
            {data.deviation_pct > 0 ? '+' : ''}{data.deviation_pct.toFixed(2)}%
          </span>
        </p>
        {data.violation && (
          <p className={`mt-2 font-medium ${VIOLATION_COLORS[data.violation]}`}>
            {labels.violation}: {violationLabels[data.violation]}
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Profile Data Table Component
// =============================================================================

interface ProfileDataTableProps {
  data: ProfileDataPoint[];
}

function ProfileDataTable({ data }: ProfileDataTableProps) {
  const labels = VOLTAGE_PROFILE_LABELS.table;
  const statusLabels = VOLTAGE_PROFILE_LABELS.status;
  const violationLabels = VOLTAGE_PROFILE_LABELS.violations;

  if (data.length === 0) return null;

  const getStatusClass = (point: ProfileDataPoint): string => {
    if (point.violation === 'OVERVOLTAGE' || point.violation === 'UNDERVOLTAGE') {
      return VOLTAGE_STATUS_COLORS.fail;
    }
    const absDeviation = Math.abs(point.deviation_pct);
    if (absDeviation > 3) {
      return VOLTAGE_STATUS_COLORS.warning;
    }
    return VOLTAGE_STATUS_COLORS.pass;
  };

  const getStatusLabel = (point: ProfileDataPoint): string => {
    if (point.violation) {
      return statusLabels.fail;
    }
    const absDeviation = Math.abs(point.deviation_pct);
    if (absDeviation > 3) {
      return statusLabels.warning;
    }
    return statusLabels.pass;
  };

  return (
    <div className="mt-6">
      <h4 className="mb-3 text-sm font-semibold text-slate-700">{labels.title}</h4>
      <div className="overflow-x-auto">
        <table className="min-w-full border border-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left font-medium text-slate-700">
                {labels.bus_name}
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-right font-medium text-slate-700">
                {labels.distance_km}
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-right font-medium text-slate-700">
                {labels.voltage_pu}
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-right font-medium text-slate-700">
                {labels.voltage_kv}
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-right font-medium text-slate-700">
                {labels.deviation_pct}
              </th>
              <th className="border-b border-slate-200 px-3 py-2 text-center font-medium text-slate-700">
                {labels.status}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((point, index) => (
              <tr
                key={point.bus_id}
                className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
              >
                <td className="border-b border-slate-100 px-3 py-2 text-slate-900">
                  {point.bus_name}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-right font-mono text-slate-700">
                  {formatDistance(point.distance_km)}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-right font-mono text-slate-700">
                  {formatVoltage(point.voltage_pu)}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-right font-mono text-slate-700">
                  {point.voltage_kv.toFixed(2)}
                </td>
                <td className={`border-b border-slate-100 px-3 py-2 text-right font-mono ${
                  point.deviation_pct > 0 ? 'text-amber-600' : point.deviation_pct < 0 ? 'text-blue-600' : 'text-slate-700'
                }`}>
                  {point.deviation_pct > 0 ? '+' : ''}{point.deviation_pct.toFixed(2)}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${getStatusClass(point)}`}
                    title={point.violation ? violationLabels[point.violation] : violationLabels.none}
                  >
                    {getStatusLabel(point)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Stats Summary Component
// =============================================================================

interface ProfileStatsSummaryProps {
  data: ProfileDataPoint[];
  config: VoltageProfileConfig;
}

function ProfileStatsSummary({ data, config }: ProfileStatsSummaryProps) {
  const stats = useMemo(() => getProfileStats(data), [data]);

  if (data.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-4 rounded border border-slate-200 bg-white p-4 md:grid-cols-6">
      <div className="text-center">
        <div className="text-xs text-slate-500">Min U</div>
        <div className={`text-lg font-semibold ${stats.minVoltage < config.umin ? 'text-rose-600' : 'text-slate-900'}`}>
          {formatVoltage(stats.minVoltage, 4)}
        </div>
        <div className="text-xs text-slate-400">p.u.</div>
      </div>
      <div className="text-center">
        <div className="text-xs text-slate-500">Max U</div>
        <div className={`text-lg font-semibold ${stats.maxVoltage > config.umax ? 'text-rose-600' : 'text-slate-900'}`}>
          {formatVoltage(stats.maxVoltage, 4)}
        </div>
        <div className="text-xs text-slate-400">p.u.</div>
      </div>
      <div className="text-center">
        <div className="text-xs text-slate-500">Avg U</div>
        <div className="text-lg font-semibold text-slate-900">
          {formatVoltage(stats.avgVoltage, 4)}
        </div>
        <div className="text-xs text-slate-400">p.u.</div>
      </div>
      <div className="text-center">
        <div className="text-xs text-slate-500">Naruszenia</div>
        <div className={`text-lg font-semibold ${stats.violationCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
          {stats.violationCount}
        </div>
        <div className="text-xs text-slate-400">
          {stats.violationCount === 0 ? 'brak' : `z ${data.length}`}
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs text-slate-500">Przekr. Umax</div>
        <div className={`text-lg font-semibold ${stats.overvoltageCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
          {stats.overvoltageCount}
        </div>
        <div className="text-xs text-slate-400">wezlow</div>
      </div>
      <div className="text-center">
        <div className="text-xs text-slate-500">Ponizej Umin</div>
        <div className={`text-lg font-semibold ${stats.undervoltageCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
          {stats.undervoltageCount}
        </div>
        <div className="text-xs text-slate-400">wezlow</div>
      </div>
    </div>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-slate-500">
      <svg className="mb-4 h-12 w-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
      <p>{message}</p>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function VoltageProfileChart({
  pfResult,
  networkSnapshot,
  sourceBusId,
  umin = DEFAULT_PROFILE_CONFIG.umin,
  umax = DEFAULT_PROFILE_CONFIG.umax,
  height = 400,
  onClose,
}: VoltageProfileChartProps) {
  const labels = VOLTAGE_PROFILE_LABELS;

  // State
  const [selectedFeeder, setSelectedFeeder] = useState<string | null>(null);
  const [config, setConfig] = useState<VoltageProfileConfig>({
    ...DEFAULT_PROFILE_CONFIG,
    umin,
    umax,
  });

  // Extract feeders from network
  const feeders = useMemo(
    () => extractFeeders(networkSnapshot, sourceBusId),
    [networkSnapshot, sourceBusId]
  );

  // Auto-select first feeder if none selected
  useMemo(() => {
    if (feeders.length > 0 && !selectedFeeder) {
      setSelectedFeeder(feeders[0].id);
    }
  }, [feeders, selectedFeeder]);

  // Get selected feeder object
  const feeder = useMemo(
    () => feeders.find((f) => f.id === selectedFeeder) ?? null,
    [feeders, selectedFeeder]
  );

  // Calculate profile data
  const chartData = useMemo(() => {
    if (!feeder) return [];
    return calculateProfileData(feeder, pfResult, networkSnapshot, config.umin, config.umax);
  }, [feeder, pfResult, networkSnapshot, config.umin, config.umax]);

  // Check convergence
  if (!pfResult.converged) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50 p-4">
        <p className="font-medium text-amber-700">{labels.messages.notConverged}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{labels.title}</h3>
          <p className="text-sm text-slate-500">{labels.subtitle}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {labels.actions.close}
          </button>
        )}
      </div>

      {/* Feeder selector */}
      <div className="rounded border border-slate-200 bg-white p-4">
        <FeederSelector
          feeders={feeders}
          selected={selectedFeeder}
          onSelect={setSelectedFeeder}
        />
      </div>

      {/* Profile options */}
      <ProfileOptions config={config} onChange={setConfig} />

      {/* Chart or empty state */}
      {!feeder ? (
        <div className="rounded border border-slate-200 bg-white">
          <EmptyState message={labels.messages.noFeederSelected} />
        </div>
      ) : chartData.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white">
          <EmptyState message={labels.messages.noData} />
        </div>
      ) : (
        <>
          {/* Stats summary */}
          <ProfileStatsSummary data={chartData} config={config} />

          {/* Chart */}
          <div className="rounded border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height={height}>
              <LineChart
                data={chartData}
                margin={{ top: 20, right: 30, left: 60, bottom: 40 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="distance_km"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => v.toFixed(1)}
                  label={{
                    value: labels.chart.xAxisLabel,
                    position: 'bottom',
                    offset: 20,
                    style: { fill: '#64748b', fontSize: 12 },
                  }}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                />
                <YAxis
                  domain={[config.yAxisMin, config.yAxisMax]}
                  tickFormatter={(v) => v.toFixed(2)}
                  label={{
                    value: labels.chart.yAxisLabel,
                    angle: -90,
                    position: 'left',
                    offset: 40,
                    style: { fill: '#64748b', fontSize: 12 },
                  }}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value) => <span className="text-sm text-slate-700">{value}</span>}
                />

                {/* Allowed region (shaded area between limits) */}
                {config.showAllowedRegion && (
                  <ReferenceArea
                    y1={config.umin}
                    y2={config.umax}
                    fill="#22c55e"
                    fillOpacity={0.1}
                    label={{
                      value: labels.chart.allowedRegion,
                      position: 'insideTopLeft',
                      style: { fill: '#22c55e', fontSize: 10 },
                    }}
                  />
                )}

                {/* Umax limit line */}
                {config.showLimits && (
                  <ReferenceLine
                    y={config.umax}
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    label={{
                      value: `${labels.chart.umaxLabel}=${config.umax}`,
                      position: 'insideTopRight',
                      style: { fill: '#ef4444', fontSize: 11 },
                    }}
                  />
                )}

                {/* Umin limit line */}
                {config.showLimits && (
                  <ReferenceLine
                    y={config.umin}
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                    strokeWidth={1.5}
                    label={{
                      value: `${labels.chart.uminLabel}=${config.umin}`,
                      position: 'insideBottomRight',
                      style: { fill: '#ef4444', fontSize: 11 },
                    }}
                  />
                )}

                {/* Nominal voltage line (1.0 p.u.) */}
                <ReferenceLine
                  y={1.0}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />

                {/* Voltage profile line */}
                <Line
                  type="monotone"
                  dataKey="voltage_pu"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    const hasViolation = payload?.violation;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={hasViolation ? 6 : 4}
                        fill={hasViolation ? '#ef4444' : '#2563eb'}
                        stroke={hasViolation ? '#ef4444' : '#2563eb'}
                        strokeWidth={2}
                      />
                    );
                  }}
                  activeDot={{
                    r: 8,
                    fill: '#2563eb',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  name={labels.chart.voltageLine}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Profile data table */}
          <div className="rounded border border-slate-200 bg-white p-4">
            <ProfileDataTable data={chartData} />
          </div>
        </>
      )}
    </div>
  );
}
