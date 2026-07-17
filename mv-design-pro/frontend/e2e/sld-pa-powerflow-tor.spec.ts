/**
 * P-A POWER-FLOW TOR — render-based invariant asserts (N-1, N-2, N-3, N-7).
 *
 * GOVERNING PRINCIPLE: the SLD is a PROJECTION of the math model. What it draws
 * MUST equal what the FROZEN power-flow solver computed. These asserts measure the
 * REAL render (DOM geometry + attributes via Playwright — the M-02 boundingBox
 * pattern) and compare it to the committed solver companion
 * (`/test-fixtures/sldSubstrate52s.powerflow.json`). They are NOT reproducing the
 * geometry: the companion is the SOLVER's output, and the render is read from the
 * browser. Any divergence = a "second truth" defect and turns these red.
 *
 *  N-1 CONTINUITY  — every drawn cable-run segment endpoint coincides with a real
 *                    block/GPZ port (zero free ends); zero unconnected blocks.
 *  N-2 ENERGIZED   — the rendered energized-set (per-segment `data-energized` read
 *                    from the DOM) EQUALS the solver `energized_branch_refs`
 *                    (set-equality on the render). De-energized stations dimmed.
 *  N-3 DIRECTION   — the rendered direction per branch (per-segment
 *                    `data-flow-direction`, sourced `solver`) EQUALS the solver
 *                    sign(P) — including reversed OZE-backfeed branches. The single
 *                    overview arrow's ACTUAL polygon geometry is also measured to
 *                    prove the drawn tip follows the solver, not the route order.
 *  N-7 DETERMINISM — same snapshot + case_ref → identical geometry hash on reload.
 *
 * NO dimension/geometry literal drives a pass here: the boxes/points come from the
 * browser's layout of the committed substrate, and the truth comes from the
 * committed solver companion.
 */
import { test, expect } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const _dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_URL = 'http://127.0.0.1:5173/screenshot-harness.html';

// The committed solver companion (the ONE TRUTH the render must match).
const COMPANION_PATH = path.resolve(
  _dirname,
  '../public/test-fixtures/sldSubstrate52s.powerflow.json',
);

interface Companion {
  readonly case_ref: string;
  readonly case_label: string;
  readonly converged: boolean;
  readonly branch_flow: Record<string, { direction: string; p_from_mw: number }>;
  readonly energized_branch_refs: string[];
  readonly energized_bus_refs: string[];
  readonly de_energized_bus_refs: string[];
  readonly open_point_branch_refs: string[];
}

function loadCompanion(): Companion {
  return JSON.parse(fs.readFileSync(COMPANION_PATH, 'utf-8')) as Companion;
}

interface SegmentRender {
  readonly ref: string;
  readonly energized: string | null;
  readonly direction: string | null;
  readonly source: string | null;
  readonly box: { x: number; y: number; width: number; height: number } | null;
}

/** Read each rendered cable-run SEGMENT (hitbox carries the ENM ref + solver
 *  attributes). This is the REAL render: ids/attrs/boxes from the browser. */
async function readSegments(page: import('@playwright/test').Page): Promise<SegmentRender[]> {
  // Adaptacja v3 (2026-07-17): odcinek = <path data-owner-ref="seg/…">
  // z atrybutami solverowymi nakładki (data-energized / data-flow-direction /
  // data-flow-source) — dawne hitboxy z data-element-id były kontraktem v2.
  const loc = page.locator('path[data-owner-ref^="seg/"]');
  const count = await loc.count();
  const out: SegmentRender[] = [];
  for (let i = 0; i < count; i += 1) {
    const el = loc.nth(i);
    const [ref, energized, direction, source] = await el.evaluate((node) => [
      node.getAttribute('data-owner-ref'),
      node.getAttribute('data-energized'),
      node.getAttribute('data-flow-direction'),
      node.getAttribute('data-flow-source'),
    ]);
    if (!ref) continue;
    const box = await el.boundingBox();
    out.push({ ref, energized, direction, source, box });
  }
  return out;
}

async function gotoL0(page: import('@playwright/test').Page): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  // `overlay=pf` — nakładka P-A na żądanie (rendery bazowe innych spec
  // pozostają rysunkiem bazowym; patrz `overlayRequested` w harnessie).
  await page.goto(`${HARNESS_URL}?lod=0&overlay=pf`);
  const root = page.locator('[data-testid="sld-harness-root"]').first();
  await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 20000 });
  const canvas = page.locator('[data-testid="sld-canvas-v3"]').first();
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(900);
}

test.describe('sld:P-A:power-flow-tor (render-based, solver = one truth)', () => {
  test('case_ref state declaration is rendered on the canvas', async ({ page }) => {
    const companion = loadCompanion();
    await gotoL0(page);
    const badge = page.locator('[data-testid="sld-v3-overlay-provenance"]').first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute('data-case-ref', companion.case_ref);
    await expect(badge).toHaveAttribute('data-converged', String(companion.converged));
  });

  test('N-1: every drawn segment connects to a real block/GPZ (zero free ends; zero unconnected blocks)', async ({ page }) => {
    await gotoL0(page);

    interface Box { id: string; x: number; y: number; width: number; height: number; }
    const readBoxes = async (selector: string, kind: string): Promise<Box[]> => {
      const loc = page.locator(selector);
      const n = await loc.count();
      const boxes: Box[] = [];
      for (let i = 0; i < n; i += 1) {
        const el = loc.nth(i);
        const id = (await el.getAttribute('data-element-id'))
          ?? (await el.getAttribute('data-testid'))
          ?? `${kind}-${i}`;
        const box = await el.boundingBox();
        if (box) boxes.push({ id, ...box });
      }
      return boxes;
    };

    // REAL rendered geometry (browser boundingBoxes — the M-02 primitive). NO
    // geometry is reproduced here: every box comes from the live layout.
    const stationBlocks = await readBoxes('[data-testid^="sld-v3-l0-"]', 'station');
    const gpzBlocks = await readBoxes('[data-testid^="gpz-canonical-"]', 'gpz');
    const segments = await readBoxes('path[data-owner-ref^="seg/"]', 'segment');
    expect(stationBlocks.length, 'substrate must render its station blocks').toBeGreaterThanOrEqual(50);
    expect(segments.length, 'substrate must render its cable-run segments').toBeGreaterThan(20);

    const blocks = [...stationBlocks, ...gpzBlocks];

    // Connection tolerance is DERIVED from the rendered block size (NOT a fabricated
    // literal): an endpoint within ~one block-width of a port sits at that block's
    // port region (the renderer snaps cable ends to station ports within a similar
    // band). A truly floating edge, > one block-width from every block AND every
    // other segment, still fails → the assert can go red on a real disconnect.
    const medianBlockW =
      [...stationBlocks].map((b) => b.width).sort((a, c) => a - c)[Math.floor(stationBlocks.length / 2)] ?? 64;
    const PORT_TOL = medianBlockW; // ≈ one block width (render-derived).
    const SEAM_TOL = 8; // segment↔segment shared port (touching).

    const gap = (a: Box, b: Box): number => {
      const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
      const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
      return Math.hypot(dx, dy);
    };

    // (1) ZERO FREE ENDS: every drawn segment must connect to a real port — either
    //     a block (within one block-width port region) OR another segment (shared
    //     junction). A floating edge connects to neither → red.
    const floating: string[] = [];
    for (const seg of segments) {
      const nearBlock = blocks.some((b) => gap(seg, b) <= PORT_TOL);
      const touchesSeg = segments.some((other) => other !== seg && gap(seg, other) <= SEAM_TOL);
      if (!nearBlock && !touchesSeg) {
        floating.push(`${seg.id} @ (${seg.x.toFixed(0)},${seg.y.toFixed(0)})`);
      }
    }
    expect(
      floating.length,
      `floating segments (no block port and no neighbouring segment): ${floating.slice(0, 12).join('; ')}`,
    ).toBe(0);

    // (2) ZERO UNCONNECTED BLOCKS: every station block must have ≥1 segment at its
    //     port (it sits on a cable run). An orphan block has none → red.
    const unconnected: string[] = [];
    for (const block of stationBlocks) {
      if (!segments.some((seg) => gap(seg, block) <= PORT_TOL)) {
        unconnected.push(block.id);
      }
    }
    expect(
      unconnected.length,
      `station blocks with no connected segment: ${unconnected.slice(0, 12).join('; ')}`,
    ).toBe(0);
  });

  test('N-2: rendered energized-set EQUALS the solver energized-set (set-equality on the render)', async ({ page }) => {
    const companion = loadCompanion();
    await gotoL0(page);

    const segments = await readSegments(page);
    expect(segments.length, 'expected rendered segments').toBeGreaterThan(20);

    // The rendered energized set = segment refs whose DOM data-energized="true".
    // EVERY segment that declares a flow direction must carry the solver source
    // (no geometric fallback leaked in). Segments with NO flow (solver "none")
    // carry neither attribute — absence == solver's zero-flow, by contract.
    for (const seg of segments) {
      if (seg.direction !== null) {
        expect(seg.source, `segment ${seg.ref} must be solver-sourced`).toBe('solver');
      }
    }
    const renderedEnergized = new Set(
      segments.filter((s) => s.energized === 'true').map((s) => s.ref),
    );
    const solverEnergized = new Set(
      companion.energized_branch_refs.filter((ref) =>
        segments.some((s) => s.ref === ref),
      ),
    );

    // Set-equality, asserted on the render. (Restrict the solver set to refs that
    // are actually drawn as cable-run segments — switch/transformer branches are
    // energized too but are not cable-run hitboxes.)
    const missingInRender = [...solverEnergized].filter((r) => !renderedEnergized.has(r));
    const extraInRender = [...renderedEnergized].filter((r) => !solverEnergized.has(r));
    expect(
      missingInRender.length,
      `solver-energized segments NOT rendered energized: ${missingInRender.slice(0, 12).join('; ')}`,
    ).toBe(0);
    expect(
      extraInRender.length,
      `segments rendered energized but NOT solver-energized: ${extraInRender.slice(0, 12).join('; ')}`,
    ).toBe(0);

    // The de-energized stub MUST be visible as ≥1 dimmed station block (the solver
    // reported a non-empty de-energized bus set).
    expect(companion.de_energized_bus_refs.length).toBeGreaterThan(0);
    const dimmed = await page
      .locator('[data-testid^="sld-v3-l0-"][data-energized="false"]')
      .count();
    expect(dimmed, 'the open NOP must render ≥1 de-energized (dimmed) station block').toBeGreaterThanOrEqual(1);
  });

  test('N-3: rendered direction per branch EQUALS solver sign(P) (incl. reversed OZE branches)', async ({ page }) => {
    const companion = loadCompanion();
    await gotoL0(page);

    const segments = await readSegments(page);
    expect(segments.length).toBeGreaterThan(20);

    // (a) Per-branch: the DOM direction (read from the render) must equal the
    //     solver direction for EVERY drawn segment — forward AND reverse.
    const mismatches: string[] = [];
    let reverseSeen = 0;
    let forwardSeen = 0;
    for (const seg of segments) {
      const solverDir = companion.branch_flow[seg.ref]?.direction ?? 'none';
      // Contract: NO data-flow-direction attribute == solver zero-flow ("none").
      const renderDir = seg.direction ?? 'none';
      if (renderDir !== solverDir) {
        mismatches.push(`${seg.ref}: render=${renderDir} solver=${solverDir}`);
      }
      if (solverDir === 'reverse') reverseSeen += 1;
      if (solverDir === 'forward') forwardSeen += 1;
    }
    expect(
      mismatches.length,
      `direction mismatches render vs solver: ${mismatches.slice(0, 12).join('; ')}`,
    ).toBe(0);
    // The tor must genuinely be bidirectional on the render: both seen.
    expect(forwardSeen, 'expected forward-flow segments drawn').toBeGreaterThan(0);
    expect(reverseSeen, 'expected reverse-flow (OZE backfeed) segments drawn').toBeGreaterThan(0);

    // (b) Geometry proof: read the ACTUAL polygon points of every v3 flow arrow
    //     and confirm the drawn tip points along the branch's from→to path
    //     direction IFF the solver says 'forward' (the polygon geometry — not
    //     just the data attribute — follows the solver). The from→to axis is
    //     measured from the REAL rendered segment path (`d` command endpoints
    //     in path order = fromTerminal → toTerminal), not reproduced.
    interface ArrowRead {
      readonly ownerRef: string;
      readonly forwardAttr: boolean;
      readonly dot: number; // (tip−baseMid)·(local from→to path dir); >0 = forward-drawn
      readonly matchedRun: boolean;
    }
    const arrows: ArrowRead[] = await page
      .locator('g[data-flow-owner-ref]')
      .evaluateAll((groups) => {
        const parseXY = (raw: string): number[][] =>
          raw
            .trim()
            .split(/\s+/)
            .map((pair) => pair.split(',').map(Number))
            .filter((xy) => xy.length === 2 && xy.every((v) => Number.isFinite(v)));
        const out: Array<{ ownerRef: string; forwardAttr: boolean; dot: number; matchedRun: boolean }> = [];
        for (const g of groups) {
          const ownerRef = g.getAttribute('data-flow-owner-ref');
          const poly = g.querySelector('polygon');
          if (!ownerRef || !poly) continue;
          const pts = parseXY(poly.getAttribute('points') ?? '');
          if (pts.length !== 3) continue;
          // Tip = the vertex farthest from the midpoint of the other two
          // (isoceles arrow: axis length > base half-width by construction).
          let tipIdx = 0;
          let best = -1;
          for (let i = 0; i < 3; i += 1) {
            const o1 = pts[(i + 1) % 3];
            const o2 = pts[(i + 2) % 3];
            const mx = (o1[0] + o2[0]) / 2;
            const my = (o1[1] + o2[1]) / 2;
            const d = Math.hypot(pts[i][0] - mx, pts[i][1] - my);
            if (d > best) {
              best = d;
              tipIdx = i;
            }
          }
          const tip = pts[tipIdx];
          const b1 = pts[(tipIdx + 1) % 3];
          const b2 = pts[(tipIdx + 2) % 3];
          const baseMid = [(b1[0] + b2[0]) / 2, (b1[1] + b2[1]) / 2];
          const axis = [tip[0] - baseMid[0], tip[1] - baseMid[1]];
          // The REAL rendered path for this branch: its `d` endpoints, in path
          // order (fromTerminal → toTerminal). Bridge arcs re-join the run line,
          // so consecutive endpoints still trace the run direction.
          const pathEl = document.querySelector(`path[data-owner-ref="${ownerRef}"]`);
          const d = pathEl?.getAttribute('d') ?? '';
          const cmdEnds: number[][] = [];
          const re = /[MLA][^MLA]*/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(d)) !== null) {
            const nums = (m[0].slice(1).trim().match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
            if (nums.length >= 2) cmdEnds.push([nums[nums.length - 2], nums[nums.length - 1]]);
          }
          // Find the consecutive endpoint pair whose segment contains baseMid.
          let dot = 0;
          let matchedRun = false;
          for (let i = 0; i + 1 < cmdEnds.length; i += 1) {
            const [ax, ay] = cmdEnds[i];
            const [bx, by] = cmdEnds[i + 1];
            const minX = Math.min(ax, bx) - 1;
            const maxX = Math.max(ax, bx) + 1;
            const minY = Math.min(ay, by) - 1;
            const maxY = Math.max(ay, by) + 1;
            const distToLine =
              Math.hypot(bx - ax, by - ay) < 1e-6
                ? Math.hypot(baseMid[0] - ax, baseMid[1] - ay)
                : Math.abs((bx - ax) * (ay - baseMid[1]) - (ax - baseMid[0]) * (by - ay)) /
                  Math.hypot(bx - ax, by - ay);
            if (
              baseMid[0] >= minX && baseMid[0] <= maxX &&
              baseMid[1] >= minY && baseMid[1] <= maxY &&
              distToLine <= 1
            ) {
              dot = axis[0] * (bx - ax) + axis[1] * (by - ay);
              matchedRun = true;
              break;
            }
          }
          out.push({
            ownerRef,
            forwardAttr: g.getAttribute('data-flow-forward') === 'true',
            dot,
            matchedRun,
          });
        }
        return out;
      });
    expect(arrows.length, 'expected rendered flow arrows').toBeGreaterThan(0);
    const geomMismatch: string[] = [];
    for (const a of arrows) {
      // (b1) Attribute truth: the rendered forward flag EQUALS the solver sign(P).
      const solverDir = companion.branch_flow[a.ownerRef]?.direction;
      if (solverDir === 'forward' || solverDir === 'reverse') {
        expect(
          a.forwardAttr,
          `arrow ${a.ownerRef}: data-flow-forward must equal solver direction`,
        ).toBe(solverDir === 'forward');
      }
      // (b2) Geometry truth: the drawn tip axis vs the REAL path from→to run.
      if (!a.matchedRun) {
        geomMismatch.push(`${a.ownerRef}: arrow base not found on its rendered path`);
      } else if (a.dot === 0 || (a.dot > 0) !== a.forwardAttr) {
        geomMismatch.push(`${a.ownerRef}: tip dot=${a.dot} vs forward=${a.forwardAttr}`);
      }
    }
    expect(
      geomMismatch.length,
      `arrow tips diverging from solver direction: ${geomMismatch.slice(0, 12).join('; ')}`,
    ).toBe(0);
  });

  test('N-7: same snapshot + case_ref → identical geometry hash on reload (determinism)', async ({ page }) => {
    const hashRun = async (): Promise<string> => {
      await gotoL0(page);
      // Geometry signature = sorted (segment ref, energized, direction, rounded box).
      const segs = await readSegments(page);
      const sig = segs
        .map((s) => `${s.ref}|${s.energized}|${s.direction}|${s.box ? `${Math.round(s.box.x)},${Math.round(s.box.y)},${Math.round(s.box.width)},${Math.round(s.box.height)}` : 'nil'}`)
        .sort()
        .join('\n');
      // Simple stable digest (FNV-1a) — no crypto dependency needed.
      let h = 0x811c9dc5;
      for (let i = 0; i < sig.length; i += 1) {
        h ^= sig.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16);
    };
    const h1 = await hashRun();
    const h2 = await hashRun();
    expect(h2, 'L0 tor geometry+state must be deterministic across reloads').toBe(h1);
  });

  test('screenshot: L0 oddalony view WITH the power-flow tor → save PNG', async ({ page }) => {
    await gotoL0(page);

    // The tor must be visible: case badge + energized segments + ≥1 reverse arrow
    // + a de-energized (dimmed) station beyond the NOP.
    await expect(page.locator('[data-testid="sld-v3-overlay-provenance"]').first()).toBeVisible();
    const energizedSegs = await page
      .locator('path[data-owner-ref^="seg/"][data-energized="true"]')
      .count();
    expect(energizedSegs, 'tor must render energized segments').toBeGreaterThan(20);
    const reverseSegs = await page
      .locator('path[data-owner-ref^="seg/"][data-flow-direction="reverse"]')
      .count();
    expect(reverseSegs, 'tor must render reverse (OZE backfeed) segments').toBeGreaterThan(0);
    const dimmedStations = await page
      .locator('[data-testid^="sld-v3-l0-"][data-energized="false"]')
      .count();
    expect(dimmedStations, 'tor must render the de-energized stub beyond the NOP').toBeGreaterThanOrEqual(1);

    const outDir = path.resolve(_dirname, '../../docs/audit/visual');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'sld_substrate_53_PA_tor.png');
    await page.screenshot({ path: outPath, fullPage: false });
    expect(fs.existsSync(outPath)).toBe(true);
    console.log(`Saved P-A tor screenshot: ${outPath} (energized=${energizedSegs} reverse=${reverseSegs} dimmed_stations=${dimmedStations})`);
  });
});
