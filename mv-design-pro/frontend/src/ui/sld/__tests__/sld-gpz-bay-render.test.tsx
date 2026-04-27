import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AnySldSymbol, BusSymbol, Connection, SourceSymbol } from '../../sld-editor/types';
import type { CanonicalAnnotationsV1 } from '../core/layoutResult';
import { SLDViewCanvas } from '../SLDViewCanvas';

const viewport = { zoom: 1, offsetX: 0, offsetY: 0 };

describe('sld-gpz-bay-render - GPZ, szyna i pole SN na kanwie', () => {
  it('renderuje symbol GPZ, szynę, pole SN oraz połączenie', () => {
    const onSymbolClick = vi.fn();
    const symbols: AnySldSymbol[] = [
      {
        id: 'source-gpz-1',
        elementId: 'gpz-1',
        elementType: 'Source',
        elementName: 'GPZ Północ',
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
        width: 180,
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
      stationChains: [],
      gpzSections: [
        {
          sectionId: 'section-1',
          rootBusId: 'bus-sn-1',
          rootBusName: 'Szyna SN 15 kV',
          order: 1,
          bounds: { x: 200, y: 80, width: 220, height: 120 },
          busbar: { x: 210, y: 110, width: 180, height: 10 },
          centerX: 300,
          fieldIds: ['bay-sn-1'],
          sourceNodeIds: ['gpz-1'],
          leftCouplerEdgeId: null,
          rightCouplerEdgeId: null,
        },
      ],
      gpzFeederFields: [
        {
          fieldId: 'bay-sn-1',
          feederNodeId: 'feeder-1',
          rootBusId: 'bus-sn-1',
          designation: 'Pole SN nr 1',
          axisX: 300,
          busTap: { x: 300, y: 120 },
          segmentStart: { x: 300, y: 140 },
          headCenter: { x: 300, y: 168 },
          detail: null,
        },
      ],
      inlineBranchObjects: [],
    };

    const { container } = render(
      <SLDViewCanvas
        symbols={symbols}
        connections={connections}
        selectedId={null}
        onSymbolClick={onSymbolClick}
        viewport={viewport}
        showGrid={false}
        width={640}
        height={360}
        canonicalAnnotations={canonicalAnnotations}
      />,
    );

    expect(screen.getByTestId('sld-symbol-source-gpz-1')).toHaveAttribute('data-element-type', 'Source');
    expect(screen.getByTestId('sld-symbol-bus-sn-1')).toHaveAttribute('data-element-type', 'Bus');
    expect(screen.getByTestId('sld-connection-conn-gpz-bus')).toBeInTheDocument();
    const field = container.querySelector('[data-element-type="BaySN"][data-element-id="bay-sn-1"]');
    expect(field).not.toBeNull();

    fireEvent.click(field!);
    expect(onSymbolClick).toHaveBeenCalledWith('bay-sn-1', 'BaySN', 'Pole SN nr 1');
  });
});
