/*
 * Test klienta biegu NC RfG (ui/ncrfg-tests/api) — dług 6 z rejestru
 * V12K-321: bieg bez `case_id` zwraca dowód certyfikatu z pustymi polami,
 * więc klient MUSI przekazywać aktywny przypadek w zapytaniu. Test przypina
 * budowę adresu (z case_id / bez), żeby regresja tej naprawy była wykrywalna.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runNcRfgPtpireeTests, type NcRfgRunRequest } from '../api';

const ZADANIE: NcRfgRunRequest = { modules: [] };

function mockFetchOk(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runNcRfgPtpireeTests — adres biegu', () => {
  it('z aktywnym przypadkiem dokleja ?case_id= (dowód certyfikatu z modelu)', async () => {
    const fetchMock = mockFetchOk();
    await runNcRfgPtpireeTests(ZADANIE, 'case-77');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ncrfg-tests/run?case_id=case-77',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('koduje case_id w adresie (znaki spoza URL nie rozrywają zapytania)', async () => {
    const fetchMock = mockFetchOk();
    await runNcRfgPtpireeTests(ZADANIE, 'przypadek 7&x');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ncrfg-tests/run?case_id=przypadek%207%26x',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('bez przypadku woła czysty adres (kontrakt sprzed naprawy bez zmian)', async () => {
    const fetchMock = mockFetchOk();
    await runNcRfgPtpireeTests(ZADANIE);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ncrfg-tests/run',
      expect.objectContaining({ method: 'POST' }),
    );
    await runNcRfgPtpireeTests(ZADANIE, null);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/ncrfg-tests/run',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
