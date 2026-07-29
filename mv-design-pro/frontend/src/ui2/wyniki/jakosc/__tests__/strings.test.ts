import { describe, expect, it } from 'vitest';
import {
  RODZAJ_KONTROLI_PL,
  STATUS_WALIDACJI_PL,
  STATUS_WIARYGODNOSCI,
  fmtKA,
  fmtKV,
  fmtProcent,
  fmtWartosc,
  istotnoscWalidacji,
  istotnoscWiarygodnosci,
  rodzajKontroliPL,
  statusWalidacjiPL,
} from '../strings';
import type { RodzajKontroli, StatusWalidacji } from '../api';

describe('słowniki PL', () => {
  it('pokrywa pełny zbiór rodzajów kontroli energetycznej', () => {
    const kody: RodzajKontroli[] = [
      'BRANCH_LOADING',
      'TRANSFORMER_LOADING',
      'VOLTAGE_DEVIATION',
      'LOSS_BUDGET',
      'REACTIVE_BALANCE',
    ];
    for (const kod of kody) {
      expect(RODZAJ_KONTROLI_PL[kod]).toBeTruthy();
      expect(rodzajKontroliPL(kod)).toBe(RODZAJ_KONTROLI_PL[kod]);
    }
    expect(Object.keys(RODZAJ_KONTROLI_PL)).toHaveLength(5);
  });

  it('pokrywa pełny zbiór statusów walidacji', () => {
    const kody: StatusWalidacji[] = ['PASS', 'WARNING', 'FAIL', 'NOT_COMPUTED'];
    for (const kod of kody) {
      expect(STATUS_WALIDACJI_PL[kod]).toBeTruthy();
      expect(statusWalidacjiPL(kod)).toBe(STATUS_WALIDACJI_PL[kod]);
    }
    expect(STATUS_WALIDACJI_PL.PASS).toBe('Zgodny');
    expect(STATUS_WALIDACJI_PL.FAIL).toBe('Przekroczenie');
  });

  it('utrwala statusy wiarygodności zgodne z backendem', () => {
    expect(STATUS_WIARYGODNOSCI.zweryfikowany).toBe('zweryfikowany');
    expect(STATUS_WIARYGODNOSCI.pozaZakresem).toBe('poza zakresem wiarygodności');
    expect(STATUS_WIARYGODNOSCI.niekompletne).toBe('dane niekompletne');
  });
});

describe('istotność statusu (dobór koloru tagu)', () => {
  it('walidacja: PASS→ok, WARNING→warn, FAIL→err, NOT_COMPUTED→neutral', () => {
    expect(istotnoscWalidacji('PASS')).toBe('ok');
    expect(istotnoscWalidacji('WARNING')).toBe('warn');
    expect(istotnoscWalidacji('FAIL')).toBe('err');
    expect(istotnoscWalidacji('NOT_COMPUTED')).toBe('neutral');
  });

  it('wiarygodność: zweryfikowany→ok, poza zakresem→err, inne→neutral', () => {
    expect(istotnoscWiarygodnosci('zweryfikowany')).toBe('ok');
    expect(istotnoscWiarygodnosci('poza zakresem wiarygodności')).toBe('err');
    expect(istotnoscWiarygodnosci('dane niekompletne')).toBe('neutral');
  });
});

describe('formatery PL (deterministyczne, przecinek dziesiętny)', () => {
  it('formatuje kA/kV/%/wartość z przecinkiem', () => {
    expect(fmtKA(12.5)).toBe('12,500');
    expect(fmtKV(15)).toBe('15,000');
    expect(fmtProcent(80)).toBe('80,0');
    expect(fmtWartosc(65)).toBe('65,00');
  });

  it('są czyste (te same wejścia → te same wyjścia)', () => {
    expect(fmtKA(0.1)).toBe(fmtKA(0.1));
    expect(fmtWartosc(3.2)).toBe('3,20');
  });
});
