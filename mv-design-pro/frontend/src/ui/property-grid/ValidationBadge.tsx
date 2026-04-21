/**
 * ValidationBadge Component (PF-style)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md § D.4: Inline validation display
 *
 * Displays validation messages with appropriate styling:
 * - ERROR: Red background/text with E-* code
 * - WARNING: Yellow background/text with W-* code
 * - INFO: Blue background/text (informational)
 */

import { clsx } from 'clsx';
import type { ValidationSeverity, ValidationMessage } from '../types';

// =============================================================================
// Types
// =============================================================================

interface ValidationBadgeProps {
  message: ValidationMessage;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Show code prefix (e.g., E-001) */
  showCode?: boolean;
  /** Additional CSS classes */
  className?: string;
}

interface ValidationIconProps {
  severity: ValidationSeverity;
  className?: string;
}

// =============================================================================
// Severity Styles
// =============================================================================

const SEVERITY_STYLES: Record<ValidationSeverity, {
  badge: string;
  text: string;
  bg: string;
  icon: string;
}> = {
  ERROR: {
    badge: 'bg-red-100 text-red-800 border-red-200',
    text: 'text-red-700',
    bg: 'bg-red-50',
    icon: 'E',
  },
  WARNING: {
    badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    text: 'text-yellow-700',
    bg: 'bg-yellow-50',
    icon: 'W',
  },
};

// =============================================================================
// ValidationIcon Sub-component
// =============================================================================

/**
 * Validation severity icon.
 */
export function ValidationIcon({ severity, className }: ValidationIconProps) {
  const styles = SEVERITY_STYLES[severity];

  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center',
        'w-4 h-4 text-xs font-bold rounded-full',
        styles.badge,
        className
      )}
      aria-hidden="true"
    >
      {styles.icon}
    </span>
  );
}

// =============================================================================
// ValidationBadge Component
// =============================================================================

/**
 * Validation badge displaying error/warning message.
 *
 * Usage:
 * ```tsx
 * <ValidationBadge
 *   message={{ code: 'E-001', severity: 'ERROR', message: 'Wartość wymagana' }}
 *   showCode
 * />
 * ```
 */
export function ValidationBadge({
  message,
  compact = false,
  showCode = true,
  className,
}: ValidationBadgeProps) {
  const styles = SEVERITY_STYLES[message.severity];

  if (compact) {
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-1',
          'text-xs',
          styles.text,
          className
        )}
        title={`[${message.code}] ${message.message}`}
      >
        <ValidationIcon severity={message.severity} />
        <span className="truncate max-w-[200px]">{message.message}</span>
      </span>
    );
  }

  return (
    <div
      className={clsx(
        'flex items-start gap-2 p-2 rounded border',
        styles.bg,
        styles.badge,
        className
      )}
    >
      <ValidationIcon severity={message.severity} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {showCode && (
          <span className="font-mono text-xs opacity-75 mr-1">
            [{message.code}]
          </span>
        )}
        <span className="text-xs">{message.message}</span>
        {message.field && (
          <span className="text-xs opacity-75 ml-1">
            (pole: {message.field})
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ValidationSummary Component
// =============================================================================

interface ValidationSummaryProps {
  messages: ValidationMessage[];
  /** Title for the summary section */
  title?: string;
  /** Maximum messages to show before "and X more" */
  maxVisible?: number;
  className?: string;
}

/**
 * Validation summary showing multiple messages.
 * Used in Property Grid "Stan walidacji" section.
 */
export function ValidationSummary({
  messages,
  title: _title = 'Błędy walidacji',
  maxVisible = 5,
  className,
}: ValidationSummaryProps) {
  if (messages.length === 0) {
    return (
      <div className={clsx('text-xs text-green-600 flex items-center gap-1', className)}>
        <span className="text-green-500 font-bold">OK</span>
        Brak błędów walidacji
      </div>
    );
  }

  const errors = messages.filter((m) => m.severity === 'ERROR');
  const warnings = messages.filter((m) => m.severity === 'WARNING');
  const visibleMessages = messages.slice(0, maxVisible);
  const remainingCount = messages.length - maxVisible;

  return (
    <div className={clsx('space-y-2', className)}>
      {/* Summary counts */}
      <div className="flex items-center gap-3 text-xs">
        {errors.length > 0 && (
          <span className="flex items-center gap-1 text-red-700">
            <ValidationIcon severity="ERROR" />
            {errors.length} {errors.length === 1 ? 'błąd' : 'błędów'}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="flex items-center gap-1 text-yellow-700">
            <ValidationIcon severity="WARNING" />
            {warnings.length} {warnings.length === 1 ? 'ostrzeżenie' : 'ostrzeżeń'}
          </span>
        )}
      </div>

      {/* Message list */}
      <ul className="space-y-1">
        {visibleMessages.map((msg, i) => (
          <li key={`${msg.code}-${i}`}>
            <ValidationBadge message={msg} compact showCode />
          </li>
        ))}
      </ul>

      {/* Remaining count */}
      {remainingCount > 0 && (
        <div className="text-xs text-gray-500 italic">
          ...i {remainingCount} więcej
        </div>
      )}
    </div>
  );
}

export default ValidationBadge;
