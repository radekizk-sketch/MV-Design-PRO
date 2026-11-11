/**
 * Klient topologii zasilenia (karta K6a): kształt typów PRZYPIĘTY do kontraktu backendu
 * (`backend/schemas/openapi_snapshot.json`, modele `application/topologia_zasilenia.py`)
 * — klucze każdego modelu i literały stanów; adres i parametry zapytań; odrzucenie odpowiedzi
 * o innej podstawie niż topologia łączeniowa albo bez pól kontraktu; błąd 404 z `detail`.
 * Snapshot regeneruje `backend/scripts/generuj_snapshot_openapi.py`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BladTopologiiZasilenia,
  KLUCZE_KONTRAKTU,
  PODSTAWA_TOPOLOGII,
  RODZAJE_ELEMENTU_TOPOLOGII,
  STANY_LACZNIKA,
  STANY_ZASILENIA,
  STATUSY_TORU,
  pobierzStanZasilenia,
  pobierzTorElementu,
  type TorElementuOdpowiedz,
} from '../topologiaZasilenia';

type Schemat = {
  properties?: Record<string, Schemat>;
  enum?: unknown[];
  const?: unknown;
  anyOf?: Schemat[];
  $ref?: string;
};
type Snapshot = {
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, Schemat> };
};

const SNAPSHOT_PATH = resolve(__dirname, '../../../../../backend/schemas/openapi_snapshot.json');
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot;
const schematy = snapshot.components.schemas;

function literaly(schemat: Schemat): unknown[] {
  if (schemat.enum) return schemat.enum;
  if (schemat.const !== undefined) return [schemat.const];
  const wariant = schemat.anyOf?.find((w) => w.enum);
  if (wariant?.enum) return wariant.enum;
  throw new Error(`schemat bez literałów: ${JSON.stringify(schemat).slice(0, 200)}`);
}

/** Odpowiedź toru w kształcie zwróconym przez backend dla sieci promieniowej (odbiór L_B). */
function odpowiedzToru(nadpisz: Partial<TorElementuOdpowiedz> = {}): TorElementuOdpowiedz {
  return {
    case_id: 'c-1',
    enm_revision: 3,
    enm_hash: 'abc',
    podstawa: PODSTAWA_TOPOLOGII,
    opis_podstawy: 'Zasilenie wyznaczone z topologii łączeniowej modelu sieci…',
    element: { ref_id: 'L_B', rodzaj: 'odbior', typ: null, nazwa: 'Odbiór B' },
    stan: 'zasilany',
    status: 'rozstrzygniety',
    przyczyny: [],
    drogi: [
      {
        zrodlo_ref: 'S1',
        pewna: true,
        laczniki_nieustalone: [],
        elementy: [
          {
            ref_id: 'S1',
            rodzaj: 'zrodlo',
            typ: null,
            nazwa: 'Sieć 1',
            stan_lacznika: null,
            pole_ref: null,
            stacja_ref: null,
          },
        ],
      },
    ],
    drogi_obciete: false,
    sasiedztwo: {
      kierunek_ustalony: true,
      poprzednie: [{ ref_id: 'B_NN', rodzaj: 'szyna', typ: null, nazwa: 'Szyna nN B' }],
      nastepne: [],
      pola_wejsciowe: [{ ref_id: 'B_TR', rodzaj: 'pole', typ: 'TR', nazwa: 'Pole TR B' }],
      pola_wyjsciowe: [],
      pole: null,
      stacja: { ref_id: 'ST_B', rodzaj: 'stacja', typ: 'mv_lv', nazwa: 'Stacja B' },
      przekladniki: [],
      zabezpieczenia: [],
    },
    ...nadpisz,
  };
}

function odpowiedzHttp(status: number, cialo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'OK',
    json: () => Promise.resolve(cialo),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('kontrakt topologii zasilenia = OpenAPI backendu (K6a)', () => {
  it('obie ścieżki są w snapshotcie jako GET', () => {
    expect(snapshot.paths['/api/cases/{case_id}/enm/topologia/zasilenie']).toHaveProperty('get');
    expect(snapshot.paths['/api/cases/{case_id}/enm/topologia/tor']).toHaveProperty('get');
  });

  it.each(Object.entries(KLUCZE_KONTRAKTU))('klucze modelu %s', (nazwa, klucze) => {
    const schemat = schematy[nazwa];
    expect(schemat, `brak schematu ${nazwa}`).toBeDefined();
    expect([...klucze].sort()).toEqual(Object.keys(schemat.properties ?? {}).sort());
  });

  it('literały stanów, rodzajów i statusów', () => {
    const element = schematy.StanZasileniaElementu.properties ?? {};
    expect([...STANY_ZASILENIA]).toEqual(literaly(element.stan));
    expect([...STANY_LACZNIKA]).toEqual(literaly(element.stan_lacznika));
    expect([...RODZAJE_ELEMENTU_TOPOLOGII]).toEqual(literaly(element.rodzaj));
    expect([...STATUSY_TORU]).toEqual(
      literaly((schematy.TorElementuOdpowiedz.properties ?? {}).status),
    );
    expect(literaly((schematy.StanZasileniaOdpowiedz.properties ?? {}).podstawa)).toEqual([
      PODSTAWA_TOPOLOGII,
    ]);
  });
});

describe('pobieranie stanu zasilenia i toru', () => {
  it('tor: adres z zakodowanym identyfikatorem przypadku i elementu', async () => {
    const fetchMock = vi.fn().mockResolvedValue(odpowiedzHttp(200, odpowiedzToru()));
    vi.stubGlobal('fetch', fetchMock);
    const tor = await pobierzTorElementu('c 1', 'pole 23/1');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cases/c%201/enm/topologia/tor?element_ref=pole+23%2F1',
    );
    expect(tor.sasiedztwo.pola_wejsciowe[0].ref_id).toBe('B_TR');
  });

  it('stan zasilenia: adres i odpowiedź przekazana bez zmian', async () => {
    const cialo = {
      case_id: 'c-1',
      enm_revision: 1,
      enm_hash: '',
      podstawa: PODSTAWA_TOPOLOGII,
      opis_podstawy: 'x',
      elementy: [],
      wyspy: [],
      laczniki_otwarte: [],
      galezie_otwarte: [],
      laczniki_nieustalone: [],
      krawedzie_pominiete: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(odpowiedzHttp(200, cialo));
    vi.stubGlobal('fetch', fetchMock);
    await expect(pobierzStanZasilenia('c-1')).resolves.toEqual(cialo);
    expect(fetchMock).toHaveBeenCalledWith('/api/cases/c-1/enm/topologia/zasilenie');
  });

  it('odrzuca odpowiedź o podstawie innej niż topologia łączeniowa', async () => {
    const cialo = { ...odpowiedzToru(), podstawa: 'wynik_rozplywu' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedzHttp(200, cialo)));
    await expect(pobierzTorElementu('c-1', 'L_B')).rejects.toBeInstanceOf(BladTopologiiZasilenia);
  });

  it('odrzuca odpowiedź bez pól kontraktu', async () => {
    const { sasiedztwo: _pominiete, ...cialo } = odpowiedzToru();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedzHttp(200, cialo)));
    await expect(pobierzTorElementu('c-1', 'L_B')).rejects.toThrow(BladTopologiiZasilenia);
  });

  it('404 z treścią detail backendu', async () => {
    const detail = { detail: "Element 'X' nie istnieje w modelu sieci" };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedzHttp(404, detail)));
    const blad = await pobierzTorElementu('c-1', 'X').catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(BladTopologiiZasilenia);
    expect((blad as BladTopologiiZasilenia).status).toBe(404);
    expect((blad as BladTopologiiZasilenia).szczegoly).toEqual(detail);
  });
});
