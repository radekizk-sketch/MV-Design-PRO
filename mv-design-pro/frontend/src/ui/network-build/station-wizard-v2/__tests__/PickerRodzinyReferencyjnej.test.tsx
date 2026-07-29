/**
 * Testy pickera rodziny rozdzielnicy + cell_match w kreatorze (REF-B, HANDOFF pkt 2.4).
 * Mock fetch na kontrakcie §1.1 (wymóg §3.4): pakiety manufacturer + rodziny katalogu
 * + pełny pakiet z cell_configurations. Selekcja przez ISTNIEJĄCY callback rodziny.
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PickerRodzinyReferencyjnej } from '../PickerRodzinyReferencyjnej';
import type { ReferenceComplianceReport } from '../../../../ui2/referencje/api';

const MANUFACTURER_PACKS = [
  {
    pack_id: 'schneider_sm6',
    kind: 'manufacturer' as const,
    name_pl: 'Schneider SM6-24',
    version: '1.2.0',
    status: 'active',
    switchgear_family_ref: 'SM6_24',
    source_document_refs: ['Katalog SM6'],
  },
  {
    pack_id: 'abb_safering',
    kind: 'manufacturer' as const,
    name_pl: 'ABB SafeRing',
    version: '1.0.0',
    status: 'active',
    switchgear_family_ref: 'SAFERING',
    source_document_refs: ['Katalog SafeRing'],
  },
];

// Rodzina bez pakietu referencyjnego (BRAK_PACK) — nie powinna trafić do listy join.
const FAMILIES = [
  {
    switchgear_family_ref: 'SM6_24',
    manufacturer_ref: 'Schneider',
    family_name: 'SM6',
    series_name: 'SM6-24',
    voltage_levels: [24],
    insulation_type: 'sf6' as const,
    construction_type: 'RMU' as const,
    status: 'verified' as const,
    source_refs: ['Katalog SM6'],
    notes_pl: null,
  },
  {
    switchgear_family_ref: 'SAFERING',
    manufacturer_ref: 'ABB',
    family_name: 'SafeRing',
    series_name: null,
    voltage_levels: [24],
    insulation_type: 'sf6' as const,
    construction_type: 'RMU' as const,
    status: 'verified' as const,
    source_refs: ['Katalog SafeRing'],
    notes_pl: null,
  },
  {
    switchgear_family_ref: 'BRAK_PACK',
    manufacturer_ref: 'Inny',
    family_name: 'Rodzina bez pakietu',
    series_name: null,
    voltage_levels: [24],
    insulation_type: 'air' as const,
    construction_type: 'wnetrzowa' as const,
    status: 'verified' as const,
    source_refs: ['ref'],
    notes_pl: null,
  },
];

const PACK_SM6_FULL = {
  ...MANUFACTURER_PACKS[0],
  cell_configurations: [
    { cell_code: 'QM', name_pl: 'Celka odpływowa z rozłącznikiem', standard: true, apparatus: ['LOAD_SWITCH', 'FUSE'] },
    { cell_code: 'DM1-A', name_pl: 'Celka wyłącznikowa', standard: false, apparatus: ['CB', 'CT'] },
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
      if (u.includes('/reference/packs/schneider_sm6')) {
        return { ok: true, json: async () => PACK_SM6_FULL } as Response;
      }
      if (u.includes('/reference/packs')) {
        return { ok: true, json: async () => MANUFACTURER_PACKS } as Response;
      }
      if (u.includes('/catalog/switchgear-families')) {
        return { ok: true, json: async () => FAMILIES } as Response;
      }
      return { ok: false, statusText: 'Not Found', json: async () => ({}) } as Response;
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('REF-B — picker rodziny rozdzielnicy w kreatorze', () => {
  it('łączy pakiety manufacturer z rodzinami katalogu po switchgear_family_ref', async () => {
    mockFetch();
    render(<PickerRodzinyReferencyjnej />);
    await screen.findByTestId('picker-rodziny-lista');
    expect(screen.getByTestId('picker-rodziny-opcja-SM6_24')).toBeTruthy();
    expect(screen.getByTestId('picker-rodziny-opcja-SAFERING')).toBeTruthy();
    // Rodzina bez pakietu referencyjnego pominięta.
    expect(screen.queryByTestId('picker-rodziny-opcja-BRAK_PACK')).toBeNull();
  });

  it('etykieta opcji = name_pl pakietu + wersja', async () => {
    mockFetch();
    render(<PickerRodzinyReferencyjnej />);
    const opcja = await screen.findByTestId('picker-rodziny-opcja-SM6_24');
    expect(opcja.textContent).toContain('Schneider SM6-24');
    expect(opcja.textContent).toContain('1.2.0');
  });

  it('wybór idzie przez ISTNIEJĄCY mechanizm rodziny (callback onSelectFamily)', async () => {
    mockFetch();
    const onSelect = vi.fn();
    render(<PickerRodzinyReferencyjnej onSelectFamily={onSelect} />);
    const opcja = await screen.findByTestId('picker-rodziny-opcja-SM6_24');
    fireEvent.click(opcja);
    expect(onSelect).toHaveBeenCalledWith('SM6_24');
  });

  it('po wyborze rodziny pokazuje podpowiedzi składu celek (standard/opcja)', async () => {
    mockFetch();
    render(<PickerRodzinyReferencyjnej selectedFamilyRef="SM6_24" />);
    const celkaStd = await screen.findByTestId('picker-rodziny-celka-QM');
    expect(celkaStd.getAttribute('data-standard')).toBe('true');
    expect(celkaStd.textContent).toContain('standard');
    const celkaOpt = screen.getByTestId('picker-rodziny-celka-DM1-A');
    expect(celkaOpt.getAttribute('data-standard')).toBe('false');
    expect(celkaOpt.textContent).toContain('opcja');
  });

  it('kody celek pochodzą z pakietu (notacja katalogowa), nie ze stałych', async () => {
    mockFetch();
    render(<PickerRodzinyReferencyjnej selectedFamilyRef="SM6_24" />);
    const celka = await screen.findByTestId('picker-rodziny-celka-QM');
    // Kod celki „QM" i skład aparatów z API (dynamiczne), nie literały w komponencie.
    expect(celka.textContent).toContain('QM');
    expect(celka.textContent).toContain('LOAD_SWITCH');
  });

  it('po związaniu pola pokazuje cell_match z NAZWĄ celki (z message_pl)', async () => {
    mockFetch();
    const report: ReferenceComplianceReport = {
      packs: [
        {
          pack_id: 'schneider_sm6',
          name_pl: 'Schneider SM6-24',
          kind: 'manufacturer',
          version: '1.2.0',
          applicable: 1,
          passed: 1,
          failed: 0,
          score_percent: 100,
          checks: [
            {
              element_ref: 'bay-7',
              pack_id: 'schneider_sm6',
              rule_code: 'reference.family.cell_match',
              status: 'pass',
              message_pl: 'Odpowiada celce QM rodziny SM6-24.',
            },
          ],
        },
      ],
    };
    render(
      <PickerRodzinyReferencyjnej
        selectedFamilyRef="SM6_24"
        complianceReport={report}
        boundElementRef="bay-7"
        boundBayTemplateRef="SM6_24__rmu_line"
      />,
    );
    const wynik = await screen.findByTestId('picker-rodziny-cell-match-wynik');
    expect(wynik.getAttribute('data-status')).toBe('pass');
    expect(wynik.textContent).toContain('Odpowiada celce QM rodziny SM6-24');
    expect(screen.getByTestId('picker-rodziny-bay-ref').textContent).toContain('SM6_24__rmu_line');
  });

  it('cell_match jako bramka danych — brak sprawdzenia dla pola = nota braku', async () => {
    mockFetch();
    const report: ReferenceComplianceReport = { packs: [] };
    render(
      <PickerRodzinyReferencyjnej
        selectedFamilyRef="SM6_24"
        complianceReport={report}
        boundElementRef="bay-7"
        boundBayTemplateRef="SM6_24__rmu_line"
      />,
    );
    await screen.findByTestId('picker-rodziny-cell-match');
    expect(screen.getByTestId('picker-rodziny-cell-match-brak')).toBeTruthy();
  });

  it('bez związanego pola nie pokazuje sekcji cell_match', async () => {
    mockFetch();
    render(<PickerRodzinyReferencyjnej selectedFamilyRef="SM6_24" />);
    await screen.findByTestId('picker-rodziny-celka-QM');
    expect(screen.queryByTestId('picker-rodziny-cell-match')).toBeNull();
  });

  it('błąd pobrania pakietów → uczciwa nota PL', async () => {
    mockFetch({ odrzuc: true });
    render(<PickerRodzinyReferencyjnej />);
    const blad = await screen.findByTestId('picker-rodziny-blad');
    expect(blad.textContent).toContain('Nie udało się pobrać');
  });
});
