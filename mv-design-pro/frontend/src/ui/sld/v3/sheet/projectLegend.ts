/**
 * K12 (KARTA_K12, dyrektywa właściciela 2026-07-30) — legenda „na żądanie":
 * legenda symboli NIE może być stałą treścią arkusza (zabiera miejsce, jest
 * cięższa wizualnie niż sieć, pokazuje symbole nieobecne w projekcie).
 * Zastępuje `buildDefaultLegend()` (`sheet/Frame.tsx`, stały, ślepy na
 * zawartość projektu — zestaw 12 symboli + 3 wpisy linii ZAWSZE identyczny,
 * niezależnie od tego, co jest naprawdę narysowane) jako źródło treści dla:
 *  - panelu legendy kanwy v3 na żądanie (`sld-v3-view-dock`,
 *    `SldCanvasV3Workspace.tsx`),
 *  - opcji eksportu „Dołącz legendę" (`SldExportFormatMenu` przez
 *    `SldCanvasV3Workspace.handleExportSvg`).
 *
 * `buildDefaultLegend()` ZOSTAJE nietknięty — to nadal fallback `SheetFrame`
 * (`props.legend ?? buildDefaultLegend()`), używany przez WŁASNE testy
 * `sheet/__tests__/frame.test.tsx` (spec §2 „legenda domyślna ≥6 glifów").
 * Kanwa v3 (`SldCanvasV3.tsx`) od K12 NIGDY nie polega na tym fallbacku —
 * zawsze przekazuje jawną listę (`[]` na ekranie; wynik tej funkcji do
 * panelu/eksportu).
 *
 * ZERO FABRYKACJI (§0.3 karty): symbol nieobecny w scenie NIE pojawia się w
 * legendzie. Zakres SYMBOLI jest PEŁNY (wszystkie `SYMBOL_DEFS`, nie tylko
 * dotychczasowy kurator 12 pozycji `DEFAULT_SYMBOL_LEGEND_IDS`) — scena może
 * dziś rysować symbole spoza tego kuratora (np. `derPv`/`derWind`/
 * `stationCollapsed`/`junction`), które w STAREJ stałej legendzie NIE miały
 * żadnego wpisu objaśniającego (luka niezależna od K12, naprawiona przy
 * okazji: „Zero-Debt" — legenda licząca z projektu jest właściwym miejscem
 * na PEŁNE pokrycie, nie tylko kuratora historycznego).
 *
 * ZAKRES LINII (decyzja K12, „zero fabrykacji" rozciągnięta na wpisy linii):
 * scena v3 dziś renderuje WSZYSTKIE odcinki toru mocy JEDNYM stylem linii
 * ciągłej — `PreviewSegmentKind` (`compose/preview.tsx`) NIE ma wariantu
 * „linia napowietrzna" (brak dasharray odróżniającego overhead od cable w
 * `SldCanvasV3.tsx::SceneSegmentNode`; dasharray `'6 3 1 3'` istnieje
 * WYŁĄCZNIE jako próbka wzorcowa w `sheet/Frame.tsx::LegendLineSample`, nigdy
 * w realnie renderowanym odcinku). Wpis 'overhead' w tej funkcji BYŁBY
 * fabrykacją — obiekt, którego użytkownik nigdy nie zobaczy na THIS
 * rysunku — więc CELOWO pominięty (za `buildDefaultLegend()`'s 'overhead'
 * odpowiada WYŁĄCZNIE arkusz wzorcowy/domyślny fallback `SheetFrame`, nie ta
 * funkcja). 'cable' pokazywany, gdy scena ma ≥1 odcinek toru mocy (bus/
 * busGpz/sn/snTrunk/lv — jedyny naprawdę renderowany styl linii, ciągła).
 * 'openTerminal' pokazywany, gdy scena ma ≥1 słupek końca otwartego
 * (§16-v3, `meta.kind==='openTerminal'` — realny znacznik sceny, nie próbka).
 */
import { legendLabelForSymbol, type SheetLegendEntry } from './Frame';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import type { SceneV3 } from '../scene/buildScene';

/** Kolejność deterministyczna: klucze `SYMBOL_DEFS` (obiekt literalny w
 *  źródle — kolejność wstawiania właściwości stabilna w JS/TS), NIE kolejność
 *  napotkania w scenie (zależna od topologii/kolejności budowy — losowa z
 *  perspektywy legendy). */
const ALL_SYMBOL_IDS = Object.keys(SYMBOL_DEFS) as readonly SymbolId[];

/** Rodzaje odcinków, które scena renderuje jako TOR MOCY (linia ciągła —
 *  patrz `SEGMENT_STROKE_WIDTH`, `compose/preview.tsx`) — odróżnione od
 *  adnotacji (`leader`/`protectionTrip`/`measurementLink`, kreskowane) i od
 *  słupka końca otwartego (`openTerminal`, osobny wpis legendy). Domyślny
 *  fallback `'sn'` ZGODNY z `SldCanvasV3.tsx::SceneSegmentNode`
 *  (`segment.meta?.kind ?? 'sn'`). */
const POWER_SEGMENT_KINDS: ReadonlySet<string> = new Set(['bus', 'busGpz', 'sn', 'snTrunk', 'lv']);

/**
 * Legenda policzona z FAKTYCZNEJ zawartości sceny (zero fabrykacji, patrz
 * nagłówek modułu). Czysta funkcja — wejście `SceneV3` (już zbudowana scena,
 * ta sama, którą renderuje `SldCanvasV3`/eksportuje `handleExportSvg`).
 */
export function computeProjectLegendEntries(scene: SceneV3): readonly SheetLegendEntry[] {
  const present = new Set(scene.symbols.map((s) => s.symbolId));
  const symbolEntries: SheetLegendEntry[] = ALL_SYMBOL_IDS.filter((id) => present.has(id)).map((id) => ({
    kind: 'symbol' as const,
    id,
    labelPl: legendLabelForSymbol(id),
  }));

  const lineEntries: SheetLegendEntry[] = [];
  const hasPowerSegment = scene.segments.some((s) => POWER_SEGMENT_KINDS.has(s.meta?.kind ?? 'sn'));
  if (hasPowerSegment) lineEntries.push({ kind: 'line', id: 'cable', labelPl: 'Kabel' });
  const hasOpenTerminal = scene.segments.some((s) => s.meta?.kind === 'openTerminal');
  if (hasOpenTerminal) {
    lineEntries.push({
      kind: 'line',
      id: 'openTerminal',
      labelPl: 'Koniec otwarty (słupek — tor bez kontynuacji; to nie NO)',
    });
  }

  // V12K-223 (patrz `Frame.tsx` nagłówek `SheetLegendEntry.kind==='note'`):
  // opis punktu neutralnego sieci — informacja o CAŁEJ sieci, miejscem jest
  // legenda. Dotąd doklejany BEZWARUNKOWO do `buildDefaultLegend()` (zawsze
  // 12+ pozycji) w `SldCanvasV3.tsx`; od K12 legenda w ogóle istnieje
  // WYŁĄCZNIE na żądanie, więc ten wiersz żyje TU — jedno miejsce.
  const noteEntries: SheetLegendEntry[] = scene.meta.neutralEarthingNotePl
    ? [{ kind: 'note' as const, id: 'sn-neutral-earthing', labelPl: scene.meta.neutralEarthingNotePl }]
    : [];

  return [...symbolEntries, ...lineEntries, ...noteEntries];
}
