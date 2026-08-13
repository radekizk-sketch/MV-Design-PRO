/**
 * OCENA SIECI (2026-07-24) — zrzuty żywej aplikacji do oceny właściciela po
 * scaleniu programów WYNIKI-SLD, DOBOR-OZE, MODEL SOLVERA TR, CT/VT, KROPKA.
 * Sieć referencyjna: `sldSubstrate52s` (53 stacje) — realny model + realny
 * bieg Newton-Raphson (`sldSubstrate52s.powerflow.json`, p_from_mw 1:1).
 * Zrzuty:
 *  - ocena-l0/l1/l2 : PEŁNA sieć na L0/L1/L2 produkcyjną kanwą SldCanvasV3
 *    (histereza LOD S8; sylwetka/rozdzielnia/tor mocy) — „wszystko LOD".
 *  - ocena-gpz      : DETAL GPZ (źródło + rozdzielnia sieciowa) w powiększeniu.
 *  - ocena-wyniki   : PEŁNA sieć L2 z WARSTWĄ WYNIKOWĄ (R1–R4) — realne moce
 *    czynne przęseł z biegu NR, znak +/− = kierunek, priorytety/agregacja R2.
 *
 * Uruchomienie (cwd: mv-design-pro/frontend):
 *   CANON_OUT=<dir> npx vite-node scripts/render_ocena_siec.tsx
 *   CANON_OUT=<dir> node scripts/rasterize.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';

import type { EnergyNetworkModel } from '../src/types/enm';
import { buildSceneV3, SCENE_LOD_LABELS_PL, type SceneV3 } from '../src/ui/sld/v3/scene/buildScene';
import { SldCanvasV3, sceneBoxToCameraWorld } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import { SYMBOL_DEFS, type SymbolId } from '../src/ui/sld/v3/symbols/defs';
import { SYMBOL_GLYPHS } from '../src/ui/sld/v3/symbols/glyphs';
import { buildResultLabelsForSnapshot } from '../src/ui/sld/v3/canvas/SldCanvasV3Workspace';
import { computeResultLabelPlacements } from '../src/ui/sld/v3/canvas/SldCanvasV3';
import type { CameraState } from '../src/ui/sld/v3/canvas/camera';
import { CANVAS_BACKGROUND } from '../src/ui/sld/v3/theme/colorTokens';
import { LABEL_TYPOGRAPHY, labelLineHeight } from '../src/ui/sld/v3/core/text';
import type { RawOverlayElement, RawOverlayPayload } from '../src/ui/sld-overlay/rawResultOverlayStore';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.CANON_OUT ?? '/tmp/canon';
mkdirSync(OUT, { recursive: true });

const enmPath = resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json');
const enm = (JSON.parse(readFileSync(enmPath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
const pfPath = resolve(HERE, '../src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.powerflow.json');
const pf = JSON.parse(readFileSync(pfPath, 'utf8')) as {
  readonly branch_flow: Record<string, { readonly direction: string; readonly p_from_mw?: number }>;
  readonly solver_method: string;
  readonly case_label: string;
};

const TXT = '#E8EEF4';
const SUB = '#9FB3C8';
const RESULT = '#B39DDB';
const WIRE = '#8FA8BE';
const FOOTER = 64;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Produkcyjna kanwa SldCanvasV3 na wskazanym LOD + pas stopki z opisem opcji. */
function renderCanvasLod(lod: 0 | 1 | 2, opcje: string, file: string): void {
  const W = 2000;
  const H = 1180;
  const scene = buildSceneV3(enm, lod);
  const inner = renderToStaticMarkup(
    <SldCanvasV3 snapshot={enm} width={W} height={H} lodOverride={lod} />,
  ).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const line1 = `Widok: ${SCENE_LOD_LABELS_PL[lod]} (L${lod}) · sieć terenowa ${scene.meta.stationCount} stacji · produkcyjna kanwa SLD v3`;
  const footer =
    `<rect x="0" y="${H}" width="${W}" height="${FOOTER}" fill="${CANVAS_BACKGROUND}" />` +
    `<text x="18" y="${H + 26}" font-family="Inter, system-ui, sans-serif" font-size="21" font-weight="600" fill="${TXT}">${escapeXml(line1)}</text>` +
    `<text x="18" y="${H + 50}" font-family="Inter, system-ui, sans-serif" font-size="14" fill="${SUB}">Opcje: ${escapeXml(opcje)}</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + FOOTER}" viewBox="0 0 ${W} ${H + FOOTER}">` +
    `<rect width="${W}" height="${H + FOOTER}" fill="${CANVAS_BACKGROUND}"/>${inner}${footer}</svg>`;
  writeFileSync(`${OUT}/${file}.svg`, svg);
  console.log('wrote', `${file}.svg`, `stacje=${scene.meta.stationCount}`);
}

// --- (1) Wszystkie LOD pełnej sieci -----------------------------------------
renderCanvasLod(0, 'histereza LOD (S8) · sylwetka stacji mini-RMU · rozdzielnia sieciowa/GPZ · tor mocy z wagą', 'ocena-l0');
renderCanvasLod(1, 'histereza LOD · rozwinięcie pól/aparatów · kropki połączeń węzłowych (IEC 60617)', 'ocena-l1');
renderCanvasLod(2, 'pełne pola i aparaty · oznaczenia z danych · CT/VT · podwarstwy L2-A/B/C/D', 'ocena-l2');

// --- (2) Detal GPZ (źródło + rozdzielnia) -----------------------------------
//
// KADR WYCHODZI Z KANWY, NIE JEST NA NIĄ NAKŁADANY.
// Ta sekcja rysowała detal WŁASNĄ, równoległą pętlą po `scene.segments` /
// `scene.symbols` / `scene.labels`. Skutek zmierzony na zrzucie 2026-08-08:
// obraz miał DWA elementy tekstowe (tytuł i podtytuł) i ANI JEDNEJ etykiety
// rysunku, mimo że jego własny podpis obiecuje „aparaty z oznaczeniami z
// danych". Przyczyna: pętla czytała `lab.x`/`lab.y`/`lab.fontSize`, a
// `OwnedLabel` niesie prostokąt tuszu (`rect`) i nie ma tych pól od czasu
// przebudowy etykiet — `inWin(undefined, undefined)` odrzucał więc KAŻDĄ
// etykietę. Nic tego nie wykryło, bo `frontend/scripts/**` stoi poza bramką
// typów (`tsconfig.json` obejmuje wyłącznie `src`).
//
// Rozstrzygnięcie jest już w repo i pochodzi z karty, która wprowadziła
// `cameraOverride`: „sonda, która zniekształca mierzony obiekt, jest defektem
// tej samej wagi co defekt produktu — kadr musi wychodzić z kanwy". Tamta karta
// naprawiła swoją instancję; ta sekcja była kolejną instancją TEJ SAMEJ klasy.
// Detal renderuje więc PRODUKCYJNA kanwa z podanym `CameraState` (ten sam
// wzorzec co `scripts/render_blok_pusty.tsx`), a nie drugi renderer.
{
  const scene = buildSceneV3(enm, 2);
  const sceny = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: scene } as const;
  // GPZ = symbol źródła; kadr wokół niego.
  const src = scene.symbols.find((s) => s.meta?.elementKind === 'source');
  const cx = src ? src.x + (SYMBOL_DEFS[src.symbolId as SymbolId]?.width ?? 0) / 2 : 0;
  const cy = src ? src.y + (SYMBOL_DEFS[src.symbolId as SymbolId]?.height ?? 0) / 2 : 0;
  const KADR = { width: 1500, height: 900 } as const;
  const SCALE = 1.6; // powiększenie detalu GPZ
  const HEADER = 78;
  // Świat kamery = świat sceny przesunięty o offset kanwy (`sceneBoxToCameraWorld`).
  const offset = sceneBoxToCameraWorld({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  const srodek = { x: cx + offset.minX, y: cy + offset.minY };
  const bboxKamery = (s: SceneV3) =>
    sceneBoxToCameraWorld({ minX: s.bbox.x, minY: s.bbox.y, maxX: s.bbox.x + s.bbox.width, maxY: s.bbox.y + s.bbox.height });
  const kamera: CameraState = {
    transform: {
      scale: SCALE,
      translateX: KADR.width / 2 - srodek.x * SCALE,
      // Źródło stoi w 1/3 wysokości kadru: GPZ rozwija się POD nim (transformator,
      // szyna SN, pola), więc kadr wyśrodkowany na źródle zostawiałby górną
      // połowę pustą — pustka KADRU, nie rysunku.
      translateY: KADR.height / 3 - srodek.y * SCALE,
    },
    lod: 2,
    viewportSize: KADR,
    lodBboxes: { 0: bboxKamery(sceny[0]), 1: bboxKamery(sceny[1]), 2: bboxKamery(sceny[2]) },
  };
  const inner = renderToStaticMarkup(
    <SldCanvasV3 snapshot={enm} width={KADR.width} height={KADR.height} lodOverride={2} cameraOverride={kamera} />,
  ).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  const title =
    `<text x="18" y="32" font-family="Inter, system-ui, sans-serif" font-size="21" font-weight="700" fill="${TXT}">` +
    `Detal GPZ — źródło sieciowe + rozdzielnia (L2, ×${SCALE})</text>` +
    `<text x="18" y="56" font-family="Inter, system-ui, sans-serif" font-size="14" fill="${SUB}">` +
    `Opcje: pola liniowe/transformatorowe · OLTC (przesunięcie fazowe grupy SM-2 w PF) · aparaty z oznaczeniami z danych · kropki węzłów</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${KADR.width}" height="${KADR.height + HEADER}" viewBox="0 0 ${KADR.width} ${KADR.height + HEADER}">` +
    `<rect width="${KADR.width}" height="${KADR.height + HEADER}" fill="${CANVAS_BACKGROUND}"/>${title}` +
    `<g transform="translate(0,${HEADER})">${inner}</g></svg>`;
  writeFileSync(`${OUT}/ocena-gpz.svg`, svg);
  console.log('wrote', 'ocena-gpz.svg', src ? `src=${src.meta?.ownerRef}` : 'brak src');
}

// --- (3) Pełna sieć L2 z warstwą wynikową (realne P z biegu NR) --------------
{
  const scene = buildSceneV3(enm, 2);
  // Payload wyników: realne p_from_mw per przęsło z biegu NR (zero fabrykacji).
  const elements: Record<string, RawOverlayElement> = {};
  let nWyniki = 0;
  for (const seg of scene.segments) {
    const ref = seg.meta?.ownerRef;
    if (!ref || ref.includes('#')) continue;
    // dopasowanie po prefiksie ref w kluczach branch_flow (seg/HASH/...)
    const flowKey = Object.keys(pf.branch_flow).find((k) => k === ref || k.startsWith(ref + '/') || ref.startsWith(k));
    const p = flowKey ? pf.branch_flow[flowKey]?.p_from_mw : undefined;
    if (p == null || elements[ref]) continue;
    elements[ref] = {
      ref_id: ref,
      kind: 'branch',
      badges: [],
      metrics: { P_MW: { code: 'P_MW', value: p, unit: 'MW', format_hint: 'fixed3' } },
      severity: 'INFO',
    };
    nWyniki += 1;
  }
  const payload: RawOverlayPayload = {
    run_id: 'ocena-nr',
    analysis_type: 'load_flow',
    elements,
  };
  // WEJŚCIE PRODUKCYJNE, nie własny potok. Skrypt ma pokazywać właścicielowi to,
  // co widzi aplikacja, więc etykiety liczy TA SAMA funkcja, którą woła kanwa
  // (`SldCanvasV3Workspace.buildResultLabelsForSnapshot`) — razem z bramką przęseł
  // (klucze `orientedSegmentRefs`) i MOSTEM REFÓW (szyny stacji, blok stacji L0,
  // transformator stacji). Poprzednio skrypt składał ten potok sam, bez mostu, i
  // przy usunięciu bramki `singleHopSegmentRefs` przestał się w ogóle uruchamiać —
  // czego nic nie wykryło, bo `frontend/scripts/**` stoi poza bramką typów.
  const resultLabels = buildResultLabelsForSnapshot(enm, payload);
  const placements = computeResultLabelPlacements(scene, resultLabels, [], 2);

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
  const HEADER = 88;
  const CW = 2800;
  const scale = CW / sceneW;
  const CH = Math.round(sceneH * scale) + HEADER + 20;
  const tx = (x: number): number => 20 + (x - minX) * scale;
  const ty = (y: number): number => HEADER + (y - minY) * scale;

  const parts: string[] = [];
  for (const seg of scene.segments) {
    const d = seg.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${WIRE}" stroke-width="0.8" opacity="0.75"/>`);
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
  // Warstwa wynikowa: etykiety P na przęsłach (placements produkcyjne).
  // JEDNO ZRODLO PRAWDY dla podkladki i pisma (naprawa narzedzia oceny 2026-08-09).
  // Do tej poprawki podkladka byla skalowana (`p.width * scale`), a rozmiar pisma stal
  // zaszyty na 5,2 — dwie rozne podstawy, wiec tusz wychodzil poza wlasne tlo na
  // WSZYSTKICH 88 etykietach (zmierzone: tusz 33,00 przy podkladce 19,8). Produkcyjna
  // kanwa liczy oba z `measureLabelWidth(..., 't4')`; tu bierzemy ten sam rozmiar pisma
  // i te sama skale, wiec obraz oceny pokazuje to, co pokazuje produkt.
  const fontRes = LABEL_TYPOGRAPHY.t4.fontSize * scale;
  const lineH = labelLineHeight('t4') * scale;
  for (const p of placements) {
    parts.push(
      `<rect x="${tx(minX + (p.x - minX)).toFixed(1)}" y="${ty(minY + (p.y - minY)).toFixed(1)}" ` +
        `width="${(p.width * scale).toFixed(1)}" height="${(p.height * scale).toFixed(1)}" rx="1.5" ` +
        `fill="${CANVAS_BACKGROUND}" stroke="${RESULT}" stroke-width="0.6"/>`,
    );
    p.lines.forEach((line, i) => {
      parts.push(
        `<text x="${(tx(minX + (p.x - minX)) + (p.width * scale) / 2).toFixed(1)}" ` +
          `y="${(ty(minY + (p.y - minY)) + lineH * (i + 1)).toFixed(1)}" text-anchor="middle" ` +
          `font-family="Inter, system-ui, sans-serif" font-size="${fontRes.toFixed(2)}" font-weight="600" fill="${RESULT}">${escapeXml(`${line.prefix} ${line.text}`)}</text>`,
      );
    });
  }
  const title =
    `<text x="18" y="32" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="700" fill="${TXT}">` +
    `Sieć terenowa L2 z WARSTWĄ WYNIKOWĄ — rozpływ mocy (Newton-Raphson), ${nWyniki} przęseł z realną mocą czynną</text>` +
    `<text x="18" y="58" font-family="Inter, system-ui, sans-serif" font-size="14" fill="${SUB}">` +
    `Wartości 1:1 z biegu NR (sldSubstrate52s.powerflow.json) · znak +/− = kierunek · ${placements.length} etykiet po deklutterze (priorytety/agregacja R2) · zero fizyki w UI</text>` +
    `<text x="18" y="78" font-family="Inter, system-ui, sans-serif" font-size="13" fill="${SUB}">` +
    `Opcje warstwy: filtry (P/Q/I/U/przeciążenia) · progi severity · klik→panel/White Box · pochodzenie (moduł+czas) · tryb porównawczy · eksport SVG/PNG/PDF</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CW + 40}" height="${CH}" viewBox="0 0 ${CW + 40} ${CH}">` +
    `<rect width="${CW + 40}" height="${CH}" fill="${CANVAS_BACKGROUND}"/>${title}${parts.join('')}</svg>`;
  writeFileSync(`${OUT}/ocena-wyniki-l2.svg`, svg);
  console.log('wrote', 'ocena-wyniki-l2.svg', `wyniki=${nWyniki} etykiet=${placements.length}`);
}
