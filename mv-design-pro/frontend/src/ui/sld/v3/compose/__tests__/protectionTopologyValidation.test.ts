/**
 * SLD V3 F10.5 — testy jednostkowe `protectionTopologyValidation.ts`
 * (SLD_CAD_SPEC_V3 §20.2 `protection_function_topology_validation`).
 * Warstwa ANALIZY (czysta funkcja, zero fizyki) — testowana w izolacji na
 * syntetykach (spec zadania: „87T bez TR ⇒ ostrzeżenie; z TR ⇒ zero").
 */
import { describe, expect, it } from 'vitest';

import {
  protectionFunctionTopologyGaps,
  protectionTopologyGapCode,
  protectionTopologyGapLabel,
} from '../protectionTopologyValidation';

describe('protectionFunctionTopologyGaps (spec §20.2 a-d)', () => {
  it('(a) 67N bez VT w polu ⇒ ostrzeżenie missing_vt', () => {
    const gaps = protectionFunctionTopologyGaps(['67N'], [{ kind: 'CB' }, { kind: 'DS' }]);
    expect(gaps).toEqual([{ code: '67N', reason: 'missing_vt' }]);
  });

  it('(a, kontrola) 67N Z VT w polu ⇒ zero ostrzeżeń', () => {
    const gaps = protectionFunctionTopologyGaps(['67N'], [{ kind: 'CB' }, { kind: 'VT' }]);
    expect(gaps).toEqual([]);
  });

  it('(b) 87T bez transformatora w polu ⇒ ostrzeżenie missing_transformer', () => {
    const gaps = protectionFunctionTopologyGaps(['87T'], [{ kind: 'CB' }, { kind: 'CT' }]);
    expect(gaps).toEqual([{ code: '87T', reason: 'missing_transformer' }]);
  });

  it('(b, kontrola „z TR ⇒ zero") 87T Z transformatorem w polu ⇒ zero ostrzeżeń', () => {
    const gaps = protectionFunctionTopologyGaps(['87T'], [{ kind: 'CB' }, { kind: 'TRANSFORMER_DEVICE' }]);
    expect(gaps).toEqual([]);
  });

  it('(c) 51N bez żadnego CT w polu (brak I0) ⇒ ostrzeżenie missing_i0', () => {
    const gaps = protectionFunctionTopologyGaps(['51N'], [{ kind: 'CB' }, { kind: 'DS' }]);
    expect(gaps).toEqual([{ code: '51N', reason: 'missing_i0' }]);
  });

  it('(c, kontrola) 51N Z CT w polu ⇒ zero ostrzeżeń', () => {
    const gaps = protectionFunctionTopologyGaps(['51N'], [{ kind: 'CB' }, { kind: 'CT' }]);
    expect(gaps).toEqual([]);
  });

  it('(d) konfiguracja W PEŁNI poprawna (67N+VT, 87T+TR, 51N+CT razem) ⇒ brak fałszywych alarmów', () => {
    const gaps = protectionFunctionTopologyGaps(
      ['67N', '87T', '51N'],
      [{ kind: 'CB' }, { kind: 'VT' }, { kind: 'TRANSFORMER_DEVICE' }, { kind: 'CT' }],
    );
    expect(gaps).toEqual([]);
  });

  it('(d) kody BEZ prerekwizytu semantyki (np. „50/51") nigdy nie generują ostrzeżenia niezależnie od aparatów', () => {
    const gaps = protectionFunctionTopologyGaps(['50/51'], []);
    expect(gaps).toEqual([]);
  });

  it('WHITE BOX „zero zgadywania": `primaryDevices` nieobecne (pole konwencji, §12.4) ⇒ ZERO ostrzeżeń mimo kodów wymagających prerekwizytu (brak danych ≠ brak aparatu)', () => {
    expect(protectionFunctionTopologyGaps(['67N', '87T', '51N'], undefined)).toEqual([]);
  });

  it('WHITE BOX: `primaryDevices` puste ([]) ⇒ TA SAMA degradacja co `undefined` (zero ostrzeżeń)', () => {
    expect(protectionFunctionTopologyGaps(['67N'], [])).toEqual([]);
  });

  it('kumulacja: wszystkie trzy funkcje BEZ prerekwizytów jednocześnie ⇒ TRZY ostrzeżenia, kolejność 67N/87T/51N', () => {
    const gaps = protectionFunctionTopologyGaps(['67N', '87T', '51N'], [{ kind: 'CB' }]);
    expect(gaps).toEqual([
      { code: '67N', reason: 'missing_vt' },
      { code: '87T', reason: 'missing_transformer' },
      { code: '51N', reason: 'missing_i0' },
    ]);
  });

  it('determinizm: dwukrotne wywołanie z TYM SAMYM wejściem daje identyczny wynik', () => {
    const codes = ['67N', '87T'];
    const devices = [{ kind: 'CB' as const }];
    expect(protectionFunctionTopologyGaps(codes, devices)).toEqual(protectionFunctionTopologyGaps(codes, devices));
  });
});

describe('F10.6 (DOMAIN, D4/D5, V12K-036) — domainContext: vtArrangements (67N) / ctZoneRefs (87T)', () => {
  it('67N + VT + vtArrangements bez open_delta (np. gwiazda) ⇒ ostrzeżenie vt_not_open_delta DODATKOWO', () => {
    const gaps = protectionFunctionTopologyGaps(['67N'], [{ kind: 'VT' }], { vtArrangements: ['star'] });
    expect(gaps).toEqual([{ code: '67N', reason: 'vt_not_open_delta' }]);
  });

  it('67N + VT + vtArrangements Z open_delta ⇒ zero ostrzeżeń', () => {
    const gaps = protectionFunctionTopologyGaps(['67N'], [{ kind: 'VT' }], { vtArrangements: ['open_delta'] });
    expect(gaps).toEqual([]);
  });

  it('67N + VT + vtArrangements PUSTE/undefined (dana niedostarczona) ⇒ dotychczasowe uproszczenie F10.5, zero ostrzeżeń', () => {
    expect(protectionFunctionTopologyGaps(['67N'], [{ kind: 'VT' }], { vtArrangements: [] })).toEqual([]);
    expect(protectionFunctionTopologyGaps(['67N'], [{ kind: 'VT' }])).toEqual([]);
  });

  it('67N BEZ VT w polu ⇒ missing_vt niezależnie od domainContext (prerekwizyt nadrzędny)', () => {
    const gaps = protectionFunctionTopologyGaps(['67N'], [{ kind: 'CB' }], { vtArrangements: ['open_delta'] });
    expect(gaps).toEqual([{ code: '67N', reason: 'missing_vt' }]);
  });

  it('87T + TR + ctZoneRefs < 2 unikalnych ⇒ ostrzeżenie missing_second_ct DODATKOWO', () => {
    const gaps = protectionFunctionTopologyGaps(['87T'], [{ kind: 'TRANSFORMER_DEVICE' }], {
      ctZoneRefs: ['ct-1'],
    });
    expect(gaps).toEqual([{ code: '87T', reason: 'missing_second_ct' }]);
  });

  it('87T + TR + ctZoneRefs >= 2 unikalnych ⇒ zero ostrzeżeń', () => {
    const gaps = protectionFunctionTopologyGaps(['87T'], [{ kind: 'TRANSFORMER_DEVICE' }], {
      ctZoneRefs: ['ct-1', 'ct-2'],
    });
    expect(gaps).toEqual([]);
  });

  it('87T + TR + ctZoneRefs undefined (dana strefy niedostarczona) ⇒ dotychczasowe uproszczenie F10.5, zero ostrzeżeń', () => {
    expect(protectionFunctionTopologyGaps(['87T'], [{ kind: 'TRANSFORMER_DEVICE' }])).toEqual([]);
  });

  it('87T BEZ transformatora ⇒ missing_transformer niezależnie od ctZoneRefs (prerekwizyt nadrzędny)', () => {
    const gaps = protectionFunctionTopologyGaps(['87T'], [{ kind: 'CT' }], { ctZoneRefs: ['ct-1', 'ct-2'] });
    expect(gaps).toEqual([{ code: '87T', reason: 'missing_transformer' }]);
  });

  it('etykieta PL nowych przyczyn (protectionTopologyGapLabel)', () => {
    expect(protectionTopologyGapLabel({ code: '67N', reason: 'vt_not_open_delta' })).toBe(
      '67N: VT nie w układzie otwartego trójkąta',
    );
    expect(protectionTopologyGapLabel({ code: '87T', reason: 'missing_second_ct' })).toBe(
      '87T: brak drugiego CT strefy',
    );
  });
});

describe('protectionTopologyGapLabel / protectionTopologyGapCode (formatowanie adnotacji/missingData)', () => {
  it('label PL zwięzły „⟨kod⟩: ⟨przyczyna⟩" (przykład ze zlecenia: „67N: brak VT")', () => {
    expect(protectionTopologyGapLabel({ code: '67N', reason: 'missing_vt' })).toBe('67N: brak VT');
    expect(protectionTopologyGapLabel({ code: '87T', reason: 'missing_transformer' })).toBe('87T: brak transformatora');
    expect(protectionTopologyGapLabel({ code: '51N', reason: 'missing_i0' })).toBe('51N: brak I0');
  });

  it('kod missingData/stopNotes niesie prefiks „protection.topology." (zadanie F10.5 pkt B)', () => {
    expect(protectionTopologyGapCode({ code: '67N', reason: 'missing_vt' })).toBe('protection.topology.67n_missing_vt');
    expect(protectionTopologyGapCode({ code: '87T', reason: 'missing_transformer' })).toBe(
      'protection.topology.87t_missing_transformer',
    );
  });
});
