import { ResultsInspectorPage } from './ResultsInspectorPage';

interface LegacyTraceWorkspacePageProps {
  runId?: string;
}

export function LegacyTraceWorkspacePage({ runId }: LegacyTraceWorkspacePageProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50" data-testid="legacy-trace-workspace-page">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold uppercase tracking-[0.18em] text-slate-700">
            Ślad obliczeń
          </span>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
            Audyt runu
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
            Dla inżyniera SN: ten widok prowadzi po pełnym śladzie obliczeń dla aktywnego uruchomienia.
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ResultsInspectorPage runId={runId} forcedTab="TRACE" />
      </div>
    </div>
  );
}

export default LegacyTraceWorkspacePage;
