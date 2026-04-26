/**
 * AnContextPanel — Panel kontekstu obszaru AN (Analizy).
 *
 * Wyświetla:
 *  - Aktywny przypadek + wariant + migawkę
 *  - Listę typów analiz (SC_3F / SC_1F / LOAD_FLOW / PROTECTION / ...)
 *  - Lista przypadków obliczeniowych (StudyCaseList)
 *
 * Catalog-first, no codenames, dark SCADA palette.
 */

import { clsx } from 'clsx';
import { useAppStateStore } from '../../app-state/store';
import { StudyCaseList } from '../../study-cases/StudyCaseList';

interface AnalysisRow {
  code: string;
  label: string;
}

const ANALYSIS_TYPES: AnalysisRow[] = [
  { code: 'SC_3F', label: 'Zwarcie trójfazowe (IEC 60909)' },
  { code: 'SC_1F', label: 'Zwarcie jednofazowe doziemne' },
  { code: 'SC_2F', label: 'Zwarcie dwufazowe' },
  { code: 'SC_2F_G', label: 'Zwarcie dwufazowe doziemne' },
  { code: 'LOAD_FLOW', label: 'Rozpływ mocy (Newton-Raphson)' },
  { code: 'PHASE_STATE_SN', label: 'Stan ustalony SN' },
  { code: 'PROTECTION', label: 'Koordynacja zabezpieczeń' },
  { code: 'SOURCE_COMPLIANCE', label: 'Zgodność źródeł OZE' },
];

export function AnContextPanel() {
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const activeVariantName = useAppStateStore((s) => s.activeVariantName);
  const activeSnapshotId = useAppStateStore((s) => s.activeSnapshotId);
  const setActiveAnalysisType = useAppStateStore((s) => s.setActiveAnalysisType);
  const activeAnalysisType = useAppStateStore((s) => s.activeAnalysisType);

  return (
    <div
      data-testid="an-context-panel"
      className="flex h-full flex-col overflow-hidden bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Analizy — kontekst
        </span>
        <div className="mt-1 grid grid-cols-1 gap-0.5 text-[11px] text-scada-text">
          <div data-testid="an-active-case">
            <span className="text-scada-muted">Przypadek: </span>
            <span className="font-mono">{activeCaseName ?? '—'}</span>
          </div>
          <div data-testid="an-active-variant">
            <span className="text-scada-muted">Wariant: </span>
            <span className="font-mono">{activeVariantName ?? '—'}</span>
          </div>
          <div data-testid="an-active-snapshot">
            <span className="text-scada-muted">Migawka: </span>
            <span className="font-mono">{activeSnapshotId ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className="border-b border-scada-border bg-scada-bg px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Typ analizy
        </div>
        <div className="mt-1.5 flex flex-col gap-1" data-testid="an-analysis-list">
          {ANALYSIS_TYPES.map((row) => {
            const matches =
              (row.code === 'SC_3F' || row.code === 'SC_1F' || row.code === 'SC_2F' || row.code === 'SC_2F_G') &&
              activeAnalysisType === 'SHORT_CIRCUIT';
            const isLoadFlow = row.code === 'LOAD_FLOW' && activeAnalysisType === 'LOAD_FLOW';
            const isProtection = row.code === 'PROTECTION' && activeAnalysisType === 'PROTECTION';
            const isActive = matches || isLoadFlow || isProtection;
            return (
              <button
                key={row.code}
                type="button"
                data-testid={`an-analysis-${row.code}`}
                onClick={() => {
                  if (row.code.startsWith('SC_')) setActiveAnalysisType('SHORT_CIRCUIT');
                  else if (row.code === 'LOAD_FLOW') setActiveAnalysisType('LOAD_FLOW');
                  else if (row.code === 'PROTECTION') setActiveAnalysisType('PROTECTION');
                  else setActiveAnalysisType(null);
                }}
                className={clsx(
                  'flex items-center gap-2 rounded px-2 py-1 text-left text-[11px] transition-colors',
                  isActive
                    ? 'bg-scada-active text-scada-sn'
                    : 'text-scada-text hover:bg-scada-hover-nav',
                )}
              >
                <span
                  className={clsx(
                    'inline-block h-1.5 w-1.5 rounded-full',
                    isActive ? 'bg-scada-sn' : 'bg-scada-muted',
                  )}
                />
                <span className="flex-1">{row.label}</span>
                <span className="font-mono text-[9px] text-scada-muted">{row.code}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" data-testid="an-case-list">
        <StudyCaseList />
      </div>
    </div>
  );
}
