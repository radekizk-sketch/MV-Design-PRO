/**
 * PR-5b — Testy rendererów v2 + SldCanvasV2 smoke.
 *
 * Inwarianty:
 * 1. State→style: zmiana stanu aparatu nie zmienia geometrii (data-testid stabilne).
 * 2. Renderery emitują data-element-kind dla LOD/layer filtering.
 * 3. SldCanvasV2 renderuje się bez błędów dla minimal i full sample sieci.
 */

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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

  it('uziemnik (ES) ma tor boczny + symbol ziemi (3 poziome linie)', () => {
    const { container } = render(
      <svg>
        <DeviceRenderer id="es1" kind="ES" designationQ="Q9" state="closed" x={0} y={0} />
      </svg>,
    );
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
    const badge = container.querySelector('circle');
    expect(badge).toBeTruthy();
    expect(badge?.getAttribute('fill')).toBe('#FFC857');
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
});
