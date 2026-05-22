import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

  it('podswietla dokladny odcinek wskazany przez selectedId', () => {
    const cableRun = {
      id: 'run-selected-segment',
      runKind: 'main_trunk' as const,
      pathPoints: [
        { x: 10, y: 100 },
        { x: 300, y: 100 },
      ],
      segmentKind: 'cable_sn' as const,
      segmentPaths: [
        { segmentRef: 'seg-a', pathPoints: [{ x: 10, y: 100 }, { x: 120, y: 100 }] },
        { segmentRef: 'seg-b', pathPoints: [{ x: 140, y: 100 }, { x: 300, y: 100 }] },
      ],
    };

    const { container } = render(
      <SldCanvasV2
        {...baseProps}
        cableRuns={[cableRun]}
        selectedId="seg-b"
        lodOverride={2}
      />,
    );

    expect(
      container.querySelector('[data-testid="sld-v2-run-run-selected-segment-segment-hitbox-seg-b"]')
        ?.getAttribute('data-selected'),
    ).toBe('true');
    expect(
      container.querySelector('[data-testid="sld-v2-run-run-selected-segment-segment-seg-b-0"]')
        ?.getAttribute('data-selected-segment'),
    ).toBe('seg-b');
    expect(
      container.querySelector('[data-testid="sld-v2-run-run-selected-segment-segment-hitbox-seg-a"]')
        ?.getAttribute('data-selected'),
    ).toBeNull();
  });

  it('LOD 4 nie dorysowuje osobnego TR obok mini-bloku niewybranej stacji z polami SN', () => {
    const station = {
      id: 'st-lod4-compact',
      x: 120,
      y: 220,
      name: 'Stacja SN/nN 5',
      topologicalType: 'przelotowa' as const,
      stationCode: 'S05',
      snBays: [
        { bayRef: 'st-lod4-compact/we', fieldRole: 'LINE_IN' as const, designation: 'WE', hasMissingRequiredDevice: false },
        { bayRef: 'st-lod4-compact/wy', fieldRole: 'LINE_OUT' as const, designation: 'WY', hasMissingRequiredDevice: false },
        { bayRef: 'st-lod4-compact/tr', fieldRole: 'TRANSFORMER' as const, designation: 'TR', hasMissingRequiredDevice: false },
      ],
      hasTransformer: true,
      transformerRefs: ['st-lod4-compact/tr1'],
      transformerRatedKva: 630,
      nnFeedersCount: 1,
      derBadges: [],
    };

    const { container } = render(
      <SldCanvasV2
        {...baseProps}
        stations={[station]}
        selectedId="seg/active"
        lodOverride={4}
      />,
    );

    const root = container.querySelector('[data-testid="sld-v2-mini-rmu-st-lod4-compact"]');
    expect(root?.getAttribute('data-lod-variant')).toBe('compact');
    expect(container.querySelector('[data-testid^="sld-symbol-transformer-"]')).toBeNull();
  });

  it('renderuje etykiety topologiczne z globalnego declutteringu zamiast lokalnych opisow odcinka', () => {
    const cableRun = {
      id: 'run-global',
      runKind: 'main_trunk' as const,
      pathPoints: [
        { x: 10, y: 100 },
        { x: 300, y: 100 },
      ],
      segmentKind: 'cable_sn' as const,
      label: 'Kabel lokalny',
      segmentLabels: [{
        segmentRef: 'seg-global',
        text: 'Opis lokalny',
        x: 150,
        y: 88,
      }],
    };
    const labelSpecs = [
      {
        id: 'label:run:run-global',
        ownerRef: 'run-global',
        ownerKind: 'run' as const,
        text: 'Ciag terenowy',
        priority: 500,
        anchorPoint: { x: 150, y: 90 },
        width: 120,
        height: 18,
      },
      {
        id: 'label:segment:seg-global',
        ownerRef: 'seg-global',
        ownerKind: 'segment' as const,
        text: 'NA2XS2Y 1x150/25 mm2',
        priority: 500,
        anchorPoint: { x: 150, y: 88 },
        width: 180,
        height: 18,
      },
    ];
    const readabilityReport = {
      score: 100,
      totalLabels: 2,
      placedLabels: 2,
      hiddenLabels: 0,
      criticalCollisions: 0,
      hiddenCriticalLabelRefs: [],
      orphanStationRefs: [],
      orphanSegmentRefs: [],
      missingTerminalRefs: [],
      topologyContinuity: 'continuous' as const,
      labelPlacements: [
        { id: 'label:run:run-global', anchor: 'top' as const, bbox: { x: 90, y: 72, width: 120, height: 18 }, hidden: false, locked: false },
        { id: 'label:segment:seg-global', anchor: 'bottom' as const, bbox: { x: 60, y: 110, width: 180, height: 18 }, hidden: false, locked: false },
      ],
    };

    const lod0 = render(
      <SldCanvasV2
        {...baseProps}
        cableRuns={[cableRun]}
        labelSpecs={labelSpecs}
        readabilityReport={readabilityReport}
        lodOverride={0}
      />,
    );
    expect(lod0.container.querySelector('[data-testid="sld-v2-run-run-global-label"]')).toBeNull();
    expect(lod0.container.querySelector('[data-testid="sld-v2-topology-label-label:run:run-global"]')).toBeNull();
    expect(lod0.container.querySelector('[data-testid="sld-v2-topology-label-label:segment:seg-global"]')).toBeNull();

    const lod1 = render(
      <SldCanvasV2
        {...baseProps}
        cableRuns={[cableRun]}
        labelSpecs={labelSpecs}
        readabilityReport={readabilityReport}
        lodOverride={1}
      />,
    );
    expect(lod1.container.querySelector('[data-testid="sld-v2-run-run-global-segment-label-seg-global"]')).toBeNull();
    expect(lod1.container.querySelector('[data-testid="sld-v2-topology-label-label:run:run-global"]')).not.toBeNull();
    expect(lod1.container.querySelector('[data-testid="sld-v2-topology-label-label:segment:seg-global"]')).toBeNull();

    const lod2 = render(
      <SldCanvasV2
        {...baseProps}
        cableRuns={[cableRun]}
        labelSpecs={labelSpecs}
        readabilityReport={readabilityReport}
        lodOverride={2}
      />,
    );
    expect(lod2.container.querySelector('[data-testid="sld-v2-topology-label-label:run:run-global"]')).not.toBeNull();
    expect(lod2.container.querySelector('[data-testid="sld-v2-topology-label-label:segment:seg-global"]')).not.toBeNull();

    const lod2WithSelectedStation = render(
      <SldCanvasV2
        {...baseProps}
        cableRuns={[cableRun]}
        labelSpecs={labelSpecs}
        readabilityReport={readabilityReport}
        selectedId="station-active"
        lodOverride={2}
      />,
    );
    expect(
      lod2WithSelectedStation.container.querySelector('[data-testid="sld-v2-topology-label-label:segment:seg-global"]'),
    ).toBeNull();

    const lod3 = render(
      <SldCanvasV2
        {...baseProps}
        cableRuns={[cableRun]}
        labelSpecs={labelSpecs}
        readabilityReport={readabilityReport}
        lodOverride={3}
      />,
    );
    expect(lod3.container.querySelector('[data-testid="sld-v2-topology-label-label:segment:seg-global"]')).toBeNull();

    const lod4 = render(
      <SldCanvasV2
        {...baseProps}
        cableRuns={[cableRun]}
        labelSpecs={labelSpecs}
        readabilityReport={readabilityReport}
        lodOverride={4}
      />,
    );
    expect(lod4.container.querySelector('[data-testid="sld-v2-topology-label-label:segment:seg-global"]')).toBeNull();
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
    expect(lod4.container.querySelector('[data-element-kind="der_compact"]')).not.toBeNull();
    expect(lod4.container.querySelector('[data-element-kind="der_full"]')).toBeNull();
    lod4.unmount();

    const selectedLod4 = render(
      <SldCanvasV2 {...baseProps} ders={[der]} selectedId="der-pv-lod" lodOverride={4} />,
    );
    expect(selectedLod4.container.querySelector('[data-element-kind="der_full"]')).not.toBeNull();
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
    expect(lod4.container.querySelector('[data-element-kind="der_compact"]')).not.toBeNull();
    expect(lod4.container.querySelector('[data-element-kind="der_full"]')).toBeNull();
    lod4.unmount();

    const selectedLod4 = render(
      <SldCanvasV2 {...baseProps} ders={[der]} selectedId="der-pv-full-lod" lodOverride={4} />,
    );
    expect(selectedLod4.container.querySelector('[data-element-kind="der_full"]')).not.toBeNull();
  });

  it('pokazuje transformator blokowy DER jako element układu przyłączeniowego', () => {
    const der = {
      id: 'der-pv-block',
      x: 180,
      y: 160,
      kind: 'PV' as const,
      name: 'PV 1 MW',
      nominalPowerKw: 1000,
      hasBlockTransformer: true,
      blockTransformerLabel: 'TR 15/0,69 kV 1250 kVA Dyn5',
    };

    const lod4 = render(<SldCanvasV2 {...baseProps} ders={[der]} selectedId="der-pv-block" lodOverride={4} />);
    const symbol = lod4.container.querySelector('[data-testid="sld-v2-der-der-pv-block-block-transformer"]');
    const label = lod4.container.querySelector('[data-testid="sld-v2-der-der-pv-block-block-transformer-label"]');
    const root = lod4.container.querySelector('[data-testid="sld-v2-der-der-pv-block"]');

    expect(symbol).not.toBeNull();
    expect(label?.textContent).toBe('TR blokowy 15/0,69 kV 1250 kVA Dyn5');
    expect(root?.getAttribute('data-block-transformer-label')).toBe('TR 15/0,69 kV 1250 kVA Dyn5');
    expect(label?.textContent).not.toMatch(/der\/|tr-block|ref|hash/i);
  });

  it('pokazuje etykietę TR blokowego także dla niezaznaczonego DER w LOD 4', () => {
    const der = {
      id: 'der-pv-block-compact',
      x: 180,
      y: 160,
      kind: 'PV' as const,
      name: 'PV 1 MW',
      nominalPowerKw: 1000,
      hasBlockTransformer: true,
      blockTransformerLabel: 'TR 15/0,69 kV 1250 kVA Dyn5',
    };

    const lod4 = render(<SldCanvasV2 {...baseProps} ders={[der]} lodOverride={4} />);
    const compactLabel = lod4.container.querySelector(
      '[data-testid="sld-v2-der-der-pv-block-compact-compact-block-transformer"]',
    );

    expect(lod4.container.querySelector('[data-element-kind="der_compact"]')).not.toBeNull();
    expect(compactLabel?.textContent).toContain('TR blokowy 1250 kVA');
    expect(compactLabel?.textContent).not.toMatch(/der\/|tr-block|ref|hash/i);
  });

  it('opis połączenia DER wskazuje transformator blokowy, a nie transformator stacji', () => {
    const connections = [
      {
        id: 'der-wire-pv-block',
        pathPoints: [
          { x: 140, y: 160 },
          { x: 180, y: 190 },
          { x: 230, y: 190 },
        ],
        connectionKind: 'der_block_transformer' as const,
        transformerLabel: 'TR 15/0,69 kV 1250 kVA Dyn5',
      },
    ];

    const { container } = render(<SldCanvasV2 {...baseProps} connections={connections} lodOverride={1} />);
    const transformer = container.querySelector('[data-testid="sld-v2-connection-transformer-der-wire-pv-block"]');

    expect(transformer?.textContent).toContain('TR blokowy 15/0,69 kV 1250 kVA Dyn5');
    expect(transformer?.textContent).not.toMatch(/der\/|tr-block|ref|hash/i);
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
    expect(lod3.container.querySelector('[data-testid="sld-v2-mini-rmu-st-lod"]')?.getAttribute('data-lod-variant')).toBe('compact');
    expect(lod3.container.querySelector('[data-testid^="sld-symbol-transformer-"]')).toBeNull();

    const lod4 = render(<SldCanvasV2 {...baseProps} stations={[station]} lodOverride={4} />);
    expect(lod4.container.querySelector('[data-testid="sld-v2-mini-rmu-st-lod"]')?.getAttribute('data-lod-variant')).toBe('compact');
    expect(lod4.container.querySelector('[data-testid^="sld-symbol-transformer-"]')).toBeNull();

    const selectedLod4 = render(
      <SldCanvasV2 {...baseProps} stations={[station]} selectedId="st-lod" lodOverride={4} />,
    );
    expect(selectedLod4.container.querySelector('[data-testid="sld-v2-mini-rmu-st-lod"]')?.getAttribute('data-lod-variant')).toBe('compact');
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

  it('nie dubluje etykiet stacji i ZKSN z globalnej warstwy labeli', () => {
    const station = {
      id: 'st-label',
      x: 120,
      y: 220,
      name: 'Stacja SN/nN 1',
      topologicalType: 'przelotowa' as const,
      stationCode: 'S01',
      snBays: [
        { bayRef: 'st-label/we', fieldRole: 'LINE_IN' as const, designation: 'WE', hasMissingRequiredDevice: false },
        { bayRef: 'st-label/wy', fieldRole: 'LINE_OUT' as const, designation: 'WY', hasMissingRequiredDevice: false },
      ],
      hasTransformer: true,
      transformerRatedKva: 630,
      nnFeedersCount: 1,
      derBadges: [],
    };
    const zksnBranchPoint = {
      id: 'zksn-label',
      name: 'ZKSN terenowy',
      branchPointType: 'zksn',
      x: 180,
      y: 220,
      anchorX: 180,
      anchorY: 220,
      runRef: 'run-1',
      parentSegmentRef: 'seg-1',
      switchgearFieldCount: 4,
      branchPortCount: 2,
      hasTransformer: false,
    } as const;
    const branchPole = {
      id: 'bp-label',
      name: 'Słup rozgałęźny SN',
      branchPointType: 'branch_pole',
      x: 320,
      y: 220,
      anchorX: 320,
      anchorY: 220,
      runRef: 'run-1',
      parentSegmentRef: 'seg-2',
    } as const;
    const labelSpecs = [
      {
        id: 'label:station:st-label',
        ownerRef: 'st-label',
        ownerKind: 'station' as const,
        text: 'S01 przelotowa',
        priority: 800,
        anchorPoint: { x: 120, y: 220 },
        width: 96,
        height: 18,
        preferredAnchor: 'bottom' as const,
      },
      {
        id: 'label:branch-point:zksn-label',
        ownerRef: 'zksn-label',
        ownerKind: 'branch_point' as const,
        text: 'ZKSN',
        priority: 900,
        anchorPoint: { x: 180, y: 220 },
        width: 54,
        height: 18,
        preferredAnchor: 'bottom' as const,
      },
      {
        id: 'label:branch-point:bp-label',
        ownerRef: 'bp-label',
        ownerKind: 'branch_point' as const,
        text: 'Słup rozg.',
        priority: 800,
        anchorPoint: { x: 320, y: 220 },
        width: 80,
        height: 18,
        preferredAnchor: 'top' as const,
      },
    ];
    const readabilityReport = {
      score: 100,
      totalLabels: 3,
      placedLabels: 3,
      hiddenLabels: 0,
      criticalCollisions: 0,
      hiddenCriticalLabelRefs: [],
      orphanStationRefs: [],
      orphanSegmentRefs: [],
      missingTerminalRefs: [],
      topologyContinuity: 'continuous' as const,
      labelPlacements: labelSpecs.map((label) => ({
        id: label.id,
        anchor: label.preferredAnchor,
        bbox: {
          x: label.anchorPoint.x,
          y: label.anchorPoint.y,
          width: label.width,
          height: label.height,
        },
        hidden: false,
        locked: false,
      })),
    };

    const { container } = render(
      <SldCanvasV2
        {...baseProps}
        stations={[station]}
        branchPoints={[zksnBranchPoint, branchPole]}
        labelSpecs={labelSpecs}
        readabilityReport={readabilityReport}
        lodOverride={0}
      />,
    );

    expect(container.querySelector('[data-testid="sld-v2-mini-rmu-overview-code-st-label"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-zksn-switchgear-zksn-label"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-topology-label-label:station:st-label"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-topology-label-label:branch-point:zksn-label"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-topology-label-label:branch-point:bp-label"]')).not.toBeNull();

    const selected = render(
      <SldCanvasV2
        {...baseProps}
        stations={[station]}
        branchPoints={[zksnBranchPoint, branchPole]}
        labelSpecs={labelSpecs}
        readabilityReport={readabilityReport}
        selectedId="st-label"
        lodOverride={0}
      />,
    );

    expect(selected.container.querySelector('[data-testid="sld-v2-mini-rmu-overview-code-st-label"]')).not.toBeNull();
    expect(selected.container.querySelector('[data-testid="sld-v2-topology-label-label:station:st-label"]')).toBeNull();
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

  it('renderuje punkt rozgalezienia z adaptera jako wezel topologii', () => {
    const { container } = render(
      <SldCanvasV2
        {...baseProps}
        branchPoints={[
          {
            id: 'bp-1',
            name: 'Slup rozgalezienia SN',
            branchPointType: 'branch_pole',
            x: 120,
            y: 180,
            runRef: 'run-1',
            parentSegmentRef: 'seg-1',
            catalogRef: 'SLUP-ODG-12',
            switchState: 'closed',
          },
        ]}
        lodOverride={1}
      />,
    );

    expect(container.querySelector('[data-testid="sld-v2-branch-point-bp-1"]')).not.toBeNull();
    expect(container.querySelector('[data-sld-kind="branch_pole"]')).not.toBeNull();
  });

  it('pokazuje slup jako symbol terenowy odsunięty od punktu wpięcia trasy', () => {
    const branchPoint = {
      id: 'bp-route',
      name: 'Slup rozgalezienia SN',
      branchPointType: 'branch_pole' as const,
      x: 240,
      y: 120,
      anchorX: 180,
      anchorY: 220,
      runRef: 'run-1',
      parentSegmentRef: 'seg-1',
      catalogRef: 'SLUP-ODG-12',
      switchState: 'closed' as const,
    };

    const lod1 = render(
      <SldCanvasV2
        {...baseProps}
        branchPoints={[branchPoint]}
        lodOverride={1}
      />,
    );
    const routeNode = lod1.container.querySelector('[data-testid="sld-v2-branch-point-bp-route"]');
    expect(routeNode?.getAttribute('transform')).toBe('translate(240, 120)');
    expect(routeNode?.getAttribute('data-callout-mode')).toBe('route-offset');
    expect(routeNode?.getAttribute('data-branch-pole-renderer')).toBe('overhead-line-node');
    expect(routeNode?.getAttribute('data-branch-point-kind')).toBe('branch_pole');
    const overheadNode = lod1.container.querySelector('[data-testid="sld-v2-branch-pole-node-bp-route"]');
    expect(overheadNode).not.toBeNull();
    expect(overheadNode?.getAttribute('data-switchgear-visual')).toBe('overhead-line-node');
    expect(overheadNode?.getAttribute('data-has-switchgear')).toBe('false');
    expect(overheadNode?.getAttribute('data-has-transformer')).toBe('false');
    expect(overheadNode?.getAttribute('data-has-field-labels')).toBe('false');
    expect(overheadNode?.querySelector('title')?.textContent).toBe('Słup rozgałęźny SN');
    expect(overheadNode?.textContent).not.toContain('nie rozdzielnica');
    expect(overheadNode?.textContent).not.toMatch(/\b(WE|WY|ODG)\b/);
    expect(lod1.container.querySelector('[data-testid="sld-v2-branch-point-route-anchor-bp-route"]')).not.toBeNull();
    expect(lod1.container.querySelector('[data-testid="sld-v2-branch-point-inline-label-bp-route"]')).not.toBeNull();
    expect(lod1.container.querySelector('[data-testid="sld-v2-branch-point-callout-bp-route"]')).toBeNull();
    lod1.unmount();

    const lod3 = render(
      <SldCanvasV2
        {...baseProps}
        branchPoints={[branchPoint]}
        lodOverride={3}
      />,
    );
    const detailedNode = lod3.container.querySelector('[data-testid="sld-v2-branch-point-bp-route"]');
    expect(detailedNode?.getAttribute('transform')).toBe('translate(240, 120)');
    expect(detailedNode?.getAttribute('data-callout-mode')).toBe('route-offset');
    expect(lod3.container.querySelector('[data-testid="sld-v2-branch-point-route-anchor-bp-route"]')).not.toBeNull();
    expect(lod3.container.querySelector('[data-testid="sld-v2-branch-point-inline-label-bp-route"]')).not.toBeNull();
    expect(lod3.container.querySelector('[data-testid="sld-v2-branch-point-callout-bp-route"]')).toBeNull();
  });

  it('renderuje ZKSN jak stacje-rozlacznice SN i rozwija szczegoly tylko po wyborze', () => {
    const zksnBranchPoint = {
      id: 'zksn-route',
      name: 'ZKSN terenowy',
      branchPointType: 'zksn',
      x: 180,
      y: 220,
      anchorX: 180,
      anchorY: 220,
      runRef: 'run-1',
      parentSegmentRef: 'seg-1',
      catalogRef: 'ZKSN-2P-630A',
      switchState: 'closed',
      branchPortCount: 2,
      switchgearFieldCount: 4,
      hasTransformer: false,
    } as const;

    const { container, unmount } = render(
      <SldCanvasV2
        {...baseProps}
        branchPoints={[zksnBranchPoint]}
        lodOverride={3}
      />,
    );

    const zksn = container.querySelector('[data-testid="sld-v2-branch-point-zksn-route"]');
    expect(zksn?.getAttribute('data-sld-kind')).toBe('zksn');
    expect(zksn?.getAttribute('data-has-transformer')).toBe('false');
    expect(zksn?.getAttribute('data-switchgear-field-count')).toBe('4');
    const switchgear = container.querySelector('[data-testid="sld-v2-zksn-switchgear-zksn-route"]');
    expect(switchgear).not.toBeNull();
    expect(switchgear?.getAttribute('data-zksn-renderer')).toBe('station-like-switchgear');
    expect(switchgear?.getAttribute('data-switchgear-visual')).toBe('station-node');
    expect(switchgear?.getAttribute('data-has-transformer')).toBe('false');
    expect(switchgear?.getAttribute('data-field-count')).toBe('4');
    expect(
      container
        .querySelector('[data-testid="sld-v2-mini-rmu-zksn-zksn-route"]')
        ?.getAttribute('data-lod-variant'),
    ).toBe('compact');
    expect(container.querySelector('[data-testid="sld-v2-zksn-route-drop-zksn-route"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-branch-point-route-anchor-zksn-route"]')).toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-branch-point-inline-label-zksn-route"]')).toBeNull();
    expect(container.querySelector('[data-testid^="sld-symbol-transformer-"]')).toBeNull();
    unmount();

    const lod4Terrain = render(
      <SldCanvasV2
        {...baseProps}
        branchPoints={[zksnBranchPoint]}
        lodOverride={4}
      />,
    );
    expect(
      lod4Terrain.container
        .querySelector('[data-testid="sld-v2-mini-rmu-zksn-zksn-route"]')
        ?.getAttribute('data-lod-variant'),
    ).toBe('compact');
    expect(lod4Terrain.container.querySelector('[data-testid^="sld-symbol-transformer-"]')).toBeNull();
    lod4Terrain.unmount();

    const lod4Selected = render(
      <SldCanvasV2
        {...baseProps}
        branchPoints={[zksnBranchPoint]}
        selectedId="zksn-route"
        lodOverride={4}
      />,
    );
    expect(
      lod4Selected.container
        .querySelector('[data-testid="sld-v2-mini-rmu-zksn-zksn-route"]')
        ?.getAttribute('data-lod-variant'),
    ).toBe('compact');
    expect(lod4Selected.container.querySelector('[data-testid^="sld-symbol-transformer-"]')).toBeNull();
  });

  it('pozwala wybrac ZKSN i slup z kanwy jako obiekty techniczne', () => {
    const onSelectElement = vi.fn();
    const onContextMenu = vi.fn();
    const zksnBranchPoint = {
      id: 'zksn-route',
      name: 'ZKSN terenowy',
      branchPointType: 'zksn',
      x: 180,
      y: 220,
      anchorX: 180,
      anchorY: 220,
      runRef: 'run-1',
      parentSegmentRef: 'seg-1',
      catalogRef: 'ZKSN-2P-630A',
      switchState: 'closed',
      branchPortCount: 2,
      switchgearFieldCount: 4,
      hasTransformer: false,
    } as const;
    const branchPole = {
      id: 'bp-route',
      name: 'Slup rozgalezny SN',
      branchPointType: 'branch_pole',
      x: 320,
      y: 220,
      anchorX: 320,
      anchorY: 220,
      runRef: 'run-1',
      parentSegmentRef: 'seg-2',
      catalogRef: 'SLUP-ODG-12',
      switchState: 'closed',
    } as const;

    const { container } = render(
      <SldCanvasV2
        {...baseProps}
        branchPoints={[zksnBranchPoint, branchPole]}
        lodOverride={3}
        onSelectElement={onSelectElement}
        onContextMenu={onContextMenu}
      />,
    );

    const zksnHitbox = container.querySelector('[data-testid="sld-v2-branch-point-hitbox-zksn-route"]')!;
    expect(zksnHitbox.getAttribute('data-element-kind')).toBe('zksn');
    expect(zksnHitbox.getAttribute('data-element-id')).toBe('zksn-route');
    fireEvent.click(zksnHitbox);
    expect(onSelectElement).toHaveBeenCalledWith('zksn-route', 'zksn');

    const branchPoleHitbox = container.querySelector('[data-testid="sld-v2-branch-point-hitbox-bp-route"]')!;
    expect(branchPoleHitbox.getAttribute('data-element-kind')).toBe('branch_pole');
    expect(branchPoleHitbox.getAttribute('data-element-id')).toBe('bp-route');
    fireEvent.click(branchPoleHitbox);
    expect(onSelectElement).toHaveBeenCalledWith('bp-route', 'branch_pole');

    fireEvent.contextMenu(
      zksnHitbox,
      { clientX: 10, clientY: 20 },
    );
    expect(onContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'zksn', elementId: 'zksn-route' }),
    );
  });

  it('utrzymuje ZKSN i slupy nad warstwa stacji, zeby wezly rozgalezne byly wybieralne przy zblizeniu', () => {
    const onSelectElement = vi.fn();
    const station = {
      id: 'st-overlap',
      x: 180,
      y: 220,
      name: 'Stacja SN/nN 10',
      topologicalType: 'przelotowa' as const,
      stationCode: 'S10',
      snBays: [
        { bayRef: 'st-overlap/we', fieldRole: 'LINE_IN' as const, designation: 'WE', hasMissingRequiredDevice: false },
        { bayRef: 'st-overlap/wy', fieldRole: 'LINE_OUT' as const, designation: 'WY', hasMissingRequiredDevice: false },
        { bayRef: 'st-overlap/tr', fieldRole: 'TRANSFORMER' as const, designation: 'TR', hasMissingRequiredDevice: false },
      ],
      hasTransformer: true,
      transformerRefs: ['st-overlap/tr1'],
      transformerRatedKva: 630,
      nnFeedersCount: 1,
      derBadges: [],
    };
    const zksnBranchPoint = {
      id: 'zksn-overlap',
      name: 'ZKSN terenowy',
      branchPointType: 'zksn',
      x: 180,
      y: 220,
      anchorX: 180,
      anchorY: 220,
      runRef: 'run-1',
      parentSegmentRef: 'seg-1',
      catalogRef: 'ZKSN-2P-630A',
      switchState: 'closed',
      branchPortCount: 2,
      switchgearFieldCount: 4,
      hasTransformer: false,
    } as const;

    const { container } = render(
      <SldCanvasV2
        {...baseProps}
        stations={[station]}
        branchPoints={[zksnBranchPoint]}
        lodOverride={3}
        onSelectElement={onSelectElement}
      />,
    );

    const stationsLayer = container.querySelector('[data-testid="sld-v2-stations-layer"]')!;
    const branchPointsLayer = container.querySelector('[data-testid="sld-v2-branch-points-layer"]')!;
    expect(
      Boolean(stationsLayer.compareDocumentPosition(branchPointsLayer) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    const stationHitbox = container.querySelector('[data-testid="sld-v2-station-hit-st-overlap"]')!;
    const zksnHitbox = container.querySelector('[data-testid="sld-v2-branch-point-hitbox-zksn-overlap"]')!;
    expect(
      Boolean(stationHitbox.compareDocumentPosition(zksnHitbox) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);

    fireEvent.click(zksnHitbox);
    expect(onSelectElement).toHaveBeenCalledWith('zksn-overlap', 'zksn');
  });

  it('nie dubluje etykiety DER z globalnego pipeline przy transformatorze blokowym', () => {
    const der = {
      id: 'der-pv-block-label',
      x: 180,
      y: 160,
      kind: 'PV' as const,
      name: 'PV 1 MW',
      nominalPowerKw: 1000,
      hasBlockTransformer: true,
      blockTransformerLabel: 'TR 15/0,69 kV 1250 kVA Dyn5',
    };
    const labelSpecs = [
      {
        id: 'label:der:der-pv-block-label',
        ownerRef: 'der-pv-block-label',
        ownerKind: 'der' as const,
        text: 'PV 1 MW',
        priority: 700,
        anchorPoint: { x: 180, y: 160 },
        width: 64,
        height: 18,
        preferredAnchor: 'right' as const,
      },
    ];
    const readabilityReport = {
      score: 100,
      totalLabels: 1,
      placedLabels: 1,
      hiddenLabels: 0,
      criticalCollisions: 0,
      hiddenCriticalLabelRefs: [],
      orphanStationRefs: [],
      orphanSegmentRefs: [],
      missingTerminalRefs: [],
      topologyContinuity: 'continuous' as const,
      labelPlacements: [{
        id: 'label:der:der-pv-block-label',
        anchor: 'right' as const,
        bbox: { x: 196, y: 152, width: 64, height: 18 },
        hidden: false,
        locked: false,
      }],
    };

    const { container } = render(
      <SldCanvasV2
        {...baseProps}
        ders={[der]}
        labelSpecs={labelSpecs}
        readabilityReport={readabilityReport}
        selectedId="der-pv-block-label"
        lodOverride={4}
      />,
    );

    expect(container.querySelector('[data-testid="sld-v2-der-der-pv-block-label"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="sld-v2-topology-label-label:der:der-pv-block-label"]')).toBeNull();
  });
});
