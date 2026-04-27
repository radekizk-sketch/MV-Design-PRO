import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SLDViewCanvas } from '../SLDViewCanvas';
import type { ViewportState } from '../types';

vi.mock('../symbols', () => ({
  UnifiedSymbolRenderer: ({ symbol, handlers }: any) => (
    <g
      data-testid={`mock-symbol-${symbol.id}`}
      onClick={() => handlers?.onClick?.(symbol.id)}
      onDoubleClick={() => handlers?.onDoubleClick?.(symbol.id)}
    >
      <circle cx={symbol.position.x} cy={symbol.position.y} r={6} />
    </g>
  ),
}));

vi.mock('../GpzFieldBlockRenderer', () => ({
  GpzFieldBlockRenderer: ({ field, onTrunkOutPortClick, onTrunkOutPortHover }: any) => (
    <g>
      <text>{field.designation}</text>
      <circle
        data-testid={`sld-port-${field.fieldId}-TRUNK_OUT`}
        onClick={(event) => {
          event.stopPropagation();
          onTrunkOutPortClick?.(field);
        }}
        onMouseEnter={() => onTrunkOutPortHover?.(field)}
        onMouseLeave={() => onTrunkOutPortHover?.(null)}
      />
    </g>
  ),
}));

vi.mock('../FieldBlockRenderer', () => ({
  FieldBlockRenderer: ({ field }: any) => <text>{field.stationId}</text>,
}));

vi.mock('../JunctionDotLayer', () => ({
  JunctionDotLayer: () => null,
}));

const VIEWPORT: ViewportState = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1,
};

describe('SLDViewCanvas interaction surface', () => {
  it('nie renderuje portu wyjscia magistrali na zwyklej szynie', () => {
    render(
      <SLDViewCanvas
        symbols={[
          {
            id: 'bus-1',
            elementId: 'bus-1',
            elementType: 'Bus',
            elementName: 'Szyna 1',
            position: { x: 100, y: 100 },
            inService: true,
          } as any,
        ]}
        selectedId="bus-1"
        onSymbolClick={vi.fn()}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
      />,
    );

    expect(screen.queryByTestId('sld-port-bus-1-TRUNK_OUT')).toBeNull();
  });

  it('nie renderuje portu wyjscia magistrali na symbolu zrodla SN', () => {
    render(
      <SLDViewCanvas
        symbols={[
          {
            id: 'source-1',
            elementId: 'source-1',
            elementType: 'Source',
            elementName: 'GPZ 1',
            position: { x: 100, y: 100 },
            inService: true,
          } as any,
        ]}
        selectedId="source-1"
        onSymbolClick={vi.fn()}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
      />,
    );

    expect(screen.queryByTestId('sld-port-source-1-TRUNK_OUT')).toBeNull();
  });

  it('klik tla wywoluje callback resetu interakcji', () => {
    const onCanvasClick = vi.fn();
    render(
      <SLDViewCanvas
        symbols={[]}
        selectedId={null}
        onSymbolClick={vi.fn()}
        onCanvasClick={onCanvasClick}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
      />,
    );

    fireEvent.click(screen.getByTestId('sld-canvas-background'));
    expect(onCanvasClick).toHaveBeenCalledTimes(1);
  });

  it('klik segmentu przekazuje semantyczny target segmentu', () => {
    const onSegmentClick = vi.fn();
    render(
      <SLDViewCanvas
        connections={[
          {
            id: 'conn-1',
            fromSymbolId: 'bus-1',
            toSymbolId: 'bus-2',
            fromPortName: 'right',
            toPortName: 'left',
            path: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
            ],
            elementId: 'br-001',
            connectionType: 'branch',
            connectionStyle: 'default',
          } as any,
        ]}
        symbols={[
          {
            id: 'bus-1',
            elementId: 'bus-1',
            elementType: 'Bus',
            elementName: 'Szyna 1',
            position: { x: 100, y: 100 },
            inService: true,
          } as any,
          {
            id: 'bus-2',
            elementId: 'bus-2',
            elementType: 'Bus',
            elementName: 'Szyna 2',
            position: { x: 200, y: 100 },
            inService: true,
          } as any,
        ]}
        selectedId={null}
        onSymbolClick={vi.fn()}
        onSegmentClick={onSegmentClick}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
      />,
    );

    const connection = screen.getByTestId('sld-connection-conn-1');
    expect(connection).toHaveAttribute('data-connection-ref', 'br-001');
    expect(connection).toHaveAttribute('data-element-id', 'br-001');
    expect(connection).toHaveAttribute('data-connection-type', 'branch');

    fireEvent.click(connection.querySelector('polyline')!);
    expect(onSegmentClick).toHaveBeenCalledWith(
      expect.objectContaining({
        segment_ref: 'br-001',
        edge_id: 'conn-1',
        from_ref: 'bus-1',
        to_ref: 'bus-2',
        segment_kind: 'BRANCH',
      }),
    );
  });

  it('renderuje preview walidacyjny dla targetu niepoprawnego', () => {
    render(
      <SLDViewCanvas
        symbols={[]}
        selectedId={null}
        onSymbolClick={vi.fn()}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
        interactionPreview={{
          target_kind: 'segment',
          target_id: 'seg-x',
          valid: false,
          message_pl: 'To narzedzie wymaga segmentu magistrali',
        }}
      />,
    );

    expect(screen.getByTestId('sld-preview-status-overlay')).toBeDefined();
    expect(screen.getByText('To narzedzie wymaga segmentu magistrali')).toBeDefined();
  });

  it('klik overlayu pola GPZ wybiera pole SN zamiast przepuszczac klik do tla', () => {
    const onSymbolClick = vi.fn();

    render(
      <SLDViewCanvas
        symbols={[]}
        selectedId={null}
        onSymbolClick={onSymbolClick}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
        canonicalAnnotations={{
          gpzSections: [],
          gpzFeederFields: [
            {
              fieldId: 'bay-sn-1',
              feederNodeId: 'feeder-1',
              designation: 'Pole liniowe GPZ',
              axisX: 120,
              busTap: { x: 120, y: 100 },
              segmentStart: { x: 120, y: 180 },
              detail: {
                bayId: 'bay-sn-1',
                title: 'Pole liniowe GPZ',
                voltageKV: 15,
                currentA: 630,
                devices: [],
              },
            },
          ],
          stationChains: [],
          branchPoints: [],
          inlineBranchObjects: [],
          junctionDots: [],
        } as any}
      />,
    );

    fireEvent.click(screen.getByText('Pole liniowe GPZ'));
    expect(onSymbolClick).toHaveBeenCalledWith('bay-sn-1', 'BaySN', 'Pole liniowe GPZ');
  });

  it('port TRUNK_OUT kanonicznego pola GPZ uruchamia callback portu pola SN', () => {
    const onPortClick = vi.fn();

    render(
      <SLDViewCanvas
        symbols={[]}
        selectedId={null}
        onSymbolClick={vi.fn()}
        onPortClick={onPortClick}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
        canonicalAnnotations={{
          gpzSections: [],
          gpzFeederFields: [
            {
              fieldId: 'bay-sn-1',
              feederNodeId: 'feeder-1',
              designation: 'Pole liniowe GPZ',
              axisX: 120,
              busTap: { x: 120, y: 100 },
              segmentStart: { x: 120, y: 180 },
              detail: {
                bayId: 'bay-sn-1',
                title: 'Pole liniowe GPZ',
                voltageKV: 15,
                currentA: 630,
                devices: [],
              },
            },
          ],
          stationChains: [],
          branchPoints: [],
          inlineBranchObjects: [],
          junctionDots: [],
        } as any}
      />,
    );

    fireEvent.click(screen.getByTestId('sld-port-bay-sn-1-TRUNK_OUT'));
    expect(onPortClick).toHaveBeenCalledWith('bay-sn-1', 'BaySN', 'Pole liniowe GPZ', 'TRUNK_OUT');
  });

  it('dwuklik symbolu przekazuje intencje otwarcia glownego surfaceu', () => {
    const onSymbolDoubleClick = vi.fn();

    render(
      <SLDViewCanvas
        symbols={[
          {
            id: 'source-1',
            elementId: 'gpz-1',
            elementType: 'Source',
            elementName: 'GPZ 1',
            position: { x: 100, y: 100 },
            inService: true,
          } as any,
        ]}
        selectedId={null}
        onSymbolClick={vi.fn()}
        onSymbolDoubleClick={onSymbolDoubleClick}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
      />,
    );

    fireEvent.doubleClick(screen.getByTestId('mock-symbol-source-1'));
    expect(onSymbolDoubleClick).toHaveBeenCalledWith('source-1', 'Source', 'GPZ 1');
  });
});
