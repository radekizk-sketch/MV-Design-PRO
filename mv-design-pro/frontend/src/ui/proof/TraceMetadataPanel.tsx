import { useMemo } from 'react';

import type {
  CatalogContextEntry,
  ExtendedTrace,
  TraceStep,
} from '../results-inspector/types';

interface TraceMetadataPanelProps {
  trace: ExtendedTrace;
  selectedStep: TraceStep | null;
}

function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '-';
  try {
    return new Date(isoDate).toLocaleString('pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return isoDate;
  }
}

function shortenHash(hash: string, length = 16): string {
  if (hash.length <= length) return hash;
  return `${hash.substring(0, length)}...`;
}

function computeStepStats(steps: TraceStep[]): {
  total: number;
  byPhase: Record<string, number>;
} {
  const byPhase: Record<string, number> = {};

  for (const step of steps) {
    const phase = step.phase ?? 'Inne';
    byPhase[phase] = (byPhase[phase] ?? 0) + 1;
  }

  return {
    total: steps.length,
    byPhase,
  };
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

interface MetadataRowProps {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}

function MetadataRow({ label, value, mono = false }: MetadataRowProps) {
  return (
    <div className="border-b border-slate-100 py-2 last:border-b-0">
      <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className={`text-sm text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>
        {value ?? '-'}
      </dd>
    </div>
  );
}

interface MetadataSectionProps {
  title: string;
  children: React.ReactNode;
}

function MetadataSection({ title, children }: MetadataSectionProps) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-700">
        {title}
      </h3>
      <dl>{children}</dl>
    </section>
  );
}

function CatalogEntryCard({ entry }: { entry: CatalogContextEntry }) {
  const parameterOrigin = entry.parameter_origin ?? entry.parameter_source ?? null;
  const manualOverrides = entry.manual_overrides ?? entry.overrides ?? [];
  const sourceCatalog = entry.source_catalog ?? entry.catalog_binding ?? null;

  return (
    <article className="rounded border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-xs font-medium text-slate-500">{entry.element_type}</div>
      <div className="mt-1 text-sm font-mono text-slate-800">{entry.element_id}</div>
      {entry.name ? <div className="mt-1 text-sm text-slate-700">{entry.name}</div> : null}
      <div className="mt-2 grid gap-2 text-xs text-slate-600">
        <div>
          <span className="font-medium text-slate-700">Powiązanie katalogowe: </span>
          <span className="font-mono">
            {entry.catalog_binding?.catalog_namespace ?? '-'}:
            {entry.catalog_binding?.catalog_item_id ?? '-'}
          </span>
        </div>
        {entry.source_catalog_label ? (
          <div>
            <span className="font-medium text-slate-700">Źródło katalogowe: </span>
            <span className="font-mono">{entry.source_catalog_label}</span>
          </div>
        ) : sourceCatalog ? (
          <div>
            <span className="font-medium text-slate-700">Źródło katalogowe: </span>
            <span className="font-mono">
              {sourceCatalog.catalog_namespace ?? '-'}:
              {sourceCatalog.catalog_item_id ?? '-'}
            </span>
          </div>
        ) : null}
        {entry.catalog_binding?.catalog_item_version ? (
          <div>
            <span className="font-medium text-slate-700">Wersja katalogu: </span>
            <span className="font-mono">{entry.catalog_binding.catalog_item_version}</span>
          </div>
        ) : null}
        {parameterOrigin ? (
          <div>
            <span className="font-medium text-slate-700">Pochodzenie parametrów: </span>
            <span>{parameterOrigin}</span>
          </div>
        ) : null}
      </div>
      {entry.materialized_params ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            Zmaterializowane parametry
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-[11px] text-slate-700">
            {formatJson(entry.materialized_params)}
          </pre>
        </details>
      ) : null}
      {manualOverrides.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            Nadpisania ręczne
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-[11px] text-slate-700">
            {formatJson(manualOverrides)}
          </pre>
        </details>
      ) : null}
    </article>
  );
}

export function TraceMetadataPanel({ trace, selectedStep }: TraceMetadataPanelProps) {
  const stats = useMemo(
    () => computeStepStats(trace.white_box_trace),
    [trace.white_box_trace],
  );
  const catalogEntries = useMemo(
    () => [...(trace.catalog_context ?? [])].sort((left, right) => left.element_id.localeCompare(right.element_id)),
    [trace.catalog_context],
  );
  const catalogSummary = trace.catalog_context_summary ?? {};
  const selectedCatalogEntry = useMemo<CatalogContextEntry | null>(() => {
    if (selectedStep?.catalog_context_entry) {
      return selectedStep.catalog_context_entry;
    }

    const candidateKeys = [
      selectedStep?.key,
      typeof selectedStep?.target_id === 'string' ? selectedStep.target_id : null,
      typeof selectedStep?.element_id === 'string' ? selectedStep.element_id : null,
    ].filter((value): value is string => Boolean(value));

    return catalogEntries.find((entry) => candidateKeys.includes(entry.element_id)) ?? null;
  }, [catalogEntries, selectedStep]);

  const hasSelectedStepCatalogMiss = Boolean(selectedStep) && selectedCatalogEntry === null;
  const detailEntries = selectedStep
    ? (selectedCatalogEntry ? [selectedCatalogEntry] : [])
    : catalogEntries;

  const phaseLabels: Record<string, string> = {
    INITIALIZATION: 'Inicjalizacja',
    CALCULATION: 'Obliczenia',
    AGGREGATION: 'Agregacja',
    VALIDATION: 'Walidacja',
    OUTPUT: 'Wyniki',
    Inne: 'Inne',
  };

  return (
    <aside
      className="h-full overflow-y-auto border-l border-slate-200 bg-white"
      data-testid="trace-metadata-panel"
    >
      <div className="p-4">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Metadane śladu</h2>

        <MetadataSection title="Kontekst obliczen">
          <MetadataRow label="ID migawki" value={trace.snapshot_id} mono />
          <MetadataRow label="ID wykonania" value={trace.run_id} mono />
          <MetadataRow
            label="Hash danych wejściowych"
            value={shortenHash(trace.input_hash)}
            mono
          />
          <MetadataRow label="Elementy z katalogiem" value={String(catalogEntries.length)} />
          <MetadataRow
            label="Elementy z nadpisaniami ręcznymi"
            value={String(catalogSummary.manual_override_element_count ?? 0)}
          />
          <MetadataRow
            label="Liczba nadpisań ręcznych"
            value={String(catalogSummary.manual_override_count ?? 0)}
          />
        </MetadataSection>

        <MetadataSection title="Kontekst katalogowy">
          {catalogEntries.length === 0 ? (
            <div className="py-2 text-sm text-slate-500">
              Brak jawnego kontekstu katalogowego w śladzie tego przebiegu.
            </div>
          ) : hasSelectedStepCatalogMiss ? (
            <div className="py-2 text-sm text-slate-500">
              Brak dopasowania kontekstu katalogowego dla wybranego kroku.
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {detailEntries.map((entry) => (
                <CatalogEntryCard
                  key={`${entry.element_type}-${entry.element_id}`}
                  entry={entry}
                />
              ))}
            </div>
          )}
        </MetadataSection>

        <MetadataSection title="Statystyki">
          <MetadataRow label="Liczba kroków" value={String(stats.total)} />
          <div className="py-2">
            <dt className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Podział według faz
            </dt>
            <dd>
              <ul className="space-y-1">
                {Object.entries(stats.byPhase).map(([phase, count]) => (
                  <li
                    key={phase}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-600">{phaseLabels[phase] ?? phase}</span>
                    <span className="font-medium text-slate-800">{count}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </MetadataSection>

        {selectedStep ? (
          <MetadataSection title="Wybrany krok">
            <MetadataRow
              label="Identyfikator"
              value={selectedStep.key ?? selectedStep.step_id ?? selectedStep.equation_id}
              mono
            />
            {selectedStep.phase ? (
              <MetadataRow
                label="Faza"
                value={phaseLabels[selectedStep.phase] ?? selectedStep.phase}
              />
            ) : null}
            {selectedStep.timestamp ? (
              <MetadataRow
                label="Znacznik czasu"
                value={formatDate(selectedStep.timestamp)}
              />
            ) : null}
          </MetadataSection>
        ) : null}

        <MetadataSection title="Źródło obliczeń">
          <div className="py-2">
            <p className="text-sm text-slate-600">Obliczenia zgodne z normą IEC 60909</p>
            <p className="mt-1 text-xs text-slate-400">
              Szczegóły metodyki dostępne w dokumentacji
            </p>
          </div>
        </MetadataSection>

        <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
            <strong>Uwaga:</strong> Ślad obliczeń jest dokumentem audytowym. Wszystkie
            wartości są tylko do odczytu.
          </p>
        </div>
      </div>
    </aside>
  );
}

export function TraceMetadataPanelEmpty() {
  return (
    <aside
      className="h-full overflow-y-auto border-l border-slate-200 bg-white p-4"
      data-testid="trace-metadata-panel-empty"
    >
      <div className="py-8 text-center">
        <p className="text-sm text-slate-500">Brak danych metadanych</p>
      </div>
    </aside>
  );
}
