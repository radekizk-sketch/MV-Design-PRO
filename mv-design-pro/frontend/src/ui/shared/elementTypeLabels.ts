import type { ElementType } from '../types';

const ELEMENT_TYPE_LABELS_PL: Partial<Record<ElementType, string>> = {
  Bus: 'Szyna',
  LineBranch: 'Odcinek liniowy',
  TransformerBranch: 'Gałąź transformatorowa',
  Switch: 'Łącznik',
  Source: 'Źródło',
  Load: 'Obciążenie',
  Measurement: 'Pomiar',
  ProtectionAssignment: 'Przypisanie zabezpieczenia',
  Terminal: 'Końcówka magistrali',
  PortBranch: 'Port odgałęzienia',
  Station: 'Stacja',
  BaySN: 'Pole SN',
  Relay: 'Przekaźnik',
  SecondaryLink: 'Połączenie pierścieniowe',
  NOP: 'Punkt normalnie otwarty',
  BusNN: 'Szyna nN',
  MainBreakerNN: 'Wyłącznik główny nN',
  FeederNN: 'Odpływ nN',
  SegmentNN: 'Odcinek nN',
  LoadNN: 'Obciążenie nN',
  SwitchboardNN: 'Rozdzielnica nN',
  SourceFieldNN: 'Pole źródłowe nN',
  PVInverter: 'Źródło PV',
  BESSInverter: 'Źródło BESS',
  EnergyStorage: 'Magazyn energii',
  Genset: 'Źródło FW',
  UPS: 'UPS',
  MeteringBlock: 'Układ pomiarowy',
};

function prettifyFallbackLabel(rawType: string): string {
  return rawType
    .replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
}

export function formatElementTypeLabelPl(type: string | null | undefined): string {
  if (!type) {
    return '—';
  }
  return ELEMENT_TYPE_LABELS_PL[type as ElementType] ?? prettifyFallbackLabel(type);
}

