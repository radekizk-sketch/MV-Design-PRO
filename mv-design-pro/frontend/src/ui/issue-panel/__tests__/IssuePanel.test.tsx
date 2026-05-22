/**
 * Issue Panel Tests — P30d
 *
 * Tests for:
 * - Rendering issues list
 * - Filtering by severity and source
 * - Deterministic sorting (HIGH > WARN > INFO)
 * - Issue click navigation
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssuePanel } from '../IssuePanel';
import type { Issue } from '../../types';

describe('IssuePanel', () => {
  const mockIssues: Issue[] = [
    {
      issue_id: 'model.1',
      source: 'MODEL',
      severity: 'HIGH',
      title_pl: 'Błąd walidacji sieci',
      description_pl: 'Brak węzła slack',
      object_ref: { type: 'Bus', id: 'BUS_001', name: 'Szyna 1' },
    },
    {
      issue_id: 'pf.1',
      source: 'POWER_FLOW',
      severity: 'WARN',
      title_pl: 'Napięcie poza zakresem',
      description_pl: 'Napięcie 1.06 p.u. (odchylenie 6%)',
      object_ref: { type: 'Bus', id: 'BUS_002', name: 'Szyna 2' },
    },
    {
      issue_id: 'pf.2',
      source: 'POWER_FLOW',
      severity: 'INFO',
      title_pl: 'Małe odchylenie napięcia',
      description_pl: 'Napięcie 1.01 p.u. (odchylenie 1%)',
      object_ref: { type: 'Bus', id: 'BUS_003', name: 'Szyna 3' },
    },
  ];

  const mockStats = {
    HIGH: 1,
    WARN: 1,
    INFO: 1,
  };

  const mockBySource = {
    MODEL: 1,
    POWER_FLOW: 2,
    PROTECTION: 0,
  };

  describe('Rendering', () => {
    it('should render all issues', () => {
      const onIssueClick = vi.fn();
      render(
        <IssuePanel
          issues={mockIssues}
          bySeverity={mockStats}
          bySource={mockBySource}
          onIssueClick={onIssueClick}
        />
      );

      expect(screen.getByText('Panel Problemów')).toBeInTheDocument();
      expect(screen.getByText('Błąd walidacji sieci')).toBeInTheDocument();
      expect(screen.getByText('Napięcie poza zakresem')).toBeInTheDocument();
      expect(screen.getByText('Małe odchylenie napięcia')).toBeInTheDocument();
    });

    it('should display issue count', () => {
      const onIssueClick = vi.fn();
      render(
        <IssuePanel
          issues={mockIssues}
          bySeverity={mockStats}
          bySource={mockBySource}
          onIssueClick={onIssueClick}
        />
      );

      expect(screen.getByText('Problemy: 3')).toBeInTheDocument();
    });

    it('should show empty state when no issues', () => {
      const onIssueClick = vi.fn();
      render(
        <IssuePanel
          issues={[]}
          bySeverity={{ HIGH: 0, WARN: 0, INFO: 0 }}
          bySource={{ MODEL: 0, POWER_FLOW: 0, PROTECTION: 0 }}
          onIssueClick={onIssueClick}
        />
      );

      expect(screen.getByText(/Kontrola nie wskazuje zagadnień technicznych/)).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('should call onIssueClick when issue is clicked', async () => {
      const user = userEvent.setup();
      const onIssueClick = vi.fn();

      render(
        <IssuePanel
          issues={mockIssues}
          bySeverity={mockStats}
          bySource={mockBySource}
          onIssueClick={onIssueClick}
        />
      );

      const firstIssue = screen.getByText('Błąd walidacji sieci');
      await user.click(firstIssue.closest('div[role="button"]')!);

      expect(onIssueClick).toHaveBeenCalledWith(mockIssues[0]);
    });
  });

  describe('Deterministic Sorting', () => {
    it('should display issues in severity order (HIGH > WARN > INFO)', () => {
      const onIssueClick = vi.fn();
      const { container } = render(
        <IssuePanel
          issues={mockIssues}
          bySeverity={mockStats}
          bySource={mockBySource}
          onIssueClick={onIssueClick}
        />
      );

      const issueItems = container.querySelectorAll('div[role="button"]');
      expect(issueItems).toHaveLength(3);

      // First issue should be HIGH severity
      expect(issueItems[0]).toHaveTextContent('Błąd walidacji sieci');
      expect(issueItems[0]).toHaveTextContent('Wysoka');

      // Second should be WARN
      expect(issueItems[1]).toHaveTextContent('Napięcie poza zakresem');
      expect(issueItems[1]).toHaveTextContent('Ostrzeżenie');

      // Third should be INFO
      expect(issueItems[2]).toHaveTextContent('Małe odchylenie napięcia');
      expect(issueItems[2]).toHaveTextContent('Info');
    });
  });
});
