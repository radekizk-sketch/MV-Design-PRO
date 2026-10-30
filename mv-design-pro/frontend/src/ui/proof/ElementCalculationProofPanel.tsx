import { useEffect, useMemo, useState } from 'react';

import {
  fetchExtendedTrace,
  fetchShortCircuitResults,
} from '../results-inspector/api';
import type {
  ExtendedTrace,
  ShortCircuitResults,
  ShortCircuitRow,
  TraceStep,
} from '../results-inspector/types';
import { TRACE_VALUE_CODES, TRACE_VALUE_LABELS, TRACE_VALUE_UNITS } from '../results-inspector/types';
import { rozpakujWartoscSladu } from '../results-inspector/traceValue';
import { formatWStanie, useDostepnoscEksportuWywodu } from '../results/useDostepnoscEksportuWywodu';
import { MathRenderer } from './MathRenderer';
import { etykietaZeSlownika } from '../../ui2/wyniki/wzorzec/slownikWyliczen';

interface ProofSelectedElement {
  id: string;
  name?: string | null;
  type?: string | null;
}

interface ElementCalculationProofPanelProps {
  runId: string | null | undefined;
  selectedElement: ProofSelectedElement | null | undefined;
  candidateRefs?: string[];
  className?: string;
}

type LoadState =
  | { status: 'idle'; trace: null; shortCircuit: null; errors: string[] }
  | { status: 'loading'; trace: null; shortCircuit: null; errors: string[] }
  | { status: 'ready'; trace: ExtendedTrace | null; shortCircuit: ShortCircuitResults | null; errors: string[] }
  | { status: 'error'; trace: null; shortCircuit: null; errors: string[] };

const IDLE_STATE: LoadState = { status: 'idle', trace: null, shortCircuit: null, errors: [] };

// Etykiety i jednostki wielkości śladu: JEDEN słownik frontu (`TRACE_VALUE_LABELS` /
// `TRACE_VALUE_UNITS` w `results-inspector/types.ts`). Karta SC-IB-ITH-ZRODLA zdjęła stąd
// drugą kopię, która nazywała I_b „prądem wyłączeniowym" bez „symetryczny" i niosła klucze
// dawnego śladu (`ta_s`, `exp_factor`), których solver już nie produkuje.

const TRACE_INTERNAL_KEYS = new Set([
  'fault_node_id',
  'node_id',
  'target_id',
  'solver_ref',
  'element_id',
]);


function normalizeRef(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function addRefWithVariants(refs: Set<string>, value: unknown): void {
  const normalized = normalizeRef(value);
  if (!normalized) return;
  refs.add(normalized);

  for (const part of normalized.split(/[/#]/g)) {
    if (part.length > 1) refs.add(part);
  }
}

function buildSelectionRefSet(
  selectedElement: ProofSelectedElement | null | undefined,
  candidateRefs: string[] | undefined,
): Set<string> {
  const refs = new Set<string>();
  addRefWithVariants(refs, selectedElement?.id);
  addRefWithVariants(refs, selectedElement?.name);
  for (const ref of candidateRefs ?? []) {
    addRefWithVariants(refs, ref);
  }
  return refs;
}

function stepRefs(step: TraceStep): string[] {
  const refs: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) refs.push(value);
  };

  push(step.element_id);
  push(step.target_id);
  push(step.primary_element_ref);
  push(step.solver_ref);
  for (const ref of step.selection_refs ?? []) push(ref);
  for (const related of step.related_elements ?? []) push(related.element_ref);

  return refs;
}

function rowRefs(row: ShortCircuitRow): string[] {
  return [
    row.target_id,
    row.element_id ?? '',
    row.target_name ?? '',
  ].filter(Boolean);
}

function hasRefMatch(refSet: Set<string>, values: string[]): boolean {
  if (refSet.size === 0) return false;
  return values.some((value) => {
    const normalized = normalizeRef(value);
    if (!normalized) return false;
    if (refSet.has(normalized)) return true;
    return normalized
      .split(/[/#]/g)
      .some((part) => part.length > 1 && refSet.has(part));
  });
}

export function resolveTraceStepsForElement(
  trace: ExtendedTrace | null,
  selectedElement: ProofSelectedElement | null | undefined,
  candidateRefs?: string[],
): TraceStep[] {
  if (!trace || !selectedElement) return [];

  const refSet = buildSelectionRefSet(selectedElement, candidateRefs);
  const directMatches = trace.white_box_trace.filter((step) => hasRefMatch(refSet, stepRefs(step)));

  const indexedSteps: TraceStep[] = [];
  for (const ref of refSet) {
    const index = trace.selection_index?.[ref];
    if (typeof index === 'number' && trace.white_box_trace[index]) {
      indexedSteps.push(trace.white_box_trace[index]);
    }
  }

  const seen = new Set<TraceStep>();
  return [...indexedSteps, ...directMatches].filter((step) => {
    if (seen.has(step)) return false;
    seen.add(step);
    return true;
  });
}

export function resolveShortCircuitRowsForElement(
  shortCircuit: ShortCircuitResults | null,
  selectedElement: ProofSelectedElement | null | undefined,
  candidateRefs?: string[],
): ShortCircuitRow[] {
  if (!shortCircuit || !selectedElement) return [];
  const refSet = buildSelectionRefSet(selectedElement, candidateRefs);
  return shortCircuit.rows.filter((row) => hasRefMatch(refSet, rowRefs(row)));
}

function traceLabel(key: string): string {
  return etykietaZeSlownika(TRACE_VALUE_LABELS, key)
    .replace(/_/g, ' ')
    .replace(/\bohm\b/gi, 'Ω')
    .replace(/\bka\b/gi, 'kA')
    .replace(/\bmva\b/gi, 'MVA');
}

// Rozpakowanie surowej wartości kroku śladu WHITE BOX (skalar / {re,im} /
// opakowany TraceValue) jest WSPÓLNE dla całego frontu — patrz
// `results-inspector/traceValue.ts::rozpakujWartoscSladu` (KLASA NIE
// INSTANCJA, karta WB-2). Ten plik tylko formatuje wynik tej funkcji do
// LaTeX-a (formatowanie zostaje per ekran).

function complexParts(value: unknown): { re: number; im: number } | null {
  const { re, im } = rozpakujWartoscSladu(value);
  if (typeof re !== 'number' || typeof im !== 'number') return null;
  if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
  return { re, im };
}

function formatMathNumber(value: number): string {
  if (!Number.isFinite(value)) return '\\mathrm{nie\\ wyznaczono}';
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('pl-PL', { maximumFractionDigits: 2 }).replace(/\s/g, '\\,');
  }
  return value
    .toLocaleString('pl-PL', {
      maximumFractionDigits: Math.abs(value) < 1 ? 5 : 3,
    })
    .replace(',', '{,}');
}

function unitToLatex(unit: string | undefined, fallback = ''): string {
  const value = unit ?? fallback;
  if (!value) return '';
  return `\\,\\mathrm{${value.replace('Ω', '\\Omega')}}`;
}

function textToLatex(value: string): string {
  return `\\text{${value.replace(/[\\_#%&{}]/g, ' ')}}`;
}

/**
 * Rodzaj zwarcia kroku śladu po polsku — JEDNO źródło z ekranem wyników
 * (`TRACE_VALUE_CODES.short_circuit_type`: kody `ShortCircuitType` backendu „3F", „2F",
 * „2F+G", „1F"). Do tej poprawki osobna kopia znała „2FG" zamiast „2F+G", więc krok
 * zwarcia dwufazowego z ziemią pokazywał surowy kod.
 */
function faultTypeLabel(value: unknown): string {
  const { wartosc } = rozpakujWartoscSladu(value);
  const normalized = String(wartosc ?? '').trim().toUpperCase().replace(/^SC_?/, '');
  return TRACE_VALUE_CODES.short_circuit_type[normalized] ?? String(wartosc ?? 'nie podano');
}

function traceValueLatex(key: string, value: unknown): string | null {
  if (key === 'short_circuit_type') {
    return textToLatex(faultTypeLabel(value));
  }

  const complex = complexParts(value);
  if (complex) {
    const sign = complex.im < 0 ? '-' : '+';
    return [
      `${formatMathNumber(complex.re)} ${sign} j${formatMathNumber(Math.abs(complex.im))}`,
      unitToLatex(undefined, TRACE_VALUE_UNITS[key] ?? 'Ω'),
    ].join('');
  }

  const { wartosc, unit } = rozpakujWartoscSladu(value);
  const fallbackUnit = TRACE_VALUE_UNITS[key];
  if (wartosc === null) return '\\mathrm{nie\\ wyznaczono}';
  if (typeof wartosc === 'number') return `${formatMathNumber(wartosc)}${unitToLatex(unit, fallbackUnit)}`;
  if (typeof wartosc === 'boolean') return wartosc ? '\\mathrm{tak}' : '\\mathrm{nie}';
  const numeric = Number(wartosc);
  if (Number.isFinite(numeric) && wartosc.trim() !== '') {
    return `${formatMathNumber(numeric)}${unitToLatex(unit, fallbackUnit)}`;
  }
  return textToLatex(wartosc);
}

function shouldShowTraceValue(key: string, value: unknown): boolean {
  if (TRACE_INTERNAL_KEYS.has(key)) return false;
  return traceValueLatex(key, value) !== null;
}

function isEquivalentImpedanceStep(step: TraceStep): boolean {
  const title = `${step.title ?? ''} ${step.description ?? ''}`.toLowerCase();
  return title.includes('impedancja zast')
    || Boolean(step.result?.z_equiv_ohm)
    || Boolean(step.inputs?.z1_ohm);
}

function firstComplexValue(...values: unknown[]): { re: number; im: number } | null {
  for (const value of values) {
    const complex = complexParts(value);
    if (complex) return complex;
  }
  return null;
}

function firstNumberValue(...values: unknown[]): { value: number; unit?: string } | null {
  for (const item of values) {
    const { wartosc, unit } = rozpakujWartoscSladu(item);
    if (typeof wartosc === 'number' && Number.isFinite(wartosc)) {
      return { value: wartosc, unit };
    }
  }
  return null;
}

function complexLatex(value: { re: number; im: number }): string {
  const sign = value.im < 0 ? '-' : '+';
  return `${formatMathNumber(value.re)} ${sign} j${formatMathNumber(Math.abs(value.im))}${unitToLatex(undefined, 'Ω')}`;
}

function EquivalentImpedanceProof({ step }: { step: TraceStep }) {
  if (!isEquivalentImpedanceStep(step)) return null;

  const z1 = firstComplexValue(step.inputs?.z1_ohm);
  const zk = firstComplexValue(step.result?.z_equiv_ohm, step.inputs?.z_equiv_ohm, step.inputs?.z1_ohm);
  const zAbs = firstNumberValue(step.result?.z_equiv_abs_ohm, step.inputs?.z_equiv_abs_ohm);

  if (!z1 && !zk) return null;

  return (
    <div
      data-testid="equivalent-impedance-proof"
      className="space-y-2 rounded border border-[color:var(--mvd-info)] bg-[color:var(--mvd-info-bg)]/70 p-3"
    >
      <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-[color:var(--mvd-info)]">
        Wyprowadzenie impedancji zastępczej
      </div>
      <p className="text-[length:var(--mvd-font-size-data)] leading-5 text-[color:var(--mvd-ink)]">
        Dla zwarcia trójfazowego zgodnie z IEC 60909 impedancja widziana z punktu
        zwarcia jest impedancją składowej zgodnej. Poniżej pokazano zapis symboliczny
        oraz podstawienie wartości pobranych ze śladu obliczeń.
      </p>
      <FormulaBlock label="Zapis metody" latex="Z_k = Z_1 = R_1 + jX_1" />
      {z1 && (
        <FormulaBlock
          label="Podstawienie danych"
          latex={`Z_1 = ${complexLatex(z1)}`}
        />
      )}
      {zk && (
        <FormulaBlock
          label="Wynik impedancji zastępczej"
          latex={`Z_k = ${complexLatex(zk)}`}
        />
      )}
      {z1 && zAbs && (
        <>
          <FormulaBlock
            label="Moduł impedancji"
            latex="|Z_k| = \sqrt{R_1^2 + X_1^2}"
          />
          <FormulaBlock
            label="Podstawienie modułu"
            latex={`|Z_k| = \\sqrt{(${formatMathNumber(z1.re)})^2 + (${formatMathNumber(z1.im)})^2} = ${formatMathNumber(zAbs.value)}${unitToLatex(zAbs.unit, 'Ω')}`}
          />
        </>
      )}
    </div>
  );
}

function formatResultValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return 'nie wyznaczono';
  return `${value.toLocaleString('pl-PL', { maximumFractionDigits: 3 })} ${unit}`;
}

function traceStepTitle(step: TraceStep, index: number): string {
  return step.title || step.description || `Krok ${index + 1}`;
}

function TraceValuesTable({
  title,
  values,
}: {
  title: string;
  values: Record<string, unknown> | undefined;
}) {
  const rows = Object.entries(values ?? {}).filter(([key, value]) => shouldShowTraceValue(key, value));
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-[color:var(--mvd-muted)]">
        {title}
      </div>
      <table className="w-full border-collapse text-[length:var(--mvd-font-size-data)]">
        <tbody className="divide-y divide-[color:var(--mvd-line)]">
          {rows.map(([key, value]) => {
            const latex = traceValueLatex(key, value);
            return (
            <tr key={key}>
              <th className="w-1/2 py-1 pr-2 text-left font-medium text-[color:var(--mvd-muted)]">
                {traceLabel(key)}
              </th>
              <td className="py-1 text-right text-[color:var(--mvd-ink)]">
                {latex ? (
                  <MathRenderer latex={latex} className="text-[color:var(--mvd-ink)]" />
                ) : (
                  <span>nie wyznaczono</span>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FormulaBlock({ label, latex }: { label: string; latex: string | undefined }) {
  if (!latex) return null;
  return (
    <div className="space-y-1">
      <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-[color:var(--mvd-muted)]">
        {label}
      </div>
      <div className="overflow-x-auto rounded border border-[color:var(--mvd-line)] bg-[color:var(--mvd-surface)] px-2 py-2">
        <MathRenderer latex={latex} block className="text-[color:var(--mvd-ink)]" />
      </div>
    </div>
  );
}

function TraceStepCard({ step, index }: { step: TraceStep; index: number }) {
  return (
    <article
      data-testid="element-proof-trace-step"
      className="space-y-3 rounded border border-[color:var(--mvd-line)] bg-[color:var(--mvd-panel)] p-3"
    >
      <header className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--mvd-accent)] text-[length:var(--mvd-font-size-data)] font-semibold text-[color:var(--mvd-accent-ink)]">
          {index + 1}
        </span>
        <div>
          <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-[color:var(--mvd-ink)]">
            {traceStepTitle(step, index)}
          </div>
          {step.phase && (
            <div className="mt-0.5 text-[length:var(--mvd-font-size-data)] text-[color:var(--mvd-muted)]">
              {step.phase}
            </div>
          )}
        </div>
      </header>

      <EquivalentImpedanceProof step={step} />
      <FormulaBlock label="Wzór" latex={step.formula_latex} />
      <TraceValuesTable title="Dane wejściowe" values={step.inputs} />
      {/* Kontrakt pól kroku (karta DOWOD-CIEPLNY): LaTeX wyłącznie z
          `substitution_latex`; `substitution` jest prozą i idzie tekstem. */}
      <FormulaBlock label="Podstawienie" latex={step.substitution_latex} />
      {!step.substitution_latex && step.substitution && (
        <div className="space-y-1" data-testid="element-proof-substitution-text">
          <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-[color:var(--mvd-muted)]">
            Podstawienie
          </div>
          <p className="text-[length:var(--mvd-font-size-data)] text-[color:var(--mvd-ink)]">{step.substitution}</p>
        </div>
      )}
      <TraceValuesTable title="Wynik kroku" values={step.result} />

      {step.notes && (
        <div className="rounded border border-[color:var(--mvd-warn)] bg-[color:var(--mvd-warn-bg)] px-2 py-1.5 text-[length:var(--mvd-font-size-data)] text-[color:var(--mvd-warn-ink)]">
          {step.notes}
        </div>
      )}
    </article>
  );
}

function ShortCircuitRows({ rows }: { rows: ShortCircuitRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        data-testid="element-proof-no-short-circuit"
        className="rounded border border-[color:var(--mvd-warn)] bg-[color:var(--mvd-warn-bg)] px-3 py-2 text-[length:var(--mvd-font-size-data)] text-[color:var(--mvd-warn-ink)]"
      >
        Nie wyznaczono wyniku zwarciowego dla tego obiektu w aktywnym obliczeniu.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-[color:var(--mvd-line)]">
      <table className="min-w-full text-[length:var(--mvd-font-size-data)]" data-testid="element-proof-short-circuit-table">
        <thead className="bg-[color:var(--mvd-surface)] text-[color:var(--mvd-muted)]">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold">Punkt</th>
            <th className="px-2 py-1.5 text-left font-semibold">Typ</th>
            <th className="px-2 py-1.5 text-right font-semibold">Ik''</th>
            <th className="px-2 py-1.5 text-right font-semibold">ip</th>
            <th className="px-2 py-1.5 text-right font-semibold">Ith</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--mvd-line)] bg-[color:var(--mvd-panel)] text-[color:var(--mvd-ink)]">
          {rows.map((row) => (
            <tr key={`${row.target_id}:${row.fault_type ?? 'fault'}`}>
              <td className="px-2 py-1.5">
                {row.target_name || row.target_id}
              </td>
              <td className="px-2 py-1.5">
                {row.fault_type ?? 'zwarcie'}
              </td>
              <td className="px-2 py-1.5 text-right font-mono">
                {formatResultValue(row.ikss_ka, 'kA')}
              </td>
              <td className="px-2 py-1.5 text-right font-mono">
                {formatResultValue(row.ip_ka, 'kA')}
              </td>
              <td className="px-2 py-1.5 text-right font-mono">
                {formatResultValue(row.ith_ka, 'kA')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ElementCalculationProofPanel({
  runId,
  selectedElement,
  candidateRefs,
  className,
}: ElementCalculationProofPanelProps) {
  const [state, setState] = useState<LoadState>(IDLE_STATE);
  // Karta UI-02 PANEL-DOLNY: odnośnik do pełnego LaTeX tylko wtedy, gdy serwer potwierdza
  // eksport (brama liczona funkcją eksportu); inaczej nieaktywny opis z przyczyną.
  const eksportLatex = formatWStanie(useDostepnoscEksportuWywodu(runId), 'latex');

  useEffect(() => {
    if (!runId || !selectedElement) {
      setState(IDLE_STATE);
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', trace: null, shortCircuit: null, errors: [] });

    Promise.allSettled([
      fetchExtendedTrace(runId),
      fetchShortCircuitResults(runId),
    ]).then(([traceResult, shortCircuitResult]) => {
      if (cancelled) return;

      const errors: string[] = [];
      const trace = traceResult.status === 'fulfilled' ? traceResult.value : null;
      const shortCircuit = shortCircuitResult.status === 'fulfilled' ? shortCircuitResult.value : null;

      if (traceResult.status === 'rejected') {
        errors.push(traceResult.reason instanceof Error ? traceResult.reason.message : 'Nie pobrano śladu obliczeń.');
      }
      if (shortCircuitResult.status === 'rejected') {
        errors.push(shortCircuitResult.reason instanceof Error ? shortCircuitResult.reason.message : 'Nie pobrano wyników zwarciowych.');
      }

      if (!trace && !shortCircuit) {
        setState({ status: 'error', trace: null, shortCircuit: null, errors });
        return;
      }

      setState({ status: 'ready', trace, shortCircuit, errors });
    });

    return () => {
      cancelled = true;
    };
  }, [candidateRefs, runId, selectedElement]);

  const traceSteps = useMemo(
    () => resolveTraceStepsForElement(state.trace, selectedElement, candidateRefs),
    [candidateRefs, selectedElement, state.trace],
  );
  const shortCircuitRows = useMemo(
    () => resolveShortCircuitRowsForElement(state.shortCircuit, selectedElement, candidateRefs),
    [candidateRefs, selectedElement, state.shortCircuit],
  );

  return (
    <section
      data-testid="element-calculation-proof-panel"
      className={className ?? 'border-b border-[color:var(--mvd-line)] px-4 py-3'}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-[color:var(--mvd-info)]">
            Wywód obliczeń
          </div>
          <h4 className="text-sm font-semibold text-[color:var(--mvd-ink)]">
            {selectedElement ? selectedElement.name || selectedElement.id : 'Wybierz obiekt na SLD'}
          </h4>
        </div>
        {runId && eksportLatex.dostepny && (
          <a
            href={`/api/analysis-runs/${encodeURIComponent(runId)}/export/proof/latex`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded border border-[color:var(--mvd-line)] px-2 py-1 text-[length:var(--mvd-font-size-data)] font-semibold text-[color:var(--mvd-ink)] hover:bg-[color:var(--mvd-surface)]"
            data-testid="element-proof-latex-link"
          >
            Pełny LaTeX
          </a>
        )}
        {runId && !eksportLatex.dostepny && (
          <span
            className="shrink-0 cursor-not-allowed rounded border border-[color:var(--mvd-line)] px-2 py-1 text-[length:var(--mvd-font-size-data)] font-semibold text-[color:var(--mvd-muted)]"
            title={eksportLatex.powod_pl ?? undefined}
            aria-disabled="true"
            data-testid="element-proof-latex-niedostepny"
          >
            Pełny LaTeX
          </span>
        )}
      </div>

      {!runId ? (
        <div className="rounded border border-[color:var(--mvd-warn)] bg-[color:var(--mvd-warn-bg)] px-3 py-2 text-[length:var(--mvd-font-size-data)] text-[color:var(--mvd-warn-ink)]">
          Brak aktywnego obliczenia. Uruchom obliczenia, aby zobaczyć wywód dla elementu.
        </div>
      ) : !selectedElement ? (
        <div className="rounded border border-[color:var(--mvd-line)] bg-[color:var(--mvd-surface)] px-3 py-2 text-[length:var(--mvd-font-size-data)] text-[color:var(--mvd-muted)]">
          Kliknij węzeł, odcinek, stację, pole albo transformator na SLD.
        </div>
      ) : state.status === 'loading' ? (
        <div className="rounded border border-[color:var(--mvd-line)] bg-[color:var(--mvd-surface)] px-3 py-2 text-[length:var(--mvd-font-size-data)] text-[color:var(--mvd-muted)]">
          Pobieram wynik zwarciowy i ślad obliczeń dla zaznaczonego obiektu.
        </div>
      ) : state.status === 'error' ? (
        <div className="rounded border border-[color:var(--mvd-err)] bg-[color:var(--mvd-err-bg)] px-3 py-2 text-[length:var(--mvd-font-size-data)] text-[color:var(--mvd-err-ink)]">
          Nie udało się pobrać wywodu obliczeń: {state.errors.join(' ')}
        </div>
      ) : (
        <div className="space-y-3">
          {state.errors.length > 0 && (
            <div className="rounded border border-[color:var(--mvd-warn)] bg-[color:var(--mvd-warn-bg)] px-3 py-2 text-[length:var(--mvd-font-size-data)] text-[color:var(--mvd-warn-ink)]">
              {state.errors.join(' ')}
            </div>
          )}

          <ShortCircuitRows rows={shortCircuitRows} />

          {traceSteps.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-[color:var(--mvd-muted)]">
                Kroki wywodu obliczeniowego
              </div>
              {traceSteps.map((step, index) => (
                <TraceStepCard
                  key={`${step.key ?? step.step_id ?? index}:${index}`}
                  step={step}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <div
              data-testid="element-proof-no-trace"
              className="rounded border border-[color:var(--mvd-warn)] bg-[color:var(--mvd-warn-bg)] px-3 py-2 text-[length:var(--mvd-font-size-data)] text-[color:var(--mvd-warn-ink)]"
            >
              Ślad obliczeń jest dostępny, ale nie ma kroku bezpośrednio powiązanego
              z zaznaczonym obiektem. Otwórz pełny plik .tex albo wybierz węzeł
              wynikowy na SLD.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
