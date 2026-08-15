/**
 * ErrorBoundary — React fallback dla niespodziewanych błędów w drzewie UI.
 *
 * Bez ErrorBoundary cały app crashuje przy pojedynczym błędzie komponentu
 * (np. null reference, infinite loop). Z ErrorBoundary user widzi fallback
 * z opcją "Spróbuj ponownie" + "Zgłoś błąd".
 *
 * Stosowanie:
 *  - Root level (App.tsx) - catches everything
 *  - Per-surface (Workspace) - graceful degradation per ekran
 *
 * BINDING: 100% PL etykiety.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Opcjonalny custom fallback. Default = ErrorFallback. */
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Callback gdy error jest złapany (do logowania). */
  readonly onError?: (error: Error, info: ErrorInfo) => void;
  /** Tytuł sekcji która się crashnęła (np. "Środowisko SLD"). */
  readonly sectionLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    // Log do konsoli dla developera w trybie dev
    if (import.meta.env?.DEV) {
      console.error('[ErrorBoundary]', this.props.sectionLabel ?? 'app root', error, errorInfo);
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset);
      }
      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
          sectionLabel={this.props.sectionLabel}
        />
      );
    }
    return this.props.children;
  }
}

interface ErrorFallbackProps {
  readonly error: Error;
  readonly errorInfo: ErrorInfo | null;
  readonly onReset: () => void;
  readonly sectionLabel?: string;
}

function ErrorFallback({ error, errorInfo, onReset, sectionLabel }: ErrorFallbackProps): JSX.Element {
  const isDev = import.meta.env?.DEV;
  return (
    <div
      role="alert"
      className="flex h-full w-full items-center justify-center bg-scada-bg p-6"
      data-testid="error-boundary-fallback"
    >
      <div className="max-w-2xl rounded border border-red-700 bg-red-950/30 p-6 text-scada-text">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-red-300">
          {sectionLabel ? `Błąd w sekcji: ${sectionLabel}` : 'Nieoczekiwany błąd aplikacji'}
        </div>
        <h2 className="mb-3 text-lg font-semibold text-red-100">
          Coś poszło nie tak
        </h2>
        <p className="mb-4 text-sm text-red-200">
          Komponent przerwał działanie z powodu wyjątku. Twoje dane projektu
          są bezpieczne — błąd nastąpił w warstwie wyświetlania. Spróbuj
          ponownie. Jeśli błąd się powtarza, zgłoś go zespołowi.
        </p>

        <div className="mb-4 rounded border border-red-800/50 bg-black/30 p-3 text-[11px] font-mono text-red-200">
          <div className="font-semibold mb-1">Komunikat:</div>
          <div>{error.message}</div>
        </div>

        {isDev && errorInfo?.componentStack && (
          <details className="mb-4 text-[10px] font-mono text-red-300">
            <summary className="cursor-pointer text-red-200">
              Stack trace (tryb dev)
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/40 p-2">
              {errorInfo.componentStack}
            </pre>
          </details>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReset}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            data-testid="error-boundary-retry"
          >
            Spróbuj ponownie
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded border border-sygnal-blokada px-4 py-1.5 text-sm text-sygnal-blokada-tusz hover:bg-sygnal-blokada-tlo"
            data-testid="error-boundary-reload"
          >
            Odśwież stronę
          </button>
          <button
            type="button"
            onClick={() => {
              const payload = `Błąd: ${error.message}\n\n${errorInfo?.componentStack ?? '(brak stack trace)'}`;
              navigator.clipboard?.writeText(payload).catch(() => {
                // ignore - clipboard not available
              });
            }}
            className="rounded border border-scada-border px-4 py-1.5 text-sm text-scada-text hover:bg-scada-hover-nav"
            data-testid="error-boundary-copy"
          >
            Kopiuj do schowka
          </button>
        </div>
      </div>
    </div>
  );
}
