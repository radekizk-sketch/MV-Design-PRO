/**
 * Edytor nastaw sterownika zabezpieczeń — JEDYNY pisarz nastaw ścieżki projektanta (karta
 * OCHRONA-JEDNO-ZRODLO, ADR-022).
 *
 * Wejście: PRAWDZIWY model sieci złotej G08 (migawka z generatora fikstur harnessu: sterowniki pól
 * szablonu bez nastaw i dwa sterowniki wyłączników liniowych z nastawami zapisanymi operacjami
 * domenowymi) i PRAWDZIWY read model `protection-view` tego modelu — nie ręczny kształt. Warianty
 * (druga grupa nastaw, funkcja dopisana tylko w rejestrze) powstają z rekordu fikstury jawnym
 * przekształceniem w teście. Kliki i wpisy natywne (userEvent) na realnych kontrolkach; zapis
 * mockowany na granicy magazynu migawki (`executeDomainOperation` — operacja
 * `update_protection_settings`).
 *
 * Iloczyn cech: {grupa 1–4} × {grupa aktywna, nieaktywna} × {charakterystyka zależna (TMS), DT
 * (zwłoka), nieustawiona} × {funkcja włączona, wyłączona} × {funkcja zmieniona, niezmieniona} ×
 * {funkcja z rejestru bez znajomości edytora} × {zapis przyjęty, odmowa backendu, brak przypadku}
 * × {braki z backendu, komplet} × {profil charakterystyk z wyrobu, wskazany} × {skład funkcji:
 * dodanie funkcji z rejestru, zdjęcie funkcji sterownika, wybór pusty / już obecna}.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import type { NastawyUrzadzeniaWidok, PozycjaSlownika } from '../../../../ui/protection/nastawyModelu';
import type { EnergyNetworkModel, ProtectionAssignment } from '../../../../types/enm';
import { funkcjaEaz } from '../../../../ui/shared/funkcjeEaz';
import {
  EdytorNastawZabezpieczenia,
  NUMERY_GRUP_NASTAW,
  formularzZeSterownika,
  ladunekSkladuFunkcji,
  ladunekZapisu,
  nastawyDoZapisu,
} from '../EdytorNastawZabezpieczenia';
import { NASTAWY_STRINGS as T } from '../stringsNastaw';
import migawkaSceny from '../../../../harness-fixtures/generated/koordynacja_scena_migawka.json';
import widokSceny from '../../../../harness-fixtures/generated/koordynacja_scena_widok_zabezpieczen.json';
import wynikOcenySceny from '../../../../harness-fixtures/generated/koordynacja_scena_ocena.json';
import type { WynikOcenyZabezpieczen } from '../../../wyniki/koordynacja/ocenaZabezpieczenApi';
import { rekordyZiemnozwarciowe } from '../../../wyniki/koordynacja/ocenaZiemnozwarciowa';
import { ustawBiegOgladany, wyczyscKontekstWyniku } from '../../../../test/kontekstBiegu';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';

const MIGAWKA = migawkaSceny as unknown as EnergyNetworkModel;
const WIDOK = widokSceny as unknown as {
  assignments: { device_id: string; nastawy: NastawyUrzadzeniaWidok | null }[];
  profile_charakterystyk: PozycjaSlownika[];
};
/** Sterowniki wyłączników liniowych sieci złotej — nastawy zapisane operacjami domenowymi. */
const Z_NASTAWAMI = MIGAWKA.protection_assignments!.filter((p) => p.grupy_nastaw.length > 0);
const STEROWNIK = Z_NASTAWAMI[0];
const REF = STEROWNIK.ref_id;
const NASTAWY = WIDOK.assignments.find((a) => a.device_id === REF)!.nastawy!;

const zapis = vi.fn();

function ustawModel(sterownik: ProtectionAssignment = STEROWNIK) {
  const model: EnergyNetworkModel = {
    ...MIGAWKA,
    protection_assignments: MIGAWKA.protection_assignments!.map((p) => (p.ref_id === sterownik.ref_id ? sterownik : p)),
  };
  useSnapshotStore.setState({ snapshot: model, error: null, executeDomainOperation: zapis } as never);
}

/** Wariant rekordu fikstury: grupa 2 z innym progiem I> (51) — kopia grupy 1 z jedną zmianą. */
function zDrugaGrupa(aktywna: number): ProtectionAssignment {
  const [g1] = STEROWNIK.grupy_nastaw;
  const g2 = {
    numer: 2,
    funkcje: (g1.funkcje ?? []).map((f) =>
      f.funkcja_ref === '51'
        ? { ...f, nastawy: (f.nastawy ?? []).map((n) => (n.klucz === 'prog' ? { ...n, wartosc: 3.5 } : n)) }
        : f,
    ),
  };
  return { ...STEROWNIK, grupy_nastaw: [g1, g2], aktywna_grupa: aktywna };
}

beforeEach(() => {
  zapis.mockReset();
  zapis.mockResolvedValue({ snapshot: MIGAWKA, error: null });
  useAppStateStore.getState().setActiveCase('case-1', 'Wariant bazowy');
  ustawModel();
});

afterEach(() => {
  cleanup();
  useAppStateStore.getState().reset();
});

function renderuj(nastawy: NastawyUrzadzeniaWidok | undefined = NASTAWY, ref = REF) {
  return render(
    <EdytorNastawZabezpieczenia
      urzadzenieRef={ref}
      nastawy={nastawy}
      profile={WIDOK.profile_charakterystyk}
      testid="edytor"
    />,
  );
}

describe('formularz ↔ sterownik modelu (czyste przekształcenia)', () => {
  it('sterownik bez zmian w formularzu nie daje ładunku — każda grupa, każdy sterownik sieci złotej', () => {
    // Para predykatów: formularz ze sterownika i różnica formularza z modelem pochodzą z jednej
    // reguły (`nastawyDoZapisu`) — inaczej „Zapisz" wysłałby nastawy, których nikt nie zmienił.
    for (const p of MIGAWKA.protection_assignments!) {
      for (const n of NUMERY_GRUP_NASTAW) {
        expect(ladunekZapisu(p, n, formularzZeSterownika(p, n), p.charakterystyki_ref ?? null)).toBeNull();
      }
    }
  });

  it('ładunek niesie WYŁĄCZNIE funkcję zmienioną (niezmieniona zachowuje pochodzenie nastaw)', () => {
    const formularz = formularzZeSterownika(STEROWNIK, 1);
    const zmieniony = { ...formularz, nastawy: { ...formularz.nastawy, '51': { ...formularz.nastawy['51'], tms: '0.25' } } };
    expect(ladunekZapisu(STEROWNIK, 1, zmieniony, null)).toEqual({
      protection_ref: REF,
      grupa: 1,
      nastawy: { '51': { jednostka_progu: 'A_WTORNY', krzywa: 'IEC_SI', prog: 2, tms: 0.25 } },
    });
  });

  it.each([
    ['DT', { jednostka_progu: 'A_WTORNY', krzywa: 'DT', prog: 2, zwloka_s: 0.4 }],
    ['IEC_SI', { jednostka_progu: 'A_WTORNY', krzywa: 'IEC_SI', prog: 2, tms: 0.3 }],
    ['', { jednostka_progu: 'A_WTORNY', prog: 2 }],
  ] as const)('charakterystyka „%s": do zapisu idzie tylko właściwa rodzina czasu', (krzywa, oczekiwane) => {
    expect(nastawyDoZapisu('51', { prog: '2', jednostka_progu: 'A_WTORNY', krzywa, tms: '0.3', zwloka_s: '0.4' })).toEqual(
      oczekiwane,
    );
  });

  it('pole puste nie jest zastępowane zerem (brak, nie wartość); przecinek dziesiętny czytany', () => {
    expect(nastawyDoZapisu('51', { prog: '', krzywa: '', tms: '' })).toEqual({});
    expect(nastawyDoZapisu('46', { prog_i2_proc_in: '12,5', zwloka_s: '' })).toEqual({ prog_i2_proc_in: 12.5 });
  });

  it('skład funkcji: dodanie dopisuje kod na końcu, zdjęcie usuwa go; bez skutku → brak ładunku', () => {
    const kody = STEROWNIK.funkcje.map((f) => f.kod);
    expect(ladunekSkladuFunkcji(STEROWNIK, { dodaj: '46' })).toEqual({ protection_ref: REF, funkcje: [...kody, '46'] });
    expect(ladunekSkladuFunkcji(STEROWNIK, { zdejmij: '50' })).toEqual({
      protection_ref: REF,
      funkcje: kody.filter((k) => k !== '50'),
    });
    // Para predykatów: kod już obecny / nieobecny i wybór pusty — żadnej operacji.
    expect(ladunekSkladuFunkcji(STEROWNIK, { dodaj: kody[0] })).toBeNull();
    expect(ladunekSkladuFunkcji(STEROWNIK, { dodaj: '' })).toBeNull();
    expect(ladunekSkladuFunkcji(STEROWNIK, { zdejmij: '46' })).toBeNull();
    expect(ladunekSkladuFunkcji(STEROWNIK, { zdejmij: '' })).toBeNull();
  });

  it('zmiana tylko stanu funkcji niesie `wlaczone`, bez nastaw i bez grupy', () => {
    const formularz = formularzZeSterownika(STEROWNIK, 1);
    expect(ladunekZapisu(STEROWNIK, 1, { ...formularz, wlaczone: { ...formularz.wlaczone, '50': false } }, null)).toEqual({
      protection_ref: REF,
      wlaczone: { '50': false },
    });
  });
});

describe('edytor na danych sieci złotej', () => {
  it('funkcja = wiersz: kod, nazwa z rejestru, nastawy modelu, próg pierwotny z backendu, aparat wyzwalany', () => {
    renderuj();
    expect(screen.getByTestId('edytor-przekladnia')).toHaveTextContent('600/5 A 5P20');
    for (const stopien of NASTAWY.stopnie) {
      const wiersz = screen.getByTestId(`edytor-${stopien.funkcja}`);
      expect(wiersz).toHaveTextContent(funkcjaEaz(stopien.funkcja)!.nazwaPl);
      expect(within(wiersz).getByTestId(`edytor-${stopien.funkcja}-wlaczona`)).toBeChecked();
      expect(within(wiersz).getByTestId(`edytor-${stopien.funkcja}-krzywa`)).toHaveValue(stopien.krzywa);
      expect(within(wiersz).getByTestId(`edytor-${stopien.funkcja}-prog`)).toHaveValue(stopien.wartosc_progu);
      expect(within(wiersz).getByTestId(`edytor-${stopien.funkcja}-pierwotny`)).toHaveTextContent(
        stopien.prog_pierwotny_a.toLocaleString('pl-PL', { maximumFractionDigits: 3, useGrouping: false }),
      );
      // Aparat wyzwalany z macierzy wyzwoleń — nazwa gałęzi wyłącznika, nie referencja.
      const wylacznik = STEROWNIK.macierz_wyzwolen.find((w) => w.funkcja_ref === stopien.funkcja)!.aparat_refs[0];
      const galaz = MIGAWKA.branches.find((b) => b.ref_id === wylacznik);
      expect(screen.getByTestId(`edytor-${stopien.funkcja}-wylacza`)).toHaveTextContent(galaz?.name?.trim() || wylacznik);
    }
    // Rodzina czasu wg charakterystyki: 51 IEC SI → TMS, bez zwłoki; 50 DT → zwłoka, bez TMS.
    expect(screen.getByTestId('edytor-51-tms')).toBeInTheDocument();
    expect(screen.queryByTestId('edytor-51-zwloka_s')).not.toBeInTheDocument();
    expect(screen.getByTestId('edytor-50-zwloka_s')).toBeInTheDocument();
    expect(screen.queryByTestId('edytor-50-tms')).not.toBeInTheDocument();
    expect(screen.getByTestId('edytor-gotowe')).toHaveTextContent(T.gotowe);
    // Nic nie zmieniono — zapis zablokowany (nie wysyła kopii modelu).
    expect(screen.getByTestId('edytor-zapisz')).toBeDisabled();
  });

  it('zmiana TMS i zapis — update_protection_settings z nastawami TYLKO zmienionej funkcji', async () => {
    const user = userEvent.setup();
    renderuj();
    const tms = screen.getByTestId('edytor-51-tms');
    await user.clear(tms);
    await user.type(tms, '0.25');
    await user.click(screen.getByTestId('edytor-zapisz'));
    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    const [caseId, operacja, ladunek] = zapis.mock.calls[0];
    expect(caseId).toBe('case-1');
    expect(operacja).toBe('update_protection_settings');
    expect(ladunek).toEqual({
      protection_ref: REF,
      grupa: 1,
      nastawy: { '51': { jednostka_progu: 'A_WTORNY', krzywa: 'IEC_SI', prog: 2, tms: 0.25 } },
    });
    expect(screen.queryByTestId('edytor-blad')).not.toBeInTheDocument();
  });

  it('zmiana charakterystyki na DT zamienia TMS na zwłokę i zapisuje zwłokę', async () => {
    const user = userEvent.setup();
    renderuj();
    await user.selectOptions(screen.getByTestId('edytor-51-krzywa'), 'DT');
    expect(screen.queryByTestId('edytor-51-tms')).not.toBeInTheDocument();
    await user.type(screen.getByTestId('edytor-51-zwloka_s'), '0.7');
    await user.click(screen.getByTestId('edytor-zapisz'));
    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    expect(zapis.mock.calls[0][2].nastawy['51']).toEqual({
      jednostka_progu: 'A_WTORNY',
      krzywa: 'DT',
      prog: 2,
      zwloka_s: 0.7,
    });
  });

  it('wyłączenie funkcji natywnym klikiem — zapis niesie stan funkcji, wiersz oznaczony', async () => {
    const user = userEvent.setup();
    renderuj();
    await user.click(screen.getByTestId('edytor-50-wlaczona'));
    expect(screen.getByTestId('edytor-50')).toHaveAttribute('data-wlaczona', 'false');
    await user.click(screen.getByTestId('edytor-zapisz'));
    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    expect(zapis.mock.calls[0][2]).toEqual({ protection_ref: REF, wlaczone: { '50': false } });
  });

  it.each(NUMERY_GRUP_NASTAW.filter((n) => n !== 1))(
    'grupa %i (nieaktywna, pusta): pola puste, bez progu pierwotnego, zapis do tej grupy, przycisk „ustaw aktywną"',
    async (numer) => {
      const user = userEvent.setup();
      renderuj();
      expect(screen.getByTestId('edytor-grupa-1')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('edytor-grupa-1')).toHaveAttribute('data-aktywna', 'true');
      await user.click(screen.getByTestId(`edytor-grupa-${numer}`));
      expect(screen.getByTestId(`edytor-grupa-${numer}`)).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('edytor-51-prog')).toHaveValue(null);
      // Przeliczenie backendu dotyczy grupy aktywnej — przy innej grupie go nie ma.
      expect(screen.queryByTestId('edytor-51-pierwotny')).not.toBeInTheDocument();
      expect(screen.getByTestId('edytor-zapisz')).toHaveTextContent(T.zapisz(numer));
      await user.type(screen.getByTestId('edytor-51-prog'), '4');
      await user.click(screen.getByTestId('edytor-zapisz'));
      await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
      expect(zapis.mock.calls[0][2]).toEqual({ protection_ref: REF, grupa: numer, nastawy: { '51': { prog: 4 } } });
      await user.click(screen.getByTestId('edytor-ustaw-aktywna'));
      await waitFor(() => expect(zapis).toHaveBeenCalledTimes(2));
      expect(zapis.mock.calls[1][2]).toEqual({ protection_ref: REF, aktywna_grupa: numer });
    },
  );

  it.each([1, 2])('grupa aktywna %i: wartości grupy z modelu, przełączenie pokazuje drugą grupę', async (aktywna) => {
    const user = userEvent.setup();
    ustawModel(zDrugaGrupa(aktywna));
    renderuj();
    const inna = aktywna === 1 ? 2 : 1;
    expect(screen.getByTestId(`edytor-grupa-${aktywna}`)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId(`edytor-grupa-${aktywna}`)).toHaveAttribute('data-aktywna', 'true');
    expect(screen.getByTestId(`edytor-grupa-${inna}`)).toHaveAttribute('data-aktywna', 'false');
    expect(screen.queryByTestId('edytor-ustaw-aktywna')).not.toBeInTheDocument();
    expect(screen.getByTestId('edytor-51-prog')).toHaveValue(aktywna === 2 ? 3.5 : 2);
    await user.click(screen.getByTestId(`edytor-grupa-${inna}`));
    expect(screen.getByTestId('edytor-51-prog')).toHaveValue(inna === 2 ? 3.5 : 2);
    expect(screen.getByTestId('edytor-ustaw-aktywna')).toHaveTextContent(T.ustawAktywna(inna));
    // Ta sama treść grupy co w modelu — nic do zapisania.
    expect(screen.getByTestId('edytor-zapisz')).toBeDisabled();
  });

  it('funkcja dopisana tylko w rejestrze (46) dostaje edycję ze schematu rejestru bez zmiany edytora', async () => {
    const user = userEvent.setup();
    const schemat = funkcjaEaz('46')!.nastawy;
    ustawModel({ ...STEROWNIK, funkcje: [...STEROWNIK.funkcje, { ref: '46', kod: '46', wlaczona: true }] });
    renderuj();
    const wiersz = screen.getByTestId('edytor-46');
    expect(wiersz).toHaveTextContent(funkcjaEaz('46')!.nazwaPl);
    for (const s of schemat) expect(within(wiersz).getByTestId(`edytor-46-${s.klucz}`)).toBeInTheDocument();
    await user.type(screen.getByTestId('edytor-46-prog_i2_proc_in'), '15');
    await user.type(screen.getByTestId('edytor-46-zwloka_s'), '2');
    await user.click(screen.getByTestId('edytor-zapisz'));
    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    expect(zapis.mock.calls[0][2]).toEqual({
      protection_ref: REF,
      grupa: 1,
      nastawy: { '46': { prog_i2_proc_in: 15, zwloka_s: 2 } },
    });
  });

  it('szczegóły na żądanie: charakterystyki z wyrobu, zmiana profilu zapisuje `charakterystyki_ref`', async () => {
    const user = userEvent.setup();
    renderuj();
    expect(screen.queryByTestId('edytor-szczegoly')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('edytor-szczegoly-przelacz'));
    expect(screen.getByTestId('edytor-charakterystyki')).toHaveTextContent(
      `${NASTAWY.charakterystyki!.model} — ${T.zrodloCharakterystyk.WYROB}`,
    );
    const docelowy = WIDOK.profile_charakterystyk.find((p) => p.kod !== STEROWNIK.charakterystyki_ref)!;
    await user.selectOptions(screen.getByTestId('edytor-profil'), docelowy.kod);
    await user.click(screen.getByTestId('edytor-zapisz'));
    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    expect(zapis.mock.calls[0][2]).toEqual({ protection_ref: REF, charakterystyki_ref: docelowy.kod });
  });

  it('skład funkcji natywnymi klikami: dodanie funkcji z rejestru i zdjęcie funkcji sterownika', async () => {
    const user = userEvent.setup();
    renderuj();
    await user.click(screen.getByTestId('edytor-szczegoly-przelacz'));
    const dodaj = screen.getByTestId('edytor-sklad-dodaj');
    expect(dodaj).toBeDisabled();
    // Lista dodawania = rejestr bez funkcji, które sterownik już ma.
    const opcje = within(screen.getByTestId('edytor-sklad-dodaj-wybor'))
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
      .filter((v) => v !== '');
    expect(opcje).toContain('46');
    for (const f of STEROWNIK.funkcje) expect(opcje).not.toContain(f.kod);
    await user.selectOptions(screen.getByTestId('edytor-sklad-dodaj-wybor'), '46');
    await user.click(dodaj);
    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(1));
    expect(zapis.mock.calls[0][1]).toBe('update_protection_settings');
    expect(zapis.mock.calls[0][2]).toEqual({
      protection_ref: REF,
      funkcje: [...STEROWNIK.funkcje.map((f) => f.kod), '46'],
    });

    await user.selectOptions(screen.getByTestId('edytor-sklad-zdejmij-wybor'), '50');
    await user.click(screen.getByTestId('edytor-sklad-zdejmij'));
    await waitFor(() => expect(zapis).toHaveBeenCalledTimes(2));
    expect(zapis.mock.calls[1][2]).toEqual({
      protection_ref: REF,
      funkcje: STEROWNIK.funkcje.map((f) => f.kod).filter((k) => k !== '50'),
    });
  });

  it('odmowa backendu — komunikat w treści, nie cisza', async () => {
    const user = userEvent.setup();
    zapis.mockResolvedValue({ snapshot: null, error: 'Nastawa I> poza zakresem przekaźnika.' });
    renderuj();
    await user.click(screen.getByTestId('edytor-50-wlaczona'));
    await user.click(screen.getByTestId('edytor-zapisz'));
    expect(await screen.findByTestId('edytor-blad')).toHaveTextContent('Nastawa I> poza zakresem przekaźnika.');
  });

  it('brak aktywnego przypadku — zapis i zmiana grupy aktywnej zablokowane', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().reset();
    renderuj();
    await user.click(screen.getByTestId('edytor-50-wlaczona'));
    expect(screen.getByTestId('edytor-zapisz')).toBeDisabled();
    await user.click(screen.getByTestId('edytor-grupa-3'));
    expect(screen.getByTestId('edytor-ustaw-aktywna')).toBeDisabled();
    expect(zapis).not.toHaveBeenCalled();
  });

  it('sterownik pola szablonu bez nastaw: braki z backendu z akcją naprawczą zamiast „gotowe"', async () => {
    const user = userEvent.setup();
    const szablonu = WIDOK.assignments.find((a) => a.nastawy && a.nastawy.braki.length > 0)!;
    renderuj(szablonu.nastawy!, szablonu.device_id);
    expect(screen.getByTestId('edytor-braki-liczba')).toHaveTextContent(T.brakiLiczba(szablonu.nastawy!.braki.length));
    expect(screen.queryByTestId('edytor-gotowe')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('edytor-szczegoly-przelacz'));
    const lista = screen.getByTestId('edytor-braki');
    for (const b of szablonu.nastawy!.braki) {
      expect(lista).toHaveTextContent(b.komunikat_pl);
      expect(lista).toHaveTextContent(b.akcja_naprawcza_pl);
    }
    // Sterownik bez przekładnika: jawny brak przekładni, nie zmyślona wartość.
    expect(screen.getByTestId('edytor-przekladnia')).toHaveTextContent(T.brakPrzekladni);
  });

  it('sterownika nie ma w modelu — jawny komunikat', () => {
    renderuj(undefined, 'nie-istnieje');
    expect(screen.getByTestId('edytor-brak')).toHaveTextContent(T.brakSterownika);
  });
});

// ---------------------------------------------------------------------------
// Karta EWALUATORY-ZIEMNOZWARCIOWE: ocena funkcji ziemnozwarciowych sterownika z AKTYWNEGO biegu
// oceny zabezpieczeń (PRAWDZIWY wynik biegu sieci złotej, pole `ziemnozwarciowe`). ILOCZYN:
// {brak biegu, bieg świeży, bieg nieaktualny} × {sterownik z rekordami, sterownik bez rekordów}.
// ---------------------------------------------------------------------------

describe('karta nastaw — ocena zwarć doziemnych aktywnego biegu', () => {
  const WYNIK_OCENY = wynikOcenySceny as unknown as WynikOcenyZabezpieczen;
  const REF_ZIEMNY = WYNIK_OCENY.ziemnozwarciowe!.odmowy[0].urzadzenie_ref;
  const NASTAWY_ZIEMNEGO = WIDOK.assignments.find((a) => a.device_id === REF_ZIEMNY)?.nastawy ?? undefined;

  function bieg(wynik: unknown = WYNIK_OCENY) {
    ustawBiegOgladany('ocena-1', { dolozDoRejestru: 'PROTECTION' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/protection-runs/ocena-1/results') {
        return { ok: true, status: 200, json: async () => wynik } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    wyczyscKontekstWyniku();
    useExecutionRunsStore.setState({ runs: [] });
  });

  it('bieg świeży: rekordy WYŁĄCZNIE tego sterownika, ze zdaniem wyjaśnienia i brakami', async () => {
    const user = userEvent.setup();
    bieg();
    renderuj(NASTAWY_ZIEMNEGO, REF_ZIEMNY);
    await user.click(screen.getByTestId('edytor-szczegoly-przelacz'));
    const blok = await screen.findByTestId('edytor-ziemne');
    const rekordy = rekordyZiemnozwarciowe(WYNIK_OCENY.ziemnozwarciowe, REF_ZIEMNY);
    expect(rekordy.length).toBeGreaterThan(0);
    const wiersze = within(blok).getAllByTestId('edytor-ziemne-tabela-wiersz');
    expect(wiersze).toHaveLength(rekordy.length);
    expect(wiersze.every((w) => w.dataset.urzadzenie === REF_ZIEMNY)).toBe(true);
    wiersze.forEach((w, i) => expect(w).toHaveTextContent(rekordy[i].zdanie_pl));
    expect(within(blok).getAllByTestId('edytor-ziemne-tabela-braki').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('edytor-ziemne-nieaktualny')).not.toBeInTheDocument();
  });

  it('bieg nieaktualny: przyczyna z serwera nad tabelą', async () => {
    const user = userEvent.setup();
    bieg({
      ...WYNIK_OCENY,
      result_status: 'OUTDATED',
      result_status_reason_pl: 'Model zmienił się od biegu (zmiana nastaw zabezpieczenia).',
    });
    renderuj(NASTAWY_ZIEMNEGO, REF_ZIEMNY);
    await user.click(screen.getByTestId('edytor-szczegoly-przelacz'));
    expect(await screen.findByTestId('edytor-ziemne-nieaktualny')).toHaveTextContent(
      'zmiana nastaw zabezpieczenia',
    );
  });

  it('sterownik bez rekordów doziemnych i brak biegu — karta nie pokazuje oceny, której nie ma', async () => {
    const user = userEvent.setup();
    const fetchMock = bieg();
    renderuj();
    await user.click(screen.getByTestId('edytor-szczegoly-przelacz'));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/protection-runs/ocena-1/results')).toBe(true),
    );
    expect(rekordyZiemnozwarciowe(WYNIK_OCENY.ziemnozwarciowe, REF)).toHaveLength(0);
    expect(screen.queryByTestId('edytor-ziemne')).not.toBeInTheDocument();
    // Brak biegu rodziny „Zabezpieczenia" w rejestrze przypadku: brak oceny do pokazania.
    cleanup();
    wyczyscKontekstWyniku();
    useExecutionRunsStore.setState({ runs: [] });
    renderuj(NASTAWY_ZIEMNEGO, REF_ZIEMNY);
    await user.click(screen.getByTestId('edytor-szczegoly-przelacz'));
    expect(screen.queryByTestId('edytor-ziemne')).not.toBeInTheDocument();
  });
});
