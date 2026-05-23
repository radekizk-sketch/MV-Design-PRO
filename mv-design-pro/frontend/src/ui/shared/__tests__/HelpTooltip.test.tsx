import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HelpTooltip } from '../HelpTooltip';

describe('HelpTooltip', () => {
  it('renderuje przycisk pomocy', () => {
    render(<HelpTooltip text="Test opis" />);
    expect(screen.getByLabelText('Pokaż wyjaśnienie pola')).toBeTruthy();
  });

  it('button onClick toggle tooltip widoczność', () => {
    render(<HelpTooltip text="Test opis" />);
    const button = screen.getByLabelText('Pokaż wyjaśnienie pola');
    const tooltipId = button.getAttribute('aria-describedby')!;
    const tooltip = document.getElementById(tooltipId)!;

    expect(tooltip.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(button);
    expect(tooltip.getAttribute('aria-hidden')).toBe('false');
  });

  it('pokazuje normę gdy podana', () => {
    render(<HelpTooltip text="Napięcie SN" norm="PN-EN 50182" />);
    expect(screen.getByText('PN-EN 50182')).toBeTruthy();
  });

  it('aria-describedby łączy button z tooltipem', () => {
    render(<HelpTooltip text="opis" />);
    const button = screen.getByLabelText('Pokaż wyjaśnienie pola');
    const tooltipId = button.getAttribute('aria-describedby');
    expect(tooltipId).toBeTruthy();
    const tooltip = document.getElementById(tooltipId!);
    expect(tooltip?.getAttribute('role')).toBe('tooltip');
  });

  it('title attribute zawiera tekst dla niezauważalnej pomocy', () => {
    render(<HelpTooltip text="długi opis" />);
    const button = screen.getByLabelText('Pokaż wyjaśnienie pola');
    const tooltipId = button.getAttribute('aria-describedby')!;
    const tooltip = document.getElementById(tooltipId)!;
    expect(tooltip.getAttribute('title')).toBe('długi opis');
  });
});
