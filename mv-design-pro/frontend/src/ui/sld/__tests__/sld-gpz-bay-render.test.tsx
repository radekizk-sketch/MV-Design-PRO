import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AnySldSymbol, BusSymbol, Connection, SourceSymbol } from '../../sld-editor/types';
import type { CanonicalAnnotationsV1 } from '../core/layoutResult';
import { SLDViewCanvas } from '../SLDViewCanvas';

const viewport = { zoom: 1, offsetX: 0, offsetY: 0 };

describe('sld-gpz-bay-render - kanoniczne GPZ, szyny, pola SN i sprzeglo', () => {
  it('renderuje GPZ jako rozdzielnie SN: pole 5, sprzeglo 6-7, pole 8 oraz polaczenie', () => {
    const onSymbolClick = vi.fn();
    const symbols: AnySldSymbol[] = [
      {
        id: 'source-gpz-1',
        elementId: 'gpz-1',
        elementType: 'Source',
        elementName: 'GPZ Polnoc',
        position: { x: 120, y: 120 },
        inService: true,
        connectedToNodeId: 'bus-sn-1',
      } satisfies SourceSymbol,
      {
        id: 'bus-sn-1',
        elementId: 'bus-sn-1',
        elementType: 'Bus',
        elementName: 'Szyna SN 15 kV',
        position: { x: 260, y: 120 },
        inService: true,
        width: 420,
        height: 10,
      } satisfies BusSymbol,
    ];

    const connections: Connection[] = [
      {
        id: 'conn-gpz-bus',
        fromSymbolId: 'source-gpz-1',
        fromPortName: 'right',
        toSymbolId: 'bus-sn-1',
        toPortName: 'left',
        path: [
          { x: 150, y: 120 },
          { x: 230, y: 120 },
        ],
        elementId: 'conn-gpz-bus',
        connectionType: 'source',
      },
    ];

    const canonicalAnnotations: CanonicalAnnotationsV1 = {
      trunkNodes: [],
      trunkSegments: [],
      branchPoints: [],
      stationChains: [
        {
          stationId: 'gpz-switchgear',
          stationType: 'TYPE_A',
          hasOZE: false,
          ozeType: null,
          apparatus: [],
          nnBusbar: { voltageKV: 0.4, feeders: [] },
          protection: [],
          detail: {
            fields: [{ fieldRole: 'GPZ_LINE_BAY' }],
          },
        } as any,
      ],
      gpzSections: [
        {
          sectionId: 'section-1',
          rootBusId: 'bus-sn-1',
          rootBusName: 'Szyna SN 15 kV',
          order: 0,
          bounds: { x: 140, y: 80, width: 260, height: 220 },
          busbar: { x: 150, y: 110, width: 420, height: 10 },
          centerX: 260,
          fieldIds: ['bay-sn-1'],
          sourceNodeIds: ['gpz-1'],
          leftCouplerEdgeId: null,
          rightCouplerEdgeId: 'coupler-s1-s2',
        },
        {
          sectionId: 'section-2',
          rootBusId: 'bus-sn-1',
          rootBusName: 'Szyna SN 15 kV',
          order: 1,
          bounds: { x: 400, y: 80, width: 260, height: 220 },
          busbar: { x: 150, y: 110, width: 420, height: 10 },
          centerX: 480,
          fieldIds: ['bay-sn-2'],
          sourceNodeIds: ['gpz-1'],
          leftCouplerEdgeId: 'coupler-s1-s2',
          rightCouplerEdgeId: null,
        },
      ],
      gpzFeederFields: [
        {
          fieldId: 'bay-sn-1',
          feederNodeId: 'feeder-1',
          rootBusId: 'bus-sn-1',
          designation: 'Pole SN nr 1',
          axisX: 260,
          busTap: { x: 260, y: 120 },
          segmentStart: { x: 260, y: 280 },
          headCenter: { x: 260, y: 180 },
          detail: null,
        },
        {
          fieldId: 'bay-sn-2',
          feederNodeId: 'feeder-2',
          rootBusId: 'bus-sn-1',
          designation: 'Pole SN nr 2',
          axisX: 480,
          busTap: { x: 480, y: 120 },
          segmentStart: { x: 480, y: 280 },
          headCenter: { x: 480, y: 180 },
          detail: null,
        },
      ],
      inlineBranchObjects: [],
    };

    const { container } = render(
      <SLDViewCanvas
        symbols={symbols}
        connections={connections}
        selectedId="bay-sn-1"
        onSymbolClick={onSymbolClick}
        viewport={viewport}
        showGrid={false}
        width={720}
        height={430}
        canonicalAnnotations={canonicalAnnotations}
      />,
    );

    expect(screen.getByTestId('sld-symbol-source-gpz-1')).toHaveAttribute('data-element-type', 'Source');
    expect(screen.queryByTestId('sld-symbol-bus-sn-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('gpz-switchgear-canonical')).toBeInTheDocument();
    expect(screen.getByTestId('gpz-bus-section-section-1')).toBeInTheDocument();
    expect(screen.getByTestId('gpz-bus-section-section-2')).toBeInTheDocument();
    expect(screen.getByTestId('gpz-line-bay-bay-sn-1')).toBeInTheDocument();
    expect(screen.getByTestId('gpz-line-bay-bay-sn-2')).toBeInTheDocument();
    expect(screen.getByTestId('gpz-coupler-6-7')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('6-7')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByTestId('gpz-device-bay-sn-1-Q2')).toHaveAttribute('data-state', 'closed');
    expect(screen.getByTestId('gpz-device-bay-sn-1-Q1')).toHaveAttribute('data-state', 'closed');
    expect(screen.getByTestId('gpz-device-bay-sn-1-Q3')).toHaveAttribute('data-state', 'open');
    expect(screen.getByTestId('gpz-field-selection-bay-sn-1')).toBeInTheDocument();
    expect(screen.getByTestId('gpz-field-results-bay-sn-1')).toHaveAttribute('data-result-status', 'brak');
    expect(screen.getByTestId('gpz-field-results-bay-sn-1')).toHaveTextContent('I1 = -- A');
    expect(screen.getByTestId('gpz-field-results-bay-sn-1')).toHaveTextContent('P = -- MW');
    expect(screen.getByTestId('gpz-coupler-results')).toHaveAttribute('data-result-status', 'brak');
    expect(screen.getByTestId('gpz-coupler-results')).toHaveTextContent('I1 = -- A');
    expect(container.querySelector('[data-element-id="gpz-switchgear"]')).toBeNull();
    expect(screen.getByTestId('sld-connection-conn-gpz-bus')).toBeInTheDocument();

    const field = container.querySelector('[data-testid="gpz-line-bay-bay-sn-1"]');
    expect(field).not.toBeNull();

    fireEvent.click(field!);
    expect(onSymbolClick).toHaveBeenCalledWith('bay-sn-1', 'BaySN', 'Pole SN nr 1');
  });
});
