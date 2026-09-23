/**
 * Rejestr certyfikowanych urządzeń PTPiREE — WYŁĄCZNIE z backendu (karta AB-1a Pakiet D1).
 *
 * Front nie ma już własnej kopii wykazu (artefakt generowany z PDF-ów, ręczna lista, stałe
 * źródeł — skasowane). Testy pilnują:
 *  - kontraktu URL-i i kształtu odpowiedzi (`fetchPtpireeManifest`,
 *    `fetchPtpireeCertifiedInverters` — pełny wykaz, bez parametru wyszukiwania: filtr jest
 *    lokalny, a `?search=` końcówki służy klientom API) — odpowiedź spoza kontraktu jest
 *    BŁĘDEM, a nie pustym wykazem;
 *  - JAWNEGO stanu hooków (`ladowanie` → `gotowy` / `blad`) na zamockowanej granicy `fetch`
 *    (wzorzec `audit2-hooks.test.tsx`) — brak odpowiedzi backendu nigdy nie daje stanu
 *    `gotowy` z pustą listą;
 *  - funkcji czystych na rejestrze podanym przez wołającego.
 *
 * Fikstury = realne rekordy `PtpireeGeneratorCertificate.to_dict()` i manifest
 * `get_ptpiree_catalog_manifest()` z backendu (odczyt 2026-09-23, wykaz 6887 pozycji).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PTPIREE_CERTYFIKATY_URL,
  PTPIREE_MANIFEST_URL,
  fetchPtpireeCertifiedInverters,
  fetchPtpireeManifest,
  filterPtpireeCertifiedInverters,
  formatPtpireeCertificateLabel,
  getPtpireeCertifiedInverter,
  usePtpireeCertifiedInverters,
  usePtpireeManifest,
  type PtpireeCertifiedInverterItem,
  type PtpireeManifest,
} from '../ptpireeCertifiedInverters';

const MANIFEST: PtpireeManifest = {
  source: 'PTPiREE Wykaz certyfikowanych urzadzen',
  source_page_url: 'https://ptpiree.pl/kodeksy-sieci/wykaz-certyfikatow/',
  current_wipwc_version: '1.3',
  publication_date: '2026-05-08',
  accepted_from: '2024-11-01',
  record_count: 6887,
  sources: [
    {
      source_id: 'ptpiree-wipwc-1-2-2026-05-06',
      wipwc_version: '1.2',
      source_url: 'https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-06-Wykaz-urzadzen_1.2.pdf',
      publication_date: '2026-05-06',
      record_count: 6356,
    },
    {
      source_id: 'ptpiree-wipwc-1-3-2026-05-08',
      wipwc_version: '1.3',
      source_url: 'https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-08-Wykaz-urzadzen_1.3.pdf',
      publication_date: '2026-05-08',
      record_count: 531,
    },
  ],
  update_policy: 'PTPiREE publikuje aktualizacje wykazu nie rzadziej niz raz w miesiacu.',
  integration_policy:
    'MV-DESIGN-PRO przechowuje znormalizowany snapshot wykazu i zapisuje source_url/publication_date przy kazdym rekordzie. Ostateczna akceptacja przylaczeniowa pozostaje po stronie wlasciwego OSD.',
};

const HUAWEI: PtpireeCertifiedInverterItem = {
  id: 'ptpiree-wipwc-1-2-row-3254-huawei-technologies-co-ltd-pv-sun2000-215ktl-h3',
  name: 'HUAWEI Technologies CO., Ltd PV SUN2000-215KTL-H3',
  manufacturer: 'HUAWEI Technologies CO., Ltd',
  model: 'PV SUN2000-215KTL-H3',
  device_type: 'Inwerter',
  document_number: 'TC-GCC-DNVGL-SE-0124-07526-1',
  document_acceptance_date: '31.12.2026',
  wos_version: '',
  wipwc_version: '1.2',
  ppm_scope: 'A,B,C,D',
  firmware_version: 'V300R001C00SPC114',
  source_url: 'https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-06-Wykaz-urzadzen_1.2.pdf',
  publication_date: '2026-05-06',
  accepted_from: '2024-11-01',
  manufacturer_key: 'HUAWEI TECHNOLOGIES CO LTD',
  model_key: 'PV SUN2000 215KTL H3',
  verification_status: 'ZWERYFIKOWANY',
  source_reference: 'PTPiREE Wykaz urzadzen 1.2, publikacja 2026-05-06',
  catalog_status: 'PRODUKCYJNY_V1',
  contract_version: '2.0',
};

const SOLAX: PtpireeCertifiedInverterItem = {
  id: 'ptpiree-wipwc-1-3-row-660-solax-power-network-technology-zhejiang-co-ltd-x3-aelio-50k',
  name: 'SolaX Power Network Technology (Zhejiang) Co., Ltd X3-AELIO-50K',
  manufacturer: 'SolaX Power Network Technology (Zhejiang) Co., Ltd',
  model: 'X3-AELIO-50K',
  device_type: 'HYBRYDOWY FALOWNIK fotowoltaiczny',
  document_number: 'A3 50720988 0001',
  document_acceptance_date: '27.03.2031',
  wos_version: 'WOS 2025',
  wipwc_version: '1.3',
  ppm_scope: 'A,B',
  firmware_version: 'Master: 1.00 Manager: 1.00',
  source_url: 'https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-08-Wykaz-urzadzen_1.3.pdf',
  publication_date: '2026-05-08',
  accepted_from: '2024-11-01',
  manufacturer_key: 'SOLAX POWER NETWORK TECHNOLOGY ZHEJIANG CO LTD',
  model_key: 'X3 AELIO 50K',
  verification_status: 'ZWERYFIKOWANY',
  source_reference: 'PTPiREE Wykaz urzadzen 1.3, publikacja 2026-05-08',
  catalog_status: 'PRODUKCYJNY_V1',
  contract_version: '2.0',
};

const ALTENERGY_Z_WARUNKIEM: PtpireeCertifiedInverterItem = {
  id: 'ptpiree-wipwc-1-3-row-9-altenergy-power-system-inc-ezhi-m-tylko-z-modu-em-zdalnego-pozyskiwania-danych-vcb-5131ln-wb',
  name: 'ALTENERGY POWER SYSTEM INC EZHI-M - Tylko z modułem zdalnego pozyskiwania danych VCB-5131LN-WB',
  manufacturer: 'ALTENERGY POWER SYSTEM INC',
  model: 'EZHI-M - Tylko z modułem zdalnego pozyskiwania danych VCB-5131LN-WB',
  device_type: 'Falownik',
  document_number: '4479923053408',
  document_acceptance_date: '05.02.2029',
  wos_version: 'WOS 2025',
  wipwc_version: '1.3',
  ppm_scope: 'A',
  firmware_version: 'REV 1.0',
  source_url: 'https://ptpiree.pl/wp-content/uploads/2026/05/2026-05-08-Wykaz-urzadzen_1.3.pdf',
  publication_date: '2026-05-08',
  accepted_from: '2024-11-01',
  manufacturer_key: 'ALTENERGY POWER SYSTEM INC',
  model_key: 'EZHI M TYLKO Z MODULEM ZDALNEGO POZYSKIWANIA DANYCH VCB 5131LN WB',
  verification_status: 'ZWERYFIKOWANY',
  source_reference: 'PTPiREE Wykaz urzadzen 1.3, publikacja 2026-05-08',
  catalog_status: 'PRODUKCYJNY_V1',
  contract_version: '2.0',
  verification_note: 'Tylko z modułem zdalnego pozyskiwania danych VCB-5131LN-WB',
};

const REJESTR: readonly PtpireeCertifiedInverterItem[] = [ALTENERGY_Z_WARUNKIEM, HUAWEI, SOLAX];

function odpowiedzJson(dane: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(dane), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Mock granicy `fetch` z odpowiedziami per adres (bez parametrów zapytania). */
function mockFetch(odpowiedzi: {
  readonly manifest?: () => Response;
  readonly certyfikaty?: (url: string) => Response;
}) {
  const mock = vi.fn(async (wejscie: RequestInfo | URL) => {
    const url = String(wejscie);
    if (url.startsWith(PTPIREE_MANIFEST_URL)) {
      return (odpowiedzi.manifest ?? (() => odpowiedzJson(MANIFEST)))();
    }
    if (url.startsWith(PTPIREE_CERTYFIKATY_URL)) {
      return (odpowiedzi.certyfikaty ?? (() => odpowiedzJson(REJESTR)))(url);
    }
    return odpowiedzJson({ detail: `nieoczekiwany adres ${url}` }, 404, 'Not Found');
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function opakowanie() {
  const klient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: klient }, children);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPtpireeManifest / fetchPtpireeCertifiedInverters — kontrakt API', () => {
  it('manifest: woła WYŁĄCZNIE `/api/catalog/ptpiree/manifest` i zwraca źródła z licznościami z artefaktu', async () => {
    const fetchMock = mockFetch({});
    const manifest = await fetchPtpireeManifest();
    expect(fetchMock).toHaveBeenCalledWith('/api/catalog/ptpiree/manifest');
    expect(manifest.record_count).toBe(6887);
    expect(manifest.sources.map((zrodlo) => [zrodlo.wipwc_version, zrodlo.record_count])).toEqual([
      ['1.2', 6356],
      ['1.3', 531],
    ]);
  });

  it('rekordy: pełny wykaz z `/api/catalog/ptpiree/generator-certificates` (bez parametrów)', async () => {
    const fetchMock = mockFetch({});
    const rekordy = await fetchPtpireeCertifiedInverters();
    expect(fetchMock.mock.calls).toEqual([['/api/catalog/ptpiree/generator-certificates']]);
    expect(rekordy).toEqual(REJESTR);
  });

  it('interfejs nie ma wyszukiwania po stronie backendu: funkcja i hook nie przyjmują parametrów', () => {
    // Decyzja zarządcy (odbiór D1): parametr `search` bez konsumenta to dług — usunięty.
    // Zawężanie listy robi `filterPtpireeCertifiedInverters` na pełnym wykazie z hooka.
    expect(fetchPtpireeCertifiedInverters.length).toBe(0);
    expect(usePtpireeCertifiedInverters.length).toBe(0);
  });

  it('pusta lista zgodna z kontraktem jest WYNIKIEM (wykaz bez pozycji), nie błędem', async () => {
    mockFetch({ certyfikaty: () => odpowiedzJson([]) });
    expect(await fetchPtpireeCertifiedInverters()).toEqual([]);
  });

  it.each([
    ['obiekt zamiast listy', { detail: 'x' }],
    ['lista bez identyfikatorów', [{ manufacturer: 'X' }]],
    ['lista z wartością nie-obiektem', ['tekst']],
  ])('rekordy spoza kontraktu (%s) → błąd, NIGDY pusty wykaz', async (_opis, dane) => {
    mockFetch({ certyfikaty: () => odpowiedzJson(dane) });
    await expect(fetchPtpireeCertifiedInverters()).rejects.toThrow(/Rejestr PTPiREE niedostępny/);
  });

  it.each([
    ['lista zamiast obiektu', []],
    ['brak liczności', { sources: [] }],
    ['brak listy źródeł', { record_count: 1 }],
  ])('manifest spoza kontraktu (%s) → błąd', async (_opis, dane) => {
    mockFetch({ manifest: () => odpowiedzJson(dane) });
    await expect(fetchPtpireeManifest()).rejects.toThrow(/Rejestr PTPiREE niedostępny/);
  });

  it('status HTTP błędu → błąd z adresem i kodem (nie połykany cicho)', async () => {
    mockFetch({ certyfikaty: () => odpowiedzJson({ detail: 'x' }, 503, 'Service Unavailable') });
    await expect(fetchPtpireeCertifiedInverters()).rejects.toThrow(
      'Rejestr PTPiREE niedostępny: /api/catalog/ptpiree/generator-certificates → HTTP 503 Service Unavailable',
    );
  });
});

describe('usePtpireeCertifiedInverters / usePtpireeManifest — jawny stan ładowania i błędu', () => {
  it('ładowanie → gotowy: manifest + pełny rejestr z backendu; dane stabilne między renderami', async () => {
    mockFetch({});
    const { result, rerender } = renderHook(() => usePtpireeCertifiedInverters(), {
      wrapper: opakowanie(),
    });
    expect(result.current.stan).toBe('ladowanie');
    await waitFor(() => expect(result.current.stan).toBe('gotowy'));
    const stan = result.current;
    if (stan.stan !== 'gotowy') throw new Error('oczekiwano stanu gotowy');
    expect(stan.dane.manifest.record_count).toBe(6887);
    expect(stan.dane.rejestr).toEqual(REJESTR);
    rerender();
    const poRenderze = result.current;
    if (poRenderze.stan !== 'gotowy') throw new Error('oczekiwano stanu gotowy');
    expect(poRenderze.dane).toBe(stan.dane);
  });

  it('hook pobiera dokładnie manifest i pełny wykaz — po jednym zapytaniu, bez parametrów', async () => {
    const fetchMock = mockFetch({});
    const { result } = renderHook(() => usePtpireeCertifiedInverters(), {
      wrapper: opakowanie(),
    });
    await waitFor(() => expect(result.current.stan).toBe('gotowy'));
    expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual(
      [PTPIREE_CERTYFIKATY_URL, PTPIREE_MANIFEST_URL].sort(),
    );
  });

  it.each([
    ['manifest HTTP 503', { manifest: () => odpowiedzJson({}, 503, 'Service Unavailable') }],
    ['rekordy HTTP 500', { certyfikaty: () => odpowiedzJson({}, 500, 'Internal Server Error') }],
    ['rekordy spoza kontraktu', { certyfikaty: () => odpowiedzJson({ nieoczekiwany: 'ksztalt' }) }],
  ])('%s → stan błędu z komunikatem, nigdy „gotowy" z pustą listą', async (_opis, odpowiedzi) => {
    mockFetch(odpowiedzi);
    const { result } = renderHook(() => usePtpireeCertifiedInverters(), { wrapper: opakowanie() });
    await waitFor(() => expect(result.current.stan).toBe('blad'));
    const stan = result.current;
    if (stan.stan !== 'blad') throw new Error('oczekiwano stanu błędu');
    expect(stan.komunikat).toMatch(/Rejestr PTPiREE niedostępny/);
  });

  it('usePtpireeManifest pobiera WYŁĄCZNIE manifest (bez ~3 MB rekordów)', async () => {
    const fetchMock = mockFetch({});
    const { result } = renderHook(() => usePtpireeManifest(), { wrapper: opakowanie() });
    expect(result.current.stan).toBe('ladowanie');
    await waitFor(() => expect(result.current.stan).toBe('gotowy'));
    const stan = result.current;
    if (stan.stan !== 'gotowy') throw new Error('oczekiwano stanu gotowy');
    expect(stan.dane.current_wipwc_version).toBe('1.3');
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([PTPIREE_MANIFEST_URL]);
  });

  it('usePtpireeManifest: błąd backendu → stan błędu', async () => {
    mockFetch({ manifest: () => odpowiedzJson({}, 502, 'Bad Gateway') });
    const { result } = renderHook(() => usePtpireeManifest(), { wrapper: opakowanie() });
    await waitFor(() => expect(result.current.stan).toBe('blad'));
  });
});

describe('funkcje czyste na rejestrze z hooka', () => {
  it('getPtpireeCertifiedInverter: po identyfikatorze wykazu (tym samym, który backend stempluje w modelu)', () => {
    expect(getPtpireeCertifiedInverter(HUAWEI.id, REJESTR)).toBe(HUAWEI);
    expect(getPtpireeCertifiedInverter('ptpiree-nieistniejacy', REJESTR)).toBeNull();
    expect(getPtpireeCertifiedInverter(null, REJESTR)).toBeNull();
    expect(getPtpireeCertifiedInverter(HUAWEI.id, [])).toBeNull();
  });

  it('formatPtpireeCertificateLabel: producent, model i numer dokumentu; brak pozycji nazwany wprost', () => {
    expect(formatPtpireeCertificateLabel(HUAWEI)).toBe(
      'HUAWEI Technologies CO., Ltd PV SUN2000-215KTL-H3 (TC-GCC-DNVGL-SE-0124-07526-1)',
    );
    expect(formatPtpireeCertificateLabel(null)).toBe('brak powiązania z wykazem PTPiREE');
  });

  it('filterPtpireeCertifiedInverters: producent, model, numer dokumentu, zapis zwarty, zakres modułów, warunek ważności', () => {
    expect(filterPtpireeCertifiedInverters('solax', REJESTR)).toEqual([SOLAX]);
    expect(filterPtpireeCertifiedInverters('TC-GCC-DNVGL-SE-0124-07526-1', REJESTR)).toEqual([HUAWEI]);
    expect(filterPtpireeCertifiedInverters('sun2000215ktl', REJESTR)).toEqual([HUAWEI]);
    expect(filterPtpireeCertifiedInverters('a,b,c,d', REJESTR)).toEqual([HUAWEI]);
    expect(filterPtpireeCertifiedInverters('VCB-5131LN', REJESTR)).toEqual([ALTENERGY_Z_WARUNKIEM]);
    expect(filterPtpireeCertifiedInverters('   ', REJESTR)).toBe(REJESTR);
    expect(filterPtpireeCertifiedInverters('solax', [])).toEqual([]);
  });
});
