import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GdzieUzyty, filtrujUzycia } from '../GdzieUzyty';
import { FIXTURE_UZYCIA } from './fixtures';

describe('filtrujUzycia', () => {
  it('zwraca elementy o pasującym catalog_ref', () => {
    expect(filtrujUzycia(FIXTURE_UZYCIA, 'line-afl6-120')).toHaveLength(2);
    expect(filtrujUzycia(FIXTURE_UZYCIA, 'tr-630-15-04')).toHaveLength(1);
  });

  it('zwraca pustą listę dla typu bez użyć', () => {
    expect(filtrujUzycia(FIXTURE_UZYCIA, 'nieuzywany')).toHaveLength(0);
  });
});

describe('GdzieUzyty', () => {
  it('wyświetla komunikat o braku użyć', () => {
    render(<GdzieUzyty typId="nieuzywany" uzycia={FIXTURE_UZYCIA} />);
    expect(
      screen.getByText('Ten typ nie jest przypisany do żadnego elementu modelu.'),
    ).toBeInTheDocument();
  });

  it('wyświetla liczbę i listę elementów używających typu', () => {
    render(<GdzieUzyty typId="line-afl6-120" uzycia={FIXTURE_UZYCIA} onPokazElement={() => {}} />);
    expect(screen.getByText('Użyty w 2 elementach modelu')).toBeInTheDocument();
    expect(screen.getByText(/Linia L1/)).toBeInTheDocument();
    expect(screen.getByText(/Linia L2/)).toBeInTheDocument();
  });

  it('wywołuje onPokazElement z ref po kliknięciu', () => {
    const onPokaz = vi.fn();
    render(
      <GdzieUzyty typId="line-afl6-120" uzycia={FIXTURE_UZYCIA} onPokazElement={onPokaz} />,
    );
    fireEvent.click(screen.getByText(/Linia L1/));
    expect(onPokaz).toHaveBeenCalledWith('branch-1');
  });

  it('blokuje nawigację, gdy brak callbacku onPokazElement', () => {
    render(<GdzieUzyty typId="line-afl6-120" uzycia={FIXTURE_UZYCIA} />);
    const przycisk = screen.getByText(/Linia L1/) as HTMLButtonElement;
    expect(przycisk).toBeDisabled();
  });
});
