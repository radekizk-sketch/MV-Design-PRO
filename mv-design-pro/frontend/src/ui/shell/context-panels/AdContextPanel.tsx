/**
 * AdContextPanel — Panel kontekstu obszaru AD (Administracja).
 *
 * Wyświetla:
 *  - Bibliotekę typów (catalog) z 16 kategoriami
 *  - Pochodzi z TypeLibraryBrowser (catalog-first)
 *
 * Catalog-first, no codenames, dark SCADA palette.
 */

import { TypeLibraryBrowser } from '../../catalog/TypeLibraryBrowser';

export function AdContextPanel() {
  return (
    <div
      data-testid="ad-context-panel"
      className="flex h-full flex-col overflow-hidden bg-scada-panel"
    >
      <div className="border-b border-scada-border px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
          Katalogi techniczne
        </span>
        <div className="mt-1 text-[10px] text-scada-muted">
          Każdy element sieci powinien mieć przypisany typ katalogowy aparatury,
          przewodu, transformatora albo profilu technicznego.
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <TypeLibraryBrowser />
      </div>
    </div>
  );
}
