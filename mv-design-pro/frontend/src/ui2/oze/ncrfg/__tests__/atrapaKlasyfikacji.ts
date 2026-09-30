/**
 * Atrapa końcówki `GET /api/ncrfg-tests/modul` dla testów ekranów (karta AB-1a Pakiet D2;
 * decyzja zarządcy nr 1). Dwie gwarancje zamiast dawnych trzech ręcznych kopii progów
 * (`klasyfikujModulNcRfgDlaTestu` w testach kreatora DER i szuflady SLD):
 *
 * 1. KSZTAŁT ZAPYTANIA z migawki OpenAPI: parametry zapytania = dokładnie `parameters`
 *    końcówki (`p_max_kw`, `napiecie_kv`, oba wymagane) — inny klucz (np. dawny klucz mocy w MW)
 *    dostaje 422 jak od backendu, więc test widzi błąd zamiast cichej klasyfikacji.
 * 2. PROGI z katalogu policzonego backendem (`harness-fixtures/generated/ncrfg_katalog.json`
 *    — `module_types` profilu, warstwa WOS), nie z liczb przepisanych do testu. Odpowiedź ma
 *    pełny kształt `KlasyfikacjaModulu` (typ albo `null` poniżej progu, progi, podstawa).
 *    Zdanie `powod_pl` jest opisem ATRAPY (backend składa własne) — testy go nie porównują.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import katalogNcRfg from '../../../../harness-fixtures/generated/ncrfg_katalog.json';
import type { KatalogNcRfg, KlasyfikacjaModulu, TypModulu } from '../typy';

const KATALOG = katalogNcRfg as unknown as KatalogNcRfg;

const PARAMETRY_MODUL = (() => {
  const openapi = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', '..', '..', '..', 'backend', 'schemas', 'openapi_snapshot.json'), 'utf-8'),
  ) as { paths: Record<string, { get: { parameters: { name: string; in: string; required?: boolean }[] } }> };
  return openapi.paths['/api/ncrfg-tests/modul'].get.parameters.filter((p) => p.in === 'query');
})();

function prog(id: TypModulu): { min: number; napiecie: number | null } {
  const typ = KATALOG.operators[0].module_types.find((t) => t.id === id);
  if (!typ) throw new Error(`katalog bez typu ${id}`);
  return { min: typ.threshold_kw_min, napiecie: typ.napiecie_ponizej_kv };
}

/** Klasyfikacja wg progów katalogu backendu (typ D: moc ≥ progu D albo napięcie ≥ progu napięciowego). */
export function klasyfikacjaWgKatalogu(pMaxKw: number, napiecieKv: number): KlasyfikacjaModulu {
  const [a, b, c, d] = [prog('A'), prog('B'), prog('C'), prog('D')];
  const napiecieD = c.napiecie ?? Number.POSITIVE_INFINITY;
  const modul: TypModulu | null =
    pMaxKw < a.min
      ? null
      : napiecieKv >= napiecieD || pMaxKw >= d.min
        ? 'D'
        : pMaxKw >= c.min
          ? 'C'
          : pMaxKw >= b.min
            ? 'B'
            : 'A';
  return {
    modul,
    prog_min_kw: a.min,
    progi_kw: { B: b.min, C: c.min, D: d.min },
    napiecie_d_kv: napiecieD,
    podstawa: KATALOG.operators[0].klasyfikacja_zrodlo,
    powod_pl: `atrapa testu: ${pMaxKw} kW przy ${napiecieKv} kV → ${modul ?? 'poniżej progu'}`,
  };
}

/** Odpowiedź na `GET /api/ncrfg-tests/modul?…`; `null`, gdy adres nie dotyczy tej końcówki. */
export function odpowiedzKlasyfikacji(url: string): Response | null {
  const adres = new URL(url, 'http://localhost');
  if (adres.pathname !== '/api/ncrfg-tests/modul') return null;
  const dozwolone = new Set(PARAMETRY_MODUL.map((p) => p.name));
  const obce = [...adres.searchParams.keys()].filter((k) => !dozwolone.has(k));
  const brakujace = PARAMETRY_MODUL.filter((p) => p.required && !adres.searchParams.has(p.name)).map((p) => p.name);
  if (obce.length > 0 || brakujace.length > 0) {
    return new Response(
      JSON.stringify({ detail: `atrapa /modul: parametry spoza OpenAPI [${obce}], brakujące [${brakujace}]` }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const klasyfikacja = klasyfikacjaWgKatalogu(
    Number(adres.searchParams.get('p_max_kw')),
    Number(adres.searchParams.get('napiecie_kv')),
  );
  return new Response(JSON.stringify(klasyfikacja), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
