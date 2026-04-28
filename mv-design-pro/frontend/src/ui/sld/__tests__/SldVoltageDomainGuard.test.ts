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
  it('pozwala kontynuowac SN tylko przez porty SN', () => {
    const bayOut = port({ id: 'bay-out', role: 'BAY_SN_OUT', voltageDomain: 'SN' });
    const segmentIn = port({ id: 'segment-in', role: 'SEGMENT_SN_IN', voltageDomain: 'SN' });

    expect(isSnContinuationPort(bayOut)).toBe(true);
    expect(validateVoltageDomainConnection(bayOut, segmentIn)).toMatchObject({
      allowed: true,
      severity: 'ok',
    });
  });

  it('blokuje polaczenie odcinka SN z szyna nN komunikatem operatorskim', () => {
    const snSegment = port({ id: 'segment-sn-out', role: 'SEGMENT_SN_OUT', voltageDomain: 'SN' });
    const nnBus = port({ id: 'nn-bus', role: 'BUSBAR_NN', voltageDomain: 'NN' });

    const result = validateVoltageDomainConnection(snSegment, nnBus);

    expect(isNnDistributionPort(nnBus)).toBe(true);
    expect(result).toMatchObject({
      allowed: false,
      severity: 'blokada',
      code: 'SLD-VOLTAGE-001',
    });
    expect(result.messagePl).toContain('Nie');
  });

  it('dopuszcza przejscie SN-nN wylacznie przez transformator', () => {
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

  it('dopuszcza transformator WN-SN dla pelnego GPZ bez mieszania domen przez szyne', () => {
    const trWn = port({ id: 'tr-wn', role: 'TRANSFORMER_WN', voltageDomain: 'WN', nominalVoltageKv: 110 });
    const trSn = port({ id: 'tr-sn', role: 'TRANSFORMER_SN', voltageDomain: 'SN', nominalVoltageKv: 15 });

    expect(validateVoltageDomainConnection(trWn, trSn)).toMatchObject({
      allowed: false,
      code: 'SLD-VOLTAGE-002',
    });
    expect(validateVoltageDomainConnection(trWn, trSn, { crossDomainElement: 'TRANSFORMER' })).toMatchObject({
      allowed: true,
      code: 'SLD-VOLTAGE-OK',
    });
  });

  it('blokuje bezposrednie DC-AC bez falownika', () => {
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
