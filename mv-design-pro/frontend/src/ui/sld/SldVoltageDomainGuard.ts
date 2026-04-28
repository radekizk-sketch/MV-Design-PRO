export type VoltageDomain = 'WN' | 'SN' | 'NN' | 'DC' | 'STEROWANIE' | 'POMIAR';

export type VoltageDomainPortRole =
  | 'BUSBAR_WN'
  | 'BUSBAR_SN'
  | 'BUSBAR_NN'
  | 'BAY_SN_IN'
  | 'BAY_SN_OUT'
  | 'BAY_SN_TRANSFORMER'
  | 'SEGMENT_SN_IN'
  | 'SEGMENT_SN_OUT'
  | 'TRANSFORMER_WN'
  | 'TRANSFORMER_SN'
  | 'TRANSFORMER_NN'
  | 'LV_FEEDER_OUT'
  | 'SOURCE_AC'
  | 'SOURCE_DC'
  | 'ZKSN_MAIN_IN'
  | 'ZKSN_MAIN_OUT'
  | 'ZKSN_BRANCH_OUT'
  | 'POLE_MAIN_IN'
  | 'POLE_MAIN_OUT'
  | 'POLE_BRANCH_OUT';

export type VoltageDomainDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface VoltageDomainPort {
  id: string;
  ownerRefId: string;
  name: string;
  voltageDomain: VoltageDomain;
  nominalVoltageKv: number | null;
  role: VoltageDomainPortRole;
  direction: VoltageDomainDirection;
  connectable: boolean;
}

export interface ConnectionValidationResult {
  allowed: boolean;
  severity: 'ok' | 'ostrzezenie' | 'blad' | 'blokada';
  code: string;
  messagePl: string;
  repairActionPl: string;
}

export type CrossDomainElementKind = 'TRANSFORMER' | 'INVERTER' | 'MEASUREMENT_COUPLING';

export interface VoltageDomainConnectionOptions {
  crossDomainElement?: CrossDomainElementKind | null;
}

const OK_RESULT: ConnectionValidationResult = Object.freeze({
  allowed: true,
  severity: 'ok',
  code: 'SLD-VOLTAGE-OK',
  messagePl: 'Połączenie portów jest zgodne z domeną napięciową.',
  repairActionPl: 'Kontynuuj modelowanie sieci.',
});

const NOT_CONNECTABLE_RESULT: ConnectionValidationResult = Object.freeze({
  allowed: false,
  severity: 'blokada',
  code: 'SLD-VOLTAGE-000',
  messagePl: 'Wybrany port nie jest portem przyłączeniowym.',
  repairActionPl: 'Wybierz aktywny port pola, szyny, odcinka albo urządzenia sprzęgającego.',
});

const SN_NN_BLOCK_RESULT: ConnectionValidationResult = Object.freeze({
  allowed: false,
  severity: 'blokada',
  code: 'SLD-VOLTAGE-001',
  messagePl:
    'Nie można połączyć odcinka SN z szyną nN. Kontynuacja sieci SN musi wychodzić z pola SN, złącza kablowego SN albo słupa rozgałęźnego.',
  repairActionPl: 'Wybierz port pola SN albo port główny ZKSN/słupa rozgałęźnego.',
});

const CROSS_DOMAIN_BLOCK_RESULT: ConnectionValidationResult = Object.freeze({
  allowed: false,
  severity: 'blokada',
  code: 'SLD-VOLTAGE-002',
  messagePl: 'Nie można połączyć portów z różnych domen napięciowych bez urządzenia sprzęgającego.',
  repairActionPl: 'Wstaw transformator, falownik albo właściwy element pomiarowo-sprzęgający.',
});

const DC_AC_BLOCK_RESULT: ConnectionValidationResult = Object.freeze({
  allowed: false,
  severity: 'blokada',
  code: 'SLD-VOLTAGE-003',
  messagePl: 'Nie można połączyć toru DC bezpośrednio z torem AC.',
  repairActionPl: 'Wstaw falownik albo przekształtnik z jawnymi portami DC i AC.',
});

export function isSnContinuationPort(port: VoltageDomainPort): boolean {
  return port.voltageDomain === 'SN' && (
    port.role === 'BAY_SN_OUT'
    || port.role === 'SEGMENT_SN_IN'
    || port.role === 'SEGMENT_SN_OUT'
    || port.role === 'ZKSN_MAIN_IN'
    || port.role === 'ZKSN_MAIN_OUT'
    || port.role === 'ZKSN_BRANCH_OUT'
    || port.role === 'POLE_MAIN_IN'
    || port.role === 'POLE_MAIN_OUT'
    || port.role === 'POLE_BRANCH_OUT'
  );
}

export function isNnDistributionPort(port: VoltageDomainPort): boolean {
  return port.voltageDomain === 'NN' && (
    port.role === 'BUSBAR_NN'
    || port.role === 'LV_FEEDER_OUT'
    || port.role === 'SOURCE_AC'
  );
}

function pairHasDomains(
  left: VoltageDomainPort,
  right: VoltageDomainPort,
  a: VoltageDomain,
  b: VoltageDomain,
): boolean {
  return (left.voltageDomain === a && right.voltageDomain === b)
    || (left.voltageDomain === b && right.voltageDomain === a);
}

function isTransformerPair(left: VoltageDomainPort, right: VoltageDomainPort): boolean {
  const roles = [left.role, right.role];
  return roles.every((role) => role.startsWith('TRANSFORMER_'))
    && left.voltageDomain !== right.voltageDomain;
}

function isInverterPair(left: VoltageDomainPort, right: VoltageDomainPort): boolean {
  const roles = new Set([left.role, right.role]);
  return roles.has('SOURCE_DC') && roles.has('SOURCE_AC');
}

export function validateVoltageDomainConnection(
  left: VoltageDomainPort,
  right: VoltageDomainPort,
  options: VoltageDomainConnectionOptions = {},
): ConnectionValidationResult {
  if (!left.connectable || !right.connectable) {
    return NOT_CONNECTABLE_RESULT;
  }

  if (left.voltageDomain === right.voltageDomain) {
    return OK_RESULT;
  }

  if (options.crossDomainElement === 'TRANSFORMER' && isTransformerPair(left, right)) {
    return OK_RESULT;
  }

  if (pairHasDomains(left, right, 'SN', 'NN')) {
    return SN_NN_BLOCK_RESULT;
  }

  if (left.voltageDomain === 'DC' || right.voltageDomain === 'DC') {
    if (options.crossDomainElement === 'INVERTER' && isInverterPair(left, right)) {
      return OK_RESULT;
    }
    return DC_AC_BLOCK_RESULT;
  }

  if (options.crossDomainElement === 'MEASUREMENT_COUPLING') {
    const measurementDomain =
      left.voltageDomain === 'POMIAR' || right.voltageDomain === 'POMIAR'
      || left.voltageDomain === 'STEROWANIE' || right.voltageDomain === 'STEROWANIE';
    if (measurementDomain) {
      return OK_RESULT;
    }
  }

  return CROSS_DOMAIN_BLOCK_RESULT;
}

export function createVoltageDomainPort(
  port: VoltageDomainPort,
): VoltageDomainPort {
  return { ...port };
}
