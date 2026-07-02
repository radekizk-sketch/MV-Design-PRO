/**
 * Screenshot Harness — standalone entry for Playwright SLD substrate capture.
 *
 * Renders SldCanvasV2 directly with the ≥52-station substrate fixture
 * (sldSubstrate52s.enm.json) via the real buildSldDataFromSnapshot adapter.
 * No backend required — fixture fetched from Vite dev server.
 *
 * Used exclusively by: e2e/sld-substrate-screenshot.spec.ts
 * Not part of the main app bundle (separate HTML entry).
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SldCanvasV2 } from './ui/sld/v2/canvas/SldCanvasV2';
import { buildSldDataFromSnapshot, type SldDataPayload } from './ui/sld/v2/canvas/enmToSldAdapter';
import {
  parsePowerFlowCompanion,
  type SldPowerFlowCompanion,
} from './ui/sld/v2/canvas/SldPowerFlowCompanion';
import type { EnergyNetworkModel, LogicalViewsV1 } from './types/enm';
import type { LodLevel } from './ui/sld/v2/lod/LodPolicy';

const EMPTY_LOGICAL_VIEWS: LogicalViewsV1 = {
  trunks: [],
  branches: [],
  secondary_connectors: [],
  terminals: [],
};

/**
 * Wymuszenie poziomu detalu z query-param `?lod=` (0..4) — pozwala Playwright
 * deterministycznie złapać L0 (przegląd-bloki) i L2 (szczegół). `?focus=<id>`
 * centruje+zbliża na stację (do zrzutu L2 szczegółu).
 */
function readLodOverride(): LodLevel | undefined {
  const raw = new URLSearchParams(window.location.search).get('lod');
  if (raw === null) return undefined;
  const n = Number(raw);
  return n >= 0 && n <= 4 ? (n as LodLevel) : undefined;
}

function readFocusId(): string | null {
  return new URLSearchParams(window.location.search).get('focus');
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

// P-A POWER-FLOW TOR: fetch the FROZEN-solver companion (one truth) committed
// next to the ENM. The SLD reads direction/energization from THIS — it never
// recomputes them. Missing/invalid ⇒ null ⇒ topology-only fallback rendering.
async function loadSubstratePowerFlow(): Promise<SldPowerFlowCompanion | null> {
  try {
    const resp = await fetch('/test-fixtures/sldSubstrate52s.powerflow.json');
    if (!resp.ok) return null;
    return parsePowerFlowCompanion(await resp.json());
  } catch {
    return null;
  }
}

type Status = 'loading' | 'ready' | 'error';

function SubstrateHarness(): JSX.Element {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [status, setStatus] = useState<Status>('loading');
  const [sldData, setSldData] = useState<SldDataPayload | null>(null);
  const [powerFlow, setPowerFlow] = useState<SldPowerFlowCompanion | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    Promise.all([loadSubstrateEnm(), loadSubstratePowerFlow()])
      .then(([enm, companion]) => {
        // P-A: the SLD is a projection of the solver — pass the companion so
        // direction + energization are READ from the frozen solver result.
        const data = buildSldDataFromSnapshot(enm, EMPTY_LOGICAL_VIEWS, companion);
        setSldData(data);
        setPowerFlow(companion);
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

  if (status === 'error' || !sldData) {
    return (
      <div id="sld-harness-root" data-testid="sld-harness-root" data-status="error"
        style={{ color: 'red', padding: 32, fontFamily: 'monospace', background: '#07111C', width: size.width, height: size.height }}>
        Error loading fixture: {errorMsg}
      </div>
    );
  }

  const lodOverride = readLodOverride();
  const focusParam = readFocusId();
  // `?focus=auto` → pierwsza stacja deterministycznie (do zrzutu szczegółu L2).
  const focusId =
    focusParam === 'auto'
      ? (sldData.stations[0]?.id ?? null)
      : focusParam;

  return (
    <div
      id="sld-harness-root"
      data-testid="sld-harness-root"
      data-status="ready"
      data-stations={sldData.stations.length}
      data-cable-runs={sldData.cableRuns.length}
      data-gpzs={sldData.gpzs.length}
      data-lod-override={lodOverride ?? ''}
      data-focus-id={focusId ?? ''}
      data-powerflow-case={powerFlow?.case_ref ?? ''}
      data-powerflow-converged={powerFlow ? String(powerFlow.converged) : ''}
      style={{ width: size.width, height: size.height }}
    >
      <SldCanvasV2
        width={size.width}
        height={size.height}
        gpzs={sldData.gpzs}
        sections={sldData.sections}
        cableRuns={sldData.cableRuns}
        stations={sldData.stations}
        branchPoints={sldData.branchPoints}
        ders={sldData.ders}
        connections={sldData.derConnections}
        topologyCorridors={sldData.topologyCorridors}
        topologyRuns={sldData.topologyRuns}
        terminalBindings={sldData.terminalBindings}
        labelSpecs={sldData.labelSpecs}
        readabilityReport={sldData.readabilityReport}
        powerFlowCase={
          sldData.powerFlow
            ? {
                caseRef: sldData.powerFlow.caseRef,
                caseLabel: sldData.powerFlow.caseLabel,
                converged: sldData.powerFlow.converged,
              }
            : null
        }
        lodOverride={lodOverride}
        centerOnElementId={focusId}
        showLegend={true}
        showScaleRuler={true}
      />
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<SubstrateHarness />);
}
