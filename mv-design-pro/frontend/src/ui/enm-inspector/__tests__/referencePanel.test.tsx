/**
 * ReferencePanel — zakładka „Referencje" Inspektora ENM (Reference Engine V1,
 * spec §9/§12): tabela Reference Score, „nie dotyczy" dla score null,
 * rozwinięcie sprawdzeń ✓/✗, stan błędu. Fetch mockowany (kontrakt
 * GET /api/cases/{id}/reference/compliance).
 *
 * REF-PAKIET: panel dzieli wybór referencji z przestrzeniami „Model" i
 * „Gotowość", więc woła też katalog `/reference/packs`. Mock rozróżnia adresy —
 * jedna odpowiedź na wszystko ukrywała, którym zapytaniem panel się posłużył.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWyborPakietu } from '../../../ui2/referencje/wyborPakietu';
import type { ReferencePackSummary } from '../../../ui2/referencje/api';
import { ReferencePanel } from '../ReferencePanel';
import type { ReferenceComplianceReport } from '../types';

const KATALOG: ReferencePackSummary[] = [
  {
    pack_id: 'iec62271',
    kind: 'norm',
    name_pl: 'IEC 62271-200 — rozdzielnice SN (profile pól)',
    version: '1.0.0',
    status: 'repo_verified',
    switchgear_family_ref: null,
    source_document_refs: [],
  },
  {
    pack_id: 'osd_enea',
    kind: 'osd',
    name_pl: 'Enea Operator — standardy sieci',
    version: '2025-01',
    status: 'repo_verified',
    switchgear_family_ref: null,
    source_document_refs: [],
  },
];

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

function mockFetch() {
  const spy = vi.fn(async (url: string) => {
    if (String(url).includes('/reference/packs')) {
      return { ok: true, json: async () => KATALOG } as Response;
    }
    return { ok: true, json: async () => REPORT } as Response;
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('ReferencePanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useWyborPakietu.setState({ pakietId: null });
    mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useWyborPakietu.setState({ pakietId: null });
    localStorage.clear();
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
    // Bez zawężenia (zakres „wszystkie referencje") adres jest bez `?packs=`.
    const adresy = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(adresy).toContain('/api/cases/case-1/reference/compliance');
  });

  it('wybrana referencja zawęża ocenę parametrem ?packs= (REF-PAKIET)', async () => {
    useWyborPakietu.setState({ pakietId: 'osd_enea' });
    render(<ReferencePanel caseId="case-1" />);
    await waitFor(() =>
      expect(screen.getByTestId('reference-score-table')).toBeInTheDocument(),
    );
    const adresy = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(adresy).toContain('/api/cases/case-1/reference/compliance?packs=osd_enea');
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

  it('bez aktywnego wariantu pokazuje pusty stan (bez oceny zgodności)', () => {
    // Intencja pierwotna: brak wariantu ⇒ panel NIE pobiera oceny zgodności.
    // REF-PAKIET: katalog referencji nie zależy od wariantu i wolno go pobrać.
    render(<ReferencePanel caseId={null} />);
    expect(screen.getByTestId('reference-panel-empty')).toBeInTheDocument();
    const adresy = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(adresy.some((u) => u.includes('/reference/compliance'))).toBe(false);
  });
});
