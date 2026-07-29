/**
 * NotFoundPage — 404 z linkiem powrotu do pulpitu projektu (G6 z planu).
 *
 * Wywołane gdy router nie znajdzie dopasowania dla canonicalRoute / legacyAlias.
 */

interface NotFoundPageProps {
  attemptedRoute?: string;
  onReturnHome: () => void;
  onReportIssue?: () => void;
}

export function NotFoundPage({ attemptedRoute, onReturnHome, onReportIssue }: NotFoundPageProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex h-full w-full flex-col items-center justify-center gap-6 bg-white p-12 text-slate-700"
      data-testid="screen-not-found"
    >
      <div className="flex flex-col items-center gap-2">
        <div className="text-7xl font-bold text-amber-400" aria-hidden="true">
          404
        </div>
        <h1 className="text-2xl font-semibold">Nie znaleziono ekranu</h1>
        <p className="max-w-md text-center text-sm text-slate-500">
          Ścieżka, której szukasz, nie istnieje albo została przeniesiona w nowszej wersji aplikacji.
        </p>
        {attemptedRoute ? (
          <code
            className="rounded bg-slate-100 px-3 py-1 text-xs text-slate-600"
            data-testid="attempted-route"
          >
            {attemptedRoute}
          </code>
        ) : null}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onReturnHome}
          className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-950"
          data-testid="return-home"
        >
          Wróć do pulpitu projektu
        </button>
        {onReportIssue ? (
          <button
            type="button"
            onClick={onReportIssue}
            className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500"
            data-testid="report-issue"
          >
            Zgłoś błąd
          </button>
        ) : null}
      </div>
    </div>
  );
}
