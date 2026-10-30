/**
 * SLD V3 F10.5 — testy jednostkowe `protectionTopologyValidation.ts`
 * (SLD_CAD_SPEC_V3 §20.2 `protection_function_topology_validation`).
 * Warstwa ANALIZY (czysta funkcja, zero fizyki) — testowana w izolacji na
 * syntetykach (spec zadania: „87T bez TR ⇒ ostrzeżenie; z TR ⇒ zero").
 *
 * Kanon 67N przepisany (karta UX-04/POLE-LINIOWE-WZORZEC, decyzja właściciela 2026-10-29 pkt 4).
 * INTENCJA dawnych testów zostaje: „67N bez prerekwizytu ⇒ ostrzeżenie, z prerekwizytem ⇒
 * zero, brak danych o aparatach ⇒ zero zgadywania". Zmienił się PREREKWIZYT: nie „VT w polu"
 * (pole liniowe GPZ wg ENEA Z.10 s.89 przekładnika napięciowego nie ma, a Z.11.1 s.91 ma VT
 * w gwieździe, który 3U₀ nie mierzy), tylko źródło napięcia zerowego potwierdzone w modelu
 * (powiązanie z uzwojeniem otwartego trójkąta pola pomiaru napięcia Z.17, obwód okrężny „Z, Zz")
 * i przekładnik Ferrantiego pola (I0). Iloczyn {Z.10, Z.11.1} × {Z.17 obecne, brak} ×
 * {potwierdzone, niepotwierdzone} liczony na scenach z fikstury parytetu (wynik backendu).
 */
import { describe, expect, it } from 'vitest';

import type { Bay } from '../../../../../types/enm';
import { zrodloU0Pola, type ZrodloU0PolaView } from '../../../v2/model/zrodloNapieciaZerowego';
import fikstura from '../../../v2/model/__tests__/fixtures/parytet_zrodla_u0.json';
import {
  brakiTopologiiFunkcjiPola,
  protectionFunctionTopologyGaps,
  protectionTopologyGapCode,
  protectionTopologyGapLabel,
} from '../protectionTopologyValidation';

const POTWIERDZONE: ZrodloU0PolaView = {
  potwierdzone: true,
  vtRef: 'vt-z17',
  vtOznaczenie: 'T1',
  poleZrodlaRef: 'pole-z17',
  poleZrodlaOznaczenie: '1.6',
  kodyBrakow: [],
};

function niepotwierdzone(...kodyBrakow: ZrodloU0PolaView['kodyBrakow'][number][]): ZrodloU0PolaView {
  return { potwierdzone: false, vtRef: null, vtOznaczenie: null, poleZrodlaRef: null, poleZrodlaOznaczenie: null, kodyBrakow };
}

describe('protectionFunctionTopologyGaps (spec §20.2 a-d)', () => {
  it('(a) 67N bez rozstrzygnięcia źródła 3U₀ i bez Ferrantiego ⇒ oba ostrzeżenia (brak danych ≠ spełnia)', () => {
    const gaps = protectionFunctionTopologyGaps(['67N'], [{ kind: 'CB' }, { kind: 'DS' }]);
    expect(gaps).toEqual([
      { code: '67N', reason: 'missing_core_balance_ct' },
      { code: '67N', reason: 'missing_u0_source' },
    ]);
  });

  it('(a) dawny prerekwizyt „VT w polu" NIE wystarcza: 67N + VT pola, źródło niepotwierdzone ⇒ ostrzeżenie', () => {
    const gaps = protectionFunctionTopologyGaps(['67N'], [{ kind: 'CB' }, { kind: 'VT' }, { kind: 'CORE_BALANCE_CT' }], {
      zrodloU0: niepotwierdzone('BRAK_OTWARTEGO_TROJKATA'),
    });
    expect(gaps).toEqual([{ code: '67N', reason: 'missing_u0_source' }]);
  });

  it('(a, kontrola) 67N z potwierdzonym źródłem 3U₀ ⇒ zero ostrzeżeń, także bez VT w polu (ENEA Z.10)', () => {
    const gaps = protectionFunctionTopologyGaps(['67N'], [{ kind: 'CB' }, { kind: 'CORE_BALANCE_CT' }], {
      zrodloU0: POTWIERDZONE,
    });
    expect(gaps).toEqual([]);
  });

  it('(a) braki z rozstrzygnięcia: Ferranti ⇒ missing_core_balance_ct; każdy brak źródła ⇒ missing_u0_source', () => {
    const urzadzenia = [{ kind: 'CB' as const }];
    expect(protectionFunctionTopologyGaps(['67N'], urzadzenia, { zrodloU0: niepotwierdzone('BRAK_FERRANTIEGO') })).toEqual([
      { code: '67N', reason: 'missing_core_balance_ct' },
    ]);
    for (const kod of [
      'BRAK_POWIAZANIA',
      'BRAK_POLA_POMIARU_NAPIECIA',
      'APARAT_NIEOBECNY',
      'APARAT_NIE_JEST_VT',
      'BRAK_OTWARTEGO_TROJKATA',
      'POLE_NIE_MIERZY_SZYN',
      'INNA_SEKCJA',
    ] as const) {
      expect(protectionFunctionTopologyGaps(['67N'], urzadzenia, { zrodloU0: niepotwierdzone(kod) })).toEqual([
        { code: '67N', reason: 'missing_u0_source' },
      ]);
    }
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

  it('(d) konfiguracja W PEŁNI poprawna (67N+źródło 3U₀, 87T+TR, 51N+CT razem) ⇒ brak fałszywych alarmów', () => {
    const gaps = protectionFunctionTopologyGaps(
      ['67N', '87T', '51N'],
      [{ kind: 'CB' }, { kind: 'CORE_BALANCE_CT' }, { kind: 'TRANSFORMER_DEVICE' }, { kind: 'CT' }],
      { zrodloU0: POTWIERDZONE },
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

  it('kumulacja: wszystkie trzy funkcje BEZ prerekwizytów jednocześnie ⇒ ostrzeżenia w kolejności 67N/87T/51N', () => {
    const gaps = protectionFunctionTopologyGaps(['67N', '87T', '51N'], [{ kind: 'CB' }]);
    expect(gaps).toEqual([
      { code: '67N', reason: 'missing_core_balance_ct' },
      { code: '67N', reason: 'missing_u0_source' },
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

describe('F10.6 (DOMAIN, D5, V12K-036) — domainContext: ctZoneRefs (87T)', () => {
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

  it('etykieta PL przyczyn (protectionTopologyGapLabel)', () => {
    expect(protectionTopologyGapLabel({ code: '67N', reason: 'missing_u0_source' })).toBe(
      '67N: brak potwierdzonego źródła 3U₀',
    );
    expect(protectionTopologyGapLabel({ code: '67N', reason: 'missing_core_balance_ct' })).toBe(
      '67N: brak przekładnika Ferrantiego (I0)',
    );
    expect(protectionTopologyGapLabel({ code: '87T', reason: 'missing_second_ct' })).toBe(
      '87T: brak drugiego CT strefy',
    );
  });
});

describe('protectionTopologyGapLabel / protectionTopologyGapCode (formatowanie adnotacji/missingData)', () => {
  it('label PL zwięzły „⟨kod⟩: ⟨przyczyna⟩"', () => {
    expect(protectionTopologyGapLabel({ code: '87T', reason: 'missing_transformer' })).toBe('87T: brak transformatora');
    expect(protectionTopologyGapLabel({ code: '51N', reason: 'missing_i0' })).toBe('51N: brak I0');
  });

  it('kod missingData/stopNotes niesie prefiks „protection.topology." (zadanie F10.5 pkt B)', () => {
    expect(protectionTopologyGapCode({ code: '67N', reason: 'missing_u0_source' })).toBe(
      'protection.topology.67n_missing_u0_source',
    );
    expect(protectionTopologyGapCode({ code: '87T', reason: 'missing_transformer' })).toBe(
      'protection.topology.87t_missing_transformer',
    );
  });
});

interface PrzypadekParytetu {
  readonly nazwa: string;
  readonly pole_ref: string;
  readonly bays: readonly Bay[];
}

const przypadki = fikstura.przypadki as unknown as readonly PrzypadekParytetu[];

function scena(nazwa: string): { readonly pole: Bay; readonly zrodlo: ZrodloU0PolaView } {
  const przypadek = przypadki.find((p) => p.nazwa === nazwa);
  if (!przypadek) throw new Error(`brak przypadku ${nazwa}`);
  const pole = przypadek.bays.find((b) => b.ref_id === przypadek.pole_ref);
  if (!pole) throw new Error(`brak pola w przypadku ${nazwa}`);
  return { pole, zrodlo: zrodloU0Pola({ bays: [...przypadek.bays] }, pole) };
}

describe('67N — iloczyn {Z.10, Z.11.1} × {Z.17 obecne, brak} × {potwierdzone, niepotwierdzone} (sceny z operacji)', () => {
  const KOMORKI = [
    ['z10', 'z17_obecne_potwierdzone', []],
    ['z10', 'z17_obecne_bez_powiazania', ['missing_u0_source']],
    ['z10', 'z17_brak_bez_powiazania', ['missing_u0_source']],
    ['z10', 'iniekcja_zrodlo_innej_sekcji', ['missing_u0_source']],
    ['z11_1', 'z17_obecne_potwierdzone', []],
    ['z11_1', 'z17_obecne_bez_powiazania', ['missing_u0_source']],
    ['z11_1', 'z17_brak_bez_powiazania', ['missing_u0_source']],
    ['z11_1', 'iniekcja_zrodlo_innej_sekcji', ['missing_u0_source']],
  ] as const;

  it.each(KOMORKI)('%s / %s — ostrzeżenie 67N zgodne z warunkiem źródła', (wykonanie, komorka, oczekiwane) => {
    const { pole, zrodlo } = scena(`${wykonanie}_${komorka}`);
    const aparaty = (pole.primary_devices ?? []).map((a) => ({ kind: a.kind }));
    // Kody funkcji z 67N (model importowany albo sprzed reguły — pole niepotwierdzone 67N nie
    // dostaje od szablonu): ostrzeżenie zależy wyłącznie od warunku źródła.
    const gaps = brakiTopologiiFunkcjiPola({ primaryDevices: aparaty, zrodloU0: zrodlo }, ['51', '67N']);
    expect(gaps.map((g) => g.reason)).toEqual(oczekiwane);
    // Pole Z.10 nie ma przekładnika napięciowego — dawna reguła „67N ⇒ VT w polu" dawałaby
    // fałszywy alarm także w komórce potwierdzonej.
    if (wykonanie === 'z10') expect(aparaty.some((a) => a.kind === 'VT')).toBe(false);
  });

  it('kontekst z deskryptora: strefa CT (87T) i źródło 3U₀ (67N) z JEDNEJ funkcji', () => {
    const { zrodlo } = scena('z10_z17_obecne_potwierdzone');
    const bay = {
      primaryDevices: [{ kind: 'TRANSFORMER_DEVICE' as const }, { kind: 'CORE_BALANCE_CT' as const }],
      protectionMarking: { ctRef: 'ct-1', ctRefsSecondary: ['ct-1'] },
      zrodloU0: zrodlo,
    };
    expect(brakiTopologiiFunkcjiPola(bay, ['67N', '87T'])).toEqual([{ code: '87T', reason: 'missing_second_ct' }]);
    // `ct_ref` sam (bez `ct_refs_secondary`) nie jest daną strefy — zero fałszywego alarmu §20.2(d).
    expect(brakiTopologiiFunkcjiPola({ ...bay, protectionMarking: { ctRef: 'ct-1' } }, ['67N', '87T'])).toEqual([]);
  });
});
