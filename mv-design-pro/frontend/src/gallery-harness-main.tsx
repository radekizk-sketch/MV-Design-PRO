/**
 * Galeria szablonów SLD — 20 przykładów (contact sheet).
 *
 * Składa wszystkie szablony, jakie mam, w jedną planszę:
 *   - 4 szablony stacji (StationRozdzielniaSN): T1 przelotowa · T2 końcowa ·
 *     T3 ZKSN · T4 sekcyjna,
 *   - 3 szablony źródeł OZE (OzeSourceArchetype): G1 PV prosumencka · G2 farma
 *     PV nN+trafo · G3 farma PV SN,
 * w różnych poziomach detalu (daleko / bliżej / blisko). 20 kafelków razem.
 *
 * Każdy przykład jest generowany z szablonu z danymi z zamrożonego solvera
 * (companion) — nic dorysowanego. Render jest dowodem. Używany przez:
 *   e2e/gallery-screenshot.spec.ts
 */
import { createRoot } from 'react-dom/client';
// Ten sam dostawca React Query co `main.tsx` (jeden klient z `./query-client`):
// komponenty montowane w harnessie czytają katalogi backendu przez `useQuery`
// (od karty FAB-J m.in. kreator OZE i snapshot audytu 2) — bez dostawcy strona
// harnessu padała przy montażu i korzeń z `data-status` nigdy nie powstawał
// (5 czerwonych specyfikacji `creator-screenshot` w CI). Klasa: KAŻDE wejście
// `*-harness-main.tsx`, nie tylko kreatora.
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './query-client';

import { StationRozdzielniaSN } from './ui/sld/v2/station-rozdzielnia/StationRozdzielniaSN';
import { buildArchetype } from './ui/sld/v2/station-rozdzielnia/archetypes';
import { OzeSourceArchetype } from './ui/sld/v2/station-rozdzielnia/OzeSourceArchetype';
import { OZE_ARCHETYPES_2A } from './ui/sld/v2/station-rozdzielnia/companions/ozeArchetypes2a';
import {
  computeStationGeometry,
  type StationDetailLevel,
} from './ui/sld/v2/station-rozdzielnia/geometry';
import type { StationArchetype } from './ui/sld/v2/station-rozdzielnia/contract';

// The 20 examples: (template, detail, caption). Stations cover all 3 levels for
// the headline T1, plus far/close for T2-T4; OZE covers all 3 for G1 and
// far/close for G2/G3 — 20 tiles spanning every template I have.
type StationTile = { kind: 'station'; archetype: StationArchetype; detail: StationDetailLevel; caption: string };
type OzeTile = { kind: 'oze'; archetype: string; detail: StationDetailLevel; caption: string; code: string; name: string };
type Tile = StationTile | OzeTile;

const OZE_NAMES: Record<string, { code: string; name: string }> = {
  G1: { code: 'PV-01', name: 'PV prosumencka nN' },
  G2: { code: 'PV-02', name: 'Farma PV — falowniki nN + trafo' },
  G3: { code: 'PV-03', name: 'Farma PV — falowniki SN' },
};

const EXAMPLES: Tile[] = [
  // ── Stacje sieciowe (szablon StationRozdzielniaSN) — 11 przykładów ──
  { kind: 'station', archetype: 'T1', detail: 'far', caption: '1 · T1 przelotowa — daleko' },
  { kind: 'station', archetype: 'T1', detail: 'closer', caption: '2 · T1 przelotowa — bliżej' },
  { kind: 'station', archetype: 'T1', detail: 'close', caption: '3 · T1 przelotowa — blisko (nN+PV)' },
  { kind: 'station', archetype: 'T2', detail: 'far', caption: '4 · T2 końcowa — daleko' },
  { kind: 'station', archetype: 'T2', detail: 'close', caption: '5 · T2 końcowa — blisko (CBC+nN)' },
  { kind: 'station', archetype: 'T3', detail: 'far', caption: '6 · T3 ZKSN — daleko' },
  { kind: 'station', archetype: 'T3', detail: 'closer', caption: '7 · T3 ZKSN — bliżej' },
  { kind: 'station', archetype: 'T3', detail: 'close', caption: '8 · T3 ZKSN — blisko (1×WE+n×WY)' },
  { kind: 'station', archetype: 'T4', detail: 'far', caption: '9 · T4 sekcyjna — daleko' },
  { kind: 'station', archetype: 'T4', detail: 'closer', caption: '10 · T4 sekcyjna — bliżej (sprzęgło ⊓)' },
  { kind: 'station', archetype: 'T4', detail: 'close', caption: '11 · T4 sekcyjna — blisko (SMC+NOP)' },
  // ── Źródła OZE (szablon OzeSourceArchetype) — 9 przykładów ──
  { kind: 'oze', archetype: 'G1', detail: 'far', caption: '12 · G1 PV prosument — daleko', ...OZE_NAMES.G1 },
  { kind: 'oze', archetype: 'G1', detail: 'closer', caption: '13 · G1 PV prosument — bliżej', ...OZE_NAMES.G1 },
  { kind: 'oze', archetype: 'G1', detail: 'close', caption: '14 · G1 PV prosument — blisko', ...OZE_NAMES.G1 },
  { kind: 'oze', archetype: 'G2', detail: 'far', caption: '15 · G2 farma PV nN+trafo — daleko', ...OZE_NAMES.G2 },
  { kind: 'oze', archetype: 'G2', detail: 'closer', caption: '16 · G2 farma PV nN+trafo — bliżej', ...OZE_NAMES.G2 },
  { kind: 'oze', archetype: 'G2', detail: 'close', caption: '17 · G2 farma PV nN+trafo — blisko', ...OZE_NAMES.G2 },
  { kind: 'oze', archetype: 'G3', detail: 'far', caption: '18 · G3 farma PV SN — daleko', ...OZE_NAMES.G3 },
  { kind: 'oze', archetype: 'G3', detail: 'closer', caption: '19 · G3 farma PV SN — bliżej', ...OZE_NAMES.G3 },
  { kind: 'oze', archetype: 'G3', detail: 'close', caption: '20 · G3 farma PV SN — blisko', ...OZE_NAMES.G3 },
];

const TILE_W = 430;
const TILE_H = 320;

function StationTileView(props: { archetype: StationArchetype; detail: StationDetailLevel }): JSX.Element {
  const { archetype, detail } = props;
  const { model, companion } = buildArchetype(archetype);
  const geometry = computeStationGeometry(model.fields, detail, model.nnBlock);
  const { bounds } = geometry;
  const margin = 18;
  const scale = Math.min(
    (TILE_W - 2 * margin) / bounds.width,
    (TILE_H - 30 - 2 * margin) / bounds.height,
    detail === 'far' ? 2.4 : detail === 'closer' ? 1.9 : 1.5,
  );
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const viewW = TILE_W;
  const viewH = TILE_H - 26;
  return (
    <svg width={viewW} height={viewH} viewBox={`${-viewW / 2} ${-viewH / 2} ${viewW} ${viewH}`} style={{ display: 'block' }}>
      <g transform={`scale(${scale}) translate(${-cx}, ${-cy})`}>
        <StationRozdzielniaSN model={model} companion={companion} detail={detail} />
      </g>
    </svg>
  );
}

function OzeTileView(props: { tile: OzeTile }): JSX.Element {
  const { tile } = props;
  const companion = OZE_ARCHETYPES_2A[tile.archetype];
  const viewW = TILE_W;
  const viewH = TILE_H - 26;
  const scale = tile.detail === 'far' ? 1.5 : tile.detail === 'closer' ? 1.25 : 1.0;
  const yShift = tile.detail === 'close' ? 36 : 18;
  return (
    <svg width={viewW} height={viewH} viewBox={`${-viewW / 2} ${-viewH / 2} ${viewW} ${viewH}`} style={{ display: 'block' }}>
      <g transform={`scale(${scale}) translate(0, ${yShift})`}>
        <OzeSourceArchetype companion={companion} stationCode={tile.code} name={tile.name} detail={tile.detail} />
      </g>
    </svg>
  );
}

function Gallery(): JSX.Element {
  return (
    <div
      id="gallery-root"
      data-testid="gallery-root"
      data-status="ready"
      data-tile-count={String(EXAMPLES.length)}
      style={{ background: '#050A10', minHeight: '100vh', padding: 20, boxSizing: 'border-box' }}
    >
      <div style={{ color: '#F4F6F8', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 18, fontWeight: 800, marginBottom: 2 }}>
        Galeria szablonów SLD — 20 przykładów
      </div>
      <div style={{ color: '#7E8790', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, marginBottom: 16 }}>
        7 szablonów (4 stacje: T1-T4 · 3 źródła OZE: G1-G3) × poziomy detalu · wszystko z zamrożonego solvera
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${TILE_W}px)`, gap: 14 }}>
        {EXAMPLES.map((tile, i) => (
          <div
            key={i}
            data-testid={`gallery-tile-${i + 1}`}
            data-kind={tile.kind}
            data-archetype={tile.archetype}
            data-detail={tile.detail}
            style={{ border: '1px solid #13435A', borderRadius: 6, background: '#07111C', overflow: 'hidden' }}
          >
            <div style={{ color: '#9FE6FF', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11, fontWeight: 700, padding: '5px 9px', borderBottom: '1px solid #13435A', background: '#0A1622' }}>
              {tile.caption}
            </div>
            {tile.kind === 'station'
              ? <StationTileView archetype={tile.archetype} detail={tile.detail} />
              : <OzeTileView tile={tile} />}
          </div>
        ))}
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <QueryClientProvider client={queryClient}>
      <Gallery />
    </QueryClientProvider>,
  );
}
