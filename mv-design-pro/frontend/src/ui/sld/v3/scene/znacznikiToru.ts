import type { PreviewSegment, PreviewSegmentKind } from '../compose/preview';

/**
 * ZNACZNIKI NA TORZE — rodzaje odcinków sceny, które leżą NA torze, ale same torem
 * (biegiem gałęzi od zacisku do zacisku) NIE są: słupek końca otwartego (§16-v3), kreska
 * ciągu dalszego na złamaniu arkusza (S9-1) i znak powiązania pierścieniowego
 * (`scene/elementyToru.ts`). Ich kolejność punktów nie ma znaczenia kierunku gałęzi
 * (kreska poprzeczna rysowana zawsze tak samo), więc NIE niosą grota przepływu ani
 * strzałki zwarciowej i nie tworzą węzła T. JEDNO źródło tej listy dla wyroczni sceny
 * (`buildScene.ts`, `crossings.ts`) i dla rozmieszczenia grotów (`SldCanvasV3.tsx`) —
 * karta R10-E2E-CZERWONE (grot na znaku powiązania).
 */
export const RODZAJE_ZNACZNIKOW_TORU: ReadonlySet<PreviewSegmentKind> = new Set<PreviewSegmentKind>([
  'openTerminal',
  'sheetContinuation',
  'tieMarker',
]);

export function jestZnacznikiemToru(segment: PreviewSegment): boolean {
  const kind = segment.meta?.kind;
  return kind !== undefined && RODZAJE_ZNACZNIKOW_TORU.has(kind);
}
