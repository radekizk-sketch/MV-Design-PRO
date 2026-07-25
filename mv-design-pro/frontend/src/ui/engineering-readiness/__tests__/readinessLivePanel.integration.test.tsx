import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ReadinessLivePanel } from '../ReadinessLivePanel';
import type { ReadinessIssue, FixAction } from '../../types';

function makeFixAction(): FixAction {
  return {
    type: 'OPEN_MODAL',
    modal_type: 'catalog_select',
    target_element_id: 'line_sn_1',
    payload: { panel: 'Katalog' },
  };
}

function makeIssue(): ReadinessIssue {
  return {
    code: 'catalog.sn_line.missing',
    severity: 'BLOCKER',
    element_ref: 'line_sn_1',
    element_refs: ['line_sn_1'],
    message_pl: 'Brak katalogu dla linii SN',
    wizard_step_hint: 'K4',
    suggested_fix: 'Przypisz typ linii z katalogu',
    fix_action: makeFixAction(),
  };
}

describe('ReadinessLivePanel — integracja działań naprawczych', () => {
  it('Przejdź + Skonfiguruj: nawiguje do elementu, uruchamia fix action, a po konfiguracji znika zagadnienie', () => {
    const onNavigateToElement = vi.fn();
    const onFixAction = vi.fn();

    const { rerender } = render(
      <ReadinessLivePanel
        issues={[makeIssue()]}
        status="FAIL"
        loading={false}
        onNavigateToElement={onNavigateToElement}
        onFixAction={onFixAction}
      />,
    );

    const issueRow = screen.getByTestId('readiness-live-issue-catalog.sn_line.missing');
    expect(issueRow).toBeInTheDocument();

    fireEvent.click(screen.getByText('Przejdź'));
    expect(onNavigateToElement).toHaveBeenCalledWith('line_sn_1');

    fireEvent.click(screen.getByText('Skonfiguruj'));
    expect(onFixAction).toHaveBeenCalledTimes(1);
    expect(onFixAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OPEN_MODAL', modal_type: 'catalog_select' }),
      'line_sn_1',
    );

    // Symulacja usunięcia zagadnienia po konfiguracji i odświeżeniu kontroli
    rerender(
      <ReadinessLivePanel
        issues={[]}
        status="OK"
        loading={false}
        onNavigateToElement={onNavigateToElement}
        onFixAction={onFixAction}
      />,
    );

    expect(screen.getByTestId('readiness-live-panel-empty')).toBeInTheDocument();
    expect(screen.getByText('Układ skonfigurowany do analiz')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Karta F-K6 / V12K-206 (znalezisko Z8): kanoniczny priorytet wyznacza kolejność
// napraw. Do tej pory zgłoszenia o tym samym poziomie szły alfabetycznie po kodzie,
// a alfabet nie ma nic wspólnego z pilnością — kanoniczny rejestr kodów gotowości
// nie miał żadnego konsumenta w warstwie prezentacji.
// ---------------------------------------------------------------------------

function zgloszenie(
  kod: string,
  nadpisz: Partial<ReadinessIssue> = {},
): ReadinessIssue {
  return {
    code: kod,
    severity: 'BLOCKER',
    element_ref: 'bus_1',
    element_refs: ['bus_1'],
    message_pl: `Zagadnienie ${kod}`,
    wizard_step_hint: null,
    suggested_fix: null,
    fix_action: null,
    ...nadpisz,
  };
}

describe('ReadinessLivePanel — kanoniczny priorytet (V12K-206)', () => {
  it('przy równym poziomie kolejność wyznacza priorytet kanoniczny, nie alfabet kodu', () => {
    // Alfabetycznie „source.a" < „source.z", ale kanon mówi, że pilniejsze jest
    // „source.z" (priorytet 1). Panel musi iść za kanonem.
    render(
      <ReadinessLivePanel
        issues={[
          zgloszenie('source.a_mniej_pilne', { canonical_priority: 3 }),
          zgloszenie('source.z_najpilniejsze', { canonical_priority: 1 }),
        ]}
        status="FAIL"
        loading={false}
      />,
    );

    const wiersze = screen.getAllByTestId(/^readiness-live-issue-/);
    expect(wiersze.map((w) => w.getAttribute('data-testid'))).toEqual([
      'readiness-live-issue-source.z_najpilniejsze',
      'readiness-live-issue-source.a_mniej_pilne',
    ]);
  });

  it('zgłoszenie bez kanonu nie dostaje priorytetu domyślnego i idzie na koniec grupy', () => {
    // Brak odwzorowania znaczy „nie znamy pilności". Przypisanie mu priorytetu
    // środkowego byłoby zgadywaniem kolejności naprawy.
    render(
      <ReadinessLivePanel
        issues={[
          zgloszenie('source.bez_kanonu'),
          zgloszenie('source.z_kanonem', { canonical_priority: 2 }),
        ]}
        status="FAIL"
        loading={false}
      />,
    );

    const wiersze = screen.getAllByTestId(/^readiness-live-issue-/);
    expect(wiersze.map((w) => w.getAttribute('data-testid'))).toEqual([
      'readiness-live-issue-source.z_kanonem',
      'readiness-live-issue-source.bez_kanonu',
    ]);
  });

  it('kolejność jest deterministyczna dla równego poziomu i równego priorytetu', () => {
    render(
      <ReadinessLivePanel
        issues={[
          zgloszenie('source.b', { canonical_priority: 2 }),
          zgloszenie('source.a', { canonical_priority: 2 }),
        ]}
        status="FAIL"
        loading={false}
      />,
    );

    const wiersze = screen.getAllByTestId(/^readiness-live-issue-/);
    expect(wiersze.map((w) => w.getAttribute('data-testid'))).toEqual([
      'readiness-live-issue-source.a',
      'readiness-live-issue-source.b',
    ]);
  });
});
