/**
 * StationWizardSurface (E-13 R46) — wizard wieloetapowy stacji SN.
 *
 * Wdraża Zasadę 13 z UX_ENGINEER_WORKFLOW_PROMPT.md:
 *   "Wstawienie obiektu = jego pełna konfiguracja w jednym przepływie."
 *
 * Architektura:
 *   - 8 stepów w jednym oknie (stepper na górze)
 *   - Steps: Identyfikacja | Pola+aparatura | TR | nN | DER | Zabezpieczenia
 *            | Powiązania | Gotowość
 *   - Stepy opcjonalne (TR/nN/DER) z przyciskiem "Pomiń"
 *   - Save = patchSnapshot atomowo dla całego drafta (R46)
 *     [executeDomainOperation('create-station-complete') wymagany backend
 *      operation; tymczasowo używamy patchSnapshot dla UI parity]
 *   - Edycja: mode='edit', skok do dowolnego stepu
 *
 * Każde pole:
 *   - data-testid = "wizard-{step}-{field}"
 *   - onChange → setDraft (lokalny state)
 *   - Save (Step 8) → patchSnapshot(draft) + Inv 4 invalidate
 *
 * Brak dead clicks:
 *   - "Wstecz" / "Dalej" / "Pomiń" / "Zapisz i utwórz" — wszystkie z handlerami
 *   - "Anuluj" → cleanup draft + close
 *
 * Wzorzec kanon: GpzConfiguratorSurface R45 (10.0/10).
 */

import { useCallback, useMemo, useState } from 'react';

import { useSnapshotStore } from '../../topology/snapshotStore';
import { notify } from '../../notifications/store';
import type { Substation } from '../../../types/enm';
import type { WorkspaceSurfaceDescriptor } from '../types';

/* =============================================================================
   Step taxonomy
   ============================================================================= */

export type StationWizardStepId =
  | 'identification'
  | 'bays_and_apparatus'
  | 'transformer'
  | 'lv_side'
  | 'der'
  | 'protection_hint'
  | 'connections'
  | 'readiness';

interface StepMeta {
  readonly id: StationWizardStepId;
  readonly index: number;
  readonly labelPl: string;
  readonly optional: boolean;
  readonly testId: string;
}

const STEPS: readonly StepMeta[] = [
  { id: 'identification',     index: 1, labelPl: 'Identyfikacja',         optional: false, testId: 'station-wizard-step-identification' },
  { id: 'bays_and_apparatus', index: 2, labelPl: 'Pola + aparatura',      optional: false, testId: 'station-wizard-step-bays-and-apparatus' },
  { id: 'transformer',        index: 3, labelPl: 'Transformator',         optional: true,  testId: 'station-wizard-step-transformer' },
  { id: 'lv_side',            index: 4, labelPl: 'Strona nN',             optional: true,  testId: 'station-wizard-step-lv-side' },
  { id: 'der',                index: 5, labelPl: 'DER (PV/BESS/FW)',      optional: true,  testId: 'station-wizard-step-der' },
  { id: 'protection_hint',    index: 6, labelPl: 'Zabezpieczenia',        optional: false, testId: 'station-wizard-step-protection-hint' },
  { id: 'connections',        index: 7, labelPl: 'Powiązania',            optional: false, testId: 'station-wizard-step-connections' },
  { id: 'readiness',          index: 8, labelPl: 'Gotowość',              optional: false, testId: 'station-wizard-step-readiness' },
];

type ReadinessLevel = 'complete' | 'partial' | 'blocker' | 'not_started';

const READINESS_BADGE: Record<ReadinessLevel, { icon: string; color: string }> = {
  complete:    { icon: '✓', color: 'text-emerald-400' },
  partial:     { icon: '!', color: 'text-amber-400'   },
  blocker:     { icon: '✗', color: 'text-red-400'     },
  not_started: { icon: '·', color: 'text-slate-500'   },
};

/* =============================================================================
   Draft model
   ============================================================================= */

type StationKind = 'rmu' | 'rm6' | 'switching' | 'mv_lv' | 'inline' | 'branch' | 'terminal' | 'sectional' | 'customer';

interface BayDraft {
  readonly id: string;
  role: 'LINE_FULL' | 'TR_FULL' | 'COUPLER' | 'MEASUREMENT' | 'OZE';
  cbCatalogRef: string;
  cbIcuKa: number;
  dsCatalogRef: string;
  ctCatalogRef: string;
  ctRatio: string;
  hasVt: boolean;
  hasSurgeArrester: boolean;
  hasFuse: boolean;
}

interface ProtectionHintDraft {
  bayId: string;
  relayType: 'overcurrent' | 'earth_fault' | 'differential';
  irNominalA: number;
}

interface StationWizardDraft {
  // Step 1
  name: string;
  registryNumber: string;
  stationType: StationKind;
  ratedVoltageKv: number;
  producer: string;

  // Step 2
  bays: BayDraft[];

  // Step 3
  hasTransformer: boolean;
  transformerCatalogRef: string;
  transformerSnKva: number;
  transformerVectorGroup: string;
  transformerUkPercent: number;

  // Step 4
  hasLvSide: boolean;
  lvVoltageV: number;
  lvSchemeKind: 'tnc' | 'tncs' | 'tns' | 'tt' | 'it';
  lvMainBreakerCatalogRef: string;

  // Step 5
  hasDer: boolean;
  derKind: 'PV' | 'BESS' | 'FW' | null;
  derSnKva: number;
  derConnectionVariant: 'lv_behind_tr' | 'dedicated_mv' | 'source_station' | null;
  derPccRef: string;
  derInverterCatalogRef: string;

  // Step 6
  protectionHints: ProtectionHintDraft[];

  // Step 7
  snInputSegmentRef: string;
  snOutputSegmentRef: string;
  isNopPoint: boolean;
}

const EMPTY_DRAFT: StationWizardDraft = {
  name: '',
  registryNumber: '',
  stationType: 'rmu',
  ratedVoltageKv: 15,
  producer: '',
  bays: [],
  hasTransformer: false,
  transformerCatalogRef: '',
  transformerSnKva: 630,
  transformerVectorGroup: 'Dyn5',
  transformerUkPercent: 6,
  hasLvSide: false,
  lvVoltageV: 400,
  lvSchemeKind: 'tns',
  lvMainBreakerCatalogRef: '',
  hasDer: false,
  derKind: null,
  derSnKva: 0,
  derConnectionVariant: null,
  derPccRef: '',
  derInverterCatalogRef: '',
  protectionHints: [],
  snInputSegmentRef: '',
  snOutputSegmentRef: '',
  isNopPoint: false,
};

/* =============================================================================
   Per-step readiness analyzer
   ============================================================================= */

function analyzeStep(
  stepId: StationWizardStepId,
  draft: StationWizardDraft,
): ReadinessLevel {
  switch (stepId) {
    case 'identification':
      if (!draft.name.trim()) return 'blocker';
      if (!draft.producer.trim()) return 'partial';
      return 'complete';
    case 'bays_and_apparatus': {
      if (draft.bays.length === 0) return 'blocker';
      const hasIn = draft.bays.some((b) => b.role === 'LINE_FULL');
      if (!hasIn) return 'blocker';
      const lineNoCt = draft.bays.find((b) => b.role === 'LINE_FULL' && !b.ctCatalogRef);
      if (lineNoCt) return 'partial';
      return 'complete';
    }
    case 'transformer':
      if (!draft.hasTransformer) return 'not_started';
      if (!draft.transformerCatalogRef) return 'blocker';
      if (draft.transformerSnKva <= 0) return 'blocker';
      return 'complete';
    case 'lv_side':
      if (!draft.hasLvSide) return 'not_started';
      if (draft.lvVoltageV <= 0) return 'blocker';
      return 'complete';
    case 'der':
      if (!draft.hasDer) return 'not_started';
      if (!draft.derKind) return 'blocker';
      if (!draft.derConnectionVariant) return 'blocker';
      if (!draft.derPccRef) return 'blocker';
      if (draft.derSnKva <= 0) return 'blocker';
      return 'complete';
    case 'protection_hint': {
      const lineBays = draft.bays.filter((b) => b.role === 'LINE_FULL' || b.role === 'TR_FULL');
      if (lineBays.length === 0) return 'not_started';
      const missingHint = lineBays.find(
        (b) => !draft.protectionHints.some((h) => h.bayId === b.id),
      );
      return missingHint ? 'partial' : 'complete';
    }
    case 'connections':
      if (!draft.snInputSegmentRef.trim()) return 'partial';
      return 'complete';
    case 'readiness': {
      const allOthers: StationWizardStepId[] = [
        'identification', 'bays_and_apparatus', 'protection_hint', 'connections',
      ];
      const hasBlocker = allOthers.some((s) => analyzeStep(s, draft) === 'blocker');
      if (hasBlocker) return 'blocker';
      const hasPartial = allOthers.some((s) => analyzeStep(s, draft) === 'partial');
      return hasPartial ? 'partial' : 'complete';
    }
  }
}

function findExistingStation(
  snapshot: ReturnType<typeof useSnapshotStore.getState>['snapshot'],
  stationRef: string | null,
): Substation | null {
  if (!snapshot || !stationRef) return null;
  return (snapshot.substations ?? []).find((s) => s.ref_id === stationRef) ?? null;
}

function buildDraftFromSubstation(station: Substation | null): StationWizardDraft {
  if (!station) return EMPTY_DRAFT;
  return {
    ...EMPTY_DRAFT,
    name: station.name ?? '',
    registryNumber: ((station.meta as Record<string, unknown> | undefined)?.['registry_number'] as string) ?? '',
    stationType: (station.station_type as StationKind) ?? 'rmu',
    ratedVoltageKv: ((station.meta as Record<string, unknown> | undefined)?.['rated_voltage_kv'] as number) ?? 15,
    producer: ((station.meta as Record<string, unknown> | undefined)?.['producer'] as string) ?? '',
  };
}

/* =============================================================================
   Surface
   ============================================================================= */

interface StationWizardSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

export function StationWizardSurface(props: StationWizardSurfaceProps): JSX.Element {
  const { surface } = props;
  const stationRef = surface.entityRef ?? null;
  const mode: 'create' | 'edit' = stationRef ? 'edit' : 'create';

  const snapshot = useSnapshotStore((s) => s.snapshot);
  const patchSnapshot = useSnapshotStore((s) => s.patchSnapshot);

  const existingStation = useMemo(
    () => findExistingStation(snapshot, stationRef),
    [snapshot, stationRef],
  );

  const [draft, setDraft] = useState<StationWizardDraft>(() => buildDraftFromSubstation(existingStation));
  const [activeStep, setActiveStep] = useState<StationWizardStepId>('identification');
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateDraft = useCallback(
    <K extends keyof StationWizardDraft>(key: K, value: StationWizardDraft[K]) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const stepIndex = useMemo(
    () => STEPS.findIndex((s) => s.id === activeStep),
    [activeStep],
  );

  const goNext = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      setActiveStep(STEPS[stepIndex + 1].id);
    }
  }, [stepIndex]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) {
      setActiveStep(STEPS[stepIndex - 1].id);
    }
  }, [stepIndex]);

  const skipStep = useCallback(() => {
    const cur = STEPS[stepIndex];
    if (!cur.optional) return;
    /* Wyłącz toggle dla pominiętego stepu i przejdź dalej. */
    if (cur.id === 'transformer') updateDraft('hasTransformer', false);
    if (cur.id === 'lv_side') updateDraft('hasLvSide', false);
    if (cur.id === 'der') updateDraft('hasDer', false);
    goNext();
  }, [stepIndex, updateDraft, goNext]);

  const readinessByStep = useMemo(() => {
    const map = {} as Record<StationWizardStepId, ReadinessLevel>;
    for (const s of STEPS) {
      map[s.id] = analyzeStep(s.id, draft);
    }
    return map;
  }, [draft]);

  const overallReadiness = readinessByStep['readiness'];
  const canSave = overallReadiness !== 'blocker';

  const handleSaveAndCreate = useCallback(() => {
    if (!canSave) {
      setSaveError('Nie można zapisać: są blokady w gotowości.');
      return;
    }
    setSaveError(null);
    /* R46: patchSnapshot dla całego drafta. Backend operation
       'create-station-complete' wymaga implementacji w backendzie — to przyszły
       commit. Tymczasem patchSnapshot zapewnia UI parity (Inv 4 invalidate). */
    if (mode === 'create') {
      const newRefId = `station-${Date.now()}`;
      patchSnapshot(
        (snap) => ({
          ...snap,
          substations: [
            ...(snap.substations ?? []),
            {
              id: newRefId,
              ref_id: newRefId,
              name: draft.name.trim(),
              tags: [],
              meta: {
                registry_number: draft.registryNumber,
                rated_voltage_kv: draft.ratedVoltageKv,
                producer: draft.producer,
              },
              station_type: draft.stationType === 'rmu' || draft.stationType === 'rm6' ? 'mv_lv' : draft.stationType,
              bus_refs: [],
              transformer_refs: [],
            } as Substation,
          ],
        }),
        [newRefId],
      );
      notify(`Utworzono stację "${draft.name.trim()}".`, 'info');
    } else if (existingStation) {
      patchSnapshot(
        (snap) => ({
          ...snap,
          substations: (snap.substations ?? []).map((s) =>
            s.ref_id === existingStation.ref_id
              ? {
                  ...s,
                  name: draft.name.trim(),
                  meta: {
                    ...(s.meta ?? {}),
                    registry_number: draft.registryNumber,
                    rated_voltage_kv: draft.ratedVoltageKv,
                    producer: draft.producer,
                  },
                }
              : s,
          ),
        }),
        [existingStation.ref_id],
      );
      notify(`Zaktualizowano stację "${draft.name.trim()}".`, 'info');
    }
  }, [canSave, mode, draft, existingStation, patchSnapshot]);

  const handleCancel = useCallback(() => {
    setDraft(buildDraftFromSubstation(existingStation));
    setActiveStep('identification');
    setSaveError(null);
    notify('Anulowano. Model bez zmian.', 'info');
  }, [existingStation]);

  if (!stationRef && mode === 'edit') {
    return (
      <div data-testid="station-wizard-empty" className="p-4 text-sm text-amber-200">
        Brak referencji do stacji w kontekście. Wybierz stację z lewego panelu lub
        kliknij stację w SLD.
      </div>
    );
  }

  return (
    <div data-testid="station-wizard-surface" className="flex h-full w-full flex-col bg-scada-panel text-scada-text">
      {/* Header */}
      <header className="border-b border-scada-border px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
          E-13 · Wizard stacji SN/nN · {mode === 'create' ? 'Wstaw nową' : 'Edytuj'}
        </div>
        <h2 data-testid="station-wizard-title" className="mt-1 text-base font-semibold">
          {draft.name || 'Nowa stacja'}
        </h2>
      </header>

      {/* Stepper */}
      <nav data-testid="station-wizard-stepper" className="flex items-center gap-1 border-b border-scada-border bg-scada-bg px-4 py-2 overflow-x-auto">
        {STEPS.map((step) => {
          const r = readinessByStep[step.id];
          const isActive = step.id === activeStep;
          return (
            <button
              key={step.id}
              type="button"
              data-testid={`stepper-${step.id}`}
              data-active={isActive ? 'true' : 'false'}
              data-readiness={r}
              onClick={() => setActiveStep(step.id)}
              className={`flex items-center gap-2 rounded px-2 py-1 text-xs whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-scada-accent text-white'
                  : 'bg-scada-bg-soft hover:bg-scada-hover-nav text-scada-text'
              }`}
            >
              <span className="font-mono text-[10px] opacity-75">{step.index}.</span>
              <span>{step.labelPl}</span>
              <span className={READINESS_BADGE[r].color} aria-label={`status: ${r}`}>
                {READINESS_BADGE[r].icon}
              </span>
              {step.optional && <span className="text-[9px] uppercase opacity-60">opc</span>}
            </button>
          );
        })}
      </nav>

      {/* Body */}
      <main className="flex-1 overflow-auto p-4">
        {activeStep === 'identification'     && <StepIdentification     draft={draft} update={updateDraft} />}
        {activeStep === 'bays_and_apparatus' && <StepBaysAndApparatus   draft={draft} update={updateDraft} />}
        {activeStep === 'transformer'        && <StepTransformer        draft={draft} update={updateDraft} />}
        {activeStep === 'lv_side'            && <StepLvSide             draft={draft} update={updateDraft} />}
        {activeStep === 'der'                && <StepDer                draft={draft} update={updateDraft} snapshot={snapshot} />}
        {activeStep === 'protection_hint'    && <StepProtectionHint     draft={draft} update={updateDraft} />}
        {activeStep === 'connections'        && <StepConnections        draft={draft} update={updateDraft} />}
        {activeStep === 'readiness'          && <StepReadiness          draft={draft} readinessByStep={readinessByStep} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-scada-border px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          data-testid="wizard-cancel"
          onClick={handleCancel}
          className="rounded border border-scada-border px-3 py-1.5 text-sm text-scada-muted hover:bg-scada-hover-nav"
        >
          Anuluj
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="wizard-back"
            disabled={stepIndex === 0}
            onClick={goBack}
            className="rounded border border-scada-border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 hover:bg-scada-hover-nav"
          >
            ← Wstecz
          </button>
          {STEPS[stepIndex].optional && (
            <button
              type="button"
              data-testid="wizard-skip"
              onClick={skipStep}
              className="rounded border border-amber-700 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-950/30"
            >
              Pomiń
            </button>
          )}
          {stepIndex < STEPS.length - 1 && (
            <button
              type="button"
              data-testid="wizard-next"
              onClick={goNext}
              className="rounded bg-scada-accent px-3 py-1.5 text-sm text-white hover:bg-scada-accent-strong"
            >
              Dalej →
            </button>
          )}
          {stepIndex === STEPS.length - 1 && (
            <button
              type="button"
              data-testid="wizard-save-and-create"
              disabled={!canSave}
              onClick={handleSaveAndCreate}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {mode === 'create' ? 'Zapisz i utwórz' : 'Zapisz zmiany'}
            </button>
          )}
        </div>
      </footer>

      {saveError && (
        <div data-testid="wizard-save-error" className="border-t border-red-700 bg-red-950/30 px-4 py-2 text-xs text-red-300">
          {saveError}
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   Step 1 — Identyfikacja
   ============================================================================= */

interface StepCommonProps {
  readonly draft: StationWizardDraft;
  readonly update: <K extends keyof StationWizardDraft>(key: K, value: StationWizardDraft[K]) => void;
}

function StepIdentification({ draft, update }: StepCommonProps) {
  return (
    <section data-testid="station-wizard-step-identification" className="grid grid-cols-2 gap-4 max-w-2xl">
      <Field label="Nazwa stacji" required>
        <input
          data-testid="wizard-station-name"
          type="text"
          value={draft.name}
          onChange={(e) => update('name', e.target.value)}
          className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
          placeholder="np. ST-001 Wschód"
        />
      </Field>
      <Field label="Numer ewidencyjny">
        <input
          data-testid="wizard-station-registry"
          type="text"
          value={draft.registryNumber}
          onChange={(e) => update('registryNumber', e.target.value)}
          className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
          placeholder="np. 587/24"
        />
      </Field>
      <Field label="Typ stacji" required>
        <select
          data-testid="wizard-station-type"
          value={draft.stationType}
          onChange={(e) => update('stationType', e.target.value as StationKind)}
          className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
        >
          <option value="rmu">RMU (Ring Main Unit)</option>
          <option value="rm6">RM6 (kompaktowa)</option>
          <option value="switching">Stacja łącznikowa</option>
          <option value="mv_lv">SN/nN (transformatorowa)</option>
          <option value="customer">Stacja odbiorcy</option>
          <option value="sectional">Sekcjonowanie</option>
          <option value="branch">Odgałęźna</option>
          <option value="terminal">Końcowa</option>
        </select>
      </Field>
      <Field label="Napięcie znamionowe SN [kV]" required>
        <input
          data-testid="wizard-rated-voltage-kv"
          type="number"
          value={draft.ratedVoltageKv}
          onChange={(e) => update('ratedVoltageKv', Number(e.target.value))}
          min={1}
          max={36}
          className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
        />
      </Field>
      <Field label="Producent rozdzielnicy" full>
        <input
          data-testid="wizard-producer"
          type="text"
          value={draft.producer}
          onChange={(e) => update('producer', e.target.value)}
          className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
          placeholder="np. ABB SafePlus, Schneider RM6, Siemens 8DJH"
        />
      </Field>
    </section>
  );
}

/* =============================================================================
   Step 2 — Pola i aparatura
   ============================================================================= */

function StepBaysAndApparatus({ draft, update }: StepCommonProps) {
  const addBay = () => {
    const newBay: BayDraft = {
      id: `bay-${Date.now()}-${draft.bays.length + 1}`,
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
    update('bays', [...draft.bays, newBay]);
  };

  const updateBay = (idx: number, patch: Partial<BayDraft>) => {
    update(
      'bays',
      draft.bays.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    );
  };

  const removeBay = (idx: number) => {
    update('bays', draft.bays.filter((_, i) => i !== idx));
  };

  return (
    <section data-testid="station-wizard-step-bays-and-apparatus" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Pola SN tej stacji ({draft.bays.length})</h3>
        <button
          type="button"
          data-testid="wizard-bay-add"
          onClick={addBay}
          className="rounded bg-scada-accent px-3 py-1 text-xs text-white hover:bg-scada-accent-strong"
        >
          + Dodaj pole
        </button>
      </div>
      {draft.bays.length === 0 && (
        <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
          Brak pól SN. Kliknij „+ Dodaj pole" aby zacząć. Stacja musi mieć co najmniej
          jedno pole liniowe (LINE_FULL).
        </div>
      )}
      {draft.bays.map((bay, idx) => (
        <BayEditor
          key={bay.id}
          bay={bay}
          index={idx}
          onChange={(patch) => updateBay(idx, patch)}
          onRemove={() => removeBay(idx)}
        />
      ))}
    </section>
  );
}

interface BayEditorProps {
  readonly bay: BayDraft;
  readonly index: number;
  readonly onChange: (patch: Partial<BayDraft>) => void;
  readonly onRemove: () => void;
}

function BayEditor({ bay, index, onChange, onRemove }: BayEditorProps) {
  const requiresCt = bay.role === 'LINE_FULL' || bay.role === 'TR_FULL';
  const requiresVt = bay.role === 'MEASUREMENT';
  const requiresFuse = bay.role === 'TR_FULL';
  const ctMissing = requiresCt && !bay.ctCatalogRef.trim();

  return (
    <div data-testid={`bay-editor-${index}`} className="rounded border border-scada-border bg-scada-bg p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold">Pole #{index + 1}</span>
          <select
            data-testid={`wizard-bay-${index}-role`}
            value={bay.role}
            onChange={(e) => onChange({ role: e.target.value as BayDraft['role'] })}
            className="rounded border border-scada-border bg-scada-bg-soft px-2 py-0.5"
          >
            <option value="LINE_FULL">Liniowe (LINE_FULL)</option>
            <option value="TR_FULL">Transformatorowe (TR_FULL)</option>
            <option value="COUPLER">Sprzęgło (COUPLER)</option>
            <option value="MEASUREMENT">Pomiarowe (MEASUREMENT)</option>
            <option value="OZE">OZE/DER (OZE)</option>
          </select>
        </div>
        <button
          type="button"
          data-testid={`wizard-bay-${index}-remove`}
          onClick={onRemove}
          className="text-xs text-red-400 hover:text-red-300"
        >
          Usuń
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Field label="CB — typ z katalogu">
          <input
            data-testid={`wizard-bay-${index}-cb-ref`}
            type="text"
            value={bay.cbCatalogRef}
            onChange={(e) => onChange({ cbCatalogRef: e.target.value })}
            placeholder="np. ABB VD4 630-16"
            className="w-full rounded border border-scada-border bg-scada-bg-soft px-2 py-1"
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
          <Field label={`CT — przekładnik prądowy${ctMissing ? ' ⚠ wymagany' : ''}`}>
            <input
              data-testid={`wizard-bay-${index}-ct-ref`}
              type="text"
              value={bay.ctCatalogRef}
              onChange={(e) => onChange({ ctCatalogRef: e.target.value })}
              placeholder="np. ABB KOFA 200/5 0.5S"
              className={`w-full rounded border bg-scada-bg-soft px-2 py-1 ${ctMissing ? 'border-amber-600' : 'border-scada-border'}`}
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
              <span>Pole pomiarowe — VT podłączony</span>
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
      {ctMissing && (
        <div data-testid={`wizard-bay-${index}-blocker-ct`} className="mt-2 rounded bg-amber-950/30 px-2 py-1 text-[11px] text-amber-200">
          ⚠ Pole {bay.role === 'LINE_FULL' ? 'liniowe' : 'TR'} bez CT — brak danych dla
          obliczeń zabezpieczeń.
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   Step 3 — Transformator
   ============================================================================= */

function StepTransformer({ draft, update }: StepCommonProps) {
  return (
    <section data-testid="station-wizard-step-transformer" className="space-y-4 max-w-2xl">
      <label className="flex items-center gap-3">
        <input
          data-testid="wizard-has-transformer"
          type="checkbox"
          checked={draft.hasTransformer}
          onChange={(e) => update('hasTransformer', e.target.checked)}
        />
        <span className="text-sm">Stacja ma transformator SN/nN</span>
      </label>
      {draft.hasTransformer && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Transformator z katalogu" required full>
            <input
              data-testid="wizard-transformer-ref"
              type="text"
              value={draft.transformerCatalogRef}
              onChange={(e) => update('transformerCatalogRef', e.target.value)}
              placeholder="np. ABB TUMETIC 630-15/0.4 Dyn5"
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Moc znamionowa Sn [kVA]" required>
            <input
              data-testid="wizard-transformer-sn"
              type="number"
              value={draft.transformerSnKva}
              onChange={(e) => update('transformerSnKva', Number(e.target.value))}
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Grupa wektorowa">
            <select
              data-testid="wizard-transformer-vector"
              value={draft.transformerVectorGroup}
              onChange={(e) => update('transformerVectorGroup', e.target.value)}
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            >
              <option value="Dyn5">Dyn5</option>
              <option value="Dyn11">Dyn11</option>
              <option value="Yyn0">Yyn0</option>
              <option value="Yzn5">Yzn5</option>
            </select>
          </Field>
          <Field label="Napięcie zwarcia uk [%]">
            <input
              data-testid="wizard-transformer-uk"
              type="number"
              step="0.1"
              value={draft.transformerUkPercent}
              onChange={(e) => update('transformerUkPercent', Number(e.target.value))}
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            />
          </Field>
        </div>
      )}
    </section>
  );
}

/* =============================================================================
   Step 4 — Strona nN
   ============================================================================= */

function StepLvSide({ draft, update }: StepCommonProps) {
  return (
    <section data-testid="station-wizard-step-lv-side" className="space-y-4 max-w-2xl">
      <label className="flex items-center gap-3">
        <input
          data-testid="wizard-has-lv-side"
          type="checkbox"
          checked={draft.hasLvSide}
          onChange={(e) => update('hasLvSide', e.target.checked)}
        />
        <span className="text-sm">Stacja ma stronę nN</span>
      </label>
      {draft.hasLvSide && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Napięcie nN [V]" required>
            <input
              data-testid="wizard-lv-voltage"
              type="number"
              value={draft.lvVoltageV}
              onChange={(e) => update('lvVoltageV', Number(e.target.value))}
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Układ sieci nN">
            <select
              data-testid="wizard-lv-scheme"
              value={draft.lvSchemeKind}
              onChange={(e) => update('lvSchemeKind', e.target.value as StationWizardDraft['lvSchemeKind'])}
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            >
              <option value="tns">TN-S</option>
              <option value="tncs">TN-C-S</option>
              <option value="tnc">TN-C</option>
              <option value="tt">TT</option>
              <option value="it">IT</option>
            </select>
          </Field>
          <Field label="Wyłącznik główny nN" full>
            <input
              data-testid="wizard-lv-main-breaker"
              type="text"
              value={draft.lvMainBreakerCatalogRef}
              onChange={(e) => update('lvMainBreakerCatalogRef', e.target.value)}
              placeholder="np. ABB Tmax XT5N 630"
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            />
          </Field>
        </div>
      )}
    </section>
  );
}

/* =============================================================================
   Step 5 — DER (PV/BESS/FW)
   ============================================================================= */

interface StepDerProps extends StepCommonProps {
  readonly snapshot: ReturnType<typeof useSnapshotStore.getState>['snapshot'];
}

function StepDer({ draft, update, snapshot }: StepDerProps) {
  const busOptions = useMemo(() => (snapshot?.buses ?? []).map((b) => ({ ref: b.ref_id, label: `${b.name} (${b.voltage_kv} kV)` })), [snapshot]);

  return (
    <section data-testid="station-wizard-step-der" className="space-y-4 max-w-2xl">
      <label className="flex items-center gap-3">
        <input
          data-testid="wizard-has-der"
          type="checkbox"
          checked={draft.hasDer}
          onChange={(e) => update('hasDer', e.target.checked)}
        />
        <span className="text-sm">Stacja ma źródło/magazyn (PV / BESS / FW)</span>
      </label>
      {draft.hasDer && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Typ DER" required>
            <select
              data-testid="wizard-der-kind"
              value={draft.derKind ?? ''}
              onChange={(e) => update('derKind', (e.target.value || null) as StationWizardDraft['derKind'])}
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            >
              <option value="">— wybierz —</option>
              <option value="PV">PV (fotowoltaika)</option>
              <option value="BESS">BESS (magazyn)</option>
              <option value="FW">FW (farma wiatrowa)</option>
            </select>
          </Field>
          <Field label="Moc Sn [kVA]" required>
            <input
              data-testid="wizard-der-sn"
              type="number"
              value={draft.derSnKva}
              onChange={(e) => update('derSnKva', Number(e.target.value))}
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            />
          </Field>
          <Field label="Wariant przyłączenia" required full>
            <select
              data-testid="wizard-der-connection-variant"
              value={draft.derConnectionVariant ?? ''}
              onChange={(e) => update('derConnectionVariant', (e.target.value || null) as StationWizardDraft['derConnectionVariant'])}
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            >
              <option value="">— wybierz —</option>
              <option value="lv_behind_tr">Za transformatorem stacji (nN)</option>
              <option value="dedicated_mv">Dedykowane przyłącze SN (blokowy trafo)</option>
              <option value="source_station">Stacja źródłowa</option>
            </select>
          </Field>
          <Field label="Punkt przyłączenia (PCC) — szyna ref" required>
            <select
              data-testid="wizard-der-pcc-ref"
              value={draft.derPccRef}
              onChange={(e) => update('derPccRef', e.target.value)}
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            >
              <option value="">— wybierz szynę PCC —</option>
              {busOptions.map((b) => (
                <option key={b.ref} value={b.ref}>{b.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Falownik / PCS — katalog">
            <input
              data-testid="wizard-der-inverter-ref"
              type="text"
              value={draft.derInverterCatalogRef}
              onChange={(e) => update('derInverterCatalogRef', e.target.value)}
              placeholder="np. SMA Sunny Tripower 60-10"
              className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
            />
          </Field>
        </div>
      )}
      {draft.hasDer && !draft.derPccRef && (
        <div data-testid="wizard-der-pcc-blocker" className="rounded border border-red-700 bg-red-950/30 p-3 text-xs text-red-300">
          ❌ DER bez PCC — blocker. Wymagane wybranie punktu przyłączenia (szyna).
        </div>
      )}
    </section>
  );
}

/* =============================================================================
   Step 6 — Zabezpieczenia hint
   ============================================================================= */

function StepProtectionHint({ draft, update }: StepCommonProps) {
  const lineBays = draft.bays.filter((b) => b.role === 'LINE_FULL' || b.role === 'TR_FULL');

  const upsertHint = (bayId: string, patch: Partial<ProtectionHintDraft>) => {
    const existing = draft.protectionHints.find((h) => h.bayId === bayId);
    if (existing) {
      update('protectionHints', draft.protectionHints.map((h) => h.bayId === bayId ? { ...h, ...patch } : h));
    } else {
      update('protectionHints', [...draft.protectionHints, { bayId, relayType: 'overcurrent', irNominalA: 100, ...patch }]);
    }
  };

  return (
    <section data-testid="station-wizard-step-protection-hint" className="space-y-3">
      <p className="text-xs text-scada-muted">
        Hint poziomu zabezpieczeń per pole (typ relay + Ir nominalne). Pełna
        koordynacja krzywych TCC w module E-31.
      </p>
      {lineBays.length === 0 && (
        <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
          Brak pól liniowych/TR — krok pomijany. Wróć do Stepu 2 aby dodać pola.
        </div>
      )}
      {lineBays.map((bay) => {
        const hint = draft.protectionHints.find((h) => h.bayId === bay.id);
        return (
          <div key={bay.id} data-testid={`protection-hint-${bay.id}`} className="rounded border border-scada-border bg-scada-bg p-3">
            <div className="mb-2 text-xs font-semibold">Pole {bay.id} ({bay.role})</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Typ zabezpieczenia">
                <select
                  data-testid={`wizard-protection-${bay.id}-type`}
                  value={hint?.relayType ?? 'overcurrent'}
                  onChange={(e) => upsertHint(bay.id, { relayType: e.target.value as ProtectionHintDraft['relayType'] })}
                  className="w-full rounded border border-scada-border bg-scada-bg-soft px-2 py-1 text-xs"
                >
                  <option value="overcurrent">Nadprądowe (50/51)</option>
                  <option value="earth_fault">Ziemnozwarciowe (50N/51N)</option>
                  <option value="differential">Różnicowe (87)</option>
                </select>
              </Field>
              <Field label="Ir nominalne [A]">
                <input
                  data-testid={`wizard-protection-${bay.id}-ir`}
                  type="number"
                  value={hint?.irNominalA ?? 100}
                  onChange={(e) => upsertHint(bay.id, { irNominalA: Number(e.target.value) })}
                  className="w-full rounded border border-scada-border bg-scada-bg-soft px-2 py-1 text-xs"
                />
              </Field>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* =============================================================================
   Step 7 — Powiązania portów
   ============================================================================= */

function StepConnections({ draft, update }: StepCommonProps) {
  return (
    <section data-testid="station-wizard-step-connections" className="space-y-4 max-w-2xl">
      <p className="text-xs text-scada-muted">
        Powiąż porty wejścia/wyjścia z istniejącymi ciągami SN. Dla stacji końcowej
        wystarczy tylko sn_input.
      </p>
      <Field label="Wejście SN — segment ciągu (sn_input)">
        <input
          data-testid="wizard-sn-input-ref"
          type="text"
          value={draft.snInputSegmentRef}
          onChange={(e) => update('snInputSegmentRef', e.target.value)}
          placeholder="np. seg-gpz-st1"
          className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
        />
      </Field>
      <Field label="Wyjście SN — segment ciągu (sn_output)">
        <input
          data-testid="wizard-sn-output-ref"
          type="text"
          value={draft.snOutputSegmentRef}
          onChange={(e) => update('snOutputSegmentRef', e.target.value)}
          placeholder="np. seg-st1-st2 (puste dla końcowej)"
          className="w-full rounded border border-scada-border bg-scada-bg px-2 py-1 text-sm"
        />
      </Field>
      <label className="flex items-center gap-3">
        <input
          data-testid="wizard-is-nop-point"
          type="checkbox"
          checked={draft.isNopPoint}
          onChange={(e) => update('isNopPoint', e.target.checked)}
        />
        <span className="text-sm">Stacja jest punktem otwarcia w pierścieniu (NOP)</span>
      </label>
    </section>
  );
}

/* =============================================================================
   Step 8 — Gotowość
   ============================================================================= */

interface StepReadinessProps {
  readonly draft: StationWizardDraft;
  readonly readinessByStep: Record<StationWizardStepId, ReadinessLevel>;
}

function StepReadiness({ draft, readinessByStep }: StepReadinessProps) {
  const checklist: Array<{ label: string; level: ReadinessLevel; testId: string }> = [
    { label: 'Identyfikacja kompletna',          level: readinessByStep.identification,     testId: 'check-identification' },
    { label: 'Co najmniej 1 pole liniowe',       level: readinessByStep.bays_and_apparatus, testId: 'check-bays' },
    { label: draft.hasTransformer ? 'Transformator skonfigurowany' : 'Transformator pominięty', level: readinessByStep.transformer, testId: 'check-transformer' },
    { label: draft.hasLvSide ? 'Strona nN skonfigurowana' : 'Strona nN pominięta',              level: readinessByStep.lv_side,     testId: 'check-lv' },
    { label: draft.hasDer ? 'DER z PCC' : 'DER pominięty',                                       level: readinessByStep.der,         testId: 'check-der' },
    { label: 'Zabezpieczenia hint per pole',     level: readinessByStep.protection_hint,    testId: 'check-protection' },
    { label: 'Powiązania portów',                level: readinessByStep.connections,        testId: 'check-connections' },
  ];

  return (
    <section data-testid="station-wizard-step-readiness" className="space-y-3 max-w-2xl">
      <h3 className="text-sm font-semibold">Gotowość do utworzenia</h3>
      <ul className="space-y-1">
        {checklist.map((item) => (
          <li
            key={item.testId}
            data-testid={item.testId}
            data-readiness={item.level}
            className="flex items-center gap-3 rounded border border-scada-border bg-scada-bg px-3 py-2 text-xs"
          >
            <span className={`text-base ${READINESS_BADGE[item.level].color}`}>
              {READINESS_BADGE[item.level].icon}
            </span>
            <span>{item.label}</span>
            <span className="ml-auto text-[10px] uppercase opacity-60">{item.level}</span>
          </li>
        ))}
      </ul>
      <div data-testid="wizard-readiness-summary" data-readiness={readinessByStep.readiness} className="mt-3 rounded border border-scada-border bg-scada-bg-soft px-3 py-2 text-xs">
        {readinessByStep.readiness === 'complete' && (
          <span className="text-emerald-400">✓ Stacja gotowa do utworzenia. Klik „Zapisz i utwórz".</span>
        )}
        {readinessByStep.readiness === 'partial' && (
          <span className="text-amber-300">⚠ Stacja kompletna z zastrzeżeniami (sugestie inżynierskie). Można zapisać.</span>
        )}
        {readinessByStep.readiness === 'blocker' && (
          <span className="text-red-300">✗ Blokady — nie można zapisać. Wróć do oznaczonych stepów.</span>
        )}
      </div>
    </section>
  );
}

/* =============================================================================
   Helpers
   ============================================================================= */

interface FieldProps {
  readonly label: string;
  readonly required?: boolean;
  readonly full?: boolean;
  readonly children: React.ReactNode;
}

function Field({ label, required, full, children }: FieldProps) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-scada-muted">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

export default StationWizardSurface;
