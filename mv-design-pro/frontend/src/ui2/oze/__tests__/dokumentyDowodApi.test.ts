/*
 * Klienci formalnych dokumentów OZE doklejają WSKAZANIE PRZYPADKU (`case_id`).
 *
 * PO CO. Certyfikat zgodności, wniosek OSD i dokument studium przyłączeniowego
 * niosą dowód certyfikacji PTPiREE tylko wtedy, gdy backend zna przypadek —
 * z niego czyta tabliczki urządzeń modelu. Klient bez `case_id` dostaje dokument
 * bez sekcji dowodu, czyli dokładnie ten brak, który ta karta zamyka.
 *
 * INWENTARZ KLASY: 7 klientów dokumentów (certyfikat JSON/DOCX, wniosek
 * JSON/DOCX, studium JSON/DOCX/PDF) — każdy sprawdzony w obu wariantach
 * (z przypadkiem i bez), bo brak przypadku MUSI zostawić ścieżkę nietkniętą.
 * `fetch` mockowany; wzorzec `runNcRfgPtpireeTests` z `ui/ncrfg-tests/api.ts`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  pobierzCertyfikat,
  pobierzCertyfikatDocx,
  pobierzDokumentStudium,
  pobierzDokumentStudiumDocx,
  pobierzDokumentStudiumPdf,
  pobierzWniosek,
  pobierzWniosekDocx,
  type ZadanieCertyfikatu,
  type ZadanieDokumentuStudium,
  type ZadanieWniosku,
} from '../api';

const CASE_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

const ZADANIE_CERTYFIKATU: ZadanieCertyfikatu = {
  run_request: { modules: [], procedure_version: 'PTPiREE Procedura testowania v3.0' },
  nazwa_projektu: 'Sieć testowa',
  nazwa_przypadku: 'Wariant bazowy',
};

const ZADANIE_WNIOSKU: ZadanieWniosku = {
  nazwa_projektu: 'Sieć testowa',
  pf_run_id: 'run-pf',
  sc_run_id: 'run-sc',
  bus_ref: 'bus_nn',
  run_request: { modules: [] },
};

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
  readonly plik: boolean;
}

const KLIENCI: readonly PrzypadekKlienta[] = [
  {
    nazwa: 'certyfikat zgodności (widok JSON)',
    klient: pobierzCertyfikat as unknown as Klient,
    zadanie: ZADANIE_CERTYFIKATU,
    sciezka: '/api/oze-analysis/compliance-certificate',
    plik: false,
  },
  {
    nazwa: 'certyfikat zgodności (DOCX)',
    klient: pobierzCertyfikatDocx as unknown as Klient,
    zadanie: ZADANIE_CERTYFIKATU,
    sciezka: '/api/oze-analysis/compliance-certificate.docx',
    plik: true,
  },
  {
    nazwa: 'wniosek o warunki przyłączenia (widok JSON)',
    klient: pobierzWniosek as unknown as Klient,
    zadanie: ZADANIE_WNIOSKU,
    sciezka: '/api/oze-analysis/osd-application',
    plik: false,
  },
  {
    nazwa: 'wniosek o warunki przyłączenia (DOCX)',
    klient: pobierzWniosekDocx as unknown as Klient,
    zadanie: ZADANIE_WNIOSKU,
    sciezka: '/api/oze-analysis/osd-application.docx',
    plik: true,
  },
  {
    nazwa: 'dokument studium przyłączeniowego (widok JSON)',
    klient: pobierzDokumentStudium as unknown as Klient,
    zadanie: ZADANIE_STUDIUM,
    sciezka: '/api/oze-analysis/connection-study',
    plik: false,
  },
  {
    nazwa: 'dokument studium przyłączeniowego (DOCX)',
    klient: pobierzDokumentStudiumDocx as unknown as Klient,
    zadanie: ZADANIE_STUDIUM,
    sciezka: '/api/oze-analysis/connection-study.docx',
    plik: true,
  },
  {
    nazwa: 'dokument studium przyłączeniowego (PDF)',
    klient: pobierzDokumentStudiumPdf as unknown as Klient,
    zadanie: ZADANIE_STUDIUM,
    sciezka: '/api/oze-analysis/connection-study.pdf',
    plik: true,
  },
];

function zamockujOdpowiedz(plik: boolean) {
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

describe.each(KLIENCI)('$nazwa', ({ klient, zadanie, sciezka, plik }) => {
  it('ze wskazanym przypadkiem dokleja ?case_id=', async () => {
    const fn = zamockujOdpowiedz(plik);

    await klient(zadanie as never, CASE_ID);

    const [url, opcje] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${sciezka}?case_id=${CASE_ID}`);
    expect(opcje.method).toBe('POST');
    expect(JSON.parse(opcje.body as string)).toEqual(zadanie);
  });

  it('bez przypadku wysyła gołą ścieżkę (kontrakt sprzed dowodu nietknięty)', async () => {
    const fn = zamockujOdpowiedz(plik);

    await klient(zadanie as never);

    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(sciezka);
  });

  it('pusty przypadek nie tworzy ścieżki z pustym parametrem', async () => {
    const fn = zamockujOdpowiedz(plik);

    await klient(zadanie as never, null);

    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(sciezka);
  });
});

describe('kodowanie wskazania przypadku', () => {
  it('identyfikator przypadku jest kodowany do adresu (bez surowych znaków specjalnych)', async () => {
    const fn = zamockujOdpowiedz(false);

    await (pobierzCertyfikat as unknown as Klient)(ZADANIE_CERTYFIKATU as never, 'a b&c');

    expect((fn.mock.calls[0] as unknown as [string])[0]).toBe(
      '/api/oze-analysis/compliance-certificate?case_id=a%20b%26c',
    );
  });
});
