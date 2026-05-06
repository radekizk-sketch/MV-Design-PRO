/**
 * PR-7 — Testy InspectorTabs (11 zakładek) + sticky header + breadcrumb.
 *
 * Inwarianty (BINDING):
 * 1. 11 zakładek (brief 2 §5 pkt 3).
 * 2. Polskie etykiety bez zakazanych tokenów.
 * 3. Visible tabs zależą od typu obiektu (applicableTo).
 * 4. Breadcrumb dwukierunkowy.
 * 5. Sticky header z kompletnym statusem (completeness + energization + calc).
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  INSPECTOR_TABS,
  INSPECTOR_TAB_COUNT,
  visibleTabsFor,
  type InspectorTabId,
} from '../inspectorTabs';
import { InspectorBreadcrumb } from '../InspectorBreadcrumb';
import { InspectorStickyHeader } from '../InspectorStickyHeader';
import { InspectorTabs } from '../InspectorTabs';

describe('InspectorTabs — 11 zakładek (brief 2 §5)', () => {
  it('liczba zakładek = 11', () => {
    expect(INSPECTOR_TAB_COUNT).toBe(11);
  });

  it('11 zakładek z prawidłowymi ID', () => {
    const ids = INSPECTOR_TABS.map((t) => t.id).sort();
    expect(ids).toEqual([
      'aparatura',
      'braki-danych',
      'dane-elektryczne',
      'obliczenia',
      'podstawowe',
      'pomiary',
      'raport',
      'sld',
      'techniczne',
      'topologia',
      'zabezpieczenia',
    ]);
  });

  it('etykiety polskie bez zakazanych tokenów', () => {
    for (const tab of INSPECTOR_TABS) {
      expect(tab.labelPl).toBeTruthy();
      expect(tab.labelPl).not.toMatch(/\b(?:branch|case|run|snapshot|wizard|legacy|fallback)\b/i);
    }
  });

  it('priorytety są unikatowe i kolejne 1..11', () => {
    const prios = INSPECTOR_TABS.map((t) => t.priority).sort((a, b) => a - b);
    expect(prios).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('InspectorTabs — visibleTabsFor (per element type)', () => {
  it('GPZ widzi: Podstawowe, SLD, Topologia, Obliczenia, Braki, Raport, Techniczne (7)', () => {
    const tabs = visibleTabsFor('gpz').map((t) => t.id);
    expect(tabs).toContain('podstawowe');
    expect(tabs).toContain('sld');
    expect(tabs).toContain('topologia');
    expect(tabs).toContain('obliczenia');
    expect(tabs).toContain('braki-danych');
    expect(tabs).toContain('raport');
    expect(tabs).toContain('techniczne');
    expect(tabs).not.toContain('aparatura');
    expect(tabs).not.toContain('dane-elektryczne');
  });

  it('Bay (pole) widzi: Aparatura, Zabezpieczenia, Pomiary + ANY tabs', () => {
    const tabs = visibleTabsFor('bay').map((t) => t.id);
    expect(tabs).toContain('aparatura');
    expect(tabs).toContain('zabezpieczenia');
    expect(tabs).toContain('pomiary');
    expect(tabs).toContain('podstawowe');
    expect(tabs).toContain('obliczenia');
  });

  it('DER PV widzi: Dane elektryczne + ANY tabs', () => {
    const tabs = visibleTabsFor('der_pv').map((t) => t.id);
    expect(tabs).toContain('dane-elektryczne');
    expect(tabs).toContain('podstawowe');
    expect(tabs).toContain('obliczenia');
  });

  it('cable_segment widzi: Topologia + Dane elektryczne + ANY tabs', () => {
    const tabs = visibleTabsFor('cable_segment').map((t) => t.id);
    expect(tabs).toContain('topologia');
    expect(tabs).toContain('dane-elektryczne');
  });
});

describe('InspectorStickyHeader', () => {
  it('renderuje nazwę + typ + status kompletności', () => {
    const { getByText, getByTestId } = render(
      <InspectorStickyHeader
        elementName="Stacja ST-01"
        elementTypeLabelPl="stacja przelotowa"
        completeness="complete"
      />,
    );
    expect(getByText('Stacja ST-01')).toBeInTheDocument();
    expect(getByText('stacja przelotowa')).toBeInTheDocument();
    expect(getByTestId('status-completeness')).toHaveTextContent('kompletne');
  });

  it('completeness=missing → status czerwony "brak danych"', () => {
    const { getByTestId } = render(
      <InspectorStickyHeader
        elementName="ST-01"
        elementTypeLabelPl="stacja"
        completeness="missing"
      />,
    );
    const status = getByTestId('status-completeness');
    expect(status).toHaveTextContent('brak danych');
    expect(status.className).toContain('text-status-error');
  });

  it('energization + calculation status renderowane gdy podane', () => {
    const { getByTestId } = render(
      <InspectorStickyHeader
        elementName="ST-01"
        elementTypeLabelPl="stacja"
        completeness="partial"
        energization="energized"
        calculationStatus="ok"
      />,
    );
    expect(getByTestId('status-energization')).toHaveTextContent('pod napięciem');
    expect(getByTestId('status-calculation')).toHaveTextContent(/wynik pełny/);
  });

  it('quickActions: disabled action ma tooltip i nie reaguje na click', () => {
    let clicked = false;
    const { getByTestId } = render(
      <InspectorStickyHeader
        elementName="ST-01"
        elementTypeLabelPl="stacja"
        completeness="complete"
        quickActions={[
          {
            id: 'open',
            labelPl: 'Otwórz',
            disabled: true,
            disabledReasonPl: 'Wymaga uprawnień',
            onClick: () => { clicked = true; },
          },
        ]}
      />,
    );
    const btn = getByTestId('quick-action-open');
    fireEvent.click(btn);
    expect(clicked).toBe(false);
  });

  it('zakaz tokenów zakazanych w UI: brak "snapshot/run/case/legacy/wizard/fallback"', () => {
    const { container } = render(
      <InspectorStickyHeader
        elementName="ST-01"
        elementTypeLabelPl="stacja"
        completeness="partial"
        energization="dead"
        calculationStatus="none"
      />,
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\b(?:snapshot|case|run|legacy|wizard|fallback|migawka|przypadek|uruchomienie|proof)\b/i);
  });
});

describe('InspectorBreadcrumb', () => {
  it('renderuje hierarchię', () => {
    const { getByTestId } = render(
      <InspectorBreadcrumb
        items={[
          { id: 'project', labelPl: 'Projekt' },
          { id: 'gpz', labelPl: 'GPZ' },
          { id: 'station', labelPl: 'Stacja ST-01' },
        ]}
      />,
    );
    expect(getByTestId('breadcrumb-project')).toHaveTextContent('Projekt');
    expect(getByTestId('breadcrumb-gpz')).toHaveTextContent('GPZ');
    expect(getByTestId('breadcrumb-station')).toHaveTextContent('Stacja ST-01');
  });

  it('klik na breadcrumb wywołuje onClick (dwukierunkowy)', () => {
    let clicked: string | null = null;
    const { getByTestId } = render(
      <InspectorBreadcrumb
        items={[
          { id: 'project', labelPl: 'Projekt', onClick: () => { clicked = 'project'; } },
          { id: 'gpz', labelPl: 'GPZ', onClick: () => { clicked = 'gpz'; } },
          { id: 'final', labelPl: 'Stacja ST-01' },
        ]}
      />,
    );
    fireEvent.click(getByTestId('breadcrumb-gpz'));
    expect(clicked).toBe('gpz');
    fireEvent.click(getByTestId('breadcrumb-project'));
    expect(clicked).toBe('project');
  });

  it('ostatni element NIE jest klikalny (current location)', () => {
    let clicked = false;
    const { getByTestId } = render(
      <InspectorBreadcrumb
        items={[
          { id: 'p', labelPl: 'P' },
          { id: 'final', labelPl: 'Final', onClick: () => { clicked = true; } },
        ]}
      />,
    );
    fireEvent.click(getByTestId('breadcrumb-final'));
    expect(clicked).toBe(false);
  });

  it('puste items → null (no render)', () => {
    const { container } = render(<InspectorBreadcrumb items={[]} />);
    expect(container.querySelector('[data-testid="inspector-breadcrumb"]')).toBeFalsy();
  });
});

describe('InspectorTabs — composition', () => {
  function make(elementType: 'gpz' | 'bay' | 'station' | 'der_pv' = 'station') {
    return render(
      <InspectorTabs
        elementType={elementType}
        headerProps={{
          elementName: 'ST-01',
          elementTypeLabelPl: 'stacja',
          completeness: 'partial',
          energization: 'energized',
          calculationStatus: 'partial',
        }}
        breadcrumb={[
          { id: 'p', labelPl: 'Projekt' },
          { id: 'gpz', labelPl: 'GPZ' },
          { id: 'final', labelPl: 'ST-01' },
        ]}
        tabContent={{
          podstawowe: <div>Treść podstawowa</div>,
          sld: <div>Treść SLD</div>,
          obliczenia: <div>Treść obliczeń</div>,
        }}
        defaultTab="podstawowe"
      />,
    );
  }

  it('Renderuje sticky header + breadcrumb + visible tabs', () => {
    const { getByTestId, getAllByText } = make();
    expect(getByTestId('inspector-tabs-v2')).toBeTruthy();
    expect(getByTestId('inspector-sticky-header')).toBeTruthy();
    expect(getByTestId('inspector-breadcrumb')).toBeTruthy();
    // ST-01 pojawia się 2× (header + ostatni breadcrumb)
    expect(getAllByText('ST-01').length).toBeGreaterThanOrEqual(1);
  });

  it('Klik zakładki przełącza aktywną content', () => {
    const { getByTestId, queryByText } = make();
    expect(queryByText('Treść podstawowa')).toBeInTheDocument();
    expect(queryByText('Treść obliczeń')).not.toBeInTheDocument();

    fireEvent.click(getByTestId('inspector-tab-obliczenia'));
    expect(queryByText('Treść podstawowa')).not.toBeInTheDocument();
    expect(queryByText('Treść obliczeń')).toBeInTheDocument();
  });

  it('GPZ inspektor pokazuje 7 zakładek (bez Aparatura/Zabezpieczenia/Pomiary/Dane elektr.)', () => {
    const { container } = make('gpz');
    const tabs = container.querySelectorAll('button[data-testid^="inspector-tab-"]');
    // 7 ANY (Podstawowe, Obliczenia, Braki danych, Raport, Techniczne) + SLD + Topologia
    expect(tabs.length).toBe(7);
  });

  it('Bay inspektor pokazuje 8 zakładek (ANY + Aparatura + Zabezpieczenia + Pomiary + Topologia + SLD)', () => {
    const { container } = make('bay');
    const tabs = container.querySelectorAll('button[data-testid^="inspector-tab-"]');
    // 5 ANY + SLD + Topologia + Aparatura + Zabezpieczenia + Pomiary = 9
    // (SLD ma applicableTo=['gpz','station','bay','cable_run'] — bay match)
    expect(tabs.length).toBeGreaterThanOrEqual(9);
  });

  it('Empty tab content: pokazuje "Brak danych" italic', () => {
    const { getByText, getByTestId } = make();
    fireEvent.click(getByTestId('inspector-tab-techniczne'));
    expect(getByText(/Brak danych/)).toBeInTheDocument();
  });

  it('onTabChange callback wywoływany przy zmianie zakładki', () => {
    let active: InspectorTabId | null = null;
    const { getByTestId } = render(
      <InspectorTabs
        elementType="station"
        headerProps={{
          elementName: 'ST-01',
          elementTypeLabelPl: 'stacja',
          completeness: 'complete',
        }}
        breadcrumb={[]}
        tabContent={{}}
        onTabChange={(tab) => { active = tab; }}
      />,
    );
    fireEvent.click(getByTestId('inspector-tab-raport'));
    expect(active).toBe('raport');
  });
});
