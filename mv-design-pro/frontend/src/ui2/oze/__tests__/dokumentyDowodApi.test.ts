/*
 * Klienci dokumentu studium przyłączeniowego doklejają WSKAZANIE PRZYPADKU (`case_id`),
 * gdy wywołujący go zna.
 *
 * PO CO. Dokument studium niesie dowód certyfikacji PTPiREE urządzeń typu tylko wtedy,
 * gdy backend zna przypadek — z niego czyta tabliczki urządzeń modelu (`case_id` jest tu
 * OPCJONALNE). Certyfikat zgodności i wniosek do OSD mają `case_id` WYMAGANE (zgodność
 * wyłącznie z zatwierdzonego modelu — karta AB-1a Pakiet D2); ich adres pilnuje klasa
 * testów `ncrfg/__tests__/kontraktZadan.test.ts` (parametry zapytania ⊆ OpenAPI, wymagane
 * obecne) i `ncrfg/__tests__/api.test.ts`.
 *
 * INWENTARZ KLASY: 3 klienci dokumentu studium (JSON/DOCX/PDF) — każdy w obu wariantach
 * (z przypadkiem i bez), bo brak przypadku MUSI zostawić ścieżkę nietkniętą. `fetch`
 * mockowany na granicy sieci.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  pobierzDokumentStudium,
  pobierzDokumentStudiumDocx,
  pobierzDokumentStudiumPdf,
  type ZadanieDokumentuStudium,
} from '../api';

const CASE_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

const ZADANIE_STUDIUM: ZadanieDokumentuStudium = {
  nazwa_projektu: 'Sieć testowa',
  run_id: 'run-pf',
  catalog_item_id: 'conv-pv-1',
  operator_id: 'pge',
  warianty: ['bus_sn_c'],
};

/** Klient dokumentu: (żądanie, przypadek) → ścieżka końcówki. */
type Klient = (zadanie: never, caseId?: string | null) => Promise<unknown>;

interface PrzypadekKlienta {
  readonly nazwa: string;
  readonly klient: Klient;
  readonly zadanie: unknown;
  readonly sciezka: string;
}

const KLIENCI: readonly PrzypadekKlienta[] = [
  {
    nazwa: 'dokument studium przyłączeniowego (widok JSON)',
    klient: pobierzDokumentStudium as unknown as Klient,
    zadanie: ZADANIE_STUDIUM,
    sciezka: '/api/oze-analysis/connection-study',
  },
  {
    nazwa: 'dokument studium przyłączeniowego (DOCX)',
    klient: pobierzDokumentStudiumDocx as unknown as Klient,
    zadanie: ZADANIE_STUDIUM,
    sciezka: '/api/oze-analysis/connection-study.docx',
  },
  {
    nazwa: 'dokument studium przyłączeniowego (PDF)',
    klient: pobierzDokumentStudiumPdf as unknown as Klient,
    zadanie: ZADANIE_STUDIUM,
    sciezka: '/api/oze-analysis/connection-study.pdf',
  },
];

/** Odpowiedź 200 niosąca i JSON, i plik — ten sam mock dla klientów widoku i pobrań. */
function zamockujOdpowiedz() {
  const fn = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({}),
      blob: () => Promise.resolve(new Blob(['x'])),
    }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(KLIENCI)('$nazwa', ({ klient, zadanie, sciezka }) => {
  it('ze wskazanym przypadkiem dokleja ?case_id=', async () => {
    const fn = zamockujOdpowiedz();

    await klient(zadanie as never, CASE_ID);

    const [url, opcje] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${sciezka}?case_id=${CASE_ID}`);
    expect(opcje.method).toBe('POST');
    expect(JSON.parse(opcje.body as string)).toEqual(zadanie);
  });

  it('bez przypadku wysyła gołą ścieżkę (kontrakt sprzed dowodu nietknięty)', async () => {
    const fn = zamockujOdpowiedz();

    await klient(zadanie as never);

    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(sciezka);
  });

  it('pusty przypadek nie tworzy ścieżki z pustym parametrem', async () => {
    const fn = zamockujOdpowiedz();

    await klient(zadanie as never, null);

    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(sciezka);
  });
});

describe('kodowanie wskazania przypadku', () => {
  it('identyfikator przypadku jest kodowany do adresu (bez surowych znaków specjalnych)', async () => {
    const fn = zamockujOdpowiedz();

    await (pobierzDokumentStudium as unknown as Klient)(ZADANIE_STUDIUM as never, 'a b&c');

    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(
      '/api/oze-analysis/connection-study?case_id=a%20b%26c',
    );
  });
});
