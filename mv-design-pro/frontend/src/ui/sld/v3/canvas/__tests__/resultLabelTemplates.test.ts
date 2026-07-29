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
  applyDeltaSign,
  computeResultLabelTrend,
  formatScalar,
  formatSignedScalar,
  normalizeResultLabelAnalysis,
  RESULT_LABEL_TREND_DEADBAND,
  RESULT_LABEL_TREND_GLYPH,
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
  it('rozpływ · linia/kabel: obciążenie→I→P→Q→ΔU→cosφ w kolejności priorytetu', () => {
    // LF-KONTRAKT (V12K-161): ΔU% i cosφ domknięte w kontrakcie i dopięte na
    // końcu rejestru (append — priorytet L1/L2 obciążenia bez zmian).
    const specs = selectResultLabelSpecs('load_flow', 'branch');
    expect(codesOf(specs)).toEqual([
      'LOADING_PCT',
      'I_A',
      'P_MW',
      'Q_Mvar',
      'DELTA_U_PCT',
      'COS_PHI',
    ]);
    expect(prefixesOf(specs)).toEqual(['obc.', 'I', 'P', 'Q', 'ΔU', 'cosφ']);
    // ΔU formatowane jak skalar z jednostką; cosφ bezwymiarowe (bez jednostki).
    expect(specs[4].format(metric(3.2, '%', 'fixed2'))).toBe('3,20 %');
    expect(specs[5].format(metric(0.98, '', 'fixed2'))).toBe('0,98');
  });

  it('rozpływ · źródło/DER: P→Q→S→cosφ (P i Q ZE ZNAKIEM — kierunek generacji/poboru)', () => {
    // LF-KONTRAKT (V12K-161): cosφ źródła (pochodna |P|/|S| bilansu węzła) dopięte
    // na końcu rejestru; P/Q/S bez zmian.
    const specs = selectResultLabelSpecs('load_flow', 'source');
    expect(codesOf(specs)).toEqual(['P_MW', 'Q_Mvar', 'S_MVA', 'COS_PHI']);
    // P i Q formatowane ze znakiem (formatSignedScalar), S bez znaku (formatScalar).
    expect(specs[0].format(metric(5.648, 'MW', 'fixed4'))).toBe('+5,6480 MW');
    expect(specs[1].format(metric(-0.92, 'Mvar', 'fixed2'))).toBe('-0,92 Mvar');
    expect(specs[2].format(metric(5.72, 'MVA'))).toBe('5,72 MVA');
    // cosφ bezwymiarowe — sam skalar, bez wiszącej spacji po pustej jednostce.
    expect(specs[3].format(metric(0.95, '', 'fixed2'))).toBe('0,95');
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

  it('zwarcie · szyna: Ik″→ip→Ith→Sk (R4 — slot W4 domknięty mocą zwarciową Sk)', () => {
    // R4 (wym. 13): payload backendu (short_circuit_to_resultset_v1.py) NIESIE
    // sk_mva na węźle → dołączony na końcu (priorytet: Ik″/ip/Ith na kanwie
    // top-3, Sk w pełnym zestawie). Rozkład wkładu system/DER/total pozostaje w
    // strzałkach wkładu (nie duplikujemy tekstem) — patrz rejestr braków R4.
    const specs = selectResultLabelSpecs('short_circuit', 'bus');
    expect(codesOf(specs)).toEqual(['IK_3F_A', 'IP_A', 'ITH_A', 'SK_MVA']);
    expect(prefixesOf(specs)).toEqual(['Ik″', 'ip', 'Ith', 'Sk']);
    // Sk formatowane jak skalar z jednostką (MVA).
    expect(specs[3].format(metric(120.5, 'MVA', 'fixed2'))).toBe('120,50 MVA');
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

describe('resultLabelTemplates — trend porównawczy (R4 wym. 15)', () => {
  it('wzrost ponad martwą strefę ⇒ up; spadek ⇒ down', () => {
    expect(computeResultLabelTrend(100, 110)).toBe('up');
    expect(computeResultLabelTrend(110, 100)).toBe('down');
  });
  it('zmiana w martwej strefie (≤0,5 % względnie) ⇒ flat', () => {
    // |Δ|/max = 0,4/110 ≈ 0,0036 ≤ 0,005 ⇒ flat.
    expect(computeResultLabelTrend(110.0, 110.4)).toBe('flat');
    // dokładnie na progu ⇒ flat (≤).
    expect(computeResultLabelTrend(100, 100 + 100 * RESULT_LABEL_TREND_DEADBAND)).toBe('flat');
  });
  it('obie wartości zerowe ⇒ flat (brak dzielenia przez zero)', () => {
    expect(computeResultLabelTrend(0, 0)).toBe('flat');
  });
  it('determinizm: ta sama para ⇒ ten sam trend', () => {
    expect(computeResultLabelTrend(15.02, 15.4)).toBe(computeResultLabelTrend(15.02, 15.4));
  });
  it('glify trendu są jednoznaczne (↑/↓/→)', () => {
    expect(RESULT_LABEL_TREND_GLYPH).toEqual({ up: '↑', down: '↓', flat: '→' });
  });
});

describe('resultLabelTemplates — znak różnicy Δ (R4 wym. 10)', () => {
  it('różnica dodatnia dostaje „+"; ujemna zostaje bez zmian; nie dubluje znaku', () => {
    expect(applyDeltaSign('0,12 kV', 0.12)).toBe('+0,12 kV');
    expect(applyDeltaSign('-0,12 kV', -0.12)).toBe('-0,12 kV');
    // formatter już dodał „+" (formatSignedScalar) ⇒ brak podwojenia.
    expect(applyDeltaSign('+0,12 MW', 0.12)).toBe('+0,12 MW');
    // zero bez znaku.
    expect(applyDeltaSign('0,00 kV', 0)).toBe('0,00 kV');
  });
});
