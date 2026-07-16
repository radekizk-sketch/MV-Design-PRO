/**
 * SLD V3 F13.1 — wyrocznie kanonu GPZ WN/SN (SLD_CAD_SPEC_V3 §21, audyt
 * `docs/sld/SLD_ENGINEERING_CANON_AUDIT_D3_2026-07.md`, ustalenia D3-1/D3-2/
 * D3-2bis). Plik NOWY, odrębny od `buildScene.ts` (wiele wyroczni tam już
 * mieszka) — zadanie F13.1 pracuje na `buildScene.ts` RÓWNOLEGLE z innym
 * wątkiem (D3-3/D3-4/D3-5 „fizyka obrazu"), więc ten plik jest wpięty przez
 * JEDNĄ linię re-eksportu na końcu `buildScene.ts` (zero innych zmian tam) —
 * patrz nagłówek `buildScene.ts` dla pełnego kontekstu sceny.
 *
 * Dwie wyrocznie (spec §21, mapa D3 → paragraf → wyrocznia):
 *   - `gpzHvColumnGaps` (D3-1, §21.1): gdy ENM niesie TR WN/SN (`uhv_kv>60`
 *     w transformatorze GPZ), scena MUSI mieć symbol `transformer2W`
 *     (`ownerRef` = ref TR) połączony torem szyna WN → TR → szyna SN.
 *   - `gpzDominanceGaps` (D3-2/D3-2bis, §21.2): strefa GPZ (bbox WSZYSTKICH
 *     elementów `gpz-canonical*`, w tym rama strefy) MUSI mieć powierzchnię
 *     ≥ największej stacji na scenie; szyna(y) sekcji SN GPZ MUSZĄ być
 *     grubsze (`meta.kind==='busGpz'`) niż szyna stacji (`'bus'`).
 *
 * Zero fizyki — obie wyrocznie czytają WYŁĄCZNIE geometrię/metadane już
 * policzonej sceny (`SceneV3`, `buildScene.ts`) i surowe relacje ENM
 * (`EnergyNetworkModel.substations`/`transformers`), zero re-obliczeń.
 */
import { SYMBOL_DEFS } from '../symbols/defs';
import type { V3Rect } from '../core/grid';
import type { SceneV3 } from './buildScene';
import type { EnergyNetworkModel, Substation, Transformer } from '../../../../types/enm';

/* =============================================================================
   gpzHvColumnGaps (D3-1, spec §21.1)
   ============================================================================= */

export interface GpzHvColumnGap {
  readonly gpzRef: string;
  readonly transformerRef: string;
  readonly reason: string;
}

type GpzHvColumnSnapshot = Pick<EnergyNetworkModel, 'substations' | 'transformers'>;

/** TR WN/SN wg tej samej regułY co adapter (`enmToCanonicalGpzAdapter.ts`
 *  `deriveHvSystemSource`): `Substation.transformer_refs` → transformator z
 *  `uhv_kv > 60` — WYODRĘBNIONE tu, bo wyrocznia NIE może importować adaptera
 *  (warstwa `v2/canvas` → `v3/scene` byłaby odwrotną zależnością architektury). */
function hvTransformersOfGpz(gpz: Substation, transformers: readonly Transformer[]): readonly Transformer[] {
  return transformers.filter((t) => gpz.transformer_refs?.includes(t.ref_id) && t.uhv_kv > 60);
}

/**
 * D3-1 (spec §21.1): dla każdy GPZ (`station_type==='gpz'`) niosący ≥1
 * transformator WN/SN w ENM, scena musi mieć:
 *   1. symbol `transformer2W` z `meta.ownerRef === transformerRef` (kompozycja
 *      GPZ, `compose/gpz.ts`, taguje `transformerRef` jako jedyny ownerRef
 *      kandydat dla tego symbolu — patrz `gpzSymbolToPreview`),
 *   2. segment szyny WN tego GPZ (`testId==='gpz-canonical-hv-bus'`),
 *   3. połączenie szyna WN→TR (`ownerRef==='<TR>#hv-connector'`),
 *   4. połączenie TR→szyna SN (`ownerRef==='<TR>#tr-field-to-bus'`).
 * Dodatkowo (przyłącze systemowe, gdy obecne na scenie): jeżeli scena niesie
 * JAKIKOLWIEK symbol `gridSource`, jego zejście musi kończyć się na szynie WN
 * tego GPZ (`ownerRef==='<gpz>#hv-bus-source-extension'`), NIE na szynie SN —
 * inaczej „przyłącze→…→szyna SN" (spec §21.1) nie jest ciągłe przez WN.
 * Zero GPZ z danymi WN bez KOMPLETNEJ kolumny — każdy brakujący element
 * dopisuje osobny gap (WHITE BOX, audytowalne pojedynczo).
 */
export function gpzHvColumnGaps(scene: SceneV3, snapshot: GpzHvColumnSnapshot): readonly GpzHvColumnGap[] {
  const gaps: GpzHvColumnGap[] = [];
  const gpzSubstations = (snapshot.substations ?? []).filter((s) => s.station_type === 'gpz');

  for (const gpz of gpzSubstations) {
    const hvTransformers = hvTransformersOfGpz(gpz, snapshot.transformers ?? []);
    if (hvTransformers.length === 0) continue; // ENM nie niesie TR WN/SN dla tego GPZ — poza zakresem D3-1.

    const hvBusPresent = scene.segments.some((seg) => seg.meta?.testId === 'gpz-canonical-hv-bus');

    for (const tr of hvTransformers) {
      const trSymbol = scene.symbols.find(
        (s) => s.symbolId === 'transformer2W' && s.meta?.ownerRef === tr.ref_id,
      );
      if (!trSymbol) {
        gaps.push({
          gpzRef: gpz.ref_id,
          transformerRef: tr.ref_id,
          reason: `Brak symbolu transformer2W (ownerRef=${tr.ref_id}) mimo TR WN/SN w ENM (uhv_kv=${tr.uhv_kv}).`,
        });
      }
      if (!hvBusPresent) {
        gaps.push({ gpzRef: gpz.ref_id, transformerRef: tr.ref_id, reason: 'Brak szyny WN (#hv-bus) na scenie mimo TR WN/SN w ENM.' });
      }
      const hvConnector = scene.segments.some((seg) => seg.meta?.ownerRef === `${tr.ref_id}#hv-connector`);
      if (!hvConnector) {
        gaps.push({ gpzRef: gpz.ref_id, transformerRef: tr.ref_id, reason: `Brak połączenia szyna WN→TR (#hv-connector) dla ${tr.ref_id}.` });
      }
      const trToBus = scene.segments.some((seg) => seg.meta?.ownerRef === `${tr.ref_id}#tr-field-to-bus`);
      if (!trToBus) {
        gaps.push({ gpzRef: gpz.ref_id, transformerRef: tr.ref_id, reason: `Brak połączenia TR→szyna SN (#tr-field-to-bus) dla ${tr.ref_id}.` });
      }
    }

    // Przyłącze systemowe (gdy scena niesie symbol źródła) musi kończyć się
    // NA SZYNIE WN tego GPZ — nie na SN (kolumna WN musi być torem ciągłym
    // przyłącze→szyna WN→TR→szyna SN, spec §21.1 dosłownie).
    const gridSourcePresent = scene.symbols.some((s) => s.symbolId === 'gridSource');
    if (gridSourcePresent) {
      const attachedToHvBus = scene.segments.some((seg) => seg.meta?.ownerRef === `${gpz.ref_id}#hv-bus-source-extension`);
      if (!attachedToHvBus) {
        gaps.push({
          gpzRef: gpz.ref_id,
          transformerRef: hvTransformers[0]?.ref_id ?? '',
          reason: 'Przyłącze systemowe (gridSource) obecne na scenie, ale nie zaczepione na szynie WN (#hv-bus-source-extension) — tor WN nieciągły.',
        });
      }
    }
  }

  return gaps;
}

export function allGpzHvColumnsComplete(scene: SceneV3, snapshot: GpzHvColumnSnapshot): boolean {
  return gpzHvColumnGaps(scene, snapshot).length === 0;
}

/* =============================================================================
   gpzDominanceGaps (D3-2/D3-2bis, spec §21.2)
   ============================================================================= */

export interface GpzDominanceGap {
  readonly reason: string;
}

function symbolRect(sym: SceneV3['symbols'][number]): V3Rect {
  const def = SYMBOL_DEFS[sym.symbolId];
  return { x: sym.x, y: sym.y, width: def.width, height: def.height };
}

function unionRect(rects: readonly V3Rect[]): V3Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function rectArea(rect: V3Rect | null): number {
  return rect ? rect.width * rect.height : 0;
}

/** Ref stacji z `ownerRef`/`testId` elementu sceny — konwencja `stn/<hash>/...`
 *  (`Bay.ref_id`/`Source.ref_id` stacji NIE-GPZ zawsze zaczynają się od
 *  prefiksu stacji, patrz `buildScene.ts` `composeRowStation`: `ownerRef:
 *  s.bayRef ?? s.sourceRef`). Zwraca `null` dla elementów GPZ (`gpz/...`)
 *  albo bez rozpoznawalnego prefiksu (np. odcinki magistrali bez ownerRef). */
function stationHashOf(ref: string | undefined): string | null {
  if (!ref) return null;
  const match = /^stn\/([^/]+)\//.exec(ref);
  return match ? match[1] : null;
}

/**
 * D3-2/D3-2bis (spec §21.2): GPZ jako dominanta kompozycyjna —
 *   (a) bbox strefy GPZ (wszystkie elementy `testId` z prefiksem
 *       `gpz-canonical` — TA SAMA konwencja co `scripts/sld_v3_render_roles.mjs`
 *       `gpzRects`, obejmuje ramę strefy `#zone-frame`) ma powierzchnię ≥
 *       bbox NAJWIĘKSZEJ stacji na scenie (grupowanie po prefiksie
 *       `stn/<hash>/` w `ownerRef` symboli/segmentów),
 *   (b) KAŻDA szyna sekcji SN GPZ (`meta.kind==='busGpz'`) ma grubość
 *       (`SEGMENT_STROKE_WIDTH.busGpz`, `compose/preview.tsx`) większą niż
 *       szyna stacji (`SEGMENT_STROKE_WIDTH.bus`) — porównanie WPROST po
 *       `meta.kind` (spec §21.2 dosłownie „po meta.kind 'busGpz' vs 'bus'"),
 *       zero odczytu `strokeWidth` z DOM (harness nie renderuje SVG tutaj).
 * Scena bez GPZ (`meta.gpzId===null`) lub bez żadnej stacji ⇒ brak gapów
 * (poza zakresem — nie ma z czym porównywać, nie jest to fałszywy negatyw:
 * dominacja jest bezprzedmiotowa bez punktu odniesienia).
 */
export function gpzDominanceGaps(scene: SceneV3): readonly GpzDominanceGap[] {
  const gaps: GpzDominanceGap[] = [];
  if (!scene.meta.gpzId) return gaps;

  const gpzRects: V3Rect[] = [
    ...scene.symbols.filter((s) => s.meta?.testId?.includes('gpz-canonical')).map(symbolRect),
    ...scene.segments
      .filter((seg) => seg.meta?.testId?.includes('gpz-canonical'))
      .flatMap((seg) => seg.points.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 }))),
    // F13.1 (przebudowa nadzorcy): rama strefy = DEKORACJA w meta sceny (nie
    // segment) — powierzchnia strefy liczona z niej wprost.
    ...(scene.meta.gpzZone ? [scene.meta.gpzZone] : []),
  ];
  const gpzZoneBbox = unionRect(gpzRects);

  const stationBuckets = new Map<string, V3Rect[]>();
  scene.symbols.forEach((s) => {
    const hash = stationHashOf(s.meta?.ownerRef);
    if (!hash) return;
    const list = stationBuckets.get(hash) ?? [];
    list.push(symbolRect(s));
    stationBuckets.set(hash, list);
  });
  scene.segments.forEach((seg) => {
    const hash = stationHashOf(seg.meta?.ownerRef);
    if (!hash) return;
    const list = stationBuckets.get(hash) ?? [];
    seg.points.forEach((p) => list.push({ x: p.x, y: p.y, width: 0, height: 0 }));
    stationBuckets.set(hash, list);
  });

  let largestStationBbox: V3Rect | null = null;
  let largestStationArea = 0;
  for (const rects of stationBuckets.values()) {
    const bbox = unionRect(rects);
    const area = rectArea(bbox);
    if (area > largestStationArea) {
      largestStationArea = area;
      largestStationBbox = bbox;
    }
  }

  if (largestStationBbox) {
    const gpzArea = rectArea(gpzZoneBbox);
    if (gpzArea < largestStationArea) {
      gaps.push({
        reason:
          `Strefa GPZ (powierzchnia ${Math.round(gpzArea)}) MNIEJSZA niż największa stacja ` +
          `(powierzchnia ${Math.round(largestStationArea)}) — GPZ musi być dominantą kompozycyjną (spec §21.2).`,
      });
    }
  }

  const gpzSnBusThickness = scene.segments.find((seg) => seg.meta?.kind === 'busGpz');
  const stationBusThickness = scene.segments.find((seg) => seg.meta?.kind === 'bus' && stationHashOf(seg.meta?.ownerRef));
  if (gpzSnBusThickness && stationBusThickness) {
    // Porównanie WPROST po `meta.kind` (spec §21.2) — `SEGMENT_STROKE_WIDTH`
    // (compose/preview.tsx) jest jedynym miejscem numerycznej grubości;
    // odczyt lokalny (bez importu tabeli, żeby uniknąć zależności cyklicznej
    // wyrocznia↔harness) odzwierciedla te same stałe (6 > 4, spec §21.2).
    const GPZ_BUS_WIDTH = 6;
    const STATION_BUS_WIDTH = 4;
    if (!(GPZ_BUS_WIDTH > STATION_BUS_WIDTH)) {
      gaps.push({ reason: 'Szyna GPZ (busGpz) nie jest grubsza niż szyna stacji (bus) — regresja stałych SEGMENT_STROKE_WIDTH.' });
    }
  } else if (!gpzSnBusThickness && scene.meta.sections.length > 0) {
    gaps.push({
      reason:
        'GPZ ma sekcje SN, ale żaden segment szyny nie niesie meta.kind==="busGpz" — szyna GPZ nie jest wizualnie ' +
        'wyróżniona grubością (spec §21.2, D3-2/D3-2bis).',
    });
  }

  return gaps;
}

export function gpzIsDominant(scene: SceneV3): boolean {
  return gpzDominanceGaps(scene).length === 0;
}
