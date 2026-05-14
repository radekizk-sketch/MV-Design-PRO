/**
 * NetworkHierarchyTree tests — Projektant blocker resolution.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildHierarchy, type EnmInputForHierarchy } from '../HierarchyTree';
import { NetworkHierarchyTree } from '../NetworkHierarchyTree';

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
        ref_id: 'bay_q01',
        name: 'Q01',
        bay_role: 'OUT',
        substation_ref: 'gpz_1',
        bus_ref: 'bus_sn_1',
      },
      {
        ref_id: 'bay_q02',
        name: 'Q02',
        bay_role: 'IN',
        substation_ref: 'gpz_1',
        bus_ref: 'bus_sn_1',
      },
    ],
    buses: [{ ref_id: 'bus_sn_1', voltage_kv: 15, name: 'SN' }],
    sources: [{ ref_id: 'src_1', bus_ref: 'bus_sn_1', sk3_mva: 500 }],
    line_runs: [],
    generators: [],
  };
}

describe('NetworkHierarchyTree — empty state', () => {
  it('shows "Brak modelu sieci — dodaj GPZ." when no GPZ', () => {
    render(<NetworkHierarchyTree hierarchy={buildHierarchy(emptyEnm())} />);
    expect(screen.getByTestId('sld-hierarchy-empty')).toBeInTheDocument();
    expect(screen.getByText(/Brak modelu sieci — dodaj GPZ/)).toBeInTheDocument();
  });

  it('renders header "Drzewo modelu sieci"', () => {
    render(<NetworkHierarchyTree hierarchy={buildHierarchy(emptyEnm())} />);
    expect(screen.getByText(/Drzewo modelu sieci/)).toBeInTheDocument();
  });
});

describe('NetworkHierarchyTree — GPZ → Sekcja → Pole', () => {
  it('renders GPZ name and voltage levels', () => {
    render(<NetworkHierarchyTree hierarchy={buildHierarchy(simpleGpzEnm())} />);
    expect(screen.getByText('GPZ Test')).toBeInTheDocument();
    expect(screen.getByText(/110.*15 kV/)).toBeInTheDocument();
  });

  it('renders section with number and voltage', () => {
    render(<NetworkHierarchyTree hierarchy={buildHierarchy(simpleGpzEnm())} />);
    expect(screen.getByText('Sekcja 1')).toBeInTheDocument();
    expect(screen.getByText('15 kV')).toBeInTheDocument();
  });

  it('renders bays with designation and role', () => {
    render(<NetworkHierarchyTree hierarchy={buildHierarchy(simpleGpzEnm())} />);
    expect(screen.getByText('Pole Q01')).toBeInTheDocument();
    expect(screen.getByText('Pole Q02')).toBeInTheDocument();
    // bay role badge present
    expect(screen.getAllByText('OUT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('IN').length).toBeGreaterThan(0);
  });

  it('uses data-testid per node for navigation', () => {
    render(<NetworkHierarchyTree hierarchy={buildHierarchy(simpleGpzEnm())} />);
    expect(screen.getByTestId('sld-hierarchy-gpz-gpz_1')).toBeInTheDocument();
    expect(screen.getByTestId('sld-hierarchy-section-sec_1')).toBeInTheDocument();
    expect(screen.getByTestId('sld-hierarchy-bay-bay_q01')).toBeInTheDocument();
  });
});

describe('NetworkHierarchyTree — collapsing', () => {
  it('GPZ initially expanded (sections visible)', () => {
    render(<NetworkHierarchyTree hierarchy={buildHierarchy(simpleGpzEnm())} />);
    expect(screen.getByText('Sekcja 1')).toBeInTheDocument();
  });

  it('clicking GPZ collapses children', () => {
    render(<NetworkHierarchyTree hierarchy={buildHierarchy(simpleGpzEnm())} />);
    fireEvent.click(screen.getByTestId('sld-hierarchy-gpz-gpz_1'));
    expect(screen.queryByText('Sekcja 1')).toBeNull();
  });
});

describe('NetworkHierarchyTree — interaction callbacks', () => {
  it('onSelectNode invoked on bay click', () => {
    const onSelect = vi.fn();
    render(
      <NetworkHierarchyTree
        hierarchy={buildHierarchy(simpleGpzEnm())}
        onSelectNode={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId('sld-hierarchy-bay-bay_q01'));
    expect(onSelect).toHaveBeenCalledWith('bay', 'bay_q01');
  });

  it('onSelectNode invoked on GPZ double-click', () => {
    const onSelect = vi.fn();
    render(
      <NetworkHierarchyTree
        hierarchy={buildHierarchy(simpleGpzEnm())}
        onSelectNode={onSelect}
      />,
    );
    fireEvent.doubleClick(screen.getByTestId('sld-hierarchy-gpz-gpz_1'));
    expect(onSelect).toHaveBeenCalledWith('gpz', 'gpz_1');
  });
});

describe('NetworkHierarchyTree — Cable runs + DER sections', () => {
  it('renders Ciągi liniowe section when present', () => {
    const enm: EnmInputForHierarchy = {
      ...simpleGpzEnm(),
      line_runs: [
        {
          id: 'run_1',
          name: 'Run A',
          run_kind: 'main_trunk',
          starting_bay_ref: 'bay_q01',
          starting_port_ref: 'port_out_1',
          segments: [],
          stations: [],
        },
      ],
    };
    render(<NetworkHierarchyTree hierarchy={buildHierarchy(enm)} />);
    expect(screen.getByText(/Ciągi liniowe \(1\)/)).toBeInTheDocument();
  });

  it('renders Źródła OZE section when DER present', () => {
    const enm: EnmInputForHierarchy = {
      ...simpleGpzEnm(),
      generators: [
        {
          ref_id: 'der_1',
          name: 'PV-01',
          bus_ref: 'bus_sn_1',
          p_mw: 0.5,
          gen_type: 'pv_inverter',
        },
      ],
    };
    render(<NetworkHierarchyTree hierarchy={buildHierarchy(enm)} />);
    expect(screen.getByText(/Źródła OZE \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/PV-01/)).toBeInTheDocument();
  });
});
