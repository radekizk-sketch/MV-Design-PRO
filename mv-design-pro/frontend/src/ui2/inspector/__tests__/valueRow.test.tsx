import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ValueRow } from '../ValueRow';
import { INSPECTOR_STRINGS, pochodzenieLabel } from '../strings';

describe('ValueRow — wartość mono + jednostka + pochodzenie + dowód', () => {
  it('renderuje wartość w klasie mono z tabularnymi cyframi i jednostką', () => {
    const { container } = render(
      <ValueRow
        etykieta="Prąd zwarciowy"
        wartosc={{ wartosc: 12.4, jednostka: 'kA' }}
        rewizjaModelu={215}
        onOtworzDowod={() => {}}
      />,
    );
    const num = container.querySelector('.mvd-insp-num');
    expect(num).not.toBeNull();
    expect(num!.textContent).toContain('12.4');
    expect(container.querySelector('.mvd-insp-unit')!.textContent).toContain('kA');
  });

  it('2× klik na wartości z dowodem → onOtworzDowod(ref)', () => {
    const onOtworzDowod = vi.fn();
    render(
      <ValueRow
        etykieta="Prąd zwarciowy"
        wartosc={{ wartosc: 12.4, jednostka: 'kA', dowodRef: 'proof-1' }}
        rewizjaModelu={215}
        onOtworzDowod={onOtworzDowod}
      />,
    );
    const btn = screen.getByLabelText(INSPECTOR_STRINGS.pokazDowod);
    fireEvent.doubleClick(btn);
    expect(onOtworzDowod).toHaveBeenCalledWith('proof-1');
  });

  it('klawisz Enter na wartości z dowodem → onOtworzDowod(ref)', () => {
    const onOtworzDowod = vi.fn();
    render(
      <ValueRow
        etykieta="Prąd zwarciowy"
        wartosc={{ wartosc: 12.4, jednostka: 'kA', dowodRef: 'proof-2' }}
        rewizjaModelu={215}
        onOtworzDowod={onOtworzDowod}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText(INSPECTOR_STRINGS.pokazDowod), { key: 'Enter' });
    expect(onOtworzDowod).toHaveBeenCalledWith('proof-2');
  });

  it('pochodzenie widoczne w dymku („Pochodzenie: {zrodlo}")', () => {
    render(
      <ValueRow
        etykieta="Prąd zwarciowy"
        wartosc={{ wartosc: 12.4, jednostka: 'kA', pochodzenie: 'IEC 60909' }}
        rewizjaModelu={215}
        onOtworzDowod={() => {}}
      />,
    );
    expect(screen.getByTitle(pochodzenieLabel('IEC 60909'))).toBeInTheDocument();
  });

  it('wartość bez dowodu nie jest przyciskiem (brak akcji dowodu)', () => {
    render(
      <ValueRow
        etykieta="Napięcie"
        wartosc={{ wartosc: 15, jednostka: 'kV' }}
        rewizjaModelu={215}
        onOtworzDowod={() => {}}
      />,
    );
    expect(screen.queryByLabelText(INSPECTOR_STRINGS.pokazDowod)).not.toBeInTheDocument();
  });

  it('dana pochodna nieaktualna → znacznik świeżości „nieaktualne"', () => {
    const { container } = render(
      <ValueRow
        etykieta="Prąd zwarciowy"
        wartosc={{ wartosc: 12.4, jednostka: 'kA', rewizja: 214 }}
        rewizjaModelu={215}
        onOtworzDowod={() => {}}
      />,
    );
    expect(container.querySelector('[data-mvd-fresh="stale"]')).not.toBeNull();
  });
});
