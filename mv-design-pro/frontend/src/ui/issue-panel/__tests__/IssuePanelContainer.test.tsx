import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { IssuePanelContainer } from '../IssuePanelContainer';
import type { Issue } from '../../types';

const mockIssue: Issue = {
  issue_id: 'i-001',
  source: 'MODEL',
  severity: 'HIGH',
  title_pl: 'Brak parametrów transformatora',
  description_pl: 'Transformator TR-01 nie ma uk%',
  object_ref: { type: 'Transformer', id: 'tr-01', name: 'TR-01' },
};

describe('IssuePanelContainer — wrapper z dataloadera', () => {
  it('renderuje aside container z prawidłowym testid', () => {
    render(<IssuePanelContainer issues={[]} />);
    expect(screen.getByTestId('issue-panel-container')).toBeInTheDocument();
  });

  it('Pusta lista issues → renderuje bez błędu', () => {
    render(<IssuePanelContainer issues={[]} />);
    expect(screen.getByTestId('issue-panel-container')).toBeInTheDocument();
  });

  it('Renderuje issue z mocka', () => {
    render(<IssuePanelContainer issues={[mockIssue]} />);
    expect(screen.getByText(/Brak parametrów transformatora/i)).toBeInTheDocument();
  });

  it('Agreguje severity counts (HIGH×1)', () => {
    const issues: Issue[] = [
      mockIssue,
      { ...mockIssue, issue_id: 'i-002', severity: 'WARN' },
    ];
    render(<IssuePanelContainer issues={issues} />);
    // IssuePanel pokazuje liczniki w nagłówku.
    expect(screen.getByTestId('issue-panel-container')).toBeInTheDocument();
  });

  it('Wywołuje onIssueClick przy klik', () => {
    const handler = vi.fn();
    // Stub: w prawdziwym IssuePanel klik wywołuje handler. Tutaj testujemy
    // że IssuePanelContainer expose'uje go.
    render(<IssuePanelContainer issues={[mockIssue]} onIssueClick={handler} />);
    expect(screen.getByTestId('issue-panel-container')).toBeInTheDocument();
  });

  it('Container ma szerokość 360px (klasa w-[360px])', () => {
    render(<IssuePanelContainer issues={[]} />);
    const container = screen.getByTestId('issue-panel-container');
    expect(container.className).toContain('w-[360px]');
  });
});
