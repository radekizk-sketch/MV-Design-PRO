/**
 * W1c — MACIERZ GENERATYWNA WYPOSAŻENIA PÓL (RECENZJA_MACIERZ_WYPOSAZENIA_2026-07
 * uwagi 1/2/3/9/10/15/16/17/18). W przeciwieństwie do W1b (ręczna lista 9
 * wariantów `w1MatrixVariants`) — TA fixtura jest GENEROWANA Z KATALOGU
 * konfiguracji: iteruje ENUMERACJĘ backendu
 * (`fieldConfigurationsCatalog.json`, artefakt
 * `reference_engine.field_configuration_catalog.enumerate_field_configurations`).
 *
 * Zasada nadrzędna (uwaga 17): generator NIE jest dopasowany do przykładów —
 * iteruje KATALOG (kanoniczne szablony + celki producenckie), a nie ręczną
 * listę. Ręczna lista W1b zostaje jako regresja; ta macierz jest NADRZĘDNA.
 *
 * Metoda (reużycie wzorca W1b): klonujemy realną, placeable sieć
 * `sldSubstrate52s` i WSTRZYKUJEMY każdy przypadek (konfiguracja × wariant stanu
 * aparatu głównego) do OSOBNEGO pola-hosta — render podąża za DANYMI, nie za
 * rolą pola (uwaga 10), więc rola hosta jest nieistotna dla rysowanego stosu.
 * `config_id` pola = `<config_ref>::<stan>` (uwaga 10: ref szablonu + wariant
 * stanu), niesiony do meta sceny.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BayPrimaryDevice, BaySwitchState, EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../buildScene';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_FIXTURE = resolve(
  HERE,
  '../../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json',
);
const CATALOG_JSON = resolve(HERE, 'fieldConfigurationsCatalog.json');

/** Aparaty BOCZNE (§18.1) — rozpoznawane po KIND (spójnie z compose). */
const LATERAL_KINDS: ReadonlySet<string> = new Set(['ES', 'VT', 'SURGE_ARRESTER']);
/** Główny łącznik pola (nośnik wariantu stanu — uwaga 13). */
const MAIN_SWITCH_KINDS: ReadonlySet<string> = new Set(['CB', 'LOAD_SWITCH']);

/** Wariant stanu aparatu głównego. */
export type W1cState = 'zamkniety' | 'otwarty';

/** Surowy wpis konfiguracji z katalogu backendu (JSON). */
interface CatalogDevice {
  readonly device_ref: string;
  readonly symbol_ref: string;
  readonly kind: BayPrimaryDevice['kind'];
  readonly placement: BayPrimaryDevice['placement'];
  readonly is_controllable: boolean;
  readonly render_variant?: string;
  readonly designation?: string;
  readonly earthing_role?: string;
}
interface CatalogEntry {
  readonly config_ref: string;
  readonly source: 'kanoniczny' | 'producencki';
  readonly group: string;
  readonly bay_role?: string | null;
  readonly field_role?: string | null;
  readonly name: string;
  readonly primary_devices: readonly CatalogDevice[];
  /** Czy celka ma tor główny szeregowy. `false` = celka beztorowa-specjalna
   *  (uziemianie szyn) — renderowalna wariantem specjalnym (§0.3). */
  readonly main_path: boolean;
  readonly renderable: boolean;
}
interface FieldConfigurationsCatalog {
  readonly canonical: readonly CatalogEntry[];
  readonly producer: readonly CatalogEntry[];
  readonly gaps: {
    readonly manufacturer_packs_without_cell_configurations: readonly string[];
    readonly field_types_without_template: readonly string[];
    /** Celki nie-renderowalne (pusty zbiór aparatów; realny brak danych). */
    readonly producer_non_renderable_cells: readonly string[];
  };
  /** Warianty specjalne — renderowalne, NIE braki (§0.3). */
  readonly special_configurations: {
    /** Celki bez toru głównego renderowane specjalnie (uziemianie szyn). */
    readonly producer_pathless_cells: readonly string[];
  };
}

function switchState(state: W1cState): BaySwitchState {
  return {
    actual_state: state,
    control_mode: 'zdalne',
    communication_ok: true,
    interlock_blocked: false,
  };
}

/** Jeden PRZYPADEK macierzy = konfiguracja katalogu × wariant stanu. */
export interface W1cCase {
  /** `<config_ref>::<stan>` — stabilny identyfikator (uwaga 10). */
  readonly configId: string;
  readonly configRef: string;
  readonly source: 'kanoniczny' | 'producencki';
  readonly group: string;
  readonly name: string;
  readonly state: W1cState | null;
  /** Czy konfiguracja ma tor główny szeregowy. `false` = celka beztorowa-
   *  specjalna (uziemianie szyn) — bez portu dolnego (kablowego), więc host
   *  wstrzyknięcia musi być polem BEZ zejścia międzystacyjnego (§0.3). */
  readonly mainPath: boolean;
  /** Aparaty pierwotne z katalogu z nałożonym stanem aparatu głównego. */
  readonly devices: readonly BayPrimaryDevice[];
}

/**
 * Buduje aparaty pierwotne przypadku: przepisuje dane katalogu i nakłada stan na
 * aparat GŁÓWNY (CB/LOAD_SWITCH). ES → stan spoczynkowy (otwarty). Pozostałe
 * łączniki (DS) → zamknięte. Aparaty bez stanu (CT/VT/SA/głowica/TR/bezpiecznik)
 * bez `switch_state`.
 *
 * Z3 (AUDYT_POWYKONAWCZY_SLD §Z3 + dług W1c): `designation` jest TERAZ
 * wstrzykiwana Z KATALOGU (prymat danych §12.1). Katalog niesie realne
 * oznaczenia aparatów z packów producenckich / kanonicznych szablonów
 * (backend `bay_templates.designation_q`: „Q0", „Q1", „Q2", „Q9", „QE1", „F1",
 * „TR"). Macierz dowodzi END-TO-END, że TE oznaczenia renderują się na scenie —
 * także producenckie „F1"/„TR", które NIE pasują do wzorca §19.1 Q\d+/QE\d+/T\d+
 * (dług W1c domknięty: oznaczenie identyfikowalne aparatu = DANA, rozpoznawana
 * przez wyrocznię `apparatusIdentifierGaps` po `designationSource==='dane'`).
 * Aparaty pola BEZ danej per-aparat (jeśli katalog nie niesie `designation`)
 * degradują do fallbacku KONWENCJI — spójnie z bazą.
 */
function devicesForCase(entry: CatalogEntry, state: W1cState | null): BayPrimaryDevice[] {
  const mainIndex = entry.primary_devices.findIndex((d) => MAIN_SWITCH_KINDS.has(d.kind));
  return entry.primary_devices.map((d, index): BayPrimaryDevice => {
    const device: BayPrimaryDevice = {
      device_ref: d.device_ref,
      symbol_ref: d.symbol_ref,
      kind: d.kind,
      placement: d.placement,
      is_controllable: d.is_controllable,
      render_variant: d.render_variant ?? 'kanoniczny',
    };
    // Z3 (§12.1): oznaczenie aparatu Z DANYCH katalogu (prymat danych), gdy
    // obecne — spływa na `BayPrimaryDevice.designation` → adapter → scena.
    if (d.designation) {
      device.designation = d.designation;
    }
    if (d.earthing_role) {
      device.earthing_role = d.earthing_role as BayPrimaryDevice['earthing_role'];
    }
    if (state !== null && index === mainIndex) {
      device.switch_state = switchState(state);
    } else if (d.kind === 'DS') {
      device.switch_state = switchState('zamkniety');
    } else if (d.kind === 'ES') {
      device.switch_state = switchState('otwarty');
    }
    return device;
  });
}

/**
 * Iteruje enumerację katalogu → lista przypadków (uwaga 16/17). Konfiguracje z
 * aparatem głównym (CB/LOAD_SWITCH) dostają DWA warianty stanu (uwaga 13),
 * pozostałe jeden (brak łącznika głównego = brak wariantu stanu). Tylko
 * konfiguracje RENDEROWALNE (mające tor główny) — celki bez toru głównego są w
 * rejestrze braków katalogu, nie w macierzy renderu.
 */
export function buildW1cCases(): W1cCase[] {
  const catalog = loadCatalog();
  const entries = [...catalog.canonical, ...catalog.producer]
    .filter((e) => e.renderable)
    .sort((a, b) => a.config_ref.localeCompare(b.config_ref));

  const cases: W1cCase[] = [];
  for (const entry of entries) {
    const hasMainSwitch = entry.primary_devices.some((d) => MAIN_SWITCH_KINDS.has(d.kind));
    const states: (W1cState | null)[] = hasMainSwitch ? ['zamkniety', 'otwarty'] : [null];
    for (const state of states) {
      const suffix = state ?? 'staly';
      cases.push({
        configId: `${entry.config_ref}::${suffix}`,
        configRef: entry.config_ref,
        source: entry.source,
        group: entry.group,
        name: entry.name,
        state,
        mainPath: entry.main_path,
        devices: devicesForCase(entry, state),
      });
    }
  }
  return cases;
}

export function loadCatalog(): FieldConfigurationsCatalog {
  return JSON.parse(readFileSync(CATALOG_JSON, 'utf8')) as FieldConfigurationsCatalog;
}

export { LATERAL_KINDS };

export interface W1cInjectionTarget {
  readonly case: W1cCase;
  readonly stationRef: string;
  readonly fieldRef: string;
}

export interface W1cMatrixFixture {
  /** Klon `sldSubstrate52s` z wstrzykniętymi przypadkami macierzy. */
  readonly enm: EnergyNetworkModel;
  /** Klon BAZOWY (bez wstrzyknięć) — odniesienie do asercji kotwic. */
  readonly baseEnm: EnergyNetworkModel;
  /** Mapa przypadek → wstrzyknięte pole. */
  readonly targets: readonly W1cInjectionTarget[];
}

interface RawFieldSpec {
  field_ref?: string;
  bay_role?: string;
  meta?: { field_role?: string } & Record<string, unknown>;
  primary_devices?: unknown;
  config_id?: unknown;
  [key: string]: unknown;
}
interface RawSubstation {
  ref_id: string;
  station_type?: string;
  meta?: { field_specs?: RawFieldSpec[] } & Record<string, unknown>;
}

function loadBaseEnm(): EnergyNetworkModel {
  const parsed = JSON.parse(readFileSync(BASE_FIXTURE, 'utf8')) as { enm: EnergyNetworkModel };
  return parsed.enm;
}

/**
 * Pola-hosty BEZPIECZNE dla celek BEZTOROWYCH (§0.3, uziemianie szyn).
 *
 * Celka beztorowa-specjalna kończy stos aparatem bocznym (ES) BEZ portu dolnego
 * (kablowego). Pole, do którego schodzi ZEJŚCIE MIĘDZYSTACYJNE (trunk/branch
 * kablowy między stacjami), oczekuje na dole pola portu kablowego — celka
 * beztorowa zostawiłaby tam wiszący koniec segmentu (`allSceneSegmentEndpoints
 * Anchored`). Compose↔scene kontrakt portu dolnego to obszar wątku SLD (Z3);
 * MACIERZ rozwiązuje to danymi wejściowymi: celki beztorowe wstrzykujemy TYLKO
 * do pól bez zejścia międzystacyjnego (jak realna celka uziemiania szyn — wisi
 * WYŁĄCZNIE od szyny, nie ma kabla odpływowego).
 *
 * Detekcja deterministyczna z BAZOWEJ sceny: pole jest bezpieczne, gdy w jego
 * KOLUMNIE (x zejścia `${field_ref}#descent`) nie kończy się żaden segment
 * międzystacyjny (`ownerRef` z prefiksem `seg/`) w pobliżu dna zejścia.
 */
function connectionSafeFieldRefs(baseEnm: EnergyNetworkModel): Set<string> {
  interface Seg {
    readonly points: readonly { x: number; y: number }[];
    readonly meta?: { ownerRef?: unknown };
  }
  const scene = buildSceneV3(baseEnm, 2);
  const segs = scene.segments as unknown as Seg[];
  const descentBottomByField = new Map<string, { x: number; y: number }>();
  const interEndpointYByColumn = new Map<number, number[]>();
  for (const seg of segs) {
    const ref = String(seg.meta?.ownerRef ?? '');
    if (ref.endsWith('#descent')) {
      descentBottomByField.set(ref.replace(/#descent$/u, ''), seg.points[seg.points.length - 1]);
    } else if (ref.startsWith('seg/')) {
      for (const p of [seg.points[0], seg.points[seg.points.length - 1]]) {
        const ys = interEndpointYByColumn.get(p.x) ?? [];
        ys.push(p.y);
        interEndpointYByColumn.set(p.x, ys);
      }
    }
  }
  const safe = new Set<string>();
  for (const [fieldRef, bottom] of descentBottomByField) {
    const columnYs = interEndpointYByColumn.get(bottom.x);
    // Zejście międzystacyjne w tej kolumnie w promieniu 64 px (4×GRID) od dna
    // zejścia = pole z odpływem kablowym → NIEbezpieczne dla celki beztorowej.
    if (!columnYs || !columnYs.some((y) => Math.abs(y - bottom.y) <= 64)) {
      safe.add(fieldRef);
    }
  }
  return safe;
}

/**
 * Buduje fixturę macierzy generatywnej: klon `sldSubstrate52s` + wstrzyknięcie
 * KAŻDEGO przypadku katalogu do OSOBNEGO pola-hosta (pola deterministycznie
 * posortowane po ref_id stacji + field_ref). Render podąża za DANYMI, więc rola
 * hosta nie musi pasować do konfiguracji — to ISTOTA dowodu W1c (prymat danych
 * nad rolą, uwaga 10). Zwraca też KLON BAZOWY do asercji kotwic stacji.
 */
export function buildW1cMatrixFixture(): W1cMatrixFixture {
  const enm = loadBaseEnm();
  const baseEnm = loadBaseEnm();
  const cases = buildW1cCases();

  const hostFields: { station: RawSubstation; spec: RawFieldSpec }[] = [];
  const stations = (enm.substations as unknown as RawSubstation[])
    // Tylko stacje rysowane ścieżką mini-bloku (branch/inline/terminal) — GPZ
    // ma osobny potok (canonical GPZ adapter), pola GPZ nie spływają na snBays.
    .filter((s) => ['branch', 'inline', 'terminal'].includes(s.station_type ?? ''))
    .slice()
    .sort((a, b) => a.ref_id.localeCompare(b.ref_id));
  for (const station of stations) {
    const specs = (station.meta?.field_specs ?? [])
      .slice()
      .sort((a, b) => String(a.field_ref ?? '').localeCompare(String(b.field_ref ?? '')));
    for (const spec of specs) {
      if (spec.field_ref) hostFields.push({ station, spec });
    }
  }

  if (hostFields.length < cases.length) {
    throw new Error(
      `W1c fixture: za mało pól-hostów (${hostFields.length}) dla przypadków (${cases.length}).`,
    );
  }

  // §0.3: celki BEZTOROWE (uziemianie szyn) trafiają WYŁĄCZNIE do pól bez zejścia
  // międzystacyjnego (brak odpływu kablowego — jak realna celka uziemiania szyn).
  // Celki torowe (main_path) mają port dolny i kotwiczą się na dowolnym hoście.
  const safeRefs = connectionSafeFieldRefs(baseEnm);
  const isSafe = (host: { spec: RawFieldSpec }): boolean => safeRefs.has(host.spec.field_ref ?? '');
  const safeHosts = hostFields.filter(isSafe);
  const otherHosts = hostFields.filter((h) => !isSafe(h));
  const pathlessCases = cases.filter((c) => !c.mainPath);
  const mainPathCases = cases.filter((c) => c.mainPath);

  if (safeHosts.length < pathlessCases.length) {
    throw new Error(
      `W1c fixture: za mało pól-hostów bez zejścia (${safeHosts.length}) dla celek ` +
        `beztorowych (${pathlessCases.length}).`,
    );
  }

  // Deterministyczne przypisanie: celki beztorowe → pierwsze bezpieczne hosty;
  // celki torowe → pozostałe hosty (nadmiar bezpiecznych + pozostałe), w
  // kolejności hostFields (stabilnej po ref_id stacji + field_ref).
  const pathlessHosts = safeHosts.slice(0, pathlessCases.length);
  const usedPathless = new Set(pathlessHosts);
  const mainPathHosts = hostFields.filter((h) => !usedPathless.has(h));

  const targets: W1cInjectionTarget[] = [];
  const assign = (
    assignedCases: readonly W1cCase[],
    hosts: readonly { station: RawSubstation; spec: RawFieldSpec }[],
  ): void => {
    assignedCases.forEach((testCase, index) => {
      const host = hosts[index];
      host.spec.primary_devices = testCase.devices.map((d) => ({ ...d }));
      host.spec.config_id = testCase.configId;
      targets.push({
        case: testCase,
        stationRef: host.station.ref_id,
        fieldRef: host.spec.field_ref ?? '',
      });
    });
  };
  assign(pathlessCases, pathlessHosts);
  assign(mainPathCases, mainPathHosts);

  return { enm, baseEnm, targets };
}
