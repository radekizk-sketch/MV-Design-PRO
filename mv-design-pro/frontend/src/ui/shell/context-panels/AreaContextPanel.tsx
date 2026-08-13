import type { ObszarKontekstu } from '../../../ui2/legacy/mostObszarow';
import { MoContextPanel } from './MoContextPanel';
import { AnContextPanel } from './AnContextPanel';
import { SchematContextPanel } from './SchematContextPanel';
import { WynikiContextPanel } from './WynikiContextPanel';
import { ZaContextPanel } from './ZaContextPanel';
import { OzContextPanel } from './OzContextPanel';
import { RaContextPanel } from './RaContextPanel';
import { AdContextPanel } from './AdContextPanel';
import { HiContextPanel } from './HiContextPanel';

/**
 * Panel kontekstu lewego doku. D1: klucz `obszar` jest WYPROWADZANY Z TRASY
 * przez `ui2/legacy/mostObszarow.obszarDlaTrasy` — nie ma juz rownoleglego
 * stanu `activeArea` ani normalizacji nierozpoznanych napisow (typ zamkniety,
 * wiec `default` nie moze wystapic i gałąź „nieznany obszar" znika).
 */
interface AreaContextPanelProps {
  obszar: ObszarKontekstu;
}

export function AreaContextPanel({ obszar }: AreaContextPanelProps) {
  switch (obszar) {
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
  }
}
