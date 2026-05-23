import type { StationWizardStepId } from './stationWizardContract';

export type CalculationTemplateBlockId =
  | 'mv_cable_selection'
  | 'short_circuit_and_apparatus'
  | 'ct_vt_metering'
  | 'power_quality_analyzer_circuit'
  | 'transformer_lv_losses'
  | 'station_earthing'
  | 'der_inverter_balance'
  | 'engineering_report';

export interface CalculationTemplateBlock {
  readonly id: CalculationTemplateBlockId;
  readonly title: string;
  readonly sourceSheets: readonly string[];
  readonly sourceRangeHint: string;
  readonly stepIds: readonly StationWizardStepId[];
  readonly requiredInputs: readonly string[];
  readonly catalogBindings: readonly string[];
  readonly backendProofs: readonly string[];
  readonly designerOutcome: string;
  readonly backendComputationOnly: true;
}

export const PROJECT_CALCULATION_TEMPLATE_SOURCE = {
  workbook: 'obliczenia do projektów v3 MT880.xlsx',
  role:
    'Szablon porządkuje przebieg projektu: dane wejściowe, dobór katalogowy, sprawdzenia i dowody. MT880 jest modelem licznika w przykładzie, nie nazwą metody obliczeń.',
} as const;

export const PROJECT_CALCULATION_TEMPLATE_BLOCKS: readonly CalculationTemplateBlock[] = [
  {
    id: 'mv_cable_selection',
    title: 'Dobór kabla SN i odcinka przyłączeniowego',
    sourceSheets: ['obliczenia ', 'Arkusz5', 'Table003 (Page 2)', 'Table004 (Page 3)', 'Table005 (Page 4-5)'],
    sourceRangeHint: 'obliczenia: wiersze 1-49; tabele katalogowe kabla: strony 2-5',
    stepIds: ['cable', 'network'],
    requiredInputs: [
      'typ kabla albo linii z katalogu',
      'przekrój żyły roboczej i żyły powrotnej',
      'długość odcinka i sposób ułożenia',
      'napięcie U1n/U2n, moc P, cosφ',
      'prąd dopuszczalny Idd i współczynniki ułożenia',
    ],
    catalogBindings: [
      'MV line segment solution',
      'MV cable physical table',
      'MV cable ampacity table',
      'return conductor table',
    ],
    backendProofs: [
      'obciążalność długotrwała kabla',
      'spadek napięcia odcinka',
      'wytrzymałość zwarciowa żyły roboczej',
      'wytrzymałość zwarciowa żyły powrotnej',
    ],
    designerOutcome:
      'Projektant wybiera kompletny wariant odcinka SN, a system pokazuje, które dowody obliczeniowe zostaną powiązane z tym odcinkiem.',
    backendComputationOnly: true,
  },
  {
    id: 'short_circuit_and_apparatus',
    title: 'Zwarcia, aparatura i warunki I_dyn/I_th',
    sourceSheets: ['obliczenia '],
    sourceRangeHint: 'obliczenia: wiersze 50-107',
    stepIds: ['switchgear', 'bays', 'apparatus', 'protection', 'network'],
    requiredInputs: [
      'moc zwarciowa GPZ albo wynik solvera IEC 60909',
      'parametry R/X toru zasilania',
      'czasy wyłączenia i nastawy zabezpieczeń',
      'Ith oraz Idyn aparatury z katalogu',
    ],
    catalogBindings: [
      'MV switchgear solution',
      'Protection solution',
      'IEC 60909 result trace',
    ],
    backendProofs: [
      'prąd zwarciowy 3-fazowy SC3F',
      'prąd udarowy I_dyn',
      'prąd cieplny I_th',
      'sprawdzenie wytrzymałości aparatury',
    ],
    designerOutcome:
      'Krok aparatury i zabezpieczeń nie pokazuje luźnych aparatów, tylko powiązanie pola SN z wynikami zwarciowymi i dowodem doboru.',
    backendComputationOnly: true,
  },
  {
    id: 'transformer_lv_losses',
    title: 'Transformator, straty i strona nN',
    sourceSheets: ['Bezpośredni', 'Półpośredni', 'pośredni', 'obliczenia '],
    sourceRangeHint: 'arkusze pomiarowe: straty transformatora i kabla nN; obliczenia: moc P, U2n i prądy znamionowe',
    stepIds: ['trafo', 'nn'],
    requiredInputs: [
      'wariant transformatora SN/nN z katalogu',
      'moc znamionowa, układ połączeń i napięcia U1/U2',
      'straty jałowe i obciążeniowe z karty katalogowej',
      'rozdzielnica nN i odpływy nN',
      'odbiorniki albo źródła przyłączone do szyny nN',
    ],
    catalogBindings: [
      'MV/LV transformer catalog',
      'LV switchgear solution',
      'load package catalog',
      'station loss proof binding',
    ],
    backendProofs: [
      'prądy znamionowe transformatora',
      'straty transformatora',
      'straty i obciążenie strony nN',
      'sprawdzenie obciążenia odpływów nN',
    ],
    designerOutcome:
      'Transformator i rozdzielnica nN są dobierane jako część kompletnego wariantu stacji, a nie jako oddzielne wartości wpisane ręcznie.',
    backendComputationOnly: true,
  },
  {
    id: 'ct_vt_metering',
    title: 'Przekładniki prądowe i napięciowe, licznik i obwody wtórne',
    sourceSheets: ['obliczenia ', 'Przekładniki zabezpieczenia'],
    sourceRangeHint: 'obliczenia: wiersze 109-252; arkusz przekładników: wiersze 1-62',
    stepIds: ['ct', 'vt', 'meters'],
    requiredInputs: [
      'przekładnia CT/VT i liczba rdzeni albo uzwojeń',
      'klasa dokładności i moc znamionowa każdego rdzenia',
      'odbiorniki wtórne: licznik i zabezpieczenie',
      'długość, przekrój i materiał przewodów wtórnych',
      'dopuszczalny spadek napięcia obwodów VT',
    ],
    catalogBindings: [
      'Measurement transformer catalog',
      'Meter catalog',
      'Protection relay catalog',
      'secondary wiring catalog',
    ],
    backendProofs: [
      'bilans obciążenia rdzeni CT',
      'bilans obciążenia uzwojeń VT',
      'spadek napięcia w obwodach VT',
      'zgodność klas pomiarowych i zabezpieczeniowych',
    ],
    designerOutcome:
      'Kreator prowadzi przez rdzenie pomiarowe, licznik i zabezpieczenia, a wynik liczy backend.',
    backendComputationOnly: true,
  },
  {
    id: 'power_quality_analyzer_circuit',
    title: 'Analizator jakości energii klasy A',
    sourceSheets: ['obliczenia ', 'Przekładniki zabezpieczenia', 'arkusze jakości energii'],
    sourceRangeHint:
      'osobny obwód CT/VT analizatora: pobór U/I, klasa A, raport EN 50160 / IEC 61000-4-30',
    stepIds: ['ct', 'vt', 'pq', 'infra', 'readiness'],
    requiredInputs: [
      'analizator jakości energii klasy A z katalogu',
      'osobny rdzeń CT i uzwojenie VT dla analizatora',
      'pobór obwodów napięciowych i prądowych z karty katalogowej analizatora',
      'zakres raportu: EN 50160, harmoniczne, flicker, asymetria, zdarzenia',
      'kanał komunikacji, synchronizacja czasu i profil archiwizacji',
    ],
    catalogBindings: [
      'Power quality analyzer catalog',
      'Measurement transformer catalog',
      'secondary wiring catalog',
      'power quality report profile',
    ],
    backendProofs: [
      'bilans obciążenia rdzenia CT analizatora',
      'bilans obciążenia uzwojenia VT analizatora',
      'spadek napięcia obwodu VT analizatora',
      'raport jakości energii klasy A',
    ],
    designerOutcome:
      'Analizator jakości energii jest konfigurowany jako osobny układ pomiarowy klasy A, niezależny od licznika rozliczeniowego.',
    backendComputationOnly: true,
  },
  {
    id: 'station_earthing',
    title: 'Uziemienie stacji i warunek napięcia zakłóceniowego',
    sourceSheets: ['obliczenia ', 'Arkusz2'],
    sourceRangeHint: 'obliczenia: wiersze 254-308; Arkusz2: rezystancja uziomu otokowego',
    stepIds: ['earthing', 'network'],
    requiredInputs: [
      'układ pracy punktu neutralnego sieci SN',
      'pojemnościowy i czynny prąd zwarcia doziemnego',
      'czas doziemienia tF i automatyka SPZ',
      'rezystywność gruntu',
      'geometria uziomu otokowego i pionowego',
    ],
    catalogBindings: [
      'Earthing solution',
      'MV network neutral grounding profile',
      'station civil-earthing template',
    ],
    backendProofs: [
      'prąd doziemienia IK1',
      'dopuszczalne napięcie zakłóceniowe UF',
      'wymagana rezystancja uziemienia RB',
      'rezystancja uziomu otokowego i pionowego',
    ],
    designerOutcome:
      'Stacja otrzymuje wariant uziemienia jako element układu, a nie pole tekstowe wpisywane po fakcie.',
    backendComputationOnly: true,
  },
  {
    id: 'der_inverter_balance',
    title: 'PV/BESS/FW, inwertery i bilans AC/DC',
    sourceSheets: ['Arkusz1', 'Arkusz3'],
    sourceRangeHint: 'Arkusz1/Arkusz3: grupy Master/Slave, inwertery MSE, stringi, DC/AC',
    stepIds: ['sources', 'pq', 'ncrfg'],
    requiredInputs: [
      'wariant przyłączenia: nN, SN albo transformator blokowy',
      'liczba inwerterów i moc AC',
      'liczba stringów, modułów i moc DC',
      'stosunek DC/AC',
      'profil wymagań PTPiREE/NC RfG',
    ],
    catalogBindings: [
      'DER connection solution',
      'certified inverter catalog',
      'PV module catalog',
      'NC RfG profile',
    ],
    backendProofs: [
      'bilans mocy AC/DC',
      'sprawdzenie punktu PCC',
      'weryfikacja wymagań NC RfG',
      'wpływ DER na rozpływ mocy i profile napięciowe',
    ],
    designerOutcome:
      'Kreator pokazuje DER jako kompletny pakiet przyłączeniowy stacji, nie jako pojedynczy przycisk dodający ikonę źródła.',
    backendComputationOnly: true,
  },
  {
    id: 'engineering_report',
    title: 'Pakiet dowodów i raport techniczny',
    sourceSheets: ['Bezpośredni', 'Półpośredni', 'pośredni', 'obliczenia '],
    sourceRangeHint: 'arkusze strat, pomiarów i obliczeń: komplet śladu do raportu',
    stepIds: ['readiness', 'network', 'meters', 'infra'],
    requiredInputs: [
      'aktywny przypadek obliczeniowy',
      'powiązanie obiektu z odcinkiem, stacją i polem SN',
      'wyniki solverów backendowych',
      'wybrane dowody i format eksportu',
    ],
    catalogBindings: [
      'Report/proof binding solution',
      'Calculation run result set',
      'station technical card',
    ],
    backendProofs: [
      'dowód doboru kabla',
      'dowód zwarciowy',
      'dowód przekładników',
      'dowód uziemienia',
      'dowód DER i jakości energii',
    ],
    designerOutcome:
      'Ostatni krok jest zestawieniem audytowalnych dowodów, które mają wynikać z danych katalogowych i wyników backendu.',
    backendComputationOnly: true,
  },
];

export function getCalculationTemplateBlocksForStep(
  stepId: StationWizardStepId,
): readonly CalculationTemplateBlock[] {
  return PROJECT_CALCULATION_TEMPLATE_BLOCKS.filter((block) => block.stepIds.includes(stepId));
}

export function getCalculationTemplateCoverageReport(): Readonly<Record<StationWizardStepId, number>> {
  const report = {} as Record<StationWizardStepId, number>;
  for (const block of PROJECT_CALCULATION_TEMPLATE_BLOCKS) {
    for (const stepId of block.stepIds) {
      report[stepId] = (report[stepId] ?? 0) + 1;
    }
  }
  return report;
}

export function summarizeCalculationTemplateBlocks() {
  const uniqueInputs = new Set<string>();
  const uniqueCatalogBindings = new Set<string>();
  const uniqueBackendProofs = new Set<string>();
  const uniqueSourceSheets = new Set<string>();

  for (const block of PROJECT_CALCULATION_TEMPLATE_BLOCKS) {
    block.requiredInputs.forEach((item) => uniqueInputs.add(item));
    block.catalogBindings.forEach((item) => uniqueCatalogBindings.add(item));
    block.backendProofs.forEach((item) => uniqueBackendProofs.add(item));
    block.sourceSheets.forEach((item) => uniqueSourceSheets.add(item));
  }

  return {
    blockCount: PROJECT_CALCULATION_TEMPLATE_BLOCKS.length,
    inputCount: uniqueInputs.size,
    catalogBindingCount: uniqueCatalogBindings.size,
    backendProofCount: uniqueBackendProofs.size,
    sourceSheetCount: uniqueSourceSheets.size,
  } as const;
}
