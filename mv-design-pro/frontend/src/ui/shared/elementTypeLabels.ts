import type { ElementType } from '../types';

/**
 * Polska etykieta KAŻDEGO rodzaju elementu (`Record` pełny — nowy rodzaj bez etykiety
 * to błąd kompilacji, nie cichy angielski zapas; karta UI-02: tabela wyników pokazywała
 * „Descriptive Element").
 */
export const ELEMENT_TYPE_LABELS_PL: Readonly<Record<ElementType, string>> = {
  Bus: 'Szyna',
  LineBranch: 'Odcinek liniowy',
  TransformerBranch: 'Gałąź transformatorowa',
  Switch: 'Łącznik',
  Source: 'Źródło',
  Load: 'Obciążenie',
  Generator: 'Źródło wytwórcze',
  Measurement: 'Pomiar',
  ProtectionAssignment: 'Przypisanie zabezpieczenia',
  Terminal: 'Końcówka magistrali',
  PortBranch: 'Port odgałęzienia',
  Station: 'Stacja',
  BranchPole: 'Słup rozgałęźny',
  ZKSN: 'Złącze kablowe SN',
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
  EnergyMeter: 'Licznik energii',
  SurgeArresterNN: 'Ogranicznik przepięć nN',
  Earthing: 'Uziemienie',
  MeasurementNN: 'Przekładnik nN',
  AuxBus: 'Szyna pomocnicza',
  ConnectionPoint: 'Punkt przyłączenia odbiorcy',
  SwitchNN: 'Łącznik nN',
  ProtectionNN: 'Zabezpieczenie nN',
  SourceController: 'Sterownik źródła',
  InternalJunction: 'Punkt wspólny rozdzielnicy',
  CableJointNN: 'Złącze kablowe nN',
  FaultCurrentLimiter: 'Ogranicznik prądu zwarciowego',
  FilterCompensator: 'Filtr lub kompensator',
  TelecontrolDevice: 'Urządzenie telemechaniki',
  BusSectionNN: 'Sekcja szyn nN',
  BusCouplerNN: 'Sprzęgło szyn nN',
  ReserveLink: 'Łącznik rezerwowy nN',
  SourceDisconnect: 'Punkt odłączenia źródła',
  PowerLimit: 'Ograniczenie mocy źródła',
  WorkProfile: 'Profil pracy źródła',
  OperatingMode: 'Tryb pracy',
  ConnectionConstraints: 'Ograniczenia przyłączeniowe',
  MeteringBlock: 'Układ pomiarowy',
  SyncPoint: 'Punkt synchronizacji źródła',
  DescriptiveElement: 'Element opisowy',
};

/** Rodzaj spoza unii `ElementType` (dane spoza kontraktu) — jawny opis, nie surowy kod. */
export const RODZAJ_NIEZNANY_PL = 'Obiekt modelu';

export function formatElementTypeLabelPl(type: string | null | undefined): string {
  if (!type) {
    return '—';
  }
  return Object.prototype.hasOwnProperty.call(ELEMENT_TYPE_LABELS_PL, type)
    ? ELEMENT_TYPE_LABELS_PL[type as ElementType]
    : RODZAJ_NIEZNANY_PL;
}
