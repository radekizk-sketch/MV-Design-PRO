/**
 * KARTA W5-C — edytor wyposażenia pola SN (`set_bay_equipment`), ścieżka projektanta:
 * natywny klik „Zmień wyposażenie" → wybór trybu i aparatów → „Zapisz wyposażenie" →
 * ładunek operacji → wynik albo odmowa backendu na karcie.
 *
 * Iloczyn cech: tryb {katalog, szablon, wyczysc} × rola pola SN {IN, OUT, TR, FEEDER,
 * COUPLER, MEASUREMENT, OZE} × odpowiedź {sukces, odmowa z kodem, brak odpowiedzi}.
 * Do tego reguły kształtu formularza: pozycje katalogu filtrowane rodzajem, łącznik
 * wyłącznie z gałęzi TEGO pola, zmiana rodzaju czyści pola nowego rodzaju, katalog
 * odpytywany dopiero po otwarciu edycji.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Bay, DomainOpResponseV1, EnergyNetworkModel } from '../../../types/enm';
import { pole } from '../../../test/pola';

const katalogApi = vi.hoisted(() => ({
  fetchMvApparatusTypes: vi.fn(),
  fetchCtTypes: vi.fn(),
  fetchVtTypes: vi.fn(),
  fetchSurgeArresterTypes: vi.fn(),
  fetchCompleteBayTemplates: vi.fn(),
}));

vi.mock('../../catalog/api', () => ({
  ...katalogApi,
  getCatalogErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { EdytorWyposazeniaPola } from '../EdytorWyposazeniaPola';

const ROLE = ['IN', 'OUT', 'TR', 'FEEDER', 'COUPLER', 'MEASUREMENT', 'OZE'] as const;
type Rola = (typeof ROLE)[number];

const MIGAWKA = {
  branches: [
    { ref_id: 'q1', id: 'q1', name: 'Q1', type: 'breaker', status: 'closed' },
    { ref_id: 'f1', id: 'f1', name: 'F1', type: 'fuse', status: 'closed' },
    { ref_id: 'kab', id: 'kab', name: 'Kabel', type: 'cable', status: 'closed' },
    { ref_id: 'q-obce', id: 'q-obce', name: 'Q obce', type: 'switch', status: 'closed' },
  ],
} as unknown as EnergyNetworkModel;

function polePola(rola: Rola, aparaty: Bay['primary_devices'] = []): Bay {
  return pole({
    ref_id: `pole-${rola}`,
    bay_role: rola,
    bus_ref: 'szyna-sn',
    equipment_refs: ['q1', 'f1', 'kab'],
    primary_devices: aparaty,
  });
}

function odpowiedz(stan: 'MODEL' | 'PROPOZYCJA' | 'BRAK_DANYCH'): DomainOpResponseV1 {
  return {
    snapshot: {},
    wyposazenie_pola: {
      bay_ref: 'pole',
      stan_danych: stan,
      aparaty: [],
      dane_przyjete:
        stan === 'PROPOZYCJA'
          ? [{ nazwa_pl: 'Wyłącznik Q1', wartosc: 'CB', powod_pl: 'aparat z szablonu bez pozycji', jakosc: 'ESTIMATED' }]
          : [],
    },
  } as unknown as DomainOpResponseV1;
}

beforeEach(() => {
  katalogApi.fetchMvApparatusTypes.mockResolvedValue([
    { id: 'wyl-1', name: 'Wyłącznik 630 A', device_kind: 'WYLACZNIK', u_n_kv: 24, i_n_a: 630 },
    { id: 'rek-1', name: 'Reklozer', device_kind: 'REKLOZER', u_n_kv: 24, i_n_a: 630 },
    { id: 'roz-1', name: 'Rozłącznik', device_kind: 'ROZLACZNIK', u_n_kv: 24, i_n_a: 630 },
    { id: 'odl-1', name: 'Odłącznik', device_kind: 'ODLACZNIK', u_n_kv: 24, i_n_a: 630 },
    { id: 'uz-1', name: 'Uziemnik', device_kind: 'UZIEMNIK', u_n_kv: 24, i_n_a: 630 },
  ]);
  katalogApi.fetchCtTypes.mockResolvedValue([{ id: 'ct-1', name: 'Przekładnik 200/5' }]);
  katalogApi.fetchVtTypes.mockResolvedValue([{ id: 'vt-1', name: 'Przekładnik 15/0,1' }]);
  katalogApi.fetchSurgeArresterTypes.mockResolvedValue([{ id: 'og-1', name: 'Ogranicznik 18 kV' }]);
  katalogApi.fetchCompleteBayTemplates.mockResolvedValue(
    ROLE.map((rola) => ({ template_ref: `szablon-${rola}`, template_name_pl: `Szablon ${rola}`, bay_role: rola })),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderuj(bay: Bay, wykonaj: ReturnType<typeof vi.fn>, opcje: { caseId?: string | null; blad?: string } = {}) {
  render(
    <EdytorWyposazeniaPola
      bay={bay}
      snapshot={MIGAWKA}
      stanDanych="BRAK_DANYCH"
      danePrzyjete={[]}
      activeCaseId={opcje.caseId === undefined ? 'case-1' : opcje.caseId}
      executeDomainOperation={wykonaj as never}
      bladStore={() => opcje.blad ?? null}
    />,
  );
}

async function otworz(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('wyposazenie-pola-edytuj'));
  await waitFor(() => expect(katalogApi.fetchCompleteBayTemplates).toHaveBeenCalled());
}

describe('EdytorWyposazeniaPola — tryb × rola pola SN × odpowiedź', () => {
  const przypadki: Array<[string, 'katalog' | 'szablon' | 'wyczysc', Rola]> = [];
  for (const tryb of ['katalog', 'szablon', 'wyczysc'] as const) {
    for (const rola of ROLE) przypadki.push([`${tryb} × ${rola}`, tryb, rola]);
  }

  it.each(przypadki)('%s: ładunek operacji i wynik na karcie', async (_opis, tryb, rola) => {
    const user = userEvent.setup();
    const stanWyniku = tryb === 'katalog' ? 'MODEL' : tryb === 'szablon' ? 'PROPOZYCJA' : 'BRAK_DANYCH';
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz(stanWyniku));
    renderuj(polePola(rola), wykonaj);
    await otworz(user);

    await user.selectOptions(screen.getByTestId('wyposazenie-pola-tryb'), tryb);
    if (tryb === 'katalog') {
      await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), 'CB');
      await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-umiejscowienie'), 'MIDSTREAM');
      await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-katalog'), 'wyl-1');
      await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-lacznik'), 'q1');
      await user.type(screen.getByTestId('wyposazenie-pola-aparat-0-oznaczenie'), 'Q1');
    }
    if (tryb === 'szablon') {
      // Lista szablonów zawężona do roli pola (inne role backend odrzuca).
      const opcje = Array.from(
        (screen.getByTestId('wyposazenie-pola-szablon') as HTMLSelectElement).options,
      ).map((o) => o.value);
      expect(opcje).toEqual(['', `szablon-${rola}`]);
      await user.selectOptions(screen.getByTestId('wyposazenie-pola-szablon'), `szablon-${rola}`);
    }
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));

    const oczekiwany =
      tryb === 'katalog'
        ? {
            bay_ref: `pole-${rola}`,
            mode: 'katalog',
            devices: [{ kind: 'CB', placement: 'MIDSTREAM', catalog_ref: 'wyl-1', linked_ref: 'q1', designation: 'Q1' }],
          }
        : tryb === 'szablon'
          ? { bay_ref: `pole-${rola}`, mode: 'szablon', bay_template_ref: `szablon-${rola}` }
          : { bay_ref: `pole-${rola}`, mode: 'wyczysc' };
    expect(wykonaj).toHaveBeenCalledWith('case-1', 'set_bay_equipment', oczekiwany);

    const wynik = await screen.findByTestId('wyposazenie-pola-wynik');
    expect(wynik.getAttribute('data-stan')).toBe(stanWyniku);
    // Dane przyjęte (jakość szacowana) widoczne wyłącznie, gdy backend je zwrócił.
    expect(screen.queryByTestId('wyposazenie-pola-wynik-dane-przyjete') !== null).toBe(tryb === 'szablon');
    // Po zapisie edytor wraca do karty — formularz zamknięty.
    expect(screen.queryByTestId('wyposazenie-pola-tryb')).toBeNull();
  });

  it.each(ROLE)('%s: odmowa backendu zostaje w formularzu ze zdaniem i bez wyniku', async (rola) => {
    const user = userEvent.setup();
    const wykonaj = vi.fn().mockResolvedValue({
      snapshot: null,
      error: 'Pozycja katalogowa „rek-1" nie jest wyłącznikiem tej rodziny rozdzielnicy.',
      error_code: 'bay_equipment.catalog_kind_mismatch',
    });
    renderuj(polePola(rola), wykonaj);
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-tryb'), 'wyczysc');
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    expect(await screen.findByTestId('wyposazenie-pola-blad')).toHaveTextContent('nie jest wyłącznikiem');
    expect(screen.queryByTestId('wyposazenie-pola-wynik')).toBeNull();
    expect(screen.getByTestId('wyposazenie-pola-tryb')).toBeInTheDocument();
  });

  it('brak odpowiedzi (błąd sieci): komunikat magazynu w formularzu', async () => {
    const user = userEvent.setup();
    const wykonaj = vi.fn().mockResolvedValue(null);
    renderuj(polePola('OUT'), wykonaj, { blad: 'Serwer niedostępny' });
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-tryb'), 'wyczysc');
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    expect(await screen.findByTestId('wyposazenie-pola-blad')).toHaveTextContent('Serwer niedostępny');
  });
});

describe('EdytorWyposazeniaPola — kształt formularza', () => {
  it('karta bez otwarcia edycji nie odpytuje katalogu', () => {
    renderuj(polePola('OUT'), vi.fn());
    expect(screen.getByTestId('wyposazenie-pola-stan').getAttribute('data-stan')).toBe('BRAK_DANYCH');
    expect(katalogApi.fetchMvApparatusTypes).not.toHaveBeenCalled();
    expect(katalogApi.fetchCompleteBayTemplates).not.toHaveBeenCalled();
  });

  it.each([
    ['CB', ['', 'wyl-1', 'rek-1']],
    ['LOAD_SWITCH', ['', 'roz-1']],
    ['DS', ['', 'odl-1']],
    ['ES', ['', 'uz-1']],
    ['CT', ['', 'ct-1']],
    ['VT', ['', 'vt-1']],
    ['SURGE_ARRESTER', ['', 'og-1']],
    ['FUSE', null],
    ['CABLE_HEAD', null],
    ['TRANSFORMER_DEVICE', null],
  ] as const)('rodzaj %s: pozycje katalogu tylko jego przestrzeni i rodzaju', async (rodzaj, pozycje) => {
    const user = userEvent.setup();
    renderuj(polePola('OUT'), vi.fn());
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), rodzaj);
    if (pozycje === null) {
      expect(screen.queryByTestId('wyposazenie-pola-aparat-0-katalog')).toBeNull();
      expect(screen.getByTestId('wyposazenie-pola-aparat-0-bez-katalogu')).toBeInTheDocument();
    } else {
      await waitFor(() =>
        expect(
          Array.from((screen.getByTestId('wyposazenie-pola-aparat-0-katalog') as HTMLSelectElement).options).map(
            (o) => o.value,
          ),
        ).toEqual(pozycje),
      );
    }
    const zGalezia = ['CB', 'LOAD_SWITCH', 'DS', 'FUSE'].includes(rodzaj);
    expect(screen.queryByTestId('wyposazenie-pola-aparat-0-lacznik') !== null).toBe(zGalezia);
    expect(screen.queryByTestId('wyposazenie-pola-aparat-0-uziemienie') !== null).toBe(
      ['ES', 'SURGE_ARRESTER'].includes(rodzaj),
    );
  });

  it('łącznik aparatu wyłącznie z gałęzi łącznikowych tego pola (bez kabla i łącznika obcego)', async () => {
    const user = userEvent.setup();
    renderuj(polePola('OUT'), vi.fn());
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), 'DS');
    const opcje = Array.from(
      (screen.getByTestId('wyposazenie-pola-aparat-0-lacznik') as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(opcje).toEqual(['', 'f1', 'q1']);
  });

  it('zmiana rodzaju czyści pozycję katalogową i łącznik (zero przeniesionych fantomów)', async () => {
    const user = userEvent.setup();
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz('PROPOZYCJA'));
    renderuj(polePola('OUT'), wykonaj);
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), 'CB');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-umiejscowienie'), 'MIDSTREAM');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-katalog'), 'wyl-1');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-lacznik'), 'q1');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), 'CABLE_HEAD');
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    expect(wykonaj).toHaveBeenCalledWith('case-1', 'set_bay_equipment', {
      bay_ref: 'pole-OUT',
      mode: 'katalog',
      devices: [{ kind: 'CABLE_HEAD', placement: 'MIDSTREAM' }],
    });
  });

  it('wiersze startowe z aparatów pola; zapis zablokowany dla niekompletnego wiersza i bez zakresu', async () => {
    const user = userEvent.setup();
    renderuj(
      polePola('OUT', [
        { device_ref: 'd1', symbol_ref: 's', kind: 'CB', placement: 'MIDSTREAM', catalog_ref: 'wyl-1', linked_ref: 'q1' },
        { device_ref: 'd2', symbol_ref: 's', kind: 'PV_INVERTER' as never, placement: 'OFF_PATH' },
      ] as never),
      vi.fn(),
      { caseId: null },
    );
    await otworz(user);
    expect((screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj') as HTMLSelectElement).value).toBe('CB');
    expect(screen.queryByTestId('wyposazenie-pola-aparat-1')).toBeNull();
    expect(screen.getByTestId('wyposazenie-pola-zapisz')).toBeDisabled();
  });

  it('ponowne otwarcie startuje od bieżącego rekordu pola (nowe aparaty po zapisie)', async () => {
    const user = userEvent.setup();
    const wykonaj = vi.fn();
    const { rerender } = render(
      <EdytorWyposazeniaPola
        bay={polePola('OUT')}
        snapshot={MIGAWKA}
        stanDanych="BRAK_DANYCH"
        danePrzyjete={[]}
        activeCaseId="case-1"
        executeDomainOperation={wykonaj as never}
      />,
    );
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), 'CT');
    await user.click(screen.getByTestId('wyposazenie-pola-anuluj'));
    rerender(
      <EdytorWyposazeniaPola
        bay={polePola('OUT', [
          { device_ref: 'd1', symbol_ref: 's', kind: 'VT', placement: 'DOWNSTREAM', catalog_ref: 'vt-1' },
        ] as never)}
        snapshot={MIGAWKA}
        stanDanych="MODEL"
        danePrzyjete={[]}
        activeCaseId="case-1"
        executeDomainOperation={wykonaj as never}
      />,
    );
    await user.click(screen.getByTestId('wyposazenie-pola-edytuj'));
    expect((screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj') as HTMLSelectElement).value).toBe('VT');
    expect(screen.getByTestId('wyposazenie-pola-stan').getAttribute('data-stan')).toBe('MODEL');
  });

  it('Anuluj zamyka edycję bez zapisu', async () => {
    const user = userEvent.setup();
    const wykonaj = vi.fn();
    renderuj(polePola('OUT'), wykonaj);
    await otworz(user);
    await user.click(screen.getByTestId('wyposazenie-pola-anuluj'));
    expect(screen.queryByTestId('wyposazenie-pola-tryb')).toBeNull();
    expect(wykonaj).not.toHaveBeenCalled();
  });

  it('błąd katalogu nazwany w formularzu', async () => {
    const user = userEvent.setup();
    katalogApi.fetchCtTypes.mockRejectedValueOnce(new Error('Katalog niedostępny'));
    renderuj(polePola('OUT'), vi.fn());
    await user.click(screen.getByTestId('wyposazenie-pola-edytuj'));
    expect(await screen.findByTestId('wyposazenie-pola-blad-katalogu')).toHaveTextContent('Katalog niedostępny');
  });
});
