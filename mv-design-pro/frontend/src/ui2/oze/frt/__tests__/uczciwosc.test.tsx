/*
 * Uczciwość natychmiastowa (2026-09-23) — okno „Walidacja modelu falownika" NIE
 * wystawia werdyktu FRT. Trajektoria solvera jest funkcją zadaną profilem wejściowym,
 * a „utrzymanie pracy" i „margines do krzywej" to kryterium v > 0,05 p.u. liczone wobec
 * TEGO SAMEGO profilu (tautologia — zapad do 0,06 p.u. przez 3 s dawał „w obwiedni").
 *
 * ILOCZYN CECH (nie przykład z karty): powierzchnia (trajektoria LVRT / HVRT /
 * sekwencja zapadów) × meldunek solvera (moduł „utrzymał pracę" / „odłączył się") ×
 * miejsce (pierwszy plan / sekcja audytowa / zapis do zgodności NC RfG). Na każdym
 * przecięciu: pierwszy plan niesie WYŁĄCZNIE rekord kontraktu werdyktu z backendu w karcie
 * werdyktu (etykieta „Ocena niewykonana", zdanie, czego brakuje, podstawa, dowód), żadnego
 * werdyktu ani koloru ok/err;
 * pola solvera są dostępne tylko w zwiniętej sekcji audytowej z nagłówkiem z backendu.
 * Ścieżka natywna: `fireEvent` na realnych kontrolkach, API mockowane na granicy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { useStationDerStore } from '../../../../ui/network-build/station-der';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import * as frtModel from '../frtModel';
import * as sekwencjaModel from '../sekwencjaModel';
import { EkranFrt } from '../EkranFrt';
import type { RekordOcenyFrt } from '../../api';
import {
  SEKCJA_AUDYTOWA_FRT,
  katalogNcRfgFixture,
  widokHvrtFixture,
  widokLvrtFixture,
  widokModulOdlaczonyFixture,
  widokSekwencjiFixture,
  widokSekwencjiZKontekstemFixture,
} from './fixtures';

const pobierzKatalog = vi.fn();
const pobierzTrajektorie = vi.fn();
const pobierzSekwencja = vi.fn();

// Katalog NC RfG z JEDNEGO klienta V2 (`ui2/oze/ncrfg/api`, karta AB-1a Pakiet D2).
vi.mock('../../ncrfg/api', () => ({
  pobierzKatalogNcRfg: () => pobierzKatalog(),
}));
vi.mock('../../api', () => ({
  pobierzTrajektorieFrt: (zapytanie: unknown) => pobierzTrajektorie(zapytanie),
  pobierzSekwencjeFrt: (zapytanie: unknown) => pobierzSekwencja(zapytanie),
}));

/** Teksty dawnych werdyktów — żaden nie może wrócić na ekran. */
const DAWNE_WERDYKTY = [
  'Model odzwierciedla wymagania profilu operatora',
  'Trajektoria wychodzi poza obwiednię profilu operatora',
  'Moduł wypadł z pracy podczas zakłócenia',
  'OK — moduł utrzymał pracę',
  'sekwencja w obwiedni',
  'sekwencja niezaliczona',
  'w obwiedni',
];

beforeEach(() => {
  useStationDerStore.getState().reset();
  useExecutionRunsStore.setState({ runs: [] });
  pobierzKatalog.mockResolvedValue(katalogNcRfgFixture());
});
afterEach(() => {
  useExecutionRunsStore.setState({ runs: [] });
  vi.clearAllMocks();
});

async function wczytajISkonfiguruj() {
  useStationDerStore.getState().attachDer({
    id: 'der-1',
    project_id: 'proj-1',
    station_id: 'st-1',
    der_kind: 'PV',
    name: 'Farma PV 1 MW',
    connection_side: 'nN',
    catalogs: { device_catalog_ref: 'conv-pv-1mw-15kv' },
  });
  render(<EkranFrt trybZaawansowania="basic" onOtworzDowod={vi.fn()} />);
  await screen.findByTestId('mvd-frt-dobor');
  fireEvent.change(screen.getByTestId('mvd-frt-modul'), { target: { value: 'der-1' } });
  fireEvent.change(screen.getByTestId('mvd-frt-operator'), { target: { value: 'pse' } });
}

/** Pole karty werdyktu rekordu (identyfikator z rekordu — `mvd-werdykt-<kryterium_id>-…`). */
function poleKarty(rekord: RekordOcenyFrt, pole: string): HTMLElement {
  return screen.getByTestId(`mvd-werdykt-${rekord.kryterium_id}-${pole}`);
}

function bezDawnychWerdyktow(element: HTMLElement) {
  for (const tekst of DAWNE_WERDYKTY) {
    expect(element).not.toHaveTextContent(tekst);
  }
}

describe.each([
  ['LVRT, solver meldował utrzymanie pracy', widokLvrtFixture, 'lvrt'],
  ['LVRT, solver meldował odłączenie modułu', widokModulOdlaczonyFixture, 'lvrt'],
  ['HVRT', widokHvrtFixture, 'hvrt'],
] as const)('trajektoria — %s', (_opis, fixture, rodzaj) => {
  it('pierwszy plan: rekord kontraktu z backendu w karcie werdyktu, zero werdyktu i koloru ok/err', async () => {
    const widok = fixture();
    const rekord = widok.ocena as RekordOcenyFrt;
    pobierzTrajektorie.mockResolvedValue(widok);
    await wczytajISkonfiguruj();
    fireEvent.change(screen.getByTestId('mvd-frt-rodzaj'), { target: { value: rodzaj } });
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    const wynik = await screen.findByTestId('mvd-frt-wynik');

    const ocena = screen.getByTestId('mvd-frt-ocena');
    expect(ocena).toHaveAttribute('data-status', 'NIE_OCENIONO');
    expect(ocena).toHaveAttribute('data-semantyka', 'neutralna');
    expect(poleKarty(rekord, 'etykieta')).toHaveTextContent('Ocena niewykonana');
    expect(poleKarty(rekord, 'zdanie')).toHaveTextContent(rekord.wyjasnienie.zdanie_pl);
    const braki = within(poleKarty(rekord, 'czego-brakuje')).getAllByRole('listitem');
    expect(braki.map((b) => b.textContent)).toEqual(rekord.wyjasnienie.czego_brakuje);
    // Powód (tautologia wobec profilu wejściowego) i brak (bieg kanoniczny) z backendu.
    expect(poleKarty(rekord, 'czego-brakuje')).toHaveTextContent('tautologią');

    expect(screen.queryByTestId('mvd-frt-werdykt')).not.toBeInTheDocument();
    expect(wynik.querySelector('[class*="--ok"]')).toBeNull();
    expect(wynik.querySelector('[class*="--err"]')).toBeNull();
    bezDawnychWerdyktow(wynik);
  });

  it('tabela pierwszego planu nie niesie kolumn solvera; są one tylko w zwiniętej sekcji audytowej', async () => {
    pobierzTrajektorie.mockResolvedValue(fixture());
    await wczytajISkonfiguruj();
    fireEvent.change(screen.getByTestId('mvd-frt-rodzaj'), { target: { value: rodzaj } });
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');

    const tabela = screen.getByTestId('mvd-wyn-tabela');
    for (const kolumna of ['Utrzymanie pracy', 'Margines do krzywej', 'Czas odzysku P', 'Werdykt']) {
      expect(within(tabela).queryByText(kolumna)).toBeNull();
    }
    expect(tabela).toHaveTextContent('Ocena niewykonana');

    const audyt = screen.getByTestId('mvd-frt-audyt');
    expect(audyt).toHaveTextContent(SEKCJA_AUDYTOWA_FRT);
    expect(screen.queryByTestId('mvd-frt-audyt-tresc')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-frt-audyt-przelacz'));
    const tresc = screen.getByTestId('mvd-frt-audyt-tresc');
    expect(tresc).toHaveTextContent('Utrzymanie pracy');
    expect(tresc).toHaveTextContent('Margines do krzywej');
  });

  it('obwiednia profilu jest informacją o wymaganiu (opis z backendu), nie podstawą oceny', async () => {
    const widok = fixture();
    pobierzTrajektorie.mockResolvedValue(widok);
    await wczytajISkonfiguruj();
    fireEvent.change(screen.getByTestId('mvd-frt-rodzaj'), { target: { value: rodzaj } });
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    expect(screen.getByTestId('mvd-frt-obwiednia-opis')).toHaveTextContent(
      widok.obwiednia_profilu?.opis ?? '',
    );
  });

  it('zapis do zgodności NC RfG niesie etykietę rekordu i semantykę neutralną', async () => {
    const { useNcRfgStore } = await import('../../ncRfgStore');
    useNcRfgStore.getState().reset();
    pobierzTrajektorie.mockResolvedValue(fixture());
    await wczytajISkonfiguruj();
    fireEvent.change(screen.getByTestId('mvd-frt-rodzaj'), { target: { value: rodzaj } });
    fireEvent.click(screen.getByTestId('mvd-frt-oblicz'));
    await screen.findByTestId('mvd-frt-wynik');
    fireEvent.click(screen.getByTestId('mvd-frt-zapisz-wynik'));
    const zapisany = useNcRfgStore.getState().wynikiFrt['der-1']?.[rodzaj];
    expect(zapisany?.tekst).toBe('Ocena niewykonana');
    expect(zapisany?.istotnosc).toBe('neutralna');
    useNcRfgStore.getState().reset();
  });
});

describe.each([
  ['bez kontekstu siły sieci', widokSekwencjiFixture],
  ['z kontekstem siły sieci i meldunkiem odłączenia', widokSekwencjiZKontekstemFixture],
] as const)('sekwencja zapadów — %s', (_opis, fixture) => {
  it('pierwszy plan: rekord oceny, zero odznaki werdyktu; pola solvera tylko w audycie', async () => {
    pobierzSekwencja.mockResolvedValue(fixture());
    await wczytajISkonfiguruj();
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-oblicz'));
    const wynik = await screen.findByTestId('mvd-frt-sekw-wynik');

    const rekord = fixture().ocena as RekordOcenyFrt;
    expect(screen.getByTestId('mvd-frt-sekw-ocena')).toHaveAttribute('data-status', 'NIE_OCENIONO');
    expect(poleKarty(rekord, 'zdanie')).toHaveTextContent(rekord.wyjasnienie.zdanie_pl);
    expect(screen.queryByTestId('mvd-frt-sekw-werdykt')).not.toBeInTheDocument();
    expect(wynik.querySelector('[class*="odznaka--"]')).toBeNull();
    bezDawnychWerdyktow(wynik);

    const tabela = within(wynik).getByTestId('mvd-wyn-tabela');
    for (const kolumna of ['Utrzymanie pracy', 'Margines do krzywej', 'Czas odzysku P', 'Werdykt']) {
      expect(within(tabela).queryByText(kolumna)).toBeNull();
    }
    expect(screen.getByTestId('mvd-frt-sekw-audyt')).toHaveTextContent(SEKCJA_AUDYTOWA_FRT);
    fireEvent.click(screen.getByTestId('mvd-frt-sekw-audyt-przelacz'));
    expect(screen.getByTestId('mvd-frt-sekw-audyt-tresc')).toHaveTextContent('Utrzymanie pracy');
  });
});

describe('model prezentacji — agregaty werdyktu skasowane', () => {
  it('frtModel nie eksportuje agregacji „werdyktu całości"', () => {
    expect('werdyktCalosciFrt' in frtModel).toBe(false);
  });

  it('sekwencjaModel nie eksportuje odznaki „werdyktu sekwencji"', () => {
    expect('werdyktSekwencji' in sekwencjaModel).toBe(false);
  });
});
