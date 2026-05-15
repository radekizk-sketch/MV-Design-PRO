/**
 * PR-5b — Testy rendererów v2 + SldCanvasV2 smoke.
 *
 * Inwarianty:
 * 1. State→style: zmiana stanu aparatu nie zmienia geometrii (data-testid stabilne).
 * 2. Renderery emitują data-element-kind dla LOD/layer filtering.
 * 3. SldCanvasV2 renderuje się bez błędów dla minimal i full sample sieci.
 */

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SldCanvasV2 } from '../canvas/SldCanvasV2';
import { BayRenderer } from '../renderer/BayRenderer';
import { CableRunRenderer } from '../renderer/CableRunRenderer';
import { DerRenderer } from '../renderer/DerRenderer';
import { DeviceRenderer } from '../renderer/DeviceRenderer';
import { GpzRenderer } from '../renderer/GpzRenderer';
import { SectionRenderer } from '../renderer/SectionRenderer';
import { StationOnRunRenderer } from '../renderer/StationOnRunRenderer';

describe('GpzRenderer', () => {
  it('renderuje GPZ z nazwą i napięciami', () => {
    const { container, getByText } = render(
      <svg>
        <GpzRenderer id="gpz_1" x={40} y={80} name="GPZ Główny" voltageHighKv={110} voltageLowKv={15} />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-gpz-gpz_1"]')).toBeTruthy();
    expect(getByText('GPZ Główny')).toBeInTheDocument();
    expect(getByText('110 / 15 kV')).toBeInTheDocument();
  });

  it('selected → niebieska obwódka', () => {
    const { container } = render(
      <svg>
        <GpzRenderer id="gpz_1" x={0} y={0} name="G" voltageHighKv={110} voltageLowKv={15} selected={true} />
      </svg>,
    );
    const rect = container.querySelector('rect');
    expect(rect?.getAttribute('stroke')).toBe('#35C7FF');
  });
});

describe('SectionRenderer', () => {
  it('renderuje cyfrę rzymską sekcji', () => {
    const { getByText } = render(
      <svg>
        <SectionRenderer id="s1" x={0} y={200} number={1} busVoltageKv={15} bayCount={6} />
      </svg>,
    );
    expect(getByText('Sekcja I')).toBeInTheDocument();
    expect(getByText('15 kV')).toBeInTheDocument();
  });

  it('section number 4 → IV (rzymskie)', () => {
    const { getByText } = render(
      <svg>
        <SectionRenderer id="s4" x={0} y={200} number={4} busVoltageKv={15} bayCount={6} />
      </svg>,
    );
    expect(getByText('Sekcja IV')).toBeInTheDocument();
  });
});

describe('DeviceRenderer — state→style invariant', () => {
  it('CB closed/open mają różne fill ale ten sam viewBox/anchor', () => {
    const propsBase = {
      id: 'cb1',
      kind: 'CB' as const,
      designationQ: 'Q0',
      x: 0,
      y: 0,
    };

    const { container: closedContainer } = render(
      <svg>
        <DeviceRenderer {...propsBase} state="closed" />
      </svg>,
    );
    const { container: openContainer } = render(
      <svg>
        <DeviceRenderer {...propsBase} state="open" />
      </svg>,
    );

    const closedG = closedContainer.querySelector('[data-element-kind="device"]');
    const openG = openContainer.querySelector('[data-element-kind="device"]');

    // Geometria: ten sam transform (translate)
    expect(closedG?.getAttribute('transform')).toBe(openG?.getAttribute('transform'));

    // Stan w atrybucie data
    expect(closedG?.getAttribute('data-device-state')).toBe('closed');
    expect(openG?.getAttribute('data-device-state')).toBe('open');

    // Fill różny
    const closedRect = closedContainer.querySelector('rect');
    const openRect = openContainer.querySelector('rect');
    expect(closedRect?.getAttribute('fill')).not.toBe(openRect?.getAttribute('fill'));
  });

  it('głowica kablowa (CABLE_HEAD) jest trójkątem (polygon), NIE okręgiem', () => {
    const { container } = render(
      <svg>
        <DeviceRenderer id="gk1" kind="CABLE_HEAD" designationQ="GK" state="closed" x={0} y={0} />
      </svg>,
    );
    expect(container.querySelector('polygon')).toBeTruthy();
    expect(container.querySelector('circle')).toBeFalsy();
  });

  it('kanon: wyłącznik jest kwadratem, odłącznik kółkiem, rozłącznik rombem', () => {
    const { container: cbContainer } = render(
      <svg>
        <DeviceRenderer id="cb1" kind="CB" designationQ="Q0" state="closed" x={0} y={0} />
      </svg>,
    );
    const breaker = cbContainer.querySelector('[data-symbol-canon="circuit_breaker_square"]');
    expect(breaker?.tagName.toLowerCase()).toBe('rect');
    expect(breaker?.getAttribute('width')).toBe(breaker?.getAttribute('height'));

    const { container: dsContainer } = render(
      <svg>
        <DeviceRenderer id="ds1" kind="DS_BUS" designationQ="Q1" state="closed" x={0} y={0} />
      </svg>,
    );
    expect(dsContainer.querySelector('[data-symbol-canon="disconnector_circle"]')?.tagName.toLowerCase()).toBe('circle');

    const { container: sdContainer } = render(
      <svg>
        <DeviceRenderer id="sd1" kind="SWITCH_DISCONNECTOR" designationQ="Q2" state="closed" x={0} y={0} />
      </svg>,
    );
    const switchDisconnector = sdContainer.querySelector('[data-symbol-canon="switch_disconnector_rotated_square"]');
    expect(switchDisconnector?.tagName.toLowerCase()).toBe('rect');
    expect(switchDisconnector?.getAttribute('transform')).toContain('rotate(45)');
  });

  it('uziemnik (ES) ma tor boczny + symbol ziemi (3 poziome linie)', () => {
    const { container } = render(
      <svg>
        <DeviceRenderer id="es1" kind="ES" designationQ="Q9" state="closed" x={0} y={0} />
      </svg>,
    );
    expect(container.querySelector('[data-symbol-canon="earthing_switch_lateral_branch"]')).toBeTruthy();
    const lines = container.querySelectorAll('line');
    // Co najmniej 4 linie: 1 pionowy boczny + 3 poziome ziemi
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });

  it('CT (przekładnik prądowy) ma 2 okręgi (w osi toru)', () => {
    const { container } = render(
      <svg>
        <DeviceRenderer id="ct1" kind="CT" designationQ="T1" state="closed" x={0} y={0} />
      </svg>,
    );
    expect(container.querySelectorAll('circle').length).toBe(2);
  });

  it('VT (przekładnik napięciowy) ma boczny tor + okrąg z literą "V"', () => {
    const { container, getByText } = render(
      <svg>
        <DeviceRenderer id="vt1" kind="VT" designationQ="T2" state="closed" x={0} y={0} />
      </svg>,
    );
    expect(container.querySelector('circle')).toBeTruthy();
    expect(getByText('V')).toBeInTheDocument();
  });

  it('TRANSFORMER_DEVICE ma 2 okręgi (kanon briefa §5 pkt 20)', () => {
    const { container } = render(
      <svg>
        <DeviceRenderer id="tr1" kind="TRANSFORMER_DEVICE" designationQ="TR" state="closed" x={0} y={0} />
      </svg>,
    );
    expect(container.querySelectorAll('circle').length).toBe(2);
  });

  it('Q label widoczny tylko gdy showQLabel=true', () => {
    const { queryByText, rerender } = render(
      <svg>
        <DeviceRenderer id="cb1" kind="CB" designationQ="Q0" state="closed" x={0} y={0} showQLabel={false} />
      </svg>,
    );
    expect(queryByText('Q0')).toBeFalsy();

    rerender(
      <svg>
        <DeviceRenderer id="cb1" kind="CB" designationQ="Q0" state="closed" x={0} y={0} showQLabel={true} />
      </svg>,
    );
    expect(queryByText('Q0')).toBeTruthy();
  });
});

describe('BayRenderer', () => {
  it('renderuje pole z aparatami w sekwencji', () => {
    const { container, getByText } = render(
      <svg>
        <BayRenderer
          id="bay_F01"
          x={40}
          y={200}
          designation="Pole F-01"
          devices={[
            { id: 'q1', kind: 'DS_BUS', designationQ: 'Q1', state: 'closed' },
            { id: 'q0', kind: 'CB', designationQ: 'Q0', state: 'closed' },
          ]}
        />
      </svg>,
    );
    expect(getByText('Pole F-01')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="sld-v2-device-q1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-device-q0"]')).toBeTruthy();
  });
});

describe('CableRunRenderer', () => {
  it('renderuje ciąg jako path z punktami', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="run_F01"
          runKind="main_trunk"
          segmentKind="cable_sn"
          pathPoints={[
            { x: 40, y: 200 },
            { x: 40, y: 400 },
            { x: 240, y: 400 },
          ]}
        />
      </svg>,
    );
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2); // hit area + visible
  });

  it('linia napowietrzna ma dasharray odróżniający od kabla', () => {
    const { container: cableContainer } = render(
      <svg>
        <CableRunRenderer id="r1" runKind="main_trunk" segmentKind="cable_sn"
          pathPoints={[{ x: 0, y: 0 }, { x: 100, y: 0 }]} />
      </svg>,
    );
    const { container: lineContainer } = render(
      <svg>
        <CableRunRenderer id="r2" runKind="main_trunk" segmentKind="overhead_line_sn"
          pathPoints={[{ x: 0, y: 0 }, { x: 100, y: 0 }]} />
      </svg>,
    );
    const cablePath = cableContainer.querySelectorAll('path')[1];
    const linePath = lineContainer.querySelectorAll('path')[1];
    expect(linePath?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(cablePath?.getAttribute('stroke-dasharray')).not.toBe(linePath?.getAttribute('stroke-dasharray'));
  });

  it('odgałęzienie (branch) jest cieńsze niż trunk', () => {
    const { container: trunkContainer } = render(
      <svg>
        <CableRunRenderer id="t1" runKind="main_trunk" segmentKind="cable_sn"
          pathPoints={[{ x: 0, y: 0 }, { x: 100, y: 0 }]} />
      </svg>,
    );
    const { container: branchContainer } = render(
      <svg>
        <CableRunRenderer id="b1" runKind="branch" segmentKind="cable_sn"
          pathPoints={[{ x: 0, y: 0 }, { x: 100, y: 0 }]} />
      </svg>,
    );
    const trunkPath = trunkContainer.querySelectorAll('path')[1];
    const branchPath = branchContainer.querySelectorAll('path')[1];
    expect(parseFloat(trunkPath.getAttribute('stroke-width') ?? '0'))
      .toBeGreaterThan(parseFloat(branchPath.getAttribute('stroke-width') ?? '0'));
  });

  it('rozcinana widoczna trase na portach stacji przelotowej', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="r-port"
          runKind="main_trunk"
          segmentKind="cable_sn"
          pathPoints={[{ x: 0, y: 0 }, { x: 200, y: 0 }]}
          stationPortGaps={[{
            stationId: 'ST-1',
            y: 0,
            inputX: 90,
            outputX: 110,
          }]}
        />
      </svg>,
    );
    const visiblePaths = container.querySelectorAll('[data-testid^="sld-v2-run-r-port-visible-"]');
    expect(visiblePaths).toHaveLength(2);
    expect(visiblePaths[0]?.getAttribute('d')).toBe('M 0 0 L 90 0');
    expect(visiblePaths[1]?.getAttribute('d')).toBe('M 110 0 L 200 0');
    expect(container.querySelector('path')?.getAttribute('d')).toBe('M 0 0 L 200 0');
  });

  it('renderuje junction dots na portach stacji (IEC 60617 galvanic chain)', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="r-junc"
          runKind="main_trunk"
          segmentKind="cable_sn"
          pathPoints={[{ x: 0, y: 0 }, { x: 300, y: 0 }]}
          stationPortGaps={[{
            stationId: 'ST-A',
            y: 0,
            inputX: 90,
            outputX: 110,
          }]}
        />
      </svg>,
    );
    const junctionGroup = container.querySelector('[data-testid="sld-v2-run-r-junc-junction-ST-A"]');
    expect(junctionGroup).toBeTruthy();
    const circles = junctionGroup?.querySelectorAll('circle');
    expect(circles).toHaveLength(2);
    expect(Number(circles?.[0].getAttribute('cx'))).toBe(90);
    expect(Number(circles?.[1].getAttribute('cx'))).toBe(110);
  });

  it('junction dot pojedynczy gdy outputX null (terminal station)', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="r-term"
          runKind="main_trunk"
          segmentKind="cable_sn"
          pathPoints={[{ x: 0, y: 0 }, { x: 200, y: 0 }]}
          stationPortGaps={[{
            stationId: 'ST-END',
            y: 0,
            inputX: 180,
            outputX: null,
          }]}
        />
      </svg>,
    );
    const junctionGroup = container.querySelector('[data-testid="sld-v2-run-r-term-junction-ST-END"]');
    expect(junctionGroup).toBeTruthy();
    const circles = junctionGroup?.querySelectorAll('circle');
    expect(circles).toHaveLength(1);
    expect(Number(circles?.[0].getAttribute('cx'))).toBe(180);
  });

  it('pokazuje typ, długość odcinka i wybór dalszego obiektu', () => {
    const onClick = vi.fn();
    const { getByText, container } = render(
      <svg>
        <CableRunRenderer
          id="r-pending"
          runKind="main_trunk"
          segmentKind="cable_sn"
          label="XRUHAKXS 120/25 · 500 m"
          pendingEndpoint={true}
          pathPoints={[{ x: 120, y: 420 }, { x: 120, y: 520 }, { x: 480, y: 520 }]}
          onClick={onClick}
        />
      </svg>,
    );

    expect(getByText('XRUHAKXS 120/25 · 500 m')).toBeInTheDocument();
    expect(getByText('Wybierz kolejny obiekt')).toBeInTheDocument();
    expect(getByText('stacja / ZK SN / słup / ciąg')).toBeInTheDocument();
    const pendingEnd = container.querySelector('[data-testid="sld-v2-run-r-pending-pending-end"]');
    expect(pendingEnd).toBeTruthy();
    const hitArea = pendingEnd?.querySelector('rect[pointer-events="all"]');
    expect(Number(hitArea?.getAttribute('width'))).toBeGreaterThan(180);
    pendingEnd?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledWith('r-pending');
  });

  it('dla wielu odcinków pokazuje etykiety katalogowe na segmentach zamiast ogólnego opisu kabla', () => {
    const { getByText, queryByText, container } = render(
      <svg>
        <CableRunRenderer
          id="r-segments"
          runKind="main_trunk"
          segmentKind="cable_sn"
          label="różne typy katalogowe · 1,2 km"
          segmentPaths={[
            { segmentRef: 'SEG-1', pathPoints: [{ x: 0, y: 100 }, { x: 140, y: 100 }] },
            { segmentRef: 'SEG-2', pathPoints: [{ x: 160, y: 100 }, { x: 300, y: 100 }] },
          ]}
          segmentLabels={[
            { segmentRef: 'SEG-1', text: 'XRUHAKXS 120/25 · 500 m', x: 80, y: 90 },
            { segmentRef: 'SEG-2', text: 'XRUHAKXS 70/25 · 700 m', x: 220, y: 116 },
          ]}
          pathPoints={[{ x: 0, y: 100 }, { x: 300, y: 100 }]}
        />
      </svg>,
    );

    expect(getByText('XRUHAKXS 120/25 · 500 m')).toBeInTheDocument();
    expect(getByText('XRUHAKXS 70/25 · 700 m')).toBeInTheDocument();
    expect(queryByText('różne typy katalogowe · 1,2 km')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="sld-v2-run-r-segments-segment-hitbox-SEG-1"] polyline')?.getAttribute('points'))
      .toBe('0,100 140,100');
    expect(container.querySelector('[data-testid="sld-v2-run-r-segments-segment-hitbox-SEG-2"] polyline')?.getAttribute('points'))
      .toBe('160,100 300,100');
  });

  it('LOD < 2 ukrywa segmentLabels (AC-06 label declutter)', () => {
    const { queryByText } = render(
      <svg>
        <CableRunRenderer
          id="r-lod"
          runKind="main_trunk"
          segmentKind="cable_sn"
          segmentLabels={[
            { segmentRef: 'SEG-1', text: 'Etykieta odcinka SEG-1', x: 80, y: 90 },
            { segmentRef: 'SEG-2', text: 'Etykieta odcinka SEG-2', x: 220, y: 90 },
          ]}
          pathPoints={[{ x: 0, y: 100 }, { x: 300, y: 100 }]}
          lod={1}
        />
      </svg>,
    );
    // Przy LOD=1 segmentLabels są ukryte
    expect(queryByText('Etykieta odcinka SEG-1')).toBeNull();
    expect(queryByText('Etykieta odcinka SEG-2')).toBeNull();
  });

  it('LOD ≥ 2 pokazuje segmentLabels', () => {
    const { getByText } = render(
      <svg>
        <CableRunRenderer
          id="r-lod2"
          runKind="main_trunk"
          segmentKind="cable_sn"
          segmentLabels={[
            { segmentRef: 'SEG-1', text: 'XRUHAKXS 120/25 · 500 m', x: 80, y: 90 },
          ]}
          pathPoints={[{ x: 0, y: 100 }, { x: 300, y: 100 }]}
          lod={2}
        />
      </svg>,
    );
    expect(getByText('XRUHAKXS 120/25 · 500 m')).toBeInTheDocument();
  });

  it('K30-7: runKind="ring" renderuje ring indicator z text "RING"', () => {
    const { container, getByText } = render(
      <svg>
        <CableRunRenderer
          id="r-ring"
          runKind="ring"
          segmentKind="cable_sn"
          pathPoints={[{ x: 100, y: 200 }, { x: 600, y: 200 }]}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-run-r-ring-ring-indicator"]')).toBeTruthy();
    expect(getByText('RING')).toBeInTheDocument();
  });

  it('K30-7: runKind="loop" renderuje "LOOP" text', () => {
    const { container, getByText } = render(
      <svg>
        <CableRunRenderer
          id="r-loop"
          runKind="loop"
          segmentKind="cable_sn"
          pathPoints={[{ x: 100, y: 200 }, { x: 600, y: 200 }]}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-run-r-loop-ring-indicator"]')).toBeTruthy();
    expect(getByText('LOOP')).toBeInTheDocument();
  });

  it('K30-7: runKind="main_trunk" NIE renderuje ring indicator', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="r-mt"
          runKind="main_trunk"
          segmentKind="cable_sn"
          pathPoints={[{ x: 100, y: 200 }, { x: 600, y: 200 }]}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-run-r-mt-ring-indicator"]')).toBeFalsy();
  });

  it('K30-33: per-segment wariant kabla renderuje różne stroke kolory', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="r-var"
          runKind="main_trunk"
          segmentKind="cable_sn"
          pathPoints={[{ x: 0, y: 0 }, { x: 300, y: 0 }]}
          segmentPaths={[
            {
              segmentRef: 'seg-epr',
              pathPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
              variant: { insulation: 'EPR', conductor: 'Al' },
            },
            {
              segmentRef: 'seg-xlpe',
              pathPoints: [{ x: 100, y: 0 }, { x: 200, y: 0 }],
              variant: { insulation: 'XLPE', conductor: 'Cu' },
            },
            {
              segmentRef: 'seg-paper',
              pathPoints: [{ x: 200, y: 0 }, { x: 300, y: 0 }],
              variant: { insulation: 'PAPER', conductor: 'Al' },
            },
          ]}
        />
      </svg>,
    );
    const eprPath = container.querySelector('[data-testid^="sld-v2-run-r-var-variant-seg-epr-"]');
    const xlpePath = container.querySelector('[data-testid^="sld-v2-run-r-var-variant-seg-xlpe-"]');
    const paperPath = container.querySelector('[data-testid^="sld-v2-run-r-var-variant-seg-paper-"]');
    expect(eprPath?.getAttribute('stroke')).toBe('#FFD166');
    expect(xlpePath?.getAttribute('stroke')).toBe('#13C45A');
    expect(paperPath?.getAttribute('stroke')).toBe('#A8B5BD');
    // PAPER ma dashed pattern
    expect(paperPath?.getAttribute('stroke-dasharray')).toBe('6 3');
    // Cu daje +0.6 px do stroke-width vs Al
    expect(parseFloat(xlpePath!.getAttribute('stroke-width') ?? '0'))
      .toBeGreaterThan(parseFloat(eprPath!.getAttribute('stroke-width') ?? '0'));
    // Atrybuty data dla downstream audytu
    expect(eprPath?.getAttribute('data-cable-insulation')).toBe('EPR');
    expect(xlpePath?.getAttribute('data-cable-conductor')).toBe('Cu');
  });

  it('K30-33: backward-compat — segmentPaths bez variant nadal renderuje uniform stroke', () => {
    const { container } = render(
      <svg>
        <CableRunRenderer
          id="r-novar"
          runKind="main_trunk"
          segmentKind="cable_sn"
          pathPoints={[{ x: 0, y: 0 }, { x: 200, y: 0 }]}
          segmentPaths={[
            { segmentRef: 'seg-a', pathPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
            { segmentRef: 'seg-b', pathPoints: [{ x: 100, y: 0 }, { x: 200, y: 0 }] },
          ]}
        />
      </svg>,
    );
    const variantPaths = container.querySelectorAll('[data-testid^="sld-v2-run-r-novar-variant-"]');
    expect(variantPaths).toHaveLength(0);
    // Uniform visible path nadal renderowany przez buildVisibleCablePaths
    const visiblePaths = container.querySelectorAll('[data-testid^="sld-v2-run-r-novar-visible-"]');
    expect(visiblePaths.length).toBeGreaterThan(0);
  });
});

describe('StationOnRunRenderer', () => {
  it('pokazuje nazwę i typ topologiczny po polsku', () => {
    const { getByText } = render(
      <svg>
        <StationOnRunRenderer
          id="st1"
          x={300}
          y={400}
          name="Stacja ST-01"
          topologicalType="przelotowa"
        />
      </svg>,
    );
    expect(getByText('Stacja ST-01')).toBeInTheDocument();
    expect(getByText(/przelotowa/)).toBeInTheDocument();
  });

  it('multi-voltage stacja pokazuje "Nx nN"', () => {
    const { getByText } = render(
      <svg>
        <StationOnRunRenderer
          id="st1"
          x={300}
          y={400}
          name="Stacja przemysłowa"
          topologicalType="przelotowa"
          nnVoltageLevelsCount={3}
        />
      </svg>,
    );
    expect(getByText(/3× nN/)).toBeInTheDocument();
  });

  it('missingData wyświetla badge braku danych', () => {
    const { container } = render(
      <svg>
        <StationOnRunRenderer
          id="st1"
          x={300}
          y={400}
          name="ST-01"
          topologicalType="końcowa"
          missingData={true}
        />
      </svg>,
    );
    const badge = container.querySelector('[data-testid="sld-v2-station-missing-st1"] circle');
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute('fill')).toBe('#FFB020');
  });

  it('isNop=true renderuje badge "NOP" (Normalnie Otwarty Punkt)', () => {
    const { container, getByText } = render(
      <svg>
        <StationOnRunRenderer
          id="st-nop"
          x={300}
          y={400}
          name="ST-NOP"
          topologicalType="sekcyjna"
          isNop={true}
        />
      </svg>,
    );
    const badge = container.querySelector('[data-testid="sld-v2-station-nop-badge-st-nop"]');
    expect(badge).toBeTruthy();
    expect(getByText('NOP')).toBeInTheDocument();
  });

  it('isNop=false/undefined → brak badge NOP', () => {
    const { container } = render(
      <svg>
        <StationOnRunRenderer
          id="st-no-nop"
          x={300}
          y={400}
          name="ST-01"
          topologicalType="przelotowa"
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-station-nop-badge-st-no-nop"]')).toBeFalsy();
  });

  it('distanceFromGpzKm ≥ 1 → format "X.X km"', () => {
    const { container, getByText } = render(
      <svg>
        <StationOnRunRenderer
          id="st-dist"
          x={300}
          y={400}
          name="ST-01"
          topologicalType="przelotowa"
          distanceFromGpzKm={2.3}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-station-distance-st-dist"]')).toBeTruthy();
    expect(getByText('2.3 km')).toBeInTheDocument();
  });

  it('distanceFromGpzKm < 1 → format "XXX m"', () => {
    const { getByText } = render(
      <svg>
        <StationOnRunRenderer
          id="st-dist-m"
          x={300}
          y={400}
          name="ST-01"
          topologicalType="przelotowa"
          distanceFromGpzKm={0.75}
        />
      </svg>,
    );
    expect(getByText('750 m')).toBeInTheDocument();
  });

  it('IEC 60617: szyna SN ma terminatory na obu końcach (kreski prostopadłe)', () => {
    const { container } = render(
      <svg>
        <StationOnRunRenderer
          id="st-busend"
          x={300}
          y={400}
          name="ST-01"
          topologicalType="przelotowa"
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-station-bus-end-left-st-busend"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sld-v2-station-bus-end-right-st-busend"]')).toBeTruthy();
  });

  it('transformerRatedKva < 1000 → format "XXX kVA"', () => {
    const { container, getByText } = render(
      <svg>
        <StationOnRunRenderer
          id="st-kva"
          x={300}
          y={400}
          name="ST-01"
          topologicalType="końcowa"
          transformerRatedKva={630}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-station-rated-kva-st-kva"]')).toBeTruthy();
    expect(getByText('630 kVA')).toBeInTheDocument();
  });

  it('transformerRatedKva ≥ 1000 → format "X.X MVA"', () => {
    const { getByText } = render(
      <svg>
        <StationOnRunRenderer
          id="st-mva"
          x={300}
          y={400}
          name="ST-01"
          topologicalType="końcowa"
          transformerRatedKva={1600}
        />
      </svg>,
    );
    expect(getByText('1.6 MVA')).toBeInTheDocument();
  });

  it('transformerRatedKva=null → brak etykiety mocy', () => {
    const { container } = render(
      <svg>
        <StationOnRunRenderer
          id="st-no-kva"
          x={300}
          y={400}
          name="ST-01"
          topologicalType="końcowa"
          transformerRatedKva={null}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-station-rated-kva-st-no-kva"]')).toBeFalsy();
  });

  it('K30-7: switchStateByColumn[0]="open" → connector ma stroke COLOR_DEVICE_OPEN i dashed', () => {
    const { container } = render(
      <svg>
        <StationOnRunRenderer
          id="st-sw"
          x={100}
          y={100}
          name="Stacja"
          topologicalType="przelotowa"
          switchStateByColumn={['open', 'closed']}
        />
      </svg>,
    );
    const conn0 = container.querySelector('[data-testid="sld-v2-station-connector-st-sw-0"]');
    const conn1 = container.querySelector('[data-testid="sld-v2-station-connector-st-sw-1"]');
    expect(conn0?.getAttribute('data-switch-state')).toBe('open');
    expect(conn1?.getAttribute('data-switch-state')).toBe('closed');
    // Connector 0 polygon fill should be 'none' (open), connector 1 should be filled
    const poly0 = conn0?.querySelector('polygon');
    const poly1 = conn1?.querySelector('polygon');
    expect(poly0?.getAttribute('fill')).toBe('none');
    expect(poly1?.getAttribute('fill')).toBe('#0A8D43');
  });

  it('K30-7: switchStateByColumn[0]="unknown" → wyświetla "?" overlay na polygon', () => {
    const { container, getByText } = render(
      <svg>
        <StationOnRunRenderer
          id="st-q"
          x={100}
          y={100}
          name="Stacja"
          topologicalType="końcowa"
          switchStateByColumn={['unknown']}
        />
      </svg>,
    );
    const conn = container.querySelector('[data-testid="sld-v2-station-connector-st-q-0"]');
    expect(conn?.getAttribute('data-switch-state')).toBe('unknown');
    // Renders the question mark
    expect(getByText('?')).toBeInTheDocument();
  });

  it('K30-7: switchStateByColumn brak → wszystkie connectors w stanie "closed" (default back-compat)', () => {
    const { container } = render(
      <svg>
        <StationOnRunRenderer
          id="st-d"
          x={100}
          y={100}
          name="Stacja"
          topologicalType="przelotowa"
        />
      </svg>,
    );
    const conn0 = container.querySelector('[data-testid="sld-v2-station-connector-st-d-0"]');
    expect(conn0?.getAttribute('data-switch-state')).toBe('closed');
  });

  it('K30-36: stacja przelotowa default → bay-role labels "WE" + "WY"', () => {
    const { container, getByText } = render(
      <svg>
        <StationOnRunRenderer
          id="st-pl"
          x={300}
          y={400}
          name="ST-01"
          topologicalType="przelotowa"
        />
      </svg>,
    );
    const role0 = container.querySelector('[data-testid="sld-v2-station-bay-role-st-pl-0"]');
    const role1 = container.querySelector('[data-testid="sld-v2-station-bay-role-st-pl-1"]');
    expect(role0?.textContent).toBe('WE');
    expect(role1?.textContent).toBe('WY');
    expect(getByText('WE')).toBeInTheDocument();
    expect(getByText('WY')).toBeInTheDocument();
    // data-bay-role atrybut na connector group dla downstream audytu
    expect(container.querySelector('[data-testid="sld-v2-station-connector-st-pl-0"]')?.getAttribute('data-bay-role')).toBe('WE');
  });

  it('K30-36: stacja odgałęźna 3-kolumnowa → WE / TR / WY', () => {
    const { container } = render(
      <svg>
        <StationOnRunRenderer
          id="st-od"
          x={0}
          y={0}
          name="ST-ODG"
          topologicalType="odgałęźna"
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-station-bay-role-st-od-0"]')?.textContent).toBe('WE');
    expect(container.querySelector('[data-testid="sld-v2-station-bay-role-st-od-1"]')?.textContent).toBe('TR');
    expect(container.querySelector('[data-testid="sld-v2-station-bay-role-st-od-2"]')?.textContent).toBe('WY');
  });

  it('K30-36: stacja sekcyjna default → SPR + WE', () => {
    const { container } = render(
      <svg>
        <StationOnRunRenderer
          id="st-sk"
          x={0}
          y={0}
          name="ST-SEK"
          topologicalType="sekcyjna"
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-station-bay-role-st-sk-0"]')?.textContent).toBe('SPR');
    expect(container.querySelector('[data-testid="sld-v2-station-bay-role-st-sk-1"]')?.textContent).toBe('WE');
  });

  it('K30-36: explicit bayRoleByColumn override defaults', () => {
    const { container } = render(
      <svg>
        <StationOnRunRenderer
          id="st-ov"
          x={0}
          y={0}
          name="ST-OV"
          topologicalType="przelotowa"
          bayRoleByColumn={['POM', 'ODG']}
        />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-station-bay-role-st-ov-0"]')?.textContent).toBe('POM');
    expect(container.querySelector('[data-testid="sld-v2-station-bay-role-st-ov-1"]')?.textContent).toBe('ODG');
  });
});

describe('DerRenderer', () => {
  it('PV / BESS / FW mają etykiety polskie', () => {
    const { getByText: pv } = render(
      <svg>
        <DerRenderer id="d1" x={0} y={0} kind="PV" name="PV-01" />
      </svg>,
    );
    expect(pv('PV')).toBeInTheDocument();

    const { getByText: bess } = render(
      <svg>
        <DerRenderer id="d2" x={0} y={0} kind="BESS" name="BESS-01" />
      </svg>,
    );
    expect(bess('BESS')).toBeInTheDocument();

    const { getByText: fw } = render(
      <svg>
        <DerRenderer id="d3" x={0} y={0} kind="FW" name="FW-01" />
      </svg>,
    );
    expect(fw('FW')).toBeInTheDocument();
  });

  it('wyświetla moc w kW gdy podana', () => {
    const { getByText } = render(
      <svg>
        <DerRenderer id="d1" x={0} y={0} kind="PV" name="PV-01" nominalPowerKw={2000} />
      </svg>,
    );
    expect(getByText('2000 kW')).toBeInTheDocument();
  });

  it('NC RFG Module A badge widoczny dla modułu A (Mikro)', () => {
    const { container } = render(
      <svg>
        <DerRenderer id="d1" x={0} y={0} kind="PV" name="PV-01" ncRfgModule="A" />
      </svg>,
    );
    const badge = container.querySelector('[data-testid="sld-v2-der-d1-nc-rfg-module"]');
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute('data-nc-rfg-module')).toBe('A');
  });

  it('NC RFG Module D badge widoczny dla modułu D (B. duże)', () => {
    const { container } = render(
      <svg>
        <DerRenderer id="d1" x={0} y={0} kind="BESS" name="BESS-01" ncRfgModule="D" />
      </svg>,
    );
    const badge = container.querySelector('[data-testid="sld-v2-der-d1-nc-rfg-module"]');
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute('data-nc-rfg-module')).toBe('D');
  });

  it('NC RFG Module badge NIE renderowany gdy null', () => {
    const { container } = render(
      <svg>
        <DerRenderer id="d1" x={0} y={0} kind="FW" name="FW-01" ncRfgModule={null} />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-der-d1-nc-rfg-module"]')).toBeNull();
  });

  it('NC RFG Module badge NIE renderowany w trybie marker (LOD=marker)', () => {
    const { container } = render(
      <svg>
        <DerRenderer id="d1" x={0} y={0} kind="PV" name="PV-01" ncRfgModule="B" lod="marker" />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-der-d1-nc-rfg-module"]')).toBeNull();
  });

  it('P/Q widget widoczny przy LOD=full z operatingPMw', () => {
    const { container } = render(
      <svg>
        <DerRenderer id="d1" x={0} y={0} kind="PV" name="PV-01"
          operatingPMw={0.5} operatingQMvar={0.1} lod="full" />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-der-d1-pq-widget"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-der-d1-cos-phi"]')).not.toBeNull();
  });

  it('cos φ NIE renderowany gdy brak operatingPMw', () => {
    const { container } = render(
      <svg>
        <DerRenderer id="d2" x={0} y={0} kind="BESS" name="BESS-01" lod="full" />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-der-d2-pq-widget"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-der-d2-cos-phi"]')).toBeNull();
  });

  it('P/Q widget NIE renderowany w trybie compact (LOD=compact)', () => {
    const { container } = render(
      <svg>
        <DerRenderer id="d3" x={0} y={0} kind="FW" name="FW-01"
          operatingPMw={1.0} operatingQMvar={0.2} lod="compact" />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-der-d3-pq-widget"]')).toBeNull();
  });

  it('cos φ compact renderowany gdy operatingPMw + operatingQMvar w LOD=compact', () => {
    const { container } = render(
      <svg>
        <DerRenderer id="d4" x={0} y={0} kind="PV" name="PV-Cos"
          operatingPMw={0.8} operatingQMvar={0.6} lod="compact" />
      </svg>,
    );
    const badge = container.querySelector('[data-testid="sld-v2-der-d4-compact-cos-phi"]');
    expect(badge).not.toBeNull();
    // cos φ = 0.8 / sqrt(0.8² + 0.6²) = 0.8 / 1.0 = 0.80
    expect(badge!.textContent).toContain('cosφ 0.80');
  });

  it('NC RFG badge widoczny w trybie compact', () => {
    const { container } = render(
      <svg>
        <DerRenderer id="d5" x={0} y={0} kind="PV" name="PV-NCRFG"
          ncRfgModule="B" lod="compact" />
      </svg>,
    );
    expect(container.querySelector('[data-testid="sld-v2-der-d5-nc-rfg-module"]')).not.toBeNull();
    expect(container.querySelector('[data-nc-rfg-module="B"]')).not.toBeNull();
  });
});

describe('SldCanvasV2 — smoke', () => {
  it('renderuje pusty canvas bez błędów', () => {
    const { container } = render(
      <SldCanvasV2 width={800} height={600} gpzs={[]} sections={[]} cableRuns={[]} stations={[]} ders={[]} />,
    );
    expect(container.querySelector('[data-testid="sld-canvas-v2"]')).toBeTruthy();
  });

  it('renderuje minimalną sieć (GPZ + sekcja + 1 stacja + 1 PV)', () => {
    const { container, getByText } = render(
      <SldCanvasV2
        width={1000}
        height={700}
        gpzs={[{ id: 'gpz_1', x: 40, y: 80, name: 'GPZ', voltageHighKv: 110, voltageLowKv: 15 }]}
        sections={[{ id: 's1', x: 40, y: 200, number: 1, busVoltageKv: 15, bayCount: 2 }]}
        cableRuns={[{ id: 'r1', runKind: 'main_trunk', segmentKind: 'cable_sn',
          pathPoints: [{ x: 40, y: 260 }, { x: 40, y: 400 }, { x: 280, y: 400 }] }]}
        stations={[{ id: 'st1', x: 280, y: 400, name: 'ST-01', topologicalType: 'końcowa' }]}
        ders={[{ id: 'pv1', x: 380, y: 600, kind: 'PV', name: 'PV-01', nominalPowerKw: 1000 }]}
      />,
    );
    expect(container.querySelector('[data-testid="sld-canvas-v2"]')).toBeTruthy();
    expect(getByText('GPZ')).toBeInTheDocument();
    expect(getByText('ST-01')).toBeInTheDocument();
    expect(getByText('PV-01')).toBeInTheDocument();
  });

  it('Lod indicator pokazuje aktualny LOD i scale', () => {
    const { container } = render(
      <SldCanvasV2 width={800} height={600} gpzs={[]} sections={[]} cableRuns={[]} stations={[]} ders={[]} lodOverride={2} />,
    );
    expect(container.querySelector('[data-lod="2"]')).toBeTruthy();
  });

  it('layer toggle: ders OFF ukrywa DER renderery', () => {
    const { container } = render(
      <SldCanvasV2
        width={800}
        height={600}
        gpzs={[]}
        sections={[]}
        cableRuns={[]}
        stations={[]}
        ders={[{ id: 'pv1', x: 100, y: 100, kind: 'PV', name: 'PV-01' }]}
        layerVisibility={{ der: false }}
      />,
    );
    expect(container.querySelector('[data-testid="sld-v2-der-pv1"]')).toBeFalsy();
  });

  it('kabel nie przechodzi przez stacje przelotowa, tylko konczy sie na portach WE/WY', () => {
    const { container } = render(
      <SldCanvasV2
        width={900}
        height={500}
        gpzs={[]}
        sections={[]}
        cableRuns={[{
          id: 'run_ports',
          runKind: 'main_trunk',
          segmentKind: 'cable_sn',
          pathPoints: [{ x: 0, y: 100 }, { x: 300, y: 100 }],
        }]}
        stations={[{
          id: 'st-inline',
          x: 150,
          y: 180,
          name: 'ST przelotowa',
          topologicalType: 'przelotowa',
        }]}
        ders={[]}
      />,
    );
    const visiblePaths = container.querySelectorAll('[data-testid^="sld-v2-run-run_ports-visible-"]');
    expect(visiblePaths).toHaveLength(2);
    expect(visiblePaths[0]?.getAttribute('d')).toBe('M 0 100 L 122 100');
    expect(visiblePaths[1]?.getAttribute('d')).toBe('M 178 100 L 300 100');
  });
});
