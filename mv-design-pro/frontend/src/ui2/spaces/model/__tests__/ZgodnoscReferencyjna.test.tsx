/**
 * Testy sekcji „Zgodność referencyjna" (REF-B, HANDOFF pkt 2.3 + 2.7).
 * Mock fetch na kontrakcie §1.1 (wymóg §3.4).
 */
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ZgodnoscReferencyjna } from '../ZgodnoscReferencyjna';

const RAPORT = {
  packs: [
    {
      pack_id: 'iec62271',
      name_pl: 'IEC 62271 — profile pól',
      kind: 'norm' as const,
      version: '1.0.0',
      applicable: 2,
      passed: 1,
      failed: 1,
      score_percent: 50,
      checks: [
        {
          element_ref: 'bay-1',
          pack_id: 'iec62271',
          rule_code: 'reference.bays.required',
          status: 'pass' as const,
          message_pl: 'Zgodny z profilem pola liniowego.',
        },
        {
          element_ref: 'bay-1',
          pack_id: 'iec62271',
          rule_code: 'reference.bays.order',
          status: 'fail' as const,
          message_pl: 'Niezgodna kolejność aparatów w torze głównym.',
        },
        {
          element_ref: 'bay-2',
          pack_id: 'iec62271',
          rule_code: 'reference.bays.required',
          status: 'pass' as const,
          message_pl: 'Inne pole — nie powinno być widoczne.',
        },
      ],
    },
    {
      pack_id: 'schneider_sm6',
      name_pl: 'Schneider SM6-24',
      kind: 'manufacturer' as const,
      version: '1.0.0',
      applicable: 0,
      passed: 0,
      failed: 0,
      score_percent: null,
      checks: [], // brak sprawdzeń dla bay-1 → pakiet pomijany
    },
  ],
};

const OSD_PACK = {
  pack_id: 'osd_enea',
  kind: 'osd' as const,
  name_pl: 'OSD Enea',
  version: '1.0.0',
  status: 'active',
  switchgear_family_ref: null,
  source_document_refs: ['Zeszyt 1'],
  station_rules: [
    {
      rule_code: 'osd_enea.telemechanika.qualification',
      description_pl: 'Kwalifikacja obiektu do telemechaniki nie jest uregulowana standardem.',
      implemented: false,
    },
    {
      rule_code: 'osd_enea.station.bay_composition',
      description_pl: 'Skład pól stacji.',
      implemented: true,
    },
  ],
};

function mockFetch(opts?: { odrzuc?: boolean }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      if (opts?.odrzuc) {
        return { ok: false, statusText: 'Server Error', json: async () => ({}) } as Response;
      }
      if (u.includes('/reference/compliance')) {
        return { ok: true, json: async () => RAPORT } as Response;
      }
      if (u.includes('/reference/packs/osd_enea')) {
        return { ok: true, json: async () => OSD_PACK } as Response;
      }
      return { ok: false, statusText: 'Not Found', json: async () => ({}) } as Response;
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('REF-B — sekcja Zgodność referencyjna w inspektorze', () => {
  it('bez aktywnego przypadku pokazuje uczciwą notę PL (nie liczy)', () => {
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId={null} czyStacja={false} multiSelekcja={false} />,
    );
    expect(screen.getByTestId('mvd-zgodnosc-pusto').textContent).toContain(
      'Brak aktywnego przypadku',
    );
    expect(screen.queryByTestId('mvd-zgodnosc-pakiet-iec62271')).toBeNull();
  });

  it('filtruje sprawdzenia po element_ref wybranego elementu', async () => {
    mockFetch();
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="c1" czyStacja={false} multiSelekcja={false} />,
    );
    const pakiet = await screen.findByTestId('mvd-zgodnosc-pakiet-iec62271');
    expect(pakiet).toBeTruthy();
    // Dwa sprawdzenia dla bay-1, sprawdzenie bay-2 pominięte.
    expect(screen.getByTestId('mvd-zgodnosc-check-iec62271-0')).toBeTruthy();
    expect(screen.getByTestId('mvd-zgodnosc-check-iec62271-1')).toBeTruthy();
    expect(screen.queryByText('Inne pole — nie powinno być widoczne.')).toBeNull();
  });

  it('sprawdzenie pass ma znacznik ✓', async () => {
    mockFetch();
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="c1" czyStacja={false} multiSelekcja={false} />,
    );
    const ok = await screen.findByTestId('mvd-zgodnosc-check-iec62271-0');
    expect(ok.getAttribute('data-status')).toBe('pass');
    expect(ok.textContent).toContain('✓');
  });

  it('sprawdzenie fail ma ✗ i ZAWSZE message_pl (powód)', async () => {
    mockFetch();
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="c1" czyStacja={false} multiSelekcja={false} />,
    );
    const zle = await screen.findByTestId('mvd-zgodnosc-check-iec62271-1');
    expect(zle.getAttribute('data-status')).toBe('fail');
    expect(zle.textContent).toContain('✗');
    expect(zle.textContent).toContain('Niezgodna kolejność aparatów');
  });

  it('pakiet bez sprawdzeń dla elementu jest pomijany (bez szumu)', async () => {
    mockFetch();
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="c1" czyStacja={false} multiSelekcja={false} />,
    );
    await screen.findByTestId('mvd-zgodnosc-pakiet-iec62271');
    expect(screen.queryByTestId('mvd-zgodnosc-pakiet-schneider_sm6')).toBeNull();
  });

  it('brak sprawdzeń dla elementu → uczciwa nota PL', async () => {
    mockFetch();
    render(
      <ZgodnoscReferencyjna elementRef="bay-999" caseId="c1" czyStacja={false} multiSelekcja={false} />,
    );
    const nota = await screen.findByTestId('mvd-zgodnosc-brak-sprawdzen');
    expect(nota.textContent).toContain('Brak sprawdzeń referencyjnych');
  });

  it('dla stacji reguły OSD implemented=false to NOTA (nie błąd/✗)', async () => {
    mockFetch();
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="c1" czyStacja={true} multiSelekcja={false} />,
    );
    const nota = await screen.findByTestId(
      'mvd-zgodnosc-osd-nota-osd_enea.telemechanika.qualification',
    );
    expect(nota.textContent).toContain('poza zakresem walidacji —');
    expect(nota.textContent).toContain('Kwalifikacja obiektu do telemechaniki');
    // implemented=true nie jest notą „poza zakresem".
    expect(
      screen.queryByTestId('mvd-zgodnosc-osd-nota-osd_enea.station.bay_composition'),
    ).toBeNull();
  });

  it('dla elementu niebędącego stacją nie pobiera reguł OSD', async () => {
    mockFetch();
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="c1" czyStacja={false} multiSelekcja={false} />,
    );
    await screen.findByTestId('mvd-zgodnosc-pakiet-iec62271');
    expect(screen.queryByTestId('mvd-zgodnosc-osd')).toBeNull();
    const wywolania = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(wywolania.some((u) => u.includes('osd_enea'))).toBe(false);
  });

  it('błąd API → uczciwa nota PL', async () => {
    mockFetch({ odrzuc: true });
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="c1" czyStacja={false} multiSelekcja={false} />,
    );
    const blad = await screen.findByTestId('mvd-zgodnosc-blad');
    expect(blad.textContent).toContain('Nie udało się pobrać');
  });

  it('multi-selekcja pokazuje sekcję dla pierwszego elementu z adnotacją', async () => {
    mockFetch();
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="c1" czyStacja={false} multiSelekcja={true} />,
    );
    await screen.findByTestId('mvd-zgodnosc-pakiet-iec62271');
    expect(screen.getByTestId('mvd-zgodnosc-multi').textContent).toContain(
      'Pokazano dla pierwszego',
    );
  });
});
