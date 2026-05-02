import { describe, expect, it } from 'vitest';
import { enmSnapshotToSldSymbols, projectEnmSnapshotToSld } from '../enmSnapshotToSldSymbols';

describe('enmSnapshotToSldSymbols', () => {
  it('nadaje szynie GPZ szeroki, poziomy busbar zależny od liczby przyłączeń', () => {
    const symbols = enmSnapshotToSldSymbols({
      buses: [
        { ref_id: 'bus-gpz', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
        { ref_id: 'bus-st-1', name: 'ST-1', voltage_kv: 15 },
      ],
      sources: [
        { ref_id: 'src-1', name: 'GPZ', bus_ref: 'bus-gpz' },
      ],
      branches: [
        { ref_id: 'seg-1', name: 'Magistrala 1', type: 'cable', from_bus_ref: 'bus-gpz', to_bus_ref: 'bus-st-1', status: 'closed' },
      ],
      transformers: [],
      loads: [],
      generators: [],
    } as any);

    const bus = symbols.find((symbol) => symbol.id === 'bus-gpz') as { elementType: string; width: number; height: number } | undefined;
    expect(bus).toBeDefined();
    expect(bus?.elementType).toBe('Bus');
    expect(bus?.height).toBe(8);
    expect(bus?.width).toBeGreaterThanOrEqual(240);
  });

  it('projektuje źródło GPZ nad szyną i zachowuje kanoniczny kontrakt połączeń', () => {
    const projection = projectEnmSnapshotToSld({
      header: { hash_sha256: 'snap-gpz' },
      buses: [
        { ref_id: 'bus-gpz', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
        { ref_id: 'bus-st-1', name: 'ST-1', voltage_kv: 15 },
      ],
      sources: [
        { ref_id: 'src-1', name: 'GPZ', bus_ref: 'bus-gpz' },
      ],
      branches: [
        { ref_id: 'seg-1', name: 'Magistrala 1', type: 'cable', from_bus_ref: 'bus-gpz', to_bus_ref: 'bus-st-1', status: 'closed' },
      ],
      transformers: [],
      loads: [],
      generators: [],
      substations: [],
      bays: [],
      junctions: [],
      corridors: [],
      measurements: [],
      protection_assignments: [],
      branch_points: [],
      logical_views: { trunks: [], branches: [], rings: [] },
    } as any);

    const bus = projection.symbols.find((symbol) => symbol.id === 'bus-gpz') as { position: { x: number; y: number }; width: number } | undefined;
    const source = projection.symbols.find((symbol) => symbol.id === 'src-1') as {
      connectedToNodeId: string;
      position: { x: number; y: number };
      sourceType?: string;
      slackBus?: boolean;
      sourceModel?: string | null;
    } | undefined;
    const branch = projection.symbols.find((symbol) => symbol.id === 'seg-1') as { fromNodeId: string; toNodeId: string; points: Array<{ x: number; y: number }> } | undefined;

    expect(projection.canonicalAnnotations).not.toBeNull();
    expect(projection.connections.length).toBeGreaterThan(0);
    expect(projection.connections.some((connection) => connection.elementId === 'seg-1')).toBe(true);
    expect(source?.connectedToNodeId).toBe('bus-gpz');
    expect(source?.sourceType).toBe('SYSTEM_SOURCE');
    expect(source?.slackBus).toBe(true);
    expect(source?.sourceModel ?? null).toBeNull();
    expect(source?.position.y ?? Number.POSITIVE_INFINITY).toBeLessThan(bus?.position.y ?? Number.NEGATIVE_INFINITY);
    expect(source?.position.x).toBe(bus?.position.x);
    expect(bus?.width ?? 0).toBeGreaterThan(0);
    expect(branch?.fromNodeId).toBe('bus-gpz');
    expect(branch?.toNodeId).toBe('bus-st-1');
    expect(branch?.points.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(branch?.points[0]?.x).toBe(branch?.points[1]?.x);
    expect(branch?.points[1]?.y ?? 0).toBeGreaterThan(branch?.points[0]?.y ?? 0);
  });

  it('nie renderuje pomocniczych busów topologicznych jako szyn operacyjnych', () => {
    const symbols = enmSnapshotToSldSymbols({
      buses: [
        { ref_id: 'bus-gpz', name: 'Szyna GPZ 15 kV', voltage_kv: 15, tags: [], meta: {} },
        {
          ref_id: 'bus-helper',
          name: 'Szyna downstream',
          voltage_kv: 15,
          tags: ['helper_bus', 'topology_terminal'],
          meta: { visual_role: 'INLINE_TERMINAL', render_on_sld: false, show_in_project_tree: false },
        },
        { ref_id: 'bus-st-1', name: 'ST-1', voltage_kv: 15, tags: [], meta: {} },
      ],
      sources: [
        { ref_id: 'src-1', name: 'GPZ', bus_ref: 'bus-gpz' },
      ],
      branches: [
        { ref_id: 'seg-1', name: 'Magistrala 1', type: 'cable', from_bus_ref: 'bus-gpz', to_bus_ref: 'bus-helper', status: 'closed' },
        { ref_id: 'seg-2', name: 'Magistrala 2', type: 'cable', from_bus_ref: 'bus-helper', to_bus_ref: 'bus-st-1', status: 'closed' },
      ],
      transformers: [],
      loads: [],
      generators: [],
      substations: [],
      bays: [],
      junctions: [],
      corridors: [],
      measurements: [],
      protection_assignments: [],
      branch_points: [],
      logical_views: { trunks: [], branches: [], rings: [] },
    } as any);

    const busIds = symbols.filter((symbol) => symbol.elementType === 'Bus').map((symbol) => symbol.id);
    expect(busIds).toContain('bus-gpz');
    expect(busIds).toContain('bus-st-1');
    expect(busIds).not.toContain('bus-helper');
  });

  it('keeps helper-bus-backed segments in projection connections while hiding helper buses from visible symbols', () => {
    const projection = projectEnmSnapshotToSld({
      buses: [
        { ref_id: 'bus-gpz', name: 'Szyna GPZ 15 kV', voltage_kv: 15, tags: [], meta: {} },
        {
          ref_id: 'bus-helper/downstream',
          name: 'Szyna downstream',
          voltage_kv: 15,
          tags: ['helper_bus', 'topology_terminal'],
          meta: { visual_role: 'INLINE_TERMINAL', render_on_sld: false, show_in_project_tree: false },
        },
        { ref_id: 'bus-st-1', name: 'ST-1', voltage_kv: 15, tags: [], meta: {} },
      ],
      sources: [
        { ref_id: 'src-1', name: 'GPZ', bus_ref: 'bus-gpz' },
      ],
      branches: [
        { ref_id: 'seg-1', name: 'Magistrala 1', type: 'cable', from_bus_ref: 'bus-gpz', to_bus_ref: 'bus-helper/downstream', status: 'closed' },
        { ref_id: 'seg-2', name: 'Magistrala 2', type: 'cable', from_bus_ref: 'bus-helper/downstream', to_bus_ref: 'bus-st-1', status: 'closed' },
      ],
      transformers: [],
      loads: [],
      generators: [],
      substations: [],
      bays: [],
      junctions: [],
      corridors: [],
      measurements: [],
      protection_assignments: [],
      branch_points: [],
      logical_views: { trunks: [], branches: [], rings: [] },
    } as any);

    const visibleBusIds = projection.symbols
      .filter((symbol) => symbol.elementType === 'Bus')
      .map((symbol) => symbol.id);

    expect(visibleBusIds).toContain('bus-gpz');
    expect(visibleBusIds).toContain('bus-st-1');
    expect(visibleBusIds).not.toContain('bus-helper/downstream');
    expect(projection.connections.map((connection) => connection.elementId)).toEqual(
      expect.arrayContaining(['seg-1', 'seg-2']),
    );
  });

  it('projektuje pole SN z kanonicznych field_specs i logical_views zwroconych poza snapshotem', () => {
    const logicalViews = {
      trunks: [
        {
          corridor_ref: 'trunk-1',
          corridor_type: 'radial',
          segments: [],
          no_point_ref: null,
          terminals: [
            {
              element_id: 'bay-sn-out-1',
              port_id: 'trunk_out',
              trunk_id: 'trunk-1',
              branch_id: null,
              status: 'OTWARTY',
            },
          ],
        },
      ],
      branches: [],
      secondary_connectors: [],
      terminals: [
        {
          element_id: 'bay-sn-out-1',
          port_id: 'trunk_out',
          trunk_id: 'trunk-1',
          branch_id: null,
          status: 'OTWARTY',
        },
      ],
    };

    const projection = projectEnmSnapshotToSld({
      header: { hash_sha256: 'snap-gpz-field' },
      buses: [
        { ref_id: 'bus-gpz', name: 'Szyna GPZ 15 kV', voltage_kv: 15 },
      ],
      sources: [
        {
          ref_id: 'src-gpz',
          name: 'GPZ',
          bus_ref: 'bus-gpz',
          substation_ref: 'gpz-1',
        },
      ],
      branches: [],
      transformers: [],
      loads: [],
      generators: [],
      substations: [
        {
          ref_id: 'gpz-1',
          name: 'GPZ 1',
          station_type: 'gpz',
          bus_refs: ['bus-gpz'],
          transformer_refs: [],
          gpz_sections: [
            {
              section_id: 'sec-1',
              name: 'Sekcja 1',
              order: 0,
              bus_ref: 'bus-gpz',
              line_field_name: 'Pole odpływowe SN',
            },
          ],
          meta: {
            field_specs: [
              {
                field_ref: 'bay-sn-out-1',
                name: 'Pole odpływowe SN',
                bay_role: 'OUT',
                bus_ref: 'bus-gpz',
                equipment_refs: [],
                protection_ref: null,
                gpz_section_id: 'sec-1',
                tags: [],
                meta: { apparatus_kind: 'BREAKER' },
              },
            ],
          },
        },
      ],
      bays: [],
      junctions: [],
      corridors: [
        {
          ref_id: 'trunk-1',
          name: 'Magistrala 1',
          corridor_type: 'radial',
          ordered_segment_refs: [],
        },
      ],
      measurements: [],
      protection_assignments: [],
      branch_points: [],
    } as any, logicalViews as any);

    expect(projection.symbols.some((symbol) => symbol.elementType === 'Source')).toBe(true);
    expect(projection.canonicalAnnotations?.gpzFeederFields?.map((field) => field.fieldId)).toEqual([
      'bay-sn-out-1',
    ]);
    expect(projection.canonicalAnnotations?.gpzFeederFields?.[0]?.designation).toBe(
      'Pole odpływowe SN',
    );
    expect(projection.canonicalAnnotations?.gpzSections?.length ?? 0).toBeGreaterThan(0);
  });
});
