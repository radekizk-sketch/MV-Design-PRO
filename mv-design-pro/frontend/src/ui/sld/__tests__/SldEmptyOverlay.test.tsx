import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SldEmptyOverlay } from '../SldEmptyOverlay';

vi.mock('../../app-state', () => ({
  useHasActiveCase: () => true,
}));

describe('SldEmptyOverlay', () => {
  it('pokazuje pojedynczy komunikat warsztatowy dla pustego modelu bez zrodla', () => {
    render(<SldEmptyOverlay state="NO_MODEL" forceShow hasSource={false} />);

    expect(screen.getByTestId('sld-empty-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('sld-empty-overlay-title')).toHaveTextContent('Pusty schemat jednokreskowy');
    expect(screen.getByText(/Kliknij prawym przyciskiem na schemacie/i)).toBeInTheDocument();
    expect(screen.getByText(/Siec -> Dodaj GPZ/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('pokazuje dzialania wyboru i konfiguracji pierwszego wariantu pracy', () => {
    render(
      <SldEmptyOverlay
        state="NO_CASE"
        forceShow
        hasCases
        onSelectCase={vi.fn()}
        onCreateCase={vi.fn()}
      />,
    );

    expect(screen.getByTestId('sld-empty-overlay-title')).toHaveTextContent('Brak aktywnego wariantu pracy');
    expect(screen.getByTestId('sld-empty-overlay-select-case')).toHaveTextContent('Wybierz wariant pracy');
    expect(screen.getByTestId('sld-empty-overlay-create-new')).toHaveTextContent('Nowy wariant pracy');
  });
});
