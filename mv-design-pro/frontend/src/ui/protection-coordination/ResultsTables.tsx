/**
 * FIX-12B — Results Tables Components
 *
 * Separate table components for sensitivity, selectivity, and overload checks.
 *
 * CANONICAL ALIGNMENT:
 * - 100% Polish labels
 * - READ-ONLY views of backend data
 * - Canonical parity UX
 *
 * UWAGA: Komunikaty werdyktów UI:
 * - PASS → "Zgodne"
 * - MARGINAL → "Na granicy dopuszczalności"
 * - FAIL → "Wymaga korekty"
 * - ERROR → "Wystąpił błąd"
 */

import type {
  SensitivityCheck,
  SelectivityCheck,
  OverloadCheck,
  CoordinationVerdict,
  ProtectionDevice,
} from './types';
import { LABELS, VERDICT_STYLES } from './types';
import {
  buildCoordinationVerdictMessage,
} from '../shared/verdict-messages';

// =============================================================================
// Verdict Badge Component
// =============================================================================

interface VerdictBadgeProps {
  verdict: CoordinationVerdict;
  size?: 'sm' | 'md';
  /** Notatki z analizy do wyświetlenia w tooltipie (DLACZEGO) */
  notesPl?: string | null;
  /** Opcjonalne zalecenie operacyjne do wyświetlenia w tooltipie (CO DALEJ) */
  recommendationPl?: string | null;
}

/**
 * VerdictBadge — Badge z werdyktem koordynacji
 *
 * Wyświetla status werdyktu z tooltipem zawierającym:
 * - Status (etykieta)
 * - Przyczyna (jeśli dostępna) - DLACZEGO
 * - Skutek (dla MARGINAL i FAIL)
 * - Zalecenie (dla MARGINAL i FAIL) - CO DALEJ
 */
export function VerdictBadge({ verdict, size = 'sm', notesPl, recommendationPl }: VerdictBadgeProps) {
  const style = VERDICT_STYLES[verdict];
  const label = LABELS.verdict[verdict];
  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs'
    : 'px-3 py-1 text-sm';

  // Build tooltip text for non-PASS verdicts
  let tooltipText = '';
  if (verdict !== 'PASS') {
    const message = buildCoordinationVerdictMessage(verdict, notesPl);
    const parts: string[] = [];
    if (message.cause) parts.push(`Przyczyna: ${message.cause}`);
    if (message.effect) parts.push(`Skutek: ${message.effect}`);
    // Use custom recommendation if provided, otherwise use default from message builder
    const recommendation = recommendationPl ?? message.recommendation;
    if (recommendation) parts.push(`Zalecenie: ${recommendation}`);
    tooltipText = parts.join('\n');
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sizeClasses} ${style.bg} ${style.text}`}
      data-testid={`verdict-badge-${verdict.toLowerCase()}`}
      title={tooltipText || undefined}
    >
      {label}
    </span>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function getDeviceName(
  deviceId: string,
  devices: ProtectionDevice[]
): string {
  const device = devices.find((d) => d.id === deviceId);
  return device?.name ?? deviceId.slice(0, 8) + '...';
}

function formatNumber(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
}

// =============================================================================
// Sensitivity Table
// =============================================================================

interface SensitivityTableProps {
  checks: SensitivityCheck[];
  devices: ProtectionDevice[];
  onRowClick?: (deviceId: string) => void;
}

export function SensitivityTable({
  checks,
  devices,
  onRowClick,
}: SensitivityTableProps) {
  const labels = LABELS.checks.sensitivity;

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-slate-500">Brak danych czulosci</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white" data-testid="sensitivity-table">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900">{labels.title}</h3>
        <p className="text-sm text-slate-500">{labels.subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.device}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.iFaultMin}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.iPickup}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.margin}
              </th>
              <th className="px-4 py-2 text-center text-sm font-medium text-slate-700">
                Werdykt
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.notes}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {checks.map((check) => (
              <tr
                key={check.device_id}
                className={`hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(check.device_id)}
              >
                <td className="px-4 py-2 text-sm font-medium text-slate-900">
                  {getDeviceName(check.device_id, devices)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.i_fault_min_a)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.i_pickup_a)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.margin_percent)}%
                </td>
                <td className="px-4 py-2 text-center">
                  <VerdictBadge verdict={check.verdict} notesPl={check.notes_pl} />
                </td>
                <td className="max-w-xs truncate px-4 py-2 text-sm text-slate-500">
                  {check.notes_pl}
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
// Selectivity Table
// =============================================================================

interface SelectivityTableProps {
  checks: SelectivityCheck[];
  devices: ProtectionDevice[];
  onRowClick?: (upstreamId: string, downstreamId: string) => void;
}

export function SelectivityTable({
  checks,
  devices,
  onRowClick,
}: SelectivityTableProps) {
  const labels = LABELS.checks.selectivity;

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-slate-500">{labels.minDevicesRequired}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white" data-testid="selectivity-table">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900">{labels.title}</h3>
        <p className="text-sm text-slate-500">{labels.subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.downstream}
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.upstream}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.analysisCurrent}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.tDownstream}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.tUpstream}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.deltaT}
              </th>
              <th className="px-4 py-2 text-center text-sm font-medium text-slate-700">
                Werdykt
              </th>
              {onRowClick && (
                <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                  {labels.action}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {checks.map((check, idx) => (
              <tr
                key={`${check.upstream_device_id}-${check.downstream_device_id}-${idx}`}
                className={`hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() =>
                  onRowClick?.(check.upstream_device_id, check.downstream_device_id)
                }
              >
                <td className="px-4 py-2 text-sm font-medium text-slate-900">
                  {getDeviceName(check.downstream_device_id, devices)}
                </td>
                <td className="px-4 py-2 text-sm font-medium text-slate-900">
                  {getDeviceName(check.upstream_device_id, devices)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.analysis_current_a)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.t_downstream_s, 3)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.t_upstream_s, 3)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm">
                  <span
                    className={
                      check.margin_s >= check.required_margin_s
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                    }
                  >
                    {formatNumber(check.margin_s, 3)}
                  </span>
                  <span className="text-slate-400 text-xs ml-1">
                    (min: {formatNumber(check.required_margin_s, 3)})
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  <VerdictBadge verdict={check.verdict} notesPl={check.notes_pl} />
                </td>
                {onRowClick && (
                  <td className="px-4 py-2 text-right">
                    {/* WIDOCZNA akcja naprawcza (V12K-261). Klik w wiersz zostaje —
                        przycisk go NIE zastępuje, tylko nazywa. `stopPropagation`,
                        żeby jedno kliknięcie nie odpalało obu ścieżek.
                        Akcja tylko przy WERDYKCIE NARUSZENIA: przy spełnionym
                        marginesie CTI nie ma czego poprawiać, a przycisk sugerowałby
                        problem, którego nie ma. */}
                    {(check.verdict === 'FAIL' || check.verdict === 'MARGINAL') && (
                      <button
                        type="button"
                        data-testid={`selectivity-fix-${check.upstream_device_id}`}
                        title={labels.fixSettingsTitle}
                        className="min-h-[44px] rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRowClick(check.upstream_device_id, check.downstream_device_id);
                        }}
                      >
                        {labels.fixSettings}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Overload Table
// =============================================================================

interface OverloadTableProps {
  checks: OverloadCheck[];
  devices: ProtectionDevice[];
  onRowClick?: (deviceId: string) => void;
}

export function OverloadTable({
  checks,
  devices,
  onRowClick,
}: OverloadTableProps) {
  const labels = LABELS.checks.overload;

  if (checks.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-slate-500">Brak danych przeciazalnosci</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white" data-testid="overload-table">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900">{labels.title}</h3>
        <p className="text-sm text-slate-500">{labels.subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.device}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.iOperating}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.iPickup}
              </th>
              <th className="px-4 py-2 text-right text-sm font-medium text-slate-700">
                {labels.margin}
              </th>
              <th className="px-4 py-2 text-center text-sm font-medium text-slate-700">
                Werdykt
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-slate-700">
                {labels.notes}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {checks.map((check) => (
              <tr
                key={check.device_id}
                className={`hover:bg-slate-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(check.device_id)}
              >
                <td className="px-4 py-2 text-sm font-medium text-slate-900">
                  {getDeviceName(check.device_id, devices)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.i_operating_a)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.i_pickup_a)}
                </td>
                <td className="px-4 py-2 text-right font-mono text-sm text-slate-700">
                  {formatNumber(check.margin_percent)}%
                </td>
                <td className="px-4 py-2 text-center">
                  <VerdictBadge verdict={check.verdict} notesPl={check.notes_pl} />
                </td>
                <td className="max-w-xs truncate px-4 py-2 text-sm text-slate-500">
                  {check.notes_pl}
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
// Summary Card Component
// =============================================================================

interface SummaryCardProps {
  title: string;
  passCount: number;
  marginalCount: number;
  failCount: number;
}

export function SummaryCard({
  title,
  passCount,
  marginalCount,
  failCount,
}: SummaryCardProps) {
  const total = passCount + marginalCount + failCount;
  const passPercent = total > 0 ? (passCount / total) * 100 : 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid="summary-card">
      <h4 className="font-medium text-slate-700">{title}</h4>
      <div className="mt-3">
        {/* Progress bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${passPercent}%` }}
          />
        </div>
        {/* Stats */}
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-2xl font-bold text-emerald-600">{passCount}</span>
          <span className="text-sm text-slate-500">{LABELS.summary.passCount}</span>
          {marginalCount > 0 && (
            <>
              <span className="text-xl font-bold text-amber-600">{marginalCount}</span>
              <span className="text-sm text-slate-500">{LABELS.summary.marginalCount}</span>
            </>
          )}
          {failCount > 0 && (
            <>
              <span className="text-xl font-bold text-rose-600">{failCount}</span>
              <span className="text-sm text-slate-500">{LABELS.summary.failCount}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
