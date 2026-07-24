/**
 * R1 (RECENZJA_WARSTWA_WYNIKOWA_2026-07 §wym.1–5; program WYNIKI-SLD R1) — testy
 * UNIWERSALNEGO REJESTRU szablonów treści etykiet wynikowych
 * (`resultLabelTemplates.ts`): dobór pól/kolejności/prefiksów per (analiza ×
 * klasa elementu), znak kierunku, normalizacja rodziny analizy oraz zwijanie
 * wg LOD (L1 vs L2). Testy CZYSTE (bez sceny/DOM) — rejestr jest jądrem treści.
 */
import { describe, expect, it } from 'vitest';

import type { RawMetricValue } from '../../../../sld-overlay/rawResultOverlayStore';
import {
  formatScalar,
  formatSignedScalar,
  normalizeResultLabelAnalysis,
  resultLabelLinesForLod,
  selectResultLabelSpecs,
  type ResultLabelLine,
} from '../resultLabelTemplates';

function codesOf(specs: readonly { readonly code: string }[]): readonly string[] {
  return specs.map((s) => s.code);
}
function prefixesOf(specs: readonly { readonly prefix: string }[]): readonly string[] {
  return specs.map((s) => s.prefix);
}
function metric(value: number, unit: string, hint = 'fixed2'): RawMetricValue {
  return { code: 'X', value, unit, format_hint: hint };
}

describe('resultLabelTemplates — rejestr treści (analiza × klasa elementu)', () => {
  it('rozpływ · linia/kabel: obciążenie→I→P→Q w kolejności priorytetu', () => {
    const specs = selectResultLabelSpecs('load_flow', 'branch');
    expect(codesOf(specs)).toEqual(['LOADING_PCT', 'I_A', 'P_MW', 'Q_Mvar']);
    expect(prefixesOf(specs)).toEqual(['obc.', 'I', 'P', 'Q']);
  });

  it('rozpływ · źródło/DER: P→Q→S (P i Q ZE ZNAKIEM — kierunek generacji/poboru)', () => {
    const specs = selectResultLabelSpecs('load_flow', 'source');
    expect(codesOf(specs)).toEqual(['P_MW', 'Q_Mvar', 'S_MVA']);
    // P i Q formatowane ze znakiem (formatSignedScalar), S bez znaku (formatScalar).
    expect(specs[0].format(metric(5.648, 'MW', 'fixed4'))).toBe('+5,6480 MW');
    expect(specs[1].format(metric(-0.92, 'Mvar', 'fixed2'))).toBe('-0,92 Mvar');
    expect(specs[2].format(metric(5.72, 'MVA'))).toBe('5,72 MVA');
  });

  it('rozpływ · transformator: obciążenie→S→ΔP (zaczep osobno przez badge OLTC)', () => {
    const specs = selectResultLabelSpecs('load_flow', 'transformer');
    expect(codesOf(specs)).toEqual(['LOADING_PCT', 'S_MVA', 'LOSSES_P_MW']);
    expect(prefixesOf(specs)).toEqual(['obc.', 'S', 'ΔP']);
  });

  it('rozpływ · szyna: U→(V_PU fallback)→δ', () => {
    const specs = selectResultLabelSpecs('load_flow', 'bus');
    expect(codesOf(specs)).toEqual(['U_kV', 'V_PU', 'ANGLE_DEG']);
    expect(specs[1].skipIfAnyPresent).toEqual(['U_kV']);
  });

  it('zwarcie · szyna: Ik″→ip→Ith (zachowane z W4)', () => {
    const specs = selectResultLabelSpecs('short_circuit', 'bus');
    expect(codesOf(specs)).toEqual(['IK_3F_A', 'IP_A', 'ITH_A']);
  });

  it('zwarcie · linia/źródło/TR NIE rozbudowane w R1 (bez spekulacji) ⇒ []', () => {
    expect(selectResultLabelSpecs('short_circuit', 'branch')).toEqual([]);
    expect(selectResultLabelSpecs('short_circuit', 'source')).toEqual([]);
    expect(selectResultLabelSpecs('short_circuit', 'transformer')).toEqual([]);
  });

  it('analiza nierozpoznana (null) ⇒ brak szablonów (zero fabrykacji)', () => {
    expect(selectResultLabelSpecs(null, 'branch')).toEqual([]);
  });
});

describe('resultLabelTemplates — normalizacja rodziny analizy', () => {
  it('warianty rozpływu ⇒ load_flow', () => {
    for (const a of ['load_flow', 'LOAD_FLOW', 'loadflow', 'lf', 'PF', 'power_flow']) {
      expect(normalizeResultLabelAnalysis(a)).toBe('load_flow');
    }
  });
  it('warianty zwarcia ⇒ short_circuit', () => {
    for (const a of ['sc_3f', 'SC_1F', 'sc', 'short_circuit', 'shortcircuit']) {
      expect(normalizeResultLabelAnalysis(a)).toBe('short_circuit');
    }
  });
  it('nieznane / puste ⇒ null', () => {
    expect(normalizeResultLabelAnalysis('thermal')).toBeNull();
    expect(normalizeResultLabelAnalysis(undefined)).toBeNull();
    expect(normalizeResultLabelAnalysis('')).toBeNull();
  });
});

describe('resultLabelTemplates — znak kierunku (wym. 3)', () => {
  it('dodatnie ⇒ jawny „+"; ujemne niesie własny „-"; zero bez znaku', () => {
    expect(formatSignedScalar(metric(6.5, 'MW', 'fixed1'))).toBe('+6,5 MW');
    expect(formatSignedScalar(metric(-0.3, 'Mvar', 'fixed1'))).toBe('-0,3 Mvar');
    expect(formatSignedScalar(metric(0, 'MW', 'fixed1'))).toBe('0,0 MW');
    expect(formatScalar(metric(15.02, 'kV'))).toBe('15,02 kV');
  });
});

describe('resultLabelTemplates — zwijanie wg LOD (wym. 5)', () => {
  const lines: readonly ResultLabelLine[] = [
    { prefix: 'obc.', text: '72,5 %' },
    { prefix: 'I', text: '182,0 A' },
    { prefix: 'P', text: '+5,6 MW' },
    { prefix: 'Q', text: '+0,9 Mvar' },
  ];

  it('L0 ⇒ brak linii (warstwa nic nie renderuje)', () => {
    expect(resultLabelLinesForLod(lines, 0)).toEqual([]);
  });
  it('L1 ⇒ jedna najważniejsza wartość (pierwsza w priorytecie)', () => {
    expect(resultLabelLinesForLod(lines, 1)).toEqual([{ prefix: 'obc.', text: '72,5 %' }]);
  });
  it('L2 ⇒ 2–3 wartości (do trzech pierwszych)', () => {
    expect(resultLabelLinesForLod(lines, 2)).toEqual([
      { prefix: 'obc.', text: '72,5 %' },
      { prefix: 'I', text: '182,0 A' },
      { prefix: 'P', text: '+5,6 MW' },
    ]);
  });
  it('gdy linii ≤ limit ⇒ ten sam obiekt (stabilność referencji dla memo)', () => {
    const two: readonly ResultLabelLine[] = [lines[0], lines[1]];
    expect(resultLabelLinesForLod(two, 2)).toBe(two);
  });
});
