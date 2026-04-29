import { describe, expect, it } from 'vitest';

import {
  buildSemanticInspectorCardModel,
  type EngineeringSemanticModelForInspector,
} from '../semanticInspectorAdapter';

const reportEligibility = {
  RAPORT_TECHNICZNY: 'RAPORTOWALNY',
  RAPORT_OSD: 'RAPORTOWALNY',
  RAPORT_AUDYTOWY: 'RAPORTOWALNY',
  RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
  RAPORT_ZABEZPIECZEN: 'RAPORTOWALNY_Z_OSTRZEZENIEM',
} as const;

function semanticModel(): EngineeringSemanticModelForInspector {
  return {
    semanticHash: 'sem-hash-1',
    elements: [
      {
        refId: 'bay-l3',
        elementKind: 'MV_BAY',
        engineeringRole: 'LINE_FEEDER_BAY',
        functionalRole: 'FEEDS_MV_TRUNK',
        networkPosition: {
          projectRefId: 'project-1',
          parentRefId: 'gpz-1',
          containerRefId: 'switchgear-1',
          voltageLevelRefId: 'SN-15kV',
          switchgearRefId: 'switchgear-1',
          busbarSectionRefId: 'bus-a',
          bayRefId: 'bay-l3',
          feederRefId: 'feeder-l3',
          branchRefId: null,
          stationRefId: null,
          orderIndex: 3,
        },
        voltageDomain: 'SN',
        completeness: 'MODEL_TECHNICZNY_PELNY',
        dataQualityState: 'PELNA',
        reportEligibility,
        ports: [
          {
            portId: 'bay-l3:out',
            role: 'BAY_SN_OUT',
            voltageDomain: 'SN',
            nominalVoltageKv: 15,
            phaseSystem: 'ABC',
            connectionSide: 'STRONA_LINII',
            connectionPolicyRef: 'policy-line-feeder-out',
          },
        ],
      },
    ],
  };
}

describe('semanticInspectorAdapter', () => {
  it('buduje Karte semantyczna z EngineeringSemanticModel bez ElementType', () => {
    const card = buildSemanticInspectorCardModel({
      semanticModel: semanticModel(),
      elementRefId: 'bay-l3',
      fallbackVisualLabel: 'BaySN',
    });

    expect(card.status).toBe('SEMANTYKA_OK');
    expect(card.semanticHash).toBe('sem-hash-1');
    expect(card.elementKind).toBe('MV_BAY');
    expect(card.engineeringRole).toBe('LINE_FEEDER_BAY');
    expect(card.functionalRole).toBe('FEEDS_MV_TRUNK');
    expect(card.voltageDomain).toBe('SN');
    expect(card.ports).toHaveLength(1);
    expect(card.ports[0]).toMatchObject({
      portId: 'bay-l3:out',
      role: 'BAY_SN_OUT',
      voltageDomain: 'SN',
    });
    expect(card.networkPosition.find((row) => row.key === 'busbarSectionRefId')?.value).toBe('bus-a');
    expect(card.reportEligibility).toContainEqual({
      reportKind: 'RAPORT_TECHNICZNY',
      status: 'RAPORTOWALNY',
    });
  });

  it('dla brakujacego elementu zwraca BLOKADA_SEMANTYCZNA zamiast zgadywania z ElementType', () => {
    const card = buildSemanticInspectorCardModel({
      semanticModel: semanticModel(),
      elementRefId: 'legacy-node',
      fallbackVisualLabel: 'LineBranch',
    });

    expect(card.status).toBe('BLOKADA_SEMANTYCZNA');
    expect(card.titlePl).toBe('Brak funkcji elektroenergetycznej');
    expect(card.elementKind).toBeNull();
    expect(card.engineeringRole).toBeNull();
    expect(card.fallbackVisualLabel).toBe('LineBranch');
    expect(card.messagePl).toMatch(/EngineeringSemanticModel/);
  });
});
