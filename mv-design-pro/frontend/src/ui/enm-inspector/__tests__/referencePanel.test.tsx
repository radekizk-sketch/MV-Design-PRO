/**
 * ReferencePanel — zakładka „Referencje" Inspektora ENM (Reference Engine V1,
 * spec §9/§12): tabela Reference Score, „nie dotyczy" dla score null,
 * rozwinięcie sprawdzeń ✓/✗, stan błędu. Fetch mockowany (kontrakt
 * GET /api/cases/{id}/reference/compliance).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferencePanel } from '../ReferencePanel';
import type { ReferenceComplianceReport } from '../types';

const REPORT: ReferenceComplianceReport = {
  packs: [
    {
      pack_id: 'iec62271',
      name_pl: 'IEC 62271-200 — rozdzielnice SN (profile pól)',
      kind: 'norm',
      version: '1.0.0',
      applicable: 12,
      passed: 7,
      failed: 5,
      score_percent: 58,
      checks: [
        {
          element_ref: 'bay/zle',
          pack_id: 'iec62271',
          rule_code: 'profile.required.CABLE_HEAD',
          status: 'fail',
          message_pl: 'Brak wymaganego aparatu: Głowica kablowa.',
        },
        {
          element_ref: 'bay/ok',
          pack_id: 'iec62271',
          rule_code: 'profile.order',
          status: 'pass',
          message_pl: 'Kolejność aparatów toru głównego zgodna.',
        },
      ],
    },
    {
      pack_id: 'osd_enea',
      name_pl: 'Enea Operator — standardy sieci',
      kind: 'osd',
      version: '2025-01',
      applicable: 0,
      passed: 0,
      failed: 0,
      score_percent: null,
      checks: [],
    },
  ],
};

describe('ReferencePanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(REPORT),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renderuje tabelę Reference Score z wynikiem i „nie dotyczy"', async () => {
    render(<ReferencePanel caseId="case-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('reference-score-table')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('reference-score-value-iec62271').textContent).toBe('58%');
    expect(screen.getByTestId('reference-score-value-osd_enea').textContent).toBe(
      'nie dotyczy',
    );
    expect(global.fetch).toHaveBeenCalledWith('/api/cases/case-1/reference/compliance');
  });

  it('rozwija listę sprawdzeń ✓/✗ po kliknięciu wiersza pakietu', async () => {
    render(<ReferencePanel caseId="case-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('reference-score-row-iec62271')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('reference-score-row-iec62271'));
    const checks = screen.getByTestId('reference-checks-iec62271');
    expect(checks.textContent).toContain('Brak wymaganego aparatu: Głowica kablowa.');
    expect(checks.textContent).toContain('✗');
    expect(checks.textContent).toContain('✓');
  });

  it('pokazuje komunikat błędu przy nieudanym fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, statusText: 'Internal Server Error' }),
    );
    render(<ReferencePanel caseId="case-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('reference-panel-error')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('reference-panel-error').textContent).toContain(
      'Błąd pobierania zgodności referencyjnej',
    );
  });

  it('bez aktywnego wariantu pokazuje pusty stan (bez fetch)', () => {
    render(<ReferencePanel caseId={null} />);
    expect(screen.getByTestId('reference-panel-empty')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
