/**
 * AreaContextPanel — Router 7 obszarów (MO/AN/ZA/OZ/RA/AD/HI).
 *
 * Zwraca odpowiedni komponent kontekstowy dla aktywnego obszaru z NavigationRail.
 * Catalog-first, no codenames, dark SCADA palette.
 */

import type { AreaCode } from '../../app-state/store';
import { MoContextPanel } from './MoContextPanel';
import { AnContextPanel } from './AnContextPanel';
import { ZaContextPanel } from './ZaContextPanel';
import { OzContextPanel } from './OzContextPanel';
import { RaContextPanel } from './RaContextPanel';
import { AdContextPanel } from './AdContextPanel';
import { HiContextPanel } from './HiContextPanel';

interface AreaContextPanelProps {
  areaCode: AreaCode;
}

export function AreaContextPanel({ areaCode }: AreaContextPanelProps) {
  switch (areaCode) {
    case 'MO':
      return <MoContextPanel />;
    case 'AN':
      return <AnContextPanel />;
    case 'ZA':
      return <ZaContextPanel />;
    case 'OZ':
      return <OzContextPanel />;
    case 'RA':
      return <RaContextPanel />;
    case 'AD':
      return <AdContextPanel />;
    case 'HI':
      return <HiContextPanel />;
    default:
      return (
        <div
          data-testid="unknown-context-panel"
          className="flex h-full items-center justify-center bg-scada-panel p-4 text-[11px] text-scada-muted"
        >
          Nieznany obszar: {areaCode}
        </div>
      );
  }
}
