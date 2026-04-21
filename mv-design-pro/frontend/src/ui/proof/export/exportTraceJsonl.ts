/**
 * Export Trace to JSONL — Eksport śladu obliczeń do formatu JSONL
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: Export deterministyczny, read-only
 * - SYSTEM_SPEC.md: Audit trail export
 *
 * BINDING:
 * - Eksport JSONL nie modyfikuje stanu UI (pure function)
 * - Każda linia = jeden krok w formacie JSON
 * - Nazwa pliku: trace_<run_id>_<timestamp>.jsonl
 *
 * NOTE: Nazwy kodowe NIGDY nie są używane w eksporcie.
 */

import type { ExtendedTrace, TraceStep } from '../../results-inspector/types';

// =============================================================================
// Types
// =============================================================================

/**
 * JSONL line format for a single trace step.
 * Each line is a complete JSON object.
 */
export interface TraceJsonlLine {
  /** Line type marker */
  type: 'header' | 'step';
  /** Line sequence number (1-based) */
  seq: number;
  /** Timestamp of export */
  exported_at: string;
  /** Payload data */
  data: TraceJsonlHeader | TraceJsonlStep;
}

/**
 * Header line data (first line of JSONL).
 */
export interface TraceJsonlHeader {
  run_id: string;
  snapshot_id: string | null;
  input_hash: string;
  total_steps: number;
  catalog_context_count: number;
  catalog_context: ExtendedTrace['catalog_context'];
  catalog_context_by_element?: ExtendedTrace['catalog_context_by_element'];
  catalog_context_summary?: ExtendedTrace['catalog_context_summary'];
  export_version: string;
}

/**
 * Step line data.
 */
export interface TraceJsonlStep {
  step_index: number;
  step_number: number | null;
  key: string | null;
  title: string | null;
  phase: string | null;
  element_id: string | null;
  target_id: string | null;
  solver_ref: string | null;
  catalog_binding: TraceStep['catalog_binding'] | null;
  source_catalog: TraceStep['source_catalog'] | null;
  source_catalog_label: string | null;
  parameter_origin: string | null;
  parameter_source: string | null;
  formula_latex: string | null;
  inputs: Record<string, unknown> | null;
  substitution: string | null;
  result: Record<string, unknown> | null;
  materialized_params: Record<string, unknown> | null;
  manual_overrides: Array<Record<string, unknown>> | null;
  manual_override_count: number | null;
  notes: string | null;
}

// =============================================================================
// Export Version
// =============================================================================

const EXPORT_VERSION = '1.0.0';

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Convert trace step to JSONL step format.
 */
function stepToJsonlData(step: TraceStep, index: number): TraceJsonlStep {
  return {
    step_index: index,
    step_number: step.step ?? null,
    key: step.key ?? step.step_id ?? null,
    title: step.title ?? step.description ?? null,
    phase: step.phase ?? null,
    element_id: step.element_id ?? step.catalog_context_entry?.element_id ?? null,
    target_id: step.target_id ?? null,
    solver_ref: step.solver_ref ?? null,
    catalog_binding: step.catalog_binding ?? step.catalog_context_entry?.catalog_binding ?? null,
    source_catalog: step.source_catalog ?? step.catalog_context_entry?.source_catalog ?? null,
    source_catalog_label: step.source_catalog_label ?? step.catalog_context_entry?.source_catalog_label ?? null,
    parameter_origin: step.parameter_origin ?? step.catalog_context_entry?.parameter_origin ?? null,
    parameter_source: step.parameter_source ?? step.catalog_context_entry?.parameter_source ?? null,
    formula_latex: step.formula_latex ?? null,
    inputs: step.inputs ?? null,
    substitution: step.substitution ?? null,
    result: step.result ?? null,
    materialized_params: step.materialized_params ?? step.catalog_context_entry?.materialized_params ?? null,
    manual_overrides: step.manual_overrides ?? step.catalog_context_entry?.manual_overrides ?? null,
    manual_override_count:
      step.manual_override_count
      ?? step.catalog_context_entry?.manual_override_count
      ?? ((step.manual_overrides ?? step.catalog_context_entry?.manual_overrides)?.length ?? null),
    notes: step.notes ?? null,
  };
}

/**
 * Generate JSONL content from trace.
 * Each line is a complete JSON object.
 *
 * @param trace - Extended trace data
 * @returns JSONL string (newline-separated JSON objects)
 */
export function generateTraceJsonl(trace: ExtendedTrace): string {
  const exportedAt = new Date().toISOString();
  const lines: string[] = [];

  // Header line (seq=1)
  const headerLine: TraceJsonlLine = {
    type: 'header',
    seq: 1,
    exported_at: exportedAt,
    data: {
      run_id: trace.run_id,
      snapshot_id: trace.snapshot_id,
      input_hash: trace.input_hash,
      total_steps: trace.white_box_trace.length,
      catalog_context_count: trace.catalog_context.length,
      catalog_context: trace.catalog_context,
      catalog_context_by_element: trace.catalog_context_by_element,
      catalog_context_summary: trace.catalog_context_summary,
      export_version: EXPORT_VERSION,
    },
  };
  lines.push(JSON.stringify(headerLine));

  // Step lines (seq=2, 3, ...)
  trace.white_box_trace.forEach((step, index) => {
    const stepLine: TraceJsonlLine = {
      type: 'step',
      seq: index + 2, // Header is seq=1
      exported_at: exportedAt,
      data: stepToJsonlData(step, index),
    };
    lines.push(JSON.stringify(stepLine));
  });

  return lines.join('\n');
}

/**
 * Generate filename for JSONL export.
 *
 * @param trace - Extended trace data
 * @returns Filename string
 */
export function generateJsonlFilename(trace: ExtendedTrace): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runIdShort = trace.run_id.slice(0, 8);
  return `slad_obliczen_${runIdShort}_${timestamp}.jsonl`;
}

/**
 * Download trace as JSONL file.
 * Pure function - does not modify UI state.
 *
 * @param trace - Extended trace data
 */
export function downloadTraceJsonl(trace: ExtendedTrace): void {
  const content = generateTraceJsonl(trace);
  const filename = generateJsonlFilename(trace);

  const blob = new Blob([content], { type: 'application/x-ndjson;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
