/**
 * BayConfiguratorSurface (E-11 R47) — wrapper z mode toggle Editor/Legacy.
 *
 * Wdraża Zasadę 13 (UX_ENGINEER_WORKFLOW_PROMPT.md):
 *   E-11 jest subkomponentem (NIE osobną kartą workflow).
 *   Używany jako:
 *     1. embedded — w Step 2 StationWizard
 *     2. standalone (R47) — domyślny Editor mode w tej powierzchni:
 *        BayEditorStandalone z executeDomainOperation/patchSnapshot fallback
 *     3. legacy — istniejący 8-sekcyjny BayConfigurator (toggle dla zgodności)
 */

import { useCallback, useMemo, useState } from 'react';

import { BayConfigurator } from '../../network-build/bay-configurator/BayConfigurator';
import type {
  BayRoleForValidation,
  BayValidationContext,
} from '../../network-build/bay-configurator/bayValidation';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useAppStateStore } from '../../app-state';
import { notify } from '../../notifications/store';
import type { WorkspaceSurfaceDescriptor } from '../types';
import {
  BayEditorStandalone,
  EMPTY_BAY_DRAFT,
  type BayEditorDraft,
  type BayEditorRole,
} from '../components/BayEditor';

interface BayConfiguratorSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

const DEFAULT_BAY_CONTEXT: BayValidationContext = {
  bayRole: 'OUT',
  designation: 'pole rezerwowe',
  hasOutgoingRun: false,
  isReserveSlot: true,
  hasOutflowPort: true,
  couplerSectionRefs: [],
};

type BayConfigMode = 'editor' | 'legacy';

const BAY_ROLE_TO_EDITOR: Record<BayRoleForValidation, BayEditorRole> = {
  IN: 'LINE_FULL',
  OUT: 'LINE_FULL',
  TR: 'TR_FULL',
  COUPLER: 'COUPLER',
  FEEDER: 'LINE_FULL',
  MEASUREMENT: 'MEASUREMENT',
  OZE: 'OZE',
};

function buildEditorDraftFromBay(
  bayRef: string | null,
  snapshot: ReturnType<typeof useSnapshotStore.getState>['snapshot'],
): BayEditorDraft {
  if (!bayRef || !snapshot) return EMPTY_BAY_DRAFT;
  const bay = (snapshot.bays ?? []).find((b) => b.ref_id === bayRef);
  if (!bay) return EMPTY_BAY_DRAFT;
  const meta = (bay.meta ?? {}) as Record<string, unknown>;
  const role = (bay.bay_role && BAY_ROLE_TO_EDITOR[bay.bay_role as BayRoleForValidation]) || 'LINE_FULL';
  return {
    id: bay.ref_id,
    role,
    cbCatalogRef: (meta['cb_catalog_ref'] as string) ?? '',
    cbIcuKa: (meta['cb_icu_ka'] as number) ?? 16,
    dsCatalogRef: (meta['ds_catalog_ref'] as string) ?? '',
    ctCatalogRef: (meta['ct_catalog_ref'] as string) ?? '',
    ctRatio: (meta['ct_ratio'] as string) ?? '200/5',
    hasVt: Boolean(meta['has_vt']),
    hasSurgeArrester: Boolean(meta['has_surge_arrester'] ?? true),
    hasFuse: Boolean(meta['has_fuse']),
  };
}

export function BayConfiguratorSurface(props: BayConfiguratorSurfaceProps): JSX.Element {
  const { surface } = props;
  const [mode, setMode] = useState<BayConfigMode>('editor');

  if (mode === 'editor') {
    return (
      <BayConfiguratorEditor surface={surface} onSwitchToLegacy={() => setMode('legacy')} />
    );
  }
  return <BayConfiguratorLegacy surface={surface} onSwitchToEditor={() => setMode('editor')} />;
}

/* =============================================================================
   Editor mode (default — Zasada 13)
   ============================================================================= */

interface BayConfiguratorEditorProps {
  readonly surface: WorkspaceSurfaceDescriptor;
  readonly onSwitchToLegacy: () => void;
}

function BayConfiguratorEditor(props: BayConfiguratorEditorProps): JSX.Element {
  const { surface, onSwitchToLegacy } = props;
  const bayRef = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const patchSnapshot = useSnapshotStore((s) => s.patchSnapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const initialDraft = useMemo(() => buildEditorDraftFromBay(bayRef, snapshot), [bayRef, snapshot]);

  const handleSave = useCallback(
    async (final: BayEditorDraft) => {
      if (!bayRef) {
        notify('Brak referencji pola — nie można zapisać.', 'warning');
        return;
      }
      /* Hierarchia per Zasada 6: executeDomainOperation → fallback patchSnapshot. */
      let backendOk = false;
      if (activeCaseId) {
        try {
          const response = await executeDomainOperation(activeCaseId, 'configure-bay', {
            bay_ref: bayRef,
            cb_catalog_ref: final.cbCatalogRef || null,
            cb_icu_ka: final.cbIcuKa,
            ds_catalog_ref: final.dsCatalogRef || null,
            ct_catalog_ref: final.ctCatalogRef || null,
            ct_ratio: final.ctRatio || null,
            has_vt: final.hasVt,
            has_surge_arrester: final.hasSurgeArrester,
            has_fuse: final.hasFuse,
            bay_role: final.role,
          });
          backendOk = Boolean(response);
        } catch {
          backendOk = false;
        }
      }
      if (!backendOk) {
        patchSnapshot(
          (snap) => ({
            ...snap,
            bays: (snap.bays ?? []).map((b) =>
              b.ref_id === bayRef
                ? {
                    ...b,
                    meta: {
                      ...(b.meta ?? {}),
                      cb_catalog_ref: final.cbCatalogRef,
                      cb_icu_ka: final.cbIcuKa,
                      ds_catalog_ref: final.dsCatalogRef,
                      ct_catalog_ref: final.ctCatalogRef,
                      ct_ratio: final.ctRatio,
                      has_vt: final.hasVt,
                      has_surge_arrester: final.hasSurgeArrester,
                      has_fuse: final.hasFuse,
                    },
                  }
                : b,
            ),
          }),
          [bayRef],
        );
        notify('Zapisano pole (lokalnie). Backend operation będzie zsynchronizowany przy następnym refresh.', 'info');
      } else {
        notify('Zapisano pole. Wyniki obliczeń zostały unieważnione (Inv 4).', 'info');
      }
    },
    [activeCaseId, bayRef, executeDomainOperation, patchSnapshot],
  );

  const handleCancel = useCallback(() => {
    notify('Anulowano edycję pola. Model bez zmian.', 'info');
  }, []);

  return (
    <div data-testid="bay-configurator-surface" className="flex h-full w-full flex-col p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
            E-11 · Edytor pola SN (R47 — Zasada 13)
          </div>
          <h2 className="mt-1 text-base font-semibold text-scada-text">
            {bayRef ?? 'Pole niewybrane'}
          </h2>
          {!bayRef && (
            <p className="mt-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
              Brak referencji do pola SN w kontekście. Wybierz pole z lewego nawigatora
              modelu lub kliknij pole w SLD i wybierz "Edytuj pole".
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="bay-mode-editor-switch"
            aria-pressed={true}
            className="rounded bg-scada-accent px-3 py-1 text-xs text-white"
          >
            Editor (R47)
          </button>
          <button
            type="button"
            data-testid="bay-mode-legacy-switch"
            onClick={onSwitchToLegacy}
            className="rounded border border-scada-border px-3 py-1 text-xs text-scada-text hover:bg-scada-hover-nav"
          >
            Widok 8-sekcji (legacy) →
          </button>
        </div>
      </div>
      {bayRef && (
        <div className="flex-1 overflow-auto rounded border border-scada-border bg-scada-panel p-4">
          <BayEditorStandalone
            initialDraft={initialDraft}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}
    </div>
  );
}

/* =============================================================================
   Legacy mode (8 sekcji — backward compat)
   ============================================================================= */

interface BayConfiguratorLegacyProps {
  readonly surface: WorkspaceSurfaceDescriptor;
  readonly onSwitchToEditor: () => void;
}

function BayConfiguratorLegacy(props: BayConfiguratorLegacyProps): JSX.Element {
  const { surface, onSwitchToEditor } = props;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const bayRef = surface.entityRef ?? null;

  const { designation, context } = useMemo(() => {
    if (!bayRef) {
      return { designation: 'Pole niewybrane', context: DEFAULT_BAY_CONTEXT };
    }
    if (!snapshot) {
      return {
        designation: bayRef,
        context: { ...DEFAULT_BAY_CONTEXT, designation: bayRef },
      };
    }
    const bay = (snapshot.bays ?? []).find(
      (b: { ref_id: string }) => b.ref_id === bayRef,
    ) as
      | {
          ref_id: string;
          name?: string;
          bay_role?: string;
          reserve_slot?: boolean;
        }
      | undefined;
    if (!bay) {
      return {
        designation: bayRef,
        context: { ...DEFAULT_BAY_CONTEXT, designation: bayRef },
      };
    }
    const role: BayRoleForValidation =
      bay.bay_role && ['IN', 'OUT', 'TR', 'COUPLER', 'FEEDER', 'MEASUREMENT', 'OZE'].includes(bay.bay_role)
        ? (bay.bay_role as BayRoleForValidation)
        : 'OUT';
    return {
      designation: bay.name ?? bayRef,
      context: {
        bayRole: role,
        designation: bay.name ?? bayRef,
        hasOutgoingRun: false,
        isReserveSlot: Boolean(bay.reserve_slot),
        hasOutflowPort: role !== 'MEASUREMENT',
        couplerSectionRefs: role === 'COUPLER' ? ['SEC-1', 'SEC-2'] : [],
      },
    };
  }, [bayRef, snapshot]);

  return (
    <div data-testid="bay-configurator-surface" className="flex h-full w-full flex-col p-4">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
            E-11 · Konfigurator pola SN (legacy 8-sekcji)
          </div>
          <h2 className="mt-1 text-base font-semibold text-scada-text">
            {designation}
          </h2>
          {!bayRef && (
            <p className="mt-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
              Brak referencji do pola SN w kontekście. Wybierz pole z lewego nawigatora
              modelu lub kliknij pole w SLD i wybierz "Otwórz okno pola".
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="bay-mode-editor-switch"
            onClick={onSwitchToEditor}
            className="rounded border border-scada-border px-3 py-1 text-xs text-scada-text hover:bg-scada-hover-nav"
          >
            ← Editor (R47)
          </button>
          <button
            type="button"
            data-testid="bay-mode-legacy-switch"
            aria-pressed={true}
            className="rounded bg-scada-accent px-3 py-1 text-xs text-white"
          >
            Widok 8-sekcji
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto rounded border border-scada-border">
        <BayConfigurator
          bayId={bayRef ?? 'unselected'}
          designation={designation}
          bayContext={context}
        />
      </div>
    </div>
  );
}

export default BayConfiguratorSurface;
