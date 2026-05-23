/**
 * CosPhiOfPProfileForm — edytor charakterystyki cos φ(P) (Pakiet D).
 *
 * UI: tabela punktów (P_pu, cos φ) + walidacja monotoniczności P + zakres cos φ ∈ [-1, 1].
 */

import { useCallback, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { validateMonotonic, validateRange } from './profileSerializers';
import type { CosPhiOfPPoint, CosPhiOfPProfile } from './profileTypes';
import { ProfileCurveEditor, type CurvePoint } from './ProfileCurveEditor';

export interface CosPhiOfPProfileFormProps {
  initial?: CosPhiOfPProfile;
  onSubmit: (profile: CosPhiOfPProfile) => void;
  onCancel?: () => void;
}

const DEFAULT_POINTS: ReadonlyArray<CosPhiOfPPoint> = Object.freeze([
  { p_pu: 0.0, cos_phi: 1.0 },
  { p_pu: 0.5, cos_phi: 1.0 },
  { p_pu: 1.0, cos_phi: 0.95 },
]);

export function CosPhiOfPProfileForm({ initial, onSubmit, onCancel }: CosPhiOfPProfileFormProps) {
  const [points, setPoints] = useState<CosPhiOfPPoint[]>(() => {
    if (initial && initial.points.length > 0) return initial.points.map((p) => ({ ...p }));
    return DEFAULT_POINTS.map((p) => ({ ...p }));
  });
  const [catalogRef] = useState<string | undefined>(initial?.catalog_ref);

  const monotonicError = useMemo(() => validateMonotonic(points, 'p_pu', 'asc'), [points]);
  const cosphiRangeError = useMemo(() => validateRange(points, 'cos_phi', -1, 1), [points]);
  const pRangeError = useMemo(() => validateRange(points, 'p_pu', 0, 1), [points]);
  const validationError = monotonicError ?? cosphiRangeError ?? pRangeError;
  const canSubmit = validationError === null && points.length >= 2;

  const updatePoint = useCallback((idx: number, field: keyof CosPhiOfPPoint, value: number) => {
    setPoints((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  }, []);

  const addPoint = useCallback(() => {
    setPoints((prev) => {
      const last = prev[prev.length - 1];
      const next = last
        ? { p_pu: Math.min(1, last.p_pu + 0.1), cos_phi: last.cos_phi }
        : { p_pu: 0.0, cos_phi: 1.0 };
      return [...prev, next];
    });
  }, []);

  const removePoint = useCallback((idx: number) => {
    setPoints((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit({
      kind: 'cosphi',
      points: points.map((p) => ({ ...p })),
      catalog_ref: catalogRef,
    });
  }, [canSubmit, points, catalogRef, onSubmit]);

  return (
    <form
      data-testid="cosphi-profile-form"
      className="flex flex-col gap-3 p-3 bg-scada-surface text-scada-text"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <h3 className="text-sm font-semibold">Profil cos φ(P) — kompensacja mocy biernej</h3>

      {catalogRef && (
        <p className="text-xs text-scada-muted" data-testid="cosphi-catalog-ref">
          Profil z katalogu: <code>{catalogRef}</code> (read-only)
        </p>
      )}

      <ProfileCurveEditor
        title="Charakterystyka cos φ(P) - przeciągnij punkty aby edytować"
        xLabel="P [pu]"
        yLabel="cos φ"
        xRange={[0, 1]}
        yRange={[-1, 1]}
        points={points.map<CurvePoint>((p) => ({ x: p.p_pu, y: p.cos_phi }))}
        editable={catalogRef === undefined}
        onChange={(newPoints) =>
          setPoints(newPoints.map((p) => ({ p_pu: p.x, cos_phi: p.y })))
        }
      />

      <table className="w-full text-xs" data-testid="cosphi-points-table">
        <thead>
          <tr className="text-scada-muted">
            <th className="text-left">P [pu]</th>
            <th className="text-left">cos φ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {points.map((p, idx) => (
            <tr key={idx} data-testid={`cosphi-row-${idx}`}>
              <td>
                <input title="cos φ"
                  type="number"
                  step="0.01"
                  value={p.p_pu}
                  disabled={catalogRef !== undefined}
                  onChange={(e) => updatePoint(idx, 'p_pu', Number(e.target.value))}
                  className="w-20 bg-scada-bg px-1 border border-scada-border"
                  data-testid={`cosphi-p-${idx}`}
                />
              </td>
              <td>
                <input title="cos φ"
                  type="number"
                  step="0.01"
                  value={p.cos_phi}
                  disabled={catalogRef !== undefined}
                  onChange={(e) => updatePoint(idx, 'cos_phi', Number(e.target.value))}
                  className="w-20 bg-scada-bg px-1 border border-scada-border"
                  data-testid={`cosphi-v-${idx}`}
                />
              </td>
              <td>
                <button
                  type="button"
                  disabled={catalogRef !== undefined || points.length <= 2}
                  onClick={() => removePoint(idx)}
                  className="text-scada-muted hover:text-scada-text px-1"
                  data-testid={`cosphi-remove-${idx}`}
                  aria-label={`Usuń punkt ${idx + 1}`}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        type="button"
        disabled={catalogRef !== undefined}
        onClick={addPoint}
        className="self-start text-xs px-2 py-0.5 border border-scada-border hover:bg-scada-hover-nav"
        data-testid="cosphi-add-point"
      >
        + Dodaj punkt
      </button>

      {validationError && (
        <p
          className="text-xs text-red-400 border border-red-400/30 px-2 py-1 rounded"
          data-testid="cosphi-validation-error"
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
            data-testid="cosphi-cancel"
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
          data-testid="cosphi-submit"
        >
          Zapisz profil
        </button>
      </div>
    </form>
  );
}
