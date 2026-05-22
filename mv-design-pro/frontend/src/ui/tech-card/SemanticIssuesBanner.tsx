/**
 * SemanticIssuesBanner — pokazuje naruszenia semantyki sieci dla elementu.
 *
 * Renderowany w TechCard gdy operacja domenowa zwróciła `semantic_issues`
 * dotyczące tego elementu (element_id === elementId).
 *
 * Naruszenia rozdzielone na 2 sekcje:
 * - "Błędy" (severity ERROR, czerwone tło) — blokujące semantykę
 * - "Ostrzeżenia" (severity WARNING, pomarańczowe tło) — informacyjne
 *
 * BINDING: 100% PL etykiety.
 */

import type { SemanticIssue } from '../../types/domainOps';

interface SemanticIssuesBannerProps {
  issues: SemanticIssue[];
  /** Filtruj tylko issue-y dotyczące tego elementu. Jeśli undefined, pokazuje wszystkie. */
  elementId?: string;
  onSelectElement?: (ref: string) => void;
}

interface IssueGroupProps {
  title: string;
  count: number;
  issues: SemanticIssue[];
  variant: 'error' | 'warning';
  elementId?: string;
  onSelectElement?: (ref: string) => void;
}

function IssueGroup({ title, count, issues, variant, elementId, onSelectElement }: IssueGroupProps) {
  if (count === 0) return null;
  const bgClass = variant === 'error' ? 'bg-red-50 border-red-500' : 'bg-amber-50 border-amber-500';
  const titleClass = variant === 'error' ? 'text-red-700' : 'text-amber-700';
  const msgClass = variant === 'error' ? 'text-red-700' : 'text-amber-700';
  const testId = variant === 'error' ? 'semantic-errors-group' : 'semantic-warnings-group';

  return (
    <div className={`border-l-4 px-4 py-2.5 ${bgClass}`} data-testid={testId}>
      <h4 className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${titleClass}`}>
        {title} ({count})
      </h4>
      <ul className="space-y-1.5">
        {issues.map((issue, index) => (
          <li
            key={`${issue.code}:${index}`}
            className="text-[11px]"
            data-issue-code={issue.code}
            data-issue-severity={issue.severity}
          >
            <div className={`font-medium ${msgClass}`}>{issue.message}</div>
            {issue.suggested_fix && (
              <div className="text-gray-600 mt-0.5">Sugestia: {issue.suggested_fix}</div>
            )}
            {!elementId && issue.element_id && onSelectElement && (
              <button
                type="button"
                onClick={() => onSelectElement(issue.element_id!)}
                className="text-blue-600 hover:underline mt-0.5"
              >
                Pokaż element
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SemanticIssuesBanner({ issues, elementId, onSelectElement }: SemanticIssuesBannerProps) {
  const filtered = elementId
    ? issues.filter((i) => i.element_id === elementId)
    : issues;

  if (filtered.length === 0) return null;

  const errors = filtered.filter((i) => i.severity === 'ERROR');
  const warnings = filtered.filter((i) => i.severity === 'WARNING');

  return (
    <div data-testid="semantic-issues-banner">
      <IssueGroup
        title="Błędy"
        count={errors.length}
        issues={errors}
        variant="error"
        elementId={elementId}
        onSelectElement={onSelectElement}
      />
      <IssueGroup
        title="Ostrzeżenia"
        count={warnings.length}
        issues={warnings}
        variant="warning"
        elementId={elementId}
        onSelectElement={onSelectElement}
      />
    </div>
  );
}
