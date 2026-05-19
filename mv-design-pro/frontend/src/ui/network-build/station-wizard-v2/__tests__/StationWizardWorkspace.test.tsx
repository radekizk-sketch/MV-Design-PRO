/**
 * StationWizardWorkspace — composition root test.
 *
 * Sprawdza:
 *   - Render sidebar + step content + footer
 *   - Nawigacja kroku next/prev przez wszystkie 17 kroków
 *   - Sync sidebar ↔ content (klik w sidebarze zmienia step)
 *   - onComplete callback przy ostatnim kroku
 *   - onCancel callback
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StationWizardWorkspace } from '../StationWizardWorkspace';
import { STATION_WIZARD_STEPS } from '../stationWizardContract';

describe('StationWizardWorkspace — composition root', () => {
  it('renderuje sidebar + step content + footer', () => {
    render(<StationWizardWorkspace />);
    expect(screen.getByTestId('station-wizard-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('station-wizard-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('station-wizard-step-content')).toBeInTheDocument();
    expect(screen.getByTestId('station-wizard-footer')).toBeInTheDocument();
  });

  it('Domyślnie aktywny krok = cable (krok 1)', () => {
    render(<StationWizardWorkspace />);
    const workspace = screen.getByTestId('station-wizard-workspace');
    expect(workspace.getAttribute('data-active-step')).toBe('cable');
  });

  it('initialStep prop nadpisuje domyślny', () => {
    render(<StationWizardWorkspace initialStep="readiness" />);
    const workspace = screen.getByTestId('station-wizard-workspace');
    expect(workspace.getAttribute('data-active-step')).toBe('readiness');
  });

  it('Klik "Dalej" przesuwa do następnego kroku', () => {
    render(<StationWizardWorkspace />);
    fireEvent.click(screen.getByTestId('station-wizard-next'));
    expect(screen.getByTestId('station-wizard-workspace').getAttribute('data-active-step'))
      .toBe('switchgear');
  });

  it('Klik "Wstecz" przesuwa do poprzedniego kroku', () => {
    render(<StationWizardWorkspace initialStep="bays" />);
    fireEvent.click(screen.getByTestId('station-wizard-prev'));
    expect(screen.getByTestId('station-wizard-workspace').getAttribute('data-active-step'))
      .toBe('switchgear');
  });

  it('Przycisk "Wstecz" jest disabled na 1. kroku', () => {
    render(<StationWizardWorkspace initialStep="cable" />);
    const prev = screen.getByTestId('station-wizard-prev');
    expect(prev.hasAttribute('disabled')).toBe(true);
  });

  it('Przycisk "Dalej" na 17. kroku pokazuje "Zakończ kreator"', () => {
    render(<StationWizardWorkspace initialStep="readiness" />);
    const next = screen.getByTestId('station-wizard-next');
    expect(next.textContent).toContain('Zakończ kreator');
  });

  it('Klik "Zakończ kreator" wywołuje onComplete', () => {
    const onComplete = vi.fn();
    render(<StationWizardWorkspace initialStep="readiness" onComplete={onComplete} />);
    fireEvent.click(screen.getByTestId('station-wizard-next'));
    expect(onComplete).toHaveBeenCalled();
  });

  it('onCancel: pokazuje przycisk i wywołuje callback', () => {
    const onCancel = vi.fn();
    render(<StationWizardWorkspace onCancel={onCancel} />);
    const cancelBtn = screen.getByTestId('station-wizard-cancel');
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it('Footer pokazuje "Krok 1 / 17"', () => {
    render(<StationWizardWorkspace />);
    const footer = screen.getByTestId('station-wizard-footer');
    expect(footer.textContent).toContain('Krok');
    expect(footer.textContent).toContain('1');
    expect(footer.textContent).toContain('17');
  });

  it('Przejście przez wszystkie 17 kroków — full flow', () => {
    render(<StationWizardWorkspace />);
    const workspace = screen.getByTestId('station-wizard-workspace');
    expect(workspace.getAttribute('data-active-step')).toBe(STATION_WIZARD_STEPS[0].id);

    // Klik "Dalej" 16 razy aby przejść do ostatniego kroku.
    for (let i = 0; i < STATION_WIZARD_STEPS.length - 1; i++) {
      fireEvent.click(screen.getByTestId('station-wizard-next'));
    }
    expect(workspace.getAttribute('data-active-step')).toBe(
      STATION_WIZARD_STEPS[STATION_WIZARD_STEPS.length - 1].id,
    );
  });

  it('Każdy z 17 kroków jest osiągalny przez klik w sidebarze', () => {
    render(<StationWizardWorkspace />);
    for (const step of STATION_WIZARD_STEPS) {
      const btn = screen.getByTestId(`station-wizard-step-${step.id}`);
      fireEvent.click(btn);
      expect(screen.getByTestId('station-wizard-workspace').getAttribute('data-active-step'))
        .toBe(step.id);
    }
  });

  it('Krok cable wyświetla "Przyłączenie SN" w nagłówku', () => {
    render(<StationWizardWorkspace initialStep="cable" />);
    const matches = screen.getAllByText('Przyłączenie SN');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('Krok protection wyświetla profile zabezpieczeń', () => {
    render(<StationWizardWorkspace initialStep="protection" />);
    expect(screen.getByTestId('step-body-protection')).toBeInTheDocument();
  });

  it('Krok readiness wyświetla macierz gotowości', () => {
    render(<StationWizardWorkspace initialStep="readiness" />);
    expect(screen.getByTestId('step-body-readiness')).toBeInTheDocument();
    expect(screen.getByTestId('readiness-matrix-grid')).toBeInTheDocument();
  });
});
