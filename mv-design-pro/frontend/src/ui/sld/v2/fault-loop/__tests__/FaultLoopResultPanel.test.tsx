/**
 * FaultLoopResultPanel tests — P0.5 FE component.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  FaultLoopResultPanel,
  type FaultLoopResult,
} from '../FaultLoopResultPanel';

const SAMPLE_RESULT: FaultLoopResult = {
  fault_node_id: 'bus_LV_outgoing_long_identifier_12345',
  network_type: 'TN-S',
  protection_arrangement: 'PE',
  u_nom_v: 230,
  components: [
    {
      label: 'L 50 mm² Cu 30 m',
      r_ohm: 0.0108,
      x_ohm: 0.0024,
      magnitude_ohm: 0.01106,
    },
    {
      label: 'PE 25 mm² Cu 30 m',
      r_ohm: 0.0216,
      x_ohm: 0.0024,
      magnitude_ohm: 0.02173,
    },
    {
      label: 'TR 400 kVA SN/nN',
      r_ohm: 0.008,
      x_ohm: 0.025,
      magnitude_ohm: 0.02625,
    },
  ],
  z_loop_ohm: { re: 0.0404, im: 0.0298, magnitude: 0.05020 },
  ik_min_a: 4357.04,
  ik_max_a: 4814.04,
  white_box_trace: [
    { step: 'sum_components' },
    { step: 'compute_ik' },
  ],
};

describe('FaultLoopResultPanel — header', () => {
  it('renders Polish header "Pętla zwarcia nN"', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    expect(screen.getByTestId('fault-loop-header')).toHaveTextContent(/Pętla zwarcia nN/);
  });

  it('shows network type badge TN-S', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    expect(screen.getByTestId('fault-loop-network-type')).toHaveTextContent('TN-S');
  });

  it('shows protection arrangement badge', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    expect(screen.getByTestId('fault-loop-protection')).toHaveTextContent('PE');
  });

  it('shows Un badge in volts', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    expect(screen.getByTestId('fault-loop-unom')).toHaveTextContent('Un = 230 V');
  });

  it('truncates long fault_node_id', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    const header = screen.getByTestId('fault-loop-header');
    expect(header.textContent).toMatch(/@.*…/);
  });
});

describe('FaultLoopResultPanel — Z_loop block', () => {
  it('renders R + X + |Z| with units (mΩ for small values)', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    expect(screen.getByTestId('fault-loop-r')).toHaveTextContent(/40,4.*mΩ/);
    expect(screen.getByTestId('fault-loop-x')).toHaveTextContent(/29,8.*mΩ/);
    expect(screen.getByTestId('fault-loop-magnitude')).toHaveTextContent(/50,2.*mΩ/);
  });

  it('uses Polish decimal separator (comma)', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    expect(screen.getByTestId('fault-loop-r').textContent).toContain(',');
    expect(screen.getByTestId('fault-loop-r').textContent).not.toContain('.');
  });
});

describe('FaultLoopResultPanel — currents', () => {
  it('renders I_k_min (c=0,95) in kA when ≥ 1000 A', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    expect(screen.getByTestId('fault-loop-ik-min')).toHaveTextContent(/4,36.*kA/);
  });

  it('renders I_k_max (c=1,05) in kA', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    expect(screen.getByTestId('fault-loop-ik-max')).toHaveTextContent(/4,81.*kA/);
  });

  it('renders A unit for currents < 1000 A', () => {
    const lowResult: FaultLoopResult = {
      ...SAMPLE_RESULT,
      ik_min_a: 250,
      ik_max_a: 350,
    };
    render(<FaultLoopResultPanel result={lowResult} />);
    expect(screen.getByTestId('fault-loop-ik-min')).toHaveTextContent('250 A');
    expect(screen.getByTestId('fault-loop-ik-max')).toHaveTextContent('350 A');
  });
});

describe('FaultLoopResultPanel — components list', () => {
  it('renders all 3 components', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    const summary = screen.getByTestId('fault-loop-components');
    expect(summary).toHaveTextContent('Składowe pętli (3)');
  });

  it('renders component labels in Polish', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    const list = screen.getByTestId('fault-loop-components');
    expect(list).toHaveTextContent('L 50 mm² Cu 30 m');
    expect(list).toHaveTextContent('PE 25 mm² Cu 30 m');
    expect(list).toHaveTextContent('TR 400 kVA SN/nN');
  });
});

describe('FaultLoopResultPanel — WHITE BOX trace footer', () => {
  it('shows trace step count', () => {
    render(<FaultLoopResultPanel result={SAMPLE_RESULT} />);
    expect(screen.getByText(/2 kroków obliczeniowych/)).toBeInTheDocument();
  });
});
