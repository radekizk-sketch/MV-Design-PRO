/**
 * Testy sekcji „Zgodność referencyjna" (REF-B, HANDOFF pkt 2.3 + 2.7).
 * Mock fetch na kontrakcie §1.1 (wymóg §3.4).
 *
 * REF-PAKIET: pakiet OSD nie jest już zaszyty stałą — wynika z RODZAJU
 * (`kind === 'osd'`) w katalogu `/reference/packs`, więc mock musi ten katalog
 * zwracać. Testy iloczynu cech (katalog pusty/jeden/wiele × wybór/domyślnie)
 * żyją w `wyborPakietuReferencyjnego.test.tsx`.
 */
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWyborPakietu } from '../../../referencje/wyborPakietu';
import type { ReferencePackSummary } from '../../../referencje/api';
import { ZgodnoscReferencyjna } from '../ZgodnoscReferencyjna';
import {
  SPRAWDZENIE_NIEZGODNE,
  SPRAWDZENIE_ZGODNE,
  sprawdzenieDla,
} from '../../../referencje/__tests__/fixturyReferencyjne';

// Rekordy sprawdzeń z backendu (karta WERDYKT-MIGRACJA-190) przypisane do pól testu.
const ZGODNE_BAY1 = sprawdzenieDla(SPRAWDZENIE_ZGODNE, 'bay-1', 'iec62271');
const NIEZGODNE_BAY1 = sprawdzenieDla(SPRAWDZENIE_NIEZGODNE, 'bay-1', 'iec62271');
const INNE_POLE = {
  ...sprawdzenieDla(SPRAWDZENIE_ZGODNE, 'bay-2', 'iec62271'),
  message_pl: 'Inne pole — nie powinno być widoczne.',
};

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
      checks: [ZGODNE_BAY1, NIEZGODNE_BAY1, INNE_POLE],
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

/** Katalog referencji (`GET /api/reference/packs`) — źródło rodzaju pakietu. */
const KATALOG: ReferencePackSummary[] = [
  {
    pack_id: 'iec62271',
    kind: 'norm',
    name_pl: 'IEC 62271 — profile pól',
    version: '1.0.0',
    status: 'repo_verified',
    switchgear_family_ref: null,
    source_document_refs: [],
  },
  {
    pack_id: 'osd_enea',
    kind: 'osd',
    name_pl: 'OSD Enea',
    version: '1.0.0',
    status: 'repo_verified',
    switchgear_family_ref: null,
    source_document_refs: [],
  },
];

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
      if (u.includes('/reference/packs')) {
        return { ok: true, json: async () => KATALOG } as Response;
      }
      return { ok: false, statusText: 'Not Found', json: async () => ({}) } as Response;
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  useWyborPakietu.setState({ pakietId: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useWyborPakietu.setState({ pakietId: null });
  localStorage.clear();
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

  it.each([
    [0, ZGODNE_BAY1],
    [1, NIEZGODNE_BAY1],
  ] as const)('sprawdzenie %i: etykieta rekordu backendu, powód i wyjaśnienie', async (i, check) => {
    mockFetch();
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="c1" czyStacja={false} multiSelekcja={false} />,
    );
    const wiersz = await screen.findByTestId(`mvd-zgodnosc-check-iec62271-${i}`);
    expect(wiersz.getAttribute('data-status')).toBe(check.ocena.status_maszynowy);
    expect(wiersz.textContent).toContain(check.ocena.etykieta.etykieta_pl);
    expect(wiersz.textContent).toContain(check.message_pl);
    expect(wiersz.textContent).not.toMatch(/[✓✗]/);
    expect(screen.getByTestId(`mvd-werdykt-${check.ocena.kryterium_id}`)).toBeTruthy();
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
