/**
 * Testy czystych adapterów ekranu „Stabilność dynamiczna" (E-32, karta P-3).
 * Fixture 1:1 z realnym kontraktem `EchoScenariuszaStabilnosci.to_dict`
 * (application/stability/dynamic_stability.py) — echo scenariusza wpisanego przez
 * użytkownika + rekord oceny `NIE_OCENIONO` wygenerowany przez backend.
 *
 * Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): adaptery werdyktu
 * (`werdyktStabilnosciPL`, `naruszoneKryteriaPL`, `naWielkosciStabilnosci`) i śladu
 * zdarzeń automatyki (`naZdarzenia`) zniknęły razem z werdyktem progowym i narracją
 * zabezpieczeń — tor nie rozwiązuje sieci, więc nie ma czego ocenić ani opowiedzieć.
 * Intencja zachowana: dane wprost z backendu, brak pola → kreska (zero fabrykacji).
 */

import { describe, expect, it } from 'vitest';

import * as model from '../model';
import {
  fmtDeg,
  fmtMs,
  fmtPu,
  fmtS,
  naEchoScenariusza,
  naSeriePrzebiegu,
  naZalozeniaStabilnosci,
  wybierzPrzebiegStabilnosci,
  type WielkoscPrzebiegu,
  type WierszStabilnosci,
} from '../model';
import type { RekordOcenyNiewykonanej } from '../../wzorzec/OcenaNiewykonana';
import { STABILNOSC_STRINGS as T } from '../strings';
import rekordyOceny from './rekordyOceny.json';

const OCENA = (rekordyOceny as unknown as { scenariusz_dyn_1: RekordOcenyNiewykonanej })
  .scenariusz_dyn_1;

const WIERSZ: WierszStabilnosci = {
  scenario_id: 'dyn-1',
  scenario_type: 'FAULT_CLEAR',
  source_id: 'src/pv/1',
  faulted_element_id: 'line/gpz/1',
  cleared_by_element_ids: ['cb-main', 'cb-tie'],
  status: 'NIE_OCENIONO',
  contract_version: 'dynamic_stability_fault_clear_echo_v2',
  clearing_time_ms: 120,
  pre_fault_angle_deg: 10,
  during_fault_angle_deg: 75,
  post_fault_angle_deg: 28,
  post_fault_voltage_pu: 0.97,
  post_fault_frequency_pu: 0.99,
  ocena: OCENA,
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

describe('adaptery założeń i echa scenariusza (dane wprost z backendu)', () => {
  it('założenia niosą scenariusz zakłócenia: element, źródło, elementy wyłączające', () => {
    const zalozenia = naZalozeniaStabilnosci(WIERSZ);
    expect(zalozenia.map((z) => String(z.wartosc))).toEqual([
      'line/gpz/1',
      'src/pv/1',
      'cb-main, cb-tie',
    ]);
  });

  it('echo zwraca wartości wpisane przez użytkownika z jednostkami, w kolejności kontraktu', () => {
    expect(naEchoScenariusza(WIERSZ)).toEqual([
      { klucz: 'clearing_time_ms', wielkosc: T.echoCzas, wartosc: '120,0 ms' },
      { klucz: 'pre_fault_angle_deg', wielkosc: T.echoKatPrzed, wartosc: '10,0 °' },
      { klucz: 'during_fault_angle_deg', wielkosc: T.echoKatWCzasie, wartosc: '75,0 °' },
      { klucz: 'post_fault_angle_deg', wielkosc: T.echoKatPo, wartosc: '28,0 °' },
      { klucz: 'post_fault_voltage_pu', wielkosc: T.echoNapiecie, wartosc: '0,970 p.u.' },
      { klucz: 'post_fault_frequency_pu', wielkosc: T.echoCzestotliwosc, wartosc: '0,990 p.u.' },
    ]);
  });

  it('wiersz bez pól → kreski w echu i założeniach (zero fabrykacji)', () => {
    expect(naEchoScenariusza({}).every((pozycja) => pozycja.wartosc === T.kreska)).toBe(true);
    expect(naZalozeniaStabilnosci({}).every((z) => z.wartosc === T.kreska)).toBe(true);
  });

  it('model nie ma adapterów werdyktu ani narracji zdarzeń automatyki', () => {
    for (const nazwa of [
      'werdyktStabilnosciPL',
      'naruszoneKryteriaPL',
      'naWielkosciStabilnosci',
      'naZdarzenia',
    ]) {
      expect(nazwa in model).toBe(false);
    }
  });
});

describe('naSeriePrzebiegu — serie wykresu z metadanych backendu (zero fabrykacji)', () => {
  it('mapuje zadeklarowane wielkości na serie PL z jednostkami, w kolejności backendu', () => {
    const quantities: WielkoscPrzebiegu[] = [
      { key: 'voltage_pu', label_pl: 'Napięcie', unit: 'p.u.' },
      { key: 'frequency_pu', label_pl: 'Częstotliwość', unit: 'p.u.' },
    ];
    const serie = naSeriePrzebiegu(quantities);
    expect(serie).toEqual([
      { dataKey: 'voltage_pu', nazwa: T.przebiegSeriaNapiecie, jednostka: 'p.u.' },
      { dataKey: 'frequency_pu', nazwa: T.przebiegSeriaCzestotliwosc, jednostka: 'p.u.' },
    ]);
  });

  it('pomija wielkość nierozpoznaną (bez fizyki/fabrykacji w UI)', () => {
    const serie = naSeriePrzebiegu([
      { key: 'rotor_angle_rad', unit: 'rad' },
      { key: 'voltage_pu', unit: 'p.u.' },
    ]);
    expect(serie.map((s) => s.dataKey)).toEqual(['voltage_pu']);
  });

  it('brak wielkości → pusta lista serii', () => {
    expect(naSeriePrzebiegu([])).toEqual([]);
  });
});

describe('formaty deterministyczne (przecinek PL)', () => {
  it('fmtMs / fmtDeg / fmtPu / fmtS', () => {
    expect(fmtMs(120)).toBe('120,0');
    expect(fmtDeg(28)).toBe('28,0');
    expect(fmtPu(0.9666)).toBe('0,967');
    expect(fmtS(0.125)).toBe('0,125');
  });
});
