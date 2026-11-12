/**
 * SemanticIssuesBanner — pokazuje naruszenia semantyki sieci dla elementu.
 *
 * Renderowany w TechCard gdy operacja domenowa zwróciła `semantic_issues`
 * dotyczące tego elementu (element_id === elementId).
 *
 * BINDING: 100% PL etykiety.
 *
 * Wejście na schemat: wspólny przycisk „Pokaż na schemacie" (karta
 * SLD-SKALA-I-NAWIGACJA). Dawna etykieta „Uzupełnij moc odbioru" obiecywała
 * naprawę, a wykonywała wyłącznie zaznaczenie — skasowana razem z callbackiem.
 */

import { clsx } from 'clsx';
import type { SemanticIssue } from '../../types/domainOps';
import { PrzyciskPokazNaSchemacie } from '../../ui2/shared/PrzyciskPokazNaSchemacie';

interface SemanticIssuesBannerProps {
  issues: SemanticIssue[];
  /** Filtruj tylko issue-y dotyczące tego elementu. Jeśli undefined, pokazuje wszystkie. */
  elementId?: string;
}

export function SemanticIssuesBanner({ issues, elementId }: SemanticIssuesBannerProps) {
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
            {!elementId && issue.element_id && (
              <PrzyciskPokazNaSchemacie
                elementRef={issue.element_id}
                zrodlo="baner-problemow-semantycznych"
                testId={`semantic-issue-action-${issue.code}`}
                className="mt-0.5"
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
