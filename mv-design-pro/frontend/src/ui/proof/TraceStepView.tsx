/**
 * TraceStepView — Widok szczegółów kroku obliczeniowego (środkowy panel)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Wzór → Dane → Podstawienie → Wynik
 * - wizard_screens.md: RESULT_VIEW mode, Polish labels
 *
 * FEATURES:
 * - Wzór (LaTeX renderowany jako tekst)
 * - Dane wejściowe z jednostkami
 * - Podstawienie (wzór z wartościami)
 * - Wynik z jednostkami
 * - Uwagi / odniesienia do norm
 * - 100% Polish UI
 *
 * NOTE: Nazwy kodowe NIGDY nie są pokazywane w UI.
 */

import type { TraceStep } from '../results-inspector/types';
import { TRACE_VALUE_LABELS } from '../results-inspector/types';
import { rozpakujWartoscSladu } from '../results-inspector/traceValue';
import { MathRenderer } from './MathRenderer';

// =============================================================================
// Types
// =============================================================================

interface TraceStepViewProps {
  step: TraceStep;
  stepIndex: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Formatuj surową wartość wpisu `inputs`/`result` kroku śladu WHITE BOX
 * (skalar / liczba zespolona `{re, im}` / opakowany `TraceValue`) z
 * odpowiednią precyzją. Rozpakowanie kształtu jest WSPÓLNE dla całego frontu
 * — patrz `results-inspector/traceValue.ts::rozpakujWartoscSladu` (KLASA NIE
 * INSTANCJA, karta WB-2); ta funkcja tylko formatuje jego wynik do napisu.
 */
function formatValue(value: unknown): string {
  const { wartosc, re, im, unit } = rozpakujWartoscSladu(value);

  if (typeof re === 'number' && typeof im === 'number') {
    // Ten widok nie ma dedykowanego formatu zespolonego (re + j·im) —
    // surowy JSON składowych, jak dotychczas, NIGDY "[object Object]".
    return JSON.stringify({ re, im });
  }

  if (wartosc === null) return '—';

  let formatted: string;
  if (typeof wartosc === 'number') {
    // Inteligentne formatowanie: więcej miejsc dla małych liczb
    formatted = Math.abs(wartosc) < 0.01 && wartosc !== 0
      ? wartosc.toExponential(3)
      : wartosc.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  } else if (typeof wartosc === 'boolean') {
    formatted = wartosc ? 'Tak' : 'Nie';
  } else {
    formatted = wartosc;
  }

  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Pobierz polski label dla klucza wartości.
 */
function getValueLabel(key: string): string {
  return TRACE_VALUE_LABELS[key] ?? key;
}

/**
 * Pobierz tytuł kroku.
 */
function getStepTitle(step: TraceStep, index: number): string {
  if (step.title) return step.title;
  if (step.description) return step.description;
  return `Krok ${index + 1}`;
}

// =============================================================================
// Sub-Components
// =============================================================================

interface ValueTableProps {
  title: string;
  values: Record<string, unknown> | undefined;
  emptyMessage?: string;
}

function ValueTable({ title, values, emptyMessage = 'Brak danych' }: ValueTableProps) {
  if (!values || Object.keys(values).length === 0) {
    return (
      <div className="mb-4">
        <h4 className="text-sm font-medium text-slate-700 mb-2">{title}</h4>
        <p className="text-sm text-slate-400 italic">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <h4 className="text-sm font-medium text-slate-700 mb-2">{title}</h4>
      <div className="rounded border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Wielkość</th>
              <th className="px-3 py-2 text-right font-medium text-slate-600">Wartość</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.entries(values).map(([key, value]) => (
              <tr key={key} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-700">{getValueLabel(key)}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-800">
                  {formatValue(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FormulaBlockProps {
  title: string;
  content: string | undefined;
  isLatex?: boolean;
}

function FormulaBlock({ title, content, isLatex = false }: FormulaBlockProps) {
  if (!content) return null;

  return (
    <div className="mb-4">
      <h4 className="text-sm font-medium text-slate-700 mb-2">{title}</h4>
      <div
        className={`
          rounded border border-slate-200 bg-slate-50 px-4 py-3
          ${isLatex ? 'text-center overflow-x-auto' : 'text-sm'}
        `}
        data-testid={`formula-block-${title.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {isLatex ? (
          <MathRenderer latex={content} block className="text-slate-800" />
        ) : (
          <code className="text-slate-800 whitespace-pre-wrap break-words">
            {content}
          </code>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function TraceStepView({ step, stepIndex }: TraceStepViewProps) {
  const title = getStepTitle(step, stepIndex);
  const hasFormula = Boolean(step.formula_latex);
  const hasInputs = step.inputs && Object.keys(step.inputs).length > 0;
  const hasSubstitution = Boolean(step.substitution);
  const hasResult = step.result && Object.keys(step.result).length > 0;
  const hasNotes = Boolean(step.notes);

  return (
    <article
      className="h-full overflow-y-auto p-4"
      data-testid={`trace-step-view-${stepIndex}`}
    >
      {/* Nagłówek kroku */}
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold">
            {stepIndex + 1}
          </span>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        </div>

        {step.phase && (
          <span className="inline-block rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
            {step.phase}
          </span>
        )}
      </header>

      {/* Treść kroku */}
      <div className="space-y-4">
        {/* Wzór */}
        {hasFormula && (
          <FormulaBlock
            title="Wzór"
            content={step.formula_latex}
            isLatex
          />
        )}

        {/* Dane wejściowe */}
        {hasInputs && (
          <ValueTable
            title="Dane wejściowe"
            values={step.inputs}
          />
        )}

        {/* Podstawienie */}
        {hasSubstitution && (
          <FormulaBlock
            title="Podstawienie"
            content={step.substitution}
            isLatex
          />
        )}

        {/* Wynik */}
        {hasResult && (
          <ValueTable
            title="Wynik"
            values={step.result}
          />
        )}

        {/* Uwagi */}
        {hasNotes && (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-4 py-3">
            <h4 className="text-sm font-medium text-amber-800 mb-1">Uwagi</h4>
            <p className="text-sm text-amber-700">{step.notes}</p>
          </div>
        )}

        {/* Fallback: pokaż surowe dane jeśli brak strukturyzowanych */}
        {!hasFormula && !hasInputs && !hasSubstitution && !hasResult && (
          <div className="rounded border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-medium text-slate-700 mb-2">Dane kroku</h4>
            <pre className="text-xs text-slate-600 whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(step, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Placeholder dla pustego stanu (gdy nie wybrano kroku).
 */
export function TraceStepViewEmpty() {
  return (
    <div
      className="h-full flex items-center justify-center p-4"
      data-testid="trace-step-view-empty"
    >
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        </div>
        <p className="text-slate-600 font-medium">Wybierz krok z listy</p>
        <p className="text-sm text-slate-400 mt-1">
          Kliknij na krok w spisie treści, aby zobaczyć szczegóły
        </p>
      </div>
    </div>
  );
}
