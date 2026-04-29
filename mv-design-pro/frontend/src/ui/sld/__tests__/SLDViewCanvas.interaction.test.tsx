import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SLDViewCanvas } from '../SLDViewCanvas';
import type { ViewportState } from '../types';

vi.mock('../symbols', () => ({
  UnifiedSymbolRenderer: ({ symbol, handlers, visualState }: any) => (
    <g
      data-testid={`mock-symbol-${symbol.id}`}
      data-energized={String(visualState?.energized)}
      onClick={() => handlers?.onClick?.(symbol.id)}
      onDoubleClick={() => handlers?.onDoubleClick?.(symbol.id)}
    >
      <circle cx={symbol.position.x} cy={symbol.position.y} r={6} />
    </g>
  ),
}));

vi.mock('../GpzFieldBlockRenderer', () => ({
  GpzSwitchgearRenderer: ({ fields, onFieldClick, onTrunkOutPortClick, onTrunkOutPortHover }: any) => (
    <g>
      {fields.map((field: any) => (
        <g key={field.fieldId} onClick={() => onFieldClick?.(field)}>
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
      ))}
    </g>
  ),
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

  it('renderuje porty z EngineeringSemanticModel zamiast zgadywac z ElementType', () => {
    render(
      <SLDViewCanvas
        symbols={[
          {
            id: 'visual-bus-like',
            elementId: 'bay-l3',
            elementType: 'Bus',
            elementName: 'Pole L3',
            position: { x: 100, y: 100 },
            inService: true,
          } as any,
        ]}
        selectedId="bay-l3"
        onSymbolClick={vi.fn()}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
        semanticModel={{
          semanticHash: 'sem-1',
          elements: [
            {
              refId: 'bay-l3',
              elementKind: 'MV_BAY',
              engineeringRole: 'LINE_FEEDER_BAY',
              completeness: 'MODEL_TECHNICZNY_PELNY',
              voltageDomain: 'SN',
              dataQualityState: 'PELNA',
              ports: [
                {
                  portId: 'bay-l3:out',
                  ownerRefId: 'bay-l3',
                  role: 'BAY_SN_OUT',
                  voltageDomain: 'SN',
                  nominalVoltageKv: 15,
                  phaseSystem: 'ABC',
                  connectionSide: 'STRONA_LINII',
                  minConnections: 0,
                  maxConnections: 1,
                  connectionPolicyRef: 'policy:BAY_SN_OUT',
                  requiredConnectionKinds: ['TOR_MOCY'],
                  forbiddenConnectionKinds: [],
                },
              ],
            },
          ],
          connections: [],
          physicalTopologyGraph: {
            graphId: 'graph-ports',
            connectionRefs: [],
            elementRefs: ['bay-l3'],
          },
        } as any}
      />,
    );

    expect(screen.getByTestId('sld-port-visual-bus-like-BAY_SN_OUT')).toBeDefined();
    expect(screen.queryByTestId('sld-port-visual-bus-like-TRUNK_OUT')).toBeNull();
  });

  it('energizacje bierze z EngineeringSemanticModel, nie z wizualnego elementType zrodla', () => {
    render(
      <SLDViewCanvas
        symbols={[
          {
            id: 'visual-source-like',
            elementId: 'bus-semantic',
            elementType: 'Source',
            elementName: 'utility_feeder grid PV',
            position: { x: 100, y: 100 },
            inService: true,
            connectedToNodeId: 'bus-semantic',
          } as any,
        ]}
        selectedId={null}
        onSymbolClick={vi.fn()}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
        semanticModel={{
          semanticHash: 'sem-2',
          elements: [
            {
              refId: 'bus-semantic',
              elementKind: 'BUSBAR_SECTION',
              engineeringRole: 'BUSBAR_SECTION',
              completeness: 'MODEL_TECHNICZNY_PELNY',
              voltageDomain: 'SN',
              dataQualityState: 'PELNA',
              ports: [
                {
                  portId: 'bus-semantic:p',
                  ownerRefId: 'bus-semantic',
                  role: 'BUSBAR_SN',
                  voltageDomain: 'SN',
                  nominalVoltageKv: 15,
                  phaseSystem: 'ABC',
                  connectionSide: 'NIE_DOTYCZY',
                  minConnections: 0,
                  maxConnections: 2,
                  connectionPolicyRef: 'policy:BUSBAR_SN',
                  requiredConnectionKinds: ['TOR_MOCY'],
                  forbiddenConnectionKinds: [],
                },
              ],
            },
          ],
          connections: [],
          physicalTopologyGraph: {
            graphId: 'graph-1',
            connectionRefs: [],
            elementRefs: ['bus-semantic'],
          },
        } as any}
      />,
    );

    expect(screen.getByTestId('mock-symbol-visual-source-like')).toHaveAttribute('data-energized', 'false');
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

  it('renderuje kabel SN jako linię przerywaną, a napowietrzną jako ciągłą', () => {
    render(
      <SLDViewCanvas
        connections={[
          {
            id: 'cable-1',
            fromSymbolId: 'bus-1',
            toSymbolId: 'bus-2',
            fromPortName: 'right',
            toPortName: 'left',
            path: [
              { x: 100, y: 100 },
              { x: 200, y: 100 },
            ],
            connectionType: 'branch',
            branchType: 'CABLE',
          } as any,
          {
            id: 'overhead-1',
            fromSymbolId: 'bus-2',
            toSymbolId: 'bus-3',
            fromPortName: 'right',
            toPortName: 'left',
            path: [
              { x: 220, y: 100 },
              { x: 320, y: 100 },
            ],
            connectionType: 'branch',
            branchType: 'LINE',
          } as any,
        ]}
        symbols={[
          { id: 'bus-1', elementId: 'bus-1', elementType: 'Bus', elementName: 'Szyna 1', position: { x: 100, y: 100 }, inService: true } as any,
          { id: 'bus-2', elementId: 'bus-2', elementType: 'Bus', elementName: 'Szyna 2', position: { x: 200, y: 100 }, inService: true } as any,
          { id: 'bus-3', elementId: 'bus-3', elementType: 'Bus', elementName: 'Szyna 3', position: { x: 320, y: 100 }, inService: true } as any,
        ]}
        selectedId={null}
        onSymbolClick={vi.fn()}
        viewport={VIEWPORT}
        showGrid={false}
        width={800}
        height={500}
      />,
    );

    const cableLine = screen.getByTestId('sld-connection-cable-1').querySelectorAll('polyline')[1];
    const overheadLine = screen.getByTestId('sld-connection-overhead-1').querySelectorAll('polyline')[1];

    expect(screen.getByTestId('sld-engineering-legend')).toBeInTheDocument();
    expect(cableLine).toHaveAttribute('stroke-dasharray', '8 5');
    expect(cableLine).toHaveAttribute('data-branch-medium', 'cable');
    expect(overheadLine).not.toHaveAttribute('stroke-dasharray');
    expect(overheadLine).toHaveAttribute('data-branch-medium', 'overhead');
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
