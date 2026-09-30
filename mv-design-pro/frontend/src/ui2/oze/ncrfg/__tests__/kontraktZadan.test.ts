/**
 * Test KLASY żądań zgodności NC RfG (karta AB-1a Pakiet D2 §0 pkt 10): ładunek KAŻDEGO
 * żądania, które frontend wysyła do backendu zgodności — bieg „co-jeśli", certyfikat
 * (JSON/DOCX/PDF), wniosek do OSD (JSON/DOCX/PDF), klasyfikacja modułu, zgodność przypadku
 * i wejścia modułów z modelu (formularz wstępny) —
 * jest walidowany względem `backend/schemas/openapi_snapshot.json` (tej samej migawki, którą
 * pilnuje backend). Reguły: klucze ciała ⊆ `properties` schematu (backend ma
 * `extra="forbid"` → 422), `required` ⊆ klucze, typy i ograniczenia liczbowe pól zgodne ze
 * schematem, rekurencyjnie (moduły → `NcRfgPtpireeModuleInput` → `NastawyZabezpieczenModulu`);
 * parametry zapytania ⊆ `parameters` końcówki, wymagane obecne.
 *
 * Ładunki budują PRODUKCYJNE funkcje (`zbudujModuly`/`zbudujWejscieModulu` na modelu sceny
 * harnessu i wejściach mostu z `GET …/wejscia`, `zbudujZadanieCertyfikatu`,
 * `zbudujZadanieWniosku`) i PRODUKCYJNY klient
 * (`ncrfg/api.ts`); przechwytywany jest wyłącznie `fetch` — granica sieci. Jeden test
 * parametryzowany po końcówkach, nie kopie per końcówka.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import macierzScenyMigawka from '../../../../harness-fixtures/generated/macierz_scena_migawka.json';
import wejsciaSceny from '../../../../harness-fixtures/generated/ncrfg_wejscia_scena_macierz.json';
import { deryZModelu } from '../../../../ui/network-build/station-der';
import type { EnergyNetworkModel } from '../../../../types/enm';
import {
  POLA_ZDOLNOSCI,
  POLA_ZDOLNOSCI_TROJSTANOWYCH,
  zbudujModuly,
  zbudujWejscieModulu,
  zbudujZadanieCertyfikatu,
  type FormularzModulu,
} from '../../macierz/macierzModel';
import { zbudujZadanieWniosku } from '../../wniosek/model';
import {
  klasyfikujModulNcRfg,
  pobierzCertyfikat,
  pobierzPlikCertyfikatu,
  pobierzPlikWniosku,
  pobierzWejsciaPrzypadkuNcRfg,
  pobierzWniosek,
  pobierzZgodnoscPrzypadkuNcRfg,
  uruchomBiegNcRfg,
} from '../api';
import { postDerGeneratorConfig } from '../../../../ui/sld/v2/canvas/derPersistenceApi';
import {
  PUSTE_DANE_MODULU,
  polaNcRfgDoPayloadu,
  zbudujPolaNcRfgGeneratora,
  zmienionePolaNcRfg,
  type FormularzDanychModulu,
} from '../daneModulu';
import { operatorZModelu } from '../operator';
import type { WejsciaPrzypadkuNcRfg, WejscieModuluNcRfg } from '../typy';

// ---------------------------------------------------------------------------
// Migawka OpenAPI i walidator schematu (podzbiór JSON Schema używany przez FastAPI)
// ---------------------------------------------------------------------------

interface Schemat {
  readonly $ref?: string;
  readonly type?: string;
  readonly format?: string;
  readonly anyOf?: readonly Schemat[];
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly properties?: Readonly<Record<string, Schemat>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | Schemat;
  readonly items?: Schemat;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly exclusiveMaximum?: number;
  readonly minLength?: number;
}

interface Parametr {
  readonly name: string;
  readonly in: 'query' | 'path' | 'header' | 'cookie';
  readonly required?: boolean;
}

interface Operacja {
  readonly parameters?: readonly Parametr[];
  readonly requestBody?: { readonly content: Record<string, { readonly schema: Schemat }> };
  readonly responses?: Record<string, { readonly content?: Record<string, { readonly schema: Schemat }> }>;
}

const OPENAPI = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', '..', 'backend', 'schemas', 'openapi_snapshot.json'),
    'utf-8',
  ),
) as {
  readonly paths: Record<string, Record<string, Operacja>>;
  readonly components: { readonly schemas: Record<string, Schemat> };
};

function rozwin(schemat: Schemat): Schemat {
  if (!schemat.$ref) return schemat;
  const nazwa = schemat.$ref.replace('#/components/schemas/', '');
  const cel = OPENAPI.components.schemas[nazwa];
  if (!cel) throw new Error(`brak schematu ${nazwa} w migawce OpenAPI`);
  return cel;
}

const WZORZEC_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Błędy zgodności wartości ze schematem (pusta lista = zgodna). */
function bledySchematu(wartosc: unknown, schematWejsciowy: Schemat, sciezka: string): string[] {
  const schemat = rozwin(schematWejsciowy);
  if (schemat.anyOf) {
    const warianty = schemat.anyOf.map((wariant) => bledySchematu(wartosc, wariant, sciezka));
    return warianty.some((b) => b.length === 0)
      ? []
      : [`${sciezka}: żaden wariant anyOf nie pasuje (${warianty.map((b) => b[0]).join(' | ')})`];
  }
  if (schemat.enum && !schemat.enum.includes(wartosc)) {
    return [`${sciezka}: ${JSON.stringify(wartosc)} spoza enum ${JSON.stringify(schemat.enum)}`];
  }
  if (schemat.const !== undefined && wartosc !== schemat.const) {
    return [`${sciezka}: ${JSON.stringify(wartosc)} ≠ const ${JSON.stringify(schemat.const)}`];
  }
  switch (schemat.type) {
    case 'null':
      return wartosc === null ? [] : [`${sciezka}: oczekiwano null`];
    case 'boolean':
      return typeof wartosc === 'boolean' ? [] : [`${sciezka}: oczekiwano boolean`];
    case 'string': {
      if (typeof wartosc !== 'string') return [`${sciezka}: oczekiwano string`];
      if (schemat.minLength !== undefined && wartosc.length < schemat.minLength) {
        return [`${sciezka}: krótsze niż minLength ${schemat.minLength}`];
      }
      if (schemat.format === 'uuid' && !WZORZEC_UUID.test(wartosc)) {
        return [`${sciezka}: ${wartosc} nie jest UUID`];
      }
      if (schemat.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(wartosc)) {
        return [`${sciezka}: ${wartosc} nie jest datą RRRR-MM-DD`];
      }
      return [];
    }
    case 'number':
    case 'integer': {
      if (typeof wartosc !== 'number' || !Number.isFinite(wartosc)) {
        return [`${sciezka}: oczekiwano liczby skończonej`];
      }
      if (schemat.type === 'integer' && !Number.isInteger(wartosc)) {
        return [`${sciezka}: oczekiwano liczby całkowitej`];
      }
      const bledy: string[] = [];
      if (schemat.exclusiveMinimum !== undefined && !(wartosc > schemat.exclusiveMinimum)) {
        bledy.push(`${sciezka}: ${wartosc} ≤ exclusiveMinimum ${schemat.exclusiveMinimum}`);
      }
      if (schemat.minimum !== undefined && !(wartosc >= schemat.minimum)) {
        bledy.push(`${sciezka}: ${wartosc} < minimum ${schemat.minimum}`);
      }
      if (schemat.maximum !== undefined && !(wartosc <= schemat.maximum)) {
        bledy.push(`${sciezka}: ${wartosc} > maximum ${schemat.maximum}`);
      }
      if (schemat.exclusiveMaximum !== undefined && !(wartosc < schemat.exclusiveMaximum)) {
        bledy.push(`${sciezka}: ${wartosc} ≥ exclusiveMaximum ${schemat.exclusiveMaximum}`);
      }
      return bledy;
    }
    case 'array': {
      if (!Array.isArray(wartosc)) return [`${sciezka}: oczekiwano tablicy`];
      return schemat.items
        ? wartosc.flatMap((element, i) => bledySchematu(element, schemat.items as Schemat, `${sciezka}[${i}]`))
        : [];
    }
    case 'object':
    default: {
      if (!schemat.properties) return [];
      if (typeof wartosc !== 'object' || wartosc === null || Array.isArray(wartosc)) {
        return [`${sciezka}: oczekiwano obiektu`];
      }
      const obiekt = wartosc as Record<string, unknown>;
      const bledy: string[] = [];
      for (const klucz of Object.keys(obiekt)) {
        const podschemat = schemat.properties[klucz];
        if (!podschemat) {
          if (schemat.additionalProperties !== true) bledy.push(`${sciezka}.${klucz}: pole spoza schematu`);
          continue;
        }
        bledy.push(...bledySchematu(obiekt[klucz], podschemat, `${sciezka}.${klucz}`));
      }
      for (const wymagane of schemat.required ?? []) {
        if (!(wymagane in obiekt)) bledy.push(`${sciezka}.${wymagane}: brak pola wymaganego`);
      }
      return bledy;
    }
  }
}

/** Dopasowanie ścieżki żądania do szablonu ścieżki OpenAPI (`{parametr}`). */
function operacjaDla(sciezka: string, metoda: string): { szablon: string; operacja: Operacja } {
  for (const [szablon, metody] of Object.entries(OPENAPI.paths)) {
    const wzorzec = new RegExp(`^${szablon.replace(/[.]/g, '\\.').replace(/\{[^}]+\}/g, '[^/]+')}$`);
    if (wzorzec.test(sciezka) && metody[metoda]) return { szablon, operacja: metody[metoda] };
  }
  throw new Error(`końcówki ${metoda.toUpperCase()} ${sciezka} nie ma w migawce OpenAPI`);
}

// ---------------------------------------------------------------------------
// Przechwycenie żądań na granicy sieci
// ---------------------------------------------------------------------------

interface Przechwycone {
  readonly url: string;
  readonly metoda: string;
  readonly cialo: unknown;
}

function przechwycFetch(odpowiedz: () => Response): Przechwycone[] {
  const zadania: Przechwycone[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      zadania.push({
        url,
        metoda: (init?.method ?? 'GET').toLowerCase(),
        cialo: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return odpowiedz();
    }),
  );
  return zadania;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Ładunki z produkcyjnych budowniczych
// ---------------------------------------------------------------------------

const DERY_SCENY = deryZModelu(macierzScenyMigawka as unknown as EnergyNetworkModel, 'proj-demo');
const OPERATOR_SCENY = (() => {
  const zModelu = operatorZModelu(DERY_SCENY);
  if (zModelu.rodzaj !== 'z_modelu') throw new Error('scena bez jednoznacznego operatora');
  return zModelu.operatorId;
})();

/** Formularz „co-jeśli" z KAŻDYM polem wypełnionym (art. 4, T12, nastawy, zdolności). */
function formularzPelny(bazowy: FormularzModulu): FormularzModulu {
  return {
    ...bazowy,
    zdolnosci: Object.fromEntries(
      Object.keys(bazowy.zdolnosci).map((pole) => [pole, true]),
    ) as FormularzModulu['zdolnosci'],
    liczby: {
      p_min_kw: '10',
      droop_percent: '5',
      dead_band_hz: '0,2',
      ramp_rate_pct_per_min: '10',
      cos_phi_min: '0,9',
      q_range_pct_pn_min: '-0,33',
      q_range_pct_pn_max: '0,33',
      reactive_current_gain: '2',
      p_recovery_time_s: '1',
      harmonic_thdu_percent: '3',
      cease_generation_time_s: '5',
    },
    modulIstniejacy: 'nie',
    dataUmowy: '2026-03-01',
    nastawy: {
      wartosci: {
        u_min_pu: '0,8',
        u_min_czas_s: '1,5',
        u_max_pu: '1,1',
        u_max_czas_s: '0,2',
        f_min_hz: '47,5',
        f_min_czas_s: '0,5',
        f_max_hz: '51,5',
        f_max_czas_s: '0,5',
        rocof_hz_s: '2',
        rocof_czas_s: '0,5',
        przesuniecie_fazy_deg: '12',
      },
      zrodlo: 'karta nastaw zabezpieczenia pola',
    },
  };
}

function modulyZFormularzem(pelny: boolean): WejscieModuluNcRfg[] {
  return zbudujModuly(DERY_SCENY, wejsciaSceny as unknown as WejsciaPrzypadkuNcRfg).map((opis) => {
    const wynik = zbudujWejscieModulu(
      pelny ? { ...opis, formularz: formularzPelny(opis.formularz) } : opis,
      OPERATOR_SCENY,
    );
    if (wynik.stan !== 'ok') throw new Error(`moduł ${opis.derRef}: ${JSON.stringify(wynik)}`);
    return wynik.wejscie;
  });
}

const ZADANIE_CERTYFIKATU = zbudujZadanieCertyfikatu({
  nazwaProjektu: 'Przyłączenie farmy PV 8 MW',
  nazwaPrzypadku: 'Stan normalny',
  operatorId: OPERATOR_SCENY,
  nazwaZastepcza: 'Projekt bez nazwy',
});

const ZADANIE_WNIOSKU = zbudujZadanieWniosku({
  pfRunId: '0f7c3b1e-6a5d-5f3b-9c1e-3e1b7a2d4c50',
  scRunId: '1a2b3c4d-5e6f-5a7b-8c9d-0e1f2a3b4c5d',
  busRef: 'gpz/szyna-sn',
  identyfikacja: {
    nazwaProjektu: 'Przyłączenie farmy PV 8 MW',
    nazwaPrzypadku: '',
    wnioskodawca: 'Inwestor sp. z o.o.',
    adres: '',
  },
  operatorId: OPERATOR_SCENY,
});

/**
 * Dane modułu NC RfG z KAŻDYM polem wypełnionym (art. 4, data umowy, 11 nastaw ze źródłem,
 * 11 flag deklaracji we wszystkich trzech stanach, 6 liczb deklaracji ze źródłem) — ładunek
 * pisarzy wytwórcy (`POST …/generators`, `add_converter_source`, `update_element_parameters`).
 */
const DANE_MODULU_PELNE: FormularzDanychModulu = {
  ...PUSTE_DANE_MODULU,
  modulIstniejacy: 'nie',
  dataUmowy: '2025-05-12',
  nastawy: {
    wartosci: {
      u_min_pu: '0,8',
      u_min_czas_s: '1,5',
      u_max_pu: '1,15',
      u_max_czas_s: '0,2',
      f_min_hz: '47,5',
      f_min_czas_s: '0,5',
      f_max_hz: '52',
      f_max_czas_s: '0,5',
      rocof_hz_s: '2',
      rocof_czas_s: '0,5',
      przesuniecie_fazy_deg: '12',
    },
    zrodlo: 'karta nastaw zabezpieczenia modułu',
  },
  flagi: {
    ...PUSTE_DANE_MODULU.flagi,
    has_scada_communication: 'tak',
    has_disturbance_recorder: 'nie',
    island_operation_required: 'tak',
  },
  liczby: {
    p_min_kw: '10',
    ramp_rate_pct_per_min: '10',
    reactive_current_gain: '2',
    p_recovery_time_s: '1',
    harmonic_thdu_percent: '3',
    cease_generation_time_s: '5',
  },
  zrodloDeklaracji: 'karta katalogowa falownika',
};

const OK_JSON = () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });

const PRZYPADKI: readonly {
  readonly nazwa: string;
  readonly wywolaj: () => Promise<unknown>;
  readonly schematCiala: string | null;
}[] = [
  {
    nazwa: 'bieg „co-jeśli" — formularz wstępny (pola puste = null)',
    wywolaj: () => uruchomBiegNcRfg({ modules: modulyZFormularzem(false) }),
    schematCiala: 'NcRfgPtpireeRunRequest',
  },
  {
    nazwa: 'bieg „co-jeśli" — formularz pełny (art. 4, T12, nastawy, zdolności)',
    wywolaj: () => uruchomBiegNcRfg({ modules: modulyZFormularzem(true) }),
    schematCiala: 'NcRfgPtpireeRunRequest',
  },
  {
    nazwa: 'certyfikat — widok JSON',
    wywolaj: () => pobierzCertyfikat(ZADANIE_CERTYFIKATU, 'case-demo'),
    schematCiala: 'CertyfikatZgodnosciRequest',
  },
  {
    nazwa: 'certyfikat — DOCX',
    wywolaj: () => pobierzPlikCertyfikatu(ZADANIE_CERTYFIKATU, 'case-demo', 'docx'),
    schematCiala: 'CertyfikatZgodnosciRequest',
  },
  {
    nazwa: 'certyfikat — PDF',
    wywolaj: () => pobierzPlikCertyfikatu(ZADANIE_CERTYFIKATU, 'case-demo', 'pdf'),
    schematCiala: 'CertyfikatZgodnosciRequest',
  },
  {
    nazwa: 'wniosek do OSD — widok JSON',
    wywolaj: () => pobierzWniosek(ZADANIE_WNIOSKU, 'case-demo'),
    schematCiala: 'WniosekOsdRequest',
  },
  {
    nazwa: 'wniosek do OSD — DOCX',
    wywolaj: () => pobierzPlikWniosku(ZADANIE_WNIOSKU, 'case-demo', 'docx'),
    schematCiala: 'WniosekOsdRequest',
  },
  {
    nazwa: 'wniosek do OSD — PDF',
    wywolaj: () => pobierzPlikWniosku(ZADANIE_WNIOSKU, 'case-demo', 'pdf'),
    schematCiala: 'WniosekOsdRequest',
  },
  {
    nazwa: 'wytwórca DER z danymi modułu NC RfG (POST …/generators)',
    wywolaj: () =>
      postDerGeneratorConfig('projekt-demo', 'case-demo', {
        station_ref: 'stacja-1',
        der_kind: 'PV',
        power_mw: 1,
        connection_variant: 'nn_side',
        catalog_ref: 'conv-pv-1mw-15kv',
        nc_rfg_module: null,
        ...polaNcRfgDoPayloadu(DANE_MODULU_PELNE),
      }),
    schematCiala: 'DerGeneratorCreateRequest',
  },
  {
    nazwa: 'klasyfikacja modułu (/modul)',
    wywolaj: () => klasyfikujModulNcRfg({ pMaxKw: 1935, napiecieKv: 15 }),
    schematCiala: null,
  },
  {
    nazwa: 'zgodność przypadku (/cases/{id}/compliance)',
    wywolaj: () => pobierzZgodnoscPrzypadkuNcRfg('case-demo', OPERATOR_SCENY),
    schematCiala: null,
  },
  {
    nazwa: 'wejścia modułów z modelu — formularz wstępny (/cases/{id}/wejscia)',
    wywolaj: () => pobierzWejsciaPrzypadkuNcRfg('case-demo', OPERATOR_SCENY),
    schematCiala: null,
  },
];

describe('żądania zgodności NC RfG ⊆ migawka OpenAPI backendu', () => {
  it.each(PRZYPADKI)('$nazwa', async ({ wywolaj, schematCiala }) => {
    const zadania = przechwycFetch(OK_JSON);
    await wywolaj();
    expect(zadania).toHaveLength(1);
    const [{ url, metoda, cialo }] = zadania;
    const adres = new URL(url, 'http://localhost');
    const { szablon, operacja } = operacjaDla(adres.pathname, metoda);

    // Parametry zapytania: ⊆ parametry końcówki, wymagane obecne.
    const dozwolone = new Set(
      (operacja.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name),
    );
    for (const klucz of adres.searchParams.keys()) {
      expect(dozwolone, `${szablon}: parametr ${klucz} spoza migawki`).toContain(klucz);
    }
    for (const parametr of operacja.parameters ?? []) {
      if (parametr.in === 'query' && parametr.required) {
        expect(adres.searchParams.has(parametr.name), `${szablon}: brak ${parametr.name}`).toBe(true);
      }
    }

    // Ciało: dokładnie schemat żądania końcówki (klucze, wymagane, typy, ograniczenia).
    const schemat = operacja.requestBody?.content['application/json']?.schema;
    if (schematCiala === null) {
      expect(schemat, `${szablon}: końcówka nie przyjmuje ciała`).toBeUndefined();
      expect(cialo).toBeUndefined();
      return;
    }
    expect(schemat?.$ref).toBe(`#/components/schemas/${schematCiala}`);
    expect(bledySchematu(cialo, schemat as Schemat, '$')).toEqual([]);
  });

  it('bloki NC RfG pisarzy operacji domenowych (add_converter_source, update_element_parameters) ⊆ schematy modelu', () => {
    // Koperta operacji domenowej ma `payload` bez schematu pól — bloki danych modułu
    // sprawdzane wprost względem schematów modelu (`DeklaracjeModulu`,
    // `NastawyZabezpieczenModulu`), a skalary względem pól `DerGeneratorCreateRequest`
    // (ten sam walidator backendu dla wszystkich nośników).
    const wynik = zbudujPolaNcRfgGeneratora(DANE_MODULU_PELNE);
    expect(wynik.stan).toBe('ok');
    if (wynik.stan !== 'ok') return;
    const nowy = polaNcRfgDoPayloadu(DANE_MODULU_PELNE);
    const edycja = zmienionePolaNcRfg(wynik.pola, {
      modul_istniejacy: null,
      data_umowy_przylaczeniowej: null,
      nastawy_zabezpieczen: null,
      deklaracje_modulu: null,
    });
    const zadanieGeneratora = OPENAPI.components.schemas.DerGeneratorCreateRequest as Schemat;
    for (const pola of [nowy, edycja]) {
      expect(Object.keys(pola).sort()).toEqual([
        'data_umowy_przylaczeniowej',
        'deklaracje_modulu',
        'modul_istniejacy',
        'nastawy_zabezpieczen',
      ]);
      for (const [pole, wartosc] of Object.entries(pola)) {
        const schemat = zadanieGeneratora.properties?.[pole];
        expect(schemat, pole).toBeDefined();
        expect(bledySchematu(wartosc, schemat as Schemat, `$.${pole}`)).toEqual([]);
      }
    }
    // Deklaracja „nie zadeklarowano" to `null` w bloku (nigdy `false`).
    expect(nowy.deklaracje_modulu?.active_power_control_enabled).toBeNull();
    expect(nowy.deklaracje_modulu?.has_disturbance_recorder).toBe(false);
  });

  it('odpowiedź `GET …/wejscia` (fixtura sceny liczona backendem) = schemat odpowiedzi końcówki; moduły = schemat wejścia biegu', () => {
    // Para z jednego źródła: formularz wstępny ekranu czyta tę odpowiedź, a moduły wracają
    // bez zmian w ciele `POST /run` — oba kształty z tej samej migawki OpenAPI.
    const { operacja } = operacjaDla('/api/ncrfg-tests/cases/case-demo/wejscia', 'get');
    const schemat = operacja.responses?.['200']?.content?.['application/json']?.schema;
    expect(schemat?.$ref).toBe('#/components/schemas/NcRfgWejsciaPrzypadkuResponse');
    expect(bledySchematu(wejsciaSceny, schemat as Schemat, '$')).toEqual([]);
    const wejscie = { $ref: '#/components/schemas/NcRfgPtpireeModuleInput' };
    for (const [i, modul] of (wejsciaSceny as unknown as WejsciaPrzypadkuNcRfg).modules.entries()) {
      expect(bledySchematu(modul, wejscie, `$.modules[${i}]`)).toEqual([]);
    }
  });

  it('zdolności trójstanowe formularza „co-jeśli" = DOKŁADNIE pola `bool | null` wejścia modułu (para z jednego źródła)', () => {
    const wejscie = OPENAPI.components.schemas.NcRfgPtpireeModuleInput as Schemat;
    const trojstanowe = POLA_ZDOLNOSCI.filter((pole) => {
      const schemat = wejscie.properties?.[pole];
      const typy = (schemat?.anyOf ?? [schemat]).map((s) => s?.type);
      return typy.includes('boolean') && typy.includes('null');
    });
    expect([...POLA_ZDOLNOSCI_TROJSTANOWYCH].sort()).toEqual([...trojstanowe].sort());
    // Pozostałe zdolności: ściśle logiczne (wymagania programu badań, krzywe z wiązań).
    for (const pole of POLA_ZDOLNOSCI.filter((p) => !trojstanowe.includes(p))) {
      expect(wejscie.properties?.[pole]?.type, pole).toBe('boolean');
    }
  });

  it('walidator sam wykrywa pole spoza schematu, brak wymaganego i wartość spoza ograniczenia', () => {
    // Samotest walidatora — bez niego „zero błędów" mogłoby znaczyć „walidator nic nie sprawdza".
    const schemat = { $ref: '#/components/schemas/NcRfgPtpireeRunRequest' };
    const [modul] = modulyZFormularzem(true);
    expect(bledySchematu({ modules: [modul], procedure_version: 'x' }, schemat, '$')).toEqual([
      '$.procedure_version: pole spoza schematu',
    ]);
    const { operator_id: _pominiety, ...bezOperatora } = modul;
    expect(bledySchematu({ modules: [bezOperatora] }, schemat, '$')).toEqual([
      '$.modules[0].operator_id: brak pola wymaganego',
    ]);
    expect(
      // Pole spoza kontraktu V2 (np. dawny status certyfikatu przysyłany przez klienta) — odrzucone.
      bledySchematu({ modules: [{ ...modul, cos_phi_min: 1.2, pole_spoza_kontraktu: 'x' }] }, schemat, '$'),
    ).toEqual([
      '$.modules[0].cos_phi_min: żaden wariant anyOf nie pasuje ($.modules[0].cos_phi_min: 1.2 > maximum 1 | $.modules[0].cos_phi_min: oczekiwano null)',
      '$.modules[0].pole_spoza_kontraktu: pole spoza schematu',
    ]);
  });
});
