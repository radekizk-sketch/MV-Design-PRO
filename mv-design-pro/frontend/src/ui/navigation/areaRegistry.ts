import type { TechnicalIconName } from '../icons/technicalIconRegistry';

export type AreaId =
  | 'MODEL_SIECI'
  | 'SCHEMAT_TOPOLOGIA'
  | 'STUDIA_OBLICZENIOWE'
  | 'WYNIKI_ANALIZY'
  | 'ZABEZPIECZENIA_AUTOMATYKA'
  | 'ZRODLA_PRZYLACZENIA'
  | 'KATALOGI_TECHNICZNE'
  | 'RAPORTY_UZASADNIENIA'
  | 'HISTORIA_AUDYT';

export type LegacyAreaCode = 'MO' | 'TE' | 'AN' | 'ZA' | 'OZ' | 'AD' | 'RA' | 'HI';

export type AreaStatusType = 'none' | 'missing-data' | 'has-results' | 'blocked' | 'audit';

export interface AreaDefinition {
  id: AreaId;
  labelFull: string;
  labelShort: string;
  description: string;
  icon: TechnicalIconName;
  shortcut: string;
  order: number;
  available: boolean;
  statusType: AreaStatusType;
  tooltip: string;
  testId: string;
}

export const AREA_DEFINITIONS: readonly AreaDefinition[] = [
  {
    id: 'MODEL_SIECI',
    labelFull: 'Model sieci',
    labelShort: 'Model',
    description: 'Budowa i edycja struktury sieci SN',
    icon: 'ikona-obszar-model-sieci',
    shortcut: 'Ctrl+1',
    order: 1,
    available: true,
    statusType: 'missing-data',
    tooltip: 'Model sieci - budowa topologii, elementów i parametrów. Skrót: Ctrl+1.',
    testId: 'nav-area-MODEL_SIECI',
  },
  {
    id: 'SCHEMAT_TOPOLOGIA',
    labelFull: 'Schemat i topologia',
    labelShort: 'Schemat',
    description: 'Praca na schemacie jednokreskowym, topologii i przełączeniach',
    icon: 'ikona-obszar-schemat-topologia',
    shortcut: 'Ctrl+2',
    order: 2,
    available: true,
    statusType: 'none',
    tooltip: 'Schemat i topologia - SLD, topologia i przełączenia. Skrót: Ctrl+2.',
    testId: 'nav-area-SCHEMAT_TOPOLOGIA',
  },
  {
    id: 'STUDIA_OBLICZENIOWE',
    labelFull: 'Studia obliczeniowe',
    labelShort: 'Studia',
    description: 'Warianty pracy sieci, gotowość obliczeń, wyniki i raporty',
    icon: 'ikona-obszar-studia-obliczeniowe',
    shortcut: 'Ctrl+3',
    order: 3,
    available: true,
    statusType: 'missing-data',
    tooltip: 'Studia obliczeniowe - warianty pracy sieci, gotowość obliczeń, wyniki i raporty. Skrót: Ctrl+3.',
    testId: 'nav-area-STUDIA_OBLICZENIOWE',
  },
  {
    id: 'WYNIKI_ANALIZY',
    labelFull: 'Wyniki i analizy',
    labelShort: 'Wyniki',
    description: 'Przegląd wyników, porównania i nakładki wynikowe SLD',
    icon: 'ikona-obszar-wyniki-analizy',
    shortcut: 'Ctrl+4',
    order: 4,
    available: true,
    statusType: 'has-results',
    tooltip: 'Wyniki i analizy - wyniki, porównania i nakładki SLD. Skrót: Ctrl+4.',
    testId: 'nav-area-WYNIKI_ANALIZY',
  },
  {
    id: 'ZABEZPIECZENIA_AUTOMATYKA',
    labelFull: 'Zabezpieczenia i automatyka',
    labelShort: 'Zabezpieczenia',
    description: 'Nastawy, selektywność, automatyka i logika działania',
    icon: 'ikona-obszar-zabezpieczenia-automatyka',
    shortcut: 'Ctrl+5',
    order: 5,
    available: true,
    statusType: 'none',
    tooltip: 'Zabezpieczenia i automatyka - nastawy, selektywność i automatyka. Skrót: Ctrl+5.',
    testId: 'nav-area-ZABEZPIECZENIA_AUTOMATYKA',
  },
  {
    id: 'ZRODLA_PRZYLACZENIA',
    labelFull: 'Źródła i przyłączenia',
    labelShort: 'Źródła',
    description: 'Źródła PV, magazyny energii, farmy wiatrowe i wymagania operatora',
    icon: 'ikona-obszar-zrodla-przylaczenia',
    shortcut: 'Ctrl+6',
    order: 6,
    available: true,
    statusType: 'none',
    tooltip: 'Źródła i przyłączenia - OZE, BESS, FW i profile operatora. Skrót: Ctrl+6.',
    testId: 'nav-area-ZRODLA_PRZYLACZENIA',
  },
  {
    id: 'KATALOGI_TECHNICZNE',
    labelFull: 'Katalogi techniczne',
    labelShort: 'Katalogi',
    description: 'Typy, aparatura, przewody, transformatory i profile katalogowe',
    icon: 'ikona-obszar-katalogi-techniczne',
    shortcut: 'Ctrl+7',
    order: 7,
    available: true,
    statusType: 'none',
    tooltip: 'Katalogi techniczne - typy, aparatura, przewody i profile. Skrót: Ctrl+7.',
    testId: 'nav-area-KATALOGI_TECHNICZNE',
  },
  {
    id: 'RAPORTY_UZASADNIENIA',
    labelFull: 'Raporty i uzasadnienia',
    labelShort: 'Raporty',
    description: 'Raporty OSD, uzasadnienia inżynierskie i pakiety audytowe',
    icon: 'ikona-obszar-raporty-uzasadnienia',
    shortcut: 'Ctrl+8',
    order: 8,
    available: true,
    statusType: 'audit',
    tooltip: 'Raporty i uzasadnienia - raporty OSD, audyt i pakiet uzasadnienia. Skrót: Ctrl+8.',
    testId: 'nav-area-RAPORTY_UZASADNIENIA',
  },
  {
    id: 'HISTORIA_AUDYT',
    labelFull: 'Historia i audyt',
    labelShort: 'Historia',
    description: 'Wersje modelu użyte do obliczeń, ostatnie obliczenia, zmiany i ślad audytu',
    icon: 'ikona-obszar-historia-audyt',
    shortcut: 'Ctrl+9',
    order: 9,
    available: true,
    statusType: 'audit',
    tooltip: 'Historia i audyt - wersje modelu użyte do obliczeń, ostatnie obliczenia, zmiany i ślad audytu. Skrót: Ctrl+9.',
    testId: 'nav-area-HISTORIA_AUDYT',
  },
] as const;

export const AREA_REGISTRY: Readonly<Record<AreaId, AreaDefinition>> =
  AREA_DEFINITIONS.reduce((acc, area) => {
    acc[area.id] = area;
    return acc;
  }, {} as Record<AreaId, AreaDefinition>);

export const AREA_IDS = AREA_DEFINITIONS.map((area) => area.id);

export const LEGACY_AREA_ALIASES: Readonly<Record<LegacyAreaCode, AreaId>> = {
  MO: 'MODEL_SIECI',
  TE: 'SCHEMAT_TOPOLOGIA',
  AN: 'STUDIA_OBLICZENIOWE',
  ZA: 'ZABEZPIECZENIA_AUTOMATYKA',
  OZ: 'ZRODLA_PRZYLACZENIA',
  AD: 'KATALOGI_TECHNICZNE',
  RA: 'RAPORTY_UZASADNIENIA',
  HI: 'HISTORIA_AUDYT',
};

export function normalizeAreaId(value: unknown): AreaId {
  if (typeof value !== 'string') {
    return 'MODEL_SIECI';
  }
  if (value in AREA_REGISTRY) {
    return value as AreaId;
  }
  const upper = value.toUpperCase() as LegacyAreaCode;
  return LEGACY_AREA_ALIASES[upper] ?? 'MODEL_SIECI';
}

export function getAreaDefinition(value: unknown): AreaDefinition {
  return AREA_REGISTRY[normalizeAreaId(value)];
}
