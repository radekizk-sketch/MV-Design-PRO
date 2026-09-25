/*
 * JEDEN klient zgodności NC RfG / PTPiREE na kontrakcie V2 (karta AB-1a Pakiet D2).
 *
 * Końcówki (kształty w `./typy.ts`, 1:1 z backendem):
 *   - `GET  /api/ncrfg-tests/catalog`                     → `KatalogNcRfg`
 *   - `GET  /api/ncrfg-tests/modul?p_max_kw=&napiecie_kv=` → `KlasyfikacjaModulu`
 *   - `POST /api/ncrfg-tests/run`                          → `BiegNcRfg` (bieg „co-jeśli")
 *   - `GET  /api/ncrfg-tests/cases/{case_id}/compliance`   → `ZgodnoscPrzypadkuNcRfg`
 *   - `GET  /api/ncrfg-tests/cases/{case_id}/wejscia`      → `WejsciaPrzypadkuNcRfg`
 *     (formularz wstępny biegu „co-jeśli" z mostu modelu)
 *   - `POST /api/oze-analysis/compliance-certificate(.docx|.pdf)?case_id=` → certyfikat
 *   - `POST /api/oze-analysis/osd-application(.docx|.pdf)?case_id=`         → wniosek do OSD
 *
 * Zasady: ciało żądania ma WYŁĄCZNIE pola kontraktu (`extra="forbid"` backendu — pole nieznane
 * to 422); certyfikat i wniosek wymagają przypadku (`case_id` w zapytaniu) — dane modułów
 * i dowód certyfikatu urządzenia wyprowadza serwer z zatwierdzonego modelu. Odpowiedź 422
 * z brakami (`detail` obiekt) jest TREŚCIĄ („czego brakuje"), nie komunikatem błędu — klient
 * zwraca ją jako `BrakiCertyfikatuError` / `BrakiWnioskuError` z pełnymi rekordami W.
 * Warstwa prezentacji: zero fizyki, zero oceny, zero agregatów.
 */

import type {
  BiegNcRfg,
  BrakiCertyfikatu,
  BrakiWniosku,
  KatalogNcRfg,
  KlasyfikacjaModulu,
  WejsciaPrzypadkuNcRfg,
  WidokCertyfikatu,
  WidokWniosku,
  ZadanieBieguNcRfg,
  ZadanieCertyfikatu,
  ZadanieWniosku,
  ZgodnoscPrzypadkuNcRfg,
} from './typy';

export const URL_KATALOGU_NCRFG = '/api/ncrfg-tests/catalog';
export const URL_KLASYFIKACJI_MODULU = '/api/ncrfg-tests/modul';
export const URL_BIEGU_NCRFG = '/api/ncrfg-tests/run';
export const URL_CERTYFIKATU = '/api/oze-analysis/compliance-certificate';
export const URL_WNIOSKU = '/api/oze-analysis/osd-application';

/** Format pliku dokumentu formalnego (ten sam widok JSON, dwa renderery backendu). */
export type FormatDokumentu = 'docx' | 'pdf';

// =============================================================================
// Transport
// =============================================================================

/** Treść `detail` odpowiedzi błędu FastAPI (łańcuch albo obiekt), `undefined` bez JSON. */
async function detalOdpowiedzi(response: Response): Promise<unknown> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return body?.detail;
  } catch {
    return undefined;
  }
}

function komunikatBledu(url: string, response: Response, detail: unknown): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  return `Zapytanie ${url} nie powiodło się: ${response.status} ${response.statusText}`.trim();
}

async function pobierzJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(komunikatBledu(url, response, await detalOdpowiedzi(response)));
  }
  return response.json() as Promise<T>;
}

function postJson(url: string, cialo: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cialo),
  });
}

/** Adres dokumentu przypadku: baza, opcjonalny sufiks formatu pliku i przypadek w zapytaniu. */
export function adresDokumentu(baza: string, caseId: string, format?: FormatDokumentu): string {
  const sciezka = format ? `${baza}.${format}` : baza;
  return `${sciezka}?${new URLSearchParams({ case_id: caseId }).toString()}`;
}

// =============================================================================
// Katalog, klasyfikacja, bieg „co-jeśli", zgodność przypadku
// =============================================================================

/** Katalog testów, wersja procedury (obiekt `DokumentWarstwy`) i profile operatorów. */
export function pobierzKatalogNcRfg(): Promise<KatalogNcRfg> {
  return pobierzJson<KatalogNcRfg>(URL_KATALOGU_NCRFG);
}

/**
 * Klasyfikacja modułu art. 5 (progi WOS) — JEDYNE źródło klasy dla interfejsu. Moc w kW,
 * napięcie przyłączenia w kV. Poniżej progu istotności `modul === null` z `powod_pl`.
 */
export function klasyfikujModulNcRfg(args: {
  readonly pMaxKw: number;
  readonly napiecieKv: number;
}): Promise<KlasyfikacjaModulu> {
  const parametry = new URLSearchParams({
    p_max_kw: String(args.pMaxKw),
    napiecie_kv: String(args.napiecieKv),
  });
  return pobierzJson<KlasyfikacjaModulu>(`${URL_KLASYFIKACJI_MODULU}?${parametry.toString()}`);
}

/**
 * Bieg „co-jeśli" z danych formularza (źródło danych `ZADANIE_KLIENTA`): ciało = `modules`
 * (+ `requested_test_ids`) — bez wersji procedury, bez przypadku, bez pola certyfikatu.
 */
export async function uruchomBiegNcRfg(zadanie: ZadanieBieguNcRfg): Promise<BiegNcRfg> {
  const response = await postJson(URL_BIEGU_NCRFG, zadanie);
  if (!response.ok) {
    throw new Error(komunikatBledu(URL_BIEGU_NCRFG, response, await detalOdpowiedzi(response)));
  }
  return response.json() as Promise<BiegNcRfg>;
}

/** Zgodność WSZYSTKICH DER przypadku liczona z zatwierdzonego modelu (dowód certyfikatu z serwera). */
export function pobierzZgodnoscPrzypadkuNcRfg(
  caseId: string,
  operatorId: string,
): Promise<ZgodnoscPrzypadkuNcRfg> {
  return pobierzJson<ZgodnoscPrzypadkuNcRfg>(
    `/api/ncrfg-tests/cases/${encodeURIComponent(caseId)}/compliance?` +
      new URLSearchParams({ operator_id: operatorId }).toString(),
  );
}

/**
 * Wejścia modułów przypadku złożone z zatwierdzonego modelu mostem backendu (także pola
 * liczone z danych generatora: statyzm, martwa strefa, cosφ, zakresy Q, zdolności) — formularz
 * wstępny biegu „co-jeśli" macierzy, jeden odczyt bez powielania logiki mostu po stronie klienta.
 */
export function pobierzWejsciaPrzypadkuNcRfg(
  caseId: string,
  operatorId: string,
): Promise<WejsciaPrzypadkuNcRfg> {
  return pobierzJson<WejsciaPrzypadkuNcRfg>(
    `/api/ncrfg-tests/cases/${encodeURIComponent(caseId)}/wejscia?` +
      new URLSearchParams({ operator_id: operatorId }).toString(),
  );
}

// =============================================================================
// Certyfikat zgodności i wniosek do OSD
// =============================================================================

/** Odpowiedź 422 certyfikatu z brakami — rekordy W wymagań bez `SPELNIA` i źródła pominięte. */
export class BrakiCertyfikatuError extends Error {
  readonly braki: BrakiCertyfikatu;

  constructor(braki: BrakiCertyfikatu) {
    super(braki.komunikat);
    this.name = 'BrakiCertyfikatuError';
    this.braki = braki;
  }
}

/** Odpowiedź 422 wniosku z brakami — braki tekstowe, rekordy W NC RfG i źródła pominięte. */
export class BrakiWnioskuError extends Error {
  readonly braki: BrakiWniosku;

  constructor(braki: BrakiWniosku) {
    super(braki.komunikat);
    this.name = 'BrakiWnioskuError';
    this.braki = braki;
  }
}

function jestObiektem(wartosc: unknown): wartosc is Record<string, unknown> {
  return typeof wartosc === 'object' && wartosc !== null && !Array.isArray(wartosc);
}

/** `detail` 422 certyfikatu w kształcie `CertyfikatBrakiError.detail()`. */
function jestBrakamiCertyfikatu(detail: unknown): detail is BrakiCertyfikatu {
  return (
    jestObiektem(detail) &&
    typeof detail.komunikat === 'string' &&
    Array.isArray(detail.braki) &&
    Array.isArray(detail.braki_pl) &&
    Array.isArray(detail.pominiete) &&
    Array.isArray(detail.pominiete_pl)
  );
}

/** `detail` 422 wniosku w kształcie `WniosekOsdBrakiError.detail()`. */
function jestBrakamiWniosku(detail: unknown): detail is BrakiWniosku {
  return (
    jestObiektem(detail) &&
    typeof detail.komunikat === 'string' &&
    Array.isArray(detail.braki) &&
    Array.isArray(detail.braki_ncrfg) &&
    Array.isArray(detail.braki_ncrfg_pl) &&
    Array.isArray(detail.pominiete) &&
    Array.isArray(detail.pominiete_pl)
  );
}

async function bladCertyfikatu(url: string, response: Response): Promise<Error> {
  const detail = await detalOdpowiedzi(response);
  if (response.status === 422 && jestBrakamiCertyfikatu(detail)) return new BrakiCertyfikatuError(detail);
  return new Error(komunikatBledu(url, response, detail));
}

async function bladWniosku(url: string, response: Response): Promise<Error> {
  const detail = await detalOdpowiedzi(response);
  if (response.status === 422 && jestBrakamiWniosku(detail)) return new BrakiWnioskuError(detail);
  return new Error(komunikatBledu(url, response, detail));
}

/** Widok JSON certyfikatu zgodności. 422 z brakami → `BrakiCertyfikatuError`. */
export async function pobierzCertyfikat(
  zadanie: ZadanieCertyfikatu,
  caseId: string,
): Promise<WidokCertyfikatu> {
  const url = adresDokumentu(URL_CERTYFIKATU, caseId);
  const response = await postJson(url, zadanie);
  if (!response.ok) throw await bladCertyfikatu(url, response);
  return response.json() as Promise<WidokCertyfikatu>;
}

/** Plik certyfikatu (DOCX albo PDF — te same wiersze). 422 z brakami → `BrakiCertyfikatuError`. */
export async function pobierzPlikCertyfikatu(
  zadanie: ZadanieCertyfikatu,
  caseId: string,
  format: FormatDokumentu,
): Promise<Blob> {
  const url = adresDokumentu(URL_CERTYFIKATU, caseId, format);
  const response = await postJson(url, zadanie);
  if (!response.ok) throw await bladCertyfikatu(url, response);
  return response.blob();
}

/** Widok JSON wniosku do OSD. 422 z brakami → `BrakiWnioskuError`. */
export async function pobierzWniosek(zadanie: ZadanieWniosku, caseId: string): Promise<WidokWniosku> {
  const url = adresDokumentu(URL_WNIOSKU, caseId);
  const response = await postJson(url, zadanie);
  if (!response.ok) throw await bladWniosku(url, response);
  return response.json() as Promise<WidokWniosku>;
}

/** Plik wniosku (DOCX albo PDF). 422 z brakami → `BrakiWnioskuError`. */
export async function pobierzPlikWniosku(
  zadanie: ZadanieWniosku,
  caseId: string,
  format: FormatDokumentu,
): Promise<Blob> {
  const url = adresDokumentu(URL_WNIOSKU, caseId, format);
  const response = await postJson(url, zadanie);
  if (!response.ok) throw await bladWniosku(url, response);
  return response.blob();
}
