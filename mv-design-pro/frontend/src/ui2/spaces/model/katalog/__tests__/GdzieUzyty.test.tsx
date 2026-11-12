import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GdzieUzyty, filtrujUzycia } from '../GdzieUzyty';
import { FIXTURE_UZYCIA } from './fixtures';
import { ustawMigawkeZElementami } from '../../../../../test/schematTestowy';
import { useSelectionStore } from '../../../../../ui/selection/store';
import { useSnapshotStore } from '../../../../../ui/topology/snapshotStore';

afterEach(() => {
  useSnapshotStore.setState({ snapshot: null });
  useSelectionStore.getState().clearSelection();
});

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
    render(<GdzieUzyty typId="line-afl6-120" uzycia={FIXTURE_UZYCIA} />);
    expect(screen.getByText('Użyty w 2 elementach modelu')).toBeInTheDocument();
    expect(screen.getByText(/Linia L1/)).toBeInTheDocument();
    expect(screen.getByText(/Linia L2/)).toBeInTheDocument();
  });

  it('„Pokaż na schemacie" elementu w modelu: zaznaczenie i wskazanie kamery (jedna droga)', () => {
    ustawMigawkeZElementami([{ kolekcja: 'branches', id: 'branch-1', name: 'Linia L1', pola: { type: 'line_overhead' } }]);
    render(<GdzieUzyty typId="line-afl6-120" uzycia={FIXTURE_UZYCIA} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż na schemacie' }));
    expect(useSelectionStore.getState().selectedElement?.id).toBe('branch-1');
    expect(useSelectionStore.getState().sldWskazanie).toMatchObject({ ref: 'branch-1', tryb: 'kadruj' });
  });

  it('element nieobecny w migawce modelu: wiersz bez akcji (zamiast nieaktywnego przycisku)', () => {
    ustawMigawkeZElementami([{ kolekcja: 'branches', id: 'branch-1', pola: { type: 'line_overhead' } }]);
    render(<GdzieUzyty typId="line-afl6-120" uzycia={FIXTURE_UZYCIA} />);
    // Dwa użycia, jedno w modelu → dokładnie jeden przycisk.
    expect(screen.getAllByRole('button', { name: 'Pokaż na schemacie' })).toHaveLength(1);
  });
});
