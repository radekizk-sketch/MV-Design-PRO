/**
 * ProtectionRunButton — P0.2 FE "Uruchom Protection" button.
 *
 * Per P0.2 DoD: "FE: „Uruchom Protection" działa".
 *
 * Pure component button który po kliknięciu wywołuje
 * POST /api/projects/{project_id}/protection-runs
 * + POST /api/protection-runs/{run_id}/execute.
 *
 * Wymaga aktywnego SC run (sc_run_id z poprzedniego SC_3F/SC_1F analysis)
 * + protection_case_id (z study_case.protection_config).
 *
 * INVARIANTS:
 * - Pure presentational (state in, JSX out)
 * - NO physics, NO direct ENM mutation
 * - Polish etykiety per V12K
 * - Disabled when nie ma sc_run_id
 *
 * Reference: backend/src/api/protection_runs.py
 */

import { useState } from 'react';

export type ProtectionRunStatus =
  | 'idle'
  | 'creating'
  | 'executing'
  | 'done'
  | 'error';

export interface ProtectionRunButtonProps {
  /** ID projektu (z aktywnego study case). */
  readonly projectId: string | null;
  /** ID poprzedniego SC analysis run (wymagany do protection). */
  readonly scRunId: string | null;
  /** ID protection case z study_case.protection_config (UUID). */
  readonly protectionCaseId: string | null;
  /** Callback gdy run done. */
  readonly onRunComplete?: (protectionRunId: string) => void;
  /** Opcjonalny className. */
  readonly className?: string;
}

/**
 * Button "Uruchom Protection" — pełen flow tworzenia + execute.
 */
export function ProtectionRunButton({
  projectId,
  scRunId,
  protectionCaseId,
  onRunComplete,
  className,
}: ProtectionRunButtonProps): JSX.Element {
  const [status, setStatus] = useState<ProtectionRunStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const disabled =
    !projectId ||
    !scRunId ||
    !protectionCaseId ||
    status === 'creating' ||
    status === 'executing';

  let tooltip = 'Uruchom obliczenie zabezpieczeń (IEC 60255 IDMT)';
  if (!projectId) tooltip = 'Wymaga aktywnego projektu';
  else if (!scRunId) tooltip = 'Wymaga wykonanego obliczenia zwarciowego (SC)';
  else if (!protectionCaseId) tooltip = 'Wymaga konfiguracji protection_case w wariancie';

  let label = 'Uruchom Protection';
  if (status === 'creating') label = 'Tworzenie...';
  else if (status === 'executing') label = 'Obliczanie...';
  else if (status === 'done') label = 'Gotowe ✓';
  else if (status === 'error') label = 'Błąd';

  const handleClick = async (): Promise<void> => {
    if (disabled || !projectId || !scRunId || !protectionCaseId) return;
    setErrorMsg(null);
    setStatus('creating');
    try {
      // 1. Create protection run
      const createRes = await fetch(
        `/api/projects/${projectId}/protection-runs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sc_run_id: scRunId,
            protection_case_id: protectionCaseId,
          }),
        },
      );
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(
          typeof err.detail === 'string'
            ? err.detail
            : `Błąd tworzenia: HTTP ${createRes.status}`,
        );
      }
      const runJson = await createRes.json();
      const protectionRunId = runJson.id as string;

      // 2. Execute run
      setStatus('executing');
      const execRes = await fetch(
        `/api/protection-runs/${protectionRunId}/execute`,
        { method: 'POST' },
      );
      if (!execRes.ok) {
        throw new Error(`Błąd wykonania: HTTP ${execRes.status}`);
      }
      const execJson = await execRes.json();
      if (execJson.status !== 'DONE') {
        throw new Error(
          execJson.error_message ?? `Status: ${execJson.status}`,
        );
      }

      setStatus('done');
      onRunComplete?.(protectionRunId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  return (
    <div className={['flex flex-col gap-1', className ?? ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled}
        title={tooltip}
        aria-label={label}
        data-testid="protection-run-button"
        className={[
          'flex h-9 items-center justify-center gap-2 rounded px-3 font-mono-eng text-[12px] font-semibold transition-colors',
          disabled
            ? 'cursor-not-allowed border border-scada-border bg-scada-surface text-scada-muted opacity-60'
            : status === 'done'
              ? 'border border-emerald-500/60 bg-emerald-500/20 text-emerald-200'
              : status === 'error'
                ? 'border border-red-500/60 bg-red-500/20 text-red-200'
                : 'border border-cyan-500/60 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25',
        ].join(' ')}
      >
        {label}
      </button>
      {errorMsg && (
        <span
          data-testid="protection-run-error"
          className="text-[10px] text-red-300"
          role="alert"
        >
          {errorMsg}
        </span>
      )}
    </div>
  );
}
