/**
 * UI-02b JEDEN-INSPEKTOR — formularz szkicu PV/BESS/FW w prawym inspektorze (`FormularzSzkicuDer`).
 *
 * Intencje przeniesione z testów dawnego panelu szczegółów kanwy (skasowanego tą kartą), teraz
 * na formularzu inspektora i na REALNYM zapisie (`postDerGeneratorConfig` → `fetch` →
 * `useSnapshotStore.setSnapshot`), nie na wywołaniu zwrotnym:
 *  - typ przekształtnika WYŁĄCZNIE z katalogu backendu, per technologia, wybór jawny (pusta
 *    pozycja na starcie), brak pozycji nN = uczciwy stan zerowy bez listy zastępczej;
 *  - zapis bez wyboru przekształtnika: brak żądania POST i komunikat; po wyborze POST niesie
 *    stację, technologię, moc, wariant nN, wybrany ref katalogu i moduł NC RfG z backendu;
 *  - zmiana technologii czyści wybór (ref PV nie przechodzi do BESS);
 *  - moc spoza 0,1–10 MW blokuje zapis;
 *  - moduł NC RfG: „—" przed odpowiedzią backendu, przyczyna przy module `null`;
 *  - napięcie punktu z szyny nN modelu, a bez niej wartość katalogowa 0,4 kV jawnie oznaczona.
 *
 * Iloczyn cech: technologia {PV, BESS, FW} × katalog {pozycje nN, tylko pozycje SN} × wybór
 * przekształtnika {brak, jawny} × moc {w zakresie, poniżej, powyżej} × napięcie szyny nN
 * {z modelu, brak} × klasyfikacja {typ, poniżej progu z przyczyną}.
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../app-state';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useNotificationStore } from '../../../notifications/store';
import type { DaneElementuKanwy } from '../../../sld/shared/daneElementuKanwy';
import { useKontekstElementuKanwy, type RodzajSzkicuDer } from '../../../sld/shared/kontekstElementuKanwy';
import { odpowiedzKlasyfikacji } from '../../../../ui2/oze/ncrfg/__tests__/atrapaKlasyfikacji';
import { FormularzSzkicuDer } from '../FormularzSzkicuDer';

const KATALOG: Readonly<Record<'PV' | 'BESS' | 'WIND', readonly unknown[]>> = {
  PV: [
    { id: 'conv-pv-nn-0.5mw-0p4kv', name: 'Falownik PV 0,5 MW / 0,4 kV', kind: 'PV', un_kv: 0.4, sn_mva: 0.5, pmax_mw: 0.5 },
    { id: 'conv-pv-nn-1mw-0p4kv', name: 'Falownik PV 1 MW / 0,4 kV', kind: 'PV', un_kv: 0.4, sn_mva: 1, pmax_mw: 1 },
    { id: 'conv-pv-sn-2mw-15kv', name: 'Falownik PV 2 MW / 15 kV', kind: 'PV', un_kv: 15, sn_mva: 2, pmax_mw: 2 },
  ],
  BESS: [
    { id: 'conv-bess-nn-1mw-2mwh-0p4kv', name: 'Magazyn 1 MW / 2 MWh / 0,4 kV', kind: 'BESS', un_kv: 0.4, sn_mva: 1, pmax_mw: 1 },
  ],
  // Farma wiatrowa: katalog ma wyłącznie pozycje SN — wariant nN nie ma czego zaproponować.
  WIND: [
    { id: 'conv-fw-sn-3mw-20kv', name: 'Przekształtnik FW 3 MW / 20 kV', kind: 'WIND', un_kv: 20, sn_mva: 3, pmax_mw: 3 },
  ],
};

interface Zadanie {
  readonly url: string;
  readonly metoda: string;
  readonly cialo: unknown;
}

const zadania: Zadanie[] = [];
const ODPOWIEDZ_ZAPISU = { snapshot: { header: { name: 'po zapisie' } }, logical_views: null };

function atrapaFetch(opoznienieKlasyfikacji?: Promise<void>): void {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const metoda = init?.method ?? 'GET';
    zadania.push({ url, metoda, cialo: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.startsWith('/api/ncrfg-tests/modul')) {
      if (opoznienieKlasyfikacji) await opoznienieKlasyfikacji;
      return odpowiedzKlasyfikacji(url)!;
    }
    if (url.startsWith('/api/catalog/converter-types')) {
      const kind = /[?&]kind=([^&]+)/.exec(url)?.[1] as 'PV' | 'BESS' | 'WIND' | undefined;
      return new Response(JSON.stringify((kind && KATALOG[kind]) ?? []), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (metoda === 'POST' && /\/api\/projects\/[^/]+\/cases\/[^/]+\/generators$/.test(url)) {
      return new Response(JSON.stringify(ODPOWIEDZ_ZAPISU), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('nieobsłużone w atrapie', { status: 500 });
  }) as unknown as typeof fetch;
}

const pierwotnyFetch = global.fetch;
const setSnapshot = vi.fn();
const pierwotnySetSnapshot = useSnapshotStore.getState().setSnapshot;

function dane(busVoltageKv: number | null): DaneElementuKanwy {
  return { kind: 'der', elementId: 'station/1', label: 'Stacja 1', stationCode: 'S01', nnSpec: { busVoltageKv } };
}

function renderuj(derKind: RodzajSzkicuDer, napiecieNn: number | null = 0.4) {
  act(() => useKontekstElementuKanwy.getState().ustawSzkicDer({ stationRef: 'station/1', derKind }));
  return render(<FormularzSzkicuDer dane={dane(napiecieNn)} derKind={derKind} />);
}

async function listaPrzeksztaltnikow(): Promise<HTMLSelectElement> {
  return (await screen.findByTestId('inspektor-der-przeksztaltnik')) as HTMLSelectElement;
}

function postyZapisu(): Zadanie[] {
  return zadania.filter((z) => z.metoda === 'POST');
}

beforeEach(() => {
  zadania.length = 0;
  setSnapshot.mockReset();
  useSnapshotStore.setState({ setSnapshot });
  useNotificationStore.getState().clearAll();
  useAppStateStore.setState({ activeProjectId: 'proj-1', activeCaseId: 'case-1' });
});

afterEach(() => {
  cleanup();
  global.fetch = pierwotnyFetch;
  useSnapshotStore.setState({ setSnapshot: pierwotnySetSnapshot });
  useKontekstElementuKanwy.getState().wyczysc();
  useAppStateStore.setState({ activeProjectId: null, activeCaseId: null });
});

describe('formularz szkicu DER w inspektorze — katalog przekształtników', () => {
  it('PV: lista z katalogu backendu, tylko pasmo nN, wybór jawny (pusta pozycja na starcie)', async () => {
    atrapaFetch();
    renderuj('PV');
    const lista = await listaPrzeksztaltnikow();
    expect(lista.value).toBe('');
    expect(lista.options[0].value).toBe('');
    expect(lista.options[0].label).toBe('— wybierz z katalogu —');
    expect(Array.from(lista.options).slice(1).map((o) => o.value)).toEqual(['conv-pv-nn-0.5mw-0p4kv', 'conv-pv-nn-1mw-0p4kv']);
    expect(Array.from(lista.options).slice(1).map((o) => o.label)).toEqual([
      'Falownik PV 0,5 MW / 0,4 kV',
      'Falownik PV 1 MW / 0,4 kV',
    ]);
    expect(zadania.some((z) => z.url === '/api/catalog/converter-types?kind=PV')).toBe(true);
  });

  it('BESS: inne pozycje niż PV, z zapytania technologii BESS', async () => {
    atrapaFetch();
    renderuj('BESS');
    const lista = await listaPrzeksztaltnikow();
    expect(Array.from(lista.options).slice(1).map((o) => o.value)).toEqual(['conv-bess-nn-1mw-2mwh-0p4kv']);
    expect(screen.getByTestId('inspektor-der-formularz').innerHTML).not.toContain('conv-pv-');
  });

  it('FW: katalog bez pozycji nN → uczciwy stan zerowy, bez listy zastępczej', async () => {
    atrapaFetch();
    renderuj('FW');
    const brak = await screen.findByTestId('inspektor-der-przeksztaltnik-brak');
    expect(brak.textContent).toContain('Katalog nie zawiera przekształtników nN dla technologii FW');
    expect(screen.queryByTestId('inspektor-der-przeksztaltnik')).toBeNull();
    expect(zadania.some((z) => z.url === '/api/catalog/converter-types?kind=WIND')).toBe(true);
  });

  it('zmiana technologii po wyborze czyści wybór: ref PV nie przechodzi do BESS', async () => {
    atrapaFetch();
    const uzytkownik = userEvent.setup();
    renderuj('PV');
    await uzytkownik.selectOptions(await listaPrzeksztaltnikow(), 'conv-pv-nn-1mw-0p4kv');
    expect((screen.getByTestId('inspektor-der-przeksztaltnik') as HTMLSelectElement).value).toBe('conv-pv-nn-1mw-0p4kv');
    await uzytkownik.selectOptions(screen.getByTestId('inspektor-der-typ'), 'BESS');
    await waitFor(() => {
      const lista = screen.getByTestId('inspektor-der-przeksztaltnik') as HTMLSelectElement;
      expect(Array.from(lista.options).slice(1).map((o) => o.value)).toEqual(['conv-bess-nn-1mw-2mwh-0p4kv']);
    });
    expect((screen.getByTestId('inspektor-der-przeksztaltnik') as HTMLSelectElement).value).toBe('');
    await uzytkownik.click(screen.getByTestId('inspektor-der-zapisz'));
    expect(await screen.findByTestId('inspektor-der-blad')).toHaveTextContent('Wybierz typ przekształtnika z katalogu.');
    expect(postyZapisu()).toHaveLength(0);
  });
});

describe('formularz szkicu DER w inspektorze — zapis', () => {
  it('bez wyboru przekształtnika: brak POST i komunikat; po wyborze POST z wybranym refem i modułem z backendu', async () => {
    atrapaFetch();
    const uzytkownik = userEvent.setup();
    renderuj('PV');
    const moc = screen.getByTestId('inspektor-der-moc');
    await uzytkownik.clear(moc);
    await uzytkownik.type(moc, '1.2');
    await listaPrzeksztaltnikow();
    await uzytkownik.click(screen.getByTestId('inspektor-der-zapisz'));
    expect(await screen.findByTestId('inspektor-der-blad')).toHaveTextContent('Wybierz typ przekształtnika z katalogu.');
    expect(postyZapisu()).toHaveLength(0);
    expect(useKontekstElementuKanwy.getState().szkicDer).not.toBeNull();

    // Klasyfikacja (1,2 MW, 0,4 kV) z atrapy progów katalogu backendu: typ B.
    await waitFor(() => expect(screen.getByTestId('inspektor-der-ncrfg-modul')).toHaveTextContent('Typ B'));
    await uzytkownik.selectOptions(screen.getByTestId('inspektor-der-przeksztaltnik'), 'conv-pv-nn-1mw-0p4kv');
    await uzytkownik.click(screen.getByTestId('inspektor-der-zapisz'));

    await waitFor(() => expect(postyZapisu()).toHaveLength(1));
    const [post] = postyZapisu();
    expect(post.url).toBe('/api/projects/proj-1/cases/case-1/generators');
    expect(post.cialo).toEqual({
      station_ref: 'station/1',
      der_kind: 'PV',
      power_mw: 1.2,
      connection_variant: 'nn_side',
      catalog_ref: 'conv-pv-nn-1mw-0p4kv',
      source_name: 'PV Stacja 1',
      quantity: 1,
      nc_rfg_module: 'B',
    });
    await waitFor(() => expect(setSnapshot).toHaveBeenCalledWith(ODPOWIEDZ_ZAPISU));
    expect(useKontekstElementuKanwy.getState().szkicDer).toBeNull();
  });

  it.each([
    ['poniżej zakresu', '0.05', 'Moc czynna DER musi być nie mniejsza niż 0,1 MW.'],
    ['powyżej zakresu', '12', 'Moc czynna DER musi być nie większa niż 10 MW.'],
  ])('moc %s blokuje zapis', async (_nazwa, wartosc, komunikat) => {
    atrapaFetch();
    const uzytkownik = userEvent.setup();
    renderuj('PV');
    await uzytkownik.selectOptions(await listaPrzeksztaltnikow(), 'conv-pv-nn-0.5mw-0p4kv');
    const moc = screen.getByTestId('inspektor-der-moc');
    await uzytkownik.clear(moc);
    await uzytkownik.type(moc, wartosc);
    await uzytkownik.click(screen.getByTestId('inspektor-der-zapisz'));
    expect(await screen.findByTestId('inspektor-der-blad')).toHaveTextContent(komunikat);
    expect(moc).toHaveAttribute('aria-invalid', 'true');
    expect(postyZapisu()).toHaveLength(0);
  });

  it('bez aktywnego przypadku: brak POST i komunikat zamiast cichego pominięcia', async () => {
    atrapaFetch();
    useAppStateStore.setState({ activeCaseId: null });
    const uzytkownik = userEvent.setup();
    renderuj('PV');
    await uzytkownik.selectOptions(await listaPrzeksztaltnikow(), 'conv-pv-nn-0.5mw-0p4kv');
    await uzytkownik.click(screen.getByTestId('inspektor-der-zapisz'));
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications.map((n) => n.message)).toContain(
        'Nie można zapisać układu PV/BESS/FW: wybierz aktywny projekt i przypadek.',
      ),
    );
    expect(postyZapisu()).toHaveLength(0);
  });
});

describe('formularz szkicu DER w inspektorze — moduł NC RfG i napięcie punktu', () => {
  it('„—" przed odpowiedzią backendu, potem typ z klasyfikacji', async () => {
    let zwolnij: () => void = () => undefined;
    const blokada = new Promise<void>((resolve) => {
      zwolnij = resolve;
    });
    atrapaFetch(blokada);
    renderuj('PV');
    expect(screen.getByTestId('inspektor-der-ncrfg-modul')).toHaveTextContent('—');
    await act(async () => zwolnij());
    // 0,5 MW (domyślna moc PV) przy 0,4 kV: typ B progów katalogu backendu.
    await waitFor(() => expect(screen.getByTestId('inspektor-der-ncrfg-modul')).toHaveTextContent('Typ B'));
  });

  it('moc poniżej progu istotności: „Poniżej progu istotności" z przyczyną z odpowiedzi backendu', async () => {
    atrapaFetch();
    const uzytkownik = userEvent.setup();
    renderuj('BESS');
    const moc = screen.getByTestId('inspektor-der-moc');
    await uzytkownik.clear(moc);
    // 0,5 kW: poniżej progu typu A katalogu backendu; formularz i tak blokuje zapis (min 0,1 MW).
    await uzytkownik.type(moc, '0.0005');
    await waitFor(() => expect(screen.getByTestId('inspektor-der-ncrfg-modul')).toHaveTextContent('Poniżej progu istotności'));
    expect(screen.getByTestId('inspektor-der-ncrfg-powod').textContent).toBe('atrapa testu: 0.5 kW przy 0.4 kV → poniżej progu');
  });

  it.each([
    [0.42, '0,420 kV — szyna nN stacji z modelu'],
    [null, '0,400 kV — wartość katalogowa: stacja bez transformatora w modelu'],
  ])('napięcie szyny nN %s → punkt przyłączenia „%s"', async (napiecie, oczekiwane) => {
    atrapaFetch();
    renderuj('PV', napiecie);
    expect(within(screen.getByTestId('inspektor-der-punkt')).getByTestId('inspektor-der-napiecie-punktu')).toHaveTextContent(oczekiwane);
    await listaPrzeksztaltnikow();
  });

  it('Anuluj zamyka szkic bez żądania zapisu', async () => {
    atrapaFetch();
    const uzytkownik = userEvent.setup();
    renderuj('PV');
    await uzytkownik.click(screen.getByTestId('inspektor-der-anuluj'));
    expect(useKontekstElementuKanwy.getState().szkicDer).toBeNull();
    expect(postyZapisu()).toHaveLength(0);
  });
});
