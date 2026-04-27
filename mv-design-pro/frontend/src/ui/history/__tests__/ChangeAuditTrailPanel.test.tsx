/**
 * Tests for ChangeAuditTrailPanel — Pakiet H.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AUDIT_ACTION_LABELS_PL,
  ChangeAuditTrailPanel,
  filterAudit,
  sortAuditDesc,
} from '../ChangeAuditTrailPanel';
import type { AuditEntry } from '../ChangeAuditTrailPanel';

const SAMPLES: AuditEntry[] = [
  {
    timestamp: '2026-04-25T10:00:00Z',
    user: 'jan.kowalski',
    element_id: 'BR_1',
    element_type: 'Branch',
    action: 'create',
    description_pl: 'Dodano linię SN',
  },
  {
    timestamp: '2026-04-26T10:00:00Z',
    user: 'anna.nowak',
    element_id: 'TR_1',
    element_type: 'Transformer',
    action: 'set_earthing',
    description_pl: 'Ustawiono uziemienie petersen',
  },
];

describe('ChangeAuditTrailPanel — historia zmian', () => {
  it('renderuje panel z wpisami', () => {
    render(<ChangeAuditTrailPanel entries={SAMPLES} />);
    expect(screen.getByTestId('change-audit-trail-panel')).toBeInTheDocument();
    expect(screen.getByTestId('audit-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('audit-row-1')).toBeInTheDocument();
  });

  it('AUDIT_ACTION_LABELS_PL: 7 akcji w PL', () => {
    expect(Object.keys(AUDIT_ACTION_LABELS_PL)).toHaveLength(7);
    expect(AUDIT_ACTION_LABELS_PL.set_earthing).toMatch(/uziemienia/);
  });

  it('filtr user (case-insensitive substring)', () => {
    render(<ChangeAuditTrailPanel entries={SAMPLES} />);
    act(() => {
      fireEvent.change(screen.getByTestId('audit-filter-user'), { target: { value: 'JAN' } });
    });
    expect(screen.getByTestId('audit-count').textContent).toMatch(/1 \/ 2/);
  });

  it('filtr element_id (case-insensitive substring)', () => {
    render(<ChangeAuditTrailPanel entries={SAMPLES} />);
    act(() => {
      fireEvent.change(screen.getByTestId('audit-filter-element'), { target: { value: 'tr_' } });
    });
    expect(screen.getByTestId('audit-count').textContent).toMatch(/1 \/ 2/);
  });

  it('filtr akcja', () => {
    render(<ChangeAuditTrailPanel entries={SAMPLES} />);
    act(() => {
      fireEvent.change(screen.getByTestId('audit-filter-action'), {
        target: { value: 'set_earthing' },
      });
    });
    expect(screen.getByTestId('audit-count').textContent).toMatch(/1 \/ 2/);
  });

  it('empty state gdy brak wpisów po filtracji', () => {
    render(<ChangeAuditTrailPanel entries={SAMPLES} />);
    act(() => {
      fireEvent.change(screen.getByTestId('audit-filter-user'), {
        target: { value: 'nikt' },
      });
    });
    expect(screen.getByTestId('audit-empty')).toBeInTheDocument();
  });

  it('sortowanie DESC po timestamp (najnowsze najpierw)', () => {
    render(<ChangeAuditTrailPanel entries={SAMPLES} />);
    const row0 = screen.getByTestId('audit-row-0');
    expect(row0.textContent).toMatch(/anna\.nowak/); // 04-26 (nowsze)
  });

  it('filterAudit: pure function — bez UI', () => {
    expect(filterAudit(SAMPLES, { action: 'create' })).toHaveLength(1);
    expect(filterAudit(SAMPLES, {})).toHaveLength(2);
  });

  it('sortAuditDesc: tie-break po element_id ASC', () => {
    const tied: AuditEntry[] = [
      { ...SAMPLES[0], element_id: 'Z' },
      { ...SAMPLES[0], element_id: 'A' },
    ];
    const sorted = sortAuditDesc(tied);
    expect(sorted[0].element_id).toBe('A');
    expect(sorted[1].element_id).toBe('Z');
  });
});
