// @vitest-environment node
/**
 * Klient zapisu źródła OZE — JEDNA droga zapisu (karta JEDNA-SCIEZKA-EDYCJI): operacje
 * `add_converter_source` / `set_der_catalog_bindings` przez `POST …/enm/domain-ops`.
 *
 * Iloczyn cech: funkcja {zapis źródła, wiązania, próba} × odpowiedź backendu {przyjęta,
 * odmowa operacji (HTTP 200 z `error`), odmowa bramy katalogowej (HTTP 422), inny błąd HTTP}.
 * Odmowa operacji NIE jest sukcesem — dawna końcówka zwracała 422, operacja zwraca 200 z
 * kodem, więc klient, który sprawdza tylko `response.ok`, pokazałby odmowę jako zapis.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { domainOpsEndpoint } from '../../../../topology/domainApi';
import {
  DerPersistenceApiError,
  probaZapisuDer,
  zapiszWiazaniaDer,
  zapiszZrodloOze,
} from '../derPersistenceApi';

const CASE_ID = 'a889f26d-7f3b-425e-a5ec-94b2d45569c8';

const zadanie = {
  station_ref: 'stacja-testowa',
  source_technology: 'PV' as const,
  power_setpoint_mw: 0.5,
  connection_variant: 'nn_side' as const,
  catalog_ref: 'conv-pv-nn-0p5mw-0p4kv',
};

function odpowiedz(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Unprocessable Entity',
    headers: { 'Content-Type': 'application/json' },
  });
}

const PRZYJETA = { snapshot: { generators: [{ ref_id: 'gen-1' }] }, changes: {} };
const ODMOWA_OPERACJI = {
  error: 'Stacja „S1" nie ma szyny nN (/api/cases/x) stn/abc — wskaż szynę.',
  error_code: 'station.nn_bus_missing',
};
const ODMOWA_BRAMY = {
  detail: { code: 'catalog.item_not_found', message_pl: 'Pozycja katalogu nie istnieje.' },
};

function przechwycFetch(...odpowiedzi: Response[]) {
  const fetchMock = vi.fn(async () => odpowiedzi.shift() as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function cialo(fetchMock: ReturnType<typeof przechwycFetch>, indeks = 0) {
  const [adres, init] = fetchMock.mock.calls[indeks] as unknown as [string, RequestInit];
  return { adres, koperta: JSON.parse(String(init.body)) };
}

async function bladZ(obietnica: Promise<unknown>): Promise<DerPersistenceApiError> {
  try {
    await obietnica;
  } catch (error) {
    expect(error).toBeInstanceOf(DerPersistenceApiError);
    return error as DerPersistenceApiError;
  }
  throw new Error('Oczekiwano odmowy, a zapis przeszedł.');
}

describe('derPersistenceApi — jedna droga zapisu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('zapis źródła idzie operacją add_converter_source pod adres domain-ops', async () => {
    const fetchMock = przechwycFetch(odpowiedz(200, PRZYJETA));
    const wynik = await zapiszZrodloOze(CASE_ID, zadanie);
    const { adres, koperta } = cialo(fetchMock);
    expect(adres).toBe(domainOpsEndpoint(CASE_ID));
    expect(koperta.operation.name).toBe('add_converter_source');
    expect(koperta.operation.payload).toEqual(zadanie);
    expect(wynik.snapshot).toEqual(PRZYJETA.snapshot);
  });

  it('wiązania idą operacją set_der_catalog_bindings z generator_ref, null zostaje null', async () => {
    const fetchMock = przechwycFetch(odpowiedz(200, PRZYJETA));
    await zapiszWiazaniaDer(CASE_ID, 'gen-1', { ct_catalog_ref: null });
    const { adres, koperta } = cialo(fetchMock);
    expect(adres).toBe(domainOpsEndpoint(CASE_ID));
    expect(koperta.operation.name).toBe('set_der_catalog_bindings');
    expect(koperta.operation.payload).toEqual({ generator_ref: 'gen-1', ct_catalog_ref: null });
  });

  it.each([
    ['zapis źródła', () => zapiszZrodloOze(CASE_ID, zadanie)],
    ['wiązania', () => zapiszWiazaniaDer(CASE_ID, 'gen-1', { ct_catalog_ref: 'ct-1' })],
  ])('%s: odmowa operacji (HTTP 200 z error) jest błędem z kodem, bez adresu i identyfikatorów', async (_n, wywolaj) => {
    przechwycFetch(odpowiedz(200, ODMOWA_OPERACJI));
    const blad = await bladZ(wywolaj());
    expect(blad.code).toBe('station.nn_bus_missing');
    expect(blad.status).toBe(200);
    expect(blad.message).not.toContain('/api/');
    expect(blad.message).not.toContain('stn/abc');
    expect(blad.message).toContain('nie ma szyny nN');
  });

  it.each([
    ['zapis źródła', () => zapiszZrodloOze(CASE_ID, zadanie)],
    ['wiązania', () => zapiszWiazaniaDer(CASE_ID, 'gen-1', { ct_catalog_ref: 'ct-1' })],
  ])('%s: odmowa bramy (HTTP 422) jest błędem z kodem i zdaniem backendu', async (_n, wywolaj) => {
    przechwycFetch(odpowiedz(422, ODMOWA_BRAMY));
    const blad = await bladZ(wywolaj());
    expect(blad.status).toBe(422);
    expect(blad.code).toBe('catalog.item_not_found');
    expect(blad.message).toBe('Pozycja katalogu nie istnieje.');
  });

  it('próba: ten sam ładunek z dry_run; przyjęcie, odmowa operacji i odmowa bramy to werdykty', async () => {
    const fetchMock = przechwycFetch(
      odpowiedz(200, { dry_run: true, preview: { created_refs: ['gen-1'] } }),
      odpowiedz(200, ODMOWA_OPERACJI),
      odpowiedz(422, ODMOWA_BRAMY),
    );
    expect(await probaZapisuDer(CASE_ID, zadanie)).toEqual({ stan: 'przyjeta' });
    const odmowa = await probaZapisuDer(CASE_ID, zadanie);
    expect(odmowa).toMatchObject({ stan: 'odmowa', kod: 'station.nn_bus_missing' });
    expect(await probaZapisuDer(CASE_ID, zadanie)).toEqual({
      stan: 'odmowa',
      kod: 'catalog.item_not_found',
      komunikat: 'Pozycja katalogu nie istnieje.',
    });
    const { koperta } = cialo(fetchMock);
    expect(koperta.operation.name).toBe('add_converter_source');
    expect(koperta.operation.payload).toEqual({ ...zadanie, dry_run: true });
  });

  it('próba: inny błąd HTTP nie udaje werdyktu — wyjątek', async () => {
    przechwycFetch(odpowiedz(500, { detail: 'awaria' }));
    const blad = await bladZ(probaZapisuDer(CASE_ID, zadanie));
    expect(blad.status).toBe(500);
  });
});
