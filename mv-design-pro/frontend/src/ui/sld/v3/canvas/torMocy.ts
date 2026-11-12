/**
 * Karta SLD-SKALA-I-NAWIGACJA, R8 — PRZERWA TORU MOCY: łącznik toru w stanie innym niż zamknięty
 * albo punkt NO. W kadrze przeglądowym zostaje własnym węzłem ze znacznikiem przerwy także wewnątrz
 * symbolu stacji (`hitAreas.bezWezlaPrzegladu`, `SceneSymbolNode`). Moduł liściowy: jedno
 * źródło predykatu dla rysunku i trafienia bez cyklu importów.
 */
import type { PreviewSymbol } from '../compose/preview';
import type { SymbolId } from '../symbols/defs';

/** Łączniki leżące na torze mocy — ich stan otwarty jest przerwą toru (uziemnik nie). */
export const LACZNIKI_TORU_MOCY: ReadonlySet<SymbolId> = new Set<SymbolId>([
  'breaker',
  'recloser',
  'disconnector',
  'loadBreakSwitch',
  'fuseSwitch',
  'lineSwitch',
  'lineBreaker',
]);

/** Łącznik toru mocy w stanie innym niż zamknięty albo punkt NO — przerwa toru. */
export function przerwaToru(symbol: PreviewSymbol): boolean {
  if (symbol.symbolId === 'noPoint') return true;
  return LACZNIKI_TORU_MOCY.has(symbol.symbolId) && symbol.state !== undefined && symbol.state !== 'closed';
}
