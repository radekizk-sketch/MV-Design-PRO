/**
 * Sekcja „Zabezpieczenia w tym przypadku" karty przypadku + znaczniki w karcie pola (ADR-022,
 * karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN).
 *
 * Wejście: PRAWDZIWY model sieci złotej G08 (migawka generatora fikstur harnessu) z jawnie dopisaną
 * drugą grupą nastaw jednego sterownika. Kliki i wpisy natywne (userEvent) na realnych kontrolkach;
 * granica mockowana to `fetch` końcówek delty przypadku (`GET/PUT …/zabezpieczenia-przypadku`,
 * `GET …/zabezpieczenia-przypadkow`) — ładunek PUT sprawdzany 1:1 z kontraktem backendu.
 *
 * Iloczyn cech: {grupa z modelu, grupa 2 wybrana w przypadku} × {bez nadpisań, nadpisanie dodane,
 * nadpisanie zapisane wcześniej, nadpisanie usunięte} × {wartość bazowa w grupie 1, w grupie 2} ×
 * {zapis przyjęty, odmowa 422 z polem, pole puste (odmowa lokalna, bez zapytania)} × {przypadek A,
 * przypadek B} × {model bez sterowników} × {karta pola: znacznik grupy, znacznik nadpisania,
 * brak znaczników}.
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import migawkaSceny from '../../../../../harness-fixtures/generated/koordynacja_scena_migawka.json';
import type { EnergyNetworkModel, ProtectionAssignment } from '../../../../../types/enm';
import { useAppStateStore } from '../../../../../ui/app-state';
import { useStudyCasesStore } from '../../../../../ui/study-cases/store';
import { useSnapshotStore } from '../../../../../ui/topology/snapshotStore';
import { EdytorNastawZabezpieczenia } from '../../../../kreatory/przekaznik/EdytorNastawZabezpieczenia';
import { SekcjaZabezpieczenPrzypadku } from '../SekcjaZabezpieczenPrzypadku';
import { ZABEZPIECZENIA_PRZYPADKU_STRINGS as T } from '../stringsZabezpieczenPrzypadku';
import type { WyborZabezpieczenPrzypadku } from '../wyborZabezpieczen';

const MIGAWKA = migawkaSceny as unknown as EnergyNetworkModel;
const BAZOWY = MIGAWKA.protection_assignments!.find((p) => p.grupy_nastaw.length > 0)!;
const REF = BAZOWY.ref_id;
const ID = `mvd-zabezpieczenia-przypadku-${REF}`;

/** Grupa 2 = kopia grupy 1 ze zwłoką I> (50) 0,9 s zamiast 0,4 s. */
function zDrugaGrupa(): ProtectionAssignment {
  const [g1] = BAZOWY.grupy_nastaw;
  const g2 = {
    numer: 2,
    funkcje: (g1.funkcje ?? []).map((f) =>
      f.funkcja_ref === '50'
        ? { ...f, nastawy: (f.nastawy ?? []).map((n) => (n.klucz === 'zwloka_s' ? { ...n, wartosc: 0.9 } : n)) }
        : f,
    ),
  };
  return { ...BAZOWY, grupy_nastaw: [g1, g2], aktywna_grupa: 1 };
}

const STEROWNIK = zDrugaGrupa();

function ustawModel(sterowniki: ProtectionAssignment[] | undefined) {
  const model: EnergyNetworkModel = {
    ...MIGAWKA,
    protection_assignments: sterowniki,
  };
  useSnapshotStore.setState({ snapshot: model, error: null } as never);
}

function wybor(caseId: string, czesc: Partial<WyborZabezpieczenPrzypadku> = {}): WyborZabezpieczenPrzypadku {
  return {
    case_id: caseId,
    scenario_id: null,
    revision: null,
    hash: null,
    protection_groups: {},
    protection_overrides: {},
    ...czesc,
  };
}

function odpowiedz(status: number, tresc: unknown): Response {
  return new Response(JSON.stringify(tresc), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Magazyn wyborów po stronie „backendu" (per przypadek) + rejestr zapytań. */
let magazyn: Record<string, WyborZabezpieczenPrzypadku>;
let odmowa: { pole: string; komunikat: string } | null;
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const m = /study-cases\/([^/]+)\/(zabezpieczenia-przypadku|zabezpieczenia-przypadkow)$/.exec(url);
  if (!m) return odpowiedz(404, { detail: 'nieznana końcówka' });
  const caseId = decodeURIComponent(m[1]);
  if (m[2] === 'zabezpieczenia-przypadkow') {
    const przypadki = Object.values(magazyn).filter(
      (w) => Object.keys(w.protection_groups).length > 0 || Object.keys(w.protection_overrides).length > 0,
    );
    return odpowiedz(200, { przypadki, count: przypadki.length });
  }
  if (init?.method === 'PUT') {
    if (odmowa) return odpowiedz(422, { detail: [{ pole: odmowa.pole, komunikat: odmowa.komunikat }] });
    const ladunek = JSON.parse(String(init.body)) as Pick<WyborZabezpieczenPrzypadku, 'protection_groups' | 'protection_overrides'>;
    const rewizja = (magazyn[caseId]?.revision ?? 0) + 1;
    magazyn[caseId] = wybor(caseId, { ...ladunek, scenario_id: `przypadek-${caseId}`, revision: rewizja, hash: `h${rewizja}` });
    return odpowiedz(200, magazyn[caseId]);
  }
  return odpowiedz(200, magazyn[caseId] ?? wybor(caseId));
});

function zapytaniaPut() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
}

beforeEach(() => {
  magazyn = {};
  odmowa = null;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  ustawModel(MIGAWKA.protection_assignments!.map((p) => (p.ref_id === REF ? STEROWNIK : p)));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useAppStateStore.getState().reset();
  useStudyCasesStore.setState({ cases: [] } as never);
});

async function renderSekcji(caseId: string, onZapisano = vi.fn()) {
  render(<SekcjaZabezpieczenPrzypadku caseId={caseId} onZapisano={onZapisano} />);
  await screen.findByTestId(ID);
  return onZapisano;
}

describe('Sekcja „Zabezpieczenia w tym przypadku" — wybór grupy', () => {
  it('lista grup = wyłącznie grupy zdefiniowane w modelu, pierwsza pozycja to grupa z modelu', async () => {
    await renderSekcji('B');
    const select = screen.getByTestId(`${ID}-grupa`) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([T.grupaZModelu(1), T.grupa(1), T.grupa(2)]);
    expect(select.value).toBe('');
  });

  it('grupa 2 w przypadku B → PUT tylko z wyborem grupy; model bez zmian; status przypadku odświeżony', async () => {
    const user = userEvent.setup();
    const onZapisano = await renderSekcji('B');
    const modelPrzed = JSON.stringify(useSnapshotStore.getState().snapshot);
    await user.selectOptions(screen.getByTestId(`${ID}-grupa`), '2');
    expect(screen.getByTestId(`${ID}-stan`)).toHaveTextContent(T.stanSterownika(2, true, 0));
    await user.click(screen.getByTestId('mvd-zabezpieczenia-przypadku-zapisz'));
    await screen.findByTestId('mvd-zabezpieczenia-przypadku-zapisano');
    const [[url, init]] = zapytaniaPut();
    expect(url).toBe('/api/scenariusze-laczeniowe/study-cases/B/zabezpieczenia-przypadku');
    expect(JSON.parse(String(init!.body))).toEqual({ protection_groups: { [REF]: 2 }, protection_overrides: {} });
    expect(onZapisano).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(useSnapshotStore.getState().snapshot)).toBe(modelPrzed);
    expect(magazyn.A).toBeUndefined();
    // Po zapisie formularz = stan zapisany → zapis nieaktywny do następnej zmiany.
    expect(screen.getByTestId('mvd-zabezpieczenia-przypadku-zapisz')).toBeDisabled();
  });
});

describe('Sekcja — nadpisania nastaw (iloczyn: grupa × nadpisanie)', () => {
  it.each([
    { grupa: null, bazowa: '0,4 s' },
    { grupa: 2, bazowa: '0,9 s' },
  ])('wartość bazowa z MODELU w grupie efektywnej ($grupa) → nadpisanie zwłoki I> i zapis', async ({ grupa, bazowa }) => {
    const user = userEvent.setup();
    await renderSekcji('B');
    if (grupa !== null) await user.selectOptions(screen.getByTestId(`${ID}-grupa`), String(grupa));
    await user.selectOptions(screen.getByTestId(`${ID}-dodaj-funkcja`), '50');
    await user.selectOptions(screen.getByTestId(`${ID}-dodaj-nastawa`), 'zwloka_s');
    await user.click(screen.getByTestId(`${ID}-dodaj`));
    const wiersz = screen.getByTestId(`${ID}-50-zwloka_s`);
    expect(within(wiersz).getByTestId(`${ID}-50-zwloka_s-bazowa`)).toHaveTextContent(bazowa);
    // Wartość startowa = wartość bazowa; zmiana natywnym wpisem w tym samym polu co edytor nastaw.
    const pole = within(wiersz).getByTestId(`${ID}-50-zwloka_s-wartosc`);
    expect(pole).toHaveValue(grupa === 2 ? 0.9 : 0.4);
    await user.clear(pole);
    await user.type(pole, '1.25');
    await user.click(screen.getByTestId('mvd-zabezpieczenia-przypadku-zapisz'));
    await screen.findByTestId('mvd-zabezpieczenia-przypadku-zapisano');
    expect(JSON.parse(String(zapytaniaPut()[0][1]!.body))).toEqual({
      protection_groups: grupa === null ? {} : { [REF]: grupa },
      protection_overrides: { [REF]: { '50': { zwloka_s: 1.25 } } },
    });
  });

  it('wybór zapisany wcześniej wraca do formularza; usunięcie nadpisania → PUT bez niego', async () => {
    magazyn.B = wybor('B', {
      scenario_id: 'przypadek-B',
      revision: 1,
      protection_groups: { [REF]: 2 },
      protection_overrides: { [REF]: { '51': { tms: 0.3 } } },
    });
    const user = userEvent.setup();
    await renderSekcji('B');
    expect(screen.getByTestId(`${ID}-grupa`)).toHaveValue('2');
    expect(screen.getByTestId(`${ID}-51-tms-wartosc`)).toHaveValue(0.3);
    expect(screen.getByTestId(`${ID}`)).toHaveProperty('open', true);
    await user.click(screen.getByTestId(`${ID}-51-tms-usun`));
    expect(screen.getByTestId(`${ID}-bez-nadpisan`)).toBeInTheDocument();
    await user.click(screen.getByTestId('mvd-zabezpieczenia-przypadku-zapisz'));
    await screen.findByTestId('mvd-zabezpieczenia-przypadku-zapisano');
    expect(JSON.parse(String(zapytaniaPut()[0][1]!.body))).toEqual({
      protection_groups: { [REF]: 2 },
      protection_overrides: {},
    });
  });

  it('pole puste → odmowa lokalna z nazwą nastawy, bez zapytania i bez odświeżenia przypadku', async () => {
    const user = userEvent.setup();
    const onZapisano = await renderSekcji('B');
    await user.selectOptions(screen.getByTestId(`${ID}-dodaj-funkcja`), '50');
    await user.selectOptions(screen.getByTestId(`${ID}-dodaj-nastawa`), 'zwloka_s');
    await user.click(screen.getByTestId(`${ID}-dodaj`));
    await user.clear(screen.getByTestId(`${ID}-50-zwloka_s-wartosc`));
    await user.click(screen.getByTestId('mvd-zabezpieczenia-przypadku-zapisz'));
    expect(screen.getByTestId('mvd-zabezpieczenia-przypadku-blad')).toHaveTextContent('zwłoka');
    expect(screen.getByTestId(`${ID}-50-zwloka_s`)).toHaveAttribute('data-bledny', 'true');
    expect(zapytaniaPut()).toHaveLength(0);
    expect(onZapisano).not.toHaveBeenCalled();
  });

  it('odmowa backendu 422 (ta sama reguła co zapis nastaw modelu) → zdanie backendu, przypadek bez odświeżenia', async () => {
    odmowa = { pole: `protection_overrides.${REF}.50.zwloka_s`, komunikat: 'Zwłoka musi być dodatnia.' };
    const user = userEvent.setup();
    const onZapisano = await renderSekcji('B');
    await user.selectOptions(screen.getByTestId(`${ID}-dodaj-funkcja`), '50');
    await user.selectOptions(screen.getByTestId(`${ID}-dodaj-nastawa`), 'zwloka_s');
    await user.click(screen.getByTestId(`${ID}-dodaj`));
    await user.click(screen.getByTestId('mvd-zabezpieczenia-przypadku-zapisz'));
    expect(await screen.findByTestId('mvd-zabezpieczenia-przypadku-blad')).toHaveTextContent('Zwłoka musi być dodatnia.');
    expect(onZapisano).not.toHaveBeenCalled();
    expect(magazyn.B).toBeUndefined();
  });

  it('dodana nastawa znika z listy do dodania (bez duplikatów); „Przywróć zapisane" cofa formularz', async () => {
    const user = userEvent.setup();
    await renderSekcji('B');
    await user.selectOptions(screen.getByTestId(`${ID}-dodaj-funkcja`), '50');
    await user.selectOptions(screen.getByTestId(`${ID}-dodaj-nastawa`), 'zwloka_s');
    await user.click(screen.getByTestId(`${ID}-dodaj`));
    const nastawy = screen.getByTestId(`${ID}-dodaj-nastawa`) as HTMLSelectElement;
    expect([...nastawy.options].map((o) => o.value)).not.toContain('zwloka_s');
    await user.click(screen.getByTestId('mvd-zabezpieczenia-przypadku-przywroc'));
    expect(screen.getByTestId(`${ID}-bez-nadpisan`)).toBeInTheDocument();
    expect(screen.getByTestId('mvd-zabezpieczenia-przypadku-zapisz')).toBeDisabled();
  });
});

describe('Sekcja — przypadek A × przypadek B i stan zerowy', () => {
  it('zapis w B nie dotyka A: A czyta własny (pusty) wybór', async () => {
    magazyn.B = wybor('B', { revision: 1, protection_groups: { [REF]: 2 } });
    await renderSekcji('A');
    expect(screen.getByTestId(`${ID}-grupa`)).toHaveValue('');
    expect(screen.getByTestId(`${ID}-stan`)).toHaveTextContent(T.stanSterownika(1, false, 0));
    cleanup();
    await renderSekcji('B');
    expect(screen.getByTestId(`${ID}-grupa`)).toHaveValue('2');
  });

  it('model bez sterowników → uczciwy stan zerowy, bez zapytania', async () => {
    ustawModel(undefined);
    render(<SekcjaZabezpieczenPrzypadku caseId="A" />);
    expect(screen.getByTestId('mvd-zabezpieczenia-przypadku-brak-sterownikow')).toHaveTextContent(T.brakSterownikow);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Karta pola — znaczniki „w przypadku X nadpisane: …"', () => {
  beforeEach(() => {
    useAppStateStore.getState().setActiveCase('A', 'Przypadek A');
    useStudyCasesStore.setState({
      cases: [
        { id: 'A', name: 'Przypadek A' },
        { id: 'B', name: 'Przypadek B' },
      ],
    } as never);
    // Zmiana aktywnego przypadku zeruje migawkę — model wgrywany po niej.
    ustawModel(MIGAWKA.protection_assignments!.map((p) => (p.ref_id === REF ? STEROWNIK : p)));
  });

  it('przypadek B z grupą 2 i nadpisaną zwłoką → znacznik przy funkcji i pod tabelą', async () => {
    magazyn.B = wybor('B', {
      revision: 1,
      protection_groups: { [REF]: 2 },
      protection_overrides: { [REF]: { '50': { zwloka_s: 1.25 } } },
    });
    render(<EdytorNastawZabezpieczenia urzadzenieRef={REF} />);
    const lista = await screen.findByTestId('mvd-edytor-nastaw-przypadki');
    const wpis = within(lista).getByTestId('mvd-edytor-nastaw-przypadki-B');
    expect(wpis).toHaveTextContent('W przypadku „Przypadek B":');
    expect(wpis).toHaveTextContent('grupa 2');
    expect(wpis).toHaveTextContent('nadpisane:');
    expect(wpis).toHaveTextContent('zwłoka');
    expect(wpis).toHaveTextContent('1,25 s');
    expect(screen.getByTestId('mvd-edytor-nastaw-50-w-przypadkach')).toHaveTextContent('nadpisane w: „Przypadek B"');
    expect(screen.queryByTestId('mvd-edytor-nastaw-51-w-przypadkach')).toBeNull();
    expect(within(lista).queryByTestId('mvd-edytor-nastaw-przypadki-A')).toBeNull();
  });

  it('żaden przypadek nie zmienia sterownika → brak znaczników', async () => {
    render(<EdytorNastawZabezpieczenia urzadzenieRef={REF} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId('mvd-edytor-nastaw-przypadki')).toBeNull();
  });
});
