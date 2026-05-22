/**
 * Breadcrumbs — globalny breadcrumb workflow trail.
 *
 * Pokazuje user'owi gdzie jest w hierarchii projektu:
 *   Pulpit → Projekt X → Wariant Y → SLD → GPZ-1 → Pole SN
 *
 * Każdy segment klikalny (deep-link). Last segment current (nie klikalny).
 *
 * BINDING: 100% PL etykiety.
 */

import type { ReactNode } from 'react';

export interface BreadcrumbSegment {
  /** Tekst widoczny. */
  readonly label: string;
  /** Opcjonalna ikona (emoji lub small JSX). */
  readonly icon?: ReactNode;
  /** Callback gdy klik (jeśli undefined → segment jest current/disabled). */
  readonly onClick?: () => void;
  /** Klucz dla React (default: label). */
  readonly key?: string;
}

export interface BreadcrumbsProps {
  readonly segments: readonly BreadcrumbSegment[];
  /** Separator między segmentami. Default: '›'. */
  readonly separator?: ReactNode;
  /** className zewnętrzny. */
  readonly className?: string;
}

export function Breadcrumbs({ segments, separator = '›', className }: BreadcrumbsProps): JSX.Element {
  return (
    <nav
      aria-label="Ścieżka nawigacji"
      className={`flex items-center gap-1 text-[11px] text-scada-muted ${className ?? ''}`}
      data-testid="breadcrumbs"
    >
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const key = segment.key ?? `${segment.label}-${index}`;
        return (
          <span key={key} className="flex items-center gap-1">
            {index > 0 && (
              <span aria-hidden="true" className="text-scada-border">
                {separator}
              </span>
            )}
            {segment.icon && (
              <span aria-hidden="true" className="flex items-center" data-testid={`breadcrumb-icon-${index}`}>
                {segment.icon}
              </span>
            )}
            {isLast || !segment.onClick ? (
              <span
                className="font-semibold text-scada-text"
                data-testid={`breadcrumb-current-${index}`}
                aria-current={isLast ? 'page' : undefined}
              >
                {segment.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={segment.onClick}
                className="hover:text-scada-text hover:underline focus:outline-none focus:underline"
                data-testid={`breadcrumb-link-${index}`}
              >
                {segment.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
