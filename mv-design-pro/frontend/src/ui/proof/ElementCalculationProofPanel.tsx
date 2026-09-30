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
import { rozpakujWartoscSladu } from '../results-inspector/traceValue';
import { MathRenderer } from './MathRenderer';

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

const TRACE_LABELS_PL: Record<string, string> = {
  c_factor: 'Współczynnik napięciowy c',
  exp_factor: 'Czynnik zaniku składowej nieokresowej',
  ib_a: 'Prąd wyłączeniowy Ib',
  ikss_a: 'Prąd początkowy symetryczny',
  ip_a: 'Prąd udarowy ip',
  ith_a: 'Prąd zastępczy cieplny Ith',
  kappa: 'Współczynnik udaru κ',
  r_ohm: 'Rezystancja zastępcza R',
  rx_ratio: 'Stosunek R/X',
  short_circuit_type: 'Rodzaj zwarcia',
  sk_mva: 'Moc zwarciowa',
  ta_s: 'Stała czasowa zaniku',
  tb_s: 'Czas wyłączenia',
  tk_s: 'Czas cieplny',
  un_v: 'Napięcie znamionowe',
  voltage_factor: 'Współczynnik przejścia fazowego',
  x_ohm: 'Reaktancja zastępcza X',
  z1_ohm: 'Impedancja składowej zgodnej Z₁',
  z2_ohm: 'Impedancja składowej przeciwnej Z₂',
  z0_ohm: 'Impedancja składowej zerowej Z₀',
  z_equiv_abs_ohm: 'Moduł impedancji zastępczej |Zₖ|',
  z_equiv_ohm: 'Impedancja zastępcza Zₖ',
};

const TRACE_INTERNAL_KEYS = new Set([
  'fault_node_id',
  'node_id',
  'target_id',
  'solver_ref',
  'element_id',
]);

const TRACE_UNIT_FALLBACKS: Record<string, string> = {
  ib_a: 'A',
  ikss_a: 'A',
  ip_a: 'A',
  ith_a: 'A',
  r_ohm: 'Ω',
  sk_mva: 'MVA',
  ta_s: 's',
  tb_s: 's',
  tk_s: 's',
  un_v: 'V',
  x_ohm: 'Ω',
  z_equiv_abs_ohm: 'Ω',
};

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
  return TRACE_LABELS_PL[key] ?? key
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

function faultTypeLabel(value: unknown): string {
  const { wartosc } = rozpakujWartoscSladu(value);
  const normalized = String(wartosc ?? '').toUpperCase();
  if (normalized === '3F' || normalized === 'SC3F') return 'zwarcie trójfazowe';
  if (normalized === '1F' || normalized === 'SC1F') return 'zwarcie jednofazowe doziemne';
  if (normalized === '2F' || normalized === 'SC2F') return 'zwarcie dwufazowe';
  if (normalized === '2FG' || normalized === 'SC2FG') return 'zwarcie dwufazowe doziemne';
  return String(wartosc ?? 'nie podano');
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
      unitToLatex(undefined, TRACE_UNIT_FALLBACKS[key] ?? 'Ω'),
    ].join('');
  }

  const { wartosc, unit } = rozpakujWartoscSladu(value);
  const fallbackUnit = TRACE_UNIT_FALLBACKS[key];
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
      className="space-y-2 rounded border border-blue-200 bg-blue-50/70 p-3"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700">
        Wyprowadzenie impedancji zastępczej
      </div>
      <p className="text-[11px] leading-5 text-slate-700">
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
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </div>
      <table className="w-full border-collapse text-[11px]">
        <tbody className="divide-y divide-slate-200">
          {rows.map(([key, value]) => {
            const latex = traceValueLatex(key, value);
            return (
            <tr key={key}>
              <th className="w-1/2 py-1 pr-2 text-left font-medium text-slate-500">
                {traceLabel(key)}
              </th>
              <td className="py-1 text-right text-slate-800">
                {latex ? (
                  <MathRenderer latex={latex} className="text-slate-900" />
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
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="overflow-x-auto rounded border border-slate-200 bg-slate-50 px-2 py-2">
        <MathRenderer latex={latex} block className="text-slate-900" />
      </div>
    </div>
  );
}

function TraceStepCard({ step, index }: { step: TraceStep; index: number }) {
  return (
    <article
      data-testid="element-proof-trace-step"
      className="space-y-3 rounded border border-slate-200 bg-white p-3"
    >
      <header className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
          {index + 1}
        </span>
        <div>
          <div className="text-xs font-semibold text-slate-900">
            {traceStepTitle(step, index)}
          </div>
          {step.phase && (
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-500">
              {step.phase}
            </div>
          )}
        </div>
      </header>

      <EquivalentImpedanceProof step={step} />
      <FormulaBlock label="Wzór" latex={step.formula_latex} />
      <TraceValuesTable title="Dane wejściowe" values={step.inputs} />
      <FormulaBlock label="Podstawienie" latex={step.substitution} />
      <TraceValuesTable title="Wynik kroku" values={step.result} />

      {step.notes && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
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
        className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
      >
        Nie wyznaczono wyniku zwarciowego dla tego obiektu w aktywnym obliczeniu.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="min-w-full text-[11px]" data-testid="element-proof-short-circuit-table">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold">Punkt</th>
            <th className="px-2 py-1.5 text-left font-semibold">Typ</th>
            <th className="px-2 py-1.5 text-right font-semibold">Ik''</th>
            <th className="px-2 py-1.5 text-right font-semibold">ip</th>
            <th className="px-2 py-1.5 text-right font-semibold">Ith</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white text-slate-800">
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
      className={className ?? 'border-b border-gray-200 bg-white px-4 py-3'}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">
            Wywód obliczeń
          </div>
          <h4 className="text-sm font-semibold text-slate-900">
            {selectedElement ? selectedElement.name || selectedElement.id : 'Wybierz obiekt na SLD'}
          </h4>
        </div>
        {runId && (
          <a
            href={`/api/analysis-runs/${runId}/export/proof/latex`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Pełny LaTeX
          </a>
        )}
      </div>

      {!runId ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Brak aktywnego obliczenia. Uruchom obliczenia, aby zobaczyć wywód dla elementu.
        </div>
      ) : !selectedElement ? (
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Kliknij węzeł, odcinek, stację, pole albo transformator na SLD.
        </div>
      ) : state.status === 'loading' ? (
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Pobieram wynik zwarciowy i ślad obliczeń dla zaznaczonego obiektu.
        </div>
      ) : state.status === 'error' ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          Nie udało się pobrać wywodu obliczeń: {state.errors.join(' ')}
        </div>
      ) : (
        <div className="space-y-3">
          {state.errors.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
              {state.errors.join(' ')}
            </div>
          )}

          <ShortCircuitRows rows={shortCircuitRows} />

          {traceSteps.length > 0 ? (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
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
              className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
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
