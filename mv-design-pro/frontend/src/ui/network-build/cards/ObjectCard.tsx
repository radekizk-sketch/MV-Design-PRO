/**
 * ObjectCard — bazowy layout karty obiektu.
 *
 * Wspólna struktura: header (ikona + nazwa + typ) + sekcje + akcje.
 * Każda specjalizowana karta renderuje się wewnątrz tego layoutu.
 *
 * BINDING: 100% PL etykiety.
 */

import { clsx } from 'clsx';
import type { ReactNode } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface CardSection {
  id: string;
  label: string;
  fields: CardField[];
}

export interface CardField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
  source?: 'instance' | 'catalog' | 'calculated';
  severity?: 'ok' | 'warning' | 'error';
}

export interface CardAction {
  id: string;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export interface ObjectCardProps {
  elementName: string;
  elementType: string;
  elementId: string;
  statusDot?: 'ok' | 'warning' | 'error' | 'none';
  sections: CardSection[];
  actions?: CardAction[];
  onClose: () => void;
  footer?: ReactNode;
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

export function ObjectCard({
  elementName,
  elementType,
  elementId,
  statusDot = 'none',
  sections,
  actions,
  onClose,
  footer,
  className,
}: ObjectCardProps) {
  return (
    <div className={clsx('flex flex-col h-full bg-white', className)} data-testid="object-card">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-start gap-2 min-w-0">
          {statusDot !== 'none' && (
            <span
              className={clsx(
                'mt-1 inline-block w-2.5 h-2.5 rounded-full flex-shrink-0',
                statusDot === 'ok' && 'bg-green-500',
                statusDot === 'warning' && 'bg-amber-500',
                statusDot === 'error' && 'bg-red-500',
              )}
            />
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-800 truncate">{elementName}</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {elementType} &middot; {elementId}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 flex-shrink-0"
          aria-label="Zamknij kartę"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {sections.map((section, sectionIndex) => (
          <div key={`${section.id}:${sectionIndex}`} className="border-b border-gray-100">
            <div className="px-4 py-2">
              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {section.label}
              </h4>
              <div className="space-y-1">
                {section.fields.map((field, fieldIndex) => (
                  <div key={`${field.key}:${fieldIndex}`} className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-gray-500 flex-shrink-0">{field.label}</span>
                    <span
                      className={clsx(
                        'text-[11px] font-medium text-right truncate max-w-[55%]',
                        field.source === 'catalog' && 'text-blue-700',
                        field.source === 'calculated' && 'text-green-700 italic',
                        field.severity === 'error' && 'text-red-600',
                        field.severity === 'warning' && 'text-amber-600',
                        !field.source && !field.severity && 'text-gray-800',
                      )}
                      title={String(field.value ?? '—')}
                    >
                      {formatCardValue(field.value)}
                      {field.unit && <span className="text-gray-400 ml-0.5">{field.unit}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {actions && actions.length > 0 && (
        <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-wrap gap-1.5">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={clsx(
                  'px-2.5 py-1 text-[10px] font-medium rounded transition-colors',
                  action.disabled && 'opacity-50 cursor-not-allowed',
                  action.variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700',
                  action.variant === 'danger' && 'bg-red-50 text-red-600 hover:bg-red-100',
                  (!action.variant || action.variant === 'secondary') && 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      {footer}
    </div>
  );
}

function formatCardValue(value: string | number | boolean | null): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Tak' : 'Nie';
  if (typeof value === 'number') {
    return value.toLocaleString('pl-PL', { maximumFractionDigits: 4 });
  }
  return String(value);
}
