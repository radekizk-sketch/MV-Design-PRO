/**
 * OZE source archetype harness (KROK 2, Runda 2a — PV G1-G3).
 *
 * Renders ONE OZE archetype (?archetype=G1..G3) as a vertical composite of the
 * three responsive detail levels (far / closer / close). All values are READ
 * from the frozen-solver OZE companion (one truth). Render is the only proof.
 * Used by: e2e/oze-source-screenshot.spec.ts
 */
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { OzeSourceArchetype } from './ui/sld/v2/station-rozdzielnia/OzeSourceArchetype';
import { OZE_ARCHETYPES_2A } from './ui/sld/v2/station-rozdzielnia/companions/ozeArchetypes2a';
import type { StationDetailLevel } from './ui/sld/v2/station-rozdzielnia/geometry';

const LEVELS: ReadonlyArray<{ detail: StationDetailLevel; label: string }> = [
  { detail: 'far', label: 'daleko — przegląd źródła' },
  { detail: 'closer', label: 'bliżej — aparaty + kierunek (eksport) + typ/maszyna/tryb' },
  { detail: 'close', label: 'blisko — pełne symbole + ochrona + wyniki (U, Ik", hierarchia, wkład)' },
];

const NAMES: Record<string, string> = {
  G1: 'PV prosumencka nN',
  G2: 'Farma PV — falowniki nN + trafo',
  G3: 'Farma PV — falowniki SN',
  'G4-PVTR': 'PV 1 MW przez stację TR konsumencką',
};
const CODES: Record<string, string> = { G1: 'PV-01', G2: 'PV-02', G3: 'PV-03', 'G4-PVTR': 'PV-1MW' };

function readArchetype(): string {
  const raw = new URLSearchParams(window.location.search).get('archetype');
  return raw && OZE_ARCHETYPES_2A[raw] ? raw : 'G1';
}

function LevelPanel(props: { archetype: string; detail: StationDetailLevel; label: string; onFieldClick: (id: string) => void }): JSX.Element {
  const { archetype, detail, label, onFieldClick } = props;
  const companion = OZE_ARCHETYPES_2A[archetype];
  const PANEL_W = 820;
  const PANEL_H = detail === 'close' ? 660 : 260;
  const viewW = PANEL_W;
  const viewH = PANEL_H - 32;
  // The Buk 1 archetype is wide (W≈440) — scale so the SN busbar fits the panel.
  const wide = (companion.fields.length ?? 0) >= 6;
  const scale = detail === 'far' ? (wide ? 1.45 : 1.9) : detail === 'closer' ? (wide ? 1.2 : 1.5) : 1.05;
  return (
    <div
      data-testid={`oze-harness-panel-${detail}`}
      data-detail={detail}
      style={{ border: '1px solid #13435A', borderRadius: 6, background: '#07111C', overflow: 'hidden' }}
    >
      <div style={{ color: '#9FE6FF', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fontWeight: 700, padding: '6px 10px', borderBottom: '1px solid #13435A', background: '#0A1622' }}>
        {label}
      </div>
      <svg data-testid={`oze-harness-svg-${detail}`} width={viewW} height={viewH} viewBox={`${-viewW / 2} ${-viewH / 2} ${viewW} ${viewH}`} style={{ display: 'block' }}>
        <g transform={`scale(${scale}) translate(0, ${detail === 'close' ? 30 : 10})`}>
          <OzeSourceArchetype companion={companion} stationCode={CODES[archetype] ?? archetype} name={NAMES[archetype] ?? archetype} detail={detail} onFieldClick={onFieldClick} />
        </g>
      </svg>
    </div>
  );
}

function Harness(): JSX.Element {
  const archetype = useMemo(readArchetype, []);
  const [lastClick, setLastClick] = useState<string>('');
  const companion = OZE_ARCHETYPES_2A[archetype];
  return (
    <div
      id="oze-harness-root"
      data-testid="oze-harness-root"
      data-status="ready"
      data-archetype={archetype}
      data-machine-type={companion.source.machine_type}
      data-last-click={lastClick}
      style={{ background: '#050A10', minHeight: '100vh', padding: 20, boxSizing: 'border-box' }}
    >
      <div style={{ color: '#F4F6F8', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
        {`Źródło OZE — archetyp ${archetype} (${NAMES[archetype] ?? archetype})`}
      </div>
      <div style={{ color: '#7E8790', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, marginBottom: 14 }}>
        {`${companion.source.technology} · ${companion.source.machine_type} · NC ${companion.source.nc_rfg_class} · ${companion.source.control_mode} · PCC ${companion.pcc_bus_ref} · z zamrożonego solvera`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 760 }}>
        {LEVELS.map(({ detail, label }) => (
          <LevelPanel key={detail} archetype={archetype} detail={detail} label={label} onFieldClick={(id) => setLastClick(id)} />
        ))}
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<Harness />);
}
