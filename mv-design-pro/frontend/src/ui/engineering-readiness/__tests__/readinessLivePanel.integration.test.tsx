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
