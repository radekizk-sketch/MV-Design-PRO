/**
 * SemanticIssuesBanner — pokazuje naruszenia semantyki sieci dla elementu.
 *
 * Renderowany w TechCard gdy operacja domenowa zwróciła `semantic_issues`
 * dotyczące tego elementu (element_id === elementId).
 *
 * BINDING: 100% PL etykiety.
 */

import { clsx } from 'clsx';
import type { SemanticIssue } from '../../types/domainOps';

interface SemanticIssuesBannerProps {
  issues: SemanticIssue[];
  /** Filtruj tylko issue-y dotyczące tego elementu. Jeśli undefined, pokazuje wszystkie. */
  elementId?: string;
  onSelectElement?: (ref: string) => void;
}

function issueActionLabel(issue: SemanticIssue): string {
  if (issue.code === 'semantic.zero_power_load') return 'Uzupełnij moc odbioru';
  return 'Pokaż element';
}

export function SemanticIssuesBanner({ issues, elementId, onSelectElement }: SemanticIssuesBannerProps) {
  const filtered = elementId
    ? issues.filter((i) => i.element_id === elementId)
    : issues;

  if (filtered.length === 0) return null;

  return (
    <div className="border-l-4 border-red-500 bg-red-50 px-4 py-2.5" data-testid="semantic-issues-banner">
      <h4 className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1.5">
        Naruszenia semantyki ({filtered.length})
      </h4>
      <ul className="space-y-1.5">
        {filtered.map((issue, index) => (
          <li
            key={`${issue.code}:${index}`}
            className="text-[11px]"
            data-issue-code={issue.code}
          >
            <div className={clsx('font-medium', issue.severity === 'ERROR' ? 'text-red-700' : 'text-amber-700')}>
              {issue.message}
            </div>
            {issue.suggested_fix && (
              <div className="text-gray-600 mt-0.5">
                Sugestia: {issue.suggested_fix}
              </div>
            )}
            {!elementId && issue.element_id && onSelectElement && (
              <button
                type="button"
                onClick={() => onSelectElement(issue.element_id!)}
                className="text-blue-600 hover:underline mt-0.5"
                data-testid={`semantic-issue-action-${issue.code}`}
              >
                {issueActionLabel(issue)}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
