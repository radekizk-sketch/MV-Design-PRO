/**
 * DEMO-OZE-SC (2026-07-24) — zrzuty sieci DEMONSTRACYJNEJ do oceny wlasciciela:
 * magistrala SN od GPZ, na ktorej KAZDA stacja ma INNA konfiguracje OZE, plus
 * realny bieg zwarciowy (SC IEC 60909) na kazdej szynie SN.
 *
 * Fixtury (jedno zrodlo prawdy, generowane przez scripts/generate-demo-oze-sc.py):
 *  - demo-oze-sc/demoOzeSc.enm.json : kanoniczny ENM sieci (12 stacji, 12 konfiguracji OZE)
 *  - demo-oze-sc/demoOzeSc.sc.json  : companion REALNEGO biegu SC (Ik''/ip/Ith/Sk per szyna SN)
 *
 * Zrzuty:
 *  - demo-oze-galeria : GALERIA SZCZEGOLOW STACJI (A) — 12 kadrow zoom L2, kazda
 *    stacja z widoczna SWOJA konfiguracja OZE (glify DER PV/BESS/wiatr, na SN vs
 *    za TR / tor blokowy W2c) + podpis PL z nazwa konfiguracji.
 *  - demo-oze-zwarcie-l2 : PELNA siec L2 z WARSTWA ZWARCIA (B) — Ik'' per szyna z
 *    REALNEGO biegu (analysis_type='short_circuit', slot SC_BUS: Ik''/ip/Ith/Sk),
 *    produkcyjnym torem etykiet (buildResultLabelsFromScene + placements).
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_demo_oze_sc.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { SYMBOL_DEFS, type SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import {
  buildResultLabelsFromScene,
  resultRefForSegment,
  singleHopSegmentRefs,
} from '../src/ui/sld/v3/canvas/resultLabels';
import { CANVAS_BACKGROUND } from '../src/ui/sld/v3/theme/colorTokens';
import type { RawOverlayElement, RawOverlayPayload } from '../src/ui/sld-overlay/rawResultOverlayStore';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const TXT = '#E8EEF4';
const SUB = '#9FB3C8';
const RESULT = '#F4B860'; // bursztyn — warstwa zwarciowa (odrozniona od rozplywu)
const WIRE = '#8FA8BE';
const DER_ACCENT = '#7FD1AE';

interface DerRecord {
  readonly technology: string;
  readonly variant: string;
  readonly catalog_ref: string;
  readonly power_mw: number;
  readonly source_name: string;
  readonly generator_refs: readonly string[];
}
interface StationConfig {
  readonly station_ref: string;
  readonly station_name: string;
  readonly config_key: string;
  readonly config_label_pl: string;
  readonly transformer_catalog_ref: string;
  readonly der: readonly DerRecord[];
}
interface ScEntry {
  readonly bus_ref: string;
  readonly voltage_kv: number;
  readonly ikss_a: number;
  readonly ip_a: number;
  readonly ith_a: number;
  readonly sk_mva: number;
}

const enmFixture = JSON.parse(
  readFileSync(resolve(HERE, 'demo-oze-sc/demoOzeSc.enm.json'), 'utf8'),
) as { readonly _meta: { readonly station_configs: readonly StationConfig[] }; readonly enm: EnergyNetworkModel };
const enm = enmFixture.enm;
const stationConfigs = enmFixture._meta.station_configs;

const scFixture = JSON.parse(
  readFileSync(resolve(HERE, 'demo-oze-sc/demoOzeSc.sc.json'), 'utf8'),
) as {
  readonly converged: boolean;
  readonly bus_count: number;
  readonly ikss_min_ka: number;
  readonly ikss_max_ka: number;
  readonly bus_short_circuit: Record<string, ScEntry>;
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Klucz seedowy refu: dwa pierwsze czlony sciezki (bez sufiksu `#...`). Wiaze
 *  ref sceny (`stn/<seed>/station#sn-bus`) z refem ENM/companion (`stn/<seed>/sn_bus`). */
function seedKey(ref: string): string {
  const bare = ref.split('#')[0];
  const parts = bare.split('/');
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : bare;
}

// --- Sceny L2 (raz) ---------------------------------------------------------
const scene = buildSceneV3(enm, 2);

// ===========================================================================
// (A) GALERIA SZCZEGOLOW STACJI — 12 kadrow zoom, kazda z wlasna konfiguracja OZE.
// ===========================================================================
const TECH_PL: Record<string, string> = { PV: 'PV', BESS: 'BESS', FW: 'Wiatr' };
const VARIANT_PL: Record<string, string> = {
  nn_side: 'za TR (nN)',
  block_transformer: 'SN / TR blokowy',
};

function derSummary(der: readonly DerRecord[]): string {
  if (der.length === 0) return 'brak OZE (stacja odniesienia)';
  return der
    .map((d) => `${TECH_PL[d.technology] ?? d.technology} ${d.power_mw} MW · ${VARIANT_PL[d.variant] ?? d.variant}`)
    .join('   +   ');
}

/** Prefiksy refow nalezacych do stacji: seed stacji + seedy generatorow DER
 *  (nn_side sasiaduje z szyna nN stacji; block_transformer niesie wlasny lancuch
 *  pv/bess/fw/<seed>/der/*). Element sceny nalezy do kadru, gdy jego ownerRef
 *  zaczyna sie od ktoregos prefiksu. */
function memberPrefixes(cfg: StationConfig): string[] {
  const prefixes = [`${seedKey(cfg.station_ref)}/`];
  for (const d of cfg.der) for (const g of d.generator_refs) prefixes.push(`${seedKey(g)}/`);
  return prefixes;
}
function isMember(ownerRef: string | undefined, prefixes: string[]): boolean {
  if (!ownerRef) return false;
  return prefixes.some((p) => ownerRef.startsWith(p));
}

/** Render jednego kadru stacji do prostokata (ox,oy,tileW,tileH) w duzym SVG. */
function renderStationTile(cfg: StationConfig, ox: number, oy: number, tileW: number, tileH: number): string {
  const prefixes = memberPrefixes(cfg);
  const derRefs = new Set(cfg.der.flatMap((d) => d.generator_refs));

  const memberSymbols = scene.symbols.filter(
    (s) => isMember(s.meta?.ownerRef, prefixes) || (s.meta?.ownerRef ? derRefs.has(s.meta.ownerRef) : false),
  );
  const memberSegments = scene.segments.filter((s) => isMember(s.meta?.ownerRef, prefixes));

  // bbox kadru
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of memberSymbols) {
    const def = SYMBOL_DEFS[s.symbolId as SymbolId];
    xs.push(s.x, s.x + (def?.width ?? 0));
    ys.push(s.y, s.y + (def?.height ?? 0));
  }
  for (const seg of memberSegments) for (const p of seg.points) { xs.push(p.x); ys.push(p.y); }

  const CAP_H = 92;
  const PAD = 14;
  const drawW = tileW - 2 * PAD;
  const drawH = tileH - CAP_H - 2 * PAD;
  const parts: string[] = [];
  // ramka kafla
  parts.push(
    `<rect x="${ox + 4}" y="${oy + 4}" width="${tileW - 8}" height="${tileH - 8}" rx="10" fill="#101922" stroke="#22303c" stroke-width="1.5"/>`,
  );

  if (xs.length > 0) {
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const bw = Math.max(1, Math.max(...xs) - minX);
    const bh = Math.max(1, Math.max(...ys) - minY);
    const scale = Math.min(drawW / bw, drawH / bh);
    // wysrodkowanie w polu rysunku
    const offX = ox + PAD + (drawW - bw * scale) / 2;
    const offY = oy + PAD + (drawH - bh * scale) / 2;
    const tx = (x: number): number => offX + (x - minX) * scale;
    const ty = (y: number): number => offY + (y - minY) * scale;

    for (const seg of memberSegments) {
      const d = seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ');
      const isBus = seg.meta?.elementKind === 'bus';
      parts.push(
        `<path d="${d}" fill="none" stroke="${isBus ? TXT : WIRE}" stroke-width="${isBus ? 2.0 : 1.2}" opacity="${isBus ? 0.95 : 0.8}"/>`,
      );
    }
    for (const s of memberSymbols) {
      const def = SYMBOL_DEFS[s.symbolId as SymbolId];
      const Glyph = SYMBOL_GLYPHS[s.symbolId as SymbolId];
      if (!def || !Glyph) continue;
      const isDer = s.meta?.elementKind === 'der';
      parts.push(
        `<g transform="translate(${tx(s.x).toFixed(1)},${ty(s.y).toFixed(1)}) scale(${scale})">` +
          renderToStaticMarkup(
            <Glyph x={0} y={0} state={s.state as 'closed' | 'open' | 'unknown' | undefined} stroke={isDer ? DER_ACCENT : TXT} />,
          ) +
          `</g>`,
      );
      if (isDer) {
        // wyroznij DER kolkiem akcentu
        parts.push(
          `<circle cx="${(tx(s.x) + (def.width * scale) / 2).toFixed(1)}" cy="${(ty(s.y) + (def.height * scale) / 2).toFixed(1)}" r="${Math.max(6, def.width * scale * 0.7).toFixed(1)}" fill="none" stroke="${DER_ACCENT}" stroke-width="1.4" opacity="0.9"/>`,
        );
      }
    }
  } else {
    parts.push(
      `<text x="${ox + tileW / 2}" y="${oy + tileH / 2}" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="15" fill="${SUB}">brak elementow kadru</text>`,
    );
  }

  // podpis
  const capY = oy + tileH - CAP_H + 6;
  parts.push(
    `<rect x="${ox + 4}" y="${capY - 4}" width="${tileW - 8}" height="${CAP_H - 6}" fill="#0b131b"/>`,
    `<text x="${ox + 16}" y="${capY + 22}" font-family="Inter, system-ui, sans-serif" font-size="19" font-weight="700" fill="${TXT}">${escapeXml(cfg.station_name)}</text>`,
    `<text x="${ox + 16}" y="${capY + 46}" font-family="Inter, system-ui, sans-serif" font-size="14.5" fill="${SUB}">${escapeXml(cfg.config_label_pl)}</text>`,
    `<text x="${ox + 16}" y="${capY + 68}" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${DER_ACCENT}">OZE: ${escapeXml(derSummary(cfg.der))}</text>`,
  );
  return parts.join('');
}

{
  const COLS = 3;
  const ROWS = Math.ceil(stationConfigs.length / COLS);
  const TILE_W = 900;
  const TILE_H = 640;
  const HEADER = 96;
  const W = COLS * TILE_W;
  const H = HEADER + ROWS * TILE_H;
  const parts: string[] = [];
  parts.push(
    `<text x="24" y="40" font-family="Inter, system-ui, sans-serif" font-size="26" font-weight="700" fill="${TXT}">` +
      `Galeria szczegolow stacji — KAZDA stacja inna konfiguracja OZE (L2, zoom)</text>`,
    `<text x="24" y="72" font-family="Inter, system-ui, sans-serif" font-size="15" fill="${SUB}">` +
      `${stationConfigs.length} stacji na magistrali SN od GPZ · glify DER (PV / BESS / wiatr) w miejscu przylaczenia: za transformatorem stacji (nN) albo po stronie SN przez transformator blokowy (tor W2c) · elementy z realnego modelu ENM (converter sources), zero fabrykacji</text>`,
  );
  stationConfigs.forEach((cfg, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    parts.push(renderStationTile(cfg, col * TILE_W, HEADER + row * TILE_H, TILE_W, TILE_H));
  });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${CANVAS_BACKGROUND}"/>${parts.join('')}</svg>`;
  writeFileSync(`${OUT}/demo-oze-galeria.svg`, svg);
  console.log('wrote', 'demo-oze-galeria.svg', `stacje=${stationConfigs.length}`);
}

// ===========================================================================
// (B) PELNA siec L2 z WARSTWA ZWARCIA — Ik'' per szyna z realnego biegu SC.
// ===========================================================================
{
  const singleHop = singleHopSegmentRefs(enm);

  // Payload wynikowy: dla KAZDEJ szyny sceny odczytaj realny wpis SC (po refie
  // produkcyjnym `resultRefForSegment`, a gdy brak — po kluczu seedowym). Wartosci
  // 1:1 z companionu solvera (zero fabrykacji, zero fizyki w UI).
  const scByRef = new Map<string, ScEntry>(Object.entries(scFixture.bus_short_circuit));
  const scByKey = new Map<string, ScEntry>();
  for (const [ref, e] of Object.entries(scFixture.bus_short_circuit)) scByKey.set(seedKey(ref), e);

  const elements: Record<string, RawOverlayElement> = {};
  let nSc = 0;
  for (const seg of scene.segments) {
    if (seg.meta?.elementKind !== 'bus') continue;
    const resultRef = resultRefForSegment(seg.meta) ?? seg.meta?.ownerRef;
    const ownerRef = seg.meta?.ownerRef;
    if (!resultRef || !ownerRef) continue;
    const entry =
      scByRef.get(resultRef) ??
      scByRef.get(ownerRef) ??
      scByKey.get(seedKey(ownerRef)) ??
      scByKey.get(seedKey(resultRef));
    if (!entry || elements[resultRef]) continue;
    elements[resultRef] = {
      ref_id: resultRef,
      kind: 'bus',
      badges: [],
      metrics: {
        IK_3F_A: { code: 'IK_3F_A', value: entry.ikss_a, unit: 'A', format_hint: 'fixed0' },
        IP_A: { code: 'IP_A', value: entry.ip_a, unit: 'A', format_hint: 'fixed0' },
        ITH_A: { code: 'ITH_A', value: entry.ith_a, unit: 'A', format_hint: 'fixed0' },
        SK_MVA: { code: 'SK_MVA', value: entry.sk_mva, unit: 'MVA', format_hint: 'fixed1' },
      },
      severity: 'INFO',
    };
    nSc += 1;
  }

  const payload: RawOverlayPayload = {
    run_id: 'demo-oze-sc',
    analysis_type: 'short_circuit_3f',
    elements,
  };
  // TRESC etykiet: produkcyjny builder (slot SC_BUS: Ik''/ip/Ith/Sk, wartosci 1:1
  // z solvera). LAYOUT: statyczny plakat oceny kotwiczy KAZDA szyne bezposrednio
  // w srodku jej segmentu (interaktywny declutter/agregacja R2 pozostaje w kanwie
  // produkcyjnej — tu chcemy WSZYSTKIE Ik'' widoczne do oceny). LOD 2 => do 3 linii.
  const resultLabels = buildResultLabelsFromScene(scene, payload, singleHop);
  const MAX_LINES_L2 = 3;
  interface BusLabel {
    readonly cx: number;
    readonly cy: number;
    readonly lines: readonly string[];
  }
  const busLabels: BusLabel[] = [];
  for (const seg of scene.segments) {
    if (seg.meta?.elementKind !== 'bus') continue;
    const ownerRef = seg.meta?.ownerRef;
    if (!ownerRef) continue;
    const entry = resultLabels[ownerRef];
    if (!entry || entry.lines.length === 0) continue;
    const px = seg.points.map((p) => p.x);
    const py = seg.points.map((p) => p.y);
    const cx = (Math.min(...px) + Math.max(...px)) / 2;
    const cy = (Math.min(...py) + Math.max(...py)) / 2;
    busLabels.push({
      cx,
      cy,
      lines: entry.lines.slice(0, MAX_LINES_L2).map((l) => `${l.prefix} ${l.text}`),
    });
  }

  // bbox sceny
  const bxs: number[] = [];
  const bys: number[] = [];
  for (const s of scene.symbols) {
    const def = SYMBOL_DEFS[s.symbolId as SymbolId];
    bxs.push(s.x, s.x + (def?.width ?? 0));
    bys.push(s.y, s.y + (def?.height ?? 0));
  }
  for (const s of scene.segments) for (const p of s.points) { bxs.push(p.x); bys.push(p.y); }
  const minX = Math.min(...bxs);
  const minY = Math.min(...bys);
  const sceneW = Math.max(...bxs) - minX;
  const sceneH = Math.max(...bys) - minY;
  const HEADER = 96;
  const CW = 2800;
  const scale = CW / sceneW;
  const CH = Math.round(sceneH * scale) + HEADER + 24;
  const tx = (x: number): number => 20 + (x - minX) * scale;
  const ty = (y: number): number => HEADER + (y - minY) * scale;

  const parts: string[] = [];
  for (const seg of scene.segments) {
    const d = seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ');
    const isBus = seg.meta?.elementKind === 'bus';
    parts.push(
      `<path d="${d}" fill="none" stroke="${isBus ? TXT : WIRE}" stroke-width="${isBus ? 1.4 : 0.8}" opacity="${isBus ? 0.95 : 0.7}"/>`,
    );
  }
  for (const s of scene.symbols) {
    const def = SYMBOL_DEFS[s.symbolId as SymbolId];
    const Glyph = SYMBOL_GLYPHS[s.symbolId as SymbolId];
    if (!def || !Glyph) continue;
    parts.push(
      `<g transform="translate(${tx(s.x).toFixed(1)},${ty(s.y).toFixed(1)}) scale(${scale})">` +
        renderToStaticMarkup(<Glyph x={0} y={0} state={s.state as 'closed' | 'open' | 'unknown' | undefined} stroke={TXT} />) +
        `</g>`,
    );
  }
  const FS = 9;
  const boxLineH = FS + 2.5;
  for (const bl of busLabels) {
    const cx = tx(bl.cx);
    const cy = ty(bl.cy);
    const boxW = Math.max(...bl.lines.map((s) => s.length)) * FS * 0.56 + 10;
    const boxH = bl.lines.length * boxLineH + 5;
    const bx = cx - boxW / 2;
    const by = cy - boxH - 8; // nad szyna
    parts.push(
      `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(by + boxH).toFixed(1)}" stroke="${RESULT}" stroke-width="0.7" opacity="0.8"/>`,
      `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="2.5" fill="#0b131b" stroke="${RESULT}" stroke-width="1"/>`,
    );
    bl.lines.forEach((line, i) => {
      parts.push(
        `<text x="${cx.toFixed(1)}" y="${(by + 5 + boxLineH * (i + 0.75)).toFixed(1)}" text-anchor="middle" ` +
          `font-family="Inter, system-ui, sans-serif" font-size="${FS}" font-weight="600" fill="${RESULT}">${escapeXml(line)}</text>`,
      );
    });
  }
  const title =
    `<text x="20" y="36" font-family="Inter, system-ui, sans-serif" font-size="24" font-weight="700" fill="${TXT}">` +
    `Siec demonstracyjna L2 — WARSTWA ZWARCIA (SC IEC 60909), Ik'' na ${nSc} szynach SN</text>` +
    `<text x="20" y="64" font-family="Inter, system-ui, sans-serif" font-size="14" fill="${SUB}">` +
    `Wartosci 1:1 z realnego biegu solvera (demoOzeSc.sc.json) · slot SC_BUS: Ik'' / ip / Ith (L2, top-3) · ` +
    `zakres Ik''=[${scFixture.ikss_min_ka}..${scFixture.ikss_max_ka}] kA · ${busLabels.length} szyn z etykieta · zero fizyki w UI</text>` +
    `<text x="20" y="86" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${SUB}">` +
    `Tresc etykiet produkcyjna (buildResultLabelsFromScene, slot SC_BUS) · c=1,10 · agregacja/declutter R2 aktywne w kanwie interaktywnej · kazda stacja z inna konfiguracja OZE (patrz galeria)</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CW + 40}" height="${CH}" viewBox="0 0 ${CW + 40} ${CH}">` +
    `<rect width="${CW + 40}" height="${CH}" fill="${CANVAS_BACKGROUND}"/>${title}${parts.join('')}</svg>`;
  writeFileSync(`${OUT}/demo-oze-zwarcie-l2.svg`, svg);
  console.log('wrote', 'demo-oze-zwarcie-l2.svg', `szyny_SC=${nSc} etykiet=${busLabels.length}`);
}
