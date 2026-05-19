import type { AreaId } from '../../navigation/areaRegistry';
import { normalizeAreaId } from '../../navigation/areaRegistry';
import { MoContextPanel } from './MoContextPanel';
import { AnContextPanel } from './AnContextPanel';
import { SchematContextPanel } from './SchematContextPanel';
import { WynikiContextPanel } from './WynikiContextPanel';
import { ZaContextPanel } from './ZaContextPanel';
import { OzContextPanel } from './OzContextPanel';
import { RaContextPanel } from './RaContextPanel';
import { AdContextPanel } from './AdContextPanel';
import { HiContextPanel } from './HiContextPanel';

interface AreaContextPanelProps {
  areaCode: AreaId | string;
}

export function AreaContextPanel({ areaCode }: AreaContextPanelProps) {
  const normalizedArea = normalizeAreaId(areaCode);
  switch (normalizedArea) {
    case 'MODEL_SIECI':
      return <MoContextPanel />;
    case 'SCHEMAT_TOPOLOGIA':
      return <SchematContextPanel />;
    case 'STUDIA_OBLICZENIOWE':
      return <AnContextPanel />;
    case 'WYNIKI_ANALIZY':
      return <WynikiContextPanel />;
    case 'ZABEZPIECZENIA_AUTOMATYKA':
      return <ZaContextPanel />;
    case 'ZRODLA_PRZYLACZENIA':
      return <OzContextPanel />;
    case 'RAPORTY_UZASADNIENIA':
      return <RaContextPanel />;
    case 'KATALOGI_TECHNICZNE':
      return <AdContextPanel />;
    case 'HISTORIA_AUDYT':
      return <HiContextPanel />;
    default:
      return (
        <div
          data-testid="unknown-context-panel"
          className="flex h-full items-center justify-center bg-scada-panel p-4 text-[11px] text-scada-muted"
        >
          Nie można rozpoznać obszaru roboczego. Wróć do obszaru Budowa sieci.
        </div>
      );
  }
}
