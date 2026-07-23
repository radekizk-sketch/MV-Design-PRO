/**
 * Screenshot Harness — standalone entry for Playwright SLD substrate capture.
 *
 * F12-C (spec §10.1 ARCH-4): przepięty z usuniętego `SldCanvasV2` na JEDYNY
 * render (`SldCanvasV3`) — ≥52-stacyjna fixtura (sldSubstrate52s.enm.json)
 * renderowana bezpośrednio ze snapshotu ENM (v3 czyta snapshot wprost, bez
 * pośredniego `SldDataPayload`; adapter wołany tu WYŁĄCZNIE dla liczników
 * data-* czytanych przez spec e2e). Companion power-flow NIE jest ładowany —
 * nakładka przepływu v3 żyje w store (SldCanvasV3Workspace/App), poza
 * zakresem harnessu substratu (topologia bazowa mono, spec §6 P5).
 *
 * Karta Z-3 (dowody wizualne pkt 7 karty właściciela — rozpływ prądu
 * zwarciowego, tor Thevenina + maszyny, na schemacie v3): `?overlay=faultflow`
 * (z `?fixture=gpzFeeder`) buduje nakładkę strzałek + znacznik pulse punktu
 * zwarcia z `overlayFromFaultFlowDemo` niżej, REUŻYWAJĄC produkcyjnego
 * budowniczego `buildFaultFlowOverlayForSnapshot` (`SldCanvasV3Workspace.tsx`,
 * TA SAMA funkcja, którą woła realny ekran — zero równoległej logiki).
 * Wejście = kształt 1:1 kanału `useOverlayStore.faultFlow`
 * (`ShortCircuitFlowOverlayInput`), liczby [kA] przepisane z realnego wyniku
 * solvera IEC 60909 na fixturze testu TH-1 (`build_slack_radial_graph` +
 * falownik `INV-B`, `backend/tests/test_short_circuit_iec60909.py`, scenariusz
 * `test_thevenin_addition_preserves_inverter_entries_byte_for_byte`) — tor
 * Thevenina (sieć nadrzędna) i falownika obecne RAZEM w jednym wyniku, jak w
 * kontrakcie backendu (V12K-132). Zero fizyki tutaj — sam builder nakładki.
 *
 * Used exclusively by: e2e/sld-substrate-screenshot.spec.ts,
 * e2e/zwarcia-rozplyw-screenshot.spec.ts (scena `zwarcia-schemat`).
 * Not part of the main app bundle (separate HTML entry).
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SldCanvasV3 } from './ui/sld/v3/canvas/SldCanvasV3';
import type { SldV3Overlay, SegmentFlowOverlay } from './ui/sld/v3/canvas/overlay';
import type { SceneLod } from './ui/sld/v3/scene/buildScene';
import { buildSldDataFromSnapshot, type SldDataPayload } from './ui/sld/v2/canvas/enmToSldAdapter';
import type { ShortCircuitFlowOverlayInput } from './ui/sld-overlay/ShortCircuitFlowOverlayAdapter';
import type { EnergyNetworkModel, LogicalViewsV1 } from './types/enm';

const EMPTY_LOGICAL_VIEWS: LogicalViewsV1 = {
  trunks: [],
  branches: [],
  secondary_connectors: [],
  terminals: [],
};

// Karta Z-3: `?theme=` — TEN SAM kontrakt co `creator-harness-main.tsx`
// (`data-theme` na dokumencie, dla zrzutów sparowanych jasny/ciemny). Kanwa
// v3 ma STAŁE tło techniczne (`SLD_V3_BACKGROUND`, `SldCanvasV3.tsx`) —
// świadoma decyzja projektowa (rysunek techniczny, nie UI reagujące na
// motyw), więc oba zrzuty SVG są wizualnie identyczne; atrybut ustawiony dla
// spójności strony oceny (dyrektywa właściciela #8) i przyszłych elementów
// chrome tego harnessu.
const theme = new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light_technical' : 'dark_scada';
document.documentElement.setAttribute('data-theme', theme);

/**
 * Wymuszenie poziomu detalu z query-param `?lod=` — kontrakt LOD v3 jest
 * 3-poziomowy (0..2, spec §7); historyczne wartości v2 (3/4) klampowane do 2
 * (pełny detal), żeby istniejące wywołania spec nie wymagały zmiany semantyki.
 * `?focus=` (v2 `centerOnElementId`) NIE ma odpowiednika v3 — kadr szczegółu
 * robi Playwright clipem (spec e2e), parametr ignorowany świadomie.
 */
function readLodOverride(): SceneLod | undefined {
  const raw = new URLSearchParams(window.location.search).get('lod');
  if (raw === null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.min(2, Math.floor(n)) as SceneLod;
}

/** Companion solvera (JEDNA PRAWDA wyniku rozpływu dla substrate) —
 *  program P-A: harness renderuje nakładkę WYŁĄCZNIE z tego pliku
 *  (spec §14.2 „overlay wyłącznie z wyniku"), klucze branch_flow /
 *  energized_branch_refs to refy KAWAŁKÓW sceny (`seg/…/segment_L`). */
interface PowerFlowCompanion {
  readonly case_ref: string;
  readonly converged: boolean;
  readonly branch_flow: Record<string, { direction: string; p_from_mw: number }>;
  readonly energized_branch_refs: string[];
  readonly open_point_branch_refs: string[];
  readonly energized_bus_refs: string[];
  readonly de_energized_bus_refs: string[];
}

/** Tryb nakładki z `?overlay=` — `null` = rysunek bazowy (baseline'y wizualne
 *  MUSZĄ pozostać bez nakładki, POMIAR 2026-07-17: nakładka bezwarunkowa
 *  nadpisała wszystkie baseline'y treścią z nakładką, PA_tor.png == L0.png). */
type OverlayMode = 'pf' | 'faultflow' | null;

function overlayModeFromQuery(): OverlayMode {
  const raw = new URLSearchParams(window.location.search).get('overlay');
  return raw === 'pf' || raw === 'faultflow' ? raw : null;
}

async function loadPowerFlowCompanion(mode: OverlayMode): Promise<PowerFlowCompanion | null> {
  if (mode !== 'pf') return null; // rysunek bazowy / inny tryb nakładki
  const resp = await fetch('/test-fixtures/sldSubstrate52s.powerflow.json');
  if (!resp.ok) return null; // brak companion = rysunek bazowy bez nakładki
  return await resp.json() as PowerFlowCompanion;
}

// ---------------------------------------------------------------------------
// Karta Z-3 (dowody wizualne pkt 7 karty właściciela): nakładka strzałek
// rozpływu prądu zwarciowego + znacznik pulse punktu zwarcia, na fixturze
// `gpzFeeder.enm.json` (GPZ z DWOMA jednokawałkowymi odpływami do Stacji S01/
// S02 — `singleHopSegmentRefs` niesie OBIE gałęzie, zweryfikowane sondą na
// realnej scenie: zero fabrykacji topologii). Punkt zwarcia: Stacja S01
// (`ownerRef` symbolu stacji na LOD0 = `Substation.ref_id`). Tor Thevenina
// (sieć nadrzędna) płynie GPZ→S01 (odpływ zasilający punkt zwarcia wprost);
// tor maszyny (falownik za Stacją S02) płynie ZWROTNIE S02→GPZ (kierunek
// `to_from` na JEJ WŁASNYM odpływie) — jedna strzałka na gałąź (kontrakt
// `buildFaultFlowOverlayFromScene`), więc oba tory muszą leżeć na RÓŻNYCH
// gałęziach, co ta topologia daje naturalnie (bez fabrykacji drugiej gałęzi).
// Liczby [kA] przepisane z realnego wyniku IEC 60909 solvera na fixturze
// testu TH-1 (patrz nagłówek pliku) — `ik_thevenin_ka` toru sieci nadrzędnej
// oraz wkład falownika `INV-B`, NIE wymyślone.
const FAULT_FLOW_DEMO_STATION_S01 = 'stn/980a625dd13777cd339a1a173a2a2864/station';
const FAULT_FLOW_DEMO_INPUT: ShortCircuitFlowOverlayInput = {
  run_id: 'run-sc-th1-demo',
  fault_type: '3F',
  fault_element_ref: FAULT_FLOW_DEMO_STATION_S01,
  flows: [
    {
      branch_id: 'seg/ac2e267391eabbcc94c58ee4ace01e6f/segment_L',
      branch_name: 'Odpływ GPZ → Stacja S01',
      source_id: 'THEVENIN_GRID',
      from_node_id: 'gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn',
      from_node_name: 'Szyna GPZ S1 15 kV',
      to_node_id: 'stn/980a625dd13777cd339a1a173a2a2864/sn_bus',
      to_node_name: 'Stacja S01 (typ B)',
      i_ka: 5.552132022553349,
      direction: 'from_to',
    },
    {
      branch_id: 'seg/c65b9d08fb6c84a5c80c518b45111a42/branch_segment_L',
      branch_name: 'Odpływ GPZ → Stacja S02',
      source_id: 'INV-B',
      from_node_id: 'gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn',
      from_node_name: 'Szyna GPZ S1 15 kV',
      to_node_id: 'stn/0188f98f1309b5535301f05ec09e6133/sn_bus',
      to_node_name: 'Stacja S02 (typ B)',
      i_ka: 0.024,
      direction: 'to_from',
    },
  ],
};

/** Czysty builder (zero fizyki): REUŻYWA `buildFaultFlowOverlayForSnapshot`
 *  produkcyjne (`SldCanvasV3Workspace.tsx`) dla strzałki kierunku, dokłada
 *  `faultPointMarkerRef` — DOKŁADNIE ten sam wzorzec, jakim
 *  `SldCanvasV3Workspace` łączy kanał `useOverlayStore.faultFlow` z overlayem
 *  kanwy (`faultPointMarkerRef: faultFlowInput?.fault_element_ref`).
 *
 *  Import DYNAMICZNY (`import()`) — `SldCanvasV3Workspace.tsx` jest modułem
 *  „pełnej powłoki" (drawer, DER drag&drop, context-menu, drzewo hierarchii,
 *  panel dowodów — spec §10.1 ARCH-4) o istotnie większym grafie zależności
 *  niż reszta tego harnessu. Import statyczny spowalniał PIERWSZĄ (zimną)
 *  kompilację Vite tego entry punktu ponad `navigationTimeout` konfiguracji
 *  Playwright (15 s) — realna regresja zmierzona na `sld-substrate-
 *  screenshot.spec.ts` (pierwszy test w przebiegu, `page.goto` timeout).
 *  Dynamiczny import ładuje ten ciężki moduł WYŁĄCZNIE dla `?overlay=
 *  faultflow` — domyślna scena substratu (bez tego parametru) wraca do
 *  pierwotnego, lekkiego grafu zależności. */
async function overlayFromFaultFlowDemo(enm: EnergyNetworkModel): Promise<SldV3Overlay> {
  const { buildFaultFlowOverlayForSnapshot } = await import('./ui/sld/v3/canvas/SldCanvasV3Workspace');
  return {
    energizedByTestId: {},
    faultFlowByOwnerRef: buildFaultFlowOverlayForSnapshot(enm, FAULT_FLOW_DEMO_INPUT),
    faultPointMarkerRef: FAULT_FLOW_DEMO_INPUT.fault_element_ref,
  };
}

/** Czysty builder nakładki z companion — zero fizyki (odczyt wyniku +
 *  projekcja szyna→stacja przez relacje pierwszoklasowe ENM: stacja jest
 *  wygaszona, gdy WSZYSTKIE jej szyny są w zbiorze beznapięciowym solvera;
 *  pod napięciem, gdy KTÓRAKOLWIEK jest w zbiorze energized). */
function overlayFromCompanion(companion: PowerFlowCompanion, enm: EnergyNetworkModel): SldV3Overlay {
  const energizedByOwnerRef: Record<string, boolean> = {};
  for (const ref of companion.energized_branch_refs) energizedByOwnerRef[ref] = true;
  for (const ref of companion.open_point_branch_refs) energizedByOwnerRef[ref] = false;
  const energizedBuses = new Set(companion.energized_bus_refs);
  const deEnergizedBuses = new Set(companion.de_energized_bus_refs);
  for (const station of enm.substations ?? []) {
    const busRefs = station.bus_refs ?? [];
    if (busRefs.length === 0) continue;
    if (busRefs.every((ref) => deEnergizedBuses.has(ref))) {
      energizedByOwnerRef[station.ref_id] = false;
    } else if (busRefs.some((ref) => energizedBuses.has(ref))) {
      energizedByOwnerRef[station.ref_id] = true;
    }
  }
  const flowByOwnerRef: Record<string, SegmentFlowOverlay> = {};
  for (const [ref, flow] of Object.entries(companion.branch_flow)) {
    // `direction: "none"` (P≈0, np. za punktem NO) = BRAK przepływu — gałąź
    // nie dostaje wpisu (zero grota, zero data-flow-direction); binarne
    // `forward:false` fałszowałoby ją jako przepływ wsteczny.
    if (flow.direction !== 'forward' && flow.direction !== 'reverse') continue;
    flowByOwnerRef[ref] = {
      ownerRef: ref,
      forward: flow.direction === 'forward',
      p: { value: Math.abs(flow.p_from_mw), unit: 'MW' },
    };
  }
  return {
    energizedByTestId: {},
    energizedByOwnerRef,
    flowByOwnerRef,
    provenance: { caseRef: companion.case_ref, converged: companion.converged },
  };
}

/** Wybór fixtury ENM z `?fixture=` (nazwa pliku w `public/test-fixtures/`,
 *  bez rozszerzenia; wyłącznie [A-Za-z0-9_-] — zero traversal). Domyślnie
 *  substrate (dotychczasowy kontrakt wszystkich spec bez parametru). */
function fixtureNameFromQuery(): string {
  const raw = new URLSearchParams(window.location.search).get('fixture');
  return raw && /^[A-Za-z0-9_-]+$/.test(raw) ? raw : 'sldSubstrate52s';
}

// Fetch fixture at runtime from Vite's static file serving (public/)
async function loadSubstrateEnm(): Promise<EnergyNetworkModel> {
  const resp = await fetch(`/test-fixtures/${fixtureNameFromQuery()}.enm.json`);
  if (!resp.ok) {
    throw new Error(`Failed to load fixture: ${resp.status} ${resp.statusText}`);
  }
  const raw = await resp.json() as { enm: EnergyNetworkModel };
  return raw.enm;
}

type Status = 'loading' | 'ready' | 'error';

function SubstrateHarness(): JSX.Element {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [status, setStatus] = useState<Status>('loading');
  const [snapshot, setSnapshot] = useState<EnergyNetworkModel | null>(null);
  const [sldData, setSldData] = useState<SldDataPayload | null>(null);
  const [overlay, setOverlay] = useState<SldV3Overlay | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const overlayMode = overlayModeFromQuery();
    Promise.all([loadSubstrateEnm(), loadPowerFlowCompanion(overlayMode)])
      .then(async ([enm, companion]) => {
        setSnapshot(enm);
        if (companion) setOverlay(overlayFromCompanion(companion, enm));
        // Karta Z-3: tryb `faultflow` nie ma companion (czysty builder, zero
        // fetch) — patrz `overlayFromFaultFlowDemo` nagłówek (import dynamiczny).
        if (overlayMode === 'faultflow') setOverlay(await overlayFromFaultFlowDemo(enm));
        // Liczniki data-* (stations/cableRuns/gpzs) czytane przez spec e2e —
        // TEN SAM adapter co produkcja (jedna prawda o projekcji).
        setSldData(buildSldDataFromSnapshot(enm, EMPTY_LOGICAL_VIEWS, null));
        setStatus('ready');
      })
      .catch((err: unknown) => {
        setErrorMsg(String(err));
        setStatus('error');
      });
  }, []);

  if (status === 'loading') {
    return (
      <div id="sld-harness-root" data-testid="sld-harness-root" data-status="loading"
        style={{ color: '#DDF7FF', padding: 32, fontFamily: 'monospace', background: '#07111C', width: size.width, height: size.height }}>
        Loading substrate fixture...
      </div>
    );
  }

  if (status === 'error' || !snapshot || !sldData) {
    return (
      <div id="sld-harness-root" data-testid="sld-harness-root" data-status="error"
        style={{ color: 'red', padding: 32, fontFamily: 'monospace', background: '#07111C', width: size.width, height: size.height }}>
        Error loading fixture: {errorMsg}
      </div>
    );
  }

  const lodOverride = readLodOverride();

  return (
    <div
      id="sld-harness-root"
      data-testid="sld-harness-root"
      data-status="ready"
      data-stations={sldData.stations.length}
      data-cable-runs={sldData.cableRuns.length}
      data-gpzs={sldData.gpzs.length}
      data-lod-override={lodOverride ?? ''}
      style={{ width: size.width, height: size.height }}
    >
      <SldCanvasV3
        snapshot={snapshot}
        width={size.width}
        height={size.height}
        lodOverride={lodOverride}
        overlay={overlay}
        animateLodTransitions={false}
      />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('screenshot-harness: brak elementu #root');
createRoot(rootEl).render(<SubstrateHarness />);
