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
 * Used exclusively by: e2e/sld-substrate-screenshot.spec.ts
 * Not part of the main app bundle (separate HTML entry).
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SldCanvasV3 } from './ui/sld/v3/canvas/SldCanvasV3';
import type { SldV3Overlay, SegmentFlowOverlay } from './ui/sld/v3/canvas/overlay';
import type { SceneLod } from './ui/sld/v3/scene/buildScene';
import { buildSldDataFromSnapshot, type SldDataPayload } from './ui/sld/v2/canvas/enmToSldAdapter';
import type { EnergyNetworkModel, LogicalViewsV1 } from './types/enm';

const EMPTY_LOGICAL_VIEWS: LogicalViewsV1 = {
  trunks: [],
  branches: [],
  secondary_connectors: [],
  terminals: [],
};

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

/** Nakładka P-A WYŁĄCZNIE na żądanie (`?overlay=pf`) — rendery BAZOWE
 *  (rysunek bez nakładki: `sld_substrate_53_L0/L2/...`) muszą pozostać
 *  rysunkiem bazowym; POMIAR 2026-07-17: nakładka bezwarunkowa nadpisała
 *  wszystkie baseline'y wizualne treścią z nakładką (PA_tor.png == L0.png). */
function overlayRequested(): boolean {
  return new URLSearchParams(window.location.search).get('overlay') === 'pf';
}

async function loadPowerFlowCompanion(): Promise<PowerFlowCompanion | null> {
  if (!overlayRequested()) return null; // rysunek bazowy bez nakładki
  const resp = await fetch('/test-fixtures/sldSubstrate52s.powerflow.json');
  if (!resp.ok) return null; // brak companion = rysunek bazowy bez nakładki
  return await resp.json() as PowerFlowCompanion;
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
    Promise.all([loadSubstrateEnm(), loadPowerFlowCompanion()])
      .then(([enm, companion]) => {
        setSnapshot(enm);
        if (companion) setOverlay(overlayFromCompanion(companion, enm));
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
      />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('screenshot-harness: brak elementu #root');
createRoot(rootEl).render(<SubstrateHarness />);
