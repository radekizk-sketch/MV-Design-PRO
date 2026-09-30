/**
 * Ekran „Macierz wymogów NC RfG per moduł" na kontrakcie V2 (karta AB-1a Pakiet D2 §2–§5).
 *
 * Granica atrapy: WYŁĄCZNIE `fetch` (produkcyjny klient `ncrfg/api.ts`); odpowiedzi to
 * fixtury policzone backendem (katalog, wejścia modułów z modelu, bieg sceny, zgodność
 * przypadku, certyfikat 200/422). Interakcje natywne (`userEvent`). Iloczyn cech: operator
 * (z modelu / wymaga wyboru) × wejścia modelu (wczytane / bez przypadku / błąd odczytu) ×
 * moduł (gotowy / pominięty przez most) × stan biegu (przed / po) × komórka (rekord / brak
 * danych / brak biegu) × certyfikat (bez przypadku / 200 / 422 / błąd) × plik (DOCX / PDF).
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import certyfikatScenaZadanie from '../../../../harness-fixtures/generated/certyfikat_scena_zadanie.json';
import { useAppStateStore } from '../../../../ui/app-state';
import { useStationDerStore } from '../../../../ui/network-build/station-der';
import type { StationDerConnection } from '../../../../ui/network-build/station-der';
import { atrapaSieci, odpowiedzJson, odpowiedzPliku, type WywolanieSieci } from '../../ncrfg/__tests__/atrapaSieci';
import { useNcRfgStore } from '../../ncRfgStore';
import { MacierzNcRfg } from '../MacierzNcRfg';
import { ETYKIETY_POCHODZENIA as MACIERZ_STRINGS_POCHODZENIE, MACIERZ_STRINGS } from '../strings';
import type { WejsciaPrzypadkuNcRfg } from '../../ncrfg/typy';
import {
  biegFixture,
  certyfikatBrakiFixture,
  certyfikatWidokFixture,
  derFixture,
  deryScenyMacierz,
  katalogFixture,
  wejsciaFixture,
  zadanieBieguFixture,
  zgodnoscFixture,
} from './fixtures';

type OdpowiedzCertyfikatu = 'widok' | 'braki' | 'blad';

/**
 * Odpowiedź `GET …/wejscia` dla operatora z zapytania: wejścia mostu policzone dla operatora
 * sceny, z operatorem zapytania (most przepisuje go do każdego modułu 1:1).
 */
function wejsciaDlaOperatora(wejscia: WejsciaPrzypadkuNcRfg, operatorId: string): WejsciaPrzypadkuNcRfg {
  return {
    ...wejscia,
    operator_id: operatorId,
    modules: wejscia.modules.map((modul) => ({ ...modul, operator_id: operatorId })),
  };
}

function trasy(
  certyfikat: OdpowiedzCertyfikatu = 'widok',
  wejscia: WejsciaPrzypadkuNcRfg | 'blad' = wejsciaFixture(),
) {
  return atrapaSieci([
    { metoda: 'GET', sciezka: '/api/ncrfg-tests/catalog', odpowiedz: () => odpowiedzJson(200, katalogFixture()) },
    {
      metoda: 'GET',
      sciezka: /^\/api\/ncrfg-tests\/cases\/[^/]+\/wejscia$/,
      odpowiedz: (w) =>
        wejscia === 'blad'
          ? odpowiedzJson(404, { detail: 'Przypadek nie ma dokumentu ENM.' })
          : odpowiedzJson(200, wejsciaDlaOperatora(wejscia, w.zapytanie.get('operator_id') ?? '')),
    },
    { metoda: 'POST', sciezka: '/api/ncrfg-tests/run', odpowiedz: () => odpowiedzJson(200, biegFixture()) },
    {
      metoda: 'GET',
      sciezka: /^\/api\/ncrfg-tests\/cases\/[^/]+\/compliance$/,
      odpowiedz: () => odpowiedzJson(200, zgodnoscFixture()),
    },
    {
      metoda: 'POST',
      sciezka: '/api/oze-analysis/compliance-certificate',
      odpowiedz: () =>
        certyfikat === 'widok'
          ? odpowiedzJson(200, certyfikatWidokFixture())
          : certyfikat === 'braki'
            ? odpowiedzJson(422, { detail: certyfikatBrakiFixture() })
            : odpowiedzJson(500, { detail: 'Błąd wewnętrzny generatora certyfikatu' }),
    },
    {
      metoda: 'POST',
      sciezka: /^\/api\/oze-analysis\/compliance-certificate\.(docx|pdf)$/,
      odpowiedz: () => odpowiedzPliku('PK', 'application/octet-stream'),
    },
  ]);
}

function zasiejModuly(ders: readonly StationDerConnection[]): void {
  useStationDerStore.setState({ ders: Object.fromEntries(ders.map((d) => [d.id, d])) });
}

function wywolaniaPost(wywolania: readonly WywolanieSieci[], sciezka: string): WywolanieSieci[] {
  return wywolania.filter((w) => w.metoda === 'POST' && w.sciezka === sciezka);
}

beforeEach(() => {
  useNcRfgStore.getState().reset();
  zasiejModuly(deryScenyMacierz());
  useAppStateStore.setState({
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseName: 'Stan normalny',
    activeCaseId: 'case-demo',
  } as never);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useStationDerStore.setState({ ders: {} });
  useNcRfgStore.getState().reset();
});

async function przeprowadzBieg(uzytkownik: ReturnType<typeof userEvent.setup>): Promise<void> {
  const przycisk = await screen.findByTestId('mvd-oze-przeprowadz');
  await waitFor(() => expect(przycisk).toBeEnabled());
  await uzytkownik.click(przycisk);
  await waitFor(() => expect(screen.getAllByTestId('mvd-oze-komorka-wynik').length).toBeGreaterThan(0));
}

describe('macierz przed biegiem — wiersze z katalogu, operator z modelu, procedura jako dokument', () => {
  it('wiersze = testy katalogu (podstawa, rodzaj twierdzenia), kolumny = moduły modelu', async () => {
    trasy();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await waitFor(() => expect(screen.getAllByTestId('mvd-oze-wiersz')).toHaveLength(katalogFixture().tests.length));
    for (const der of deryScenyMacierz()) expect(screen.getByTestId(`mvd-oze-modul-${der.id}`)).toBeInTheDocument();
    const pierwszy = screen.getAllByTestId('mvd-oze-wiersz')[0];
    expect(pierwszy).toHaveTextContent(katalogFixture().tests[0].procedure_basis_pl);
    expect(pierwszy).toHaveTextContent(MACIERZ_STRINGS.rodzajTwierdzenia);
    expect(screen.getAllByTestId('mvd-oze-komorka-brak-biegu').length).toBeGreaterThan(0);
    expect(screen.getByTestId('mvd-oze-operator')).toHaveAttribute('data-zrodlo', 'model');
    expect(screen.getByTestId('mvd-oze-operator-wartosc')).toHaveTextContent('Enea');
    expect(screen.getByTestId('mvd-oze-wersja-procedury')).toHaveTextContent(katalogFixture().procedure_version.tytul);
    expect(document.body).not.toHaveTextContent('[object Object]');
  });

  it('brak modułów → uczciwy stan pusty z akcją dodania źródła', async () => {
    trasy();
    zasiejModuly([]);
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    expect(await screen.findByTestId('mvd-oze-pusty')).toHaveTextContent(MACIERZ_STRINGS.brakModulow);
  });
});

describe('bieg „co-jeśli" — ciało żądania i komórki z rekordów', () => {
  it('żądanie = ciało fixtury sceny (tylko moduły; bez wersji procedury i pola certyfikatu)', async () => {
    const wywolania = trasy();
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg(uzytkownik);
    const [bieg] = wywolaniaPost(wywolania, '/api/ncrfg-tests/run');
    expect(bieg.cialo).toEqual(zadanieBieguFixture());
  });

  it('komórka = plakietka etykiety z rekordu `ocena` (tekst, status, semantyka z backendu)', async () => {
    trasy();
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg(uzytkownik);
    const bieg = biegFixture();
    const oceny = bieg.modules.flatMap((m) => m.tests.map((t) => t.ocena));
    const komorki = screen.getAllByTestId('mvd-oze-komorka-wynik');
    expect(komorki).toHaveLength(oceny.length);
    const pierwszaKolumna = bieg.modules[0].tests[0].ocena;
    const pierwszaKomorka = within(screen.getAllByTestId('mvd-oze-wiersz')[0]).getAllByTestId('mvd-oze-komorka-wynik')[0];
    const plakietka = pierwszaKomorka.querySelector('[data-semantyka]')!;
    expect(plakietka).toHaveTextContent(pierwszaKolumna.etykieta.etykieta_pl);
    expect(plakietka).toHaveAttribute('data-status', pierwszaKolumna.status_maszynowy);
    expect(plakietka).toHaveAttribute('data-semantyka', pierwszaKolumna.etykieta.semantyka);
  });

  it('klik komórki → pełna karta rekordu, definicja testu i ślad (natywny klik)', async () => {
    trasy();
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg(uzytkownik);
    const bieg = biegFixture();
    const test = bieg.modules[1].tests[0];
    const wiersz = screen.getAllByTestId('mvd-oze-wiersz')[0];
    await uzytkownik.click(within(wiersz).getAllByTestId('mvd-oze-komorka-wynik')[1]);
    const szczegol = screen.getByTestId('mvd-oze-szczegol-wynik');
    expect(within(szczegol).getByTestId(`mvd-werdykt-${test.ocena.kryterium_id}`)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-szczegol-definicja')).toHaveTextContent(
      bieg.test_catalog.find((d) => d.test_id === test.test_id)!.procedure_basis_pl,
    );
    if (test.trace_refs.length > 0) {
      await uzytkownik.click(screen.getByTestId('mvd-oze-slad-przelacz'));
      expect(screen.getByTestId('mvd-oze-slad-przelacz')).toHaveAttribute('aria-expanded', 'true');
    }
  });

  it.each([
    ['basic', false],
    ['expert', true],
  ] as const)(
    'tryb %s: identyfikator zdolności dowodowej w wierszu tabeli i w panelu szczegółu — jeden predykat (widoczny: %s)',
    async (tryb, widoczny) => {
      trasy();
      const uzytkownik = userEvent.setup();
      render(<MacierzNcRfg trybZaawansowania={tryb} />);
      await przeprowadzBieg(uzytkownik);
      const bieg = biegFixture();
      const test = bieg.modules[1].tests[0];
      const definicja = bieg.test_catalog.find((d) => d.test_id === test.test_id)!;
      const wiersz = screen.getAllByTestId('mvd-oze-wiersz')[0];
      // Karta #145: identyfikator zdolności nie stoi w wierszu tabeli w żadnym trybie.
      expect(wiersz.textContent?.includes(definicja.zdolnosc_id)).toBe(false);
      await uzytkownik.click(within(wiersz).getAllByTestId('mvd-oze-komorka-wynik')[1]);
      const szczegol = screen.getByTestId('mvd-oze-szczegol-wynik');
      expect(within(szczegol).queryByTestId('mvd-oze-szczegol-zdolnosc') !== null).toBe(widoczny);
    },
  );

  it('nagłówek kolumny i panel wyniku modułu: klasyfikacja backendu, dowód = jawny brak, rekordy W', async () => {
    trasy();
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg(uzytkownik);
    const bieg = biegFixture();
    const pv = bieg.modules[1];
    expect(screen.getByTestId(`mvd-oze-modul-klasa-${pv.der_ref}`)).toHaveTextContent(`Typ modułu ${pv.klasyfikacja.modul}`);
    await uzytkownik.click(screen.getByTestId(`mvd-oze-modul-${pv.der_ref}`));
    expect(screen.getByTestId(`mvd-oze-wynik-modulu-naglowek-${pv.der_ref}-dowod`)).toHaveAttribute('data-stan', 'brak');
    const wymagania = bieg.ocena_wymagan[1].wymagania;
    expect(within(screen.getByTestId(`mvd-oze-wymagania-${pv.der_ref}`)).getAllByRole('listitem')).toHaveLength(
      wymagania.length,
    );
  });

  it('filtr komórek po etykiecie z rekordu zawęża wiersze (nawigacja, bez liczników)', async () => {
    trasy();
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg(uzytkownik);
    const bieg = biegFixture();
    const etykieta = bieg.modules[1].tests[0].ocena.etykieta.etykieta_pl;
    await uzytkownik.selectOptions(screen.getByTestId('mvd-oze-filtr'), etykieta);
    const oczekiwane = bieg.test_catalog.filter((d) =>
      bieg.modules.some((m) => m.tests.find((t) => t.test_id === d.test_id)?.ocena.etykieta.etykieta_pl === etykieta),
    );
    expect(screen.getAllByTestId('mvd-oze-wiersz')).toHaveLength(oczekiwane.length);
    await uzytkownik.selectOptions(screen.getByTestId('mvd-oze-filtr'), '');
    expect(screen.getAllByTestId('mvd-oze-wiersz')).toHaveLength(bieg.test_catalog.length);
  });

  it('błąd pola formularza (natywne wpisanie) → brak żądania, pole z nazwanym błędem', async () => {
    const wywolania = trasy();
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const pv = deryScenyMacierz()[1];
    await uzytkownik.click(await screen.findByTestId(`mvd-oze-modul-${pv.id}`));
    await uzytkownik.type(await screen.findByTestId('mvd-oze-param-cos_phi_min'), '1,5');
    await uzytkownik.click(screen.getByTestId('mvd-oze-przeprowadz'));
    expect(await screen.findByTestId('mvd-oze-param-cos_phi_min-blad')).toHaveTextContent('większa od 1');
    expect(screen.getByTestId('mvd-oze-bledy-formularza')).toHaveTextContent(pv.name);
    expect(wywolaniaPost(wywolania, '/api/ncrfg-tests/run')).toHaveLength(0);
  });

  it('pola art. 4 i T12 z formularza trafiają do żądania biegu', async () => {
    const wywolania = trasy();
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const pv = deryScenyMacierz()[1];
    await uzytkownik.click(await screen.findByTestId(`mvd-oze-modul-${pv.id}`));
    await uzytkownik.selectOptions(await screen.findByTestId('mvd-oze-param-modul_istniejacy'), 'nie');
    await uzytkownik.type(screen.getByTestId('mvd-oze-param-cease_generation_time_s'), '5');
    await przeprowadzBieg(uzytkownik);
    const [bieg] = wywolaniaPost(wywolania, '/api/ncrfg-tests/run');
    const modul = (bieg.cialo as { modules: { der_ref: string; modul_istniejacy: unknown; cease_generation_time_s: unknown }[] })
      .modules.find((m) => m.der_ref === pv.id)!;
    expect(modul.modul_istniejacy).toBe(false);
    expect(modul.cease_generation_time_s).toBe(5);
  });
});

describe('formularz wstępny z wejść modelu (`GET …/wejscia`) — luka §5.3', () => {
  it('zapytanie: przypadek w ścieżce, operator z modelu; pola liczone przez most z pochodzeniem „z modelu"', async () => {
    const wywolania = trasy();
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const pv = wejsciaFixture().modules.find((m) => m.der_kind === 'PV')!;
    await uzytkownik.click(await screen.findByTestId(`mvd-oze-modul-${pv.der_ref}`));
    expect(await screen.findByTestId('mvd-oze-param-droop_percent')).toHaveValue(String(pv.droop_percent));
    const zapytanie = wywolania.find((w) => w.sciezka.endsWith('/wejscia'))!;
    expect(zapytanie.sciezka).toBe('/api/ncrfg-tests/cases/case-demo/wejscia');
    expect(zapytanie.zapytanie.get('operator_id')).toBe('enea');
    const pole = (nazwa: string) => screen.getByTestId(`mvd-oze-param-${nazwa}`).closest('label')!;
    expect(pole('droop_percent')).toHaveTextContent(MACIERZ_STRINGS_POCHODZENIE.model);
    expect(pole('dead_band_hz')).toHaveTextContent(MACIERZ_STRINGS_POCHODZENIE.model);
    expect(screen.getByTestId('mvd-oze-param-dead_band_hz')).toHaveValue(String(pv.dead_band_hz));
    expect(pole('q_range_pct_pn_max')).toHaveTextContent(MACIERZ_STRINGS_POCHODZENIE.model);
    // cos φ bez danej w modelu — pole puste, dane deklarowane (nigdy wartość typowa).
    expect(screen.getByTestId('mvd-oze-param-cos_phi_min')).toHaveValue('');
    expect(pole('cos_phi_min')).toHaveTextContent(MACIERZ_STRINGS_POCHODZENIE.deklarowane);
  });

  it('bez przypadku → brak odczytu wejść, bieg zablokowany z powodem, panel bez formularza', async () => {
    const wywolania = trasy();
    useAppStateStore.setState({ activeCaseId: null } as never);
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const przycisk = await screen.findByTestId('mvd-oze-przeprowadz');
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute('title', MACIERZ_STRINGS.brakPrzypadkuWejsc);
    await uzytkownik.click(screen.getByTestId(`mvd-oze-modul-${deryScenyMacierz()[1].id}`));
    expect(screen.getByTestId('mvd-oze-panel-blokada')).toHaveTextContent(MACIERZ_STRINGS.brakWejsciaModelu);
    expect(screen.queryByTestId('mvd-oze-param-droop_percent')).toBeNull();
    expect(wywolania.some((w) => w.sciezka.endsWith('/wejscia'))).toBe(false);
  });

  it('błąd odczytu wejść → alert z treścią backendu, bieg zablokowany, zero żądania biegu', async () => {
    const wywolania = trasy('widok', 'blad');
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    expect(await screen.findByTestId('mvd-oze-blad-wejsc')).toHaveTextContent('Przypadek nie ma dokumentu ENM.');
    const przycisk = screen.getByTestId('mvd-oze-przeprowadz');
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute('title', MACIERZ_STRINGS.bladWejsc);
    expect(wywolaniaPost(wywolania, '/api/ncrfg-tests/run')).toHaveLength(0);
  });
});

describe('operator — z modelu albo jawny wybór, nigdy domyślny', () => {
  it('moduły z różnymi profilami → pole wyboru bez wartości, bieg zablokowany do wyboru', async () => {
    const wywolania = trasy();
    const [bess, pv] = deryScenyMacierz();
    zasiejModuly([bess, { ...pv, profiles: { ...pv.profiles, nc_rfg_profile_ref: 'pse' } }]);
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const wybor = (await screen.findByTestId('mvd-oze-operator-wybor')) as HTMLSelectElement;
    await waitFor(() => expect(wybor).toBeEnabled());
    expect(wybor.value).toBe('');
    expect(screen.getByTestId('mvd-oze-przeprowadz')).toBeDisabled();
    await uzytkownik.selectOptions(wybor, 'pse');
    await przeprowadzBieg(uzytkownik);
    const [bieg] = wywolaniaPost(wywolania, '/api/ncrfg-tests/run');
    expect((bieg.cialo as { modules: { operator_id: string }[] }).modules.map((m) => m.operator_id)).toEqual(['pse', 'pse']);
  });
});

describe('moduł bez danych modelu', () => {
  it('kolumna modułu pominiętego przez most (brak napięcia) → komórki „brak wyniku", szczegół z jawnym powodem, poza biegiem', async () => {
    const bezNapiecia: StationDerConnection = derFixture({
      id: 'zz-fw-bez-napiecia',
      name: 'Farma wiatrowa bez szyny',
      der_kind: 'FW',
      connection_voltage_kv: null,
      profiles: { nc_rfg_profile_ref: 'enea' },
    });
    const wejscia = wejsciaFixture();
    const wywolania = trasy('widok', {
      ...wejscia,
      pominiete: [
        { der_ref: bezNapiecia.id, der_name: bezNapiecia.name, powod: 'brak_napiecia', powod_pl: 'Brak szyny.' },
      ],
    });
    zasiejModuly([...deryScenyMacierz(), bezNapiecia]);
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    await przeprowadzBieg(uzytkownik);
    const brak = screen.getAllByTestId('mvd-oze-komorka-brak-danych');
    expect(brak).toHaveLength(biegFixture().test_catalog.length);
    await uzytkownik.click(brak[0]);
    expect(screen.getByTestId('mvd-oze-szczegol-blokada')).toBeInTheDocument();
    const [bieg] = wywolaniaPost(wywolania, '/api/ncrfg-tests/run');
    expect((bieg.cialo as { modules: { der_ref: string }[] }).modules.map((m) => m.der_ref)).not.toContain(bezNapiecia.id);
  });
});

describe('metadane biegu — tylko w informacjach audytowych trybu eksperckiego', () => {
  it.each([
    ['basic', false],
    ['expert', true],
  ] as const)('tryb %s → odciski widoczne: %s', async (tryb, widoczne) => {
    trasy();
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania={tryb} />);
    await przeprowadzBieg(uzytkownik);
    expect(screen.queryByTestId('mvd-oze-odcisk') !== null).toBe(widoczne);
  });

  it.each([
    ['basic', false],
    ['expert', true],
  ] as const)(
    'tryb %s → identyfikator zdolności dowodowej w wierszu testu I w ocenie komórki: %s (jeden predykat, oba miejsca)',
    async (tryb, widoczny) => {
      trasy();
      const uzytkownik = userEvent.setup();
      render(<MacierzNcRfg trybZaawansowania={tryb} />);
      await przeprowadzBieg(uzytkownik);
      const [wiersz] = screen.getAllByTestId('mvd-oze-wiersz');
      const definicja = biegFixture().test_catalog.find((d) =>
        wiersz.textContent?.startsWith(`${d.test_id} · `),
      )!;
      expect(wiersz.textContent?.includes(definicja.zdolnosc_id)).toBe(false);
      await uzytkownik.click(within(wiersz).getAllByTestId('mvd-oze-komorka-wynik')[0]);
      expect(screen.getByTestId('mvd-oze-szczegol-definicja')).toHaveTextContent(definicja.procedure_basis_pl);
      expect(screen.queryByTestId('mvd-oze-szczegol-zdolnosc') !== null).toBe(widoczny);
    },
  );
});

describe('zgodność przypadku (zatwierdzony model) obok macierzy', () => {
  it('z przypadkiem i operatorem z modelu: zapytanie z operator_id, dowód PV z wykazu (numer, WiPWC)', async () => {
    const wywolania = trasy();
    useAppStateStore.setState({ activeCaseId: 'case-demo' } as never);
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const pv = zgodnoscFixture().bieg!.modules.find((m) => m.dowod_certyfikatu !== null)!;
    const dowod = await screen.findByTestId(`mvd-oze-zgodnosc-przekrojowa-naglowek-${pv.der_ref}-dowod`);
    expect(dowod).toHaveAttribute('data-stan', 'dowod');
    expect(screen.getByTestId(`mvd-oze-zgodnosc-przekrojowa-naglowek-${pv.der_ref}-dowod-numer`)).toHaveTextContent(
      pv.dowod_certyfikatu!.numer_dokumentu,
    );
    const zapytanie = wywolania.find((w) => w.sciezka.endsWith('/compliance'))!;
    expect(zapytanie.zapytanie.get('operator_id')).toBe('enea');
  });
});

describe('certyfikat zgodności — z zatwierdzonego modelu przypadku', () => {
  it('bez aktywnego przypadku przycisk nieaktywny z tytułem wyjaśniającym', async () => {
    trasy();
    useAppStateStore.setState({ activeCaseId: null } as never);
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const przycisk = await screen.findByTestId('mvd-oze-certyfikat-przycisk');
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute('title', MACIERZ_STRINGS.certyfikatTytulNieaktywny);
  });

  it('żądanie: case_id w zapytaniu, ciało = CertyfikatZgodnosciRequest (fixtura sceny); widok z sekcjami modułów', async () => {
    const wywolania = trasy('widok');
    useAppStateStore.setState({ activeCaseId: 'case-demo' } as never);
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="expert" />);
    const przycisk = await screen.findByTestId('mvd-oze-certyfikat-przycisk');
    await waitFor(() => expect(przycisk).toBeEnabled());
    await uzytkownik.click(przycisk);
    expect(await screen.findByTestId('mvd-oze-cert-widok')).toBeInTheDocument();
    const [zadanie] = wywolaniaPost(wywolania, '/api/oze-analysis/compliance-certificate');
    expect(zadanie.zapytanie.get('case_id')).toBe('case-demo');
    expect(zadanie.cialo).toEqual(certyfikatScenaZadanie);
    const widok = certyfikatWidokFixture();
    expect(screen.getByTestId('mvd-oze-cert-procedura')).toHaveTextContent(widok.identyfikacja.procedura.tytul);
    for (const sekcja of widok.moduly) expect(screen.getByTestId(`mvd-oze-cert-modul-${sekcja.der_ref}`)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-cert-audyt')).toBeInTheDocument();
    expect(screen.queryByText(/werdykt zbiorczy/i)).toBeNull();
  });

  it('422 z brakami → ekran „czego brakuje" z rekordami W (plakietka z rekordu), bez komunikatu błędu', async () => {
    trasy('braki');
    useAppStateStore.setState({ activeCaseId: 'case-demo' } as never);
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const przycisk = await screen.findByTestId('mvd-oze-certyfikat-przycisk');
    await waitFor(() => expect(przycisk).toBeEnabled());
    await uzytkownik.click(przycisk);
    const braki = await screen.findByTestId('mvd-oze-cert-braki');
    const fixtura = certyfikatBrakiFixture();
    expect(braki).toHaveTextContent(MACIERZ_STRINGS.certyfikatBrakiTytul);
    expect(braki).toHaveTextContent(fixtura.komunikat);
    // Brak należy do nazwanego modułu (`der_ref`/`der_name` z odpowiedzi 422).
    const brak = fixtura.braki[0];
    const modul = within(braki).getByTestId(`mvd-oze-cert-braki-lista-modul-${brak.der_ref}`);
    expect(modul).toHaveTextContent(brak.der_name ?? brak.der_ref);
    expect(
      within(modul).getByTestId(`mvd-oze-cert-braki-lista-rekordy-${brak.der_ref}-${brak.rekord.wymaganie_id}-etykieta`),
    ).toHaveTextContent(brak.rekord.etykieta.etykieta_pl);
    expect(screen.queryByTestId('mvd-oze-cert-blad')).toBeNull();
    expect(screen.queryByTestId('mvd-oze-cert-widok')).toBeNull();
  });

  it('błąd serwera → komunikat błędu z treścią backendu, bez widoku', async () => {
    trasy('blad');
    useAppStateStore.setState({ activeCaseId: 'case-demo' } as never);
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const przycisk = await screen.findByTestId('mvd-oze-certyfikat-przycisk');
    await waitFor(() => expect(przycisk).toBeEnabled());
    await uzytkownik.click(przycisk);
    expect(await screen.findByTestId('mvd-oze-cert-blad')).toHaveTextContent('Błąd wewnętrzny generatora certyfikatu');
  });

  it.each(['docx', 'pdf'] as const)('pobranie %s → plik z tego samego żądania (case_id, ciało)', async (format) => {
    const wywolania = trasy('widok');
    useAppStateStore.setState({ activeCaseId: 'case-demo' } as never);
    const utworz = vi.fn(() => 'blob:certyfikat');
    const zwolnij = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: utworz, revokeObjectURL: zwolnij }));
    const uzytkownik = userEvent.setup();
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const przycisk = await screen.findByTestId('mvd-oze-certyfikat-przycisk');
    await waitFor(() => expect(przycisk).toBeEnabled());
    await uzytkownik.click(przycisk);
    await uzytkownik.click(await screen.findByTestId(`mvd-oze-cert-pobierz-${format}`));
    await waitFor(() => expect(utworz).toHaveBeenCalledTimes(1));
    const [plik] = wywolaniaPost(wywolania, `/api/oze-analysis/compliance-certificate.${format}`);
    expect(plik.zapytanie.get('case_id')).toBe('case-demo');
    expect(plik.cialo).toEqual(certyfikatScenaZadanie);
  });
});

describe('stan oceny FRT z okna falownika (zapis w store)', () => {
  it('tekst stanu zapisanego przez okno FRT przy module, bez koloru liczonego w macierzy', async () => {
    trasy();
    const pv = deryScenyMacierz()[1];
    useNcRfgStore.getState().zapiszWynikFrt(pv.id, {
      testKind: 'lvrt',
      tekst: 'Ocena niewykonana',
      istotnosc: 'ostrzegawcza',
      operatorId: 'enea',
    });
    render(<MacierzNcRfg trybZaawansowania="basic" />);
    const frt = await screen.findByTestId(`mvd-oze-frt-lvrt-${pv.id}`);
    expect(frt).toHaveTextContent('Ocena niewykonana');
    expect(screen.getByTestId(`mvd-oze-frt-lvrt-tekst-${pv.id}`)).toHaveTextContent(
      'Ocena niewykonana',
    );
    // Macierz nie tłumaczy istotności zapisanej przez okno FRT na kolor (zero mapy w kliencie).
    expect(frt.querySelector('[data-semantyka]')).toBeNull();
    // Moduł bez zapisanego stanu nie dostaje wiersza FRT (zero atrapy).
    expect(screen.queryByTestId(`mvd-oze-frt-hvrt-${pv.id}`)).not.toBeInTheDocument();
  });
});
