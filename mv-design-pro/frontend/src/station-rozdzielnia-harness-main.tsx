/**
 * STACJA-ROZDZIELNIA SN — single-station render harness (KROK 1, B-02 proof).
 *
 * Renders ONE `StationRozdzielniaSN` unit for a given archetype (?archetype=T1..T4)
 * as a vertical COMPOSITE of the three responsive detail levels (far / closer /
 * close), each auto-fitted in its own SVG. The power-flow direction is READ from
 * the archetype's frozen-solver companion slice (one truth).
 *
 * Render is the only proof. Used exclusively by:
 *   e2e/station-rozdzielnia-screenshot.spec.ts
 * Not part of the main app bundle (separate HTML entry).
 */
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { StationRozdzielniaSN } from './ui/sld/v2/station-rozdzielnia/StationRozdzielniaSN';
import { buildArchetype } from './ui/sld/v2/station-rozdzielnia/archetypes';
import {
  computeStationGeometry,
  type StationDetailLevel,
} from './ui/sld/v2/station-rozdzielnia/geometry';
import {
  STATION_ARCHETYPE_TYPE_PL,
  type StationArchetype,
} from './ui/sld/v2/station-rozdzielnia/contract';

const LEVELS: ReadonlyArray<{ detail: StationDetailLevel; label: string }> = [
  { detail: 'far', label: 'daleko — przegląd rozdzielni' },
  { detail: 'closer', label: 'bliżej — aparaty + kierunek mocy' },
  { detail: 'close', label: 'blisko — pełne symbole IEC 60617 + zabezpieczenia' },
];

function readArchetype(): StationArchetype {
  const raw = new URLSearchParams(window.location.search).get('archetype');
  if (raw === 'T1' || raw === 'T2' || raw === 'T3' || raw === 'T4') return raw;
  return 'T1';
}

/** One detail level, auto-fitted into a fixed-height panel. */
function LevelPanel(props: {
  archetype: StationArchetype;
  detail: StationDetailLevel;
  label: string;
  panelWidth: number;
  panelHeight: number;
  whiteBox?: boolean;
  onFieldClick: (fieldId: string) => void;
}): JSX.Element {
  const { archetype, detail, label, panelWidth, panelHeight, onFieldClick } = props;
  const { model, companion } = buildArchetype(archetype);
  // Pass the nN block so the auto-fit bounds INCLUDE the nN tier the component
  // draws (transformer boundary + nN busbar + feeders + PV) — otherwise the nN
  // side overflows the panel. ONE geometry source (N-5) feeds both fit + render.
  const geometry = computeStationGeometry(model.fields, detail, model.nnBlock);
  const { bounds } = geometry;
  // Fit content into the panel with margin; never upscale past a readable cap.
  const margin = 24;
  const scale = Math.min(
    (panelWidth - 2 * margin) / bounds.width,
    (panelHeight - 40 - 2 * margin) / bounds.height,
    detail === 'far' ? 2.6 : detail === 'closer' ? 2.2 : 1.9,
  );
  const viewW = panelWidth;
  const viewH = panelHeight - 32;
  // Centre the content in the viewBox.
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;

  return (
    <div
      data-testid={`sr-harness-panel-${whiteBox ? 'whitebox' : detail}`}
      data-detail={detail}
      style={{
        border: '1px solid #13435A',
        borderRadius: 6,
        background: '#07111C',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          color: '#9FE6FF',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 12,
          fontWeight: 700,
          padding: '6px 10px',
          borderBottom: '1px solid #13435A',
          background: '#0A1622',
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <svg
        data-testid={`sr-harness-svg-${detail}`}
        width={viewW}
        height={viewH}
        viewBox={`${-viewW / 2} ${-viewH / 2} ${viewW} ${viewH}`}
        style={{ display: 'block' }}
      >
        <g transform={`scale(${scale}) translate(${-cx}, ${-cy})`}>
          <StationRozdzielniaSN
            model={model}
            companion={companion}
            detail={detail}
            onFieldClick={onFieldClick}
          />
        </g>
      </svg>
    </div>
  );
}

function Harness(): JSX.Element {
  const archetype = useMemo(readArchetype, []);
  const [lastClick, setLastClick] = useState<string>('');
  const { model } = buildArchetype(archetype);

  const PANEL_W = 720;
  // Transformer archetypes (T1/T2) carry an nN tier below the SN busbar, which
  // roughly doubles the vertical content — give them a taller panel so the nN
  // side renders at full readable size instead of being shrunk to fit.
  const PANEL_H = model.nnBlock ? 440 : 300;

  return (
    <div
      id="sr-harness-root"
      data-testid="sr-harness-root"
      data-status="ready"
      data-archetype={archetype}
      data-station-type={STATION_ARCHETYPE_TYPE_PL[archetype]}
      data-field-count={String(model.fields.length)}
      data-last-field-click={lastClick}
      style={{
        background: '#050A10',
        minHeight: '100vh',
        padding: 20,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          color: '#F4F6F8',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 16,
          fontWeight: 800,
          marginBottom: 4,
        }}
      >
        {`Stacja-rozdzielnia SN — archetyp ${archetype} (${STATION_ARCHETYPE_TYPE_PL[archetype]})`}
      </div>
      <div
        style={{
          color: '#7E8790',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 12,
          marginBottom: 14,
        }}
      >
        {`${model.fields.length} pól · kierunek przepływu mocy z zamrożonego solvera (companion) · 3 poziomy detalu`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: PANEL_W }}>
        {LEVELS.map(({ detail, label }) => (
          <LevelPanel
            key={detail}
            archetype={archetype}
            detail={detail}
            label={label}
            panelWidth={PANEL_W}
            panelHeight={PANEL_H}
            onFieldClick={(fieldId) => setLastClick(fieldId)}
          />
        ))}
        {/* Gate D — the deepest L2 view: the complete engineering object with the
            expanded White Box derivation (short circuit + voltage) for the SN busbar. */}
        <LevelPanel
          archetype={archetype}
          detail="close"
          label="szczyt — kompletny obiekt: White Box (zwarcie + napięcie) A→B→C→D"
          panelWidth={PANEL_W}
          panelHeight={520}
          whiteBox
          onFieldClick={(fieldId) => setLastClick(fieldId)}
        />
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<Harness />);
}
