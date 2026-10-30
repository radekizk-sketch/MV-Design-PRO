/**
 * Próba operacji przed zapisem (`useProbaOperacji` + `KontrolaPrzedZapisem`) — hak pyta TĘ SAMĄ
 * operację domenową, którą wykona zapis, z flagą `dry_run`, przez kanonicznego klienta
 * `executeDomainOpPreview` (stubowany jest tylko `fetch` — nie klient i nie hak).
 *
 * Iloczyn cech: odpowiedź {200 bez odmowy, 200 z odmową, 4xx bramy, 5xx, błąd sieci} × prezentacja
 * {wiersz gotowości, komunikat kontroli}; ładunek {brak, kompletny, ta sama treść w nowym obiekcie,
 * zmiana w trakcie próby}; przypadek {brak, jest}. Każdy brak werdyktu (5xx, sieć) jest
 * `nieustalona`, nigdy `przyjeta`.
 */

import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { domainOpsEndpoint } from '../../../../ui/topology/domainApi';
import { KontrolaPrzedZapisem, komunikatProby, wierszProby } from '../kontrolaPrzedZapisem';
import { useProbaOperacji, type StanProbyOperacji } from '../probaOperacji';

const fetchMock = vi.fn();

function odpowiedz(status: number, tresc: unknown): Response {
  return new Response(JSON.stringify(tresc), {
    status,
    statusText: status === 200 ? 'OK' : 'Blad',
    headers: { 'Content-Type': 'application/json' },
  });
}

function cialoWywolania(n: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[n][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

const LADUNEK = { bus_ref: 'bus-sn-1', p_mw: 0.5, manual_params: { rated_mva: 2, rated_kv: 20 } };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useProbaOperacji — werdykt z operacji, nie z UI', () => {
  it('ładunek próby = ładunek zapisu + dry_run, ta sama operacja, kanoniczny adres', async () => {
    fetchMock.mockResolvedValue(odpowiedz(200, { dry_run: true, preview: { created_refs: ['g1'] } }));
    const { result } = renderHook(() => useProbaOperacji('case-1', 'add_generator_sn', LADUNEK));
    expect(result.current).toEqual({ stan: 'sprawdzanie' });
    await waitFor(() => expect(result.current).toEqual({ stan: 'przyjeta' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(domainOpsEndpoint('case-1'));
    const cialo = cialoWywolania(0) as { operation: { name: string; payload: Record<string, unknown> } };
    expect(cialo.operation.name).toBe('add_generator_sn');
    expect(cialo.operation.payload).toEqual({ ...LADUNEK, dry_run: true });
  });

  it.each<[string, () => Response | Promise<Response>, StanProbyOperacji]>([
    [
      'odmowa w odpowiedzi 200',
      () =>
        odpowiedz(200, {
          error: 'Napięcie tabliczki 20 kV nie odpowiada szynie 15 kV.',
          error_code: 'generator.voltage_mismatch',
        }),
      {
        stan: 'odrzucona',
        komunikat: 'Napięcie tabliczki 20 kV nie odpowiada szynie 15 kV.',
        kod: 'generator.voltage_mismatch',
      },
    ],
    [
      'odrzucenie 422 bramy ładunku',
      () => odpowiedz(422, { detail: { message: 'Pole bus_ref jest wymagane.', code: 'payload.invalid' } }),
      { stan: 'odrzucona', komunikat: 'Pole bus_ref jest wymagane.', kod: 'payload.invalid' },
    ],
    [
      'błąd serwera 500',
      () => odpowiedz(500, null),
      { stan: 'nieustalona', komunikat: 'Operacja na modelu sieci nie powiodła się: wewnętrzny błąd serwera obliczeń (HTTP 500).' },
    ],
    [
      'błąd sieci',
      () => Promise.reject(new TypeError('Failed to fetch')),
      { stan: 'nieustalona', komunikat: 'Failed to fetch' },
    ],
  ])('%s → stan próby i komunikat backendu bez tłumaczenia', async (_nazwa, wynik, oczekiwany) => {
    fetchMock.mockImplementation(wynik);
    const { result } = renderHook(() => useProbaOperacji('case-1', 'add_generator_sn', LADUNEK));
    await waitFor(() => expect(result.current).toEqual(oczekiwany));

    // Prezentacja: wiersz gotowości nigdy „kompletne” bez przyjęcia, komunikat niesie treść backendu.
    const wiersz = wierszProby(result.current);
    expect(wiersz.stan).toBe('ostrzezenie');
    const komunikat = komunikatProby(result.current) ?? '';
    if (oczekiwany.stan === 'odrzucona' || oczekiwany.stan === 'nieustalona') {
      expect(komunikat).toContain(oczekiwany.komunikat);
    }
    render(<KontrolaPrzedZapisem proba={result.current} testid="proba" />);
    expect(screen.getByTestId('proba')).toHaveAttribute('data-stan', oczekiwany.stan);
    expect(screen.getByTestId('proba')).toHaveAttribute('role', 'alert');
  });

  it('brak ładunku albo brak przypadku → brak werdyktu i zero zapytań', async () => {
    const bezLadunku = renderHook(() => useProbaOperacji('case-1', 'add_generator_sn', null));
    const bezPrzypadku = renderHook(() => useProbaOperacji(null, 'add_generator_sn', LADUNEK));
    expect(bezLadunku.result.current).toBeNull();
    expect(bezPrzypadku.result.current).toBeNull();
    expect(wierszProby(null)).toEqual({ etykieta: 'Kontrola modelu', stan: 'brak', wartosc: 'Nie sprawdzono' });
    render(<KontrolaPrzedZapisem proba={null} testid="proba" />);
    expect(screen.queryByTestId('proba')).toBeNull();
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nowy obiekt o tej samej treści nie wysyła nowej próby', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(odpowiedz(200, { dry_run: true })));
    const { result, rerender } = renderHook(
      ({ ladunek }) => useProbaOperacji('case-1', 'add_generator_sn', ladunek),
      { initialProps: { ladunek: { ...LADUNEK } as Record<string, unknown> } },
    );
    await waitFor(() => expect(result.current).toEqual({ stan: 'przyjeta' }));
    rerender({ ladunek: JSON.parse(JSON.stringify(LADUNEK)) as Record<string, unknown> });
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ stan: 'przyjeta' });
  });

  it('zmiana ładunku w trakcie próby: werdykt pochodzi z OSTATNIEGO ładunku', async () => {
    let zwolnijPierwsza: (r: Response) => void = () => undefined;
    fetchMock
      .mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            zwolnijPierwsza = resolve;
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(odpowiedz(200, { error: 'Odmowa drugiego ładunku.', error_code: 'x.y' })),
      );
    const { result, rerender } = renderHook(
      ({ ladunek }) => useProbaOperacji('case-1', 'add_generator_sn', ladunek),
      { initialProps: { ladunek: LADUNEK as Record<string, unknown> } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ ladunek: { ...LADUNEK, p_mw: 9 } });
    expect(result.current).toEqual({ stan: 'sprawdzanie' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    zwolnijPierwsza(odpowiedz(200, { dry_run: true }));
    await waitFor(() =>
      expect(result.current).toEqual({ stan: 'odrzucona', komunikat: 'Odmowa drugiego ładunku.', kod: 'x.y' }),
    );
    expect((cialoWywolania(1) as { operation: { payload: { p_mw: number } } }).operation.payload.p_mw).toBe(9);
  });

  it('próba przyjęta: wiersz „kompletne” i komunikat statusu (nie alert)', async () => {
    fetchMock.mockResolvedValue(odpowiedz(200, { dry_run: true }));
    const { result } = renderHook(() => useProbaOperacji('case-1', 'add_generator_sn', LADUNEK));
    await waitFor(() => expect(result.current).toEqual({ stan: 'przyjeta' }));
    expect(wierszProby(result.current)).toEqual({ etykieta: 'Kontrola modelu', stan: 'kompletne', wartosc: 'Przyjęta' });
    render(<KontrolaPrzedZapisem proba={result.current} testid="proba" />);
    expect(screen.getByTestId('proba')).toHaveAttribute('role', 'status');
  });
});
