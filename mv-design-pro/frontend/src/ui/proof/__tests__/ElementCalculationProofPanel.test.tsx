import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import {
  ElementCalculationProofPanel,
  resolveShortCircuitRowsForElement,
  resolveTraceStepsForElement,
} from '../ElementCalculationProofPanel';
import type { ExtendedTrace, ShortCircuitResults } from '../../results-inspector/types';

const tracePayload: ExtendedTrace = {
  run_id: 'run-1',
  snapshot_id: 'snapshot-1',
  input_hash: 'hash-1',
  white_box_trace: [
    {
      key: 'step-zth',
      title: 'Wyznaczenie impedancji zastępczej',
      target_id: 'bus-sn-1',
      primary_element_ref: 'bus-sn-1',
      selection_refs: ['bus-sn-1'],
      formula_latex: 'Z_k = R_k + jX_k',
      inputs: {
        fault_node_id: { value: 'internal-node-ref' },
        short_circuit_type: { value: 'SC3F' },
        z1_ohm: { re: 0.07577657110710738, im: 0.029949123506463678 },
        z2_ohm: { re: 0.07577657110710738, im: 0.029949123506463678 },
        r_ohm: { value: 0.12, unit: 'Ω' },
        x_ohm: { value: 0.08, unit: 'Ω' },
      },
      substitution: 'Z_k = 0.12 + j0.08\\,\\Omega',
      result: {
        z_equiv_ohm: { re: 0.07577657110710738, im: 0.029949123506463678 },
        z_equiv_abs_ohm: { value: 0.081478, unit: 'Ω' },
      },
    },
    {
      key: 'step-other',
      title: 'Krok innego węzła',
      target_id: 'bus-other',
      selection_refs: ['bus-other'],
      result: {
        ikss_ka: { value: 7.1, unit: 'kA' },
      },
    },
  ],
  selection_index: {
    'bus-sn-1': 0,
  },
  catalog_context: [],
};

const shortCircuitPayload: ShortCircuitResults = {
  run_id: 'run-1',
  rows: [
    {
      target_id: 'bus-sn-1',
      element_id: 'bus-sn-1',
      target_name: 'Szyna SN 1',
      fault_type: 'SC3F',
      ikss_ka: 12.34,
      ip_ka: 31.2,
      ith_ka: 12.8,
      sk_mva: 320,
      flags: [],
    },
  ],
};

function mockAnalysisFetch(trace = tracePayload, shortCircuit = shortCircuitPayload) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/analysis-runs/run-1/results/trace')) {
        return new Response(JSON.stringify(trace), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/api/analysis-runs/run-1/results/short-circuit')) {
        return new Response(JSON.stringify(shortCircuit), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

describe('ElementCalculationProofPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wiąże zaznaczony węzeł SLD z wynikiem zwarciowym i krokami wywodu', async () => {
    mockAnalysisFetch();

    render(
      <ElementCalculationProofPanel
        runId="run-1"
        selectedElement={{ id: 'bus-sn-1', name: 'Szyna SN 1', type: 'Bus' }}
      />,
    );

    expect(await screen.findByTestId('element-proof-short-circuit-table')).toBeInTheDocument();
    expect(screen.getAllByText('Szyna SN 1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('SC3F')).toBeInTheDocument();
    expect(screen.getByText('Wyznaczenie impedancji zastępczej')).toBeInTheDocument();
    expect(screen.getByTestId('equivalent-impedance-proof')).toBeInTheDocument();
    expect(screen.getByText('Wyprowadzenie impedancji zastępczej')).toBeInTheDocument();
    expect(screen.getByText('Moduł impedancji')).toBeInTheDocument();
    expect(screen.getByText('Podstawienie modułu')).toBeInTheDocument();
    expect(screen.getByText('Kroki wywodu obliczeniowego')).toBeInTheDocument();
    expect(screen.getByText('Dane wejściowe')).toBeInTheDocument();
    expect(screen.getByText('Podstawienie')).toBeInTheDocument();
    expect(screen.getByText('Wynik kroku')).toBeInTheDocument();
    expect(screen.getAllByText(/12,34 kA/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Krok innego węzła')).not.toBeInTheDocument();

    const renderedText = document.body.textContent ?? '';
    expect(renderedText).toContain('Rodzaj zwarcia');
    expect(renderedText).toContain('Impedancja składowej zgodnej Z₁');
    expect(renderedText).not.toContain('fault_node_id');
    expect(renderedText).not.toContain('short_circuit_type');
    expect(renderedText).not.toContain('z1_ohm');
    expect(renderedText).not.toContain('"im"');
    expect(renderedText).not.toContain('"re"');
    expect(renderedText).not.toContain('white-box');
  });

  it('nie zastępuje braku wyniku zwarciowego fałszywym zerem', async () => {
    mockAnalysisFetch(tracePayload, {
      run_id: 'run-1',
      rows: [
        {
          target_id: 'bus-sn-1',
          element_id: 'bus-sn-1',
          target_name: 'Szyna SN 1',
          fault_type: 'SC3F',
          ikss_ka: null,
          ip_ka: null,
          ith_ka: null,
          sk_mva: null,
          flags: ['PARTIAL'],
        },
      ],
    });

    render(
      <ElementCalculationProofPanel
        runId="run-1"
        selectedElement={{ id: 'bus-sn-1', name: 'Szyna SN 1', type: 'Bus' }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('element-proof-short-circuit-table')).toBeInTheDocument());
    expect(screen.getAllByText('nie wyznaczono').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('0 kA')).not.toBeInTheDocument();
  });

  it('rozwiązuje kroki i wyniki także przez dodatkowe referencje obiektu', () => {
    expect(
      resolveTraceStepsForElement(
        tracePayload,
        { id: 'stn/station-1/station', name: 'Stacja 1' },
        ['bus-sn-1'],
      ),
    ).toHaveLength(1);
    expect(
      resolveShortCircuitRowsForElement(
        shortCircuitPayload,
        { id: 'stn/station-1/station', name: 'Stacja 1' },
        ['bus-sn-1'],
      ),
    ).toHaveLength(1);
  });
});
