/**
 * GpzOperatorHeader testy (Phase 1 expansion polish — SCADA OSD parity).
 *
 * Pokrycie:
 *   1. Render bazowy (gpz name; unknown transmission is silent).
 *   2. 3 visible transmission statuses (ok/degraded/lost) z PL labels.
 *   3. Address + radio rendered.
 *   4. Balance P/Q rendered (z zaokrągleniem do 1 miejsca).
 *   5. Alarmy: 4 kinds z PL labels (POŻAR / drzwi / AW UJP / wentylacja).
 *   6. Control availability: 4 stany z PL labels.
 *   7. Reset signals click handler.
 *   8. Self-degrade gdy brak danych — header się skraca.
 */
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GpzOperatorHeader } from '../GpzOperatorHeader';

function renderHeader(props: Partial<React.ComponentProps<typeof GpzOperatorHeader>> = {}) {
  return render(
    <svg width={400} height={300}>
      <GpzOperatorHeader x={0} y={0} width={300} gpzName="GPZ-5 PST" {...props} />
    </svg>,
  );
}

describe('GpzOperatorHeader — render bazowy', () => {
  it('Renderuje nazwę GPZ + transmission status', () => {
    const { container, getByText, queryByText } = renderHeader();
    expect(container.querySelector('[data-testid="sld-v2-gpz-operator-header"]')).toBeTruthy();
    expect(getByText('GPZ-5 PST')).toBeTruthy();
    expect(queryByText('TRANSMISJA NIEZNANA')).toBeNull();
    expect(container.querySelector('[data-testid="gpz-header-transmission"]')).toBeNull();
  });

  it('data-gpz-name + data-transmission attributes', () => {
    const { container } = renderHeader({ transmissionStatus: 'ok' });
    const root = container.querySelector('[data-testid="sld-v2-gpz-operator-header"]');
    expect(root!.getAttribute('data-gpz-name')).toBe('GPZ-5 PST');
    expect(root!.getAttribute('data-transmission')).toBe('ok');
  });
});

describe('GpzOperatorHeader — transmission status PL', () => {
  it('ok → "TRANSMISJA POPRAWNA"', () => {
    const { getByText } = renderHeader({ transmissionStatus: 'ok' });
    expect(getByText('TRANSMISJA POPRAWNA')).toBeTruthy();
  });

  it('degraded → "TRANSMISJA OGRANICZONA"', () => {
    const { getByText } = renderHeader({ transmissionStatus: 'degraded' });
    expect(getByText('TRANSMISJA OGRANICZONA')).toBeTruthy();
  });

  it('lost → "BRAK TRANSMISJI"', () => {
    const { getByText } = renderHeader({ transmissionStatus: 'lost' });
    expect(getByText('BRAK TRANSMISJI')).toBeTruthy();
  });

  it('unknown (default) → status transmisji jest ukryty', () => {
    const { container, queryByText } = renderHeader();
    expect(queryByText('TRANSMISJA NIEZNANA')).toBeNull();
    expect(container.querySelector('[data-testid="gpz-header-transmission"]')).toBeNull();
  });
});

describe('GpzOperatorHeader — address + radio', () => {
  it('addressLine + radioId renderowane', () => {
    const { getByText } = renderHeader({
      addressLine: 'ul. Poznańska 13/15',
      radioId: 'radio nr 587',
    });
    expect(getByText('ul. Poznańska 13/15')).toBeTruthy();
    expect(getByText('radio nr 587')).toBeTruthy();
  });

  it('Tylko addressLine bez radio', () => {
    const { getByText, queryByText } = renderHeader({ addressLine: 'ul. X' });
    expect(getByText('ul. X')).toBeTruthy();
    expect(queryByText(/radio/)).toBeNull();
  });

  it('Brak adres + radio → header skrócony', () => {
    const { container } = renderHeader();
    expect(container.querySelector('[data-testid="gpz-header-address"]')).toBeNull();
  });
});

describe('GpzOperatorHeader — balance P/Q', () => {
  it('Bilans P=2.5, Q=-0.4 renderowany z zaokrągleniem do 1 miejsca i jednostkami', () => {
    const { container, getByText } = renderHeader({
      balance: { pMw: 2.5, qMvar: -0.4 },
    });
    expect(container.querySelector('[data-testid="gpz-header-balance"]')).toBeTruthy();
    expect(getByText('Bilans stacji')).toBeTruthy();
    expect(getByText('2.5 MW')).toBeTruthy();
    expect(getByText('-0.4 MVAr')).toBeTruthy();
  });

  it('Brak balance.pMw i balance.qMvar → komunikat "Wyniki rozpływu: brak danych"', () => {
    const { container, getByText, queryByText } = renderHeader({
      balance: { pMw: null, qMvar: null },
    });
    expect(
      container.querySelector('[data-testid="gpz-header-balance-no-results"]'),
    ).toBeTruthy();
    expect(getByText('Wyniki rozpływu: brak danych')).toBeTruthy();
    // NIE 0.0 i NIE jednostek
    expect(queryByText('0.0 MW')).toBeNull();
    expect(queryByText('0.0 MVAr')).toBeNull();
    // data-no-results="true" attribut
    expect(
      container
        .querySelector('[data-testid="gpz-header-balance"]')
        ?.getAttribute('data-no-results'),
    ).toBe('true');
  });

  it('P present, Q absent → P z jednostką, Q do wyliczenia', () => {
    const { getByTestId } = renderHeader({
      balance: { pMw: 5.7, qMvar: null },
    });
    expect(getByTestId('gpz-header-balance-p-value').textContent).toContain('5.7 MW');
    expect(getByTestId('gpz-header-balance-q-value').textContent).toContain('do wyliczenia');
  });

  it('Balance null → renderuje komunikat „Wyniki rozpływu: brak danych"', () => {
    const { container, getByText } = renderHeader({
      balance: { pMw: null, qMvar: null },
    });
    expect(container.querySelector('[data-testid="gpz-header-balance"]')).toBeTruthy();
    expect(getByText('Wyniki rozpływu: brak danych')).toBeTruthy();
  });

  it('Brak balance → block hidden', () => {
    const { container } = renderHeader();
    expect(container.querySelector('[data-testid="gpz-header-balance"]')).toBeNull();
  });
});

describe('GpzOperatorHeader — alarmy', () => {
  it('enclosureDoorOpen → "Otwarte drzwi rozdzielni"', () => {
    const { getByText, container } = renderHeader({
      alarms: { enclosureDoorOpen: true },
    });
    expect(container.querySelector('[data-testid="gpz-header-alarms"]')).toBeTruthy();
    expect(getByText(/Otwarte drzwi rozdzielni/)).toBeTruthy();
  });

  it('awUjpAlarm → "AW UJP"', () => {
    const { getByText } = renderHeader({ alarms: { awUjpAlarm: true } });
    expect(getByText(/AW UJP/)).toBeTruthy();
  });

  it('fireAlarm → "POŻAR / DYM"', () => {
    const { getByText } = renderHeader({ alarms: { fireAlarm: true } });
    expect(getByText(/POŻAR \/ DYM/)).toBeTruthy();
  });

  it('hvacAlarm → "Wentylacja / temperatura"', () => {
    const { getByText } = renderHeader({ alarms: { hvacAlarm: true } });
    expect(getByText(/Wentylacja \/ temperatura/)).toBeTruthy();
  });

  it('4 alarmy jednocześnie → wszystkie w stripie', () => {
    const { container } = renderHeader({
      alarms: {
        enclosureDoorOpen: true,
        awUjpAlarm: true,
        fireAlarm: true,
        hvacAlarm: true,
      },
    });
    const alarmStrip = container.querySelector('[data-testid="gpz-header-alarms"]')!;
    expect(alarmStrip.getAttribute('data-alarm-count')).toBe('4');
  });

  it('Brak alarmów → strip hidden', () => {
    const { container } = renderHeader();
    expect(container.querySelector('[data-testid="gpz-header-alarms"]')).toBeNull();
  });
});

describe('GpzOperatorHeader — control availability', () => {
  it('remote → "Telesterowanie czynne"', () => {
    const { getByText } = renderHeader({ controlAvailability: 'remote' });
    expect(getByText('Telesterowanie czynne')).toBeTruthy();
  });

  it('local → "Sterowanie lokalne"', () => {
    const { getByText } = renderHeader({ controlAvailability: 'local' });
    expect(getByText('Sterowanie lokalne')).toBeTruthy();
  });

  it('blocked → "Sterowanie zablokowane"', () => {
    const { getByText } = renderHeader({ controlAvailability: 'blocked' });
    expect(getByText('Sterowanie zablokowane')).toBeTruthy();
  });
});

describe('GpzOperatorHeader — reset signals click', () => {
  it('onResetSignalsClick wywoływany po klick', () => {
    const handler = vi.fn();
    const { getByTestId } = renderHeader({
      controlAvailability: 'remote',
      onResetSignalsClick: handler,
    });
    const reset = getByTestId('gpz-header-reset-signals');
    fireEvent.click(reset);
    expect(handler).toHaveBeenCalled();
  });

  it('Brak handler → reset signals NIE renderowany', () => {
    const { container } = renderHeader({ controlAvailability: 'remote' });
    expect(container.querySelector('[data-testid="gpz-header-reset-signals"]')).toBeNull();
  });
});

describe('GpzOperatorHeader — self-degrade (operator-grade)', () => {
  it('Tylko gpzName → header minimalny bez statusu nieznanej transmisji', () => {
    const { container } = renderHeader();
    // Wszystkie opcjonalne sub-komponenty hidden
    expect(container.querySelector('[data-testid="gpz-header-transmission"]')).toBeNull();
    expect(container.querySelector('[data-testid="gpz-header-address"]')).toBeNull();
    expect(container.querySelector('[data-testid="gpz-header-balance"]')).toBeNull();
    expect(container.querySelector('[data-testid="gpz-header-alarms"]')).toBeNull();
    expect(container.querySelector('[data-testid="gpz-header-control"]')).toBeNull();
  });

  it('Pełen header (wszystkie pola) → wszystkie sub-komponenty obecne', () => {
    const { container } = renderHeader({
      addressLine: 'ul. X 1', radioId: 'r 1',
      transmissionStatus: 'ok',
      controlAvailability: 'remote',
      balance: { pMw: 5.0, qMvar: 1.0 },
      alarms: { enclosureDoorOpen: true },
      onResetSignalsClick: () => {},
    });
    expect(container.querySelector('[data-testid="gpz-header-address"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-header-balance"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-header-alarms"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-header-control"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gpz-header-reset-signals"]')).toBeTruthy();
  });
});

describe('GpzOperatorHeader — porównanie ze screenshotami SCADA OSD', () => {
  it('Replica GPZ-5 PST: nazwa + TRANSMISJA POPRAWNA + bilans P=-3.1, Q=-0.4', () => {
    const { getByText } = renderHeader({
      gpzName: 'GPZ-5 PST',
      transmissionStatus: 'ok',
      balance: { pMw: -3.1, qMvar: -0.4 },
    });
    expect(getByText('GPZ-5 PST')).toBeTruthy();
    expect(getByText('TRANSMISJA POPRAWNA')).toBeTruthy();
    expect(getByText('-3.1 MW')).toBeTruthy();
    expect(getByText('-0.4 MVAr')).toBeTruthy();
  });

  it('Replica GPZ-21 KEK: nazwa + adres + alarmy + kasowanie', () => {
    const { getByText } = renderHeader({
      gpzName: 'GPZ-21 KEK',
      addressLine: 'ul. Poznańska 13/15',
      radioId: 'radio nr 587',
      transmissionStatus: 'ok',
      controlAvailability: 'remote',
      balance: { pMw: 0.8, qMvar: 0.8 },
      alarms: { enclosureDoorOpen: true },
      onResetSignalsClick: () => {},
    });
    expect(getByText('GPZ-21 KEK')).toBeTruthy();
    expect(getByText('ul. Poznańska 13/15')).toBeTruthy();
    expect(getByText('radio nr 587')).toBeTruthy();
    expect(getByText('Telesterowanie czynne')).toBeTruthy();
    expect(getByText(/Otwarte drzwi rozdzielni/)).toBeTruthy();
    expect(getByText(/Kasowanie sygnalizacji/)).toBeTruthy();
  });
});
