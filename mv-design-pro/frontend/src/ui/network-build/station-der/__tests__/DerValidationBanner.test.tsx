import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DerValidationBanner } from '../DerValidationBanner';

const fullCompliantChecklist = {
  frtConfigured: true,
  cosPhiProfileConfigured: true,
  qOfUProfileConfigured: true,
  antiIslandingEnabled: true,
  inverterCertified: true,
};

const partialChecklist = {
  frtConfigured: true,
  cosPhiProfileConfigured: true,
  qOfUProfileConfigured: false,
  antiIslandingEnabled: false,
  inverterCertified: true,
};

describe('DerValidationBanner', () => {
  it('OK gdy moc dobra + full NC RfG', () => {
    render(
      <DerValidationBanner
        derPowerKva={400}
        transformerRatedKva={630}
        ncRfgChecklist={fullCompliantChecklist}
      />,
    );
    expect(screen.getByTestId('der-validation-banner-ok')).toBeTruthy();
    expect(screen.getByText(/zgodny z wymaganiami NC RfG/)).toBeTruthy();
  });

  it('warning gdy moc 85% + NC RfG partial', () => {
    render(
      <DerValidationBanner
        derPowerKva={540}
        transformerRatedKva={630}
        ncRfgChecklist={partialChecklist}
      />,
    );
    expect(screen.getByTestId('der-validation-banner-warning')).toBeTruthy();
    expect(screen.getByText(/wymaga uwagi/)).toBeTruthy();
  });

  it('error gdy moc DER > transformator', () => {
    render(
      <DerValidationBanner
        derPowerKva={700}
        transformerRatedKva={630}
        ncRfgChecklist={fullCompliantChecklist}
      />,
    );
    expect(screen.getByTestId('der-validation-banner-error')).toBeTruthy();
    expect(screen.getByText(/niezgodny/)).toBeTruthy();
  });

  it('pokazuje 2 checks (power + NC RfG)', () => {
    render(
      <DerValidationBanner
        derPowerKva={400}
        transformerRatedKva={630}
        ncRfgChecklist={fullCompliantChecklist}
      />,
    );
    expect(screen.getByTestId('der-power-check')).toBeTruthy();
    expect(screen.getByTestId('der-ncrfg-check')).toBeTruthy();
  });

  it('aria-live=polite dla screen reader', () => {
    render(
      <DerValidationBanner
        derPowerKva={400}
        transformerRatedKva={630}
        ncRfgChecklist={fullCompliantChecklist}
      />,
    );
    const banner = screen.getByTestId('der-validation-banner-ok');
    expect(banner.getAttribute('aria-live')).toBe('polite');
  });
});
