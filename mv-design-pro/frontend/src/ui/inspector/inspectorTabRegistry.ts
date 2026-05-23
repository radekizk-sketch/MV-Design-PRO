import type { ElementType } from '../types';

export type InspectorTabId =
  | 'identyfikacja'
  | 'parametry'
  | 'katalog'
  | 'wyniki'
  | 'uzasadnienie'
  | 'gotowosc'
  | 'zabezpieczenia'
  | 'automatyka'
  | 'historia';

export interface InspectorTabDefinition {
  id: InspectorTabId;
  label: string;
  applicableTo: readonly (ElementType | 'ANY' | 'RESULT' | 'AUDIT')[];
  unavailableReason: string;
  repairActionLabel: string;
}

export const INSPECTOR_TABS: readonly InspectorTabDefinition[] = [
  { id: 'identyfikacja', label: 'Identyfikacja', applicableTo: ['ANY'], unavailableReason: 'Wybierz obiekt sieci albo wynik analizy.', repairActionLabel: 'Wybierz obiekt na SLD' },
  { id: 'parametry', label: 'Parametry', applicableTo: ['Bus', 'LineBranch', 'TransformerBranch', 'Switch', 'Source', 'Load', 'Generator', 'Measurement', 'ProtectionAssignment', 'Terminal', 'Station', 'BranchPole', 'ZKSN', 'BaySN', 'Relay', 'NOP', 'BusNN', 'FeederNN', 'SegmentNN', 'LoadNN', 'PVInverter', 'BESSInverter', 'EnergyStorage'], unavailableReason: 'Wybrany element nie ma parametrów edycyjnych.', repairActionLabel: 'Otwórz element modelu sieci' },
  { id: 'katalog', label: 'Katalog', applicableTo: ['Bus', 'LineBranch', 'TransformerBranch', 'Switch', 'Source', 'Generator', 'Measurement', 'Station', 'BaySN', 'PVInverter', 'BESSInverter', 'EnergyStorage'], unavailableReason: 'Powiązanie katalogowe dostępne dla elementów katalogowych.', repairActionLabel: 'Wybierz wariant katalogowy' },
  { id: 'wyniki', label: 'Wyniki', applicableTo: ['ANY', 'RESULT'], unavailableReason: 'Wyniki pojawią się po wykonaniu obliczeń.', repairActionLabel: 'Uruchom obliczenia' },
  { id: 'uzasadnienie', label: 'Uzasadnienie', applicableTo: ['ANY', 'RESULT'], unavailableReason: 'Uzasadnienie pojawi się po wykonaniu obliczeń.', repairActionLabel: 'Pokaż ślad obliczeń' },
  { id: 'gotowosc', label: 'Kontrola', applicableTo: ['ANY'], unavailableReason: 'Warunki kontroli zostaną wyznaczone dla wybranego układu.', repairActionLabel: 'Sprawdź konfigurację' },
  { id: 'zabezpieczenia', label: 'Zabezpieczenia', applicableTo: ['BaySN', 'Switch', 'Relay', 'ProtectionAssignment', 'Station', 'Source'], unavailableReason: 'Zabezpieczenia dostępne dla pól, stacji, GPZ i przekaźników.', repairActionLabel: 'Edytuj zabezpieczenia' },
  { id: 'automatyka', label: 'Automatyka', applicableTo: ['BaySN', 'Switch', 'Station', 'Source'], unavailableReason: 'Automatyka dostępna dla pól, stacji i GPZ.', repairActionLabel: 'Edytuj automatykę' },
  { id: 'historia', label: 'Historia', applicableTo: ['ANY', 'AUDIT'], unavailableReason: 'Historia audytu pojawi się po wskazaniu układu.', repairActionLabel: 'Otwórz historię i audyt' },
];

export function getVisibleInspectorTabs(elementType: ElementType | null): InspectorTabDefinition[] {
  if (!elementType) {
    return INSPECTOR_TABS.filter((tab) => tab.id === 'identyfikacja' || tab.id === 'gotowosc' || tab.id === 'historia');
  }
  return INSPECTOR_TABS.filter(
    (tab) => tab.applicableTo.includes('ANY') || (tab.applicableTo as readonly string[]).includes(elementType),
  );
}
