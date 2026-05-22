import type { ReadinessIssue } from '../types';
import { sanitizePublicReadinessMessage } from '../shared/publicReadinessMessage';

export interface SldReadinessStackProps {
  activeCaseId: string | null;
  className?: string;
  workspaceBlockState?: unknown;
  issues: readonly ReadinessIssue[];
  status?: string | null;
  ready: boolean;
  loading?: boolean;
  collapsedGroups?: Readonly<Record<string, boolean>>;
  onToggleGroup?: (group: string) => void;
  onNavigateToElement?: (elementRef: string | null | undefined) => void;
  onFixAction?: (issue: ReadinessIssue) => void;
  onQuickFix?: (issue: ReadinessIssue) => void;
}

export function SldReadinessStack({
  activeCaseId,
  className = '',
  issues,
  status,
  ready,
  loading = false,
  onNavigateToElement,
  onFixAction,
  onQuickFix,
}: SldReadinessStackProps): JSX.Element {
  const blockers = issues.filter((issue) => issue.severity === 'BLOCKER');
  const warnings = issues.filter((issue) => issue.severity !== 'BLOCKER');
  const topIssue = blockers[0] ?? warnings[0] ?? null;
  const topIssueMessage = topIssue
    ? sanitizePublicReadinessMessage(topIssue.message_pl)
    : null;

  return (
    <section
      data-testid="sld-readiness-stack"
      className={`rounded border border-[#24445a] bg-[#07131d]/92 px-3 py-2 text-[11px] text-[#dbeafe] shadow-[0_10px_32px_rgba(0,0,0,0.24)] ${className}`}
      aria-label="Zakres obliczeń na schemacie"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold">Zakres obliczeń</div>
        <div className={ready ? 'text-[#34d399]' : blockers.length > 0 ? 'text-[#f87171]' : 'text-[#fbbf24]'}>
          {loading ? 'sprawdzanie' : ready ? 'do analizy' : blockers.length > 0 ? 'w konfiguracji' : 'wynik częściowy'}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-[#9fb3c8]">
        <span>Zakres: {activeCaseId ? 'aktywny' : 'nie wybrano'}</span>
        <span>Do konfiguracji: {blockers.length}</span>
        <span>Uwagi projektowe: {warnings.length}</span>
        {status && <span>Stan: {status}</span>}
      </div>
      {topIssue && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#183246] pt-2">
          <button
            type="button"
            className="min-w-0 truncate text-left text-[#e2e8f0] hover:text-white"
            onClick={() => onNavigateToElement?.(topIssue.element_ref)}
          >
            {topIssueMessage}
          </button>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              className="rounded border border-[#31506a] px-2 py-0.5 text-[#bae6fd] hover:bg-[#0d2435]"
              onClick={() => onFixAction?.(topIssue)}
            >
              Konfiguruj
            </button>
            <button
              type="button"
              className="rounded border border-[#31506a] px-2 py-0.5 text-[#bae6fd] hover:bg-[#0d2435]"
              onClick={() => onQuickFix?.(topIssue)}
            >
              Pokaż na SLD
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
