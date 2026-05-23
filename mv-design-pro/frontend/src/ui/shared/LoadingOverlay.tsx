/**
 * LoadingOverlay — globalny overlay dla długo działających operacji.
 *
 * Pokazuje user'owi że "coś się dzieje" - eliminuje silent mode.
 * Stosowania:
 *  - Power Flow iteracje (current_iter / max_iter)
 *  - Short Circuit calculation
 *  - Proof Pack generation
 *  - Raport PDF/DOCX export
 *  - Project archive ZIP create/restore
 *
 * BINDING: 100% PL etykiety.
 */

import { useEffect } from 'react';

export interface LoadingOverlayProps {
  /** Czy overlay jest widoczny. */
  readonly isOpen: boolean;
  /** Główny komunikat (np. "Trwa rozpływ mocy..."). */
  readonly title: string;
  /** Dodatkowy opis (np. "Algorithm Newton-Raphson, iteracja 7/30"). */
  readonly subtitle?: string;
  /** Wartość progresu 0-1 (jeśli undefined → indeterminate). */
  readonly progress?: number;
  /** Opcjonalny callback "Anuluj" - jeśli operacja jest przerywalna. */
  readonly onCancel?: () => void;
}

function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function LoadingOverlay({
  isOpen,
  title,
  subtitle,
  progress,
  onCancel,
}: LoadingOverlayProps): JSX.Element | null {
  useEffect(() => {
    if (!isOpen) return;
    // Blokuj scroll body gdy overlay aktywny
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isIndeterminate = progress === undefined;
  const progressPercent = isIndeterminate ? 0 : Math.round(clampProgress(progress) * 100);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-label="Operacja w toku"
      aria-live="polite"
      data-testid="loading-overlay"
    >
      <div className="w-[420px] max-w-[90vw] rounded-lg border border-scada-border bg-scada-panel p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-3">
          {/* Animated spinner */}
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
            aria-hidden="true"
            data-testid="loading-overlay-spinner"
          />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-scada-text" data-testid="loading-overlay-title">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-scada-muted" data-testid="loading-overlay-subtitle">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {!isIndeterminate && (
          <div className="mb-2" data-testid="loading-overlay-progress">
            <div className="h-1.5 overflow-hidden rounded bg-scada-bg">
              <div
                className="h-full bg-blue-500 transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
              />
            </div>
            <div className="mt-1 text-right text-[10px] text-scada-muted" data-testid="loading-overlay-progress-text">
              {progressPercent}%
            </div>
          </div>
        )}

        {isIndeterminate && (
          <div className="mb-2 h-1.5 overflow-hidden rounded bg-scada-bg" data-testid="loading-overlay-indeterminate">
            <div className="loading-overlay-bar h-full w-1/3 bg-blue-500" />
            <style>{`
              @keyframes loading-overlay-pulse {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(400%); }
              }
              .loading-overlay-bar {
                animation: loading-overlay-pulse 1.4s ease-in-out infinite;
              }
            `}</style>
          </div>
        )}

        {onCancel && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-scada-border px-3 py-1 text-[11px] text-scada-text hover:bg-scada-hover-nav"
              data-testid="loading-overlay-cancel"
            >
              Anuluj
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
