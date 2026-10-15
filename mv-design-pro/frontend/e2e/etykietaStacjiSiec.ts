/**
 * Sieć karty ETYKIETA-STACJI-PRZELOTOWEJ — budowana operacjami domenowymi REALNEGO backendu.
 *
 * GPZ 15 kV + magistrala kablowa z trzech odcinków i trzy stacje SN/nN, WSZYSTKIE
 * zadeklarowane jako przelotowe (`station_type: 'B'`), tak jak seedy KD-11 i sceny fikstur,
 * na których oględziny wykryły dwa różne rodzaje tej samej stacji. Topologia przesądza:
 *  - „Stacja Klonowa" (pierwszy odcinek) ma pola WE, WY, ODG i TR — 3 pola liniowe ⇒
 *    odgałęźna (deklaracja niezgodna);
 *  - „Stacja Lipowa" (drugi odcinek) ma WE, WY, TR i oba pola liniowe prowadzą do sąsiednich
 *    stacji ⇒ przelotowa (deklaracja zgodna);
 *  - „Stacja Brzozowa" (ostatni odcinek) ma WE, WY, TR, a jej pole wyjściowe kończy się
 *    wiszącą połową odcinka ⇒ końcowa (deklaracja niezgodna).
 * Stacje wstawiane od końca magistrali: identyfikatory odcinków 2 i 1 nie zmieniają się
 * przy podziale odcinka 3, więc każde wstawienie trafia w zamierzony odcinek.
 */
import { expect, type APIRequestContext } from '@playwright/test';

export const BACKEND_BASE = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://127.0.0.1:8000';
const CABLE_ID = 'cable-tfk-yakxs-3x120';
const TRAFO_ID = 'tr-sn-nn-15-04-630kva-dyn11';
const SOURCE_ID = 'src-gpz-15kv-250mva-rx010';
const FIELD_APPARATUS_ID = 'sw-cb-abb-vd4-17kv-630a';
const CATALOG_VERSION = '2024.1';

export const STACJE = {
  odgalezna: 'Stacja Klonowa',
  przelotowa: 'Stacja Lipowa',
  koncowa: 'Stacja Brzozowa',
} as const;

export interface SiecEtykietyStacji {
  readonly projectId: string;
  readonly projectName: string;
  readonly caseId: string;
  readonly caseName: string;
  /** Nazwa stacji → `ref_id` w modelu. */
  readonly stacje: Readonly<Record<string, string>>;
}

type OdpowiedzOperacji = {
  error?: string | null;
  snapshot?: {
    corridors?: Array<{ ordered_segment_refs?: string[] }>;
    substations?: Array<{ ref_id: string; name?: string | null }>;
  };
};

let licznik = 0;

function wiazanie(przestrzen: string, pozycja: string) {
  return { catalog_namespace: przestrzen, catalog_item_id: pozycja, catalog_item_version: CATALOG_VERSION };
}

export async function operacja(
  request: APIRequestContext,
  caseId: string,
  nazwa: string,
  payload: Record<string, unknown>,
): Promise<OdpowiedzOperacji> {
  const odpowiedz = await request.post(`${BACKEND_BASE}/api/cases/${caseId}/enm/domain-ops`, {
    data: {
      project_id: '',
      snapshot_base_hash: '',
      operation: { name: nazwa, idempotency_key: `e2e-etykieta-${nazwa}-${String(++licznik).padStart(4, '0')}`, payload },
    },
    timeout: 30000,
  });
  expect(odpowiedz.ok()).toBeTruthy();
  const tresc = (await odpowiedz.json()) as OdpowiedzOperacji;
  expect(tresc.error ?? null).toBeNull();
  return tresc;
}

export async function zbudujSiecEtykietyStacji(
  request: APIRequestContext,
  sufiks: string,
): Promise<SiecEtykietyStacji> {
  const projectName = `E2E rodzaj stacji ${sufiks}`;
  const caseName = `Rodzaj stacji ${sufiks}`;
  const projekt = await request.post(`${BACKEND_BASE}/api/projects`, {
    data: { name: projectName, description: 'Karta ETYKIETA-STACJI-PRZELOTOWEJ', mode: 'TO-BE', voltage_level_kv: 15.0, frequency_hz: 50.0 },
    timeout: 30000,
  });
  expect(projekt.ok()).toBeTruthy();
  const projectId = ((await projekt.json()) as { id: string }).id;
  const przypadek = await request.post(`${BACKEND_BASE}/api/study-cases`, {
    data: { project_id: projectId, name: caseName, description: '', config: {}, set_active: true },
    timeout: 30000,
  });
  expect(przypadek.ok()).toBeTruthy();
  const caseId = ((await przypadek.json()) as { id: string }).id;

  await operacja(request, caseId, 'add_grid_source_sn', {
    voltage_kv: 15.0,
    sk3_mva: 250.0,
    rx_ratio: 0.1,
    catalog_binding: wiazanie('ZRODLO_SN', SOURCE_ID),
    hv_voltage_kv: 110.0,
    transformer_sn_mva: 25.0,
  });
  let wynik: OdpowiedzOperacji = {};
  for (const [indeks, dlugosc] of [400, 350, 300].entries()) {
    wynik = await operacja(request, caseId, 'continue_trunk_segment_sn', {
      segment: { rodzaj: 'KABEL', dlugosc_m: dlugosc, name: `Odcinek ${indeks + 1}`, catalog_binding: wiazanie('KABEL_SN', CABLE_ID) },
    });
  }
  const odcinki = wynik.snapshot?.corridors?.[0]?.ordered_segment_refs ?? [];
  expect(odcinki).toHaveLength(3);
  const wstaw = async (odcinek: string, nazwa: string, pola: readonly string[]): Promise<OdpowiedzOperacji> =>
    operacja(request, caseId, 'insert_station_on_segment_sn', {
      field_apparatus_catalog_ref: FIELD_APPARATUS_ID,
      segment_id: odcinek,
      station_type: 'B',
      insert_at: { value: 0.5 },
      station: { station_name: nazwa, sn_voltage_kv: 15.0, nn_voltage_kv: 0.4 },
      sn_fields: pola,
      transformer: { create: true, catalog_binding: wiazanie('TRAFO_SN_NN', TRAFO_ID) },
    });
  await wstaw(odcinki[2], STACJE.koncowa, ['IN', 'OUT', 'TR']);
  await wstaw(odcinki[1], STACJE.przelotowa, ['IN', 'OUT', 'TR']);
  wynik = await wstaw(odcinki[0], STACJE.odgalezna, ['IN', 'OUT', 'FEEDER', 'TR']);
  const stacje: Record<string, string> = {};
  for (const stacja of wynik.snapshot?.substations ?? []) {
    if (stacja.name) stacje[stacja.name] = stacja.ref_id;
  }
  for (const nazwa of Object.values(STACJE)) expect(stacje[nazwa], nazwa).toBeTruthy();
  return { projectId, projectName, caseId, caseName, stacje };
}

/** Stan aplikacji wskazujący projekt i przypadek sieci (ten sam klucz, co KD-11). */
export function stanAplikacji(siec: SiecEtykietyStacji, motyw: 'light' | 'dark'): Record<string, string> {
  return {
    'mv-design-app-state': JSON.stringify({
      state: {
        activeProjectId: siec.projectId,
        activeProjectName: siec.projectName,
        activeCaseId: siec.caseId,
        activeCaseName: siec.caseName,
        activeCaseKind: 'ShortCircuitCase',
        activeCaseResultStatus: 'NONE',
        activeSnapshotId: null,
        activeMode: 'MODEL_EDIT',
        activeRunId: null,
        activeAnalysisType: 'SHORT_CIRCUIT',
        caseManagerOpen: false,
        issuePanelOpen: false,
      },
      version: 1,
    }),
    // Panel „Schemat i topologia" w maksymalnej szerokości powłoki (`LEFT_MAX`), żeby drzewo
    // pokazało nazwę stacji i jej rodzaj bez obcięcia.
    'mvd-shell-ui-local': JSON.stringify({
      state: {
        layoutBySpace: {
          schemat: { leftWidth: 320, rightWidth: 320, leftCollapsed: false, rightCollapsed: true },
        },
      },
      version: 0,
    }),
    // Literały kanonu motywu (`themeMode.ts`) — 'dark'/'light' nie istnieją w unii ThemeMode
    // (incydent audytu 2026-08-14: kadry „dark" były bajtowymi kopiami „light").
    'mvd-theme-mode': JSON.stringify({
      state: { mode: motyw === 'dark' ? 'dark_scada' : 'light_technical' },
      version: 0,
    }),
  };
}
