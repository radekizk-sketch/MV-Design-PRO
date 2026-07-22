/**
 * Testy czystych adapterów ekranu „Składowe symetryczne i sieć zerowa"
 * (E-29, karta P-3). Fixture 1:1 z realnym kontraktem: wiersze kanoniczne
 * `build_short_circuit_results`, krok śladu "Zk" solvera FROZEN
 * (inputs z1_ohm/z2_ohm/z0_ohm jako {re, im}), ENM `Bus.grounding` /
 * `Transformer.hv_neutral`/`lv_neutral`.
 */

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import type { ExtendedTrace, ShortCircuitRow } from '../../../../ui/results-inspector/types';
import {
  fmtZespolona,
  naWierszeSkladowych,
  naZalozeniaSkladowych,
  skladoweZeSladu,
  uziemieniaSieci,
  uziemieniePunktu,
  werdyktPL,
  wybierzPrzebiegNiesymetryczny,
} from '../model';

const WIERSZ: ShortCircuitRow = {
  target_id: 'node-1',
  element_id: 'bus/gpz/sn',
  target_name: 'Szyna GPZ',
  ikss_ka: 12.503,
  ip_ka: 31.2,
  ith_ka: 12.9,
  sk_mva: 325.1,
  fault_type: '1F',
  flags: [],
  rk_ohm: 0.5121,
  xk_ohm: 1.2345,
  zk_ohm: 1.3365,
  xr_ratio: 2.41,
  kappa: 1.602,
  c_factor: 1.1,
  tk_s: 1.0,
  reporting_status: 'reportable',
  reporting_status_pl: 'raportowalny',
  proof_status_pl: 'pelny',
  reporting_limitations: [],
};

const SLAD: ExtendedTrace = {
  run_id: 'run-1',
  snapshot_id: 'snap-1',
  input_hash: 'hash-1',
  catalog_context: [],
  white_box_trace: [
    {
      key: 'Zk',
      step: 1,
      target_id: 'node-1',
      title: 'Impedancja zastępcza w punkcie zwarcia',
      formula_latex: 'Z_k = Z_1 + Z_2 + Z_0',
      substitution: '\\left(0.1 + j 0.4\\right) + \\left(0.1 + j 0.4\\right) + \\left(0.3 + j 0.9\\right)',
      inputs: {
        z1_ohm: { re: 0.1, im: 0.4 },
        z2_ohm: { re: 0.1, im: 0.4 },
        z0_ohm: { re: 0.3, im: -0.9 },
      } as never,
    },
    { key: 'Ikss', step: 2, target_id: 'node-1' },
  ],
};

const SNAPSHOT = {
  buses: [
    {
      id: 'b1',
      ref_id: 'bus/gpz/sn',
      name: 'Szyna GPZ',
      tags: [],
      meta: {},
      voltage_kv: 15,
      phase_system: '3ph',
      grounding: { type: 'petersen_coil', x_ohm: 120 },
    },
    { id: 'b2', ref_id: 'bus/st1/sn', name: 'Szyna ST-1', tags: [], meta: {}, voltage_kv: 15, phase_system: '3ph' },
  ],
  transformers: [
    {
      id: 't1',
      ref_id: 'trafo/gpz/1',
      name: 'TR-1 GPZ',
      tags: [],
      meta: {},
      hv_neutral: { type: 'resistor_grounded', r_ohm: 30 },
      lv_neutral: { type: 'isolated' },
    },
  ],
} as unknown as EnergyNetworkModel;

describe('wybierzPrzebiegNiesymetryczny — wybór przebiegu 1F/2F/2F+Z', () => {
  const przebiegi = [
    { id: 'r3f', analysis_type: 'SC_3F', status: 'DONE', finished_at: '2026-07-20T10:00:00Z' },
    { id: 'r1f', analysis_type: 'SC_1F', status: 'DONE', finished_at: '2026-07-19T10:00:00Z' },
    { id: 'r2fg', analysis_type: 'SC_2F_G', status: 'DONE', finished_at: '2026-07-21T10:00:00Z' },
    { id: 'rlf', analysis_type: 'LOAD_FLOW', status: 'DONE', finished_at: '2026-07-22T10:00:00Z' },
    { id: 'r2f-run', analysis_type: 'SC_2F', status: 'RUNNING', finished_at: null },
  ];

  it('preferuje aktywny przebieg, gdy jest zakończonym zwarciem niesymetrycznym', () => {
    expect(wybierzPrzebiegNiesymetryczny(przebiegi, 'r1f')?.id).toBe('r1f');
  });

  it('aktywny 3F nie spełnia — wybiera najnowszy zakończony niesymetryczny', () => {
    expect(wybierzPrzebiegNiesymetryczny(przebiegi, 'r3f')?.id).toBe('r2fg');
  });

  it('przebieg w toku i rozpływ nie liczą się; brak niesymetrycznych → null', () => {
    const tylkoSym = przebiegi.filter((r) => r.id === 'r3f' || r.id === 'rlf' || r.id === 'r2f-run');
    expect(wybierzPrzebiegNiesymetryczny(tylkoSym, null)).toBeNull();
  });
});

describe('skladoweZeSladu — krok "Zk" śladu WHITE BOX (read-only)', () => {
  it('wyciąga z1/z2/z0 i wzory z kroku właściwego punktu', () => {
    const skladowe = skladoweZeSladu(SLAD, 'node-1');
    expect(skladowe).not.toBeNull();
    expect(skladowe?.z1).toEqual({ re: 0.1, im: 0.4 });
    expect(skladowe?.z0).toEqual({ re: 0.3, im: -0.9 });
    expect(skladowe?.formulaLatex).toBe('Z_k = Z_1 + Z_2 + Z_0');
    expect(skladowe?.substitutionLatex).toContain('0.3');
  });

  it('brak kroku dla punktu / brak śladu → null (zero fabrykacji)', () => {
    expect(skladoweZeSladu(SLAD, 'node-obcy')).toBeNull();
    expect(skladoweZeSladu(null, 'node-1')).toBeNull();
  });

  it('krok bez z0 (zwarcie 2F) → z0 = null, z1/z2 obecne', () => {
    const slad2f: ExtendedTrace = {
      ...SLAD,
      white_box_trace: [
        {
          key: 'Zk',
          target_id: 'node-1',
          formula_latex: 'Z_k = Z_1 + Z_2',
          inputs: { z1_ohm: { re: 0.1, im: 0.4 }, z2_ohm: { re: 0.1, im: 0.4 } } as never,
        },
      ],
    };
    const skladowe = skladoweZeSladu(slad2f, 'node-1');
    expect(skladowe?.z0).toBeNull();
    expect(skladowe?.z1).toEqual({ re: 0.1, im: 0.4 });
  });
});

describe('fmtZespolona — format prezentacji R ± jX (przecinek PL)', () => {
  it('część urojona dodatnia → znak plus', () => {
    expect(fmtZespolona({ re: 0.5121, im: 1.2345 })).toBe('0,5121 + j 1,2345');
  });

  it('część urojona ujemna → znak minus i wartość bez znaku', () => {
    expect(fmtZespolona({ re: 0.3, im: -0.9 })).toBe('0,3000 − j 0,9000');
  });
});

describe('uziemienie punktu neutralnego — z zamrożonej wersji układu', () => {
  it('uziemieniePunktu znajduje szynę po ref_id i mapuje typ na PL', () => {
    const wpis = uziemieniePunktu(SNAPSHOT, 'bus/gpz/sn');
    expect(wpis?.element).toBe('Szyna GPZ');
    expect(wpis?.opis).toContain('Petersena');
    expect(wpis?.xOhm).toBe(120);
  });

  it('szyna bez pola grounding → null (uczciwy brak)', () => {
    expect(uziemieniePunktu(SNAPSHOT, 'bus/st1/sn')).toBeNull();
  });

  it('uziemieniaSieci zbiera szyny i obie strony transformatora', () => {
    const wpisy = uziemieniaSieci(SNAPSHOT);
    expect(wpisy).toHaveLength(3);
    expect(wpisy.map((w) => w.element)).toEqual(['Szyna GPZ', 'TR-1 GPZ', 'TR-1 GPZ']);
    expect(wpisy[1].strona).toBe('strona GN');
    expect(wpisy[1].rOhm).toBe(30);
    expect(wpisy[2].opis).toContain('izolowany');
  });

  it('brak snapshotu → pusta lista', () => {
    expect(uziemieniaSieci(null)).toEqual([]);
  });
});

describe('naZalozeniaSkladowych / naWierszeSkladowych / werdyktPL', () => {
  it('założenia niosą rodzaj zwarcia, c i tk wprost z wiersza kanonicznego', () => {
    const zalozenia = naZalozeniaSkladowych([WIERSZ]);
    expect(zalozenia.map((z) => String(z.wartosc))).toEqual([
      'zwarcie jednofazowe (doziemne)',
      'IEC 60909',
      '1,10',
      '1,00',
      '1',
    ]);
  });

  it('wiersz tabeli: bilans Zk + werdykt raportowalności PL', () => {
    const [w] = naWierszeSkladowych([WIERSZ]);
    expect(w.punkt.wartosc).toBe('Szyna GPZ');
    expect(w.zk.wartosc).toBe('1,3365');
    expect(w.werdykt.wartosc).toBe('raportowalny');
    expect(w.identyfikator.wartosc).toBe('node-1');
    // dowodRef = element_id (2× klik → dowód).
    expect(w.zk.dowodRef).toBe('bus/gpz/sn');
  });

  it('starszy wynik bez werdyktu → kreska (zero zgadywania)', () => {
    expect(werdyktPL({ ...WIERSZ, reporting_status: undefined, reporting_status_pl: undefined }))
      .toBe('—');
  });
});
