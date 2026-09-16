import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KafelSpojnosci } from '../KafelSpojnosci';
import { PULPIT_STRINGS, rewizjaModeluLabel, odciskKrotki } from '../strings';
import { INSPECTOR_STRINGS } from '../../../inspector';
import type { SpojnoscKafel } from '../pulpitAdapter';

const dane = (over: Partial<SpojnoscKafel> = {}): SpojnoscKafel => ({
  rewizjaModelu: 7,
  odcisk: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  aktualnosc: 'aktualne',
  rewizjaWynikow: 7,
  ...over,
});

describe('KafelSpojnosci — rewizja, odcisk, świeżość (FreshnessBadge z ui2/inspector)', () => {
  it('pokazuje rewizję modelu i skrócony odcisk (pełny w title)', () => {
    render(<KafelSpojnosci dane={dane()} />);
    expect(screen.getByText(rewizjaModeluLabel(7))).toBeInTheDocument();
    const odcisk = screen.getByText(odciskKrotki('a1b2c3d4e5f60718293a4b5c6d7e8f90'));
    expect(odcisk).toHaveAttribute('title', 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
  });

  it('stan „aktualne": renderuje współdzielony FreshnessBadge (etykieta „aktualne")', () => {
    render(<KafelSpojnosci dane={dane({ aktualnosc: 'aktualne' })} />);
    expect(screen.getByTestId('pulpit-spojnosc-freshness')).toBeInTheDocument();
    expect(screen.getByText(INSPECTOR_STRINGS.aktualne)).toBeInTheDocument();
  });

  it('stan „nieaktualne" Z rewizją wyników (StatusWynikowPrzypadku.rewizja_biegu): FreshnessBadge z realną parą rewizji', () => {
    render(
      <KafelSpojnosci dane={dane({ aktualnosc: 'nieaktualne', rewizjaWynikow: 4 })} />,
    );
    const badge = screen.getByTestId('pulpit-spojnosc-freshness');
    expect(badge).toHaveTextContent('nieaktualne');
    expect(badge).toHaveTextContent('4');
    expect(badge).toHaveTextContent('7');
  });

  it('stan „nieaktualne" BEZ rewizji wyników (rekord sprzed CV-2-W) → tag „nieaktualne" bez fabrykowanego numeru rew.', () => {
    render(
      <KafelSpojnosci dane={dane({ aktualnosc: 'nieaktualne', rewizjaWynikow: null })} />,
    );
    expect(screen.getByText(PULPIT_STRINGS.wynikiNieaktualne)).toBeInTheDocument();
    expect(screen.queryByTestId('pulpit-spojnosc-freshness')).not.toBeInTheDocument();
  });

  it('stan „brak": tag „brak wyników"', () => {
    render(<KafelSpojnosci dane={dane({ aktualnosc: 'brak', rewizjaWynikow: null })} />);
    expect(screen.getByText(PULPIT_STRINGS.wynikiBrak)).toBeInTheDocument();
  });

  it('kafel klikalny → onKlik (głęboki link)', () => {
    const onKlik = vi.fn();
    render(<KafelSpojnosci dane={dane()} onKlik={onKlik} />);
    fireEvent.click(screen.getByRole('button', { name: PULPIT_STRINGS.spojnosc }));
    expect(onKlik).toHaveBeenCalledTimes(1);
  });
});
