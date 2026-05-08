/**
 * LineSegmentInline (E-12 R47) — kompaktowy edytor odcinka kablowego SN.
 *
 * Wdraża Zasadę 13 (UX_ENGINEER_WORKFLOW_PROMPT.md):
 *   E-12 NIE jest osobną kartą workflow — jest inline tooltip-em / kompaktowym
 *   edytorem podczas dropu ciągu na SLD oraz akcji "Edytuj ciąg".
 *
 * Pola:
 *   - Typ kabla z katalogu (autocomplete-style input)
 *   - Długość odcinka [m]
 *   - Typ ułożenia (ziemia | kanał | powietrze)
 *   - Temperatura obliczeniowa [°C]
 *
 * Live preview (estymator):
 *   R = r₀ · L  [Ω]
 *   X = x₀ · L  [Ω]
 *   Imax = Im · Kt  [A]   (Kt z temperatury, IEC 60364 dla kabli)
 *
 * Save:
 *   - executeDomainOperation('configure-cable') → fallback patchSnapshot
 */

import { useCallback, useMemo, useState } from 'react';

export type CableInstallation = 'ground' | 'channel' | 'air';

export interface CableCatalogEntry {
  /** Identyfikator katalogowy. */
  readonly id: string;
  /** Etykieta UI: np. "3x120 XUHAKXS 12/20kV". */
  readonly label: string;
  /** r₀ — rezystancja jednostkowa [Ω/km]. */
  readonly r0OhmPerKm: number;
  /** x₀ — reaktancja jednostkowa [Ω/km]. */
  readonly x0OhmPerKm: number;
  /** Im — prąd dopuszczalny w 30°C [A]. */
  readonly im30A: number;
  /** Un — napięcie znamionowe [kV]. */
  readonly unKv: number;
}

/** Mini-katalog typowych kabli SN (subset). Pełny katalog w E-23 obliczeniach. */
export const SAMPLE_CABLE_CATALOG: readonly CableCatalogEntry[] = [
  { id: 'XUHAKXS-3x70',  label: '3×70 XUHAKXS 12/20kV',  r0OhmPerKm: 0.443, x0OhmPerKm: 0.130, im30A: 215, unKv: 20 },
  { id: 'XUHAKXS-3x120', label: '3×120 XUHAKXS 12/20kV', r0OhmPerKm: 0.253, x0OhmPerKm: 0.122, im30A: 295, unKv: 20 },
  { id: 'XUHAKXS-3x240', label: '3×240 XUHAKXS 12/20kV', r0OhmPerKm: 0.125, x0OhmPerKm: 0.110, im30A: 425, unKv: 20 },
  { id: 'YHAKXS-3x70',   label: '3×70 YHAKXS 6/10kV',    r0OhmPerKm: 0.443, x0OhmPerKm: 0.105, im30A: 200, unKv: 10 },
  { id: 'YHAKXS-3x120',  label: '3×120 YHAKXS 6/10kV',   r0OhmPerKm: 0.253, x0OhmPerKm: 0.098, im30A: 280, unKv: 10 },
];

export interface LineSegmentInlineDraft {
  cableCatalogRef: string;
  lengthM: number;
  installation: CableInstallation;
  temperatureC: number;
}

export const EMPTY_LINE_SEGMENT_DRAFT: LineSegmentInlineDraft = {
  cableCatalogRef: '',
  lengthM: 100,
  installation: 'ground',
  temperatureC: 30,
};

/**
 * Korekcja prądu dopuszczalnego względem temperatury (IEC 60364 — kable XLPE/EPR).
 * Im(T) = Im(30°C) · √((90 - T) / (90 - 30))
 */
function correctImaxByTemperature(im30A: number, tempC: number): number {
  const Tmax = 90;
  if (tempC >= Tmax) return 0;
  const ratio = (Tmax - tempC) / (Tmax - 30);
  return im30A * Math.sqrt(Math.max(0, ratio));
}

/**
 * Oblicza R, X, Imax dla odcinka kabla na podstawie katalogu + długość + temperatura.
 */
export function computeLineSegmentParams(
  draft: LineSegmentInlineDraft,
  catalog: readonly CableCatalogEntry[] = SAMPLE_CABLE_CATALOG,
): { rOhm: number | null; xOhm: number | null; imaxA: number | null; cableEntry: CableCatalogEntry | null } {
  const entry = catalog.find((c) => c.id === draft.cableCatalogRef) ?? null;
  if (!entry || draft.lengthM <= 0) {
    return { rOhm: null, xOhm: null, imaxA: null, cableEntry: entry };
  }
  const lengthKm = draft.lengthM / 1000;
  const rOhm = entry.r0OhmPerKm * lengthKm;
  const xOhm = entry.x0OhmPerKm * lengthKm;
  const imaxA = correctImaxByTemperature(entry.im30A, draft.temperatureC);
  return { rOhm, xOhm, imaxA, cableEntry: entry };
}

export interface LineSegmentInlineProps {
  /** Initial values — z ENM dla edycji, EMPTY_LINE_SEGMENT_DRAFT dla nowego. */
  readonly initialDraft: LineSegmentInlineDraft;
  /** Save callback — async (parent wykonuje executeDomainOperation/patchSnapshot). */
  readonly onSave: (draft: LineSegmentInlineDraft, computed: ReturnType<typeof computeLineSegmentParams>) => Promise<void> | void;
  /** Cancel callback. */
  readonly onCancel: () => void;
  /** Tryb: 'create' (drop nowego ciągu) lub 'edit' (akcja "Edytuj ciąg"). */
  readonly mode: 'create' | 'edit';
  /** Katalog kabli — domyślnie SAMPLE_CABLE_CATALOG. */
  readonly catalog?: readonly CableCatalogEntry[];
}

export function LineSegmentInline(props: LineSegmentInlineProps): JSX.Element {
  const { initialDraft, onSave, onCancel, mode, catalog = SAMPLE_CABLE_CATALOG } = props;
  const [draft, setDraft] = useState<LineSegmentInlineDraft>(initialDraft);
  const [saving, setSaving] = useState(false);

  const update = useCallback(<K extends keyof LineSegmentInlineDraft>(key: K, value: LineSegmentInlineDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const computed = useMemo(() => computeLineSegmentParams(draft, catalog), [draft, catalog]);

  const canSave = Boolean(computed.cableEntry) && draft.lengthM > 0;

  const handleConfirm = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(draft, computed);
    } finally {
      setSaving(false);
    }
  }, [canSave, draft, computed, onSave]);

  return (
    <div data-testid="line-segment-inline" className="space-y-3 rounded border border-scada-border bg-scada-panel p-4 max-w-md">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
          E-12 · {mode === 'create' ? 'Nowy odcinek kabla' : 'Edytuj odcinek kabla'}
        </div>
      </header>

      <Field label="Typ kabla z katalogu" required>
        <select
          data-testid="line-cable-catalog"
          value={draft.cableCatalogRef}
          onChange={(e) => update('cableCatalogRef', e.target.value)}
          className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
        >
          <option value="">— wybierz z katalogu —</option>
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Długość odcinka [m]" required>
        <input
          data-testid="line-length-m"
          type="number"
          min={1}
          step={1}
          value={draft.lengthM}
          onChange={(e) => update('lengthM', Number(e.target.value))}
          className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
        />
      </Field>

      <Field label="Typ ułożenia">
        <div data-testid="line-installation-radio" className="flex gap-3 text-xs">
          {(['ground', 'channel', 'air'] as const).map((inst) => (
            <label key={inst} className="flex items-center gap-1">
              <input
                data-testid={`line-installation-${inst}`}
                type="radio"
                name="line-installation"
                checked={draft.installation === inst}
                onChange={() => update('installation', inst)}
              />
              <span>
                {inst === 'ground' && 'Ziemia'}
                {inst === 'channel' && 'Kanał kablowy'}
                {inst === 'air' && 'Powietrze'}
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Temperatura obliczeniowa [°C]">
        <input
          data-testid="line-temperature"
          type="number"
          min={-20}
          max={90}
          step={5}
          value={draft.temperatureC}
          onChange={(e) => update('temperatureC', Number(e.target.value))}
          className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
        />
      </Field>

      {/* Live preview */}
      <div data-testid="line-segment-preview" className="rounded border border-scada-border bg-scada-bg-soft p-3 text-xs">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-scada-muted">
          Parametry obliczone (estymator)
        </div>
        {computed.cableEntry ? (
          <ul className="space-y-1 font-mono">
            <li data-testid="line-r-ohm">R = {computed.rOhm?.toFixed(4) ?? '—'} Ω</li>
            <li data-testid="line-x-ohm">X = {computed.xOhm?.toFixed(4) ?? '—'} Ω</li>
            <li data-testid="line-imax-a">Imax = {computed.imaxA?.toFixed(0) ?? '—'} A</li>
            <li className="text-scada-muted text-[10px] mt-2">
              r₀ = {computed.cableEntry.r0OhmPerKm} Ω/km, x₀ = {computed.cableEntry.x0OhmPerKm} Ω/km,
              Im(30°C) = {computed.cableEntry.im30A} A, Un = {computed.cableEntry.unKv} kV
            </li>
          </ul>
        ) : (
          <div className="text-scada-muted">Wybierz typ kabla z katalogu, aby zobaczyć estymator R/X/Imax.</div>
        )}
        <div className="mt-2 text-[10px] text-scada-muted">
          Pełne obliczenia (z gęstością prądu, asymetrią, harmonicznymi) w module E-23.
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-scada-border pt-3">
        <button
          type="button"
          data-testid="line-cancel"
          onClick={onCancel}
          className="rounded border border-scada-border px-3 py-1.5 text-sm text-scada-muted hover:bg-scada-hover-nav"
        >
          Anuluj
        </button>
        <button
          type="button"
          data-testid="line-confirm"
          disabled={!canSave || saving}
          onClick={handleConfirm}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Zapisywanie…' : mode === 'create' ? 'Utwórz odcinek' : 'Zapisz zmiany'}
        </button>
      </div>
    </div>
  );
}

/* =============================================================================
   Helpers
   ============================================================================= */

interface FieldProps {
  readonly label: string;
  readonly required?: boolean;
  readonly children: React.ReactNode;
}

function Field({ label, required, children }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-scada-muted">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

export default LineSegmentInline;
