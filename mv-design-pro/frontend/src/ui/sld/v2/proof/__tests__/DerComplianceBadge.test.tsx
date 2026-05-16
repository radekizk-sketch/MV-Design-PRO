/**
 * DerComplianceBadge tests (OZE Phase B, NC RFG compliance display).
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DerComplianceBadge } from '../DerComplianceBadge';

function badge(overrides: Partial<React.ComponentProps<typeof DerComplianceBadge>> = {}) {
  return render(
    <DerComplianceBadge
      id="der-1"
      kind="PV"
      name="PV Gronowo 01"
      nominalPowerKw={500}
      ncRfgModule="A"
      compliance="pass"
      {...overrides}
    />,
  );
}

describe('DerComplianceBadge', () => {
  it('renderuje z data-testid', () => {
    badge();
    expect(screen.getByTestId('der-compliance-badge-der-1')).toBeInTheDocument();
  });

  it('pokazuje kind DER i nazwę', () => {
    badge();
    expect(screen.getByTestId('der-compliance-badge-der-1-kind')).toHaveTextContent('PV');
    expect(screen.getByTestId('der-compliance-badge-der-1-name')).toHaveTextContent('PV Gronowo 01');
  });

  it('pokazuje moc nominalną', () => {
    badge();
    expect(screen.getByTestId('der-compliance-badge-der-1-nominal')).toHaveTextContent('500 kW');
  });

  it('pokazuje NC RFG Module A z etykietą', () => {
    badge({ ncRfgModule: 'A' });
    const ncRfg = screen.getByTestId('der-compliance-badge-der-1-nc-rfg');
    expect(ncRfg).toHaveTextContent('NC RFG');
    expect(ncRfg).toHaveTextContent('Moduł A (Mikro)');
  });

  it('pokazuje Module D dla dużych jednostek', () => {
    badge({ ncRfgModule: 'D' });
    expect(screen.getByTestId('der-compliance-badge-der-1-nc-rfg')).toHaveTextContent('Moduł D (B. duże)');
  });

  it('NIE pokazuje NC RFG sekcji gdy ncRfgModule null', () => {
    badge({ ncRfgModule: null });
    expect(screen.queryByTestId('der-compliance-badge-der-1-nc-rfg')).not.toBeInTheDocument();
  });

  it('pokazuje P i cosφ gdy podano operatingPMw + operatingQMvar', () => {
    badge({ operatingPMw: 0.4, operatingQMvar: 0.3 });
    expect(screen.getByTestId('der-compliance-badge-der-1-p')).toHaveTextContent('400 kW');
    // cos φ = 0.4 / sqrt(0.4² + 0.3²) = 0.4 / 0.5 = 0.80
    expect(screen.getByTestId('der-compliance-badge-der-1-cos-phi')).toHaveTextContent('0.80');
  });

  it('NIE pokazuje punktu pracy gdy brak operatingPMw', () => {
    badge({ operatingPMw: null });
    expect(screen.queryByTestId('der-compliance-badge-der-1-operating')).not.toBeInTheDocument();
  });

  it('status ZGODNY dla compliance=pass', () => {
    badge({ compliance: 'pass' });
    expect(screen.getByTestId('der-compliance-badge-der-1-status')).toHaveTextContent('ZGODNY');
  });

  it('status NIEZGODNY dla compliance=fail', () => {
    badge({ compliance: 'fail' });
    expect(screen.getByTestId('der-compliance-badge-der-1-status')).toHaveTextContent('NIEZGODNY');
  });

  it('status NIEOKREŚLONY dla compliance=unknown (default)', () => {
    badge({ compliance: 'unknown' });
    expect(screen.getByTestId('der-compliance-badge-der-1-status')).toHaveTextContent('NIEOKREŚLONY');
  });

  it('BESS kind renderuje poprawnie', () => {
    badge({ kind: 'BESS', name: 'BESS Magazyn' });
    expect(screen.getByTestId('der-compliance-badge-der-1-kind')).toHaveTextContent('BESS');
    expect(screen.getByTestId('der-compliance-badge-der-1-name')).toHaveTextContent('BESS Magazyn');
  });
});
