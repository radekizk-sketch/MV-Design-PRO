import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StationWizardSurface } from '../StationWizardSurface';

describe('StationWizardSurface — wrapper standalone', () => {
  it('renderuje StationWizardWorkspace', () => {
    render(<StationWizardSurface />);
    expect(screen.getByTestId('station-wizard-surface')).toBeInTheDocument();
    expect(screen.getByTestId('station-wizard-workspace')).toBeInTheDocument();
  });

  it('Domyślnie startuje od kroku cable', () => {
    render(<StationWizardSurface />);
    const ws = screen.getByTestId('station-wizard-workspace');
    expect(ws.getAttribute('data-active-step')).toBe('cable');
  });

  it('initialStep prop nadpisuje', () => {
    render(<StationWizardSurface initialStep="readiness" />);
    expect(screen.getByTestId('station-wizard-workspace').getAttribute('data-active-step'))
      .toBe('readiness');
  });

  it('Anuluj/Zakończ buttons istnieją (route SLD navigation)', () => {
    render(<StationWizardSurface />);
    expect(screen.getByTestId('station-wizard-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('station-wizard-next')).toBeInTheDocument();
  });
});
