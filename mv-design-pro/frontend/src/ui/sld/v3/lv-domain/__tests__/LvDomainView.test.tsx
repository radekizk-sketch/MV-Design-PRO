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

  // T5b-2 (P0.14 BINDING): "Nagłówek OPISUJE DOMENĘ (…); parametry Sn/uk/
  // grupa przy T1/T2, nie w nagłówku widoku" — tabliczka TR przeniesiona na
  // WĘZEŁ transformatora w scenie (kanon zmieniony, poprzedni test wymuszał
  // dokładnie to, co werdykt odrzucił: parametry TR w nagłówku).
  it('nagłówek OPISUJE DOMENĘ (napięcie/liczba TR/sekcji/DER/boundary), NIE niesie już tabliczki TR', () => {
    render(
      <LvDomainView
        rootStationId="root"
        scenarioId="scenario-demo"
        view={MULTI_SOURCE_DOMAIN_VIEW}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
      />,
    );
    const descriptor = screen.getByTestId('lv-domain-descriptor').textContent;
    expect(descriptor).toContain('0.4 kV');
    expect(descriptor).toContain('2×TR');
    expect(descriptor).toContain('PV');
    expect(descriptor).toContain('boundary');
    expect(screen.queryByTestId('lv-domain-tr-nameplate')).toBeNull();
  });

  it('tabliczka TR (Sn·przekładnia·grupa·uk%) żyje NA WĘŹLE transformatora w scenie (P0.14)', () => {
    render(
      <LvDomainView
        rootStationId="root"
        scenarioId="scenario-demo"
        view={MULTI_SOURCE_DOMAIN_VIEW}
        upstreamEquivalents={MULTI_SOURCE_UPSTREAM_EQUIVALENTS}
      />,
    );
    const tr1Node = screen.getByTestId('lv-domain-node-tr1');
    expect(tr1Node.textContent).toContain('Dyn11');
    // T5b-4 (werdykt pkt 4): blok TR w hierarchii — „uk = 4%" (format
    // właściciela) jako linia SECONDARY; intencja pinu bez zmian (uk
    // widoczne na węźle TR, nie w nagłówku).
    expect(tr1Node.textContent).toContain('uk = 4%');
    expect(tr1Node.textContent).toContain('630 kVA');
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
    // T5b-2 (P0.10/P0.17 BINDING): overlay aktywny BEZ danych podanych przez
    // wołającego (`swzByFeederRef` niepodany) MUSI powiedzieć to WPROST —
    // zero cichego "Nakładka: SWZ" sugerującego dane, których nie ma
    // (uczciwy stan zerowy, nie fabrykacja ciszą).
    expect(screen.getByTestId('lv-domain-overlay-status').textContent).toBe('Nakładka: SWZ · brak wyniku (uruchom bieg)');
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
