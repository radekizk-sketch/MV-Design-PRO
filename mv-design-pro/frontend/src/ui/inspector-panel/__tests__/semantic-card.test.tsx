import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SemanticInspectorCard } from '../SemanticInspectorCard';
import type { SemanticInspectorCardModel } from '../../engineering-semantic/semanticInspectorAdapter';

function fullCard(): SemanticInspectorCardModel {
  return {
    status: 'SEMANTYKA_OK',
    titlePl: 'Karta semantyczna',
    semanticHash: 'sem-hash-1',
    refId: 'bay-l3',
    displayName: 'bay-l3',
    elementKind: 'MV_BAY',
    engineeringRole: 'LINE_FEEDER_BAY',
    functionalRole: 'FEEDS_MV_TRUNK',
    voltageDomain: 'SN',
    completeness: 'MODEL_TECHNICZNY_PELNY',
    dataQualityState: 'PELNA',
    networkPosition: [
      { key: 'projectRefId', labelPl: 'Projekt', value: 'project-1' },
      { key: 'busbarSectionRefId', labelPl: 'Sekcja szyn', value: 'bus-a' },
    ] as SemanticInspectorCardModel['networkPosition'],
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
    reportEligibility: [
      { reportKind: 'RAPORT_TECHNICZNY', status: 'RAPORTOWALNY' },
      { reportKind: 'RAPORT_OSD', status: 'RAPORTOWALNY' },
    ],
    messagePl: null,
    repairActionPl: null,
    fallbackVisualLabel: 'BaySN',
  };
}

describe('SemanticInspectorCard', () => {
  it('renderuje pelna Karte semantyczna dla elementu z EngineeringSemanticModel', () => {
    render(<SemanticInspectorCard card={fullCard()} />);

    const card = screen.getByTestId('semantic-inspector-card');
    expect(card).toHaveAttribute('data-semantic-status', 'SEMANTYKA_OK');
    expect(within(card).getByText('Karta semantyczna')).toBeInTheDocument();
    expect(within(card).getByText('MV_BAY')).toBeInTheDocument();
    expect(within(card).getByText('LINE_FEEDER_BAY')).toBeInTheDocument();
    expect(within(card).getByText('FEEDS_MV_TRUNK')).toBeInTheDocument();
    expect(within(card).getByText('BAY_SN_OUT / STRONA_LINII / 15 kV')).toBeInTheDocument();
    expect(within(card).getByText('semanticHash: sem-hash-1')).toBeInTheDocument();
  });

  it('renderuje blokade semantyczna dla brakujacej funkcji elektroenergetycznej', () => {
    render(
      <SemanticInspectorCard
        card={{
          status: 'BLOKADA_SEMANTYCZNA',
          titlePl: 'Brak funkcji elektroenergetycznej',
          semanticHash: 'sem-hash-1',
          refId: 'legacy-node',
          displayName: 'legacy-node',
          elementKind: null,
          engineeringRole: null,
          functionalRole: null,
          voltageDomain: null,
          completeness: null,
          dataQualityState: null,
          networkPosition: [],
          ports: [],
          reportEligibility: [],
          messagePl: 'Wybrany obiekt nie ma odpowiadajacego elementu w EngineeringSemanticModel.',
          repairActionPl: 'Otworz mapowanie semantyczne i przypisz funkcje elektroenergetyczna elementu.',
          fallbackVisualLabel: 'LineBranch',
        }}
      />,
    );

    const card = screen.getByTestId('semantic-inspector-card');
    expect(card).toHaveAttribute('data-semantic-status', 'BLOKADA_SEMANTYCZNA');
    expect(within(card).getByText('Brak funkcji elektroenergetycznej')).toBeInTheDocument();
    expect(within(card).getByText('BLOKADA_SEMANTYCZNA')).toBeInTheDocument();
    expect(within(card).getByText('LineBranch')).toBeInTheDocument();
    expect(within(card).queryByText('LINE_FEEDER_BAY')).not.toBeInTheDocument();
  });
});
