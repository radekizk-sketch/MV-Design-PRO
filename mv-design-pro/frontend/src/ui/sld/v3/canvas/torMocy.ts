/**
 * Karta SLD-SKALA-I-NAWIGACJA, R8 — PRZERWA TORU MOCY: łącznik toru w stanie innym niż zamknięty
 * albo punkt NO. W kadrze przeglądowym zostaje własnym węzłem ze znacznikiem przerwy także wewnątrz
 * symbolu stacji (`hitAreas.bezWezlaPrzegladu`, `SceneSymbolNode`). Moduł liściowy: jedno
 * źródło predykatu dla rysunku i trafienia bez cyklu importów.
 */
import type { PreviewSymbol } from '../compose/preview';
import { CONTINUITY_APPARATUS_SYMBOL_IDS, type SymbolId } from '../symbols/defs';

/** Łączniki leżące na torze mocy — ich stan otwarty jest przerwą toru (uziemnik nie). JEDNO
 *  źródło z biblioteką symboli: aparaty ciągłości (`symbols/defs.CONTINUITY_APPARATUS_SYMBOL_IDS`
 *  — oba warianty rysunku pola SN, kanoniczny i QElectroTech, z punktem NO) oraz reklozer
 *  (wyłącznik z automatyką SPZ w torze pola). Przed oględzinami architekta 2026-11-13 zbiór był
 *  osobną, ręczną listą bez wariantów QET: otwarty wyłącznik QET nie był przerwą toru. */
export const LACZNIKI_TORU_MOCY: ReadonlySet<SymbolId> = new Set<SymbolId>([...CONTINUITY_APPARATUS_SYMBOL_IDS, 'recloser']);

/** Łącznik toru mocy w stanie innym niż zamknięty albo punkt NO — przerwa toru. */
export function przerwaToru(symbol: PreviewSymbol): boolean {
  if (symbol.symbolId === 'noPoint') return true;
  return LACZNIKI_TORU_MOCY.has(symbol.symbolId) && symbol.state !== undefined && symbol.state !== 'closed';
}
