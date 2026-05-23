/**
 * SurfaceBreadcrumbs — okruszki nawigacji powierzchni roboczej
 * (Phase 0 #11 cd. - ósma fala decompose WorkspaceSurfaceRouter).
 */

import { useNetworkBuildStore } from '../network-build/networkBuildStore';
import type { WorkspaceSurfaceDescriptor } from './types';

interface SurfaceBreadcrumbsProps {
  surface: WorkspaceSurfaceDescriptor;
  currentTitlePl: string;
}

export function SurfaceBreadcrumbs({
  surface,
  currentTitlePl,
}: SurfaceBreadcrumbsProps) {
  const collapseSurfaceStackTo = useNetworkBuildStore((state) => state.collapseSurfaceStackTo);

  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
      {surface.breadcrumbs.map((crumb, index) => (
        <div key={`${crumb.labelPl}-${index}`} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => collapseSurfaceStackTo(crumb.surfaceId)}
            className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-800"
          >
            {index === surface.breadcrumbs.length - 1 ? currentTitlePl : crumb.labelPl}
          </button>
          {index < surface.breadcrumbs.length - 1 && <span>/</span>}
        </div>
      ))}
    </div>
  );
}
