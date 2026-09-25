/**
 * Pulpit instalacji OZE (karta P47; kontrakt V2 — karta AB-1a Pakiet D2 §6).
 *
 * Moduły sceny wyprowadzone z modelu (`deryZModelu` na migawce sceny `macierz`). Ocena NC RfG
 * pulpitu to ocena ZATWIERDZONEGO MODELU przypadku (`GET /api/ncrfg-tests/cases/{id}/compliance`
 * — ta sama trasa co certyfikat; dowód certyfikatu wyprowadza serwer z tabliczki modelu), przez
 * PRODUKCYJNY klient z atrapą wyłącznie na `fetch` (odpowiedź policzona backendem — fikstura
 * generowana). Pozycja modułu: typ modułu z klasyfikacji backendu, dowód certyfikatu (numer
 * dokumentu z wykazu), odrzucenie tabliczki albo jawny brak, plakietki rekordów wymagań; karta
 * modułu: nagłówek wyniku + rekordy W (plakietka + karta). Zero statusu modułu i liczników.
 * Interakcje natywne (`userEvent`).
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useStationDerStore } from '../../../../ui/network-build/station-der';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { MacierzNcRfg } from '../../macierz';
import {
  biegFixture,
  deryScenyMacierz,
  katalogFixture,
  wejsciaFixture,
  zgodnoscFixture,
} from '../../macierz/__tests__/fixtures';
import { atrapaSieci, odpowiedzJson } from '../../ncrfg/__tests__/atrapaSieci';
import type { ZgodnoscPrzypadkuNcRfg } from '../../ncrfg/typy';
import { useNcRfgStore } from '../../ncRfgStore';
import { PulpitOze } from '../PulpitOze';
import { PULPIT_STRINGS } from '../strings';

// Sekcje analiz (siła sieci, adekwatność Q, katalog konwerterów) — domena poza NC RfG,
// ich klient mockowany na granicy modułu (bez przebiegów sekcje pokazują instrukcje).
vi.mock('../../api', () => ({
  pobierzKonwertery: vi.fn(() => Promise.resolve([])),
  pobierzSileSieci: vi.fn(() => Promise.resolve(null)),
  pobierzAdekwatnoscQ: vi.fn(() => Promise.resolve(null)),
}));

const [BESS, PV] = deryScenyMacierz();
const PRZYPADEK = zgodnoscFixture().case_id;
const SCIEZKA_OCENY = `/api/ncrfg-tests/cases/${PRZYPADEK}/compliance`;
const noop = (): void => {};

function trasy(ocena: () => Response = () => odpowiedzJson(200, zgodnoscFixture())) {
  return atrapaSieci([
    { metoda: 'GET', sciezka: '/api/ncrfg-tests/catalog', odpowiedz: () => odpowiedzJson(200, katalogFixture()) },
    { metoda: 'GET', sciezka: SCIEZKA_OCENY, odpowiedz: ocena },
    { metoda: 'POST', sciezka: '/api/ncrfg-tests/run', odpowiedz: () => odpowiedzJson(200, biegFixture()) },
    // Macierz obok pulpitu czyta formularz wstępny z wejść modelu (`GET …/wejscia`).
    {
      metoda: 'GET',
      sciezka: /^\/api\/ncrfg-tests\/cases\/[^/]+\/wejscia$/,
      odpowiedz: () => odpowiedzJson(200, wejsciaFixture()),
    },
  ]);
}

beforeEach(() => {
  useNcRfgStore.getState().reset();
  useExecutionRunsStore.getState().reset();
  useAppStateStore.setState({ activeCaseId: PRZYPADEK } as never);
  useStationDerStore.setState({ ders: { [BESS.id]: BESS, [PV.id]: PV } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  useStationDerStore.setState({ ders: {} });
  useAppStateStore.setState({ activeCaseId: null } as never);
  useNcRfgStore.getState().reset();
  useExecutionRunsStore.getState().reset();
});

/** Odczekaj wczytanie oceny modelu (plakietki rekordów PV są jej widocznym skutkiem). */
async function ocenaWczytana(): Promise<void> {
  await screen.findByTestId(`mvd-oze-pulpit-poz-wymagania-${PV.id}`);
}

describe('źródło oceny — zatwierdzony model przypadku', () => {
  it('bez aktywnego przypadku: nazwany stan, zero zapytań o ocenę, odświeżenie zablokowane', async () => {
    const wywolania = trasy();
    useAppStateStore.setState({ activeCaseId: null } as never);
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    expect(await screen.findByTestId('mvd-oze-pulpit-brak-przypadku')).toHaveTextContent(
      PULPIT_STRINGS.brakPrzypadku,
    );
    for (const der of [BESS, PV]) {
      expect(screen.getByTestId(`mvd-oze-pulpit-poz-klasa-${der.id}`)).toHaveTextContent(
        PULPIT_STRINGS.listaBezOceny,
      );
      expect(screen.queryByTestId(`mvd-oze-pulpit-poz-dowod-${der.id}`)).toBeNull();
    }
    expect(screen.getByTestId('mvd-oze-pulpit-zgodnosc-bez-oceny')).toHaveTextContent(
      PULPIT_STRINGS.zgodnoscBezOceny,
    );
    expect(screen.getByTestId('mvd-oze-pulpit-odswiez')).toBeDisabled();
    await waitFor(() => expect(wywolania.some((w) => w.sciezka === '/api/ncrfg-tests/catalog')).toBe(true));
    expect(wywolania.filter((w) => w.sciezka.includes('/compliance'))).toHaveLength(0);
  });

  it('ocena wczytana sama: przypadek i operator z modelu w zapytaniu; bez biegu „co-jeśli"', async () => {
    const wywolania = trasy();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    await ocenaWczytana();
    const zapytania = wywolania.filter((w) => w.sciezka === SCIEZKA_OCENY);
    expect(zapytania).toHaveLength(1);
    expect([...zapytania[0].zapytanie.keys()]).toEqual(['operator_id']);
    expect(zapytania[0].zapytanie.get('operator_id')).toBe(zgodnoscFixture().operator_id);
    expect(wywolania.filter((w) => w.sciezka === '/api/ncrfg-tests/run')).toHaveLength(0);
    expect(screen.getByTestId('mvd-oze-pulpit-zrodlo-oceny')).toHaveTextContent(PULPIT_STRINGS.zrodloOceny);
  });

  it('pozycja = typ z klasyfikacji, dowód certyfikatu z wykazu (numer dokumentu) albo jawny brak, plakietki W', async () => {
    trasy();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    await ocenaWczytana();
    const bieg = zgodnoscFixture().bieg!;
    expect(bieg.modules.some((m) => m.dowod_certyfikatu !== null)).toBe(true);
    for (const [indeks, modul] of bieg.modules.entries()) {
      expect(screen.getByTestId(`mvd-oze-pulpit-poz-klasa-${modul.der_ref}`)).toHaveTextContent(
        modul.klasyfikacja.modul !== null
          ? `${PULPIT_STRINGS.listaKlasa} ${modul.klasyfikacja.modul}`
          : PULPIT_STRINGS.listaPonizejProgu,
      );
      const dowod = screen.getByTestId(`mvd-oze-pulpit-poz-dowod-${modul.der_ref}`);
      if (modul.dowod_certyfikatu) {
        expect(dowod).toHaveAttribute('data-stan', 'dowod');
        expect(dowod).toHaveTextContent(modul.dowod_certyfikatu.numer_dokumentu);
      } else {
        expect(dowod).toHaveAttribute('data-stan', 'brak');
        expect(dowod).toHaveTextContent(PULPIT_STRINGS.listaBrakDowodu);
      }
      const plakietki = screen.getByTestId(`mvd-oze-pulpit-poz-wymagania-${modul.der_ref}`);
      const rekordy = bieg.ocena_wymagan[indeks].wymagania;
      expect(plakietki.querySelectorAll('[data-semantyka]')).toHaveLength(rekordy.length);
      expect(plakietki.querySelector('[data-semantyka]')).toHaveTextContent(rekordy[0].etykieta.etykieta_pl);
    }
    expect(screen.queryByText(/zgodny|niezgodny|\d+ \/ \d+/)).toBeNull();
  });

  it('karta modułu: nagłówek wyniku (źródło danych — zatwierdzony model, dowód) i rekordy W z kartą po kliknięciu', async () => {
    trasy();
    const uzytkownik = userEvent.setup();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    await ocenaWczytana();
    await uzytkownik.click(screen.getByTestId(`mvd-oze-pulpit-poz-${PV.id}`));
    const zgodnosc = screen.getByTestId('mvd-oze-pulpit-zgodnosc');
    const naglowek = `mvd-oze-pulpit-zgodnosc-naglowek-${PV.id}`;
    expect(within(zgodnosc).getByTestId(`${naglowek}-klasyfikacja`)).toBeInTheDocument();
    const modulPv = zgodnoscFixture().bieg!.modules.find((m) => m.der_ref === PV.id)!;
    expect(within(zgodnosc).getByTestId(`${naglowek}-dowod`)).toHaveAttribute('data-stan', 'dowod');
    expect(within(zgodnosc).getByTestId(`${naglowek}-dowod-numer`)).toHaveTextContent(
      modulPv.dowod_certyfikatu!.numer_dokumentu,
    );
    const indeksPv = zgodnoscFixture().bieg!.modules.indexOf(modulPv);
    const rekord = zgodnoscFixture().bieg!.ocena_wymagan[indeksPv].wymagania[0];
    await uzytkownik.click(
      within(zgodnosc).getByTestId(`mvd-oze-pulpit-wymagania-${PV.id}-${rekord.wymaganie_id}-przelacz`),
    );
    expect(within(zgodnosc).getByTestId(`mvd-werdykt-${rekord.wymaganie_id}`)).toBeInTheDocument();
  });

  it('tabliczka odrzucona przez serwer → stan „odrzucony" w liście i powód w karcie modułu', async () => {
    const powod = 'Tabliczka wskazuje rekord spoza wykazu — powód z serwera';
    const ocena: ZgodnoscPrzypadkuNcRfg = {
      ...zgodnoscFixture(),
      certyfikaty_odrzucone: [{ der_ref: BESS.id, rekord_ref: null, powod_pl: powod }],
    };
    trasy(() => odpowiedzJson(200, ocena));
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    await ocenaWczytana();
    const dowod = screen.getByTestId(`mvd-oze-pulpit-poz-dowod-${BESS.id}`);
    expect(dowod).toHaveAttribute('data-stan', 'odrzucony');
    expect(dowod).toHaveTextContent(PULPIT_STRINGS.listaOdrzucony);
    // BESS jest pierwszym modułem (sort po referencji) — jego karta jest otwarta domyślnie.
    const naglowekDowod = screen.getByTestId(`mvd-oze-pulpit-zgodnosc-naglowek-${BESS.id}-dowod`);
    expect(naglowekDowod).toHaveAttribute('data-stan', 'odrzucony');
    expect(naglowekDowod).toHaveTextContent(powod);
  });

  it('moduł pominięty przez serwer → powód serwera w liście i w karcie (nie „poza oceną")', async () => {
    const pelna = zgodnoscFixture();
    const indeksPv = pelna.bieg!.modules.findIndex((m) => m.der_ref === PV.id);
    const powod = 'brak mocy modułu w zatwierdzonym modelu — powód z serwera';
    const ocena: ZgodnoscPrzypadkuNcRfg = {
      ...pelna,
      der_count: pelna.der_count - 1,
      pominiete: [{ der_ref: PV.id, der_name: PV.name, powod: 'brak_mocy', powod_pl: powod }],
      bieg: {
        ...pelna.bieg!,
        modules: pelna.bieg!.modules.filter((_, i) => i !== indeksPv),
        ocena_wymagan: pelna.bieg!.ocena_wymagan.filter((_, i) => i !== indeksPv),
      },
    };
    trasy(() => odpowiedzJson(200, ocena));
    const uzytkownik = userEvent.setup();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    await screen.findByTestId(`mvd-oze-pulpit-poz-wymagania-${BESS.id}`);
    expect(screen.getByTestId(`mvd-oze-pulpit-poz-klasa-${PV.id}`)).toHaveTextContent(powod);
    expect(screen.queryByTestId(`mvd-oze-pulpit-poz-dowod-${PV.id}`)).toBeNull();
    await uzytkownik.click(screen.getByTestId(`mvd-oze-pulpit-poz-${PV.id}`));
    expect(screen.getByTestId('mvd-oze-pulpit-zgodnosc-pominiety')).toHaveTextContent(powod);
  });

  it('błąd oceny → nazwany komunikat z treścią serwera, bez wyniku', async () => {
    trasy(() => odpowiedzJson(404, { detail: 'Przypadek nie ma zatwierdzonego modelu' }));
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    expect(await screen.findByTestId('mvd-oze-pulpit-blad-oceny')).toHaveTextContent(
      'Przypadek nie ma zatwierdzonego modelu',
    );
    expect(screen.queryByTestId(`mvd-oze-pulpit-poz-dowod-${PV.id}`)).toBeNull();
  });

  it('odświeżenie (natywny klik) ponawia zapytanie o ocenę tego samego przypadku', async () => {
    const wywolania = trasy();
    const uzytkownik = userEvent.setup();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    await ocenaWczytana();
    const odswiez = screen.getByTestId('mvd-oze-pulpit-odswiez');
    await waitFor(() => expect(odswiez).toBeEnabled());
    await uzytkownik.click(odswiez);
    await waitFor(() => expect(wywolania.filter((w) => w.sciezka === SCIEZKA_OCENY)).toHaveLength(2));
  });
});

describe('operator — z modelu albo jawny wybór (nigdy domyślny)', () => {
  it('różne profile modułów → ocena czeka na jawny wybór; wybór trafia do zapytania', async () => {
    const wywolania = trasy();
    useStationDerStore.setState({
      ders: { [BESS.id]: BESS, [PV.id]: { ...PV, profiles: { ...PV.profiles, nc_rfg_profile_ref: 'pse' } } },
    });
    const uzytkownik = userEvent.setup();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    const wybor = (await screen.findByTestId('mvd-oze-pulpit-operator-wybor')) as HTMLSelectElement;
    await waitFor(() => expect(wybor).toBeEnabled());
    expect(wybor.value).toBe('');
    expect(screen.getByTestId('mvd-oze-pulpit-odswiez')).toBeDisabled();
    expect(wywolania.filter((w) => w.sciezka === SCIEZKA_OCENY)).toHaveLength(0);
    await uzytkownik.selectOptions(wybor, 'enea');
    await ocenaWczytana();
    const zapytanie = wywolania.find((w) => w.sciezka === SCIEZKA_OCENY)!;
    expect(zapytanie.zapytanie.get('operator_id')).toBe('enea');
  });
});

describe('pozostałe sekcje karty modułu', () => {
  it('sekcja magazynu dla BESS z danymi, ukryta dla PV (natywny klik)', async () => {
    trasy();
    const uzytkownik = userEvent.setup();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    expect(await screen.findByTestId('mvd-oze-pulpit-magazyn')).toBeInTheDocument();
    await uzytkownik.click(screen.getByTestId(`mvd-oze-pulpit-poz-${PV.id}`));
    expect(screen.queryByTestId('mvd-oze-pulpit-magazyn')).toBeNull();
  });

  it('bez przebiegów sekcje siły sieci i mocy biernej pokazują jawne instrukcje', async () => {
    trasy();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    expect(await screen.findByTestId('mvd-oze-sila-brak-przebiegu')).toHaveTextContent(PULPIT_STRINGS.silaBrakPrzebiegu);
    expect(screen.getByTestId('mvd-oze-adekw-brak-przebiegu')).toHaveTextContent(PULPIT_STRINGS.adekwBrakPrzebiegu);
  });

  it('wyróżnienie moduł→węzeł: klik włącza, ponowny wyłącza, przenosi się na inny moduł', async () => {
    trasy();
    const uzytkownik = userEvent.setup();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={noop} />);
    const pozPv = await screen.findByTestId(`mvd-oze-pulpit-poz-${PV.id}`);
    const pozBess = screen.getByTestId(`mvd-oze-pulpit-poz-${BESS.id}`);
    await uzytkownik.click(pozPv);
    expect(pozPv).toHaveAttribute('data-wyrozniony', 'true');
    await uzytkownik.click(pozPv);
    expect(pozPv).not.toHaveAttribute('data-wyrozniony');
    expect(pozPv).toHaveAttribute('aria-pressed', 'true');
    await uzytkownik.click(pozBess);
    expect(pozBess).toHaveAttribute('data-wyrozniony', 'true');
    expect(await screen.findByTestId('mvd-oze-magazyn-nieodnaleziona')).toBeInTheDocument();
  });

  it('przycisk dokumentów woła callback nawigacji', async () => {
    trasy();
    const onNawiguj = vi.fn();
    const uzytkownik = userEvent.setup();
    render(<PulpitOze trybZaawansowania="basic" onNawiguj={onNawiguj} />);
    await uzytkownik.click(await screen.findByTestId('mvd-oze-pulpit-dokumenty-przejdz'));
    expect(onNawiguj).toHaveBeenCalledWith('dokumentacja');
  });
});

describe('rozdział od biegu „co-jeśli" macierzy i metadane oceny', () => {
  it('bieg „co-jeśli" w macierzy nie zmienia oceny modelu na pulpicie (dowód zostaje z modelu)', async () => {
    const wywolania = trasy();
    const uzytkownik = userEvent.setup();
    render(
      <>
        <PulpitOze trybZaawansowania="basic" onNawiguj={noop} />
        <MacierzNcRfg trybZaawansowania="basic" />
      </>,
    );
    await ocenaWczytana();
    const przeprowadz = screen.getByTestId('mvd-oze-przeprowadz');
    await waitFor(() => expect(przeprowadz).toBeEnabled());
    await uzytkownik.click(przeprowadz);
    expect((await screen.findAllByTestId('mvd-oze-komorka-wynik')).length).toBeGreaterThan(0);
    expect(wywolania.filter((w) => w.sciezka === '/api/ncrfg-tests/run')).toHaveLength(1);
    // Bieg „co-jeśli" (ZADANIE_KLIENTA) nie niesie dowodu — pulpit nadal pokazuje dowód z modelu.
    expect(screen.getByTestId(`mvd-oze-pulpit-poz-dowod-${PV.id}`)).toHaveAttribute('data-stan', 'dowod');
  });

  it('odcisk oceny wyłącznie w informacjach audytowych trybu eksperckiego', async () => {
    trasy();
    const uzytkownik = userEvent.setup();
    render(<PulpitOze trybZaawansowania="expert" onNawiguj={noop} />);
    await ocenaWczytana();
    await uzytkownik.click(screen.getByTestId('mvd-oze-pulpit-odcisk-przelacz'));
    expect(screen.getByTestId('mvd-oze-pulpit-odcisk-lista')).toHaveTextContent(
      zgodnoscFixture().bieg!.deterministic_hash,
    );
  });
});
