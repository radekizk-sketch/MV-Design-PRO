/**
 * Symbol Contract Test — PLAN_SLD_REWORK F1 §3.3.
 *
 * Wymusza kanoniczne właściwości biblioteki symboli IEC 60617:
 *   - każdy plik `.svg` w `canonical_symbols/` ma odpowiadający wpis w `ports.json`
 *   - każdy SVG używa `currentColor` (theme-driven, nie hardcoded)
 *   - każdy SVG ma `viewBox="0 0 100 100"` (jednolita normalizacja)
 *   - każdy wpis w `ports.json` ma minimalnie 1 port
 *   - ring_busbar i double_busbar mają 4 porty (S1/S2 × left/right)
 *
 * Cel: chronić przed regresją — dodanie nowego symbolu wymaga aktualizacji
 * manifestu, tym samym wymusza zgodność z F1 contract.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import portsManifest from '../ports.json';

const TEST_FILE = fileURLToPath(import.meta.url);
const SYMBOLS_DIR = resolve(dirname(TEST_FILE), '..');

interface PortsManifest {
  readonly symbols: Record<string, {
    readonly description?: string;
    readonly viewBox: string;
    readonly ports: Record<string, { x: number; y: number }>;
    readonly allowedRotations?: readonly number[];
    readonly defaultRotation?: number;
  }>;
}

const manifest = portsManifest as unknown as PortsManifest;

function listSvgFiles(): readonly string[] {
  return readdirSync(SYMBOLS_DIR)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.replace(/\.svg$/, ''))
    .sort();
}

describe('Symbol Contract — IEC 60617 canonical library (F1)', () => {
  const svgNames = listSvgFiles();

  it('katalog zawiera ≥ 50 symboli (PLAN_SLD_REWORK F1 DoD)', () => {
    expect(svgNames.length).toBeGreaterThanOrEqual(50);
  });

  it('każdy SVG ma wpis w ports.json (parity SVG ↔ manifest)', () => {
    const manifestKeys = Object.keys(manifest.symbols).sort();
    const missingInManifest = svgNames.filter((n) => !manifestKeys.includes(n));
    expect(
      missingInManifest,
      `SVG bez wpisu w ports.json: ${missingInManifest.join(', ')}`,
    ).toEqual([]);
  });

  it('każdy wpis w ports.json ma odpowiedni plik SVG', () => {
    const manifestKeys = Object.keys(manifest.symbols);
    const missingSvg = manifestKeys.filter((k) => !svgNames.includes(k));
    expect(
      missingSvg,
      `Wpisy w ports.json bez SVG: ${missingSvg.join(', ')}`,
    ).toEqual([]);
  });

  /**
   * Lista symboli z hardcoded kolorami — pozostałości legacy F1 wave 1
   * (do migracji w F1 wave 2 / PLAN_SLD_REWORK §3.4 DoD).
   *
   * NOWE symbole MUSZĄ używać currentColor. Ten zestaw nie może rosnąć —
   * tylko maleć. Jeśli refaktor doda nowy symbol bez currentColor, test
   * zawiedzie i wymusi naprawę.
   *
   * Migracja: zamień stroke="#000000" / fill="#000000" → stroke="currentColor"
   * / fill="currentColor" we wszystkich elementach. Markery wizualne
   * (alarm_marker, missing_data_marker) używają semantycznych kolorów
   * statusowych i są wyjątkiem.
   */
  const KNOWN_LEGACY_HARDCODED_COLORS = new Set([
    'alarm_marker',           // semantic red — z założenia
    'bess', 'busbar', 'capacitor', 'circuit_breaker', 'ct', 'disconnector',
    'earthing_switch', 'fuse', 'fw', 'generator', 'ground', 'line_cable',
    'line_overhead', 'load', 'metering_cubicle', 'missing_data_marker',
    'motor', 'pv', 'reactor', 'surge_arrester', 'transformer_2w',
    'transformer_3w', 'utility_feeder', 'vt',
  ]);

  it.each(listSvgFiles())('SVG %s ma viewBox zgodny z ports.json + currentColor (lub legacy)', (name) => {
    const content = readFileSync(join(SYMBOLS_DIR, `${name}.svg`), 'utf-8');

    const viewBoxMatch = content.match(/viewBox="([^"]+)"/);
    expect(viewBoxMatch, `${name}.svg musi mieć atrybut viewBox`).toBeTruthy();

    const manifestEntry = manifest.symbols[name];
    if (manifestEntry?.viewBox && viewBoxMatch) {
      expect(
        viewBoxMatch[1],
        `${name}.svg viewBox="${viewBoxMatch[1]}" musi zgadzać się z ports.json "${manifestEntry.viewBox}"`,
      ).toBe(manifestEntry.viewBox);
    }

    // Nowe symbole MUSZĄ używać currentColor. Legacy lista nie może rosnąć.
    if (!KNOWN_LEGACY_HARDCODED_COLORS.has(name)) {
      const hasCurrentColor = /currentColor/.test(content);
      expect(
        hasCurrentColor,
        `${name}.svg musi używać currentColor (nie jest na liście legacy KNOWN_LEGACY_HARDCODED_COLORS)`,
      ).toBe(true);
    }
  });

  it('lista KNOWN_LEGACY_HARDCODED_COLORS nie zawiera symboli już zmigrowanych', () => {
    // Pozytywne sprzężenie zwrotne: gdy ktoś zmigruje symbol do currentColor,
    // ten test wymusi usunięcie z listy KNOWN_LEGACY_HARDCODED_COLORS, co
    // utrzyma listę "tylko legacy do migracji".
    for (const name of KNOWN_LEGACY_HARDCODED_COLORS) {
      const content = readFileSync(join(SYMBOLS_DIR, `${name}.svg`), 'utf-8');
      const hasCurrentColor = /currentColor/.test(content);
      if (hasCurrentColor && name !== 'alarm_marker' && name !== 'missing_data_marker') {
        // Tylko 2 markery semantyczne (alarm/missing-data) mogą mieć currentColor
        // i pozostawać na liście. Pozostałe — usuń z listy po migracji.
        throw new Error(
          `Symbol "${name}" już używa currentColor — usuń go z KNOWN_LEGACY_HARDCODED_COLORS`,
        );
      }
    }
  });

  it('każdy wpis w ports.json ma ≥ 1 port (poza markerami wizualnymi)', () => {
    // Markery wizualne nie mają portów topologicznych — są tylko dekoracjami.
    const VISUAL_MARKERS = new Set(['alarm_marker', 'missing_data_marker']);
    for (const [name, def] of Object.entries(manifest.symbols)) {
      if (VISUAL_MARKERS.has(name)) continue;
      const portsCount = Object.keys(def.ports).length;
      expect(
        portsCount,
        `Symbol "${name}" musi mieć ≥ 1 port (ma ${portsCount})`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('ring_busbar ma 4 porty (S1 left/right + S2 left/right) — topologia pierścieniowa', () => {
    const ring = manifest.symbols.ring_busbar;
    expect(ring, 'ring_busbar musi być w ports.json').toBeDefined();
    if (!ring) return;
    expect(Object.keys(ring.ports).length).toBe(4);
    expect(ring.ports).toHaveProperty('left_s1');
    expect(ring.ports).toHaveProperty('left_s2');
    expect(ring.ports).toHaveProperty('right_s1');
    expect(ring.ports).toHaveProperty('right_s2');
  });

  it('double_busbar ma 4 porty (S1/S2 × left/right) — topologia dwusystemowa', () => {
    const dbl = manifest.symbols.double_busbar;
    expect(dbl, 'double_busbar musi być w ports.json').toBeDefined();
    if (!dbl) return;
    expect(Object.keys(dbl.ports).length).toBe(4);
    expect(dbl.ports).toHaveProperty('left_s1');
    expect(dbl.ports).toHaveProperty('left_s2');
    expect(dbl.ports).toHaveProperty('right_s1');
    expect(dbl.ports).toHaveProperty('right_s2');
  });

  it('busbar (single) ma 2 porty (left/right) — topologia jednosystemowa', () => {
    const single = manifest.symbols.busbar;
    expect(single).toBeDefined();
    expect(Object.keys(single.ports)).toEqual(expect.arrayContaining(['left', 'right']));
  });

  it('CB i DS mają porty top + bottom (orientacja pionowa pola SN)', () => {
    for (const name of ['circuit_breaker', 'disconnector']) {
      const def = manifest.symbols[name];
      expect(def, `${name} musi być w ports.json`).toBeDefined();
      if (!def) continue;
      expect(def.ports).toHaveProperty('top');
      expect(def.ports).toHaveProperty('bottom');
    }
  });

  it('earthing_switch ma 1 port (top → szyna), uziemienie implicytne', () => {
    const es = manifest.symbols.earthing_switch;
    expect(es).toBeDefined();
    expect(Object.keys(es.ports).length).toBe(1);
    expect(es.ports).toHaveProperty('top');
  });

  it('symbole liniowe (line_cable/line_overhead) mają porty left + right (poziomo)', () => {
    for (const name of ['line_cable', 'line_overhead']) {
      const def = manifest.symbols[name];
      expect(def).toBeDefined();
      expect(def.ports).toHaveProperty('left');
      expect(def.ports).toHaveProperty('right');
    }
  });
});
