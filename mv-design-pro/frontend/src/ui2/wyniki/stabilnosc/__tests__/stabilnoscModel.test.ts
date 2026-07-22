/**
 * Testy czystych adapterów ekranu „Stabilność dynamiczna" (E-32, karta P-3).
 * Fixture 1:1 z realnym kontraktem `DynamicStabilityResult.to_dict`
 * (application/stability/dynamic_stability.py:119-140).
 */

import { describe, expect, it } from 'vitest';

import {
  fmtMs,
  fmtPu,
  naruszoneKryteriaPL,
  naWielkosciStabilnosci,
  naZalozeniaStabilnosci,
  naZdarzenia,
  werdyktStabilnosciPL,
  wybierzPrzebiegStabilnosci,
  type WierszStabilnosci,
} from '../model';

const WIERSZ: WierszStabilnosci = {
  scenario_id: 'dyn-1',
  source_id: 'src/pv/1',
  faulted_element_id: 'line/gpz/1',
  cleared_by_element_ids: ['cb-main', 'cb-tie'],
  stable: false,
  status: 'UNSTABLE',
  criteria_version: 'dynamic_stability_fault_clear_v1',
  stability_index: 0.412,
  clearing_time_ms: 180,
  max_clearing_time_ms: 150,
  clearing_margin_ms: -30,
  angle_swing_deg: 65,
  post_fault_voltage_pu: 0.97,
  post_fault_frequency_pu: 0.99,
  limiting_factor: 'clearing_time',
  violated_checks: ['clearing_time'],
  checks: {
    clearing_time: false,
    angle_swing: true,
    voltage_recovery: true,
    frequency_recovery: true,
  },
  reporting_status_pl: 'raportowalny',
  reporting_limitations: [],
};

describe('wybierzPrzebiegStabilnosci', () => {
  const przebiegi = [
    { id: 'r1', analysis_type: 'DYNAMIC_STABILITY', status: 'DONE', finished_at: '2026-07-19T10:00:00Z' },
    { id: 'r2', analysis_type: 'DYNAMIC_STABILITY', status: 'DONE', finished_at: '2026-07-21T10:00:00Z' },
    { id: 'r3', analysis_type: 'SC_3F', status: 'DONE', finished_at: '2026-07-22T10:00:00Z' },
    { id: 'r4', analysis_type: 'DYNAMIC_STABILITY', status: 'RUNNING', finished_at: null },
  ];

  it('preferuje aktywny zakończony przebieg stabilności', () => {
    expect(wybierzPrzebiegStabilnosci(przebiegi, 'r1')?.id).toBe('r1');
  });

  it('bez aktywnego → najnowszy zakończony DYNAMIC_STABILITY', () => {
    expect(wybierzPrzebiegStabilnosci(przebiegi, 'r3')?.id).toBe('r2');
  });

  it('brak zakończonych przebiegów stabilności → null', () => {
    expect(wybierzPrzebiegStabilnosci([przebiegi[2], przebiegi[3]], null)).toBeNull();
  });
});

describe('adaptery werdyktu i założeń (dane wprost z backendu)', () => {
  it('założenia niosą scenariusz zakłócenia: element, czas, kryteria', () => {
    const zalozenia = naZalozeniaStabilnosci(WIERSZ);
    expect(zalozenia.map((z) => String(z.wartosc))).toEqual([
      'line/gpz/1',
      'src/pv/1',
      '180,0',
      'cb-main, cb-tie',
      '150,0',
      'dynamic_stability_fault_clear_v1',
    ]);
  });

  it('werdykt PL mapuje status backendu bez interpretacji', () => {
    expect(werdyktStabilnosciPL(WIERSZ)).toBe('NIESTABILNY');
    expect(werdyktStabilnosciPL({ ...WIERSZ, status: 'STABLE' })).toBe('STABILNY');
    expect(werdyktStabilnosciPL({ ...WIERSZ, status: undefined })).toBe('—');
  });

  it('naruszone kryteria tłumaczone słownikiem PL; brak → „brak naruszeń"', () => {
    expect(naruszoneKryteriaPL(WIERSZ)).toBe('czas wyłączenia zwarcia');
    expect(naruszoneKryteriaPL({ ...WIERSZ, violated_checks: [] })).toBe('brak naruszeń');
  });

  it('wielkości po zakłóceniu: wartości + status kryterium z pola checks', () => {
    const wielkosci = naWielkosciStabilnosci(WIERSZ);
    expect(wielkosci).toHaveLength(4);
    expect(wielkosci[0]).toMatchObject({
      klucz: 'clearing_time',
      wartosc: '180,0',
      spelnione: false,
    });
    expect(wielkosci[2]).toMatchObject({
      klucz: 'voltage_recovery',
      wartosc: '0,970',
      spelnione: true,
    });
  });

  it('starszy wynik bez pól → kreski i status nieoznaczony (zero fabrykacji)', () => {
    const wielkosci = naWielkosciStabilnosci({});
    expect(wielkosci.every((w) => w.wartosc === '—')).toBe(true);
    expect(wielkosci.every((w) => w.spelnione === undefined)).toBe(true);
  });
});

describe('naZdarzenia — deterministyczna kolejność śladu automatyki', () => {
  it('sortuje po event_seq', () => {
    const zdarzenia = naZdarzenia([
      { event_seq: 3, event_type: 'FAULT_CLEARED' },
      { event_seq: 1, event_type: 'AUTOMATION_STARTED' },
      { event_seq: 2, event_type: 'FAULT_APPLIED' },
    ]);
    expect(zdarzenia.map((z) => z.event_seq)).toEqual([1, 2, 3]);
  });
});

describe('formaty deterministyczne (przecinek PL)', () => {
  it('fmtMs / fmtPu', () => {
    expect(fmtMs(120)).toBe('120,0');
    expect(fmtPu(0.9666)).toBe('0,967');
  });
});
