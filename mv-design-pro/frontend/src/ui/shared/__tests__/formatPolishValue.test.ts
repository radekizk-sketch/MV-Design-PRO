import { describe, expect, it } from 'vitest';

import {
  MISSING_DASH,
  MISSING_LABEL,
  POLISH_STATUS_LABEL,
  POLISH_STATUS_SHORT,
  formatActivePower,
  formatCurrent,
  formatLengthKm,
  formatPercent,
  formatPolishValue,
  formatReactivePower,
  formatStatusLabel,
  formatVoltage,
} from '../formatPolishValue';

/**
 * Te testy są kontraktem rebuild-u SLD CAD/SCADA.
 *
 * INWARIANT NACZELNY:
 *   • brak danych nigdy nie jest renderowany jako '0.00' / '0,00'
 *   • status obliczeń ≠ 'ok' nigdy nie zwraca wartości liczbowej zamiast etykiety
 *
 * Każdy nowy widok powinien używać formatPolishValue / formatCurrent / ...
 * Bezpośrednie `(value ? 0).toFixed(...)` jest niedopuszczalne.
 *
 * @see docs/audits/SLD_REBUILD_CAD_SCADA_AUDIT.md PR-1
 */

describe('formatPolishValue — kontrakt braków danych', () => {
  it('null zwraca placeholder, NIE 0,00', () => {
    expect(formatPolishValue(null)).toBe(MISSING_DASH);
    expect(formatPolishValue(null)).not.toMatch(/0[.,]00/);
  });

  it('undefined zwraca placeholder, NIE 0,00', () => {
    expect(formatPolishValue(undefined)).toBe(MISSING_DASH);
    expect(formatPolishValue(undefined)).not.toMatch(/0[.,]00/);
  });

  it('NaN zwraca placeholder, NIE 0,00', () => {
    expect(formatPolishValue(Number.NaN)).toBe(MISSING_DASH);
    expect(formatPolishValue(Number.NaN)).not.toMatch(/0[.,]00/);
  });

  it('Infinity zwraca placeholder', () => {
    expect(formatPolishValue(Number.POSITIVE_INFINITY)).toBe(MISSING_DASH);
    expect(formatPolishValue(Number.NEGATIVE_INFINITY)).toBe(MISSING_DASH);
  });

  it('placeholder long zwraca tekstową etykietę "brak danych"', () => {
    expect(formatPolishValue(null, { placeholder: 'long' })).toBe(MISSING_LABEL);
  });
});

describe('formatPolishValue — wartości liczbowe', () => {
  it('renderuje wartość z domyślnymi 2 miejscami po przecinku w pl-PL', () => {
    const result = formatPolishValue(123.456);
    // pl-PL używa separatora dziesiętnego ','
    expect(result).toMatch(/^123,46$/);
  });

  it('renderuje wartość 0 jako "0,00" tylko przy domyślnym wnioskowanym statusie ok', () => {
    expect(formatPolishValue(0)).toBe('0,00');
  });

  it('dopisuje jednostkę po wartości', () => {
    expect(formatPolishValue(15.0, { unit: 'kV' })).toBe('15,00 kV');
  });

  it('respektuje liczbę miejsc po przecinku', () => {
    expect(formatPolishValue(1.23456, { decimals: 4 })).toBe('1,2346');
  });

  it('locale en-US zwraca separator dziesiętny "."', () => {
    expect(formatPolishValue(1.5, { locale: 'en-US' })).toBe('1.50');
  });
});

describe('formatPolishValue — statusy obliczeń', () => {
  it('status none zwraca etykietę "brak obliczeń" przy long', () => {
    expect(formatPolishValue(123, { status: 'none', placeholder: 'long' })).toBe(
      'brak obliczeń',
    );
  });

  it('status none zwraca placeholder krótki "—"', () => {
    expect(formatPolishValue(123, { status: 'none', placeholder: 'short' })).toBe(
      MISSING_DASH,
    );
  });

  it('status n_a zwraca "nie dotyczy" / "n.d."', () => {
    expect(formatPolishValue(0, { status: 'n_a', placeholder: 'long' })).toBe(
      'nie dotyczy',
    );
    expect(formatPolishValue(0, { status: 'n_a', placeholder: 'short' })).toBe('n.d.');
  });

  it('status error zwraca "wynik błędny" / "bł."', () => {
    expect(formatPolishValue(123, { status: 'error', placeholder: 'long' })).toBe(
      'wynik błędny',
    );
    expect(formatPolishValue(123, { status: 'error', placeholder: 'short' })).toBe(
      'bł.',
    );
  });

  it('status pending zwraca "w toku" / "…"', () => {
    expect(formatPolishValue(123, { status: 'pending', placeholder: 'long' })).toBe(
      'w toku',
    );
    expect(formatPolishValue(123, { status: 'pending', placeholder: 'short' })).toBe(
      '…',
    );
  });

  it('status partial dopisuje "(wynik częściowy)" w long', () => {
    expect(
      formatPolishValue(50, {
        status: 'partial',
        unit: 'A',
        placeholder: 'long',
      }),
    ).toBe('50,00 A (wynik częściowy)');
  });

  it('status partial dopisuje "cz." w short', () => {
    expect(
      formatPolishValue(50, {
        status: 'partial',
        unit: 'A',
        placeholder: 'short',
      }),
    ).toBe('50,00 A cz.');
  });

  it('NIGDY nie zwraca "0.00" ani "0,00" przy statusie != ok dla wartości null', () => {
    const statuses = ['none', 'error', 'n_a', 'pending'] as const;
    for (const status of statuses) {
      const result = formatPolishValue(null, { status });
      expect(result).not.toMatch(/^0[.,]00$/);
    }
  });
});

describe('helpery jednostkowe', () => {
  it('formatCurrent dopisuje "A"', () => {
    expect(formatCurrent(5)).toBe('5,00 A');
  });

  it('formatVoltage dopisuje "kV"', () => {
    expect(formatVoltage(15)).toBe('15,00 kV');
  });

  it('formatActivePower dopisuje "kW"', () => {
    expect(formatActivePower(100)).toBe('100,00 kW');
  });

  it('formatReactivePower dopisuje "kvar"', () => {
    expect(formatReactivePower(50)).toBe('50,00 kvar');
  });

  it('formatLengthKm używa 3 miejsc po przecinku i jednostki "km"', () => {
    expect(formatLengthKm(1.2345)).toBe('1,235 km');
  });

  it('formatPercent używa 1 miejsca po przecinku i "%"', () => {
    expect(formatPercent(85.456)).toBe('85,5 %');
  });

  it('helpery NIGDY nie zwracają "0,00 <unit>" dla null', () => {
    expect(formatCurrent(null)).toBe(MISSING_DASH);
    expect(formatVoltage(null)).toBe(MISSING_DASH);
    expect(formatActivePower(null)).toBe(MISSING_DASH);
    expect(formatReactivePower(null)).toBe(MISSING_DASH);
    expect(formatLengthKm(null)).toBe(MISSING_DASH);
    expect(formatPercent(null)).toBe(MISSING_DASH);
  });
});

describe('formatStatusLabel', () => {
  it('zwraca pełne polskie etykiety w long', () => {
    expect(formatStatusLabel('ok', 'long')).toBe(POLISH_STATUS_LABEL.ok);
    expect(formatStatusLabel('partial', 'long')).toBe('wynik częściowy');
    expect(formatStatusLabel('error', 'long')).toBe('wynik błędny');
    expect(formatStatusLabel('none', 'long')).toBe('brak obliczeń');
    expect(formatStatusLabel('n_a', 'long')).toBe('nie dotyczy');
    expect(formatStatusLabel('pending', 'long')).toBe('w toku');
  });

  it('zwraca skróty w short', () => {
    expect(formatStatusLabel('partial', 'short')).toBe(POLISH_STATUS_SHORT.partial);
    expect(formatStatusLabel('error', 'short')).toBe('bł.');
    expect(formatStatusLabel('n_a', 'short')).toBe('n.d.');
    expect(formatStatusLabel('pending', 'short')).toBe('…');
  });

  it('etykiety statusu nigdy nie zawierają "0.00" ani "0,00"', () => {
    for (const status of ['ok', 'partial', 'error', 'none', 'n_a', 'pending'] as const) {
      expect(POLISH_STATUS_LABEL[status]).not.toMatch(/0[.,]00/);
      expect(POLISH_STATUS_SHORT[status]).not.toMatch(/0[.,]00/);
    }
  });
});

describe('inwariant naczelny — zakaz "0.00 spam"', () => {
  /**
   * Test fuzz: dla pełnego cross-product (status × value) sprawdza, że
   * brak danych NIGDY nie produkuje '0,00 <unit>' ani '0.00 <unit>'.
   */
  it('fuzz: null + status × jednostki nigdy nie produkuje "0,00"', () => {
    const statuses = ['ok', 'partial', 'error', 'none', 'n_a', 'pending'] as const;
    const units = ['A', 'kV', 'kW', 'kvar', 'kVA', 'km', '%', 'Hz', undefined];
    const placeholders = ['short', 'long'] as const;

    for (const status of statuses) {
      for (const unit of units) {
        for (const placeholder of placeholders) {
          const result = formatPolishValue(null, { status, unit, placeholder });
          expect(result).not.toMatch(/^0[.,]00\s*$/);
          expect(result).not.toMatch(/^0[.,]00\s+[A-Za-z%]/);
        }
      }
    }
  });

  it('fuzz: NaN nigdy nie produkuje "0,00"', () => {
    const result = formatPolishValue(Number.NaN, { unit: 'A', status: 'ok' });
    expect(result).not.toMatch(/0[.,]00/);
  });
});
