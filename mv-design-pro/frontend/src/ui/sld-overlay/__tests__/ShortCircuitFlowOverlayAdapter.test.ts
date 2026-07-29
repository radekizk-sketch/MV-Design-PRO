/**
 * Testy adaptera overlay rozpływu zwarciowego (karta W-C, ZWARCIA-PRO F4 pkt 7).
 * Czysta projekcja wiersza kanonicznego → OverlayPayloadV1: znacznik punktu
 * zwarcia + elementy gałęzi (badge = wkłady per źródło [kA], tokeny wg skali
 * względnej PREZENTACJI). Determinizm: ta sama treść → identyczny payload.
 */
import { describe, expect, it } from 'vitest';

import {
  adaptShortCircuitFlowToOverlay,
  faultTypeToOverlayAnalysisType,
  relativeFlowWeight,
  type ShortCircuitBranchFlowV1,
  type ShortCircuitFlowOverlayInput,
} from '../ShortCircuitFlowOverlayAdapter';

function flow(over: Partial<ShortCircuitBranchFlowV1> = {}): ShortCircuitBranchFlowV1 {
  return {
    branch_id: 'BR-1',
    branch_name: 'Kabel OZE',
    source_id: 'GEN-PV',
    from_node_id: 'BUS-A',
    from_node_name: 'Szyna A',
    to_node_id: 'BUS-B',
    to_node_name: 'Szyna B',
    i_ka: 0.245,
    direction: 'to_from',
    ...over,
  };
}

function input(over: Partial<ShortCircuitFlowOverlayInput> = {}): ShortCircuitFlowOverlayInput {
  return {
    run_id: 'run-sc-1',
    fault_type: '3F',
    fault_element_ref: 'EL-GPZ',
    flows: [flow()],
    ...over,
  };
}

describe('faultTypeToOverlayAnalysisType', () => {
  it('mapuje tokeny rodzaju zwarcia na typy rodziny SC (dane, nie domysł)', () => {
    expect(faultTypeToOverlayAnalysisType('3F')).toBe('SC_3F');
    expect(faultTypeToOverlayAnalysisType('1F')).toBe('SC_1F');
    expect(faultTypeToOverlayAnalysisType('2F')).toBe('SC_2F');
    expect(faultTypeToOverlayAnalysisType('2F+Z')).toBe('SC_2F');
    expect(faultTypeToOverlayAnalysisType('sc_1f')).toBe('SC_1F');
  });
});

describe('relativeFlowWeight', () => {
  it('proporcja dwóch wartości backendu, obcięta do 1; wartości niedodatnie → 0', () => {
    expect(relativeFlowWeight(0.5, 1.0)).toBe(0.5);
    expect(relativeFlowWeight(2.0, 1.0)).toBe(1);
    expect(relativeFlowWeight(0, 1.0)).toBe(0);
    expect(relativeFlowWeight(0.5, 0)).toBe(0);
  });
});

describe('adaptShortCircuitFlowToOverlay', () => {
  it('znacznik punktu zwarcia pierwszy: CRITICAL + pulse na ref elementu wiersza', () => {
    const payload = adaptShortCircuitFlowToOverlay(input());
    expect(payload.run_id).toBe('run-sc-1');
    expect(payload.analysis_type).toBe('SC_3F');
    const marker = payload.elements[0];
    expect(marker.element_ref).toBe('EL-GPZ');
    expect(marker.visual_state).toBe('CRITICAL');
    expect(marker.animation_token).toBe('pulse');
  });

  it('element per gałąź: badge = wkłady per źródło [kA] wprost z danych', () => {
    const payload = adaptShortCircuitFlowToOverlay(
      input({
        flows: [
          flow({ branch_id: 'BR-1', source_id: 'GEN-PV', i_ka: 0.245 }),
          flow({ branch_id: 'BR-1', source_id: 'GEN-BESS', i_ka: 0.1 }),
        ],
      }),
    );
    expect(payload.elements).toHaveLength(2); // znacznik + jedna gałąź
    const branch = payload.elements[1];
    expect(branch.element_ref).toBe('BR-1');
    expect(branch.element_type).toBe('LineBranch');
    expect(branch.numeric_badges).toEqual({ 'GEN-BESS': 0.1, 'GEN-PV': 0.245 });
  });

  it('skala względna prezentacji: największy wkład → critical/bold, mały → ok/normal', () => {
    const payload = adaptShortCircuitFlowToOverlay(
      input({
        flows: [
          flow({ branch_id: 'BR-MAX', i_ka: 1.0 }),
          flow({ branch_id: 'BR-MIN', i_ka: 0.1 }),
        ],
      }),
    );
    const byRef = new Map(payload.elements.map((el) => [el.element_ref, el]));
    expect(byRef.get('BR-MAX')?.color_token).toBe('critical');
    expect(byRef.get('BR-MAX')?.stroke_token).toBe('bold');
    expect(byRef.get('BR-MIN')?.color_token).toBe('ok');
    expect(byRef.get('BR-MIN')?.stroke_token).toBe('normal');
  });

  it('gałęzie posortowane ASC po element_ref (deterministyczny render)', () => {
    const payload = adaptShortCircuitFlowToOverlay(
      input({
        flows: [flow({ branch_id: 'BR-Z' }), flow({ branch_id: 'BR-A' })],
      }),
    );
    expect(payload.elements.slice(1).map((el) => el.element_ref)).toEqual(['BR-A', 'BR-Z']);
  });

  it('puste wejście → payload z samym znacznikiem punktu zwarcia (uczciwie bez gałęzi)', () => {
    const payload = adaptShortCircuitFlowToOverlay(input({ flows: [] }));
    expect(payload.elements).toHaveLength(1);
    expect(payload.elements[0].element_ref).toBe('EL-GPZ');
    expect(payload.legend.length).toBeGreaterThan(0);
  });

  it('determinizm: to samo wejście (inna kolejność wpisów) → identyczny payload', () => {
    const a = adaptShortCircuitFlowToOverlay(
      input({ flows: [flow({ branch_id: 'BR-1' }), flow({ branch_id: 'BR-2' })] }),
    );
    const b = adaptShortCircuitFlowToOverlay(
      input({ flows: [flow({ branch_id: 'BR-2' }), flow({ branch_id: 'BR-1' })] }),
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
