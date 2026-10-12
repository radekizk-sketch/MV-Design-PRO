/**
 * E05 — powierzchnia rzeczywistego pola SN.
 * Domyślnie stanowisko E05: ENM + katalog OEM + SldCanvasV3.
 * Dotychczasowy BayConfigurator zachowany jako widok pomocniczy, bez
 * konstruowania fikcyjnego pola rezerwowego lub sekcji sprzęgła.
 */
import { useMemo, useState } from 'react';

import { BayConfigurator } from '../../network-build/bay-configurator/BayConfigurator';
import { E05BayEngineeringEditor } from '../../network-build/bay-configurator/E05BayEngineeringEditor';
import type { BayRoleForValidation, BayValidationContext } from '../../network-build/bay-configurator/bayValidation';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface BayConfiguratorSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

export function BayConfiguratorSurface({ surface }: BayConfiguratorSurfaceProps): JSX.Element {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const [legacy, setLegacy] = useState(false);
  const bayRef = surface.entityRef ?? null;
  const bay = useMemo(() => snapshot?.bays.find((b) => b.ref_id === bayRef), [snapshot, bayRef]);

  // Starszy walidator R1–R6 wymaga kontekstu. Przekazujemy WYŁĄCZNIE fakty
  // obecne w ENM; brak jawnych danych sekcji sprzęgła pozostaje brakiem.
  const context: BayValidationContext | null = useMemo(() => {
    if (!bay) return null;
    const role: BayRoleForValidation = bay.bay_role;
    const ports = bay.ports ?? [];
    return {
      bayRole: role,
      designation: bay.name,
      hasOutgoingRun: ports.some((p) => Boolean(p.occupied_by) && p.kind !== 'sn_input'),
      isReserveSlot: ports.some((p) => p.kind === 'sn_reserve') && ports.every((p) => !p.occupied_by),
      hasOutflowPort: ports.some((p) => p.kind === 'sn_output' || p.kind === 'sn_branch' || p.kind === 'sn_transformer'),
      transformerConnectedRef: role === 'TR' ? bay.outgoing_destination_ref ?? null : undefined,
      derAttachmentPointPl: role === 'OZE' ? bay.outgoing_destination_ref ?? null : undefined,
      derKind: undefined,
      // Sekcje sprzęgła wymagają osobnego kontraktu ENM; nigdy ['SEC-1','SEC-2'].
      couplerSectionRefs: [],
    };
  }, [bay]);

  return (
    <div data-testid="bay-configurator-surface" className="flex h-full min-h-0 w-full flex-col">
      {legacy && context && bay ? (
        <>
          <div className="flex items-center justify-between border-b border-scada-border bg-scada-surface px-4 py-2 text-xs">
            <span className="text-status-warn">Widok starszego konfiguratora · niepełny kontekst połączeń i sprzęgła</span>
            <button type="button" onClick={() => setLegacy(false)}
              className="rounded border border-scada-border px-3 py-1.5">Powrót do E05</button>
          </div>
          <div className="min-h-0 flex-1"><BayConfigurator bayId={bay.ref_id} designation={bay.name} bayContext={context}/></div>
        </>
      ) : (
        <E05BayEngineeringEditor bayRef={bayRef} onOpenLegacyEditor={context ? () => setLegacy(true) : undefined}/>
      )}
    </div>
  );
}

export default BayConfiguratorSurface;
