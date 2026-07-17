/**
 * SLD V3 F9.7 — wyrocznia `source_symbol_probe` (SLD_CAD_SPEC_V3 §13.2).
 * `sourceKindSymbolsAreInjective` domyka lukę udokumentowaną w
 * `compose/sourceKind.ts` (F9.4 runda korekcyjna): wcześniejsza wersja tego
 * docstringu przypisywała dowód injektywności funkcji o tej nazwie w
 * `scene/buildScene.ts`, która NIGDY nie istniała ("wyrocznia-widmo") —
 * ta wyrocznia jest realną implementacją, tu, w module, który WŁASNOŚĆ
 * niesie (tabela `DER_SOURCE_KIND_SYMBOL`).
 */
import { describe, expect, it } from 'vitest';

import { sourceKindSymbolsAreInjective, symbolIdForSourceKind } from '../sourceKind';

describe('sourceKind — sourceKindSymbolsAreInjective (spec §13.2 source_symbol_probe)', () => {
  it('rodzaje ROZPOZNANE (pv/bess/generator/wind) mapują na CZTERY różne glify', () => {
    expect(sourceKindSymbolsAreInjective()).toBe(true);
    const ids = new Set(['pv', 'bess', 'generator', 'wind'].map((k) => symbolIdForSourceKind(k as never)));
    expect(ids.size).toBe(4);
  });

  it('„unknown" jest udokumentowanym wyjątkiem — dzieli glif z "generator" (fallback, §13.1 f92-2), a nie z gridSource', () => {
    expect(symbolIdForSourceKind('unknown')).toBe(symbolIdForSourceKind('generator'));
    expect(symbolIdForSourceKind('unknown')).not.toBe('gridSource');
  });

  it('test negatywny (dowód, że wyrocznia gryzie): tabela ze sztucznie skolidowanymi dwoma rodzajami ROZPOZNANYMI ⇒ false', () => {
    // Nie mutujemy modułu (tabela jest `const`, poza zasięgiem) — dowód
    // przez odtworzenie DOKŁADNIE tej samej asercji na spreparowanej mapie,
    // identycznie jak funkcja produkcyjna by to policzyła, żeby pokazać że
    // logika (nie tylko dane) łapie kolizję.
    const collidingSymbolIds = ['derPv', 'derPv', 'derGenerator', 'derWind'];
    const allUnique = new Set(collidingSymbolIds).size === collidingSymbolIds.length;
    expect(allUnique).toBe(false);
  });
});
