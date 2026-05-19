import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { StationWizardSidebar } from '../StationWizardSidebar';
import { STATION_WIZARD_STEPS, type StationWizardStepId } from '../stationWizardContract';

describe('StationWizardSidebar — skeleton komponentu nawigacji', () => {
  it('renderuje wszystkie 17 kroków w 7 grupach', () => {
    render(
      <StationWizardSidebar activeStep="cable" onSelectStep={() => {}} />,
    );
    for (const step of STATION_WIZARD_STEPS) {
      expect(screen.getByTestId(`station-wizard-step-${step.id}`)).toBeInTheDocument();
    }
  });

  it('renderuje 7 nagłówków grup', () => {
    const { container } = render(
      <StationWizardSidebar activeStep="cable" onSelectStep={() => {}} />,
    );
    const groupHeaders = container.querySelectorAll('[data-testid^="station-wizard-group-"]');
    expect(groupHeaders.length).toBe(7);
  });

  it('aktywny krok ma data-step-active="true"', () => {
    render(
      <StationWizardSidebar activeStep="protection" onSelectStep={() => {}} />,
    );
    const active = screen.getByTestId('station-wizard-step-protection');
    expect(active.getAttribute('data-step-active')).toBe('true');
    expect(active.getAttribute('aria-current')).toBe('step');
  });

  it('inne kroki mają data-step-active="false"', () => {
    render(
      <StationWizardSidebar activeStep="protection" onSelectStep={() => {}} />,
    );
    const inactive = screen.getByTestId('station-wizard-step-cable');
    expect(inactive.getAttribute('data-step-active')).toBe('false');
    expect(inactive.getAttribute('aria-current')).toBeNull();
  });

  it('klik kroku wywołuje onSelectStep z poprawnym ID', () => {
    const handler = vi.fn();
    render(
      <StationWizardSidebar activeStep="cable" onSelectStep={handler} />,
    );
    fireEvent.click(screen.getByTestId('station-wizard-step-protection'));
    expect(handler).toHaveBeenCalledWith('protection');
  });

  it('ukończone kroki mają data-step-completed="true" i znak ✓', () => {
    const completed = new Set<StationWizardStepId>(['cable', 'switchgear']);
    render(
      <StationWizardSidebar
        activeStep="bays"
        onSelectStep={() => {}}
        completedSteps={completed}
      />,
    );
    const cableStep = screen.getByTestId('station-wizard-step-cable');
    expect(cableStep.getAttribute('data-step-completed')).toBe('true');
    expect(cableStep.textContent).toContain('✓');
  });

  it('kroki z błędem mają data-step-error="true" i znak !', () => {
    const errors = new Set<StationWizardStepId>(['ct']);
    render(
      <StationWizardSidebar
        activeStep="bays"
        onSelectStep={() => {}}
        errorSteps={errors}
      />,
    );
    const ctStep = screen.getByTestId('station-wizard-step-ct');
    expect(ctStep.getAttribute('data-step-error')).toBe('true');
    expect(ctStep.textContent).toContain('!');
  });

  it('density="compact" → szerokość 240px, brak sub-label', () => {
    const { container } = render(
      <StationWizardSidebar activeStep="cable" onSelectStep={() => {}} density="compact" />,
    );
    const nav = container.querySelector('[data-testid="station-wizard-sidebar"]');
    expect(nav?.className).toContain('w-[240px]');
  });

  it('density="comfortable" → szerokość 320px, sub-label widoczny', () => {
    const { container } = render(
      <StationWizardSidebar activeStep="cable" onSelectStep={() => {}} density="comfortable" />,
    );
    const nav = container.querySelector('[data-testid="station-wizard-sidebar"]');
    expect(nav?.className).toContain('w-[320px]');
    // Sub-label z definicji jest widoczny w trybie comfortable.
    expect(screen.getByText('Kabel + termika + ΔU')).toBeInTheDocument();
  });

  it('aria-label każdego kroku zawiera numer + label + sub', () => {
    render(
      <StationWizardSidebar activeStep="cable" onSelectStep={() => {}} />,
    );
    const step = screen.getByTestId('station-wizard-step-cable');
    const ariaLabel = step.getAttribute('aria-label') ?? '';
    expect(ariaLabel).toContain('Krok 1');
    expect(ariaLabel).toContain('Przyłączenie SN');
    expect(ariaLabel).toContain('Kabel + termika + ΔU');
  });

  it('nawigacja jest dostępna semantycznie (role nav + aria-label PL)', () => {
    render(
      <StationWizardSidebar activeStep="cable" onSelectStep={() => {}} />,
    );
    const nav = screen.getByRole('navigation', { name: 'Kreator Stacji — nawigacja kroków' });
    expect(nav).toBeInTheDocument();
  });
});
