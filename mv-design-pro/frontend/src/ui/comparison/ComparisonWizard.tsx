/**
 * ComparisonWizard — kreator porównania A/B dwóch przebiegów obliczeniowych (Etap 18 z planu).
 *
 * Krok 1: wybór przebiegu A (z dropdown z dostępnych przebiegów)
 * Krok 2: wybór przebiegu B (musi być różny od A, ten sam typ)
 * Krok 3: wybór typu porównania (PF / SC / Voltage Profile / Protection)
 * Krok 4: view results — delta visualization na SLD + side-by-side tables
 *
 * Norma: PN-EN 50341 — porównywalność warunków pracy sieci.
 */

import { useState } from 'react';

export type ComparisonRunType = 'power_flow' | 'short_circuit' | 'voltage_profile' | 'protection';

export interface ComparisonRun {
  id: string;
  label: string;
  runType: ComparisonRunType;
  timestamp: string;
  caseRef: string;
}

interface ComparisonWizardProps {
  availableRuns: ComparisonRun[];
  initialRunAId?: string;
  initialRunBId?: string;
  onConfirm: (runA: ComparisonRun, runB: ComparisonRun, comparisonType: ComparisonRunType) => void;
  onCancel: () => void;
}

type Step = 'run_a' | 'run_b' | 'type' | 'review';

const STEP_LABELS: Record<Step, string> = {
  run_a: 'Wybierz przebieg A',
  run_b: 'Wybierz przebieg B',
  type: 'Typ porównania',
  review: 'Podsumowanie',
};

const TYPE_LABELS: Record<ComparisonRunType, string> = {
  power_flow: 'Rozpływ mocy (PF)',
  short_circuit: 'Zwarcie (SC)',
  voltage_profile: 'Profil napięć',
  protection: 'Zabezpieczenia',
};

export function ComparisonWizard({
  availableRuns,
  initialRunAId,
  initialRunBId,
  onConfirm,
  onCancel,
}: ComparisonWizardProps) {
  const [step, setStep] = useState<Step>('run_a');
  const [runAId, setRunAId] = useState<string | null>(initialRunAId ?? null);
  const [runBId, setRunBId] = useState<string | null>(initialRunBId ?? null);
  const [comparisonType, setComparisonType] = useState<ComparisonRunType | null>(null);

  const runA = availableRuns.find((r) => r.id === runAId) ?? null;
  const runB = availableRuns.find((r) => r.id === runBId) ?? null;

  const runsAvailableForB = availableRuns.filter((r) => r.id !== runAId);
  const typesAvailable = runA
    ? Array.from(new Set([runA.runType, ...(runB ? [runB.runType] : [])]))
    : [];

  const canProceed = (): boolean => {
    switch (step) {
      case 'run_a':
        return runAId !== null;
      case 'run_b':
        return runBId !== null && runBId !== runAId;
      case 'type':
        return comparisonType !== null;
      case 'review':
        return true;
    }
  };

  const nextStep = () => {
    if (!canProceed()) return;
    const order: Step[] = ['run_a', 'run_b', 'type', 'review'];
    const i = order.indexOf(step);
    if (i < order.length - 1) setStep(order[i + 1]);
  };

  const prevStep = () => {
    const order: Step[] = ['run_a', 'run_b', 'type', 'review'];
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1]);
  };

  const handleConfirm = () => {
    if (runA && runB && comparisonType) {
      onConfirm(runA, runB, comparisonType);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-wizard-title"
      className="flex flex-col gap-4 rounded-lg bg-white p-6 shadow-xl"
      data-testid="comparison-wizard"
    >
      <h2 id="comparison-wizard-title" className="text-lg font-semibold text-slate-900">
        Porównaj przebiegi (A vs B)
      </h2>

      <ol className="flex gap-2 text-xs text-slate-500">
        {(['run_a', 'run_b', 'type', 'review'] as Step[]).map((s, i) => (
          <li
            key={s}
            className={`rounded px-2 py-1 ${s === step ? 'bg-amber-500 text-slate-950 font-semibold' : 'bg-slate-100'}`}
            data-testid={`step-${s}${s === step ? '-active' : ''}`}
          >
            {i + 1}. {STEP_LABELS[s]}
          </li>
        ))}
      </ol>

      {step === 'run_a' && (
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Przebieg referencyjny (A)
            <select
              value={runAId ?? ''}
              onChange={(e) => setRunAId(e.target.value || null)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
              data-testid="run-a-select"
              title="Przebieg który posłuży jako baza porównania"
            >
              <option value="">— wybierz —</option>
              {availableRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.label} ({TYPE_LABELS[run.runType]}) · {formatRunDate(run.timestamp)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {step === 'run_b' && (
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Przebieg porównywany (B)
            <select
              value={runBId ?? ''}
              onChange={(e) => setRunBId(e.target.value || null)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
              data-testid="run-b-select"
              title="Przebieg do porównania z przebiegiem referencyjnym"
            >
              <option value="">— wybierz —</option>
              {runsAvailableForB.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.label} ({TYPE_LABELS[run.runType]}) · {formatRunDate(run.timestamp)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {step === 'type' && (
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Typ porównania
            <select
              value={comparisonType ?? ''}
              onChange={(e) => setComparisonType(e.target.value as ComparisonRunType)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
              data-testid="comparison-type-select"
              title="Wybierz aspekt do porównania"
            >
              <option value="">— wybierz —</option>
              {typesAvailable.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {step === 'review' && runA && runB && comparisonType && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="rounded border border-slate-200 p-3" data-testid="review-run-a">
            <div className="font-semibold text-slate-700">Przebieg A</div>
            <div>{runA.label}</div>
            <div className="text-xs text-slate-500">{formatRunDate(runA.timestamp)}</div>
          </div>
          <div className="rounded border border-slate-200 p-3" data-testid="review-run-b">
            <div className="font-semibold text-slate-700">Przebieg B</div>
            <div>{runB.label}</div>
            <div className="text-xs text-slate-500">{formatRunDate(runB.timestamp)}</div>
          </div>
          <div className="col-span-2 rounded bg-slate-100 p-2">
            Typ porównania: <strong>{TYPE_LABELS[comparisonType]}</strong>
          </div>
        </div>
      )}

      <div className="mt-2 flex justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          data-testid="comparison-cancel"
        >
          Anuluj
        </button>
        <div className="flex gap-2">
          {step !== 'run_a' && (
            <button
              type="button"
              onClick={prevStep}
              className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
              data-testid="comparison-prev"
            >
              ← Wstecz
            </button>
          )}
          {step !== 'review' ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={!canProceed()}
              className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              data-testid="comparison-next"
            >
              Dalej →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
              data-testid="comparison-confirm"
            >
              Porównaj
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRunDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
