/**
 * routerSurfaceHeader — komponenty nagłówka powierzchni roboczej
 * (Phase 0 #11 - dwunasta fala decompose).
 *
 * MiniSldCard + SurfaceHeader z dependency injection na store hooks.
 */

import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import { useSelectionStore } from '../selection';
import { useSnapshotStore } from '../topology/snapshotStore';
import { SurfaceBreadcrumbs } from './SurfaceBreadcrumbs';
import { resolveSurfaceObjectLabel, resolveSurfaceTitle } from './routerLabelHelpers';
import type { WorkspaceSurfaceDescriptor } from './types';

export function MiniSldCard({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const selectedElement = useSelectionStore((state) => state.selectedElement);

  if (!surface.supportsMiniSld) {
    return null;
  }

  const objectLabel = resolveSurfaceObjectLabel(surface, snapshot, selectedElement);
  return (
    <div
      data-testid="workspace-mini-sld"
      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Podgląd schematu</div>
      <div className="mt-2 text-sm font-medium">
        Kontekst układu jest zsynchronizowany z głównym schematem.
      </div>
      <div className="mt-1 text-xs text-slate-600">
        Powiązany obiekt: {objectLabel}.
      </div>
    </div>
  );
}

export function SurfaceHeader({ surface }: { surface: WorkspaceSurfaceDescriptor }) {
  const session = useNetworkBuildStore((state) => state.surfaceSessions[surface.surfaceId] ?? null);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const selectedElement = useSelectionStore((state) => state.selectedElement);
  const titlePl = resolveSurfaceTitle(surface, snapshot, selectedElement);

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <SurfaceBreadcrumbs surface={surface} currentTitlePl={titlePl} />
          <h2 className="text-sm font-semibold text-slate-900">{titlePl}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {session?.hasUnsavedChanges && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
              Zmiany robocze
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
