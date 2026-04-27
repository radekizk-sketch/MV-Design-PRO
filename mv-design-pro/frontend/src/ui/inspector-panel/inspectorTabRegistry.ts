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
  { id: 'katalog', label: 'Katalog', applicableTo: ['Bus', 'LineBranch', 'TransformerBranch', 'Switch', 'Source', 'Generator', 'Measurement', 'Station', 'BaySN', 'PVInverter', 'BESSInverter', 'EnergyStorage'], unavailableReason: 'Brak powiązania z danymi katalogowymi.', repairActionLabel: 'Przypisz typ katalogowy' },
  { id: 'wyniki', label: 'Wyniki', applicableTo: ['ANY', 'RESULT'], unavailableReason: 'Brak wyników dla aktualnego wariantu pracy.', repairActionLabel: 'Uruchom obliczenia' },
  { id: 'uzasadnienie', label: 'Uzasadnienie', applicableTo: ['ANY', 'RESULT'], unavailableReason: 'Brak uzasadnienia dla bieżącego wyniku.', repairActionLabel: 'Pokaż ślad obliczeń' },
  { id: 'gotowosc', label: 'Gotowość', applicableTo: ['ANY'], unavailableReason: 'Nie zidentyfikowano warunków gotowości.', repairActionLabel: 'Sprawdź gotowość modelu' },
  { id: 'zabezpieczenia', label: 'Zabezpieczenia', applicableTo: ['BaySN', 'Switch', 'Relay', 'ProtectionAssignment', 'Station', 'Source'], unavailableReason: 'Wybrany obiekt nie ma przypisanych zabezpieczeń.', repairActionLabel: 'Edytuj zabezpieczenia' },
  { id: 'automatyka', label: 'Automatyka', applicableTo: ['BaySN', 'Switch', 'Station', 'Source'], unavailableReason: 'Wybrany obiekt nie ma automatyki.', repairActionLabel: 'Edytuj automatykę' },
  { id: 'historia', label: 'Historia', applicableTo: ['ANY', 'AUDIT'], unavailableReason: 'Brak zdarzeń audytowych dla wyboru.', repairActionLabel: 'Otwórz historię i audyt' },
];

export function getVisibleInspectorTabs(elementType: ElementType | null): InspectorTabDefinition[] {
  if (!elementType) {
    return INSPECTOR_TABS.filter((tab) => tab.id === 'identyfikacja' || tab.id === 'gotowosc' || tab.id === 'historia');
  }
  return INSPECTOR_TABS.filter(
    (tab) => tab.applicableTo.includes('ANY') || (tab.applicableTo as readonly string[]).includes(elementType),
  );
}
