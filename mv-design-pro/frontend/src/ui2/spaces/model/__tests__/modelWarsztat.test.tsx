/**
 * Testy warsztatu modelu (scalenie U2 #2): zakładki schemat/szablony,
 * otwarcie kreatora zastosowania szablonu, dostępność.
 * Przeglądarka i kreator legacy atrapowane — testujemy integrację, nie ich wnętrza.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../szablony', () => ({
  PrzegladarkaSzablonow: ({ onZastosuj }: { onZastosuj: (id: string) => void }) => (
    <button type="button" data-testid="atrapa-przegladarka" onClick={() => onZastosuj('tpl-1')}>
      Zastosuj i edytuj
    </button>
  ),
}));

vi.mock('../../../../ui/sld/v2/canvas/SldWorkspaceContainer', () => ({
  SldWorkspaceContainer: () => <div data-testid="atrapa-schemat" />,
}));

vi.mock('../../../../ui/network-build/station-templates', () => ({
  StationTemplateWizard: ({
    onCancel,
    initialTemplateId,
  }: {
    onCancel?: () => void;
    initialTemplateId?: string | null;
  }) => (
    <div data-testid="atrapa-kreator-szablonu" data-initial-template-id={initialTemplateId ?? ''}>
      <button type="button" onClick={onCancel}>Anuluj</button>
    </div>
  ),
}));

import { ModelWarsztat } from '../ModelWarsztat';

describe('U2 #2 — warsztat przestrzeni Model', () => {
  afterEach(() => cleanup());

  it('domyślnie pokazuje schemat; zakładka przełącza na szablony (klik i strzałki)', () => {
    render(<ModelWarsztat />);
    expect(screen.getByTestId('atrapa-schemat')).toBeTruthy();
    expect(screen.queryByTestId('atrapa-przegladarka')).toBeNull();

    fireEvent.click(screen.getByTestId('mvd-model-zakladka-szablony'));
    expect(screen.getByTestId('atrapa-przegladarka')).toBeTruthy();
    expect(screen.queryByTestId('atrapa-schemat')).toBeNull();

    // E5.x: „Właściwości" wstawione za „Schemat", więc powrót do schematu to dwa kroki w lewo.
    fireEvent.keyDown(screen.getByTestId('mvd-model-zakladka-szablony'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('mvd-model-wlasciwosci-pusto')).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId('mvd-model-zakladka-wlasciwosci'), { key: 'ArrowLeft' });
    expect(screen.getByTestId('atrapa-schemat')).toBeTruthy();
  });

  it('„Zastosuj i edytuj" otwiera kreator zastosowania szablonu; zamknięcie działa', () => {
    render(<ModelWarsztat />);
    fireEvent.click(screen.getByTestId('mvd-model-zakladka-szablony'));
    fireEvent.click(screen.getByTestId('atrapa-przegladarka'));
    expect(screen.getByTestId('atrapa-kreator-szablonu')).toBeTruthy();

    fireEvent.click(screen.getByText('Anuluj'));
    expect(screen.queryByTestId('atrapa-kreator-szablonu')).toBeNull();
  });

  it('E3.2: przekazuje id szablonu z przeglądarki do kreatora jako initialTemplateId', () => {
    render(<ModelWarsztat />);
    fireEvent.click(screen.getByTestId('mvd-model-zakladka-szablony'));
    fireEvent.click(screen.getByTestId('atrapa-przegladarka'));
    expect(screen.getByTestId('atrapa-kreator-szablonu').dataset.initialTemplateId).toBe('tpl-1');
  });

  it('E5.x: zakładka „Właściwości" (testid) przełącza na okno właściwości; bez selekcji stan pusty', () => {
    render(<ModelWarsztat />);
    fireEvent.click(screen.getByTestId('mvd-model-zakladka-wlasciwosci'));
    expect(screen.getByTestId('mvd-model-wlasciwosci-pusto')).toBeTruthy();
    expect(screen.queryByTestId('atrapa-schemat')).toBeNull();
  });

  it('E5.x: „Właściwości" osiągalne strzałką w prawo ze „Schemat"', () => {
    render(<ModelWarsztat />);
    fireEvent.keyDown(screen.getByTestId('mvd-model-zakladka-schemat'), { key: 'ArrowRight' });
    expect(screen.getByTestId('mvd-model-wlasciwosci-pusto')).toBeTruthy();
  });

  it('zakładki mają semantykę tablist/tab z aria-selected', () => {
    render(<ModelWarsztat />);
    expect(screen.getByRole('tablist')).toBeTruthy();
    const schemat = screen.getByTestId('mvd-model-zakladka-schemat');
    expect(schemat.getAttribute('aria-selected')).toBe('true');
  });
});
