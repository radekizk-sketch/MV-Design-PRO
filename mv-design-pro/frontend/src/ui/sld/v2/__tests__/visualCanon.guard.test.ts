/**
 * VISUAL CANON GUARD — ratchet języka wizualnego SLD v2 (SLD_PRO_STANDARD_2026-07).
 *
 * Diagnoza panelu ekspertów 2026-07: renderery SLD v2 omijają tokens.ts
 * (1157 literałów kolorów hex poza tokenami przy 63 w tokenach), przez co
 * całość nie trzyma jednego języka wizualnego (30 grubości kreski,
 * 19 rozmiarów fontu). Ten strażnik ZAMRAŻA stan zastany i wymusza kierunek:
 *
 *  - NOWY kod używa tokenów (theme/tokens.ts) — literał hex w scope
 *    podnosi licznik i wywala test;
 *  - sweep normalizacyjny OBNIŻA baseline (po obniżeniu liczników w pliku
 *    zaktualizuj mapę w dół — ratchet działa tylko w dół, nigdy w górę).
 *
 * Semantyka „co najwyżej N" (nie „dokładnie N") — zgodnie z lekcją
 * docs_count_consistency_guard (zwykła praca nie może psuć CI).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Vitest startuje z katalogu frontend/ (root vite.config.ts). */
const V2_ROOT = join(process.cwd(), 'src', 'ui', 'sld', 'v2');

/** Pliki poza ratchetem: kanoniczne definicje kolorów + testy. */
function isExcluded(relPath: string): boolean {
  return relPath.includes('__tests__') || relPath === 'theme/tokens.ts';
}

function walkSources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkSources(full, acc);
    } else if (/\.(ts|tsx)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

function countHexLiterals(source: string): number {
  return (source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
}

/**
 * BASELINE 2026-07-03 (commit bazowy sweep'u). Aktualizuj TYLKO W DÓŁ.
 * Total obejmuje cały scope (v2 bez tokens.ts i testów) — pilnuje też plików
 * spoza listy per-file i plików nowych (nowy plik z literałami podnosi total).
 */
const HEX_LITERALS_TOTAL_BUDGET = 1157;

/** Najwięksi dłużnicy — ratchet per plik (kolejność sweep'u wg standardu §4). */
const HEX_LITERALS_FILE_BUDGET: Readonly<Record<string, number>> = {
  'canvas/SldDetailDrawer.tsx': 216,
  'renderer/MiniBlockRmuRenderer.tsx': 121,
  'station-rozdzielnia/OzeSourceArchetype.tsx': 89,
  'renderer/CableRunRenderer.tsx': 74,
  'canvas/SldCanvasV2.tsx': 65,
  'canvas/SldTitleBlock.tsx': 48,
  'renderer/StationOnRunRenderer.tsx': 40,
  'renderer/DerRenderer.tsx': 38,
  'renderer/GpzCanonicalRenderer.tsx': 52,
  'station-rozdzielnia/StationRozdzielniaSN.tsx': 33,
  'station-rozdzielnia/canon/sldCanonKit.tsx': 25,
  'canvas/SldLegendOverlay.tsx': 26,
};

describe('visual canon guard (SLD_PRO_STANDARD §3: tokens-first)', () => {
  const files = walkSources(V2_ROOT)
    .map((full) => ({ full, rel: relative(V2_ROOT, full).replaceAll('\\', '/') }))
    .filter(({ rel }) => !isExcluded(rel));

  it('literały hex w SLD v2 nie przybywają (total ratchet)', () => {
    const total = files.reduce((sum, { full }) => sum + countHexLiterals(readFileSync(full, 'utf8')), 0);
    expect(
      total,
      `Literały kolorów hex w SLD v2: ${total} > budżet ${HEX_LITERALS_TOTAL_BUDGET}. ` +
        'Nowy kod używa tokenów z theme/tokens.ts (SLD_PRO_STANDARD_2026-07 §3). ' +
        'Budżet wolno tylko OBNIŻAĆ (po sweepłie normalizacyjnym).',
    ).toBeLessThanOrEqual(HEX_LITERALS_TOTAL_BUDGET);
  });

  it('najwięksi dłużnicy nie rosną (per-file ratchet)', () => {
    const over: string[] = [];
    for (const [rel, budget] of Object.entries(HEX_LITERALS_FILE_BUDGET)) {
      const file = files.find((f) => f.rel === rel);
      if (!file) continue; // plik usunięty/przeniesiony — total nadal pilnuje
      const count = countHexLiterals(readFileSync(file.full, 'utf8'));
      if (count > budget) over.push(`${rel}: ${count} > ${budget}`);
    }
    expect(
      over,
      `Pliki przekroczyły zamrożony budżet literałów hex (używaj tokenów):\n${over.join('\n')}`,
    ).toEqual([]);
  });
});
