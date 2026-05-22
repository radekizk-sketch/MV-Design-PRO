/**
 * Katalog analizatorów jakości energii klasy A.
 *
 * To jest osobny katalog względem liczników rozliczeniowych. Liczniki
 * LZQJ/ZMD/MT880 mierzą energię i profil rozliczeniowy, natomiast analizatory
 * ND45/PQI-DA/PQM-750 służą do jakości energii, zdarzeń, harmonicznych,
 * flickera i raportów EN 50160 / IEC 61000-4-30.
 */

export type PowerQualityAnalyzerAccuracyClass =
  | 'IEC_61000_4_30_CLASS_A'
  | 'IEC_61000_4_30_CLASS_A_SELECTED_PARAMETERS';

export type PowerQualityAnalyzerInstallation =
  | 'panel'
  | 'fixed_stationary'
  | 'portable_or_fixed';

export type PowerQualityAnalyzerStandard =
  | 'EN_50160'
  | 'IEC_61000_4_30'
  | 'IEC_61000_4_7'
  | 'IEC_61000_4_15'
  | 'IEC_62586_1'
  | 'IEC_62586_2';

export const POWER_QUALITY_STANDARD_LABEL_PL: Record<PowerQualityAnalyzerStandard, string> = {
  EN_50160: 'EN 50160',
  IEC_61000_4_30: 'IEC 61000-4-30',
  IEC_61000_4_7: 'IEC 61000-4-7',
  IEC_61000_4_15: 'IEC 61000-4-15',
  IEC_62586_1: 'IEC 62586-1',
  IEC_62586_2: 'IEC 62586-2',
};

export interface PowerQualityAnalyzerCatalogEntry {
  readonly modelRef: string;
  readonly manufacturerRef: string;
  readonly productName: string;
  readonly accuracyClass: PowerQualityAnalyzerAccuracyClass;
  readonly accuracyClassLabelPl: string;
  readonly installation: PowerQualityAnalyzerInstallation;
  readonly voltageInputModePl: string;
  readonly currentInputModePl: string;
  readonly secondaryCircuitBurdenSourcePl: string;
  readonly reportStandards: readonly PowerQualityAnalyzerStandard[];
  readonly measuredPhenomenaPl: readonly string[];
  readonly communicationModes: readonly string[];
  readonly catalogSourceLabel: string;
}

export interface PowerQualityAnalyzerChannelAssignment {
  readonly analyzerRef: string;
  readonly ctCoreId: string;
  readonly vtWindingId: string;
  readonly purposePl: string;
}

export const POWER_QUALITY_ANALYZER_CATALOG: readonly PowerQualityAnalyzerCatalogEntry[] = [
  {
    modelRef: 'ND45',
    manufacturerRef: 'Lumel',
    productName: 'Power network analyzer / recorder ND45',
    accuracyClass: 'IEC_61000_4_30_CLASS_A_SELECTED_PARAMETERS',
    accuracyClassLabelPl: 'klasa A dla wybranych parametrów IEC 61000-4-30',
    installation: 'panel',
    voltageInputModePl: 'bezpośrednio albo przez VT',
    currentInputModePl: 'przez przekładniki prądowe CT',
    secondaryCircuitBurdenSourcePl: 'pobór obwodów U/I z karty katalogowej wariantu ND45',
    reportStandards: ['EN_50160', 'IEC_61000_4_30', 'IEC_61000_4_7', 'IEC_61000_4_15'],
    measuredPhenomenaPl: [
      'harmoniczne i interharmoniczne',
      'flicker',
      'zapady i wzrosty napięcia',
      'zdarzenia jakości energii',
    ],
    communicationModes: ['RS-485 Modbus', 'Ethernet Modbus TCP', 'USB'],
    catalogSourceLabel: 'Lumel ND45',
  },
  {
    modelRef: 'PQI-DA',
    manufacturerRef: 'A. Eberle',
    productName: 'PQI-DA / PQI-DA Smart fixed Class A PQ analyzer',
    accuracyClass: 'IEC_61000_4_30_CLASS_A',
    accuracyClassLabelPl: 'klasa A IEC 61000-4-30',
    installation: 'fixed_stationary',
    voltageInputModePl: 'przez VT albo wejścia napięciowe analizatora',
    currentInputModePl: 'przez przekładniki CT / wejścia prądowe analizatora',
    secondaryCircuitBurdenSourcePl: 'pobór obwodów U/I z karty katalogowej PQI-DA',
    reportStandards: ['EN_50160', 'IEC_61000_4_30', 'IEC_62586_1', 'IEC_62586_2'],
    measuredPhenomenaPl: [
      'THD i harmoniczne',
      'supraharmoniczne',
      'zapady, wzrosty i przerwy',
      'trendy jakości energii',
    ],
    communicationModes: ['Ethernet', 'WebPQ', 'PQSys'],
    catalogSourceLabel: 'A. Eberle PQI-DA Smart / PQI-DA',
  },
  {
    modelRef: 'PQM-750',
    manufacturerRef: 'Sonel',
    productName: 'PQM-750 analizator jakości zasilania',
    accuracyClass: 'IEC_61000_4_30_CLASS_A',
    accuracyClassLabelPl: 'pełna klasa A IEC 61000-4-30',
    installation: 'portable_or_fixed',
    voltageInputModePl: 'wejścia L1, L2, L3, N, E',
    currentInputModePl: 'wejścia CT 5 A / 1 A albo przekładniki zewnętrzne',
    secondaryCircuitBurdenSourcePl: 'pobór obwodów U/I z karty katalogowej PQM-750',
    reportStandards: [
      'EN_50160',
      'IEC_61000_4_30',
      'IEC_61000_4_7',
      'IEC_61000_4_15',
      'IEC_62586_1',
      'IEC_62586_2',
    ],
    measuredPhenomenaPl: [
      'harmoniczne i interharmoniczne',
      'flicker Pst/Plt',
      'asymetria napięć i prądów',
      'transjenty i zdarzenia',
    ],
    communicationModes: ['LAN', 'PoE', 'watchdog'],
    catalogSourceLabel: 'Sonel PQM-750',
  },
];

export const STANDARD_PQ_ANALYZER_CHANNEL_ASSIGNMENT:
  readonly PowerQualityAnalyzerChannelAssignment[] = [
  {
    analyzerRef: 'PQM-750',
    ctCoreId: 'II',
    vtWindingId: 'II',
    purposePl: 'Analizator jakości energii klasy A: EN 50160 / IEC 61000-4-30',
  },
];
