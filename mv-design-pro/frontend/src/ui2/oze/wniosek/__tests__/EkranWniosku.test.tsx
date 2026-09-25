/**
 * Okno „Wniosek OSD" na kontrakcie V2 (karta AB-1a Pakiet D2 §5).
 *
 * Granica atrapy = `fetch` (produkcyjny klient `ncrfg/api.ts`); odpowiedzi policzone backendem
 * (widok modelu magazynu, 422 modelu sceny `macierz`, katalog). Rejestr przebiegów i moduły
 * zasiane z tych samych fixtur, z których backend policzył odpowiedzi. Iloczyn cech: przypadek
 * (brak / jest) × operator (z modelu / wymaga wyboru) × odpowiedź (widok / braki / błąd) ×
 * plik (DOCX / PDF) × tryb (podstawowy / ekspercki). Interakcje natywne (`userEvent`).
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useStationDerStore, type StationDerConnection } from '../../../../ui/network-build/station-der';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import { katalogFixture } from '../../macierz/__tests__/fixtures';
import { atrapaSieci, odpowiedzJson, odpowiedzPliku, type WywolanieSieci } from '../../ncrfg/__tests__/atrapaSieci';
import { useNcRfgStore } from '../../ncRfgStore';
import { EkranWniosku } from '../EkranWniosku';
import { WNIOSEK_STRINGS as T } from '../strings';
import {
  brakiWnioskuFixture,
  deryMacierzy,
  deryMagazynu,
  przebiegiMacierzy,
  przebiegiMagazynu,
  widokWnioskuFixture,
  zadanieMacierzy,
  zadanieMagazynu,
} from './fixtures';

type Odpowiedz = 'widok' | 'braki' | 'blad';

function trasy(odpowiedz: Odpowiedz) {
  return atrapaSieci([
    { metoda: 'GET', sciezka: '/api/ncrfg-tests/catalog', odpowiedz: () => odpowiedzJson(200, katalogFixture()) },
    {
      metoda: 'POST',
      sciezka: '/api/oze-analysis/osd-application',
      odpowiedz: () =>
        odpowiedz === 'widok'
          ? odpowiedzJson(200, widokWnioskuFixture())
          : odpowiedz === 'braki'
            ? odpowiedzJson(422, { detail: brakiWnioskuFixture() })
            : odpowiedzJson(404, { detail: 'Brak przebiegu o wskazanym identyfikatorze.' }),
    },
    {
      metoda: 'POST',
      sciezka: /^\/api\/oze-analysis\/osd-application\.(docx|pdf)$/,
      odpowiedz: () => odpowiedzPliku('PK', 'application/octet-stream'),
    },
  ]);
}

/** Szyna testowa do wyboru z listy (karta #145: projektant wybiera szynę po nazwie). */
const SZYNA_TESTOWA = 'szyna';

/**
 * Migawka modelu z szynami, które wniosek oferuje do wyboru — szyny obu fikstur żądań
 * sceny i szyna testowa bramki kompletności.
 */
function zasiejSzyny(): void {
  const refy = [SZYNA_TESTOWA, zadanieMagazynu().bus_ref, zadanieMacierzy().bus_ref];
  useSnapshotStore.setState({
    snapshot: {
      buses: [...new Set(refy)].map((ref, i) => ({
        ref_id: ref,
        id: `szyna-${i}`,
        name: `Szyna ${i + 1}`,
        voltage_kv: 15,
      })),
    },
  } as never);
}

function zasiej(ders: readonly StationDerConnection[], runs: ExecutionRun[], caseId: string | null = 'case-demo'): void {
  zasiejSzyny();
  useStationDerStore.setState({ ders: Object.fromEntries(ders.map((d) => [d.id, d])) });
  useExecutionRunsStore.setState({ runs, activeRunId: null });
  useAppStateStore.setState({
    activeProjectName: 'Przyłączenie farmy PV 8 MW',
    activeCaseName: 'Stan normalny',
    activeCaseId: caseId,
  } as never);
}

function posty(wywolania: readonly WywolanieSieci[], sciezka: string): WywolanieSieci[] {
  return wywolania.filter((w) => w.metoda === 'POST' && w.sciezka === sciezka);
}

async function zbuduj(uzytkownik: ReturnType<typeof userEvent.setup>, busRef: string): Promise<void> {
  await uzytkownik.selectOptions(screen.getByTestId('mvd-wniosek-wezel'), busRef);
  const przycisk = screen.getByTestId('mvd-wniosek-generuj');
  await waitFor(() => expect(przycisk).toBeEnabled());
  await uzytkownik.click(przycisk);
}

beforeEach(() => {
  useNcRfgStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useStationDerStore.setState({ ders: {} });
  useExecutionRunsStore.setState({ runs: [], activeRunId: null });
  useSnapshotStore.setState({ snapshot: null } as never);
  useNcRfgStore.getState().reset();
});

describe('dostępność generacji — bramka kompletności', () => {
  it('bez aktywnego przypadku: przycisk nieaktywny z tytułem o przypadku (zgodność z modelu)', async () => {
    trasy('widok');
    zasiej(deryMagazynu(), przebiegiMagazynu(), null);
    render(<EkranWniosku trybZaawansowania="basic" />);
    const przycisk = screen.getByTestId('mvd-wniosek-generuj');
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute('title', T.blokadaBrakPrzypadku);
  });

  it('operator z modelu pokazany jako fakt; różne profile → wymagany wybór bez wartości domyślnej', async () => {
    trasy('widok');
    zasiej(deryMagazynu(), przebiegiMagazynu());
    const { unmount } = render(<EkranWniosku trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-wniosek-operator')).toHaveAttribute('data-zrodlo', 'model');
    unmount();
    const [bess, pv] = deryMacierzy();
    zasiej([bess, { ...pv, profiles: { ...pv.profiles, nc_rfg_profile_ref: 'pse' } }], przebiegiMacierzy());
    const uzytkownik = userEvent.setup();
    render(<EkranWniosku trybZaawansowania="basic" />);
    const wybor = screen.getByTestId('mvd-wniosek-operator-wybor') as HTMLSelectElement;
    expect(wybor.value).toBe('');
    await uzytkownik.selectOptions(screen.getByTestId('mvd-wniosek-wezel'), SZYNA_TESTOWA);
    expect(screen.getByTestId('mvd-wniosek-generuj')).toHaveAttribute('title', T.blokadaBrakOperatora);
    await waitFor(() => expect(wybor).toBeEnabled());
    await uzytkownik.selectOptions(wybor, 'enea');
    expect(screen.getByTestId('mvd-wniosek-generuj')).toBeEnabled();
  });

  it('szyna przyłączenia wybierana z listy po nazwie — referencja jest wartością, nie tekstem opcji', () => {
    trasy('widok');
    zasiej(deryMagazynu(), przebiegiMagazynu());
    render(<EkranWniosku trybZaawansowania="expert" />);
    const opcje = within(screen.getByTestId('mvd-wniosek-wezel')).getAllByRole('option');
    const teksty = opcje.map((o) => o.textContent ?? '');
    expect(teksty).toContain('Szyna 1');
    expect(teksty).not.toContain(SZYNA_TESTOWA);
    expect(teksty.join(' ')).not.toContain(zadanieMagazynu().bus_ref);
    // Przebiegi nazwane rodzajem i czasem, nie identyfikatorem.
    within(screen.getByTestId('mvd-wniosek-pf')).getAllByRole('option').forEach((o) => {
      expect(o.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    });
  });

  it('pusta nazwa projektu → blokada; wpisanie → aktywny', async () => {
    trasy('widok');
    zasiej(deryMagazynu(), przebiegiMagazynu());
    const uzytkownik = userEvent.setup();
    render(<EkranWniosku trybZaawansowania="basic" />);
    await uzytkownik.selectOptions(screen.getByTestId('mvd-wniosek-wezel'), SZYNA_TESTOWA);
    await uzytkownik.clear(screen.getByTestId('mvd-wniosek-projekt'));
    expect(screen.getByTestId('mvd-wniosek-generuj')).toHaveAttribute('title', T.blokadaBrakProjektu);
    await uzytkownik.type(screen.getByTestId('mvd-wniosek-projekt'), 'Projekt');
    expect(screen.getByTestId('mvd-wniosek-generuj')).toBeEnabled();
  });
});

describe('generacja — żądanie V2 i widok', () => {
  it('żądanie = ciało fixtury sceny (case_id w zapytaniu, operator z modelu, bez biegu zgodności w ciele)', async () => {
    const wywolania = trasy('widok');
    zasiej(deryMagazynu(), przebiegiMagazynu());
    const uzytkownik = userEvent.setup();
    render(<EkranWniosku trybZaawansowania="basic" />);
    await zbuduj(uzytkownik, zadanieMagazynu().bus_ref);
    await screen.findByTestId('mvd-wniosek-wynik');
    const [zadanie] = posty(wywolania, '/api/oze-analysis/osd-application');
    expect(zadanie.zapytanie.get('case_id')).toBe('case-demo');
    expect(zadanie.cialo).toEqual(zadanieMagazynu());
  });

  it('widok: bilans (wartości bez kodów statusu i liczników), zwarcia, sekcje modułów z rekordami W', async () => {
    trasy('widok');
    zasiej(deryMagazynu(), przebiegiMagazynu());
    const uzytkownik = userEvent.setup();
    render(<EkranWniosku trybZaawansowania="basic" />);
    await zbuduj(uzytkownik, zadanieMagazynu().bus_ref);
    const widok = widokWnioskuFixture();
    const bilans = await screen.findByTestId('mvd-wniosek-bilans');
    expect(bilans).not.toHaveTextContent(widok.bilans_mocy.bilans_q_status);
    expect(bilans).not.toHaveTextContent(/spełnione|niespełnione|ostrzeżenia/);
    expect(screen.getByTestId('mvd-wniosek-zwarcia')).toHaveTextContent(widok.zwarcia_punkt_przylaczenia.nazwa_wezla);
    expect(screen.getByTestId('mvd-wniosek-zgodnosc-procedura')).toHaveTextContent(widok.zgodnosc_nc_rfg.procedura.tytul);
    for (const sekcja of widok.zgodnosc_nc_rfg.moduly) {
      const modul = screen.getByTestId(`mvd-wniosek-modul-${sekcja.der_ref}`);
      expect(within(modul).getByTestId(`mvd-wniosek-modul-${sekcja.der_ref}-wiersze`)).toHaveTextContent(
        sekcja.wiersze[0].etykieta_pl,
      );
    }
    expect(screen.getByTestId('mvd-wniosek-zalozenia')).toHaveTextContent(widok.zalozenia_pl[0]);
    expect(screen.queryByTestId('mvd-wniosek-werdykt')).toBeNull();
    expect(document.body).not.toHaveTextContent('[object Object]');
  });

  it('422 z brakami → ekran „czego brakuje": braki tekstowe, rekordy W (plakietka z rekordu), źródła pominięte', async () => {
    const wywolania = trasy('braki');
    zasiej(deryMacierzy(), przebiegiMacierzy());
    const uzytkownik = userEvent.setup();
    render(<EkranWniosku trybZaawansowania="basic" />);
    await zbuduj(uzytkownik, zadanieMacierzy().bus_ref);
    const braki = await screen.findByTestId('mvd-wniosek-braki');
    const fixtura = brakiWnioskuFixture();
    expect(braki).toHaveTextContent(T.brakiTytul);
    expect(braki).toHaveTextContent(fixtura.komunikat);
    // Brak należy do nazwanego modułu (`der_ref`/`der_name` z odpowiedzi 422).
    const brak = fixtura.braki_ncrfg[0];
    const modul = within(braki).getByTestId(`mvd-wniosek-braki-lista-modul-${brak.der_ref}`);
    expect(modul).toHaveTextContent(brak.der_name ?? brak.der_ref);
    expect(
      within(modul).getByTestId(`mvd-wniosek-braki-lista-rekordy-${brak.der_ref}-${brak.rekord.wymaganie_id}-etykieta`),
    ).toHaveTextContent(brak.rekord.etykieta.etykieta_pl);
    expect(screen.queryByTestId('mvd-wniosek-wynik')).toBeNull();
    expect(posty(wywolania, '/api/oze-analysis/osd-application')[0].cialo).toEqual(zadanieMacierzy());
  });

  it('błąd backendu → komunikat z treścią detail, bez podglądu', async () => {
    trasy('blad');
    zasiej(deryMagazynu(), przebiegiMagazynu());
    const uzytkownik = userEvent.setup();
    render(<EkranWniosku trybZaawansowania="basic" />);
    await zbuduj(uzytkownik, zadanieMagazynu().bus_ref);
    expect(await screen.findByTestId('mvd-wniosek-blad')).toHaveTextContent('Brak przebiegu o wskazanym identyfikatorze.');
  });

  it.each(['docx', 'pdf'] as const)('pobranie %s → plik z tego samego żądania i nazwa z formatem', async (format) => {
    const wywolania = trasy('widok');
    zasiej(deryMagazynu(), przebiegiMagazynu());
    const utworz = vi.fn(() => 'blob:wniosek');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: utworz, revokeObjectURL: vi.fn() }));
    const uzytkownik = userEvent.setup();
    render(<EkranWniosku trybZaawansowania="basic" />);
    await zbuduj(uzytkownik, zadanieMagazynu().bus_ref);
    await uzytkownik.click(await screen.findByTestId(`mvd-wniosek-pobierz-${format}`));
    await waitFor(() => expect(utworz).toHaveBeenCalledTimes(1));
    const [plik] = posty(wywolania, `/api/oze-analysis/osd-application.${format}`);
    expect(plik.zapytanie.get('case_id')).toBe('case-demo');
    expect(plik.cialo).toEqual(zadanieMagazynu());
  });

  it.each([
    ['basic', false],
    ['expert', true],
  ] as const)('tryb %s → odciski w informacjach audytowych: %s', async (tryb, widoczne) => {
    trasy('widok');
    zasiej(deryMagazynu(), przebiegiMagazynu());
    const uzytkownik = userEvent.setup();
    render(<EkranWniosku trybZaawansowania={tryb} />);
    await zbuduj(uzytkownik, zadanieMagazynu().bus_ref);
    await screen.findByTestId('mvd-wniosek-wynik');
    expect(screen.queryByTestId('mvd-wniosek-odciski') !== null).toBe(widoczne);
  });
});
