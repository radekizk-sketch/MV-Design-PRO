/**
 * Zakładka „Karty widmowe" przestrzeni Model — jedyny dostawca `dodaj_karte_widmowa_projektu`
 * i klucza `karty_widmowe_ref` operacji `set_der_catalog_bindings` w interfejsie.
 * Ścieżka natywna: wybór pliku (`userEvent.upload`), kliknięcia pól wyboru i przycisków.
 *
 * ILOCZYN CECH:
 *  - pochodzenie karty {katalog producentów, projekt} × typ urządzenia {typ generatora, inny};
 *  - plik {poprawny rekord, niepoprawny JSON, lista} × odpowiedź {sukces, odmowa backendu};
 *  - przypisanie {dołożenie karty, odpięcie wszystkich (null)} × generator {z typem, bez typu};
 *  - zakładka osiągalna z warsztatu modelu (klik w zakładkę).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { useSnapshotStore } from '../../../../../ui/topology/snapshotStore';
import { generatoryKart, kartyKataloguModelu, odczytajKarteZPliku, payloadPrzypisaniaKart } from '../kartyWidmoweModel';

const TYP_PV = 'conv-pv-1';

function karta(id: string, urzadzenie_ref: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    urzadzenie_ref,
    producent: 'Producent',
    model_urzadzenia: `Model ${id}`,
    modele: [{ ident: 'm-1' }],
    podstawa: {},
    wersja: '1',
    verification_status: 'NIEWERYFIKOWANY',
    source_reference: 'raport',
    catalog_status: 'PROJEKTOWY_V1',
    contract_version: '1',
    ...extra,
  };
}

const fetchKartyWidmowe = vi.fn();
const fetchDerConverterTypes = vi.fn();
vi.mock('../../../../../ui/catalog/api', () => ({
  fetchKartyWidmowe: () => fetchKartyWidmowe(),
  fetchDerConverterTypes: () => fetchDerConverterTypes(),
  getCatalogErrorMessage: (e: unknown) => String(e),
}));

import { PanelKartWidmowych } from '../PanelKartWidmowych';

const MIGAWKA = {
  generators: [
    { ref_id: 'gen/pv', name: 'Farma PV', catalog_ref: TYP_PV, modele_widmowe: null },
    { ref_id: 'gen/bez-typu', name: 'UPS', catalog_ref: null },
  ],
  katalog_projektu: {
    line_types: [],
    cable_types: [],
    transformer_types: [],
    karty_widmowe: [karta('karta-proj', TYP_PV), karta('karta-obca', 'conv-wind-1')],
  },
};

let execute: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchKartyWidmowe.mockResolvedValue([karta('karta-stat', TYP_PV, { verification_status: 'REFERENCYJNY', catalog_status: 'REFERENCYJNY_V1' })]);
  fetchDerConverterTypes.mockResolvedValue([{ id: TYP_PV, name: 'Falownik PV 100 kW' }]);
  execute = vi.fn().mockResolvedValue({ snapshot: {} });
  useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
  useSnapshotStore.setState({ snapshot: MIGAWKA, executeDomainOperation: execute } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Katalog kart modelu i przypisanie do generatora', () => {
  it('lista: karty statyczne i projektu; generator bez typu nie ma przypisania', async () => {
    render(<PanelKartWidmowych />);
    await waitFor(() => expect(screen.getByTestId('karty-widmowe-karta-karta-stat')).toBeInTheDocument());
    expect(screen.getByTestId('karty-widmowe-karta-karta-stat').textContent).toContain('katalog producentów');
    expect(screen.getByTestId('karty-widmowe-karta-karta-proj').textContent).toContain('karta projektu');
    expect(screen.getByTestId('karty-widmowe-karta-karta-stat').textContent).toContain('Falownik PV 100 kW');
    expect(screen.queryByTestId('karty-widmowe-generator-gen/bez-typu')).toBeNull();
  });

  it('przy generatorze tylko karty JEGO typu; zaznaczenie dwóch kart i zapis → set_der_catalog_bindings', async () => {
    render(<PanelKartWidmowych />);
    const u = userEvent.setup();
    await waitFor(() => expect(screen.getByTestId('karty-widmowe-generator-gen/pv-karta-karta-stat')).toBeInTheDocument());
    expect(screen.queryByTestId('karty-widmowe-generator-gen/pv-karta-karta-obca')).toBeNull();
    expect(screen.getByTestId('karty-widmowe-generator-gen/pv-zapisz')).toBeDisabled();
    await u.click(screen.getByTestId('karty-widmowe-generator-gen/pv-karta-karta-stat'));
    await u.click(screen.getByTestId('karty-widmowe-generator-gen/pv-karta-karta-proj'));
    await u.click(screen.getByTestId('karty-widmowe-generator-gen/pv-zapisz'));
    expect(execute).toHaveBeenCalledWith('case-1', 'set_der_catalog_bindings', {
      generator_ref: 'gen/pv',
      karty_widmowe_ref: ['karta-proj', 'karta-stat'],
    });
    expect(await screen.findByTestId('karty-widmowe-komunikat')).toHaveAttribute('data-stan', 'ok');
  });

  it('odpięcie wszystkich kart wysyła jawne null', async () => {
    useSnapshotStore.setState({
      snapshot: {
        ...MIGAWKA,
        generators: [
          {
            ...MIGAWKA.generators[0],
            modele_widmowe: { modele: [], zrodla: [{ karta_id: 'karta-proj', wersja: '1', przestrzen: 'PROJEKT', odcisk_karty: 'x' }] },
          },
        ],
      },
    } as never);
    render(<PanelKartWidmowych />);
    const u = userEvent.setup();
    const pole = await screen.findByTestId('karty-widmowe-generator-gen/pv-karta-karta-proj');
    expect(pole).toBeChecked();
    expect(screen.getByTestId('karty-widmowe-generator-gen/pv-stan').textContent).toContain('jednej karty');
    await u.click(pole);
    await u.click(screen.getByTestId('karty-widmowe-generator-gen/pv-zapisz'));
    expect(execute).toHaveBeenCalledWith('case-1', 'set_der_catalog_bindings', {
      generator_ref: 'gen/pv',
      karty_widmowe_ref: null,
    });
  });
});

describe('Wczytanie karty projektu z pliku', () => {
  it('poprawny rekord → dodaj_karte_widmowa_projektu z rekordem z pliku', async () => {
    render(<PanelKartWidmowych />);
    const u = userEvent.setup();
    const rekord = karta('karta-nowa', TYP_PV);
    await u.upload(screen.getByTestId('karty-widmowe-plik'), new File([JSON.stringify(rekord)], 'karta.json', { type: 'application/json' }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith('case-1', 'dodaj_karte_widmowa_projektu', { karta: rekord }));
    expect(await screen.findByTestId('karty-widmowe-komunikat')).toHaveTextContent('karta.json');
  });

  it('odmowa backendu → zdanie odmowy', async () => {
    execute.mockResolvedValue({ error: 'Karta projektu wskazuje typ urządzenia, którego nie ma w katalogu.', error_code: 'karta_widmowa.urzadzenie_nieznane' });
    render(<PanelKartWidmowych />);
    await userEvent.setup().upload(
      screen.getByTestId('karty-widmowe-plik'),
      new File([JSON.stringify(karta('k', 'x'))], 'k.json', { type: 'application/json' }),
    );
    const komunikat = await screen.findByTestId('karty-widmowe-komunikat');
    expect(komunikat).toHaveAttribute('data-stan', 'blad');
    expect(komunikat).toHaveTextContent('nie ma w katalogu');
  });

  it.each([
    ['niepoprawny JSON', '{nie json', 'nie jest poprawnym'],
    ['lista rekordów', '[{}]', 'JEDEN rekord'],
  ])('%s → komunikat bez operacji', async (_opis, tresc, fraza) => {
    render(<PanelKartWidmowych />);
    await userEvent.setup().upload(screen.getByTestId('karty-widmowe-plik'), new File([tresc], 'zly.json', { type: 'application/json' }));
    expect(await screen.findByTestId('karty-widmowe-komunikat')).toHaveTextContent(fraza);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('Model panelu', () => {
  it('karty sortowane po id niezależnie od pochodzenia', () => {
    const k = kartyKataloguModelu([karta('b', TYP_PV)] as never, MIGAWKA as never);
    expect(k.map((x) => x.karta.id)).toEqual(['b', 'karta-obca', 'karta-proj']);
  });

  it('generatory: przypisane z proweniencji, posortowane', () => {
    const w = generatoryKart(MIGAWKA as never, kartyKataloguModelu([], MIGAWKA as never));
    expect(w.map((g) => g.generator.ref_id)).toEqual(['gen/pv']);
    expect(w[0].dostepne.map((d) => d.karta.id)).toEqual(['karta-proj']);
    expect(w[0].przypisane).toEqual([]);
  });

  it('ładunek przypisania: lista posortowana albo null', () => {
    expect(payloadPrzypisaniaKart('g', ['z', 'a'])).toEqual({ generator_ref: 'g', karty_widmowe_ref: ['a', 'z'] });
    expect(payloadPrzypisaniaKart('g', [])).toEqual({ generator_ref: 'g', karty_widmowe_ref: null });
  });

  it.each([['1'], ['null'], ['"tekst"']])('plik %s nie jest rekordem', (tresc) => {
    expect(odczytajKarteZPliku(tresc).ok).toBe(false);
  });
});
