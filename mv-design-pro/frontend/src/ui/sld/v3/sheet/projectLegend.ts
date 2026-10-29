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
 * wpis linii istnieje wtedy i tylko wtedy, gdy scena rysuje odcinek tym stylem.
 * K2b §0.4: scena rozróżnia kabel (linia ciągła) od linii napowietrznej
 * (`meta.lineType === 'overhead'`, kreska `OVERHEAD_LINE_DASHARRAY` — ta sama
 * w odcinku i w próbce legendy `sheet/Frame.tsx::LegendLineSample`), więc wpis
 * 'overhead' pojawia się, gdy scena ma ≥1 odcinek linii napowietrznej (dawniej
 * celowo pominięty: styl istniał wyłącznie w próbce, nigdy w odcinku). 'cable'
 * pokazywany, gdy scena ma ≥1 odcinek toru mocy rysowany linią CIĄGŁĄ (bus/
 * busGpz/sn/snTrunk/lv bez `lineType`).
 * 'openTerminal' pokazywany, gdy scena ma ≥1 słupek końca otwartego
 * (§16-v3, `meta.kind==='openTerminal'` — realny znacznik sceny, nie próbka).
 */
import { legendLabelForSymbol, type SheetLegendEntry } from './Frame';
import { SYMBOL_DEFS, czySymbolQet, type SymbolId } from '../symbols/defs';
import type { SceneV3 } from '../scene/buildScene';
import { STANY_KAFLA, type StanKafla } from '../theme/colorTokens';
import { stanKaflaLacznika } from '../symbols/glyphs';

/**
 * Karta UX-04/POLE-LINIOWE-WZORZEC — ATRYBUCJA symboli QElectroTech (licencja CC BY 3.0
 * wymaga wskazania autora i licencji przy każdym rozpowszechnieniu rysunku, także w pliku
 * eksportu). JEDEN tekst dla legendy (panel i eksport), tabliczki rysunkowej eksportu
 * i okna pola (`ui/field/SchematPolaSn.tsx`). Źródło: `docs/sld/vendor/qet/README.md`.
 */
export const ATRYBUCJA_SYMBOLI_QET_PL =
  'Symbole aparatów pola wg PN-EN 60617 z biblioteki QElectroTech (The QElectroTech team), licencja CC BY 3.0';

/** Atrybucja symboli QET, gdy scena rysuje choć jeden z nich; `null` = brak symboli QET. */
export function atrybucjaSymboliSceny(scene: Pick<SceneV3, 'symbols'>): string | null {
  return scene.symbols.some((s) => czySymbolQet(s.symbolId)) ? ATRYBUCJA_SYMBOLI_QET_PL : null;
}

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
  const hasSolidPowerSegment = scene.segments.some(
    (s) => POWER_SEGMENT_KINDS.has(s.meta?.kind ?? 'sn') && s.meta?.lineType !== 'overhead',
  );
  if (hasSolidPowerSegment) lineEntries.push({ kind: 'line', id: 'cable', labelPl: 'Kabel' });
  const hasOverhead = scene.segments.some((s) => s.meta?.lineType === 'overhead');
  if (hasOverhead) lineEntries.push({ kind: 'line', id: 'overhead', labelPl: 'Linia napowietrzna' });
  const hasTieMarker = scene.segments.some((s) => s.meta?.kind === 'tieMarker');
  const hasOpenTerminal = scene.segments.some((s) => s.meta?.kind === 'openTerminal');
  if (hasOpenTerminal) {
    lineEntries.push({
      kind: 'line',
      id: 'openTerminal',
      labelPl: 'Koniec otwarty (słupek — tor bez kontynuacji; to nie NO)',
    });
  }
  if (hasTieMarker) {
    lineEntries.push({
      kind: 'line',
      id: 'tieMarker',
      labelPl: 'Powiązanie (koniec połączony odcinkiem powiązania — odsyłacz)',
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
  const atrybucja = atrybucjaSymboliSceny(scene);
  if (atrybucja) noteEntries.push({ kind: 'note', id: 'qet-atrybucja', labelPl: atrybucja });

  return [...symbolEntries, ...stateLegendEntries(scene), ...lineEntries, ...noteEntries];
}

/** Opisy kafli stanu łącznika w legendzie (rozszerzenie 5 karty UX-04/POLE-LINIOWE-WZORZEC). */
export const OPIS_KAFLA_LEGENDY_PL: Readonly<Record<StanKafla, string>> = {
  zamkniety: 'Łącznik zamknięty — styk w osi toru (także zestyk uziemiający łącznika trójpołożeniowego w położeniu „uziemiony")',
  otwarty: 'Łącznik otwarty — styk odchylony',
  nieustalony: 'Położenie nieustalone — brak danej albo dane sprzeczne w modelu',
  bledny: 'Awaria aparatu — położenie niewiarygodne',
};

/** Wpisy legendy dla stanów kafli OBECNYCH na scenie (ta sama reguła `stanKaflaLacznika`,
 *  którą rysuje kanwa) — stan nieobecny na rysunku nie trafia do legendy. */
function stateLegendEntries(scene: SceneV3): SheetLegendEntry[] {
  const obecne = new Set<StanKafla>();
  for (const s of scene.symbols) {
    const stan = stanKaflaLacznika(s.symbolId, s.state);
    if (stan) obecne.add(stan);
  }
  return STANY_KAFLA.filter((stan) => obecne.has(stan)).map((stan) => ({
    kind: 'stan' as const,
    id: `stan-${stan}`,
    labelPl: OPIS_KAFLA_LEGENDY_PL[stan],
  }));
}
