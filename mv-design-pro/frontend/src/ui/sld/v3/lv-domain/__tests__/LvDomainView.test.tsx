/**
 * `LvDomainView` — smoke + kontrakt (karta T5b, §0 rozstrzygnięcie 3).
 * Renderuje fixturę wieloźródłową bez wyjątków, pokazuje tabliczkę TR w
 * nagłówku, OBIE kotwice SN, boundary chip, i przełącznik overlay ZAMKNIĘTY
 * na kanałach z realnym dostawcą (zero phantom — Termika/Selektywność nie
 * mają przycisku).
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_UPSTREAM_EQUIVALENTS } from '../fixtures/multiSourceDomain';
import type { LvDomainGraphView } from '../types';

describe('LvDomainView — render fixtury wieloźródłowej', () => {
  it('renderuje bez wyjątków, status ok', () => {
    render(
      <LvDomainView
        rootStationId="root"
        scenarioId="scenario-demo"
        view={MULTI_SOURCE_DOMAIN_VIEW}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
      />,
    );
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-status', 'ok');
  });

  it('nagłówek pokazuje tabliczkę TR (Sn·przekładnia·grupa·uk%)', () => {
    render(
      <LvDomainView
        rootStationId="root"
        scenarioId="scenario-demo"
        view={MULTI_SOURCE_DOMAIN_VIEW}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
      />,
    );
    expect(screen.getByTestId('lv-domain-tr-nameplate').textContent).toContain('Dyn11');
    expect(screen.getByTestId('lv-domain-tr-nameplate').textContent).toContain('uk=4%');
  });

  it('OBIE kotwice SN (2×TR) i boundary chip są w DOM', () => {
    render(
      <LvDomainView
        rootStationId="root"
        scenarioId="scenario-demo"
        view={MULTI_SOURCE_DOMAIN_VIEW}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
      />,
    );
    expect(screen.getByTestId('lv-domain-node-anchor:tr1')).toBeTruthy();
    expect(screen.getByTestId('lv-domain-node-anchor:tr2')).toBeTruthy();
    expect(screen.getByTestId('lv-domain-node-boundary:tie_to_other').textContent).toContain('Stacja OBCA');
  });

  it('przełącznik overlay ma WYŁĄCZNIE kanały z realnym dostawcą (zero phantom)', () => {
    render(
      <LvDomainView
        rootStationId="root"
        scenarioId="scenario-demo"
        view={MULTI_SOURCE_DOMAIN_VIEW}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
      />,
    );
    expect(screen.getByTestId('lv-domain-overlay-loads')).toBeTruthy();
    expect(screen.getByTestId('lv-domain-overlay-voltageDrop')).toBeTruthy();
    expect(screen.getByTestId('lv-domain-overlay-shortCircuit')).toBeTruthy();
    expect(screen.getByTestId('lv-domain-overlay-swz')).toBeTruthy();
    expect(screen.queryByText('Termika')).toBeNull();
    expect(screen.queryByText('Selektywność')).toBeNull();
  });

  it('domyślnie SLD jest czysty (bez nakładki) — klik przełącza stan widoczny', () => {
    render(
      <LvDomainView
        rootStationId="root"
        scenarioId="scenario-demo"
        view={MULTI_SOURCE_DOMAIN_VIEW}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
      />,
    );
    expect(screen.getByTestId('lv-domain-overlay-status').textContent).toBe('SLD czysty (bez nakładki)');
    fireEvent.click(screen.getByTestId('lv-domain-overlay-swz'));
    expect(screen.getByTestId('lv-domain-overlay-status').textContent).toBe('Nakładka: SWZ');
  });

  it('stan brak danych renderuje komunikat honest, zero wyjątku', () => {
    const brakDanychView: LvDomainGraphView = {
      status: 'brak danych',
      station_ref: 'nieznana',
      buses: [],
      branches: [],
      transformers: [],
      generators: [],
      loads: [],
      sub_switchboards: [],
      boundary_links: [],
      missing_data: ['station'],
    };
    render(<LvDomainView rootStationId="nieznana" scenarioId="scenario-demo" view={brakDanychView} />);
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-status', 'brak-danych');
  });
});
