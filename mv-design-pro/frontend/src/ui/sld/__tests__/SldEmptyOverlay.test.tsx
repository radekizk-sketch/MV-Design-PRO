import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SldEmptyOverlay } from '../SldEmptyOverlay';

vi.mock('../../app-state', () => ({
  useHasActiveCase: () => true,
}));

describe('SldEmptyOverlay', () => {
  it('pokazuje formalne akcje utworzenia GPZ dla pustego modelu bez zrodla', () => {
    const onCreateSimpleGpz = vi.fn();
    const onCreateFullGpz = vi.fn();

    render(
      <SldEmptyOverlay
        state="NO_MODEL"
        forceShow
        hasSource={false}
        onCreateSimpleGpz={onCreateSimpleGpz}
        onCreateFullGpz={onCreateFullGpz}
      />,
    );

    expect(screen.getByTestId('sld-empty-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('sld-empty-overlay-title')).toHaveTextContent('Brak źródła zasilania');
    expect(screen.getByText(/Aby rozpocząć modelowanie sieci/i)).toBeInTheDocument();
    expect(screen.queryByText(/Siec -> Dodaj GPZ/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Kliknij prawym przyciskiem/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sld-empty-overlay-create-gpz-simple'));
    fireEvent.click(screen.getByTestId('sld-empty-overlay-create-gpz-full'));

    expect(onCreateSimpleGpz).toHaveBeenCalledTimes(1);
    expect(onCreateFullGpz).toHaveBeenCalledTimes(1);
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
