export type TechnicalDebtRisk = 'low' | 'medium' | 'high' | 'critical';

export interface TechnicalDebtItem {
  code: string;
  owner: string;
  risk: TechnicalDebtRisk;
  scope: string;
  plan: string;
}

export const TECHNICAL_DEBT_REGISTRY: readonly TechnicalDebtItem[] = [
  {
    code: 'V12-CANON-WORKSPACE-SCREEN-REMAP',
    owner: 'MV-DESIGN-PRO UI/UX',
    risk: 'high',
    scope: 'Istniejący router powierzchni roboczych ma historyczne znaczenia części kodów E-10..E-34.',
    plan: 'Utrzymać osobny kanoniczny rejestr ekranów E-00..E-39 jako kontrakt UI, a w kolejnym kroku przepiąć operacje modalne na nowe kody bez łamania istniejących tras.',
  },
  {
    code: 'V12-CANON-ADVANCED-SOLVERS',
    owner: 'MV-DESIGN-PRO obliczenia',
    risk: 'high',
    scope: 'Zaawansowane analizy stabilności dynamicznej, pełne FRT i komplet typów generatorów wymagają potwierdzenia pokrycia backendu.',
    plan: 'Każdy moduł analityczny ma jawny ekran, ikonę, menu, wynik i raport; brak solvera musi blokować uruchomienie formalnym stanem z akcją naprawczą.',
  },
];

export function hasRegisteredDebt(code: string): boolean {
  return TECHNICAL_DEBT_REGISTRY.some((item) => item.code === code);
}
