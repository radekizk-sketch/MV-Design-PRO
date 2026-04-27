import { describe, expect, it } from 'vitest';

import {
  createVoltageDomainPort,
  isNnDistributionPort,
  isSnContinuationPort,
  validateVoltageDomainConnection,
  type VoltageDomainPort,
} from '../SldVoltageDomainGuard';

function port(partial: Partial<VoltageDomainPort> & Pick<VoltageDomainPort, 'id' | 'role' | 'voltageDomain'>): VoltageDomainPort {
  return createVoltageDomainPort({
    ownerRefId: partial.ownerRefId ?? partial.id,
    name: partial.name ?? partial.id,
    nominalVoltageKv: partial.nominalVoltageKv ?? (partial.voltageDomain === 'SN' ? 15 : partial.voltageDomain === 'NN' ? 0.4 : null),
    direction: partial.direction ?? 'DOWN',
    connectable: partial.connectable ?? true,
    ...partial,
  });
}

describe('SldVoltageDomainGuard', () => {
  it('pozwala kontynuować SN tylko przez porty SN', () => {
    const bayOut = port({ id: 'bay-out', role: 'BAY_SN_OUT', voltageDomain: 'SN' });
    const segmentIn = port({ id: 'segment-in', role: 'SEGMENT_SN_IN', voltageDomain: 'SN' });

    expect(isSnContinuationPort(bayOut)).toBe(true);
    expect(validateVoltageDomainConnection(bayOut, segmentIn)).toMatchObject({
      allowed: true,
      severity: 'ok',
    });
  });

  it('blokuje połączenie odcinka SN z szyną nN komunikatem operatorskim', () => {
    const snSegment = port({ id: 'segment-sn-out', role: 'SEGMENT_SN_OUT', voltageDomain: 'SN' });
    const nnBus = port({ id: 'nn-bus', role: 'BUSBAR_NN', voltageDomain: 'NN' });

    const result = validateVoltageDomainConnection(snSegment, nnBus);

    expect(isNnDistributionPort(nnBus)).toBe(true);
    expect(result).toMatchObject({
      allowed: false,
      severity: 'blokada',
      code: 'SLD-VOLTAGE-001',
      repairActionPl: 'Wybierz port pola SN albo port główny ZKSN/słupa rozgałęźnego.',
    });
    expect(result.messagePl).toContain('Nie można połączyć odcinka SN z szyną nN');
  });

  it('dopuszcza przejście SN-nN wyłącznie przez transformator', () => {
    const trSn = port({ id: 'tr-sn', role: 'TRANSFORMER_SN', voltageDomain: 'SN' });
    const trNn = port({ id: 'tr-nn', role: 'TRANSFORMER_NN', voltageDomain: 'NN' });

    expect(validateVoltageDomainConnection(trSn, trNn)).toMatchObject({
      allowed: false,
      code: 'SLD-VOLTAGE-001',
    });
    expect(validateVoltageDomainConnection(trSn, trNn, { crossDomainElement: 'TRANSFORMER' })).toMatchObject({
      allowed: true,
      code: 'SLD-VOLTAGE-OK',
    });
  });

  it('blokuje bezpośrednie DC-AC bez falownika', () => {
    const dc = port({ id: 'pv-dc', role: 'SOURCE_DC', voltageDomain: 'DC' });
    const ac = port({ id: 'pv-ac', role: 'SOURCE_AC', voltageDomain: 'NN' });

    expect(validateVoltageDomainConnection(dc, ac)).toMatchObject({
      allowed: false,
      code: 'SLD-VOLTAGE-003',
    });
    expect(validateVoltageDomainConnection(dc, ac, { crossDomainElement: 'INVERTER' })).toMatchObject({
      allowed: true,
    });
  });
});
