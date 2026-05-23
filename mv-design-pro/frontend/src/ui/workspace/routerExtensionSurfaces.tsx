/**
 * routerExtensionSurfaces — Surface wrappers dla E-09 (Historia i audyt).
 *
 * E-35 (Wyniki) i E-37 (Raporty) są obsługiwane przez AnalysisSurface/ReportSurface
 * (już istniejące, comprehensive). OsdDataForm, ReportProfileSelector, SensitivityPanel
 * są używane jako standalone modals/panels w odpowiednich kontekstach.
 *
 * Phase 1 plan: etap 17 (AuditTrail).
 */

import type { WorkspaceSurfaceDescriptor } from './types';
import { AuditTrailPanel } from '../audit/AuditTrailPanel';
import { useSelectionStore } from '../selection';

function selectElementByRef(
  selectElement: (el: { id: string; type: 'Bus'; name: string } | null) => void,
  ref: string,
): void {
  selectElement({ id: ref, type: 'Bus', name: ref });
}

export function AuditTrailSurface({ surface: _surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const selectElement = useSelectionStore((state) => state.selectElement);
  return (
    <div className="space-y-4 p-4">
      <AuditTrailPanel onSelectElement={(ref) => selectElementByRef(selectElement, ref)} />
    </div>
  );
}
