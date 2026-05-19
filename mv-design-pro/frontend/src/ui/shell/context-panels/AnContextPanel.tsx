/**
 * Panel kontekstu obszaru Studia obliczeniowe.
 *
 * Wyświetla aktywny zakres, wariant, wersję modelu, typy analiz oraz listę
 * zakresów obliczeń. Panel nie wykonuje obliczeń i nie mutuje modelu sieci.
 */

import { useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import { useAppStateStore } from '../../app-state/store';
import { StudyCaseList } from '../../study-cases/StudyCaseList';
import { useStudyCasesStore } from '../../study-cases/store';
import type { StudyCase } from '../../study-cases/types';

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
  { code: 'SOURCE_COMPLIANCE', label: 'Zgodność układów PV/BESS/FW' },
];

export function AnContextPanel() {
  const activeProjectId = useAppStateStore((s) => s.activeProjectId);
  const activeCaseName = useAppStateStore((s) => s.activeCaseName);
  const activeVariantName = useAppStateStore((s) => s.activeVariantName);
  const activeSnapshotId = useAppStateStore((s) => s.activeSnapshotId);
  const setActiveCase = useAppStateStore((s) => s.setActiveCase);
  const setActiveAnalysisType = useAppStateStore((s) => s.setActiveAnalysisType);
  const activeAnalysisType = useAppStateStore((s) => s.activeAnalysisType);
  const setStudyCasesProjectId = useStudyCasesStore((s) => s.setProjectId);
  const activateStudyCase = useStudyCasesStore((s) => s.activateCase);
  const selectStudyCase = useStudyCasesStore((s) => s.selectCase);

  useEffect(() => {
    if (activeProjectId) {
      setStudyCasesProjectId(activeProjectId);
    }
  }, [activeProjectId, setStudyCasesProjectId]);

  const applyActiveCase = useCallback(
    (studyCase: StudyCase) => {
      selectStudyCase(studyCase.id);
      if (studyCase.is_active) {
        setActiveCase(studyCase.id, studyCase.name, 'ShortCircuitCase', studyCase.result_status);
      }
    },
    [selectStudyCase, setActiveCase],
  );

  const handleActivateCase = useCallback(
    async (caseId: string) => {
      const activatedCase = await activateStudyCase(caseId);
      applyActiveCase(activatedCase);
    },
    [activateStudyCase, applyActiveCase],
  );

  const handleCaseClick = useCallback(
    (caseId: string) => {
      selectStudyCase(caseId);
    },
    [selectStudyCase],
  );

  return (
    <div
      data-testid="an-context-panel"
      className="flex h-full flex-col overflow-auto bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Studia obliczeniowe
        </span>
        <div className="mt-1 grid grid-cols-1 gap-0.5 text-[11px] text-scada-text">
          <div data-testid="an-active-case">
            <span className="text-scada-muted">Zakres obliczeń: </span>
            <span className="font-mono">{activeCaseName ?? '—'}</span>
          </div>
          <div data-testid="an-active-variant">
            <span className="text-scada-muted">Wariant: </span>
            <span className="font-mono">{activeVariantName ?? '—'}</span>
          </div>
          <div data-testid="an-active-snapshot">
            <span className="text-scada-muted">Wersja modelu: </span>
            <span className="font-mono">{activeSnapshotId ?? '—'}</span>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b border-scada-border bg-scada-bg" data-testid="an-case-list">
        <StudyCaseList
          onCaseClick={handleCaseClick}
          onActivateCase={handleActivateCase}
          onCaseCreated={applyActiveCase}
          createProjectId={activeProjectId}
          createDisabled={!activeProjectId}
          createDisabledReason="Najpierw utwórz albo wybierz projekt."
        />
      </div>

      <div className="border-b border-scada-border bg-scada-bg px-3 py-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Zakres analizy
        </div>
        <div className="mt-1.5 flex flex-col gap-1" data-testid="an-analysis-list">
          {ANALYSIS_TYPES.map((row) => {
            const matches =
              (row.code === 'SC_3F' ||
                row.code === 'SC_1F' ||
                row.code === 'SC_2F' ||
                row.code === 'SC_2F_G') &&
              activeAnalysisType === 'SHORT_CIRCUIT';
            const isLoadFlow = row.code === 'LOAD_FLOW' && activeAnalysisType === 'LOAD_FLOW';
            const isProtection = row.code === 'PROTECTION' && activeAnalysisType === 'PROTECTION';
            const isActive = matches || isLoadFlow || isProtection;
            return (
              <button
                key={row.code}
                type="button"
                data-testid={`an-analysis-${row.code}`}
                data-analysis-code={row.code}
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
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
