/**
 * PR-13 — Testy BuildSidebar (4 sekcje) + SldCommandService.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BuildSidebar } from '../BuildSidebar';
import { BuilderSection } from '../BuilderSection';
import { LayersSection } from '../LayersSection';
import { NavigatorSection } from '../NavigatorSection';
import { ReadinessSection, DEFAULT_READINESS_ITEMS } from '../ReadinessSection';

describe('BuildSidebar — 4 sekcje', () => {
  it('renderuje 4 zakładki z polskimi etykietami', () => {
    render(
      <BuildSidebar
        navigator={{ nodes: [] }}
        builder={{
          buildPhase: 'NO_SOURCE',
          context: { projectName: 'Test' },
          nextSteps: [],
          blockers: [],
          modelStats: { gpzCount: 0, bayCount: 0, cableSegmentCount: 0, stationCount: 0, derSourceCount: 0, bessCount: 0, missingDataCount: 0 },
        }}
        layers={{ visibility: {}, onToggle: vi.fn() }}
        readiness={{ items: [] }}
      />,
    );
    expect(screen.getByTestId('build-sidebar-tab-nawigator')).toHaveTextContent('Nawigator');
    expect(screen.getByTestId('build-sidebar-tab-budowa')).toHaveTextContent('Budowa');
    expect(screen.getByTestId('build-sidebar-tab-warstwy')).toHaveTextContent('Warstwy');
    expect(screen.getByTestId('build-sidebar-tab-gotowosc')).toHaveTextContent('Gotowość');
  });

  it('klik zakładki przełącza content', () => {
    render(
      <BuildSidebar
        navigator={{ nodes: [{ id: 'n1', labelPl: 'Test Node' }] }}
        builder={{
          buildPhase: 'HAS_SOURCE',
          context: { projectName: 'Projekt X' },
          nextSteps: [],
          blockers: [],
          modelStats: { gpzCount: 1, bayCount: 0, cableSegmentCount: 0, stationCount: 0, derSourceCount: 0, bessCount: 0, missingDataCount: 0 },
        }}
        layers={{ visibility: {}, onToggle: vi.fn() }}
        readiness={{ items: [] }}
      />,
    );

    expect(screen.getByTestId('build-sidebar-content-nawigator')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('build-sidebar-tab-budowa'));
    expect(screen.getByTestId('build-sidebar-content-budowa')).toBeInTheDocument();
    expect(screen.getByText(/Projekt X/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('build-sidebar-tab-warstwy'));
    expect(screen.getByTestId('build-sidebar-content-warstwy')).toBeInTheDocument();
  });
});

describe('NavigatorSection', () => {
  it('puste drzewo pokazuje hint pierwszej akcji (brief §15 Scenariusz A)', () => {
    render(<NavigatorSection nodes={[]} />);
    expect(screen.getByText(/Wstaw główny punkt zasilania/)).toBeInTheDocument();
  });

  it('renderuje hierarchiczne drzewo z badge statusu', () => {
    render(
      <NavigatorSection
        nodes={[
          {
            id: 'gpz_1',
            labelPl: 'GPZ Główny',
            badge: 'kompletne',
            children: [
              { id: 'sec_1', labelPl: 'Sekcja I', badge: 'kompletne' },
              { id: 'sec_2', labelPl: 'Sekcja II', badge: 'wynik-czesciowy' },
            ],
          },
          { id: 'der_pv_1', labelPl: 'PV-01', badge: 'brak-danych', count: 1 },
        ]}
      />,
    );
    expect(screen.getByTestId('nav-node-gpz_1')).toBeInTheDocument();
    expect(screen.getByTestId('nav-node-sec_1')).toBeInTheDocument();
    expect(screen.getByTestId('nav-badge-der_pv_1')).toHaveAttribute('title', 'brak danych');
    expect(screen.getByText(/PV-01/)).toBeInTheDocument();
  });

  it('klik węzła wywołuje onSelect', () => {
    const onSelect = vi.fn();
    render(
      <NavigatorSection
        nodes={[{ id: 'st_1', labelPl: 'Stacja' }]}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId('nav-node-st_1'));
    expect(onSelect).toHaveBeenCalledWith('st_1');
  });
});

describe('BuilderSection — Dock projektanta', () => {
  it('pokazuje BuildPhase chip + następne kroki + blokady', () => {
    render(
      <BuilderSection
        buildPhase="HAS_TRUNKS"
        context={{ projectName: 'Test', gpzName: 'GPZ-01', snVoltageKv: 15 }}
        nextSteps={[
          { id: 'add-station', labelPl: 'Wstaw stację', descriptionPl: 'na kablu', onClick: vi.fn() },
        ]}
        blockers={[
          { id: 'b1', labelPl: 'Brak transformatora', severityPl: 'błąd' },
        ]}
        modelStats={{ gpzCount: 1, bayCount: 4, cableSegmentCount: 2, stationCount: 0, derSourceCount: 0, bessCount: 0, missingDataCount: 1 }}
      />,
    );
    expect(screen.getByTestId('builder-phase-chip')).toHaveTextContent('Ciągi wyprowadzone');
    expect(screen.getByTestId('builder-next-add-station')).toBeInTheDocument();
    expect(screen.getByTestId('builder-blocker-b1')).toHaveTextContent('Brak transformatora');
    expect(screen.getByText(/Pola SN:/)).toBeInTheDocument();
  });

  it('next step disabled nie reaguje na click', () => {
    const onClick = vi.fn();
    render(
      <BuilderSection
        buildPhase="NO_SOURCE"
        context={{ projectName: 'T' }}
        nextSteps={[{ id: 's1', labelPl: 'Akcja', disabled: true, onClick }]}
        blockers={[]}
        modelStats={{ gpzCount: 0, bayCount: 0, cableSegmentCount: 0, stationCount: 0, derSourceCount: 0, bessCount: 0, missingDataCount: 0 }}
      />,
    );
    fireEvent.click(screen.getByTestId('builder-next-s1'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('blocker z onShowOnSld + onFix renderuje oba przyciski', () => {
    const onShow = vi.fn();
    const onFix = vi.fn();
    render(
      <BuilderSection
        buildPhase="HAS_STATIONS"
        context={{ projectName: 'T' }}
        nextSteps={[]}
        blockers={[{ id: 'b1', labelPl: 'Blokada', severityPl: 'ostrzeżenie', onShowOnSld: onShow, onFix }]}
        modelStats={{ gpzCount: 1, bayCount: 1, cableSegmentCount: 1, stationCount: 1, derSourceCount: 0, bessCount: 0, missingDataCount: 0 }}
      />,
    );
    fireEvent.click(screen.getByTestId('builder-show-sld-b1'));
    expect(onShow).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('builder-fix-b1'));
    expect(onFix).toHaveBeenCalled();
  });
});

describe('LayersSection — 13 warstw widoczności', () => {
  it('renderuje 13 toggleable warstw', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <LayersSection visibility={{}} onToggle={onToggle} />,
    );
    const toggles = container.querySelectorAll('[data-testid^="layer-toggle-"]');
    expect(toggles.length).toBe(13);
  });

  it('default visibility: equipment ON, measurements OFF, der ON', () => {
    const { getByTestId } = render(<LayersSection visibility={{}} onToggle={vi.fn()} />);
    expect(getByTestId('layer-toggle-equipment').getAttribute('data-visible')).toBe('true');
    expect(getByTestId('layer-toggle-measurements').getAttribute('data-visible')).toBe('false');
    expect(getByTestId('layer-toggle-der').getAttribute('data-visible')).toBe('true');
  });

  it('toggle wywołuje callback z layer ID i nowym stanem', () => {
    const onToggle = vi.fn();
    const { container } = render(<LayersSection visibility={{ measurements: false }} onToggle={onToggle} />);
    const measurementsToggle = container.querySelector('[data-testid="layer-toggle-measurements"] input') as HTMLInputElement;
    fireEvent.click(measurementsToggle);
    expect(onToggle).toHaveBeenCalledWith('measurements', true);
  });
});

describe('ReadinessSection — 9 typów obliczeń + raporty', () => {
  it('renderuje 10 default items (rozpływ, napięcia, zwarcia, asymetria, obciążalność, stabilność, FRT, NC RfG, raport OSD, raport techniczny)', () => {
    expect(DEFAULT_READINESS_ITEMS.length).toBe(10);
    const labels = DEFAULT_READINESS_ITEMS.map((i) => i.labelPl);
    expect(labels).toContain('Rozpływ mocy');
    expect(labels).toContain('Stabilność');
    expect(labels).toContain('FRT / LVRT / HVRT');
    expect(labels).toContain('Zgodność przyłączeniowa');
    expect(labels).toContain('Raport OSD');
    expect(labels).toContain('Raport techniczny');
  });

  it('renderuje status item z polską etykietą', () => {
    render(
      <ReadinessSection
        items={[
          { id: 'pf', labelPl: 'Rozpływ mocy', status: 'gotowe' },
          { id: 'stab', labelPl: 'Stabilność', status: 'brak-modulu' },
          { id: 'sc', labelPl: 'Zwarcia', status: 'czesciowe', missingFieldsPl: ['Sk"', 'Z_thev'] },
        ]}
      />,
    );
    expect(screen.getByTestId('readiness-item-pf')).toHaveAttribute('data-status', 'gotowe');
    expect(screen.getByTestId('readiness-item-stab')).toHaveTextContent('brak modułu obliczeniowego');
    expect(screen.getByTestId('readiness-item-sc')).toHaveTextContent('częściowe');
    expect(screen.getByText(/Brakuje: Sk"/)).toBeInTheDocument();
  });

  it('klik "Pokaż na SLD" wywołuje callback', () => {
    const onShow = vi.fn();
    render(
      <ReadinessSection
        items={[{ id: 'pf', labelPl: 'Rozpływ mocy', status: 'czesciowe', onShowOnSld: onShow }]}
      />,
    );
    fireEvent.click(screen.getByTestId('readiness-show-sld-pf'));
    expect(onShow).toHaveBeenCalled();
  });
});
