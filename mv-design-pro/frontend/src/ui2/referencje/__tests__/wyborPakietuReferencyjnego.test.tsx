/*
 * Wybór pakietu referencyjnego — testy jako ILOCZYN CECH (karta REF-PAKIET,
 * reguła KLASA-NIE-INSTANCJA §2), a nie jeden scenariusz z karty.
 *
 * Osie:
 *   katalog referencji: PUSTY × JEDNOELEMENTOWY × WIELOELEMENTOWY
 *   zakres oceny:       domyślny (wszystkie) × wskazany przez projektanta
 *   miejsce:            ekran „Model" × sekcja „Gotowość"
 *
 * Iloczyn ma znaczenie, bo defekt chowa się dokładnie w rogach: pakiet OSD
 * wybierany rodzajem zachowuje się inaczej przy jednym, a inaczej przy wielu
 * pakietach `kind='osd'`, a zapamiętany wybór może wskazywać pakiet, którego
 * rejestr już nie ma.
 *
 * Ścieżka REALNA: zmiana zakresu idzie natywnym zdarzeniem `change` na
 * kontrolce `<select>` (userEvent), nie wstrzyknięciem stanu do store'u —
 * inaczej regresja wpięcia kontrolki byłaby niewykrywalna.
 */
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SekcjaZgodnosciReferencyjnej } from '../../spaces/gotowosc/SekcjaZgodnosciReferencyjnej';
import { ZgodnoscReferencyjna } from '../../spaces/model/ZgodnoscReferencyjna';
import { useAppStateStore } from '../../../ui/app-state/store';
import type { ReferencePackSummary } from '../api';
import { useWyborPakietu } from '../wyborPakietu';

const NORMA: ReferencePackSummary = {
  pack_id: 'iec62271',
  kind: 'norm',
  name_pl: 'IEC 62271 — profile pól',
  version: '1.0.0',
  status: 'repo_verified',
  switchgear_family_ref: null,
  source_document_refs: [],
};

const OSD_A: ReferencePackSummary = {
  pack_id: 'osd_enea',
  kind: 'osd',
  name_pl: 'OSD Enea',
  version: '2026-02',
  status: 'repo_verified',
  switchgear_family_ref: null,
  source_document_refs: [],
};

/* Drugi standard OSD — dziś rejestr go nie ma, ale to właśnie ten przypadek
   zaszyta stała `'osd_enea'` obsługiwała ŹLE (ignorowała nowy pakiet). */
const OSD_B: ReferencePackSummary = {
  pack_id: 'osd_drugi',
  kind: 'osd',
  name_pl: 'OSD Drugi',
  version: '2026-03',
  status: 'repo_verified',
  switchgear_family_ref: null,
  source_document_refs: [],
};

const RAPORT = {
  packs: [
    {
      pack_id: 'iec62271',
      name_pl: 'IEC 62271 — profile pól',
      kind: 'norm' as const,
      version: '1.0.0',
      applicable: 1,
      passed: 1,
      failed: 0,
      score_percent: 100,
      checks: [
        {
          element_ref: 'bay-1',
          pack_id: 'iec62271',
          rule_code: 'profile.order',
          status: 'pass' as const,
          message_pl: 'Kolejność aparatów zgodna.',
        },
      ],
    },
  ],
};

const REGULY: Record<string, { rule_code: string; description_pl: string; implemented: boolean }[]> =
  {
    osd_enea: [
      {
        rule_code: 'osd_enea.telemechanika.qualification',
        description_pl: 'Kwalifikacja do telemechaniki nieuregulowana.',
        implemented: false,
      },
    ],
    osd_drugi: [
      {
        rule_code: 'osd_drugi.station.uklad',
        description_pl: 'Układ stacji poza zakresem walidacji.',
        implemented: false,
      },
    ],
  };

/** Mock kontraktu: katalog referencji + ocena zgodności + pełne pakiety. */
function mockFetch(katalog: readonly ReferencePackSummary[]) {
  const spy = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/reference/compliance')) {
      return { ok: true, json: async () => RAPORT } as Response;
    }
    const pelny = katalog.find((p) => u.includes(`/reference/packs/${p.pack_id}`));
    if (pelny) {
      return {
        ok: true,
        json: async () => ({ ...pelny, station_rules: REGULY[pelny.pack_id] ?? [] }),
      } as Response;
    }
    if (u.includes('/reference/packs')) {
      return { ok: true, json: async () => katalog } as Response;
    }
    return { ok: false, statusText: 'Not Found', json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function adresyOceny(spy: ReturnType<typeof mockFetch>): string[] {
  return spy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/reference/compliance'));
}

beforeEach(() => {
  localStorage.clear();
  useWyborPakietu.setState({ pakietId: null });
  useAppStateStore.setState({ activeCaseId: 'C1' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useWyborPakietu.setState({ pakietId: null });
  useAppStateStore.setState({ activeCaseId: null });
  localStorage.clear();
});

describe('REF-PAKIET — katalog referencji × zakres oceny (ekran „Model")', () => {
  it('katalog PUSTY: uczciwy stan zerowy z powodem i akcją (bez zmyślonego pakietu)', async () => {
    mockFetch([]);
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="C1" czyStacja={true} multiSelekcja={false} />,
    );
    const pusto = await screen.findByTestId('mvd-ref-wybor-pusto');
    expect(pusto.textContent).toContain('Rejestr nie zwrócił żadnego pakietu');
    expect(screen.getByRole('button', { name: 'Ponów pobranie' })).toBeTruthy();
    // Brak pakietów OSD ⇒ brak not stacyjnych (zero fabrykacji).
    await waitFor(() => expect(screen.queryByTestId('mvd-zgodnosc-osd')).toBeNull());
  });

  it('katalog JEDNOELEMENTOWY (jeden OSD): noty stacyjne z tego pakietu — z danych, nie ze stałej', async () => {
    mockFetch([OSD_A]);
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="C1" czyStacja={true} multiSelekcja={false} />,
    );
    const nota = await screen.findByTestId('mvd-zgodnosc-osd-nota-osd_enea.telemechanika.qualification');
    expect(nota.textContent).toContain('poza zakresem walidacji —');
    expect(nota.textContent).toContain('(OSD Enea)');
  });

  it('katalog WIELOELEMENTOWY: bez zawężenia noty pochodzą ze WSZYSTKICH pakietów OSD', async () => {
    mockFetch([NORMA, OSD_A, OSD_B]);
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="C1" czyStacja={true} multiSelekcja={false} />,
    );
    await screen.findByTestId('mvd-zgodnosc-osd-nota-osd_enea.telemechanika.qualification');
    expect(screen.getByTestId('mvd-zgodnosc-osd-nota-osd_drugi.station.uklad')).toBeTruthy();
  });

  it('zakres WSKAZANY przez projektanta (natywna zmiana listy) zawęża ocenę i noty do jednego OSD', async () => {
    const spy = mockFetch([NORMA, OSD_A, OSD_B]);
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="C1" czyStacja={true} multiSelekcja={false} />,
    );
    await screen.findByTestId('mvd-ref-wybor-select');
    await userEvent.selectOptions(screen.getByTestId('mvd-ref-wybor-select'), 'osd_drugi');

    await waitFor(() =>
      expect(adresyOceny(spy)).toContain('/api/cases/C1/reference/compliance?packs=osd_drugi'),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('mvd-zgodnosc-osd-nota-osd_enea.telemechanika.qualification')).toBeNull(),
    );
    expect(screen.getByTestId('mvd-zgodnosc-osd-nota-osd_drugi.station.uklad')).toBeTruthy();
  });

  it('zakres wskazujący NORMĘ: ocena zawężona, ale brak not stacyjnych OSD (uczciwie, bez podstawiania OSD)', async () => {
    const spy = mockFetch([NORMA, OSD_A]);
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="C1" czyStacja={true} multiSelekcja={false} />,
    );
    await screen.findByTestId('mvd-ref-wybor-select');
    await userEvent.selectOptions(screen.getByTestId('mvd-ref-wybor-select'), 'iec62271');

    await waitFor(() =>
      expect(adresyOceny(spy)).toContain('/api/cases/C1/reference/compliance?packs=iec62271'),
    );
    await waitFor(() => expect(screen.queryByTestId('mvd-zgodnosc-osd')).toBeNull());
  });

  it('zapamiętany pakiet spoza rejestru wraca do „wszystkich" z jawnym powodem (para zapis/odczyt)', async () => {
    useWyborPakietu.setState({ pakietId: 'osd_nieistniejacy' });
    mockFetch([NORMA, OSD_A]);
    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="C1" czyStacja={false} multiSelekcja={false} />,
    );
    const nota = await screen.findByTestId('mvd-ref-wybor-wycofany');
    expect(nota.textContent).toContain('nie występuje już w rejestrze');
    expect(useWyborPakietu.getState().pakietId).toBeNull();
  });
});

describe('REF-PAKIET — katalog referencji × zakres oceny (sekcja „Gotowość")', () => {
  it('domyślnie ocenia WSZYSTKIE referencje (adres bez parametru zawężenia)', async () => {
    const spy = mockFetch([NORMA, OSD_A]);
    render(<SekcjaZgodnosciReferencyjnej />);
    await screen.findByTestId('mvd-ref-tabela');
    expect(adresyOceny(spy)).toEqual(['/api/cases/C1/reference/compliance']);
  });

  it('wybór projektanta (natywna zmiana listy) zawęża ocenę parametrem ?packs=', async () => {
    const spy = mockFetch([NORMA, OSD_A]);
    render(<SekcjaZgodnosciReferencyjnej />);
    await screen.findByTestId('mvd-ref-wybor-select');
    await userEvent.selectOptions(screen.getByTestId('mvd-ref-wybor-select'), 'osd_enea');
    await waitFor(() =>
      expect(adresyOceny(spy)).toContain('/api/cases/C1/reference/compliance?packs=osd_enea'),
    );
  });

  it('katalog PUSTY: uczciwy stan zerowy kontrolki, ocena nadal bez zawężenia', async () => {
    const spy = mockFetch([]);
    render(<SekcjaZgodnosciReferencyjnej />);
    expect((await screen.findByTestId('mvd-ref-wybor-pusto')).textContent).toContain(
      'nie ma wg czego oceniać',
    );
    expect(adresyOceny(spy)).toEqual(['/api/cases/C1/reference/compliance']);
  });

  it('katalog JEDNOELEMENTOWY: lista ma pozycję pakietu obok pozycji „wszystkie" (wybór realny)', async () => {
    mockFetch([OSD_A]);
    render(<SekcjaZgodnosciReferencyjnej />);
    const select = await screen.findByTestId('mvd-ref-wybor-select');
    const opcje = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(opcje).toEqual(['Wszystkie referencje', 'OSD Enea (OSD · 2026-02)']);
  });

  it('wybór jest WSPÓLNY dla miejsc zgodności (jedno źródło prawdy, nie trzy stany)', async () => {
    const spy = mockFetch([NORMA, OSD_A]);
    const { unmount } = render(<SekcjaZgodnosciReferencyjnej />);
    await screen.findByTestId('mvd-ref-wybor-select');
    await userEvent.selectOptions(screen.getByTestId('mvd-ref-wybor-select'), 'osd_enea');
    await waitFor(() =>
      expect(adresyOceny(spy)).toContain('/api/cases/C1/reference/compliance?packs=osd_enea'),
    );
    unmount();

    render(
      <ZgodnoscReferencyjna elementRef="bay-1" caseId="C1" czyStacja={false} multiSelekcja={false} />,
    );
    await waitFor(() =>
      expect(
        adresyOceny(spy).filter((u) => u.endsWith('?packs=osd_enea')).length,
      ).toBeGreaterThanOrEqual(2),
    );
  });

  it('błąd katalogu referencji: powód PL + akcja ponowienia (kontrolka nie znika)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/reference/packs')) {
          return { ok: false, statusText: 'Internal', json: async () => ({}) } as Response;
        }
        return { ok: true, json: async () => RAPORT } as Response;
      }),
    );
    render(<SekcjaZgodnosciReferencyjnej />);
    const blad = await screen.findByTestId('mvd-ref-wybor-blad');
    expect(blad.textContent).toContain('Nie udało się pobrać listy referencji');
    expect(screen.getByRole('button', { name: 'Ponów pobranie' })).toBeTruthy();
  });
});
