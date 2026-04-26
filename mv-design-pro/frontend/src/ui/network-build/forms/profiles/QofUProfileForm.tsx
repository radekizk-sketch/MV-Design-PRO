/**
 * QofUProfileForm — edytor charakterystyki Q(U) (Pakiet D).
 *
 * UI: tabela punktów (U_pu, Q_mvar) + przyciski +/− + walidacja monotoniczności.
 * White box: formularz ma własną kopię draftową; commit przez `onSubmit(profile)`.
 *
 * INVARIANTS (D2 — catalog-first):
 * - Można wybrać profil z katalogu (TypePicker → catalog_ref) — wtedy punkty read-only
 * - Można edytować inline (gdy brak catalog_ref) — walidacja monotoniczności u_pu
 */

import { useCallback, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import {
  validateMonotonic,
  validateRange,
} from './profileSerializers';
import type { QofUPoint, QofUProfile } from './profileTypes';

export interface QofUProfileFormProps {
  /** Initial profile (edycja) lub undefined (nowy) */
  initial?: QofUProfile;
  /** Callback po commit; otrzymuje walidowany profil */
  onSubmit: (profile: QofUProfile) => void;
  /** Callback Anuluj */
  onCancel?: () => void;
}

const DEFAULT_POINTS: ReadonlyArray<QofUPoint> = Object.freeze([
  { u_pu: 0.95, q_mvar: -0.5 },
  { u_pu: 1.0, q_mvar: 0 },
  { u_pu: 1.05, q_mvar: 0.5 },
]);

export function QofUProfileForm({ initial, onSubmit, onCancel }: QofUProfileFormProps) {
  const [points, setPoints] = useState<QofUPoint[]>(() => {
    if (initial && initial.points.length > 0) return initial.points.map((p) => ({ ...p }));
    return DEFAULT_POINTS.map((p) => ({ ...p }));
  });
  const [hysteresis, setHysteresis] = useState<number>(initial?.hysteresis_pu ?? 0);
  const [catalogRef] = useState<string | undefined>(initial?.catalog_ref);

  const monotonicError = useMemo(
    () => validateMonotonic(points, 'u_pu', 'asc'),
    [points],
  );
  const rangeError = useMemo(
    () => validateRange(points, 'u_pu', 0.5, 1.5),
    [points],
  );
  const validationError = monotonicError ?? rangeError;
  const canSubmit = validationError === null && points.length >= 2;

  const updatePoint = useCallback((idx: number, field: keyof QofUPoint, value: number) => {
    setPoints((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  }, []);

  const addPoint = useCallback(() => {
    setPoints((prev) => {
      const last = prev[prev.length - 1];
      const next = last ? { u_pu: last.u_pu + 0.05, q_mvar: last.q_mvar } : { u_pu: 1.0, q_mvar: 0 };
      return [...prev, next];
    });
  }, []);

  const removePoint = useCallback((idx: number) => {
    setPoints((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const profile: QofUProfile = {
      kind: 'qu',
      points: points.map((p) => ({ ...p })),
      hysteresis_pu: hysteresis !== 0 ? hysteresis : undefined,
      catalog_ref: catalogRef,
    };
    onSubmit(profile);
  }, [canSubmit, points, hysteresis, catalogRef, onSubmit]);

  return (
    <form
      data-testid="qu-profile-form"
      className="flex flex-col gap-3 p-3 bg-scada-surface text-scada-text"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <h3 className="text-sm font-semibold">Profil Q(U) — regulacja mocy biernej</h3>

      {catalogRef && (
        <p className="text-xs text-scada-muted" data-testid="qu-catalog-ref">
          Profil z katalogu: <code>{catalogRef}</code> (read-only)
        </p>
      )}

      <table className="w-full text-xs" data-testid="qu-points-table">
        <thead>
          <tr className="text-scada-muted">
            <th className="text-left">U [pu]</th>
            <th className="text-left">Q [Mvar]</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {points.map((p, idx) => (
            <tr key={idx} data-testid={`qu-row-${idx}`}>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={p.u_pu}
                  disabled={catalogRef !== undefined}
                  onChange={(e) => updatePoint(idx, 'u_pu', Number(e.target.value))}
                  className="w-20 bg-scada-bg px-1 border border-scada-border"
                  data-testid={`qu-u-${idx}`}
                />
              </td>
              <td>
                <input
                  type="number"
                  step="0.01"
                  value={p.q_mvar}
                  disabled={catalogRef !== undefined}
                  onChange={(e) => updatePoint(idx, 'q_mvar', Number(e.target.value))}
                  className="w-20 bg-scada-bg px-1 border border-scada-border"
                  data-testid={`qu-q-${idx}`}
                />
              </td>
              <td>
                <button
                  type="button"
                  disabled={catalogRef !== undefined || points.length <= 2}
                  onClick={() => removePoint(idx)}
                  className="text-scada-muted hover:text-scada-text px-1"
                  data-testid={`qu-remove-${idx}`}
                  aria-label={`Usuń punkt ${idx + 1}`}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex gap-2 items-center">
        <button
          type="button"
          disabled={catalogRef !== undefined}
          onClick={addPoint}
          className="text-xs px-2 py-0.5 border border-scada-border hover:bg-scada-hover-nav"
          data-testid="qu-add-point"
        >
          + Dodaj punkt
        </button>

        <label className="text-xs flex items-center gap-1 ml-auto">
          Histereza [pu]:
          <input
            type="number"
            step="0.001"
            value={hysteresis}
            disabled={catalogRef !== undefined}
            onChange={(e) => setHysteresis(Number(e.target.value))}
            className="w-16 bg-scada-bg px-1 border border-scada-border"
            data-testid="qu-hysteresis"
          />
        </label>
      </div>

      {validationError && (
        <p
          className="text-xs text-red-400 border border-red-400/30 px-2 py-1 rounded"
          data-testid="qu-validation-error"
        >
          {validationError}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1 border border-scada-border hover:bg-scada-hover-nav"
            data-testid="qu-cancel"
          >
            Anuluj
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className={clsx(
            'text-xs px-3 py-1 border',
            canSubmit
              ? 'bg-scada-active border-scada-active text-scada-sn'
              : 'border-scada-border text-scada-muted cursor-not-allowed',
          )}
          data-testid="qu-submit"
        >
          Zapisz profil
        </button>
      </div>
    </form>
  );
}
