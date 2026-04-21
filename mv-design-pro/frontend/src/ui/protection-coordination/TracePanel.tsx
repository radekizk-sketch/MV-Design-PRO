/**
 * FIX-12B — Trace Panel Component
 *
 * Display WHITE BOX calculation trace for audit purposes.
 *
 * CANONICAL ALIGNMENT:
 * - 100% Polish labels
 * - READ-ONLY view of backend trace data
 * - Expandable/collapsible trace steps
 */

import { useState, useCallback } from 'react';
import type { TraceStep } from './types';
import { LABELS } from './types';

// =============================================================================
// Types
// =============================================================================

interface TracePanelProps {
  /** Trace steps from backend */
  traceSteps: TraceStep[];
  /** Run ID for reference */
  runId?: string;
  /** Created timestamp */
  createdAt?: string;
  /** Maximum height (scrollable) */
  maxHeight?: number;
}

interface TraceStepItemProps {
  step: TraceStep;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

// =============================================================================
// JSON Viewer Component
// =============================================================================

interface JsonViewerProps {
  data: Record<string, unknown>;
  label: string;
}

function JsonViewer({ data, label }: JsonViewerProps) {
  if (Object.keys(data).length === 0) {
    return null;
  }

  return (
    <div className="mt-2">
      <span className="text-xs font-medium text-slate-500">{label}:</span>
      <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

// =============================================================================
// Trace Step Item Component
// =============================================================================

function TraceStepItem({ step, index, isExpanded, onToggle }: TraceStepItemProps) {
  const labels = LABELS.trace;
  const hasDetails = Object.keys(step.inputs).length > 0 || Object.keys(step.outputs).length > 0;

  return (
    <div
      className={`rounded border transition-colors ${
        isExpanded ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200'
      }`}
      data-testid={`trace-step-${index}`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between p-3 text-left"
        disabled={!hasDetails}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
              Krok {index + 1}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {step.description_pl}
          </p>
        </div>
        {hasDetails && (
          <svg
            className={`ml-2 h-5 w-5 flex-shrink-0 text-slate-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </button>

      {/* Details (collapsed by default) */}
      {isExpanded && hasDetails && (
        <div className="border-t border-slate-200 px-3 pb-3">
          <JsonViewer data={step.inputs} label={labels.inputs} />
          <JsonViewer data={step.outputs} label={labels.outputs} />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Trace Panel Component
// =============================================================================

export function TracePanel({
  traceSteps,
  runId,
  createdAt,
  maxHeight = 600,
}: TracePanelProps) {
  const labels = LABELS.trace;

  // Track expanded steps
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  // Toggle single step
  const toggleStep = useCallback((index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Expand all steps
  const expandAll = useCallback(() => {
    setExpandedSteps(new Set(traceSteps.map((_, i) => i)));
  }, [traceSteps]);

  // Collapse all steps
  const collapseAll = useCallback(() => {
    setExpandedSteps(new Set());
  }, []);

  // Empty state
  if (traceSteps.length === 0) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-white p-8 text-center"
        data-testid="trace-panel-empty"
      >
        <svg
          className="mx-auto h-12 w-12 text-slate-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <p className="mt-2 text-slate-500">{labels.noSteps}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white" data-testid="trace-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="font-semibold text-slate-900">{labels.title}</h3>
          <p className="text-sm text-slate-500">{labels.subtitle}</p>
          {(runId || createdAt) && (
            <div className="mt-1 flex gap-3 text-xs text-slate-400">
              {runId && <span>Run: {runId.slice(0, 8)}...</span>}
              {createdAt && (
                <span>
                  {labels.timestamp}: {new Date(createdAt).toLocaleString('pl-PL')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            {labels.expandAll}
          </button>
          <button
            onClick={collapseAll}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            {labels.collapseAll}
          </button>
        </div>
      </div>

      {/* Steps list */}
      <div
        className="space-y-2 overflow-y-auto p-4"
        style={{ maxHeight }}
      >
        {traceSteps.map((step, index) => (
          <TraceStepItem
            key={index}
            step={step}
            index={index}
            isExpanded={expandedSteps.has(index)}
            onToggle={() => toggleStep(index)}
          />
        ))}
      </div>

      {/* Footer with step count */}
      <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        {traceSteps.length} {traceSteps.length === 1 ? 'krok' : 'kroków'} obliczeniowych
      </div>
    </div>
  );
}
