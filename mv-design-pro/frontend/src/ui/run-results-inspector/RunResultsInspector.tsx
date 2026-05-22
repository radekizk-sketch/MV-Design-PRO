/**
 * RunResultsInspector — Minimal viewer for ResultSetV1 (PR-15)
 *
 * Displays:
 * - Global metrics summary
 * - Element search by ref_id
 * - Per-element badges and metrics
 * - Overlay warnings
 *
 * This is proof that the contract works before SLD overlay (PR-16).
 *
 * INVARIANTS:
 * - UI does NOT interpret solver output — only overlay_payload
 * - All labels in Polish
 * - No project codenames
 */

import { useMemo, useState } from 'react';
import type {
  OverlayBadgeV1,
  OverlayMetricV1,
  OverlaySeverity,
  ResultSetV1,
} from '../contracts/results';

// ---------------------------------------------------------------------------
// Severity colors (Tailwind classes)
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<OverlaySeverity, string> = {
  INFO: 'bg-blue-100 text-blue-800',
  WARNING: 'bg-yellow-100 text-yellow-800',
  IMPORTANT: 'bg-orange-100 text-orange-800',
  BLOCKER: 'bg-red-100 text-red-800',
};

const SEVERITY_BORDER: Record<OverlaySeverity, string> = {
  INFO: 'border-blue-200',
  WARNING: 'border-yellow-200',
  IMPORTANT: 'border-orange-200',
  BLOCKER: 'border-red-200',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BadgeChip({ badge }: { badge: OverlayBadgeV1 }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-1 mb-1 ${SEVERITY_STYLES[badge.severity]}`}
      data-testid="badge-chip"
    >
      {badge.label}
    </span>
  );
}

function MetricRow({ metric }: { metric: OverlayMetricV1 }) {
  const formatted =
    typeof metric.value === 'number'
      ? formatMetricValue(metric.value, metric.format_hint)
      : String(metric.value);

  return (
    <tr data-testid="metric-row">
      <td className="pr-3 text-gray-500 text-sm">{metric.code}</td>
      <td className="pr-2 text-right font-mono text-sm">{formatted}</td>
      <td className="text-gray-400 text-sm">{metric.unit}</td>
    </tr>
  );
}

function formatMetricValue(value: number, hint: string): string {
  switch (hint) {
    case 'fixed0':
      return value.toFixed(0);
    case 'fixed1':
      return value.toFixed(1);
    case 'fixed2':
      return value.toFixed(2);
    case 'fixed4':
      return value.toFixed(4);
    case 'kilo':
      return (value / 1000).toFixed(2) + 'k';
    case 'percent':
      return value.toFixed(1) + '%';
    default:
      return value.toFixed(2);
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface RunResultsInspectorProps {
  resultset: ResultSetV1 | null;
}

export function RunResultsInspector({ resultset }: RunResultsInspectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredElements = useMemo(() => {
    if (!resultset) return [];
    const elements = resultset.overlay_payload.elements;
    const refs = Object.keys(elements).sort();
    if (!searchQuery.trim()) return refs;
    const q = searchQuery.toLowerCase();
    return refs.filter((ref) => ref.toLowerCase().includes(q));
  }, [resultset, searchQuery]);

  if (!resultset) {
    return (
      <div className="p-4 text-gray-500" data-testid="inspector-empty">
        Wyniki nie są dostępne do wyświetlenia
      </div>
    );
  }

  const { overlay_payload, global_results, analysis_type } = resultset;

  return (
    <div className="p-4 space-y-4" data-testid="run-results-inspector">
      {/* Header */}
      <div className="border-b pb-2">
        <h2 className="text-lg font-semibold" data-testid="inspector-title">
          Wyniki analizy
        </h2>
        <div className="text-sm text-gray-500 space-x-3">
          <span>Typ: {analysis_type}</span>
          <span>Wersja kontraktu: {resultset.contract_version}</span>
        </div>
      </div>

      {/* Global Metrics */}
      {Object.keys(global_results).length > 0 && (
        <div data-testid="global-metrics-section">
          <h3 className="text-sm font-medium text-gray-700 mb-1">
            Wyniki globalne
          </h3>
          <div className="bg-gray-50 rounded p-3">
            <table>
              <tbody>
                {Object.entries(global_results)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => (
                    <tr key={key} data-testid="global-metric-row">
                      <td className="pr-3 text-gray-500 text-sm">{key}</td>
                      <td className="font-mono text-sm">
                        {typeof value === 'number'
                          ? value.toFixed(4)
                          : String(value)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overlay Warnings */}
      {overlay_payload.warnings.length > 0 && (
        <div data-testid="warnings-section">
          <h3 className="text-sm font-medium text-gray-700 mb-1">
            Ostrzeżenia
          </h3>
          <div className="space-y-1">
            {overlay_payload.warnings.map((w, i) => (
              <div
                key={`${w.code}-${i}`}
                className={`text-sm p-2 rounded ${SEVERITY_STYLES[w.severity]}`}
                data-testid="warning-item"
              >
                <span className="font-medium">[{w.code}]</span> {w.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Element Search */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-1">
          Elementy ({Object.keys(overlay_payload.elements).length})
        </h3>
        <input
          type="text"
          placeholder="Szukaj po ref_id..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-1.5 border rounded text-sm mb-2"
          data-testid="element-search"
        />
      </div>

      {/* Element List */}
      <div className="space-y-2" data-testid="element-list">
        {filteredElements.map((refId) => {
          const elem = overlay_payload.elements[refId];
          if (!elem) return null;

          const metricEntries = Object.entries(elem.metrics).sort(([a], [b]) =>
            a.localeCompare(b),
          );

          return (
            <div
              key={refId}
              className={`border rounded p-3 ${SEVERITY_BORDER[elem.severity]}`}
              data-testid="element-card"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">
                    {elem.ref_id}
                  </span>
                  <span className="text-xs text-gray-400">{elem.kind}</span>
                </div>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${SEVERITY_STYLES[elem.severity]}`}
                >
                  {elem.severity}
                </span>
              </div>

              {/* Badges */}
              {elem.badges.length > 0 && (
                <div className="mb-2" data-testid="badges-container">
                  {elem.badges.map((badge, i) => (
                    <BadgeChip key={`${badge.code}-${i}`} badge={badge} />
                  ))}
                </div>
              )}

              {/* Metrics */}
              {metricEntries.length > 0 && (
                <table className="w-full" data-testid="metrics-table">
                  <tbody>
                    {metricEntries.map(([, metric]) => (
                      <MetricRow key={metric.code} metric={metric} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}

        {filteredElements.length === 0 && (
          <div className="text-sm text-gray-400 p-2" data-testid="no-results">
            Brak elementów pasujących do wyszukiwania
          </div>
        )}
      </div>

      {/* Legend */}
      <div data-testid="legend-section">
        <h3 className="text-sm font-medium text-gray-700 mb-1">
          {overlay_payload.legend.title}
        </h3>
        <div className="flex flex-wrap gap-2">
          {overlay_payload.legend.entries.map((entry) => (
            <div
              key={entry.severity}
              className={`text-xs px-2 py-1 rounded ${SEVERITY_STYLES[entry.severity]}`}
              title={entry.description}
              data-testid="legend-entry"
            >
              {entry.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default RunResultsInspector;
