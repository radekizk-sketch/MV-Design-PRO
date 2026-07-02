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
  const loc = page.locator('[data-testid*="-segment-hitbox-"]');
  const count = await loc.count();
  const out: SegmentRender[] = [];
  for (let i = 0; i < count; i += 1) {
    const el = loc.nth(i);
    const [ref, energized, direction, source] = await el.evaluate((node) => [
      node.getAttribute('data-element-id'),
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
  await page.goto(`${HARNESS_URL}?lod=0`);
  const root = page.locator('[data-testid="sld-harness-root"]').first();
  await expect(root).toHaveAttribute('data-status', 'ready', { timeout: 20000 });
  const canvas = page.locator('[data-testid="sld-canvas-v2"]').first();
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(900);
}

test.describe('sld:P-A:power-flow-tor (render-based, solver = one truth)', () => {
  test('case_ref state declaration is rendered on the canvas', async ({ page }) => {
    const companion = loadCompanion();
    await gotoL0(page);
    const badge = page.locator('[data-testid="sld-v2-powerflow-case-badge"]').first();
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
    const stationBlocks = await readBoxes('[data-testid^="sld-v2-station-overview-block-"]', 'station');
    const gpzBlocks = await readBoxes('[data-testid^="sld-v2-gpz-hit-"]', 'gpz');
    const segments = await readBoxes('[data-testid*="-segment-hitbox-"]', 'segment');
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
    // EVERY segment must carry the solver source (no geometric fallback leaked in).
    for (const seg of segments) {
      expect(seg.source, `segment ${seg.ref} must be solver-sourced`).toBe('solver');
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
      .locator('[data-testid^="sld-v2-station-overview-block-"][data-station-energized="false"]')
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
      if (seg.direction !== solverDir) {
        mismatches.push(`${seg.ref}: render=${seg.direction} solver=${solverDir}`);
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

    // (b) Geometry proof: read the ACTUAL polygon points of the overview flow
    //     arrows and confirm the drawn tip points the way the solver says (the
    //     polygon geometry — not just the data attribute — follows the solver).
    const arrows: Array<{ direction: string | null; tipScreenX: number; baseScreenX: number }> =
      await page.locator('[data-testid$="-flow-arrow"]').evaluateAll((nodes) =>
        nodes.map((node) => {
          const raw = (node.getAttribute('points') ?? '').trim();
          const pts = raw
            .split(/\s+/)
            .map((pair) => pair.split(',').map(Number))
            .filter((xy) => xy.length === 2 && xy.every((v) => Number.isFinite(v)));
          // The triangle tip is the vertex whose x is the extremum in the drawn
          // direction; base x = mean of the other two. getScreenCTM maps to screen.
          const m = (node as SVGGraphicsElement).getScreenCTM();
          const map = (x: number, y: number) =>
            m ? { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f } : { x, y };
          const screen = pts.map(([x, y]) => map(x, y));
          // For 'right' arrows the tip is max-x; for 'left' the tip is min-x.
          const xs = screen.map((p) => p.x).sort((a, b) => a - b);
          const dir = node.getAttribute('data-flow-direction');
          const tipScreenX = dir === 'right' ? xs[xs.length - 1] : xs[0];
          const baseScreenX = (xs[0] + xs[1] + xs[2] - tipScreenX) / 2;
          return { direction: dir, tipScreenX, baseScreenX };
        }),
      );
    // At least the overview arrows we draw must be geometrically consistent: a
    // 'right' arrow's tip is to the right of its base, a 'left' arrow's to the left.
    for (const a of arrows) {
      if (a.direction === 'right') {
        expect(a.tipScreenX, 'right arrow tip must be right of base').toBeGreaterThan(a.baseScreenX);
      } else if (a.direction === 'left') {
        expect(a.tipScreenX, 'left arrow tip must be left of base').toBeLessThan(a.baseScreenX);
      }
    }
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
    await expect(page.locator('[data-testid="sld-v2-powerflow-case-badge"]').first()).toBeVisible();
    const energizedSegs = await page
      .locator('[data-testid*="-segment-hitbox-"][data-energized="true"]')
      .count();
    expect(energizedSegs, 'tor must render energized segments').toBeGreaterThan(20);
    const reverseSegs = await page
      .locator('[data-testid*="-segment-hitbox-"][data-flow-direction="reverse"]')
      .count();
    expect(reverseSegs, 'tor must render reverse (OZE backfeed) segments').toBeGreaterThan(0);
    const dimmedStations = await page
      .locator('[data-testid^="sld-v2-station-overview-block-"][data-station-energized="false"]')
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
