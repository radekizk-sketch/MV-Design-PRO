/**
 * FrtProfileForm — edytor charakterystyki FRT (Pakiet D).
 *
 * EN 50549 / IEEE 1547: phases undervoltage + overvoltage.
 * Każda faza: lista (t_s, u_pu) — strict ascending wg t_s.
 */

import { useCallback, useMemo, useState } from 'react';
import { clsx } from 'clsx';

import { validateMonotonic } from './profileSerializers';
import type { FrtPhase, FrtPoint, FrtProfile } from './profileTypes';

export interface FrtProfileFormProps {
  initial?: FrtProfile;
  onSubmit: (profile: FrtProfile) => void;
  onCancel?: () => void;
}

const DEFAULT_UV: ReadonlyArray<FrtPoint> = Object.freeze([
  { t_s: 0.0, u_pu: 0.0 },
  { t_s: 0.15, u_pu: 0.0 },
  { t_s: 0.15, u_pu: 0.7 },
  { t_s: 1.5, u_pu: 0.85 },
  { t_s: 3.0, u_pu: 0.85 },
]);

const DEFAULT_OV: ReadonlyArray<FrtPoint> = Object.freeze([
  { t_s: 0.0, u_pu: 1.25 },
  { t_s: 0.1, u_pu: 1.25 },
  { t_s: 0.1, u_pu: 1.15 },
  { t_s: 60.0, u_pu: 1.15 },
]);

interface PhaseEditorProps {
  phase: FrtPhase;
  points: FrtPoint[];
  catalogReadOnly: boolean;
  onChange: (next: FrtPoint[]) => void;
}

function PhaseEditor({ phase, points, catalogReadOnly, onChange }: PhaseEditorProps) {
  const monotonicError = useMemo(
    () => validateMonotonic(points, 't_s', 'asc_non_strict'),
    [points],
  );
  const updatePoint = useCallback(
    (idx: number, field: keyof FrtPoint, value: number) => {
      onChange(points.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
    },
    [points, onChange],
  );
  const addPoint = useCallback(() => {
    const last = points[points.length - 1];
    const next = last
      ? { t_s: last.t_s + 0.1, u_pu: last.u_pu }
      : { t_s: 0, u_pu: 1.0 };
    onChange([...points, next]);
  }, [points, onChange]);
  const removePoint = useCallback(
    (idx: number) => onChange(points.filter((_, i) => i !== idx)),
    [points, onChange],
  );

  const phaseLabel = phase === 'undervoltage' ? 'Pod-napięciowa (LVRT)' : 'Nad-napięciowa (HVRT)';

  return (
    <fieldset
      className="border border-scada-border p-2"
      data-testid={`frt-phase-${phase}`}
    >
      <legend className="text-xs font-semibold px-1">{phaseLabel}</legend>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-scada-muted">
            <th className="text-left">t [s]</th>
            <th className="text-left">U [pu]</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {points.map((p, idx) => (
            <tr key={idx} data-testid={`frt-${phase}-row-${idx}`}>
              <td>
                <input title="U [pu]"
                  type="number"
                  step="0.01"
                  value={p.t_s}
                  disabled={catalogReadOnly}
                  onChange={(e) => updatePoint(idx, 't_s', Number(e.target.value))}
                  className="w-20 bg-scada-bg px-1 border border-scada-border"
                  data-testid={`frt-${phase}-t-${idx}`}
                />
              </td>
              <td>
                <input title="U [pu]"
                  type="number"
                  step="0.01"
                  value={p.u_pu}
                  disabled={catalogReadOnly}
                  onChange={(e) => updatePoint(idx, 'u_pu', Number(e.target.value))}
                  className="w-20 bg-scada-bg px-1 border border-scada-border"
                  data-testid={`frt-${phase}-u-${idx}`}
                />
              </td>
              <td>
                <button
                  type="button"
                  disabled={catalogReadOnly || points.length <= 2}
                  onClick={() => removePoint(idx)}
                  className="text-scada-muted hover:text-scada-text px-1"
                  data-testid={`frt-${phase}-remove-${idx}`}
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
        disabled={catalogReadOnly}
        onClick={addPoint}
        className="text-xs px-2 py-0.5 border border-scada-border hover:bg-scada-hover-nav mt-2"
        data-testid={`frt-${phase}-add`}
      >
        + Dodaj punkt
      </button>
      {monotonicError && (
        <p
          className="text-xs text-red-400 mt-1"
          data-testid={`frt-${phase}-error`}
        >
          {monotonicError}
        </p>
      )}
    </fieldset>
  );
}

export function FrtProfileForm({ initial, onSubmit, onCancel }: FrtProfileFormProps) {
  const [uvPoints, setUvPoints] = useState<FrtPoint[]>(() => {
    const phase = initial?.phases.find((p) => p.phase === 'undervoltage');
    return phase ? phase.points.map((p) => ({ ...p })) : DEFAULT_UV.map((p) => ({ ...p }));
  });
  const [ovPoints, setOvPoints] = useState<FrtPoint[]>(() => {
    const phase = initial?.phases.find((p) => p.phase === 'overvoltage');
    return phase ? phase.points.map((p) => ({ ...p })) : DEFAULT_OV.map((p) => ({ ...p }));
  });
  const [standard, setStandard] = useState<FrtProfile['standard']>(
    initial?.standard ?? 'EN_50549',
  );
  const [catalogRef] = useState<string | undefined>(initial?.catalog_ref);

  const uvErr = useMemo(() => validateMonotonic(uvPoints, 't_s', 'asc_non_strict'), [uvPoints]);
  const ovErr = useMemo(() => validateMonotonic(ovPoints, 't_s', 'asc_non_strict'), [ovPoints]);
  // FRT pozwala na duplikaty t_s w punktach segmentowych (skok napięcia w t=const).
  const validationError = uvErr ?? ovErr;
  const canSubmit = validationError === null;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const profile: FrtProfile = {
      kind: 'frt',
      phases: [
        { phase: 'undervoltage', points: uvPoints.map((p) => ({ ...p })) },
        { phase: 'overvoltage', points: ovPoints.map((p) => ({ ...p })) },
      ],
      standard,
      catalog_ref: catalogRef,
    };
    onSubmit(profile);
  }, [canSubmit, uvPoints, ovPoints, standard, catalogRef, onSubmit]);

  return (
    <form
      data-testid="frt-profile-form"
      className="flex flex-col gap-3 p-3 bg-scada-surface text-scada-text"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      <h3 className="text-sm font-semibold">Profil FRT — fault ride-through</h3>

      <label className="text-xs flex items-center gap-2">
        Standard:
        <select title="Standard:"
          value={standard ?? 'EN_50549'}
          disabled={catalogRef !== undefined}
          onChange={(e) => setStandard(e.target.value as FrtProfile['standard'])}
          className="bg-scada-bg border border-scada-border px-1"
          data-testid="frt-standard"
        >
          <option value="EN_50549">EN 50549</option>
          <option value="IEEE_1547">IEEE 1547</option>
          <option value="PL_IRiESD">PL IRiESD</option>
          <option value="CUSTOM">Niestandardowy</option>
        </select>
      </label>

      {catalogRef && (
        <p className="text-xs text-scada-muted" data-testid="frt-catalog-ref">
          Profil z katalogu: <code>{catalogRef}</code> (read-only)
        </p>
      )}

      <PhaseEditor
        phase="undervoltage"
        points={uvPoints}
        catalogReadOnly={catalogRef !== undefined}
        onChange={setUvPoints}
      />
      <PhaseEditor
        phase="overvoltage"
        points={ovPoints}
        catalogReadOnly={catalogRef !== undefined}
        onChange={setOvPoints}
      />

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1 border border-scada-border hover:bg-scada-hover-nav"
            data-testid="frt-cancel"
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
          data-testid="frt-submit"
        >
          Zapisz profil
        </button>
      </div>
    </form>
  );
}
