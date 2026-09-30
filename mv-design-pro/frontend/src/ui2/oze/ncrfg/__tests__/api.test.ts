/**
 * Klient V2 zgodności NC RfG — obsługa odpowiedzi (karta AB-1a Pakiet D2 §1, §5).
 * 422 z `detail` w kształcie braków to TREŚĆ („czego brakuje") — `BrakiCertyfikatuError` /
 * `BrakiWnioskuError` z pełnymi rekordami W (kształt z fixtur policzonych backendem);
 * każdy inny błąd (w tym 422 walidacji pydantic) to zwykły `Error` z komunikatem backendu.
 * Klasyfikacja `/modul` zwraca rekord 1:1 (również `modul: null` poniżej progu).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import certyfikatBraki from '../../../../harness-fixtures/generated/certyfikat_scena_macierz_braki.json';
import wejsciaSceny from '../../../../harness-fixtures/generated/ncrfg_wejscia_scena_macierz.json';
import wniosekBraki from '../../../../harness-fixtures/generated/wniosek_scena_macierz_braki.json';
import {
  BrakiCertyfikatuError,
  BrakiWnioskuError,
  adresDokumentu,
  klasyfikujModulNcRfg,
  pobierzCertyfikat,
  pobierzPlikWniosku,
  pobierzWejsciaPrzypadkuNcRfg,
  pobierzWniosek,
  uruchomBiegNcRfg,
} from '../api';

function odpowiedz(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    statusText: status === 200 ? 'OK' : 'Unprocessable Entity',
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const ZADANIE_CERT = { nazwa_projektu: 'P', nazwa_przypadku: null, operator_id: 'enea' };
const ZADANIE_WNIOSKU = {
  nazwa_projektu: 'P',
  nazwa_przypadku: null,
  wnioskodawca: null,
  adres_przylaczenia: null,
  pf_run_id: '00000000-0000-5000-8000-000000000001',
  sc_run_id: '00000000-0000-5000-8000-000000000002',
  bus_ref: 'szyna',
  operator_id: 'enea',
};

describe('adresDokumentu', () => {
  it('case_id zawsze w zapytaniu, format w ścieżce', () => {
    expect(adresDokumentu('/api/x', 'case 1')).toBe('/api/x?case_id=case+1');
    expect(adresDokumentu('/api/x', 'c', 'pdf')).toBe('/api/x.pdf?case_id=c');
  });
});

describe('422 z brakami → błąd braków z rekordami (certyfikat × wniosek × JSON/plik)', () => {
  it('certyfikat: BrakiCertyfikatuError niesie rekordy W i zdania backendu', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odpowiedz(422, { detail: certyfikatBraki })));
    const blad = await pobierzCertyfikat(ZADANIE_CERT, 'case-demo').catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(BrakiCertyfikatuError);
    const braki = (blad as BrakiCertyfikatuError).braki;
    expect(braki.braki.length).toBeGreaterThan(0);
    // Pary z jednego źródła: zdanie i-tego braku dotyczy tego samego modułu i tego samego rekordu.
    expect(braki.braki_pl).toEqual(
      braki.braki.map((b) => ({ der_ref: b.der_ref, der_name: b.der_name, zdanie_pl: b.rekord.wyjasnienie.zdanie_pl })),
    );
    expect((blad as Error).message).toBe(certyfikatBraki.komunikat);
  });

  it('wniosek (JSON i PDF): BrakiWnioskuError niesie braki tekstowe i rekordy NC RfG', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odpowiedz(422, { detail: wniosekBraki })));
    for (const wywolanie of [
      () => pobierzWniosek(ZADANIE_WNIOSKU, 'case-demo'),
      () => pobierzPlikWniosku(ZADANIE_WNIOSKU, 'case-demo', 'pdf'),
    ]) {
      const blad = await wywolanie().catch((e: unknown) => e);
      expect(blad).toBeInstanceOf(BrakiWnioskuError);
      const niesione = (blad as BrakiWnioskuError).braki;
      expect(niesione.braki_ncrfg.length).toBe(wniosekBraki.braki_ncrfg.length);
      expect(niesione.braki_ncrfg_pl.map((z) => z.der_ref)).toEqual(niesione.braki_ncrfg.map((b) => b.der_ref));
    }
  });

  it('422 walidacji (detail = lista pydantic) nie udaje braków — zwykły Error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => odpowiedz(422, { detail: [{ loc: ['body', 'x'], msg: 'extra', type: 'extra_forbidden' }] })),
    );
    const blad = await pobierzCertyfikat(ZADANIE_CERT, 'case-demo').catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(Error);
    expect(blad).not.toBeInstanceOf(BrakiCertyfikatuError);
  });

  it('404 z komunikatem backendu → Error z tym komunikatem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odpowiedz(404, { detail: 'Przypadek nie ma dokumentu ENM.' })));
    await expect(uruchomBiegNcRfg({ modules: [] })).rejects.toThrow('Przypadek nie ma dokumentu ENM.');
  });
});

describe('klasyfikujModulNcRfg', () => {
  it('parametry p_max_kw/napiecie_kv i rekord 1:1 (modul null poniżej progu)', async () => {
    const rekord = {
      modul: null,
      prog_min_kw: 0.8,
      progi_kw: { B: 200, C: 10000, D: 75000 },
      napiecie_d_kv: 110,
      podstawa: { rodzaj: 'WOS', dokument: 'WOS', wydanie: '2018', jednostka_redakcyjna: null, status: 'NIEUSTALONE', uwagi_pl: null },
      powod_pl: 'moc 0,5 kW poniżej progu istotności 0,8 kW',
    };
    const fetchMock = vi.fn(async () => odpowiedz(200, rekord));
    vi.stubGlobal('fetch', fetchMock);
    await expect(klasyfikujModulNcRfg({ pMaxKw: 0.5, napiecieKv: 0.4 })).resolves.toEqual(rekord);
    expect(fetchMock).toHaveBeenCalledWith('/api/ncrfg-tests/modul?p_max_kw=0.5&napiecie_kv=0.4');
  });
});

describe('pobierzWejsciaPrzypadkuNcRfg — formularz wstępny z mostu modelu', () => {
  it('adres z kodowaniem przypadku i operatorem w zapytaniu; odpowiedź 1:1 (fixtura liczona backendem)', async () => {
    const fetchMock = vi.fn(async () => odpowiedz(200, wejsciaSceny));
    vi.stubGlobal('fetch', fetchMock);
    await expect(pobierzWejsciaPrzypadkuNcRfg('case demo', 'enea')).resolves.toEqual(wejsciaSceny);
    expect(fetchMock).toHaveBeenCalledWith('/api/ncrfg-tests/cases/case%20demo/wejscia?operator_id=enea');
  });

  it('404 (nieznany operator) → Error z komunikatem backendu, nie pusty formularz', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odpowiedz(404, { detail: 'Nieznany operator NC RfG: x.' })));
    await expect(pobierzWejsciaPrzypadkuNcRfg('case-demo', 'x')).rejects.toThrow('Nieznany operator NC RfG: x.');
  });
});
