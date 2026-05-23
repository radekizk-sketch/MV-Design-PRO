import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  NcRfgComplianceBadge,
  evaluateNcRfgCompliance,
} from '../NcRfgComplianceBadge';

describe('evaluateNcRfgCompliance', () => {
  it('wszystkie 5 wymagań → compliant', () => {
    const result = evaluateNcRfgCompliance({
      frtConfigured: true,
      cosPhiProfileConfigured: true,
      qOfUProfileConfigured: true,
      antiIslandingEnabled: true,
      inverterCertified: true,
    });
    expect(result.status).toBe('compliant');
    expect(result.passedCount).toBe(5);
    expect(result.missing).toHaveLength(0);
  });

  it('3-4 wymagania → audit_required', () => {
    const result = evaluateNcRfgCompliance({
      frtConfigured: true,
      cosPhiProfileConfigured: true,
      qOfUProfileConfigured: true,
      antiIslandingEnabled: false,
      inverterCertified: false,
    });
    expect(result.status).toBe('audit_required');
    expect(result.passedCount).toBe(3);
    expect(result.missing).toHaveLength(2);
  });

  it('< 3 wymagania → non_compliant', () => {
    const result = evaluateNcRfgCompliance({
      frtConfigured: true,
      cosPhiProfileConfigured: true,
      qOfUProfileConfigured: false,
      antiIslandingEnabled: false,
      inverterCertified: false,
    });
    expect(result.status).toBe('non_compliant');
    expect(result.passedCount).toBe(2);
  });

  it('0 wymagań → non_compliant', () => {
    const result = evaluateNcRfgCompliance({
      frtConfigured: false,
      cosPhiProfileConfigured: false,
      qOfUProfileConfigured: false,
      antiIslandingEnabled: false,
      inverterCertified: false,
    });
    expect(result.status).toBe('non_compliant');
    expect(result.missing).toHaveLength(5);
  });
});

describe('NcRfgComplianceBadge', () => {
  it('renderuje status compliant', () => {
    render(
      <NcRfgComplianceBadge
        checklist={{
          frtConfigured: true,
          cosPhiProfileConfigured: true,
          qOfUProfileConfigured: true,
          antiIslandingEnabled: true,
          inverterCertified: true,
        }}
      />,
    );
    expect(screen.getByTestId('nc-rfg-badge-compliant')).toBeTruthy();
    expect(screen.getByText('Zgodny NC RfG')).toBeTruthy();
  });

  it('renderuje status audit_required', () => {
    render(
      <NcRfgComplianceBadge
        checklist={{
          frtConfigured: true,
          cosPhiProfileConfigured: true,
          qOfUProfileConfigured: true,
          antiIslandingEnabled: false,
          inverterCertified: false,
        }}
      />,
    );
    expect(screen.getByTestId('nc-rfg-badge-audit_required')).toBeTruthy();
    expect(screen.getByText('Wymaga audytu')).toBeTruthy();
  });

  it('renderuje status non_compliant', () => {
    render(
      <NcRfgComplianceBadge
        checklist={{
          frtConfigured: false,
          cosPhiProfileConfigured: false,
          qOfUProfileConfigured: false,
          antiIslandingEnabled: false,
          inverterCertified: false,
        }}
      />,
    );
    expect(screen.getByTestId('nc-rfg-badge-non_compliant')).toBeTruthy();
    expect(screen.getByText('Niezgodny')).toBeTruthy();
  });

  it('tooltip pokazuje brakujące elementy', () => {
    render(
      <NcRfgComplianceBadge
        checklist={{
          frtConfigured: false,
          cosPhiProfileConfigured: true,
          qOfUProfileConfigured: true,
          antiIslandingEnabled: true,
          inverterCertified: true,
        }}
      />,
    );
    const badge = screen.getByTestId('nc-rfg-badge-audit_required');
    expect(badge.getAttribute('title')).toContain('FRT');
  });

  it('aria-label zawiera info dla a11y', () => {
    render(
      <NcRfgComplianceBadge
        checklist={{
          frtConfigured: true,
          cosPhiProfileConfigured: true,
          qOfUProfileConfigured: true,
          antiIslandingEnabled: true,
          inverterCertified: true,
        }}
      />,
    );
    const badge = screen.getByLabelText(/Status NC RfG/);
    expect(badge).toBeTruthy();
  });
});
