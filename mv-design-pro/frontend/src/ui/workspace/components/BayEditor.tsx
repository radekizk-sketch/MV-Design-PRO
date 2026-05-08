/**
 * BayEditor (E-11 R47) — komponent edycji pola SN.
 *
 * Wdraża Zasadę 13 (UX_ENGINEER_WORKFLOW_PROMPT.md):
 *   E-11 jest subkomponentem (NIE osobną kartą workflow).
 *   Używany w 2 trybach:
 *     1. embedded — wewnątrz Step 2 StationWizard (R46)
 *     2. standalone — modal "Edytuj pole" wywoływany z SLD przez akcję kontekstową
 *
 * Architektura:
 *   - Brak zakładek (compact, scrollable card)
 *   - Każde pole ma data-testid={`bay-editor-{index}-{field}`}
 *   - Walidacja inline: ⚠/❌ badge per sekcja
 *   - W embedded mode: emit onSave(draft) do parenta (wizard zbiera do batch save)
 *   - W standalone mode: bezpośrednio executeDomainOperation('configure-bay') + fallback patchSnapshot
 */

import { useCallback, useState } from 'react';

export type BayEditorRole = 'LINE_FULL' | 'TR_FULL' | 'COUPLER' | 'MEASUREMENT' | 'OZE';

export interface BayEditorDraft {
  readonly id: string;
  role: BayEditorRole;
  cbCatalogRef: string;
  cbIcuKa: number;
  dsCatalogRef: string;
  ctCatalogRef: string;
  ctRatio: string;
  hasVt: boolean;
  hasSurgeArrester: boolean;
  hasFuse: boolean;
}

export const EMPTY_BAY_DRAFT: BayEditorDraft = {
  id: '',
  role: 'LINE_FULL',
  cbCatalogRef: '',
  cbIcuKa: 16,
  dsCatalogRef: '',
  ctCatalogRef: '',
  ctRatio: '200/5',
  hasVt: false,
  hasSurgeArrester: true,
  hasFuse: false,
};

export interface BayEditorProps {
  /** Index w grupie pól (dla data-testid + nagłówka). */
  readonly index: number;
  /** Aktualny draft. */
  readonly bay: BayEditorDraft;
  /** Mutacja: parent zarządza state. */
  readonly onChange: (patch: Partial<BayEditorDraft>) => void;
  /** Usunięcie pola — opcjonalne (nie zawsze dostępne). */
  readonly onRemove?: () => void;
  /** Standalone: dodaje sekcję header z testidem (np. "bay-editor-standalone"). */
  readonly testIdPrefix?: string;
}

/**
 * Walidacje inline (Zasada 9 UX_ENGINEER_WORKFLOW_PROMPT.md — readiness gates widoczne w UI).
 */
export function analyzeBayDraft(bay: BayEditorDraft): {
  ctMissing: boolean;
  fuseMissingForTr: boolean;
  cbMissing: boolean;
} {
  const requiresCt = bay.role === 'LINE_FULL' || bay.role === 'TR_FULL';
  return {
    ctMissing: requiresCt && !bay.ctCatalogRef.trim(),
    fuseMissingForTr: bay.role === 'TR_FULL' && !bay.hasFuse,
    cbMissing: !bay.cbCatalogRef.trim(),
  };
}

export function BayEditor(props: BayEditorProps): JSX.Element {
  const { index, bay, onChange, onRemove, testIdPrefix = 'bay-editor' } = props;
  const requiresCt = bay.role === 'LINE_FULL' || bay.role === 'TR_FULL';
  const requiresVt = bay.role === 'MEASUREMENT';
  const requiresFuse = bay.role === 'TR_FULL';
  const validation = analyzeBayDraft(bay);

  return (
    <div data-testid={`${testIdPrefix}-${index}`} className="rounded border border-scada-border bg-scada-bg p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold">Pole #{index + 1}</span>
          <select
            data-testid={`wizard-bay-${index}-role`}
            value={bay.role}
            onChange={(e) => onChange({ role: e.target.value as BayEditorRole })}
            className="rounded border border-scada-border bg-scada-bg-soft px-2 py-0.5"
          >
            <option value="LINE_FULL">Liniowe (LINE_FULL)</option>
            <option value="TR_FULL">Transformatorowe (TR_FULL)</option>
            <option value="COUPLER">Sprzęgło sekcyjne</option>
            <option value="MEASUREMENT">Pomiarowe (MEASUREMENT)</option>
            <option value="OZE">OZE/DER (OZE)</option>
          </select>
        </div>
        {onRemove && (
          <button
            type="button"
            data-testid={`wizard-bay-${index}-remove`}
            onClick={onRemove}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Usuń
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <Field label="CB — typ z katalogu">
          <input
            data-testid={`wizard-bay-${index}-cb-ref`}
            type="text"
            value={bay.cbCatalogRef}
            onChange={(e) => onChange({ cbCatalogRef: e.target.value })}
            placeholder="np. ABB VD4 630-16"
            className={`w-full rounded border bg-scada-bg-soft px-2 py-1 ${validation.cbMissing ? 'border-amber-600' : 'border-scada-border'}`}
          />
        </Field>
        <Field label="CB — Icu [kA]">
          <input
            data-testid={`wizard-bay-${index}-cb-icu`}
            type="number"
            value={bay.cbIcuKa}
            onChange={(e) => onChange({ cbIcuKa: Number(e.target.value) })}
            className="w-full rounded border border-scada-border bg-scada-bg-soft px-2 py-1"
          />
        </Field>
        <Field label="DS — rozłącznik">
          <input
            data-testid={`wizard-bay-${index}-ds-ref`}
            type="text"
            value={bay.dsCatalogRef}
            onChange={(e) => onChange({ dsCatalogRef: e.target.value })}
            placeholder="np. ABB DSG/4"
            className="w-full rounded border border-scada-border bg-scada-bg-soft px-2 py-1"
          />
        </Field>
        {requiresCt && (
          <Field label={`CT — przekładnik prądowy${validation.ctMissing ? ' ⚠ wymagany' : ''}`}>
            <input
              data-testid={`wizard-bay-${index}-ct-ref`}
              type="text"
              value={bay.ctCatalogRef}
              onChange={(e) => onChange({ ctCatalogRef: e.target.value })}
              placeholder="np. ABB KOFA 200/5 0.5S"
              className={`w-full rounded border bg-scada-bg-soft px-2 py-1 ${validation.ctMissing ? 'border-amber-600' : 'border-scada-border'}`}
            />
          </Field>
        )}
        {requiresCt && (
          <Field label="CT — przekładnia">
            <input
              data-testid={`wizard-bay-${index}-ct-ratio`}
              type="text"
              value={bay.ctRatio}
              onChange={(e) => onChange({ ctRatio: e.target.value })}
              placeholder="np. 200/5"
              className="w-full rounded border border-scada-border bg-scada-bg-soft px-2 py-1"
            />
          </Field>
        )}
        {requiresVt && (
          <Field label="VT — przekładnik napięciowy">
            <label className="flex items-center gap-2 text-xs">
              <input
                data-testid={`wizard-bay-${index}-has-vt`}
                type="checkbox"
                checked={bay.hasVt}
                onChange={(e) => onChange({ hasVt: e.target.checked })}
              />
              <span>Pole pomiarowe — przekładnik napięciowy podłączony</span>
            </label>
          </Field>
        )}
        {requiresFuse && (
          <Field label="Bezpieczniki HV (switch-fuse)">
            <label className="flex items-center gap-2 text-xs">
              <input
                data-testid={`wizard-bay-${index}-has-fuse`}
                type="checkbox"
                checked={bay.hasFuse}
                onChange={(e) => onChange({ hasFuse: e.target.checked })}
              />
              <span>Pole TR z bezpiecznikiem</span>
            </label>
          </Field>
        )}
        <Field label="Odgromnik (SA)">
          <label className="flex items-center gap-2 text-xs">
            <input
              data-testid={`wizard-bay-${index}-has-sa`}
              type="checkbox"
              checked={bay.hasSurgeArrester}
              onChange={(e) => onChange({ hasSurgeArrester: e.target.checked })}
            />
            <span>SA na linii</span>
          </label>
        </Field>
      </div>

      {validation.ctMissing && (
        <div data-testid={`wizard-bay-${index}-blocker-ct`} className="mt-2 rounded bg-amber-950/30 px-2 py-1 text-[11px] text-amber-200">
          ⚠ Pole {bay.role === 'LINE_FULL' ? 'liniowe' : 'TR'} bez CT — brak danych dla
          obliczeń zabezpieczeń.
        </div>
      )}
      {validation.fuseMissingForTr && (
        <div data-testid={`wizard-bay-${index}-blocker-fuse`} className="mt-2 rounded bg-amber-950/30 px-2 py-1 text-[11px] text-amber-200">
          ⚠ Pole TR bez bezpieczników — sprawdź czy pole jest typu switch-fuse.
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   Standalone variant (modal usage)
   ============================================================================= */

export interface BayEditorStandaloneProps {
  /** Initial values — z ENM snapshot dla edycji, EMPTY_BAY_DRAFT dla nowego. */
  readonly initialDraft: BayEditorDraft;
  /** Callback przy Save. Standalone: parent wykonuje executeDomainOperation. */
  readonly onSave: (finalDraft: BayEditorDraft) => Promise<void> | void;
  /** Callback przy Cancel. */
  readonly onCancel: () => void;
}

/**
 * Standalone editor — używany w trybie modal "Edytuj pole" z SLD.
 * Zarządza własnym local state (draft) + walidacja przed Save.
 */
export function BayEditorStandalone(props: BayEditorStandaloneProps): JSX.Element {
  const { initialDraft, onSave, onCancel } = props;
  const [draft, setDraft] = useState<BayEditorDraft>(initialDraft);
  const [saving, setSaving] = useState(false);

  const validation = analyzeBayDraft(draft);
  const canSave = !validation.cbMissing && !validation.ctMissing;

  const handleChange = useCallback((patch: Partial<BayEditorDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }, [canSave, draft, onSave]);

  return (
    <div data-testid="bay-editor-standalone" className="flex flex-col gap-3">
      <BayEditor index={0} bay={draft} onChange={handleChange} testIdPrefix="bay-editor-standalone-row" />
      <div className="flex items-center justify-end gap-2 border-t border-scada-border pt-3">
        <button
          type="button"
          data-testid="bay-editor-standalone-cancel"
          onClick={onCancel}
          className="rounded border border-scada-border px-3 py-1.5 text-sm text-scada-muted hover:bg-scada-hover-nav"
        >
          Anuluj
        </button>
        <button
          type="button"
          data-testid="bay-editor-standalone-save"
          disabled={!canSave || saving}
          onClick={handleSave}
          className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Zapisywanie…' : 'Zapisz pole'}
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
  readonly children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-scada-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

export default BayEditor;
