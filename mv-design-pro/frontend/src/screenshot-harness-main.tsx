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

// Fetch fixture at runtime from Vite's static file serving (public/)
async function loadSubstrateEnm(): Promise<EnergyNetworkModel> {
  const resp = await fetch('/test-fixtures/sldSubstrate52s.enm.json');
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
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    loadSubstrateEnm()
      .then((enm) => {
        setSnapshot(enm);
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
      />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('screenshot-harness: brak elementu #root');
createRoot(rootEl).render(<SubstrateHarness />);
