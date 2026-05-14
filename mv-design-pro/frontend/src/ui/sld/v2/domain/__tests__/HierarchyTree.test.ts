/**
 * HierarchyTree tests — pure ENM → Hierarchy builder.
 *
 * INVARIANT: deterministyczny — sortowanie po IDs, identyczny output dla
 * identycznego inputu.
 */

import { describe, expect, it } from 'vitest';

import { buildHierarchy, type EnmInputForHierarchy } from '../HierarchyTree';

function emptyEnm(): EnmInputForHierarchy {
  return {
    substations: [],
    bays: [],
    buses: [],
    sources: [],
    line_runs: [],
    generators: [],
  };
}

function simpleGpzEnm(): EnmInputForHierarchy {
  return {
    substations: [
      {
        ref_id: 'gpz_1',
        name: 'GPZ Test',
        station_type: 'gpz',
        bus_refs: ['bus_sn_1'],
        gpz_sections: [{ section_id: 'sec_1', order: 0, bus_ref: 'bus_sn_1' }],
      },
    ],
    bays: [
      {
        ref_id: 'bay_1',
        name: 'Q01',
        bay_role: 'OUT',
        substation_ref: 'gpz_1',
        bus_ref: 'bus_sn_1',
      },
    ],
    buses: [{ ref_id: 'bus_sn_1', voltage_kv: 15, name: 'SN 15 kV' }],
    sources: [{ ref_id: 'src_1', bus_ref: 'bus_sn_1', sk3_mva: 4000 }],
    line_runs: [],
    generators: [],
  };
}

describe('buildHierarchy — empty input', () => {
  it('returns empty hierarchy', () => {
    const h = buildHierarchy(emptyEnm());
    expect(h.gpz).toEqual([]);
    expect(h.cableRuns).toEqual([]);
    expect(h.derAttachments).toEqual([]);
  });
});

describe('buildHierarchy — GPZ', () => {
  it('builds single GPZ with one section + one bay', () => {
    const h = buildHierarchy(simpleGpzEnm());
    expect(h.gpz).toHaveLength(1);
    expect(h.gpz[0].id).toBe('gpz_1');
    expect(h.gpz[0].name).toBe('GPZ Test');
    expect(h.gpz[0].sections).toHaveLength(1);
    expect(h.gpz[0].sections[0].bays).toHaveLength(1);
    expect(h.gpz[0].sections[0].bays[0].id).toBe('bay_1');
  });

  it('propagates Sk3 from source attached to GPZ bus', () => {
    const h = buildHierarchy(simpleGpzEnm());
    expect(h.gpz[0].scShortCircuitMva).toBe(4000);
  });

  it('sk3 is null when no source attached', () => {
    const enm = simpleGpzEnm();
    const enmNoSrc: EnmInputForHierarchy = { ...enm, sources: [] };
    const h = buildHierarchy(enmNoSrc);
    expect(h.gpz[0].scShortCircuitMva).toBeNull();
  });

  it('filters non-GPZ substations from gpz[]', () => {
    const enm = simpleGpzEnm();
    const withStation: EnmInputForHierarchy = {
      ...enm,
      substations: [
        ...enm.substations,
        {
          ref_id: 'st_1',
          name: 'Stacja zwykła',
          station_type: 'mv_distribution',
          bus_refs: ['bus_x'],
        },
      ],
    };
    const h = buildHierarchy(withStation);
    expect(h.gpz).toHaveLength(1);
    expect(h.gpz[0].id).toBe('gpz_1');
  });

  it('sorts sections by order', () => {
    const enm: EnmInputForHierarchy = {
      ...simpleGpzEnm(),
      substations: [
        {
          ref_id: 'gpz_1',
          name: 'GPZ Test',
          station_type: 'gpz',
          bus_refs: ['bus_a', 'bus_b'],
          gpz_sections: [
            { section_id: 'sec_b', order: 1, bus_ref: 'bus_b' },
            { section_id: 'sec_a', order: 0, bus_ref: 'bus_a' },
          ],
        },
      ],
      buses: [
        { ref_id: 'bus_a', voltage_kv: 15, name: 'A' },
        { ref_id: 'bus_b', voltage_kv: 15, name: 'B' },
      ],
      bays: [],
    };
    const h = buildHierarchy(enm);
    expect(h.gpz[0].sections.map((s) => s.id)).toEqual(['sec_a', 'sec_b']);
    expect(h.gpz[0].sections.map((s) => s.number)).toEqual([1, 2]);
  });

  it('fallback: GPZ without gpz_sections gets default section', () => {
    const enm: EnmInputForHierarchy = {
      substations: [
        {
          ref_id: 'gpz_1',
          name: 'GPZ Test',
          station_type: 'gpz',
          bus_refs: ['bus_sn_1'],
        },
      ],
      bays: [
        {
          ref_id: 'bay_1',
          name: 'Q01',
          bay_role: 'OUT',
          substation_ref: 'gpz_1',
          bus_ref: 'bus_sn_1',
        },
      ],
      buses: [{ ref_id: 'bus_sn_1', voltage_kv: 15, name: 'SN' }],
      sources: [],
      line_runs: [],
      generators: [],
    };
    const h = buildHierarchy(enm);
    expect(h.gpz[0].sections).toHaveLength(1);
    expect(h.gpz[0].sections[0].id).toBe('gpz_1:section_default');
    expect(h.gpz[0].sections[0].bays).toHaveLength(1);
  });
});

describe('buildHierarchy — CableRuns', () => {
  it('builds CableRuns from line_runs', () => {
    const enm: EnmInputForHierarchy = {
      ...simpleGpzEnm(),
      line_runs: [
        {
          id: 'run_1',
          name: 'Run A',
          run_kind: 'main_trunk',
          starting_bay_ref: 'bay_1',
          starting_port_ref: 'p_out',
          segments: [{ segment_ref: 'cab_1', order: 0 }],
          stations: [{ substation_ref: 'st_1', order: 0 }],
        },
      ],
      substations: [
        ...simpleGpzEnm().substations,
        {
          ref_id: 'st_1',
          name: 'Stacja A',
          station_type: 'mv_distribution',
          bus_refs: ['bus_st1'],
          external_ports: [],
        },
      ],
    };
    const h = buildHierarchy(enm);
    expect(h.cableRuns).toHaveLength(1);
    expect(h.cableRuns[0].id).toBe('run_1');
    expect(h.cableRuns[0].stations).toHaveLength(1);
  });

  it('sorts cable runs by id for determinism', () => {
    const enm: EnmInputForHierarchy = {
      ...simpleGpzEnm(),
      line_runs: [
        {
          id: 'run_z',
          name: null,
          run_kind: 'main_trunk',
          starting_bay_ref: 'bay_1',
          starting_port_ref: 'p_out',
          segments: [],
          stations: [],
        },
        {
          id: 'run_a',
          name: null,
          run_kind: 'main_trunk',
          starting_bay_ref: 'bay_1',
          starting_port_ref: 'p_out',
          segments: [],
          stations: [],
        },
      ],
    };
    const h = buildHierarchy(enm);
    expect(h.cableRuns.map((r) => r.id)).toEqual(['run_a', 'run_z']);
  });

  describe('infers topologicalType from external ports', () => {
    function makeRun(externalPorts: Array<{ id: string; kind: string }>) {
      return {
        ...simpleGpzEnm(),
        line_runs: [
          {
            id: 'run_1',
            name: null,
            run_kind: 'main_trunk' as const,
            starting_bay_ref: 'bay_1',
            starting_port_ref: 'p_out',
            segments: [],
            stations: [{ substation_ref: 'st_1', order: 0 }],
          },
        ],
        substations: [
          ...simpleGpzEnm().substations,
          {
            ref_id: 'st_1',
            name: 'Stacja A',
            station_type: 'mv_distribution',
            bus_refs: [],
            external_ports: externalPorts.map((p) => ({
              id: p.id,
              kind: p.kind as 'sn_input' | 'sn_output' | 'sn_branch' | 'sn_coupler',
              nominal_voltage_kv: 15,
              bay_ref: null,
              substation_ref: 'st_1',
              occupied_by: null,
            })),
          },
        ],
      };
    }

    it('końcowa (no in/out)', () => {
      const h = buildHierarchy(makeRun([]));
      expect(h.cableRuns[0].stations[0].topologicalType).toBe('końcowa');
    });

    it('przelotowa (1 in + 1 out, no branch)', () => {
      const h = buildHierarchy(
        makeRun([
          { id: 'port_in_1', kind: 'sn_input' },
          { id: 'port_out_1', kind: 'sn_output' },
        ]),
      );
      expect(h.cableRuns[0].stations[0].topologicalType).toBe('przelotowa');
    });

    it('odgałęźna (1 in + 1 out + 1 branch)', () => {
      const h = buildHierarchy(
        makeRun([
          { id: 'port_in_1', kind: 'sn_input' },
          { id: 'port_out_1', kind: 'sn_output' },
          { id: 'port_branch_1', kind: 'sn_branch' },
        ]),
      );
      expect(h.cableRuns[0].stations[0].topologicalType).toBe('odgałęźna');
    });

    it('sekcyjna (2 in + 1 coupler)', () => {
      const h = buildHierarchy(
        makeRun([
          { id: 'port_in_1', kind: 'sn_input' },
          { id: 'port_in_2', kind: 'sn_input' },
          { id: 'port_coupler_1', kind: 'sn_coupler' },
        ]),
      );
      expect(h.cableRuns[0].stations[0].topologicalType).toBe('sekcyjna');
    });
  });
});

describe('buildHierarchy — DER attachments', () => {
  function makeDerEnm(gen_type: string, p_mw: number | null = 0.5) {
    return {
      ...simpleGpzEnm(),
      generators: [
        {
          ref_id: 'gen_1',
          name: 'PV-01',
          bus_ref: 'bus_sn_1',
          p_mw,
          gen_type,
          station_ref: 'st_1',
        },
      ],
    };
  }

  it('maps gen_type pv_inverter → PV', () => {
    const h = buildHierarchy(makeDerEnm('pv_inverter'));
    expect(h.derAttachments).toHaveLength(1);
    expect(h.derAttachments[0].kind).toBe('PV');
  });

  it('maps gen_type bess → BESS', () => {
    const h = buildHierarchy(makeDerEnm('bess'));
    expect(h.derAttachments[0].kind).toBe('BESS');
  });

  it('maps wind_inverter / fw_pmsg / fw_dfig / fw_scig → FW', () => {
    for (const gt of ['wind_inverter', 'fw_pmsg', 'fw_dfig', 'fw_scig']) {
      const h = buildHierarchy(makeDerEnm(gt));
      expect(h.derAttachments[0].kind).toBe('FW');
    }
  });

  it('skips unknown gen_type (no DER created)', () => {
    const h = buildHierarchy(makeDerEnm('synchronous_machine'));
    expect(h.derAttachments).toEqual([]);
  });

  it('converts p_mw → nominalPowerKw (×1000)', () => {
    const h = buildHierarchy(makeDerEnm('pv_inverter', 0.5));
    expect(h.derAttachments[0].nominalPowerKw).toBe(500);
  });

  it('nominalPowerKw=null when p_mw is null', () => {
    const h = buildHierarchy(makeDerEnm('pv_inverter', null));
    expect(h.derAttachments[0].nominalPowerKw).toBeNull();
  });

  it('sorts DERs by ref_id for determinism', () => {
    const enm: EnmInputForHierarchy = {
      ...simpleGpzEnm(),
      generators: [
        {
          ref_id: 'gen_z',
          name: 'Z',
          bus_ref: 'bus_sn_1',
          p_mw: 0.1,
          gen_type: 'pv_inverter',
        },
        {
          ref_id: 'gen_a',
          name: 'A',
          bus_ref: 'bus_sn_1',
          p_mw: 0.1,
          gen_type: 'pv_inverter',
        },
      ],
    };
    const h = buildHierarchy(enm);
    expect(h.derAttachments.map((d) => d.id)).toEqual(['gen_a', 'gen_z']);
  });
});

describe('buildHierarchy — determinism', () => {
  it('same input → identical output across runs', () => {
    const enm = simpleGpzEnm();
    expect(buildHierarchy(enm)).toEqual(buildHierarchy(enm));
  });
});
