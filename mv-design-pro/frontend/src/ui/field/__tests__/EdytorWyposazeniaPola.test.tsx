/**
 * KARTY W5-C i GPZ-H5-APARATURA — edytor wyposażenia pola (`set_bay_equipment`), ścieżka
 * projektanta: natywny klik „Zmień wyposażenie" → wybór trybu i aparatów → „Zapisz
 * wyposażenie" → ładunek operacji → skład pola z odpowiedzi albo odmowa backendu na karcie.
 *
 * Iloczyn cech: tryb {katalog, szablon, standard, wymagania, wyczysc} × rola pola SN {IN, OUT,
 * TR, FEEDER, COUPLER, MEASUREMENT, OZE} × odpowiedź {sukces ze składem, odmowa z kodem, brak
 * odpowiedzi}. Do tego reguły kształtu formularza: pozycje katalogu filtrowane rodzajem
 * (także przestrzeń ELEMENT_POLA_SN), gniazdo standardu tylko dla rodzaju gniazda, szablony
 * standardu zawężone do roli i poziomu napięcia szyny, łącznik wyłącznie z gałęzi TEGO pola,
 * zmiana rodzaju czyści pola nowego rodzaju, katalog odpytywany dopiero po otwarciu edycji,
 * status wiersza składu ZAWSZE ze zdaniem wyjaśnienia.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Bay, DomainOpResponseV1, EnergyNetworkModel, WierszSkladuPola } from '../../../types/enm';
import { pole } from '../../../test/pola';

const katalogApi = vi.hoisted(() => ({
  fetchMvApparatusTypes: vi.fn(),
  fetchCtTypes: vi.fn(),
  fetchVtTypes: vi.fn(),
  fetchSurgeArresterTypes: vi.fn(),
  fetchElementPolaTypes: vi.fn(),
  fetchCompleteBayTemplates: vi.fn(),
  fetchBayStandardTemplates: vi.fn(),
}));

vi.mock('../../catalog/api', () => ({
  ...katalogApi,
  getCatalogErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { EdytorWyposazeniaPola } from '../EdytorWyposazeniaPola';

const ROLE = ['IN', 'OUT', 'TR', 'FEEDER', 'COUPLER', 'MEASUREMENT', 'OZE'] as const;
type Rola = (typeof ROLE)[number];

const MIGAWKA = {
  buses: [{ ref_id: 'szyna-sn', voltage_kv: 15 }],
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

function wiersz(zmiany: Partial<WierszSkladuPola>): WierszSkladuPola {
  return {
    gniazdo_ref: null,
    gniazdo_nazwa_pl: null,
    rodzaj: 'CB',
    rodzaj_pl: 'wyłącznik',
    device_ref: 'pole::dev::0',
    linked_ref: null,
    catalog_ref: null,
    catalog_namespace: null,
    status: 'ZAPROJEKTOWANE',
    opis_pl: 'Aparat pola (wyłącznik) z pozycją katalogową wyl-1.',
    podstawa_pl: null,
    interpretacja_pl: null,
    wymagania: [],
    ...zmiany,
  };
}

/** Skład pola po zapisie w danym trybie — statusy, jakie liczy backend (`enm/sklad_pola.py`). */
const SKLAD_TRYBU: Readonly<Record<string, WierszSkladuPola[]>> = {
  katalog: [wiersz({ catalog_ref: 'wyl-1', catalog_namespace: 'APARAT_SN' })],
  szablon: [
    wiersz({ status: 'BRAK_POZYCJI_KATALOGU', opis_pl: 'Aparat pola (wyłącznik) nie ma pozycji katalogowej.' }),
  ],
  standard: [
    wiersz({
      gniazdo_ref: 'W',
      gniazdo_nazwa_pl: 'wyłącznik pola',
      status: 'WYMAGANE_STANDARDEM_BRAK',
      opis_pl: 'Gniazdo „wyłącznik pola” jest wymagane standardem, a pole nie ma w nim aparatu.',
      podstawa_pl: 'ENEA Zeszyt 1, zał. Z.2',
    }),
  ],
  wymagania: [
    wiersz({
      gniazdo_ref: 'W',
      gniazdo_nazwa_pl: 'wyłącznik pola',
      catalog_ref: 'enea-wym-sn-cb',
      opis_pl: 'Gniazdo „wyłącznik pola” obsadzone aparatem z katalogu (pozycja enea-wym-sn-cb).',
      podstawa_pl: 'ENEA Zeszyt 1, zał. Z.2',
    }),
  ],
  wyczysc: [],
};

function odpowiedz(sklad: WierszSkladuPola[]): DomainOpResponseV1 {
  return {
    snapshot: {},
    wyposazenie_pola: { bay_ref: 'pole', szablon_standardu_ref: null, sklad },
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
  katalogApi.fetchElementPolaTypes.mockResolvedValue([
    { id: 'wsk-1', name: 'Wskaźnik napięcia 24 kV', rodzaj: 'WSKAZNIK_NAPIECIA', u_m_kv: 24 },
    { id: 'tu-1', name: 'Transformator uziemiający', rodzaj: 'TRANSFORMATOR_UZIEMIAJACY' },
    { id: 'dl-1', name: 'Dławik gaszący', rodzaj: 'DLAWIK_GASZACY' },
    { id: 'rz-1', name: 'Rezystor uziemiający', rodzaj: 'REZYSTOR_UZIEMIAJACY' },
    { id: 'rw-1', name: 'Rezystor wymuszający', rodzaj: 'REZYSTOR_WYMUSZAJACY' },
    { id: 'bk-1', name: 'Bateria kondensatorów', rodzaj: 'BATERIA_KONDENSATOROW' },
  ]);
  // Szablony standardu (wyłącznie rozdzielnica SN): po jednym dla każdej roli — lista edytora
  // pokazuje szablony roli pola, a dla szyny spoza tabeli 3 IEC 60038 żadnego.
  katalogApi.fetchBayStandardTemplates.mockResolvedValue(
    ROLE.map((rola) => ({
      id: `STD_SN_${rola}`, nazwa_pl: `Pole SN ${rola}`, role_pola: [rola], podstawa_pl: 'ENEA', gniazda: [], uwagi_pl: null,
    })),
  );
  katalogApi.fetchCompleteBayTemplates.mockResolvedValue(
    ROLE.map((rola) => ({ template_ref: `szablon-${rola}`, template_name_pl: `Szablon ${rola}`, bay_role: rola })),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderuj(
  bay: Bay,
  wykonaj: ReturnType<typeof vi.fn>,
  opcje: {
    caseId?: string | null;
    blad?: string;
    sklad?: WierszSkladuPola[] | null;
    snapshot?: EnergyNetworkModel;
  } = {},
) {
  render(
    <EdytorWyposazeniaPola
      bay={bay}
      snapshot={opcje.snapshot ?? MIGAWKA}
      sklad={opcje.sklad === undefined ? [] : opcje.sklad}
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

type Tryb = 'katalog' | 'szablon' | 'standard' | 'wymagania' | 'wyczysc';

describe('EdytorWyposazeniaPola — tryb × rola pola SN × odpowiedź', () => {
  const przypadki: Array<[string, Tryb, Rola]> = [];
  for (const tryb of ['katalog', 'szablon', 'standard', 'wymagania', 'wyczysc'] as const) {
    for (const rola of ROLE) przypadki.push([`${tryb} × ${rola}`, tryb, rola]);
  }

  it.each([
    [66, false],
    [35, true],
    [15, true],
  ] as const)(
    'szyna %s kV: szablony standardu pola (tylko rozdzielnica SN, tabela 3 IEC 60038) — %s',
    async (napiecie, sa) => {
      const user = userEvent.setup();
      const migawka = { ...MIGAWKA, buses: [{ ref_id: 'szyna-sn', voltage_kv: napiecie }] } as unknown as EnergyNetworkModel;
      renderuj(polePola('OUT'), vi.fn(), { snapshot: migawka });
      await otworz(user);
      await user.selectOptions(screen.getByTestId('wyposazenie-pola-tryb'), 'standard');
      await waitFor(() =>
        expect(
          Array.from((screen.getByTestId('wyposazenie-pola-szablon-standardu') as HTMLSelectElement).options).map(
            (o) => o.value,
          ),
        ).toEqual(sa ? ['', 'STD_SN_OUT'] : ['']),
      );
    },
  );

  it.each(przypadki)('%s: ładunek operacji i skład pola na karcie', async (_opis, tryb, rola) => {
    const user = userEvent.setup();
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz(SKLAD_TRYBU[tryb]));
    // Tryb „wymagania" obsadza gniazda szablonu standardu — pole ma go w rekordzie.
    renderuj(
      tryb === 'wymagania' ? { ...polePola(rola), szablon_standardu_ref: `STD_SN_${rola}` } : polePola(rola),
      wykonaj,
    );
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
    if (tryb === 'standard') {
      // Lista szablonów standardu zawężona do roli pola (szyna 15 kV — rozdzielnica SN).
      await waitFor(() =>
        expect(
          Array.from((screen.getByTestId('wyposazenie-pola-szablon-standardu') as HTMLSelectElement).options).map(
            (o) => o.value,
          ),
        ).toEqual(['', `STD_SN_${rola}`]),
      );
      expect(screen.getByTestId('wyposazenie-pola-zapisz')).toBeDisabled();
      await user.selectOptions(screen.getByTestId('wyposazenie-pola-szablon-standardu'), `STD_SN_${rola}`);
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
          : tryb === 'standard'
            ? { bay_ref: `pole-${rola}`, mode: 'standard', szablon_standardu_ref: `STD_SN_${rola}` }
            : { bay_ref: `pole-${rola}`, mode: tryb };
    expect(wykonaj).toHaveBeenCalledWith('case-1', 'set_bay_equipment', oczekiwany);

    expect(await screen.findByTestId('wyposazenie-pola-wynik')).toBeInTheDocument();
    // Skład z odpowiedzi operacji: status maszynowy w atrybucie, etykieta i zdanie wyjaśnienia
    // w treści (status nigdy bez wyjaśnienia).
    const oczekiwaneWiersze = SKLAD_TRYBU[tryb];
    if (oczekiwaneWiersze.length === 0) {
      expect(screen.getByTestId('wyposazenie-pola-sklad-pusty')).toBeInTheDocument();
    } else {
      oczekiwaneWiersze.forEach((w, i) => {
        const el = screen.getByTestId(`wyposazenie-pola-sklad-wiersz-${i}`);
        expect(el.getAttribute('data-status')).toBe(w.status);
        expect(el).toHaveTextContent(w.opis_pl);
        if (w.podstawa_pl) expect(el).toHaveTextContent(w.podstawa_pl);
      });
    }
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
  it('karta bez otwarcia edycji pokazuje skład z modelu odczytu i nie odpytuje katalogu', () => {
    renderuj(polePola('OUT'), vi.fn(), { sklad: SKLAD_TRYBU.standard });
    const el = screen.getByTestId('wyposazenie-pola-sklad-wiersz-0');
    expect(el.getAttribute('data-status')).toBe('WYMAGANE_STANDARDEM_BRAK');
    expect(el).toHaveTextContent('wymagane standardem — brak aparatu z katalogu');
    expect(katalogApi.fetchMvApparatusTypes).not.toHaveBeenCalled();
    expect(katalogApi.fetchCompleteBayTemplates).not.toHaveBeenCalled();
    expect(katalogApi.fetchBayStandardTemplates).not.toHaveBeenCalled();
  });

  it('model odczytu pola niedostępny: jawny stan zamiast pustego składu', () => {
    renderuj(polePola('OUT'), vi.fn(), { sklad: null });
    expect(screen.getByTestId('wyposazenie-pola-sklad-niedostepny')).toBeInTheDocument();
    expect(screen.queryByTestId('wyposazenie-pola-sklad-pusty')).toBeNull();
  });

  it('tryb „wymagania" bez szablonu standardu w polu: zapis zablokowany z powodem', async () => {
    const user = userEvent.setup();
    renderuj(polePola('OUT'), vi.fn());
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-tryb'), 'wymagania');
    expect(screen.getByTestId('wyposazenie-pola-wymagania-opis')).toHaveTextContent('nie ma szablonu pola standardu');
    expect(screen.getByTestId('wyposazenie-pola-zapisz')).toBeDisabled();
  });

  it('gniazdo standardu: wybór tylko gniazd rodzaju aparatu, w ładunku jako gniazdo_ref', async () => {
    const user = userEvent.setup();
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz(SKLAD_TRYBU.wymagania));
    const sklad = [
      wiersz({ gniazdo_ref: 'OS', gniazdo_nazwa_pl: 'odłącznik szynowy', rodzaj: 'DS_ES', status: 'WYMAGANE_STANDARDEM_BRAK' }),
      wiersz({ gniazdo_ref: 'W', gniazdo_nazwa_pl: 'wyłącznik pola', rodzaj: 'CB', status: 'WYMAGANE_STANDARDEM_BRAK' }),
    ];
    renderuj({ ...polePola('OUT'), szablon_standardu_ref: 'STD_SN_OUT' }, wykonaj, { sklad });
    await otworz(user);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), 'CB');
    const opcje = Array.from(
      (screen.getByTestId('wyposazenie-pola-aparat-0-gniazdo') as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(opcje).toEqual(['', 'W']);
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-gniazdo'), 'W');
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-katalog'), 'wyl-1');
    // Umiejscowienie aparatu w gnieździe wynika ze standardu — wiersz kompletny bez niego.
    await user.click(screen.getByTestId('wyposazenie-pola-zapisz'));
    expect(wykonaj).toHaveBeenCalledWith('case-1', 'set_bay_equipment', {
      bay_ref: 'pole-OUT',
      mode: 'katalog',
      devices: [{ kind: 'CB', catalog_ref: 'wyl-1', gniazdo_ref: 'W' }],
    });
    // Rodzaj bez gniazda w szablonie: brak wyboru gniazda.
    await user.click(screen.getByTestId('wyposazenie-pola-edytuj'));
    await user.selectOptions(screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj'), 'CT');
    expect(screen.queryByTestId('wyposazenie-pola-aparat-0-gniazdo')).toBeNull();
  });

  it.each([
    ['CB', ['', 'wyl-1', 'rek-1']],
    ['LOAD_SWITCH', ['', 'roz-1']],
    ['DS', ['', 'odl-1']],
    ['ES', ['', 'uz-1']],
    ['CT', ['', 'ct-1']],
    ['VT', ['', 'vt-1']],
    ['SURGE_ARRESTER', ['', 'og-1']],
    ['DS_ES', ['']],
    ['VOLTAGE_INDICATOR', ['', 'wsk-1']],
    ['EARTHING_TRANSFORMER', ['', 'tu-1']],
    ['NEUTRAL_REACTOR', ['', 'dl-1']],
    ['NEUTRAL_RESISTOR', ['', 'rz-1', 'rw-1']],
    ['CAPACITOR_BANK', ['', 'bk-1']],
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
    const zGalezia = ['CB', 'LOAD_SWITCH', 'DS', 'DS_ES', 'FUSE'].includes(rodzaj);
    expect(screen.queryByTestId('wyposazenie-pola-aparat-0-lacznik') !== null).toBe(zGalezia);
    expect(screen.queryByTestId('wyposazenie-pola-aparat-0-uziemienie') !== null).toBe(
      ['DS_ES', 'ES', 'SURGE_ARRESTER'].includes(rodzaj),
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
    const wykonaj = vi.fn().mockResolvedValue(odpowiedz(SKLAD_TRYBU.szablon));
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
        sklad={[]}
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
        sklad={SKLAD_TRYBU.katalog}
        activeCaseId="case-1"
        executeDomainOperation={wykonaj as never}
      />,
    );
    await user.click(screen.getByTestId('wyposazenie-pola-edytuj'));
    expect((screen.getByTestId('wyposazenie-pola-aparat-0-rodzaj') as HTMLSelectElement).value).toBe('VT');
    expect(screen.getByTestId('wyposazenie-pola-sklad-wiersz-0').getAttribute('data-status')).toBe('ZAPROJEKTOWANE');
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
