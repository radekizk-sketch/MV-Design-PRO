/**
 * BayConfiguratorSurface (E-11) — wrapper konfiguratora pola SN.
 *
 * Etap 3 dostawy: udostępnia istniejący BayConfigurator (8 sekcji + 6 reguł
 * walidacji R1-R6) jako powierzchnię workspace. Dane bay'a czytane z snapshotu
 * (snapshot.bays); gdy brak — minimalny kontekst rezerwowy.
 */

import { useMemo } from 'react';

import { BayConfigurator } from '../../network-build/bay-configurator/BayConfigurator';
import type {
  BayRoleForValidation,
  BayValidationContext,
} from '../../network-build/bay-configurator/bayValidation';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { WorkspaceSurfaceDescriptor } from '../types';

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

export function BayConfiguratorSurface(props: BayConfiguratorSurfaceProps): JSX.Element {
  const { surface } = props;
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
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
          E-11 · Konfigurator pola SN
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
