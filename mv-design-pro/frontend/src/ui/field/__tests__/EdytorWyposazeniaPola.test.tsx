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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Bay, DanaPrzyjetaWyposazenia, DomainOpResponseV1, EnergyNetworkModel } from '../../../types/enm';
import { pole } from '../../../test/pola';

const katalogApi = vi.hoisted(() => ({
  fetchMvApparatusTypes: vi.fn(),
  fetchCtTypes: vi.fn(),
  fetchVtTypes: vi.fn(),
  fetchSurgeArresterTypes: vi.fn(),
  fetchCompleteBayTemplates: vi.fn(),
  fetchSzablonyPolaKanoniczne: vi.fn(),
}));

vi.mock('../../catalog/api', async (oryginal) => ({
  // Stałe słowników (nazwy statusu weryfikacji) z modułu rzeczywistego; pobieranie — atrapy.
  ...(await oryginal<typeof import('../../catalog/api')>()),
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
    { id: 'wyl-1', name: 'Wyłącznik 630 A', device_kind: 'WYLACZNIK', dopuszczony_do_nowych_pol: true, u_n_kv: 24, i_n_a: 630 },
    { id: 'rek-1', name: 'Reklozer', device_kind: 'REKLOZER', dopuszczony_do_nowych_pol: true, u_n_kv: 24, i_n_a: 630 },
    { id: 'roz-1', name: 'Rozłącznik', device_kind: 'ROZLACZNIK', dopuszczony_do_nowych_pol: true, u_n_kv: 24, i_n_a: 630 },
    { id: 'odl-1', name: 'Odłącznik', device_kind: 'ODLACZNIK', dopuszczony_do_nowych_pol: true, u_n_kv: 24, i_n_a: 630 },
    { id: 'uz-1', name: 'Uziemnik', device_kind: 'UZIEMNIK', dopuszczony_do_nowych_pol: true, u_n_kv: 24, i_n_a: 630 },
  ]);
  katalogApi.fetchCtTypes.mockResolvedValue([{ id: 'ct-1', name: 'Przekładnik 200/5' }]);
  katalogApi.fetchVtTypes.mockResolvedValue([{ id: 'vt-1', name: 'Przekładnik 15/0,1' }]);
  katalogApi.fetchSurgeArresterTypes.mockResolvedValue([{ id: 'og-1', name: 'Ogranicznik 18 kV' }]);
  katalogApi.fetchCompleteBayTemplates.mockResolvedValue(
    ROLE.map((rola) => ({ template_ref: `szablon-${rola}`, template_name_pl: `Szablon ${rola}`, bay_role: rola })),
  );
  katalogApi.fetchSzablonyPolaKanoniczne.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderuj(
  bay: Bay,
  wykonaj: ReturnType<typeof vi.fn>,
  opcje: { caseId?: string | null; blad?: string; danePrzyjete?: readonly DanaPrzyjetaWyposazenia[] } = {},
) {
  render(
    <EdytorWyposazeniaPola
      bay={bay}
      snapshot={MIGAWKA}
      stanDanych="BRAK_DANYCH"
      danePrzyjete={opcje.danePrzyjete ?? []}
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

  // Iloczyn: dane przyjęte z odczytu pola {są} × zapis {przed, po}. Adnotacja z tym samym
  // powodem stoi na karcie RAZ — przed zapisem z odczytu pola, po zapisie z odpowiedzi operacji.
  it('dane przyjęte: jedna lista naraz — po zapisie odpowiedź operacji zastępuje odczyt pola', async () => {
    const user = userEvent.setup();
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz('PROPOZYCJA'));
    renderuj(polePola('OUT'), wykonaj, {
      danePrzyjete: [{ nazwa_pl: 'Wyłącznik Q1', wartosc: 'CB', powod_pl: 'aparat z szablonu bez pozycji', jakosc: 'ESTIMATED' }],
    });
    expect(screen.getAllByText(/aparat z szablonu bez pozycji/)).toHaveLength(1);
    expect(screen.getByTestId('wyposazenie-pola-dane-przyjete')).toBeTruthy();
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-tryb'), 'szablon');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-szablon'), 'szablon-OUT');
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    await screen.findByTestId('wyposazenie-pola-wynik');
    expect(screen.queryByTestId('wyposazenie-pola-dane-przyjete')).toBeNull();
    expect(screen.getByTestId('wyposazenie-pola-wynik-dane-przyjete')).toBeTruthy();
    expect(screen.getAllByText(/aparat z szablonu bez pozycji/)).toHaveLength(1);
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

/**
 * Zakaz gazów fluorowanych w aparatach projektowanych — iloczyn cech: stan pola {PROJEKTOWANY,
 * ISTNIEJACY} × stan wiersza {bez zmian/nowy, ISTNIEJACY (inwentaryzacja)} × pozycja wiersza
 * {brak, już przypisana z SF₆}. Wiersz wybierany dla aparatu projektowanego widzi wyłącznie
 * pozycje dopuszczone backendem; inwentaryzacja aparatu zastanego widzi cały katalog; pozycja już
 * przypisana zostaje widoczna. Selektor stanu wiersza istnieje wyłącznie w polu istniejącym.
 */
describe('EdytorWyposazeniaPola — aparaty z gazem fluorowanym', () => {
  const POWOD = 'Aparat Wyłącznik SF6 wykorzystuje gaz fluorowany (SF₆).';
  beforeEach(() => {
    katalogApi.fetchMvApparatusTypes.mockResolvedValue([
      { id: 'wyl-sf6', name: 'Wyłącznik SF6', device_kind: 'WYLACZNIK', medium: 'SF6', dopuszczony_do_nowych_pol: false, powod_blokady_nowych_pol_pl: POWOD, u_n_kv: 24, i_n_a: 630 },
      { id: 'wyl-1', name: 'Wyłącznik 630 A', device_kind: 'WYLACZNIK', medium: 'VACUUM', dopuszczony_do_nowych_pol: true, u_n_kv: 24, i_n_a: 630 },
    ]);
  });

  async function opcjeWiersza(): Promise<string[]> {
    let opcje: string[] = [];
    await waitFor(() => {
      opcje = Array.from((screen.getByTestId('wyposazenie-pola-aparat-0-katalog') as HTMLSelectElement).options).map((o) => o.value);
      expect(opcje).toContain('wyl-1');
    });
    return opcje;
  }

  it.each([
    ['PROJEKTOWANY', '', ['', 'wyl-1'], true],
    ['ISTNIEJACY', '', ['', 'wyl-1'], true],
    ['ISTNIEJACY', 'ISTNIEJACY', ['', 'wyl-sf6', 'wyl-1'], false],
  ] as const)('pole %s × wiersz „%s" → pozycje %j, nota %s', async (stanPola, stanWiersza, oczekiwane, nota) => {
    const user = userEvent.setup();
    renderuj({ ...polePola('OUT'), stan_obiektu: stanPola } as Bay, vi.fn());
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), 'CB');
    if (stanPola === 'ISTNIEJACY') {
      await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-stan'), stanWiersza);
    } else {
      expect(screen.queryByTestId('wyposazenie-pola-aparat-0-stan')).toBeNull();
    }
    expect(await opcjeWiersza()).toEqual(oczekiwane);
    expect(screen.getByTestId('wyposazenie-pola-aparat-0-katalog').textContent).toContain('próżnia');
    const elNota = screen.queryByTestId('wyposazenie-pola-nota-ukrytych');
    if (nota) {
      expect(elNota?.textContent).toBe(`Ukryto pozycje niedopuszczone do obiektu projektowanego: 1. Przykład: ${POWOD}`);
    } else {
      expect(elNota).toBeNull();
    }
  });

  it('inwentaryzacja aparatu zastanego z SF₆ trafia do operacji ze stanem ISTNIEJACY', async () => {
    const user = userEvent.setup();
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz('MODEL'));
    renderuj({ ...polePola('OUT'), stan_obiektu: 'ISTNIEJACY' } as Bay, wykonaj);
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), 'CB');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-umiejscowienie'), 'MIDSTREAM');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-stan'), 'ISTNIEJACY');
    await opcjeWiersza();
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-katalog'), 'wyl-sf6');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-lacznik'), 'q1');
    expect(screen.getByTestId('wyposazenie-pola-zapisz')).toBeEnabled();
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    expect(wykonaj).toHaveBeenCalledWith(
      'case-1',
      'set_bay_equipment',
      expect.objectContaining({
        devices: [expect.objectContaining({ kind: 'CB', catalog_ref: 'wyl-sf6', stan_obiektu: 'ISTNIEJACY' })],
      }),
    );
  });

  it('aparat już przypisany z SF₆ zostaje widoczny w wierszu pola projektowanego (inne SF₆ — nie)', async () => {
    const user = userEvent.setup();
    renderuj(
      polePola('OUT', [
        { device_ref: 'd1', symbol_ref: 's', kind: 'CB', placement: 'MIDSTREAM', catalog_ref: 'wyl-sf6', linked_ref: 'q1' },
      ] as never),
      vi.fn(),
    );
    await otworz(user);
    expect(await opcjeWiersza()).toEqual(['', 'wyl-sf6', 'wyl-1']);
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

/** Szablon kanoniczny z oceną backendu (kształt `GET /api/catalog/bay-templates`). */
function kanoniczny(ref: string, dopuszczony: boolean, wykonanie: string | null = 'Z10') {
  return {
    template_ref: ref,
    template_name_pl: `Szablon ${ref}`,
    bay_role: 'OUT',
    podstawa: 'ENEA Zeszyt 1, Z.10 (s.89)',
    wykonanie_pola: wykonanie,
    wykonanie_pola_pl: wykonanie ? 'pole linii odpływowej SN (ENEA Z.10)' : null,
    wykonanie_lacznikow: 'TROJPOLOZENIOWY',
    wykonanie_lacznikow_pl: 'łącznik trójpołożeniowy przy szynie',
    tylko_gpz: true,
    funkcje_eaz: ['51', '50', '67N'],
    funkcje_eaz_pl: ['I> (51) — nadprądowe zwłoczne', 'I>> (50) — nadprądowe zwarciowe', 'I0> (67N) — ziemnozwarciowe kierunkowe'],
    dopuszczony,
    odmowy: dopuszczony ? [] : [{ kod: 'pole.szablon_tylko_gpz', komunikat_pl: `Powód odmowy ${ref}.` }],
  };
}

describe('EdytorWyposazeniaPola — szablony kanoniczne z oceną backendu i klasa pola liniowego', () => {
  const polaGpz = (klasa: Bay['klasa_pola'] = null, rodzina: string | null = 'rodzina-x') =>
    pole({
      ref_id: 'pole-gpz',
      bay_role: 'OUT',
      bus_ref: 'szyna-sn',
      gpz_section_id: 'sekcja-1',
      switchgear_family_ref: rodzina,
      klasa_pola: klasa,
      equipment_refs: ['q1'],
      primary_devices: [],
    });

  it('cechy pola idą do backendu; dopuszczony szablon jest opcją, odrzucony — powodem pod listą', async () => {
    const user = userEvent.setup();
    katalogApi.fetchSzablonyPolaKanoniczne.mockResolvedValue([kanoniczny('z10-a', true), kanoniczny('z10-b', false)]);
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz('PROPOZYCJA'));
    renderuj(polaGpz('ODBIORCZE'), wykonaj);
    await otworz(user);
    expect(katalogApi.fetchSzablonyPolaKanoniczne).toHaveBeenCalledWith({
      bayRole: 'OUT',
      poleGpz: true,
      switchgearFamilyRef: 'rodzina-x',
      klasaPola: 'ODBIORCZE',
    });
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-tryb'), 'szablon');
    await waitFor(() =>
      expect(
        Array.from((screen.getByTestId('wyposazenie-pola-szablon') as HTMLSelectElement).options).map((o) => o.value),
      ).toEqual(['', 'szablon-OUT', 'z10-a']),
    );
    expect(screen.getByTestId('wyposazenie-pola-szablon-niedostepny-z10-b')).toHaveTextContent('Powód odmowy z10-b.');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-szablon'), 'z10-a');
    expect(screen.getByTestId('wyposazenie-pola-szablon-opis')).toHaveTextContent('Funkcje zabezpieczeniowe pola:');
    // Nazwy funkcji ze słownika EAZ backendu, w kolejności kodów zestawu (bez kopii słownika).
    const funkcje = within(screen.getByTestId('wyposazenie-pola-szablon-funkcje-eaz')).getAllByRole('listitem');
    expect(funkcje.map((li) => [li.getAttribute('data-kod'), li.textContent])).toEqual([
      ['51', 'I> (51) — nadprądowe zwłoczne'],
      ['50', 'I>> (50) — nadprądowe zwarciowe'],
      ['67N', 'I0> (67N) — ziemnozwarciowe kierunkowe'],
    ]);
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    expect(wykonaj).toHaveBeenCalledWith('case-1', 'set_bay_equipment', {
      bay_ref: 'pole-gpz',
      mode: 'szablon',
      bay_template_ref: 'z10-a',
    });
  });

  // Iloczyn: tryb {katalog, szablon, wyczysc} × zmiana klasy {bez zmiany, ustawiona, wyczyszczona}.
  const przypadkiKlasy: Array<[string, 'katalog' | 'szablon' | 'wyczysc', 'bez' | 'ustaw' | 'wyczysc']> = [];
  for (const tryb of ['katalog', 'szablon', 'wyczysc'] as const) {
    for (const zmiana of ['bez', 'ustaw', 'wyczysc'] as const) przypadkiKlasy.push([`${tryb} × ${zmiana}`, tryb, zmiana]);
  }
  it.each(przypadkiKlasy)('%s: klasa pola w ładunku wyłącznie po zmianie', async (_opis, tryb, zmiana) => {
    const user = userEvent.setup();
    katalogApi.fetchSzablonyPolaKanoniczne.mockResolvedValue([kanoniczny('z11-a', true, 'Z11')]);
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz('PROPOZYCJA'));
    renderuj(polaGpz('ODBIORCZE'), wykonaj);
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-tryb'), tryb);
    const klasa = await screen.findByTestId('wyposazenie-pola-klasa');
    expect((klasa as HTMLSelectElement).value).toBe('ODBIORCZE');
    if (zmiana === 'ustaw') await user.selectOptions(klasa, 'MIESZANE');
    if (zmiana === 'wyczysc') await user.selectOptions(klasa, '');
    if (zmiana === 'ustaw') {
      // Ocena szablonów przeliczona dla klasy PO zapisie (ta sama reguła co strażnik operacji).
      await waitFor(() =>
        expect(katalogApi.fetchSzablonyPolaKanoniczne).toHaveBeenLastCalledWith(
          expect.objectContaining({ klasaPola: 'MIESZANE' }),
        ),
      );
    }
    if (tryb === 'katalog') {
      await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), 'CABLE_HEAD');
      await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-umiejscowienie'), 'DOWNSTREAM');
    }
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    const ladunek = wykonaj.mock.calls[0][2] as Record<string, unknown>;
    if (zmiana === 'bez') expect('klasa_pola' in ladunek).toBe(false);
    if (zmiana === 'ustaw') expect(ladunek.klasa_pola).toBe('MIESZANE');
    if (zmiana === 'wyczysc') expect(ladunek.klasa_pola).toBeNull();
    expect(ladunek.mode).toBe(tryb);
  });

  it('pole spoza GPZ albo funkcji bez szablonu pola liniowego nie ma wyboru klasy', async () => {
    const user = userEvent.setup();
    katalogApi.fetchSzablonyPolaKanoniczne.mockResolvedValue([kanoniczny('inny', true, null)]);
    renderuj(polaGpz(null), vi.fn());
    await otworz(user);
    await waitFor(() => expect(katalogApi.fetchSzablonyPolaKanoniczne).toHaveBeenCalled());
    expect(screen.queryByTestId('wyposazenie-pola-klasa')).toBeNull();
    cleanup();
    katalogApi.fetchSzablonyPolaKanoniczne.mockResolvedValue([kanoniczny('z10-a', true)]);
    renderuj(polePola('OUT'), vi.fn());
    await otworz(user);
    expect(katalogApi.fetchSzablonyPolaKanoniczne).toHaveBeenLastCalledWith(expect.objectContaining({ poleGpz: false }));
    expect(screen.queryByTestId('wyposazenie-pola-klasa')).toBeNull();
  });

  it('odgałęzienie toru aparatu wraca do operacji (ponowny zapis odtwarza porty odgałęzienia)', async () => {
    const user = userEvent.setup();
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz('MODEL'));
    renderuj(
      polePola('OUT', [
        { device_ref: 'd1', symbol_ref: 's', kind: 'CB', placement: 'MIDSTREAM', catalog_ref: 'wyl-1', linked_ref: 'q1' },
        { device_ref: 'd2', symbol_ref: 's', kind: 'CABLE_HEAD', placement: 'DOWNSTREAM', odgalezienie: 'pn' },
        { device_ref: 'd3', symbol_ref: 's', kind: 'VT', placement: 'DOWNSTREAM', catalog_ref: 'vt-1', odgalezienie: 'pn' },
      ] as never),
      wykonaj,
    );
    await otworz(user);
    expect((screen.getByTestId('wyposazenie-pola-aparat-0-odgalezienie') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('wyposazenie-pola-aparat-1-odgalezienie') as HTMLInputElement).value).toBe('pn');
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    const urzadzenia = (wykonaj.mock.calls[0][2] as { devices: Array<Record<string, unknown>> }).devices;
    expect(urzadzenia.map((d) => d.odgalezienie ?? null)).toEqual([null, 'pn', 'pn']);
  });

  // Iloczyn: rodzaj aparatu {przekładnik Ferrantiego, przekładnik prądowy} × przekładnia w rekordzie
  // {zapisana, brak}. Przekładnia wraca do operacji WYŁĄCZNIE dla przekładnika Ferrantiego; pole
  // edycji istnieje tylko przy tym rodzaju (zero kontrolki, którą backend odrzuci).
  it('przekładnia przekładnika Ferrantiego wraca do operacji; inny rodzaj nie ma pola przekładni', async () => {
    const user = userEvent.setup();
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz('MODEL'));
    renderuj(
      polePola('OUT', [
        { device_ref: 'd1', symbol_ref: 's', kind: 'CT', placement: 'MIDSTREAM', catalog_ref: 'ct-1' },
        { device_ref: 'd2', symbol_ref: 's', kind: 'CORE_BALANCE_CT', placement: 'DOWNSTREAM', przekladnia: '1/100' },
        { device_ref: 'd3', symbol_ref: 's', kind: 'CORE_BALANCE_CT', placement: 'DOWNSTREAM' },
      ] as never),
      wykonaj,
    );
    await otworz(user);
    expect(screen.queryByTestId('wyposazenie-pola-aparat-0-przekladnia')).toBeNull();
    expect((screen.getByTestId('wyposazenie-pola-aparat-1-przekladnia') as HTMLInputElement).value).toBe('1/100');
    await user.type(screen.getByTestId('wyposazenie-pola-aparat-2-przekladnia'), '1/50');
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    const urzadzenia = (wykonaj.mock.calls[0][2] as { devices: Array<Record<string, unknown>> }).devices;
    expect(urzadzenia.map((d) => d.przekladnia ?? null)).toEqual([null, '1/100', '1/50']);
  });

  it('wykonanie wyłącznika (stałe / wysuwne): wybór tylko przy wyłączniku, wartość z rekordu wraca, zmiana trafia do ładunku, zmiana rodzaju ją zdejmuje', async () => {
    // Rozstrzygnięcie architekta 2026-10-30 pkt 3 — iloczyn: rodzaj {CB, rozłącznik} × wartość
    // rekordu {wysuwne, brak} × akcja {bez zmiany, wybór stałe, zmiana rodzaju}.
    const user = userEvent.setup();
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz('MODEL'));
    renderuj(
      polePola('OUT', [
        { device_ref: 'd1', symbol_ref: 's', kind: 'CB', placement: 'MIDSTREAM', catalog_ref: 'cb-1', wykonanie: 'WYSUWNE' },
        { device_ref: 'd2', symbol_ref: 's', kind: 'CB', placement: 'MIDSTREAM', catalog_ref: 'cb-1' },
        { device_ref: 'd3', symbol_ref: 's', kind: 'LOAD_SWITCH', placement: 'MIDSTREAM', catalog_ref: 'ls-1' },
        { device_ref: 'd4', symbol_ref: 's', kind: 'CB', placement: 'MIDSTREAM', catalog_ref: 'cb-1', wykonanie: 'WYSUWNE' },
      ] as never),
      wykonaj,
    );
    await otworz(user);
    expect((screen.getByTestId('wyposazenie-pola-aparat-0-wykonanie') as HTMLSelectElement).value).toBe('WYSUWNE');
    expect((screen.getByTestId('wyposazenie-pola-aparat-1-wykonanie') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByTestId('wyposazenie-pola-aparat-2-wykonanie')).toBeNull();
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-1-wykonanie'), 'STALE');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-3-rodzaj'), 'LOAD_SWITCH');
    expect(screen.queryByTestId('wyposazenie-pola-aparat-3-wykonanie')).toBeNull();
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    const urzadzenia = (wykonaj.mock.calls[0][2] as { devices: Array<Record<string, unknown>> }).devices;
    expect(urzadzenia.map((d) => d.wykonanie ?? null)).toEqual(['WYSUWNE', 'STALE', null, null]);
  });
});

describe('EdytorWyposazeniaPola — profil funkcjonalny EAZ wzorca', () => {
  it('profil z backendu: wymagalność każdej funkcji, funkcja spoza rysunku nazwana, wymogi klas w podpowiedzi', async () => {
    const user = userEvent.setup();
    const profil = [
      {
        kod: '51',
        opis_pl: 'I> (51) — nadprądowe zwłoczne',
        wymagalnosc: 'OBOWIAZKOWA',
        wymagalnosc_pl: 'obowiązkowa w każdej klasie pola, w której wykonanie jest dopuszczone',
        na_rysunku: true,
        wymogi: [{ klasa: 'ODBIORCZE', wymog: 'OBOWIAZKOWA', wymog_pl: 'wymagana', podstawa: 'IRiESD II.4.5.4.2.1 pkt 1', weryfikacja: 'ODCZYT_TEKSTU' }],
      },
      {
        kod: '81U',
        opis_pl: 'f< (81U) — podczęstotliwościowe',
        wymagalnosc: 'OBOWIAZKOWA',
        wymagalnosc_pl: 'obowiązkowa w każdej klasie pola, w której wykonanie jest dopuszczone',
        na_rysunku: false,
        wymogi: [{ klasa: 'ODBIORCZE', wymog: 'OBOWIAZKOWA', wymog_pl: 'wymagana', podstawa: 'IRiESD II.4.5.4.2.1 pkt 5', weryfikacja: 'ODCZYT_TEKSTU' }],
      },
      {
        // Decyzja właściciela 2026-10-29 pkt 4: funkcja warunkowa — wariantowa, z warunkiem
        // przypisania (tekst backendu `OPIS_WARUNKU_FUNKCJI_EAZ_PL`).
        kod: '67N',
        opis_pl: 'Io> kierunkowe (67N) — ziemnozwarciowe kierunkowe (wejścia Io i U0)',
        wymagalnosc: 'WARIANTOWA',
        wymagalnosc_pl:
          'zależna od klasy pola, od rodzaju linii (IRiESD II.4.5.4.2) albo od warunku przypisania (źródło wielkości wejściowej funkcji w modelu)',
        na_rysunku: true,
        wymogi: [{ klasa: 'ODBIORCZE', wymog: 'OBOWIAZKOWA', wymog_pl: 'wymagana', podstawa: 'IRiESD II.4.5.4.2.1 pkt 2', weryfikacja: 'ODCZYT_TEKSTU' }],
        warunek_pl:
          'przypisana wyłącznie przy źródle napięcia zerowego 3U₀ powiązanym w modelu — uzwojeniu otwartego trójkąta przekładnika napięciowego pola pomiaru napięcia szyn tej samej sekcji (ENEA Zeszyt 1, Z.17 s.97, obwód okrężny „Z, Zz”) albo tego pola — i kryterium prądowym z przekładnika Ferrantiego pola',
      },
    ];
    katalogApi.fetchSzablonyPolaKanoniczne.mockResolvedValue([{ ...kanoniczny('z10-a', true), profil_eaz: profil }]);
    renderuj(
      pole({ ref_id: 'pole-gpz', bay_role: 'OUT', bus_ref: 'szyna-sn', gpz_section_id: 'sekcja-1', equipment_refs: ['q1'], primary_devices: [] }),
      vi.fn(),
    );
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-tryb'), 'szablon');
    await waitFor(() => expect(screen.getByTestId('wyposazenie-pola-szablon')).toBeTruthy());
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-szablon'), 'z10-a');
    const pozycje = within(screen.getByTestId('wyposazenie-pola-szablon-profil-eaz')).getAllByRole('listitem');
    expect(pozycje.map((li) => [li.getAttribute('data-kod'), li.getAttribute('data-wymagalnosc')])).toEqual([
      ['51', 'OBOWIAZKOWA'],
      ['81U', 'OBOWIAZKOWA'],
      ['67N', 'WARIANTOWA'],
    ]);
    expect(screen.getByTestId('wyposazenie-pola-profil-warunek-67N').textContent).toContain('3U₀');
    expect(screen.queryByTestId('wyposazenie-pola-profil-warunek-51')).toBeNull();
    expect(pozycje[0].textContent).not.toContain('poza rysunkiem');
    expect(pozycje[1].textContent).toContain('poza rysunkiem wzorca — wymóg klasy pola');
    expect(pozycje[1].getAttribute('title')).toContain('IRiESD II.4.5.4.2.1 pkt 5; odczyt tekstu');
    expect(pozycje[1].getAttribute('title')).toContain('pole odbiorcze');
  });
});
