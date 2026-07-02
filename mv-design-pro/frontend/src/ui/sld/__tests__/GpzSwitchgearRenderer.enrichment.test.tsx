import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GpzSwitchgearRenderer } from '../GpzFieldBlockRenderer';
import type { GpzFieldAnnotationV1, GpzSectionV1 } from '../core/layoutResult';

const sections: GpzSectionV1[] = [
  {
    sectionId: 'section-1',
    rootBusId: 'bus-sn-1',
    rootBusName: 'Szyna SN 15 kV',
    order: 0,
    bounds: { x: 40, y: 80, width: 320, height: 280 },
    busbar: { x: 54, y: 120, width: 300, height: 10 },
    centerX: 200,
    fieldIds: ['bay-1', 'bay-2'],
    sourceNodeIds: ['gpz-1'],
    leftCouplerEdgeId: null,
    rightCouplerEdgeId: null,
  },
];

function field(id: string, axisX: number, withCt: boolean): GpzFieldAnnotationV1 {
  return {
    fieldId: id,
    feederNodeId: `feeder-${id}`,
    rootBusId: 'bus-sn-1',
    designation: id.toUpperCase(),
    axisX,
    busTap: { x: axisX, y: 120 },
    segmentStart: { x: axisX, y: 320 },
    headCenter: { x: axisX, y: 200 },
    detail: withCt
      ? ({
          devices: [
            {
              id: `${id}-ct`,
              fieldId: id,
              deviceType: 'CT',
              electricalRole: 'MEASUREMENT',
              powerPathPosition: 'MIDSTREAM',
              catalogRef: null,
              logicalBindings: { boundCbId: null, ctInputIds: [] },
              parameters: {
                ctRatio: '200/5',
                breakingCapacityKa: null,
                ratedCurrentA: null,
                relaySettings: null,
                ratedPowerMva: null,
                ukPercent: null,
                vectorGroup: null,
              },
            },
          ],
        } as unknown as GpzFieldAnnotationV1['detail'])
      : null,
  };
}

function renderGpz(fields: GpzFieldAnnotationV1[]) {
  return render(
    <svg>
      <GpzSwitchgearRenderer sections={sections} fields={fields} showTechnicalLabels />
    </svg>,
  );
}

describe('GpzSwitchgearRenderer — wzbogacenie zywego GPZ', () => {
  it('rysuje symbol transformatora WN/SN z napieciem szyny z rootBusName', () => {
    renderGpz([field('bay-1', 130, false), field('bay-2', 230, false)]);

    expect(screen.getByTestId('gpz-incoming-transformer')).toBeInTheDocument();
    expect(screen.getByText('WN/SN')).toBeInTheDocument();
    expect(screen.getByText('15 kV')).toBeInTheDocument();
  });

  it('pokazuje przekladnie CT obok aparatu, gdy ctRatio jest dostepne', () => {
    renderGpz([field('bay-1', 130, true), field('bay-2', 230, false)]);

    expect(screen.getByTestId('gpz-ct-ratio-bay-1')).toBeInTheDocument();
    expect(screen.getByText('200/5')).toBeInTheDocument();
    // pole bez CT nie dostaje etykiety przekladni
    expect(screen.queryByTestId('gpz-ct-ratio-bay-2')).not.toBeInTheDocument();
  });

  it('pokazuje nazwe szyny przy transformatorze, gdy rootBusName nie zawiera kV', () => {
    const noVoltage: GpzSectionV1[] = [{ ...sections[0], rootBusName: 'Szyna A' }];
    render(
      <svg>
        <GpzSwitchgearRenderer sections={noVoltage} fields={[field('bay-1', 130, false), field('bay-2', 230, false)]} />
      </svg>,
    );

    expect(screen.getByTestId('gpz-incoming-transformer')).toBeInTheDocument();
    expect(screen.getByText('Szyna A')).toBeInTheDocument();
  });
});
