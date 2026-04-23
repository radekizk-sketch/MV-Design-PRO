import { useMemo, useState } from 'react';

import { useAppStateStore } from '../app-state/store';
import { navigateToProof } from '../navigation';
import type { ElementProtectionAssignment } from '../protection/element-assignment';
import { useProtectionReadModel } from '../protection/useProtectionReadModel';
import { ProtectionDiagnosticsPanelContainer } from '../protection-diagnostics';
import type { ProtectionSummary } from '../sld/protection/types';

type ProtectionInspectorTab = 'SUMMARY' | 'EVALUATIONS' | 'DIAGNOSTICS' | 'TRACE';

const TAB_LABELS: Record<ProtectionInspectorTab, string> = {
  SUMMARY: 'Podsumowanie',
  EVALUATIONS: 'Oceny',
  DIAGNOSTICS: 'Diagnostyka',
  TRACE: 'Wywód',
};

const DATA_SOURCE_LABELS: Record<string, string> = {
  ENM_PROTECTION_READ_MODEL: 'Bieżący widok ochrony ENM',
};

const RESULT_STATE_LABELS: Record<string, string> = {
  NONE: 'Brak danych',
  FRESH: 'Aktualny widok',
};

const VERIFICATION_LABELS: Record<string, string> = {
  SPELNIONE: 'Spełnione',
  NIESPELNIONE: 'Niespełnione',
  BRAK_DANYCH: 'Brak danych',
};

const ELEMENT_TYPE_LABELS: Record<string, string> = {
  LineBranch: 'Odcinek liniowy',
  TransformerBranch: 'Transformator',
  Switch: 'Aparat łączeniowy',
  Source: 'Źródło zasilania',
  Load: 'Odbiór',
  Bus: 'Szyna',
  BaySN: 'Pole SN',
  Station: 'Stacja',
  BranchPole: 'Słup rozgałęźny',
  ZKSN: 'ZKSN',
};

export interface ProtectionResultsInspectorPageProps {
  runId?: string | null;
}

function formatCount(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('pl-PL');
}

function formatMargin(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%`;
}

function labelForElementType(elementType: string | null | undefined): string {
  if (!elementType) {
    return 'Nieznany element';
  }
  return ELEMENT_TYPE_LABELS[elementType] ?? elementType;
}

function labelForVerification(status: string | null | undefined): string {
  if (!status) {
    return 'Brak danych';
  }
  return VERIFICATION_LABELS[status] ?? status;
}

function LoadingState() {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">
      Ładowanie widoku ochrony...
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600">
      {message}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
      {message}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="text-sm font-medium text-slate-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function EvaluationsTable({
  summaries,
  assignmentsByElement,
}: {
  summaries: ProtectionSummary[];
  assignmentsByElement: Map<string, ElementProtectionAssignment[]>;
}) {
  if (summaries.length === 0) {
    return <EmptyState message="Brak danych ochrony w bieżącym modelu ENM." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold">Element</th>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold">Typ</th>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold">Weryfikacja</th>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-semibold">Urządzenia</th>
            <th className="border-b border-slate-200 px-4 py-3 text-right font-semibold">Margines</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((row) => {
            const assignments = assignmentsByElement.get(row.element_id) ?? [];
            const deviceLabel =
              assignments.length > 0
                ? assignments.map((assignment) => assignment.device_name_pl).join(', ')
                : 'Brak przypisań';

            return (
              <tr key={row.element_id} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-4 py-3">
                  <div className="font-medium text-slate-900">{row.element_name}</div>
                  <div className="text-xs text-slate-500">{row.element_id}</div>
                </td>
                <td className="border-b border-slate-100 px-4 py-3">
                  {labelForElementType(row.element_type)}
                </td>
                <td className="border-b border-slate-100 px-4 py-3">
                  <div>{labelForVerification(row.verification_status)}</div>
                  {row.verification_reason ? (
                    <div className="text-xs text-slate-500">{row.verification_reason}</div>
                  ) : null}
                </td>
                <td className="border-b border-slate-100 px-4 py-3">{deviceLabel}</td>
                <td className="border-b border-slate-100 px-4 py-3 text-right font-mono">
                  {formatMargin(row.margin_pct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TracePanel({ runId }: { runId: string | null | undefined }) {
  return (
    <div className="space-y-4">
      <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
        Wywód ochrony nie jest dostępny w tym widoku.
      </div>
      <button
        type="button"
        onClick={() => {
          if (runId) {
            navigateToProof({ runId });
          }
        }}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={!runId}
      >
        Otwórz wywód obliczeń
      </button>
    </div>
  );
}

export function ProtectionResultsInspectorPage({
  runId = null,
}: ProtectionResultsInspectorPageProps) {
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const { data, assignmentsByElement, isLoading, error, summary, viewStatus } = useProtectionReadModel();
  const [activeTab, setActiveTab] = useState<ProtectionInspectorTab>('SUMMARY');

  const summaries = useMemo(() => data?.summaries ?? [], [data]);
  const hasProtectionData = Boolean(viewStatus?.has_protection_data && summaries.length > 0);
  const sourceLabel = DATA_SOURCE_LABELS[viewStatus?.data_source ?? ''] ?? 'Nieznane źródło';
  const resultStateLabel = RESULT_STATE_LABELS[viewStatus?.result_state ?? ''] ?? 'Nieznany stan';

  if (!activeCaseId) {
    return (
      <div className="rounded border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-600">
          Wybierz aktywny zakres obliczen, aby zobaczyc wyniki ochrony.
      </div>
    );
  }

  let content: React.JSX.Element;
  if (isLoading) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState message={error} />;
  } else if (activeTab === 'DIAGNOSTICS') {
    content = <ProtectionDiagnosticsPanelContainer />;
  } else if (activeTab === 'TRACE') {
    content = <TracePanel runId={runId} />;
  } else if (!hasProtectionData) {
    content = <EmptyState message="Brak danych ochrony w bieżącym modelu ENM." />;
  } else if (activeTab === 'EVALUATIONS') {
    content = (
      <EvaluationsTable summaries={summaries} assignmentsByElement={assignmentsByElement} />
    );
  } else {
    content = (
      <div className="space-y-4">
        <div className="rounded border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="text-sm text-slate-700">
              <span className="font-semibold">Źródło danych:</span> {sourceLabel}
            </div>
            <div className="text-sm text-slate-700">
              <span className="font-semibold">Stan widoku:</span> {resultStateLabel}
            </div>
            <div className="text-sm text-slate-700">
              <span className="font-semibold">Wyniki referencyjne:</span> {runId ?? '—'}
            </div>
            <div className="text-sm text-slate-700">
              <span className="font-semibold">Przypisania aktywne:</span> {formatCount(summary.active_assignments)} / {formatCount(summary.total_assignments)}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Elementy z ochroną" value={formatCount(summary.total_elements)} />
          <SummaryCard label="Przypisania łącznie" value={formatCount(summary.total_assignments)} />
          <SummaryCard label="Weryfikacje spełnione" value={formatCount(summary.verified_count)} />
          <SummaryCard label="Braki danych" value={formatCount(summary.no_data_count)} />
        </div>

        <div className="rounded border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Weryfikacja i diagnostyka</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Zablokowane" value={formatCount(summary.blocked_assignments)} />
            <SummaryCard label="Błędy" value={formatCount(summary.error_count)} />
            <SummaryCard label="Ostrzeżenia" value={formatCount(summary.warn_count)} />
            <SummaryCard label="Niekompletne" value={formatCount(summary.incomplete_count)} />
            <SummaryCard label="Niespełnione" value={formatCount(summary.failed_count)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 bg-slate-50 p-4">
      <div className="rounded border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-slate-900">Wyniki ochrony</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(TAB_LABELS).map(([tabId, label]) => {
          const selected = activeTab === tabId;
          return (
            <button
              key={tabId}
              type="button"
              onClick={() => setActiveTab(tabId as ProtectionInspectorTab)}
              aria-pressed={selected}
              className={`rounded px-4 py-2 text-sm font-medium transition ${
                selected
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto">{content}</div>
    </div>
  );
}
