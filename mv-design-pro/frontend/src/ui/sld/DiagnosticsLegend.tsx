import type { DiagnosticsSeverityFilter } from '../protection';
import {
  SEVERITY_COLORS,
  SEVERITY_FILTER_LABELS_PL,
  SEVERITY_LABELS_PL,
} from '../protection';

export interface DiagnosticsLegendProps {
  errorCount: number;
  warnCount: number;
  infoCount: number;
  filter: DiagnosticsSeverityFilter;
}

export function DiagnosticsLegend({
  errorCount,
  warnCount,
  infoCount,
  filter,
}: DiagnosticsLegendProps) {
  const filteredErrorCount = errorCount;
  const filteredWarnCount = filter === 'ERRORS_ONLY' ? 0 : warnCount;
  const filteredInfoCount = filter === 'ALL' ? infoCount : 0;
  const totalVisible = filteredErrorCount + filteredWarnCount + filteredInfoCount;

  if (totalVisible === 0) {
    return null;
  }

  return (
    <div
      data-testid="sld-diagnostics-legend"
      className="absolute bottom-3 left-3 z-20 rounded-lg border border-slate-300 bg-white/95 p-3 shadow-lg backdrop-blur-sm"
      style={{ minWidth: '180px', maxWidth: '240px' }}
    >
      <div className="mb-2">
        <h4 data-testid="sld-diagnostics-legend-title" className="text-sm font-semibold text-slate-800">
          Diagnostyka zabezpieczeń
        </h4>
        <div className="text-xs text-slate-500">{SEVERITY_FILTER_LABELS_PL[filter]}</div>
      </div>

      <div className="space-y-1.5">
        <div
          data-testid="sld-diagnostics-legend-error"
          className={`flex items-center gap-2 ${filter !== 'ALL' && errorCount === 0 ? 'opacity-40' : ''}`}
        >
          <div
            className={`flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold text-white ${SEVERITY_COLORS.ERROR.marker}`}
          >
            !
          </div>
          <span className="text-xs text-slate-700">{SEVERITY_LABELS_PL.ERROR}</span>
          <span className="ml-auto font-mono text-xs text-slate-500">{errorCount}</span>
        </div>

        <div
          data-testid="sld-diagnostics-legend-warn"
          className={`flex items-center gap-2 ${filter === 'ERRORS_ONLY' || warnCount === 0 ? 'opacity-40' : ''}`}
        >
          <div
            className={`flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold text-white ${SEVERITY_COLORS.WARN.marker}`}
          >
            ?
          </div>
          <span className="text-xs text-slate-700">{SEVERITY_LABELS_PL.WARN}</span>
          <span className="ml-auto font-mono text-xs text-slate-500">{warnCount}</span>
        </div>

        <div
          data-testid="sld-diagnostics-legend-info"
          className={`flex items-center gap-2 ${filter !== 'ALL' || infoCount === 0 ? 'opacity-40' : ''}`}
        >
          <div
            className={`flex h-4 w-4 items-center justify-center rounded-full text-xs font-bold text-white ${SEVERITY_COLORS.INFO.marker}`}
          >
            i
          </div>
          <span className="text-xs text-slate-700">{SEVERITY_LABELS_PL.INFO}</span>
          <span className="ml-auto font-mono text-xs text-slate-500">{infoCount}</span>
        </div>
      </div>

      <div className="mt-2 border-t border-slate-200 pt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600">Widoczne markery:</span>
          <span className="font-semibold text-slate-700">{totalVisible}</span>
        </div>
      </div>
    </div>
  );
}

export default DiagnosticsLegend;
