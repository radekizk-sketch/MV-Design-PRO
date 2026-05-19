import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SldCanvasV2 } from '../SldCanvasV2';

const baseProps = {
  width: 800,
  height: 600,
  gpzs: [],
  sections: [],
  cableRuns: [],
  stations: [],
  ders: [],
};

describe('SldCanvasV2 - tabele dokumentacyjne w widoku roboczym', () => {
  it('LOD 0 ukrywa tabele dokumentacyjne, aby nie zaslanialy przegladu sieci', () => {
    const { container } = render(<SldCanvasV2 {...baseProps} lodOverride={0} />);

    expect(container.querySelector('[data-testid="sld-v2-title-block"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-revision-table"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-power-balance-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-north-arrow"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-legend-overlay"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-grid-stability-panel"]')).toBeNull();
  });

  it('LOD 1 nadal nie pokazuje elementow dokumentacyjnych na interaktywnej kanwie', () => {
    const { container } = render(<SldCanvasV2 {...baseProps} lodOverride={1} />);

    expect(container.querySelector('[data-testid="sld-v2-title-block"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-revision-table"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-power-balance-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-scale-ruler"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-north-arrow"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-legend-overlay"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-grid-stability-panel"]')).toBeNull();
  });

  it('LOD 0 pokazuje GPZ jako wezel topologiczny bez aparatury rozdzielni', () => {
    const gpz = { id: 'gpz-1', x: 20, y: 40, name: 'GPZ 15 kV' };
    const canonicalGpz = {
      id: 'gpz-1',
      x: 20,
      y: 40,
      name: 'GPZ 15 kV',
      transformers: [],
      couplers: [],
      sections: [
        {
          sectionId: 'sec-1',
          order: 1,
          label: 'S1',
          busVoltageKv: 15,
          bays: [
            {
              bayRef: 'bay-1',
              bayNumber: '1',
              feederName: 'Linia terenowa',
              destinationLabel: null,
              fieldRole: 'LINE_OUT' as const,
              qDesignations: { cb: 'Q1', dsBus: 'Q0', dsLin: 'Q9', es: 'Q8', ct: 'T1' },
            },
          ],
        },
      ],
    };

    const lod0 = render(
      <SldCanvasV2
        {...baseProps}
        gpzs={[gpz]}
        canonicalGpzs={[canonicalGpz]}
        lodOverride={0}
      />,
    );
    expect(lod0.container.querySelector('[data-testid="sld-v2-gpz-overview-label-gpz-1"]')).not.toBeNull();
    expect(lod0.container.querySelector('[data-element-kind="apparatus"]')).toBeNull();

    const lod1 = render(
      <SldCanvasV2
        {...baseProps}
        gpzs={[gpz]}
        canonicalGpzs={[canonicalGpz]}
        lodOverride={1}
      />,
    );
    expect(lod1.container.querySelector('[data-element-kind="apparatus"]')).not.toBeNull();
  });

  it('przekazuje LOD do ciagow SN: LOD 0-1 pokazuje ciag, LOD 2 opisuje odcinki', () => {
    const cableRun = {
      id: 'run-lod',
      runKind: 'main_trunk' as const,
      pathPoints: [
        { x: 10, y: 100 },
        { x: 300, y: 100 },
      ],
      segmentKind: 'cable_sn' as const,
      label: 'Kabel SN · 290 m',
      segmentLabels: [{
        segmentRef: 'seg-lod',
        text: 'YAKXS 3X120 · 290 m',
        x: 150,
        y: 88,
      }],
    };

    const lod0 = render(<SldCanvasV2 {...baseProps} cableRuns={[cableRun]} lodOverride={0} />);
    expect(
      lod0.container.querySelector('[data-testid="sld-v2-run-run-lod-segment-label-seg-lod"]'),
    ).toBeNull();
    expect(lod0.container.querySelector('[data-testid="sld-v2-run-run-lod-label"]')).not.toBeNull();

    const lod1 = render(<SldCanvasV2 {...baseProps} cableRuns={[cableRun]} lodOverride={1} />);
    expect(
      lod1.container.querySelector('[data-testid="sld-v2-run-run-lod-segment-label-seg-lod"]'),
    ).toBeNull();
    expect(lod1.container.querySelector('[data-testid="sld-v2-run-run-lod-label"]')).not.toBeNull();

    const lod2 = render(<SldCanvasV2 {...baseProps} cableRuns={[cableRun]} lodOverride={2} />);
    expect(
      lod2.container.querySelector('[data-testid="sld-v2-run-run-lod-segment-label-seg-lod"]'),
    ).not.toBeNull();
    expect(lod2.container.querySelector('[data-testid="sld-v2-run-run-lod-label"]')).toBeNull();
  });

  it('stosuje monotoniczny LOD dla DER: przeglad ukrywa szczegoly, zblizenie je dodaje', () => {
    const der = {
      id: 'der-pv-lod',
      x: 180,
      y: 160,
      kind: 'PV' as const,
      name: 'PV terenowa',
      nominalPowerKw: 500,
    };

    const lod0 = render(<SldCanvasV2 {...baseProps} ders={[der]} lodOverride={0} />);
    expect(lod0.container.querySelector('[data-testid="sld-v2-der-der-pv-lod"]')).toBeNull();

    const lod0Selected = render(
      <SldCanvasV2
        {...baseProps}
        ders={[der]}
        selectedId="der-pv-lod"
        lodOverride={0}
      />,
    );
    expect(
      lod0Selected.container.querySelector('[data-element-kind="der_marker"]'),
    ).not.toBeNull();
    expect(lod0Selected.container.querySelector('[data-element-kind="der_full"]')).toBeNull();

    const lod1 = render(<SldCanvasV2 {...baseProps} ders={[der]} lodOverride={1} />);
    expect(lod1.container.querySelector('[data-testid="sld-v2-der-der-pv-lod"]')).toBeNull();
    expect(lod1.container.querySelector('[data-element-kind="der_compact"]')).toBeNull();

    const lod2 = render(<SldCanvasV2 {...baseProps} ders={[der]} lodOverride={2} />);
    expect(lod2.container.querySelector('[data-testid="sld-v2-der-der-pv-lod"]')).toBeNull();

    const lod2Selected = render(
      <SldCanvasV2
        {...baseProps}
        ders={[der]}
        selectedId="der-pv-lod"
        lodOverride={2}
      />,
    );
    expect(lod2Selected.container.querySelector('[data-element-kind="der_compact"]')).not.toBeNull();

    const lod3 = render(<SldCanvasV2 {...baseProps} ders={[der]} lodOverride={3} />);
    expect(lod3.container.querySelector('[data-element-kind="der_marker"]')).not.toBeNull();
    expect(lod3.container.querySelector('[data-element-kind="der_compact"]')).toBeNull();
    expect(lod3.container.querySelector('[data-element-kind="der_full"]')).toBeNull();

    const lod3Selected = render(
      <SldCanvasV2
        {...baseProps}
        ders={[der]}
        selectedId="der-pv-lod"
        lodOverride={3}
      />,
    );
    expect(lod3Selected.container.querySelector('[data-element-kind="der_compact"]')).not.toBeNull();

    const lod4 = render(<SldCanvasV2 {...baseProps} ders={[der]} lodOverride={4} />);
    expect(lod4.container.querySelector('[data-element-kind="der_full"]')).not.toBeNull();
  });

  it('ukrywa przewody przyłączeniowe DER do bliskiego poziomu pracy', () => {
    const connections = [
      {
        id: 'der-wire-pv/test',
        pathPoints: [
          { x: 100, y: 120 },
          { x: 100, y: 180 },
        ],
      },
      {
        id: 'main-sn-link',
        pathPoints: [
          { x: 20, y: 80 },
          { x: 300, y: 80 },
        ],
      },
    ];

    const lod0 = render(<SldCanvasV2 {...baseProps} connections={connections} lodOverride={0} />);
    expect(lod0.container.querySelector('[data-testid="sld-v2-connection-der-wire-pv/test"]')).toBeNull();
    expect(lod0.container.querySelector('[data-testid="sld-v2-connection-main-sn-link"]')).not.toBeNull();

    const lod2 = render(<SldCanvasV2 {...baseProps} connections={connections} lodOverride={2} />);
    expect(lod2.container.querySelector('[data-testid="sld-v2-connection-der-wire-pv/test"]')).toBeNull();

    const lod3 = render(<SldCanvasV2 {...baseProps} connections={connections} lodOverride={3} />);
    expect(lod3.container.querySelector('[data-testid="sld-v2-connection-der-wire-pv/test"]')).not.toBeNull();
  });

  it('zachowuje pełny symbol DER w bardzo bliskim LOD', () => {
    const der = {
      id: 'der-pv-full-lod',
      x: 180,
      y: 160,
      kind: 'PV' as const,
      name: 'PV terenowa',
      nominalPowerKw: 500,
    };

    const lod4 = render(<SldCanvasV2 {...baseProps} ders={[der]} lodOverride={4} />);
    expect(lod4.container.querySelector('[data-element-kind="der_full"]')).not.toBeNull();
  });

  it('ukrywa przewody przyłączeniowe DER w przegladzie topologii', () => {
    const connections = [
      {
        id: 'der-wire-pv/test',
        pathPoints: [
          { x: 100, y: 120 },
          { x: 100, y: 180 },
        ],
      },
      {
        id: 'main-sn-link',
        pathPoints: [
          { x: 20, y: 80 },
          { x: 300, y: 80 },
        ],
      },
    ];

    const lod0 = render(<SldCanvasV2 {...baseProps} connections={connections} lodOverride={0} />);
    expect(lod0.container.querySelector('[data-testid="sld-v2-connection-der-wire-pv/test"]')).toBeNull();
    expect(lod0.container.querySelector('[data-testid="sld-v2-connection-main-sn-link"]')).not.toBeNull();

    const lod3 = render(<SldCanvasV2 {...baseProps} connections={connections} lodOverride={3} />);
    expect(lod3.container.querySelector('[data-testid="sld-v2-connection-der-wire-pv/test"]')).not.toBeNull();
  });

  it('LOD 2 wybranego DER pokazuje compact bez pełnego symbolu', () => {
    const der = {
      id: 'der-pv-lod2',
      x: 180,
      y: 160,
      kind: 'PV' as const,
      name: 'PV terenowa',
      nominalPowerKw: 500,
    };

    const lod2 = render(
      <SldCanvasV2 {...baseProps} ders={[der]} selectedId="der-pv-lod2" lodOverride={2} />,
    );
    expect(lod2.container.querySelector('[data-element-kind="der_compact"]')).not.toBeNull();
    expect(lod2.container.querySelector('[data-element-kind="der_full"]')).toBeNull();
  });

  it('stosuje monotoniczny LOD dla stacji na ciagu SN', () => {
    const station = {
      id: 'st-lod',
      x: 120,
      y: 220,
      name: 'S01',
      topologicalType: 'przelotowa' as const,
      stationCode: 'S01',
      snBays: [
        { bayRef: 'bay-in', fieldRole: 'LINE_IN' as const, designation: 'Q01', hasMissingRequiredDevice: false },
        { bayRef: 'bay-out', fieldRole: 'LINE_OUT' as const, designation: 'Q02', hasMissingRequiredDevice: false },
        { bayRef: 'bay-tr', fieldRole: 'TRANSFORMER' as const, designation: 'TR', hasMissingRequiredDevice: false },
      ],
      hasTransformer: true,
      transformerRatedKva: 630,
      nnFeedersCount: 2,
      derBadges: [],
    };

    const lod0 = render(<SldCanvasV2 {...baseProps} stations={[station]} lodOverride={0} />);
    expect(lod0.container.querySelector('[data-testid="sld-v2-mini-rmu-st-lod"]')?.getAttribute('data-lod-variant')).toBe('overview');
    expect(lod0.container.querySelector('[data-testid^="sld-symbol-transformer-"]')).toBeNull();

    const lod1 = render(<SldCanvasV2 {...baseProps} stations={[station]} lodOverride={1} />);
    expect(lod1.container.querySelector('[data-testid="sld-v2-mini-rmu-st-lod"]')?.getAttribute('data-lod-variant')).toBe('overview');
    expect(lod1.container.querySelector('[data-testid^="sld-symbol-transformer-"]')).toBeNull();
    expect(lod1.container.querySelector('[data-element-kind="mini_block_compact"]')).toBeNull();

    const lod2 = render(<SldCanvasV2 {...baseProps} stations={[station]} lodOverride={2} />);
    expect(lod2.container.querySelector('[data-testid="sld-v2-mini-rmu-st-lod"]')?.getAttribute('data-lod-variant')).toBe('compact');
    expect(lod2.container.querySelector('[data-element-kind="mini_block_detail"]')).toBeNull();

    const lod3 = render(<SldCanvasV2 {...baseProps} stations={[station]} lodOverride={3} />);
    expect(lod3.container.querySelector('[data-testid="sld-v2-mini-rmu-st-lod"]')?.getAttribute('data-lod-variant')).toBe('detail');
    expect(lod3.container.querySelector('[data-testid^="sld-symbol-transformer-"]')).toBeNull();
  });

  it('w widoku topologii nie rozcina ciagu SN szerzej niz porty stacji', () => {
    const station = {
      id: 'st-gap',
      x: 100,
      y: 180,
      name: 'S01',
      topologicalType: 'przelotowa' as const,
      stationCode: 'S01',
      snBays: [
        { bayRef: 'bay-in', fieldRole: 'LINE_IN' as const, designation: 'Q01', hasMissingRequiredDevice: false },
        { bayRef: 'bay-out', fieldRole: 'LINE_OUT' as const, designation: 'Q02', hasMissingRequiredDevice: false },
      ],
      hasTransformer: true,
      transformerRatedKva: 630,
      nnFeedersCount: 1,
      derBadges: [],
    };
    const cableRun = {
      id: 'run-gap',
      runKind: 'main_trunk' as const,
      pathPoints: [
        { x: 0, y: 100 },
        { x: 220, y: 100 },
      ],
      segmentKind: 'cable_sn' as const,
    };

    const { container } = render(
      <SldCanvasV2 {...baseProps} stations={[station]} cableRuns={[cableRun]} lodOverride={0} />,
    );
    const circles = Array.from(
      container.querySelectorAll('[data-testid="sld-v2-run-run-gap-junction-st-gap"] circle'),
    );

    expect(circles.map((circle) => circle.getAttribute('cx'))).toEqual(['65', '135']);
  });

  it('nie startuje z mikroskopijna skala dla duzej sieci terenowej', async () => {
    const stations = [
      {
        id: 'stn-large-01',
        x: 0,
        y: 0,
        name: 'S01',
        topologicalType: 'przelotowa' as const,
      },
      {
        id: 'stn-large-02',
        x: 100000,
        y: 60000,
        name: 'S02',
        topologicalType: 'przelotowa' as const,
      },
    ];

    const { container } = render(<SldCanvasV2 {...baseProps} stations={stations} />);
    const svg = container.querySelector('[data-testid="sld-canvas-v2"]');

    await waitFor(() => expect(svg?.getAttribute('data-scale')).toBe('0.220'));
  });

  it('tooltip transformatora SN/nN nie pokazuje surowej referencji stacji', () => {
    const station = {
      id: 'stn/a/station',
      x: 120,
      y: 220,
      name: 'Stacja testowa',
      topologicalType: 'przelotowa' as const,
      nnVoltageLevelsCount: 1,
      transformerRefs: ['stn/a/transformer/tr1'],
    };

    const { container } = render(
      <SldCanvasV2 {...baseProps} stations={[station]} lodOverride={3} />,
    );

    const title = container.querySelector('[data-testid="sld-symbol-transformer-stn/a/transformer/tr1"] title');
    expect(title?.textContent).toBe('Transformator SN/nN 1');
    expect(title?.textContent).not.toContain('stn/');
  });
});
