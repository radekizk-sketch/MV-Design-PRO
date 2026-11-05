/**
 * Sieć ze stacją SN/nN i sterownikiem pola z nastawami — wspólny seed speców ogniwa
 * „wynik zwarciowy → aparatura pola" i wyboru zabezpieczeń przypadku (wydzielony z
 * `ogniwo-zwarcie-aparatura.spec.ts`, żeby drugi spec nie kopiował budowy sieci).
 *
 * Wszystko REALNĄ ścieżką backendu: operacje domenowe, nastawy jedynym pisarzem
 * (`update_protection_settings`), bieg zwarciowy SC_3F do stanu DONE.
 */
import { expect, type APIRequestContext } from '@playwright/test';
import { wykonajBiegDoKonca } from './biegi';
import { transformatoryStacjiSnNn } from './transformatoryStacji';

export const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
export const CABLE_ID = 'cable-tfk-yakxs-3x120';
export const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
export const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
export const CATALOG_VERSION = '2024.1';
/** Przekładnik prądowy i urządzenie zabezpieczeniowe pola wejściowego (katalog backendu). */
export const CT_ID = 'ct_400_5_5p20_15va_abb';
export const PRZEKAZNIK_ID = 'REF-OC-100';
/** Zwłoka członu I> (51, DT) zapisana w sterowniku pola — źródło czasu wyłączenia tk. */
export const ZWLOKA_51_S = 0.3;

let opCounter = 0;

export type DomainOpResponse = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    branches?: Array<{ ref_id: string; type?: string }>;
    transformers?: Array<{ ref_id: string; lv_bus_ref?: string }>;
    buses?: Array<{ ref_id: string; voltage_kv?: number }>;
    substations?: Array<{ ref_id: string; bus_refs?: string[] }>;
    bays?: Array<{ ref_id: string; substation_ref?: string | null; bay_role?: string }>;
    protection_assignments?: Array<{ ref_id: string; bay_ref?: string | null }>;
  };
};

export type PradyPola = {
  punkt_ref: string | null;
  ik_ka: number | null;
  ip_ka: number | null;
  ith_ka: number | null;
  ib_ka: number | null;
};

export type WidokWytrzymalosci = {
  status: string;
  bieg_zwarciowy_ref: string;
  pola: Array<{
    pole: string;
    pole_ref: string | null;
    zrodlo: 'model' | 'konfiguracja';
    komunikat_pl: string;
    prady_pola: PradyPola;
    /** Ślad I_th przy czasie wyłączenia pola (``solvers.wytrzymalosc_cieplna_pola``). */
    prad_cieplny_pola: {
      ith_ka: number | null;
      ith_biegu_ka: number | null;
      tk_pola_s: number | null;
      tk_biegu_s: number | null;
      kappa: number | null;
      powod_pl: string | null;
    };
    oceny: Array<{
      kryterium_id: string;
      status_maszynowy: string;
      wynik: { wartosc: { wartosc: number; jednostka: string } } | null;
    }>;
    czas_wylaczenia: {
      zrodlo: string | null;
      t_clearing_s: number | null;
      czlon_nastawczy_s: number | null;
      czas_wlasny_wylacznika_s: number | null;
    };
  }>;
};

export type WierszZwarcia = {
  target_id: string;
  element_id?: string;
  target_name?: string | null;
  ikss_ka?: number | null;
  ip_ka: number | null;
  ith_ka: number | null;
  ib_ka?: number | null;
};

export function catalogBinding(namespace: string, itemId: string) {
  return {
    catalog_namespace: namespace,
    catalog_item_id: itemId,
    catalog_item_version: CATALOG_VERSION,
  };
}

export async function domainOp(
  request: APIRequestContext,
  caseId: string,
  name: string,
  payload: Record<string, unknown>,
): Promise<DomainOpResponse> {
  const response = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: {
        name,
        idempotency_key: `e2e-ogniwo-${name}-${String(++opCounter).padStart(4, '0')}`,
        payload,
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as DomainOpResponse;
  expect(body.error ?? null).toBeNull();
  return body;
}

export type Kontekst = {
  project: { id: string; name: string };
  studyCase: { id: string; name: string };
  stationRef: string;
  busRefy: string[];
  /** Pole wejściowe z przekładnikiem i sterownikiem z nastawami (gdy zbudowane z zabezpieczeniem). */
  poleZabezpieczoneRef: string | null;
};

/** Projekt + przypadek + sieć ze stacją (aparat pola WSKAZANY z katalogu APARAT_SN). */
export async function zbudujProjektZeStacja(
  request: APIRequestContext,
  opis: string,
  zZabezpieczeniem = false,
): Promise<Kontekst> {
  const znacznik = String(Date.now());
  const projectResponse = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: {
      name: `Ogniwo aparatura ${znacznik}`,
      description: opis,
      mode: 'TO-BE',
      voltage_level_kv: 15.0,
      frequency_hz: 50.0,
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string; name: string };

  const caseResponse = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: {
      project_id: project.id,
      name: `Przypadek ogniwa ${znacznik}`,
      description: '',
      config: {},
      set_active: true,
    },
  });
  expect(caseResponse.ok()).toBeTruthy();
  const studyCase = (await caseResponse.json()) as { id: string; name: string };

  await domainOp(request, studyCase.id, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: catalogBinding('ZRODLO_SN', SOURCE_ID),
  });

  let op: DomainOpResponse = {};
  for (const [idx, length] of [300, 250].entries()) {
    op = await domainOp(request, studyCase.id, 'continue_trunk_segment_sn', {
      segment: {
        rodzaj: 'KABEL',
        dlugosc_m: length,
        name: `Odcinek ${idx + 1}`,
        catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
      },
    });
  }
  const segmentRefs = op.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(segmentRefs.length).toBeGreaterThan(0);

  op = await domainOp(request, studyCase.id, 'insert_station_on_segment_sn', {
    // Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: tolerancja sieci nN (wiersz nN tabeli 1 IEC 60909-0).
    nn_earthing: { lv_voltage_tolerance: 'PLUS_10' },
    field_apparatus_catalog_ref: 'sw-cb-abb-vd4-17kv-630a',
    segment_id: segmentRefs[segmentRefs.length - 1],
    station_type: 'B',
    insert_at: { value: 0.5 },
    station: { sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
    // KOMPLETNOSC-POLA-TR (klasa A): stacja SN/nN Z transformatorem — pole roli
    // 'TR' dopisane, bo realna rozdzielnia realizuje odejscie do transformatora
    // polem transformatorowym. Kreator stacji tworzy je domyslnie, wiec fixture
    // bez niego opisywal siec, ktorej kreator by nie zbudowal.
    sn_fields: [
      zZabezpieczeniem
        ? {
            field_role: 'LINIA_IN',
            equipment: {
              ct: { catalog_binding: catalogBinding('CT', CT_ID), ratio_primary_a: 400.0, ratio_secondary_a: 5.0 },
              relay: { catalog_binding: catalogBinding('ZABEZPIECZENIE', PRZEKAZNIK_ID), relay_type: 'NADPRADOWY' },
            },
          }
        : 'IN',
      'OUT',
      'TR',
    ],
    transformer: { create: true, catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID) },
  });

  const stacja = (op.snapshot?.substations ?? []).find((s) => s.ref_id.includes('/station'));
  expect(stacja?.ref_id).toBeTruthy();
  const stationRef = stacja!.ref_id;
  const busRefy = stacja!.bus_refs ?? [];
  expect(busRefy.length).toBeGreaterThan(0);

  // Nastawy JEDYNYM pisarzem konfiguracji sterownika (`update_protection_settings`): człon I>
  // (51) DT 400 A strony pierwotnej, zwłoka 0,3 s; I>> (50) z szablonu wyłączony przez
  // projektanta. To jest jedyne źródło czasu wyłączenia tk oceny wytrzymałości cieplnej.
  let poleZabezpieczoneRef: string | null = null;
  if (zZabezpieczeniem) {
    const poleIn = (op.snapshot?.bays ?? []).find(
      (b) => b.substation_ref === stationRef && b.bay_role === 'IN',
    );
    expect(poleIn, 'pole wejściowe stacji').toBeTruthy();
    const sterownik = (op.snapshot?.protection_assignments ?? []).find(
      (p) => p.bay_ref === poleIn!.ref_id,
    );
    expect(sterownik, 'sterownik pola wejściowego').toBeTruthy();
    await domainOp(request, studyCase.id, 'update_protection_settings', {
      protection_ref: sterownik!.ref_id,
      nastawy: {
        '51': { prog: 400.0, jednostka_progu: 'A_PIERWOTNY', krzywa: 'DT', zwloka_s: ZWLOKA_51_S },
      },
      wlaczone: { '50': false },
    });
    poleZabezpieczoneRef = poleIn!.ref_id;
  }

  // Katalogi gałęzi/transformatorów (żeby bieg był policzalny). Kategoria
  // katalogu MUSI pasować do rodzaju gałęzi — pozycję KABEL_SN dostają
  // wyłącznie odcinki liniowe. Wcześniej ta pętla przypisywała kabel TAKŻE
  // aparatom pól, kasując po cichu ich wiązanie APARAT_SN (defekt zastany
  // naprawiony u źródła w karcie KD-6: `catalog.namespace_mismatch`).
  const odcinki = (op.snapshot?.branches ?? []).filter(
    (branch) => branch.type === 'cable' || branch.type === 'line_overhead',
  );
  expect(odcinki.length, 'Sieć musi mieć odcinki liniowe do policzenia biegu').toBeGreaterThan(0);
  for (const branch of odcinki) {
    await domainOp(request, studyCase.id, 'assign_catalog_to_element', {
      element_ref: branch.ref_id,
      catalog_binding: catalogBinding('KABEL_SN', CABLE_ID),
    });
  }
  // Pozycja TRAFO_SN_NN i dane 15/0,4 kV WYŁĄCZNIE dla transformatora stacji SN/nN — nie dla
  // transformatora GPZ 110/15 kV (jedna reguła: `transformatoryStacji.ts`, walidator E023).
  for (const transformer of transformatoryStacjiSnNn(op.snapshot)) {
    await domainOp(request, studyCase.id, 'assign_catalog_to_element', {
      element_ref: transformer.ref_id,
      catalog_binding: catalogBinding('TRAFO_SN_NN', TRAFO_ID),
    });
    await domainOp(request, studyCase.id, 'update_element_parameters', {
      element_ref: transformer.ref_id,
      parameters: {
        sn_mva: 0.63,
        uhv_kv: 15.0,
        ulv_kv: 0.4,
        uk_percent: 4.0,
        pk_kw: 6.5,
        vector_group: 'Dyn5',
        parameter_source: 'CATALOG',
      },
    });
  }

  return { project, studyCase, stationRef, busRefy, poleZabezpieczoneRef };
}

/** Bieg zwarciowy przypadku + wiersz punktu leżącego na szynie stacji. */
export async function policzZwarcie(
  request: APIRequestContext,
  kontekst: Kontekst,
): Promise<{ runId: string; punkt: WierszZwarcia; wiersze: WierszZwarcia[] }> {
  const createRun = await request.post(
    `${BACKEND_BASE}/api/execution/study-cases/${kontekst.studyCase.id}/runs`,
    { data: { analysis_type: 'SC_3F' } },
  );
  expect(createRun.ok()).toBeTruthy();
  const run = (await createRun.json()) as { id: string };
  // Karta DYNAMIKA-W-TLE: `execute` zleca bieg w tle (202); gotowość = stan DONE
  // biegu (`biegi.ts`), nie 200 z `results/index` (ten jest 200 także w toku).
  await wykonajBiegDoKonca(request, BACKEND_BASE, run.id);

  const wynikResponse = await request.get(
    `${BACKEND_BASE}/api/analysis-runs/${run.id}/results/short-circuit`,
  );
  expect(wynikResponse.ok()).toBeTruthy();
  const wynik = (await wynikResponse.json()) as { rows: WierszZwarcia[] };
  const wiersze = wynik.rows.filter((r) => r.ip_ka !== null && r.ith_ka !== null);
  expect(wiersze.length).toBeGreaterThan(0);

  const punkt = wiersze.find((r) => kontekst.busRefy.includes(r.element_id ?? r.target_id));
  expect(
    punkt,
    'Wynik biegu musi zawierać punkt zwarcia leżący na szynie badanej stacji.',
  ).toBeTruthy();
  return { runId: run.id, punkt: punkt!, wiersze: wynik.rows };
}

/** Widok wytrzymałości stacji dla zapisanego biegu (kontrakt: bieg, nie liczby). */
export async function widokZBiegu(
  request: APIRequestContext,
  kontekst: Kontekst,
  runId: string,
): Promise<WidokWytrzymalosci> {
  const odpowiedz = await request.post(
    `${BACKEND_BASE}/api/cases/${kontekst.studyCase.id}/enm/wytrzymalosc-aparatury`,
    { data: { station_ref: kontekst.stationRef, short_circuit_run_id: runId } },
  );
  expect(odpowiedz.ok()).toBeTruthy();
  const widok = (await odpowiedz.json()) as WidokWytrzymalosci;
  expect(widok.bieg_zwarciowy_ref).toBe(runId);
  return widok;
}

/**
 * Prądy KAŻDEGO pola = wiersz 3F biegu w punkcie zabudowy TEGO pola (karta
 * WYTRZYMALOSC-PRAD-POLA). Asercja idzie przeciw wynikowi biegu, nie przeciw
 * literałom: punkt pola musi być wierszem biegu, a liczby — jego liczbami.
 */
export function sprawdzPradyPolZBiegiem(widok: WidokWytrzymalosci, wiersze: WierszZwarcia[]): void {
  for (const pole of widok.pola) {
    const punkt = pole.prady_pola.punkt_ref;
    expect(punkt, `Pole ${pole.pole} musi mieć punkt zabudowy w biegu`).toBeTruthy();
    const wiersz = wiersze.find((r) => (r.element_id ?? r.target_id) === punkt);
    expect(wiersz, `Punkt ${punkt} pola ${pole.pole} musi być wierszem biegu`).toBeTruthy();
    expect(pole.prady_pola.ip_ka).toBe(wiersz!.ip_ka);
    expect(pole.prady_pola.ith_ka).toBe(wiersz!.ith_ka);
    // Prąd cieplny przy T_k pola liczony z I_th TEGO wiersza biegu, a wielkość porównywana
    // w ocenie cieplnej = ten prąd (czas pola nieustalony: brak porównania, „—" z powodem).
    const cieplny = pole.prad_cieplny_pola;
    expect(cieplny.ith_biegu_ka).toBe(wiersz!.ith_ka);
    const cieplna = pole.oceny.find((o) => o.kryterium_id.endsWith('.cieplna'));
    if (cieplny.ith_ka !== null) {
      expect(cieplna?.wynik?.wartosc.wartosc).toBe(cieplny.ith_ka);
    } else {
      expect(cieplny.powod_pl, `Pole ${pole.pole}: brak I_th pola musi mieć powód`).toBeTruthy();
      if (cieplna) expect(cieplna.status_maszynowy).not.toBe('SPELNIA');
    }
    // Karta SC-IB-ITH-ZRODLA: wielkość kryterium wyłączania I_b — z TEGO SAMEGO wiersza biegu.
    expect(pole.prady_pola.ib_ka).toBe(wiersz!.ib_ka ?? null);
  }
}