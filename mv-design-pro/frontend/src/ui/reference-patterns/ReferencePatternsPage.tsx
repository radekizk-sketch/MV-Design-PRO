/**
 * Reference Patterns Page — Wzorce odniesienia
 *
 * CANONICAL ALIGNMENT:
 * - 100% Polish UI
 * - READ-ONLY: No physics, no mutations
 * - NOT-A-SOLVER: Reference patterns are INTERPRETATION layer
 *
 * Main page for viewing and running reference pattern validations.
 * Pattern A: Dobór I>> dla linii SN
 */

import { useEffect } from 'react';
import {
  useReferencePatternsStore,
  useSelectedFixture,
  useFilteredTrace,
} from './store';
import type {
  FixtureMetadata,
  PatternMetadata,
  CheckResult,
  TraceStep,
  ReferencePatternsTab,
} from './types';
import {
  VERDICT_BADGE_COLORS,
  VERDICT_LABELS_PL,
  VERDICT_COLORS,
  CHECK_STATUS_COLORS,
  CHECK_STATUS_DOT_COLORS,
  TAB_LABELS_PL,
} from './types';
import {
  buildVerdictMessage,
  type VerdictMessage,
} from '../shared/verdict-messages';
import { formatPolishValue } from '../shared/formatPolishValue';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * @deprecated Migrated to formatPolishValue (PR-1). Wrapper retained for
 * inline usage z `decimals` arg w istniejących call-sites tego pliku.
 * Nowy kod używa `formatPolishValue` bezpośrednio z `ui/shared`.
 */
function formatNumber(value: number | null | undefined, decimals = 2): string {
  return formatPolishValue(value, { decimals });
}

// =============================================================================
// Sub-Components
// =============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      <span className="ml-3 text-slate-600">Ładowanie...</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-slate-500">
      <p>{message}</p>
    </div>
  );
}

// =============================================================================
// Left Panel: Patterns and Fixtures List
// =============================================================================

function PatternsList() {
  const { patterns, selectedPatternId, selectPattern, isLoadingPatterns } =
    useReferencePatternsStore();

  if (isLoadingPatterns) {
    return (
      <div className="p-4">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  if (patterns.length === 0) {
    return <div className="p-4 text-sm text-slate-500">Brak dostępnych wzorców</div>;
  }

  return (
    <div className="space-y-1">
      {patterns.map((pattern: PatternMetadata) => (
        <button
          key={pattern.pattern_id}
          onClick={() => selectPattern(pattern.pattern_id)}
          className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
            selectedPatternId === pattern.pattern_id
              ? 'bg-blue-100 text-blue-800'
              : 'hover:bg-slate-100 text-slate-700'
          }`}
        >
          <div className="font-medium">{pattern.name_pl}</div>
          <div className="mt-0.5 text-xs text-slate-500 line-clamp-2">
            {pattern.description_pl}
          </div>
        </button>
      ))}
    </div>
  );
}

function FixturesList() {
  const {
    fixtures,
    selectedFixtureId,
    selectFixture,
    runFixture,
    isLoadingFixtures,
    isRunningPattern,
    isExporting,
    exportToPdf,
    exportToDocx,
  } = useReferencePatternsStore();

  if (isLoadingFixtures) {
    return (
      <div className="p-4 space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  if (fixtures.length === 0) {
    return <div className="p-4 text-sm text-slate-500">Brak wariantów referencyjnych</div>;
  }

  const getVerdictBadge = (verdict: string | null) => {
    if (!verdict) return null;
    const colors = VERDICT_BADGE_COLORS[verdict as keyof typeof VERDICT_BADGE_COLORS] || 'bg-slate-500 text-white';
    const label = VERDICT_LABELS_PL[verdict as keyof typeof VERDICT_LABELS_PL] || verdict;
    return (
      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${colors}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-1">
      {fixtures.map((fixture: FixtureMetadata) => (
        <div
          key={fixture.fixture_id}
          className={`rounded border p-2 transition-colors ${
            selectedFixtureId === fixture.fixture_id
              ? 'border-blue-300 bg-blue-50'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <button
            onClick={() => selectFixture(fixture.fixture_id)}
            className="w-full text-left"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                {fixture.fixture_id.replace(/_/g, ' ')}
              </span>
              {getVerdictBadge(fixture.expected_verdict)}
            </div>
            {fixture.notes_pl && (
              <div className="mt-1 text-xs text-slate-500 line-clamp-2">
                {fixture.notes_pl}
              </div>
            )}
          </button>
          {selectedFixtureId === fixture.fixture_id && (
            <div className="mt-2 space-y-2">
              <button
                onClick={() => runFixture(fixture.filename)}
                disabled={isRunningPattern}
                className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                {isRunningPattern ? 'Wykonywanie...' : 'Uruchom wzorzec'}
              </button>

              {/* Export buttons for selected fixture */}
              <div className="flex gap-1">
                <button
                  onClick={() => exportToPdf(fixture.filename)}
                  disabled={isExporting || isRunningPattern}
                  title="Pobierz raport PDF"
                  className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isExporting ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-blue-600" />
                      PDF...
                    </span>
                  ) : (
                    'PDF'
                  )}
                </button>
                <button
                  onClick={() => exportToDocx(fixture.filename)}
                  disabled={isExporting || isRunningPattern}
                  title="Pobierz raport DOCX"
                  className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isExporting ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-blue-600" />
                      DOCX...
                    </span>
                  ) : (
                    'DOCX'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LeftPanel() {
  const { loadPatterns } = useReferencePatternsStore();

  useEffect(() => {
    loadPatterns();
  }, [loadPatterns]);

  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">Wzorce odniesienia</h2>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="border-b border-slate-200 px-4 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Dostępne wzorce
          </h3>
        </div>
        <div className="p-2">
          <PatternsList />
        </div>

        <div className="border-b border-t border-slate-200 px-4 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Przypadki referencyjne
          </h3>
        </div>
        <div className="p-2">
          <FixturesList />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Right Panel: Result View
// =============================================================================

/**
 * VerdictBanner — Baner z wynikiem werdyktu
 *
 * Wyświetla strukturalny komunikat UI:
 * - Status (etykieta/badge)
 * - Przyczyna techniczna (dla GRANICZNE i NIEZGODNE)
 * - Skutek (dla GRANICZNE i NIEZGODNE)
 * - Zalecenie (dla GRANICZNE i NIEZGODNE)
 */
function VerdictBanner() {
  const { runResult } = useReferencePatternsStore();

  if (!runResult) return null;

  const { verdict, verdict_description_pl, summary_pl } = runResult;
  const badgeColor = VERDICT_BADGE_COLORS[verdict] || 'bg-slate-500 text-white';
  const borderColor = VERDICT_COLORS[verdict] || 'border-slate-200';

  // Build structured message for non-ZGODNE verdicts
  const message: VerdictMessage = buildVerdictMessage(
    verdict,
    verdict_description_pl,
    summary_pl
  );

  // For ZGODNE verdict, show simple message
  if (verdict === 'ZGODNE') {
    return (
      <div className={`rounded-lg border ${borderColor} bg-white p-4 shadow-sm`}>
        <div className="flex items-start gap-4">
          <span className={`rounded-lg px-4 py-2 text-lg font-bold ${badgeColor}`}>
            {message.status}
          </span>
          <div className="flex-1">
            <p className="text-sm text-slate-700">{verdict_description_pl}</p>
            {summary_pl && (
              <p className="mt-2 text-sm text-slate-600">{summary_pl}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // For GRANICZNE and NIEZGODNE, show structured message
  return (
    <div className={`rounded-lg border ${borderColor} bg-white p-4 shadow-sm`}>
      <div className="flex items-start gap-4">
        {/* Status Badge */}
        <span className={`flex-shrink-0 rounded-lg px-4 py-2 text-lg font-bold ${badgeColor}`}>
          {message.status}
        </span>

        {/* Structured Message Content */}
        <div className="flex-1 space-y-3">
          {/* Przyczyna techniczna */}
          {message.cause && (
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Przyczyna
              </span>
              <p className="mt-0.5 text-sm text-slate-700">{message.cause}</p>
            </div>
          )}

          {/* Skutek */}
          {message.effect && (
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Skutek
              </span>
              <p className="mt-0.5 text-sm text-slate-700">{message.effect}</p>
            </div>
          )}

          {/* Zalecenie */}
          {message.recommendation && (
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Zalecenie
              </span>
              <p className="mt-0.5 text-sm text-slate-700">{message.recommendation}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Export Section Component
// =============================================================================

function ExportSection() {
  const {
    runResult,
    isExporting,
    exportError,
    exportToPdf,
    exportToDocx,
    clearExportError,
    selectedFixtureId,
    fixtures,
  } = useReferencePatternsStore();

  // Get the selected fixture to retrieve filename for export
  const selectedFixture = fixtures.find((f) => f.fixture_id === selectedFixtureId);

  if (!runResult || !selectedFixture) return null;

  const handleExportPdf = () => {
    exportToPdf(selectedFixture.filename);
  };

  const handleExportDocx = () => {
    exportToDocx(selectedFixture.filename);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Raport</h3>
          <p className="mt-1 text-xs text-slate-500">
            Pobierz raport wyników w wybranym formacie
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPdf}
            disabled={isExporting}
            className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                Pobieranie...
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Pobierz PDF
              </>
            )}
          </button>
          <button
            onClick={handleExportDocx}
            disabled={isExporting}
            className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                Pobieranie...
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Pobierz DOCX
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error message */}
      {exportError && (
        <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <div className="flex items-start justify-between">
            <span>{exportError}</span>
            <button
              onClick={clearExportError}
              className="ml-2 text-rose-500 hover:text-rose-700"
              aria-label="Zamknij komunikat błędu"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecksTable() {
  const { runResult } = useReferencePatternsStore();

  if (!runResult || runResult.checks.length === 0) {
    return <EmptyState message="Kontrola wzorców referencyjnych nie wskazuje pozycji technicznych." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="border-b border-slate-200 px-4 py-2 text-left font-semibold">
              Kryterium
            </th>
            <th className="border-b border-slate-200 px-4 py-2 text-left font-semibold">
              Status
            </th>
            <th className="border-b border-slate-200 px-4 py-2 text-left font-semibold">
              Opis
            </th>
          </tr>
        </thead>
        <tbody>
          {runResult.checks.map((check: CheckResult, idx: number) => (
            <tr key={`${check.name_pl}-${idx}`} className="hover:bg-slate-50">
              <td className="border-b border-slate-100 px-4 py-2 font-medium">
                {check.name_pl}
              </td>
              <td className="border-b border-slate-100 px-4 py-2">
                <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${CHECK_STATUS_COLORS[check.status]}`}>
                  <span className={`w-2 h-2 rounded-full ${CHECK_STATUS_DOT_COLORS[check.status]}`} />
                  {check.status_pl}
                </span>
              </td>
              <td className="border-b border-slate-100 px-4 py-2 text-slate-600">
                {check.description_pl}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArtifactsDisplay() {
  const { runResult } = useReferencePatternsStore();

  if (!runResult) {
    return <EmptyState message="Brak wartości pośrednich." />;
  }

  const { artifacts } = runResult;

  const sections = [
    {
      title: 'Czas zwarcia i wytrzymałość cieplna',
      items: [
        { label: 'tk (czas zwarcia sumaryczny)', value: artifacts.tk_total_s, unit: 's' },
        { label: 'Ithn (prąd znamionowy cieplny)', value: artifacts.ithn_a, unit: 'A' },
        { label: 'Ithdop (prąd dopuszczalny cieplnie)', value: artifacts.ithdop_a, unit: 'A' },
      ],
    },
    {
      title: 'Okno nastaw I>> [strona pierwotna]',
      items: [
        { label: 'I_min (selektywność)', value: artifacts.window_i_min_primary_a, unit: 'A' },
        { label: 'I_max (okno)', value: artifacts.window_i_max_primary_a, unit: 'A' },
        { label: 'Zalecana nastawa (wtórna)', value: artifacts.recommended_setting_secondary_a, unit: 'A' },
      ],
    },
    {
      title: 'Szczegóły kryteriów',
      items: [
        { label: 'I_min_sel (selektywność)', value: artifacts.i_min_sel_primary_a, unit: 'A' },
        { label: 'I_max_sens (czułość)', value: artifacts.i_max_sens_primary_a, unit: 'A' },
        { label: 'I_max_th (cieplne)', value: artifacts.i_max_th_primary_a, unit: 'A' },
      ],
    },
    {
      title: 'Kryteria limitujące',
      items: [
        { label: 'Kryterium limitujące I_min', value: artifacts.limiting_criterion_min, unit: '' },
        { label: 'Kryterium limitujące I_max', value: artifacts.limiting_criterion_max, unit: '' },
        { label: 'Okno nastaw prawidłowe', value: artifacts.window_valid ? 'Tak' : 'Nie', unit: '' },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.title} className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
            <h4 className="text-sm font-semibold text-slate-700">{section.title}</h4>
          </div>
          <div className="divide-y divide-slate-100">
            {section.items.map((item) => (
              <div key={item.label} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm text-slate-600">{item.label}</span>
                <span className="font-mono text-sm font-medium text-slate-900">
                  {typeof item.value === 'number'
                    ? `${formatNumber(item.value)} ${item.unit}`
                    : item.value ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TraceDisplay() {
  const { traceSearchQuery, setTraceSearchQuery } = useReferencePatternsStore();
  const filteredTrace = useFilteredTrace();
  const { runResult } = useReferencePatternsStore();

  if (!runResult) {
    return <EmptyState message="Brak śladu obliczeń." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          type="search"
          placeholder="Szukaj w śladzie obliczeń..."
          value={traceSearchQuery}
          onChange={(e) => setTraceSearchQuery(e.target.value)}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        {filteredTrace.map((step: TraceStep, idx: number) => (
          <div
            key={`${step.step}-${idx}`}
            className="rounded border border-slate-200 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-mono text-blue-700">
                    {step.step}
                  </span>
                </div>
                <p className="text-sm text-slate-800">{step.description_pl}</p>

                {step.formula && (
                  <div className="mt-2 rounded bg-slate-50 px-3 py-2">
                    <span className="text-xs font-medium text-slate-500">Wzór:</span>
                    <code className="ml-2 text-sm text-slate-700">{step.formula}</code>
                  </div>
                )}

                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                  {Object.keys(step.inputs).length > 0 && (
                    <div className="rounded bg-emerald-50 p-2">
                      <span className="text-xs font-semibold text-emerald-700">Wejścia</span>
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(step.inputs).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="text-slate-600">{key}</span>
                            <span className="font-mono text-slate-800">
                              {typeof val === 'number' ? formatNumber(val) : String(val ?? '—')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {step.calculation && Object.keys(step.calculation).length > 0 && (
                    <div className="rounded bg-amber-50 p-2">
                      <span className="text-xs font-semibold text-amber-700">Obliczenia</span>
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(step.calculation).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="text-slate-600">{key}</span>
                            <span className="font-mono text-slate-800">
                              {typeof val === 'number' ? formatNumber(val) : String(val ?? '—')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {step.outputs && Object.keys(step.outputs).length > 0 && (
                    <div className="rounded bg-blue-50 p-2">
                      <span className="text-xs font-semibold text-blue-700">Wyjścia</span>
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(step.outputs).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="text-slate-600">{key}</span>
                            <span className="font-mono text-slate-800">
                              {typeof val === 'number' ? formatNumber(val) : String(val ?? '—')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-sm text-slate-500">
        Wyświetlono: {filteredTrace.length} z {runResult.trace.length} kroków
      </div>
    </div>
  );
}

function ResultContent() {
  const { activeTab, runResult, runError, isRunningPattern } = useReferencePatternsStore();

  if (isRunningPattern) {
    return <LoadingSpinner />;
  }

  if (runError) {
    return (
      <div className="rounded border border-rose-200 bg-rose-50 p-4 text-rose-700">
        <p className="font-medium">Błąd wykonania wzorca</p>
        <p className="mt-1 text-sm">{runError}</p>
      </div>
    );
  }

  if (!runResult) {
    return (
      <EmptyState message="Wybierz wariant referencyjny z listy po lewej stronie i kliknij 'Wykonaj wzorzec', aby zobaczyć wyniki." />
    );
  }

  return (
    <div className="space-y-4">
      {activeTab === 'WYNIK' && (
        <>
          <VerdictBanner />
          <ExportSection />
          <ChecksTable />
        </>
      )}
      {activeTab === 'CHECKI' && <ChecksTable />}
      {activeTab === 'WARTOSCI' && <ArtifactsDisplay />}
      {activeTab === 'SLAD' && <TraceDisplay />}
    </div>
  );
}

function RightPanel() {
  const { activeTab, setActiveTab, runResult } = useReferencePatternsStore();
  const selectedFixture = useSelectedFixture();

  const tabs: ReferencePatternsTab[] = ['WYNIK', 'CHECKI', 'WARTOSCI', 'SLAD'];

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">
            {selectedFixture
              ? `Wynik: ${selectedFixture.fixture_id.replace(/_/g, ' ')}`
              : 'Wynik walidacji wzorca'}
          </h2>
          {runResult && (
            <span
              className={`rounded px-3 py-1 text-sm font-medium ${
                VERDICT_BADGE_COLORS[runResult.verdict]
              }`}
            >
              {VERDICT_LABELS_PL[runResult.verdict]}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 bg-white px-4 py-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            disabled={!runResult}
            className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed'
            }`}
          >
            {TAB_LABELS_PL[tab]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        <ResultContent />
      </div>
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

export function ReferencePatternsPage() {
  return (
    <div className="flex h-full">
      <div className="w-80 flex-shrink-0">
        <LeftPanel />
      </div>
      <div className="flex-1">
        <RightPanel />
      </div>
    </div>
  );
}
