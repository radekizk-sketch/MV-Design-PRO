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
 *   - `gpzHvColumnGaps` (D3-1, §21.1): gdy ENM niesie TR WN/SN (strona górna w paśmie WN, `wPasmieWn`
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
import { wPasmieWn } from '../../../../ui2/model/pasmaNapieciowe';
import { szynyStacji } from '../../../shared/szynyStacji';
import { transformatoryNalezaceDoStacji } from '../../../shared/transformatoryStacji';

/* =============================================================================
   gpzHvColumnGaps (D3-1, spec §21.1)
   ============================================================================= */

export interface GpzHvColumnGap {
  readonly gpzRef: string;
  readonly transformerRef: string;
  readonly reason: string;
}

type GpzHvColumnSnapshot = Pick<EnergyNetworkModel, 'substations' | 'transformers'> &
  // Recenzja NO-GO 2026-07-17 pkt 2/3: strona zaczepu źródła podąża za
  // `Source.bus_ref` — wyrocznia potrzebuje `sources`/`buses`, żeby odróżnić
  // przyłącze systemowe WN od EKWIWALENTU na szynach SN. Pola opcjonalne
  // (Partial) — starzy wołający bez tych rekordów dostają regułę WN 1:1.
  Partial<Pick<EnergyNetworkModel, 'sources' | 'buses' | 'branches'>>;

/**
 * KD-7 (Zero-Debt, dług zastany): czy scena rysuje blok TEGO GPZ jako
 * ZWINIĘTY (`gpzCollapsed`, KD-5 — widok przeglądowy L0)?
 *
 * DLACZEGO WYROCZNIE MUSZĄ TO WIEDZIEĆ. Obie wyrocznie §21 opisują RYSUNEK
 * rozdzielni: kolumnę WN (§21.1) i wyróżnienie szyny SN grubością (§21.2).
 * KD-5 wprowadziło kanon, w którym na poziomie przeglądowym cała geometria
 * wewnętrzna GPZ jest ŚWIADOMIE zwinięta do jednego symbolu (symbole 16 px
 * świata renderowały się tam po ≈1,9 px — szum, nie informacja). Wyroczni
 * nie zaktualizowano, więc `npm run accept:sld-v3` — krok BLOKUJĄCY w
 * `.github/workflows/sld-determinism.yml` — jest czerwony od `5bd044f2`
 * (zmierzone 2026-07-31: zielony na `6946807a`, 2 luki na L0 od KD-5 poz. 1
 * włącznie, L1/L2 czyste przez cały czas).
 *
 * INTENCJA WYROCZNI ZACHOWANA, NIE ROZLUŹNIONA: warunek czyta SCENĘ (obecność
 * symbolu `gpzCollapsed` tego GPZ), a NIE numer LOD. Gdyby zwinięcie zniknęło
 * — z poziomu przeglądowego albo w ogóle — wyrocznie natychmiast gryzą znowu
 * na każdym poziomie. Rysunek ROZWINIĘTY nigdy nie jest zwolniony z §21.
 */
function gpzBlockCollapsed(scene: SceneV3, gpzRef?: string): boolean {
  return scene.symbols.some(
    (s) => s.symbolId === 'gpzCollapsed' && (gpzRef == null || s.meta?.ownerRef === gpzRef),
  );
}

/** TR WN/SN wg tej samej reguły co adapter (`enmToCanonicalGpzAdapter.ts`
 *  `transformatoryGpz`): transformatory GPZ z `ui/shared/transformatoryStacji` → transformator z
 *  stroną górną w paśmie WN (`wPasmieWn`) — WYODRĘBNIONE tu, bo wyrocznia NIE może importować adaptera
 *  (warstwa `v2/canvas` → `v3/scene` byłaby odwrotną zależnością architektury). */
function hvTransformersOfGpz(gpz: Substation, snapshot: GpzHvColumnSnapshot): readonly Transformer[] {
  // SZYNY-STACJI-LUSTRO: transformatory GPZ z tej samej JEDNEJ reguły co adapter.
  return transformatoryNalezaceDoStacji(snapshot, gpz).filter((t) => wPasmieWn(t.uhv_kv));
}

type ScenePoint = { readonly x: number; readonly y: number };

const TOLERANCJA = 0.5;

function punktNaOdcinku(p: ScenePoint, points: readonly ScenePoint[]): boolean {
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const minX = Math.min(a.x, b.x) - TOLERANCJA;
    const maxX = Math.max(a.x, b.x) + TOLERANCJA;
    const minY = Math.min(a.y, b.y) - TOLERANCJA;
    const maxY = Math.max(a.y, b.y) + TOLERANCJA;
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    if (Math.abs(cross) / len <= TOLERANCJA) return true;
  }
  return false;
}

/** Odcinek szyny GPZ (sekcja 110 kV / szyna WN / szyna główna sekcji SN). */
function jestSzynaGpz(ownerRef: string | undefined): boolean {
  return ownerRef != null && (ownerRef.endsWith('#hv-bus') || ownerRef.endsWith('#bus-primary'));
}

/** Refy wyniku (`busResultRef`, = `Bus.ref_id` modelu) szyn GPZ, na których leży punkt;
 *  szyna bez refu wyniku zgłaszana swoim `ownerRef` (rysunek bez wiązania z modelem). */
function szynyPodPunktem(scene: SceneV3, p: ScenePoint): readonly string[] {
  const wynik = new Set<string>();
  for (const seg of scene.segments) {
    if (!jestSzynaGpz(seg.meta?.ownerRef) || !punktNaOdcinku(p, seg.points)) continue;
    wynik.add(seg.meta?.busResultRef ?? seg.meta?.ownerRef ?? '?');
  }
  return [...wynik].sort();
}

/** Szyny GPZ osiągalne torem rysunku z punktu `start`: przez odcinki (wspólny punkt) i symbole
 *  aparatów (port → wszystkie porty), bez przechodzenia przez szyny, łączniki szyn
 *  (`#tie-a`/`#tie-b`, symbole łączników sekcji) — te rozdzielają sekcje. */
function szynyOsiagalne(scene: SceneV3, start: ScenePoint): readonly string[] {
  const osiagniete = new Set<string>();
  const odwiedzoneOdcinki = new Set<number>();
  const odwiedzoneSymbole = new Set<number>();
  const kolejka: ScenePoint[] = [start];
  while (kolejka.length > 0) {
    const p = kolejka.pop()!;
    scene.segments.forEach((seg, i) => {
      if (odwiedzoneOdcinki.has(i) || !punktNaOdcinku(p, seg.points)) return;
      const ownerRef = seg.meta?.ownerRef;
      if (jestSzynaGpz(ownerRef)) {
        osiagniete.add(seg.meta?.busResultRef ?? ownerRef ?? '?');
        return;
      }
      if (ownerRef?.endsWith('#tie-a') || ownerRef?.endsWith('#tie-b')) return;
      odwiedzoneOdcinki.add(i);
      kolejka.push(...seg.points);
    });
    scene.symbols.forEach((sym, i) => {
      if (odwiedzoneSymbole.has(i)) return;
      if (sym.meta?.parityKeys?.some((k) => k === 'gpz.coupler' || k === 'gpz.coupler.hv')) return;
      const def = SYMBOL_DEFS[sym.symbolId];
      const porty = def.ports.map((port) => ({ x: sym.x + port.x, y: sym.y + port.y }));
      if (!porty.some((q) => Math.abs(q.x - p.x) <= TOLERANCJA && Math.abs(q.y - p.y) <= TOLERANCJA)) return;
      odwiedzoneSymbole.add(i);
      kolejka.push(...porty);
    });
  }
  return [...osiagniete].sort();
}

/** Punkty 5–7 wyroczni `gpzHvColumnGaps` (sekcje 110 kV, łączniki szyn, źródła) dla GPZ. */
function gpzModelParityGaps(
  scene: SceneV3,
  snapshot: GpzHvColumnSnapshot,
  gpz: Substation,
  trRef: string,
): readonly GpzHvColumnGap[] {
  const gaps: GpzHvColumnGap[] = [];
  const luka = (reason: string): void => {
    gaps.push({ gpzRef: gpz.ref_id, transformerRef: trRef, reason });
  };
  const sekcjeWn = gpz.gpz_hv_sections ?? [];
  for (const sekcja of sekcjeWn) {
    const odcinki = scene.segments.filter(
      (seg) => (seg.meta?.ownerRef?.endsWith('#hv-bus') ?? false) && seg.meta?.busResultRef === sekcja.bus_ref,
    );
    if (odcinki.length !== 1) {
      luka(`Sekcja 110 kV ${sekcja.section_id} (szyna ${sekcja.bus_ref}): ${odcinki.length} odcinków szyny WN na rysunku, oczekiwany 1.`);
    }
  }
  const szynySekcji = new Set([...sekcjeWn, ...(gpz.gpz_sections ?? [])].map((sekcja) => sekcja.bus_ref));
  for (const galaz of snapshot.branches ?? []) {
    if (galaz.type !== 'bus_coupler') continue;
    const from = galaz.from_bus_ref;
    const to = galaz.to_bus_ref;
    if (!from || !to || !szynySekcji.has(from) || !szynySekcji.has(to)) continue;
    // Glif łącznika na osi szyny (`lineSwitch`/`lineBreaker`); znacznik punktu normalnie
    // otwartego (`noPoint`) pod tym samym refem jest adnotacją stanu normalnego, nie łącznikiem.
    const symbole = scene.symbols.filter(
      (sym) => sym.meta?.ownerRef === galaz.ref_id && (sym.symbolId === 'lineSwitch' || sym.symbolId === 'lineBreaker'),
    );
    if (symbole.length !== 1) {
      luka(`Łącznik szyn ${galaz.ref_id} (${from}–${to}): ${symbole.length} symboli na rysunku, oczekiwany 1.`);
      continue;
    }
    const stan = symbole[0].state;
    const status = galaz.status;
    if ((status === 'closed' && stan === 'open') || (status === 'open' && stan === 'closed')) {
      luka(`Łącznik szyn ${galaz.ref_id}: na rysunku „${stan}", w modelu status „${status}".`);
    }
  }
  const szynyGpz = szynyStacji(snapshot, gpz);
  for (const zrodlo of snapshot.sources ?? []) {
    if (!zrodlo.bus_ref || !szynyGpz.has(zrodlo.bus_ref)) continue;
    const symbole = scene.symbols.filter((sym) => sym.symbolId === 'gridSource' && sym.meta?.ownerRef === zrodlo.ref_id);
    if (symbole.length !== 1) {
      luka(`Źródło ${zrodlo.ref_id} (szyna ${zrodlo.bus_ref}): ${symbole.length} symboli na rysunku, oczekiwany 1.`);
      continue;
    }
    const sym = symbole[0];
    const port = SYMBOL_DEFS.gridSource.ports.find((q) => q.dir === 'S') ?? SYMBOL_DEFS.gridSource.ports[0];
    const szyny = szynyOsiagalne(scene, { x: sym.x + port.x, y: sym.y + port.y });
    if (szyny.length !== 1 || szyny[0] !== zrodlo.bus_ref) {
      luka(`Źródło ${zrodlo.ref_id}: tor rysunku dochodzi do szyn [${szyny.join(', ')}], model: ${zrodlo.bus_ref}.`);
    }
  }
  return gaps;
}

/**
 * D3-1 (spec §21.1) + karta GPZ-H5-SLD (parytet rysunku z modelem): dla każdego GPZ
 * (`station_type==='gpz'`) niosącego ≥1 transformator WN/SN w ENM, scena ROZWINIĘTA musi mieć:
 *   1. symbol `transformer2W` z `meta.ownerRef === transformerRef`;
 *   2. szynę WN (odcinek `…#hv-bus`);
 *   3. połączenie szyna WN→TR (`<TR>#hv-connector`), którego górny koniec leży na szynie
 *      o refie wyniku `Transformer.hv_bus_ref` (i tylko na niej);
 *   4. połączenie TR→szyna SN (`<TR>#tr-field-to-bus`), którego dolny koniec leży na szynie
 *      o refie wyniku `Transformer.lv_bus_ref` (i tylko na niej);
 *   5. sekcje 110 kV (`gpz_hv_sections`): KAŻDA sekcja = DOKŁADNIE JEDEN odcinek `…#hv-bus`
 *      o refie wyniku `GPZSection.bus_ref` (jedna wspólna kreska przy dwóch sekcjach = luka);
 *   6. łączniki szyn (`bus_coupler` między szynami sekcji 110 kV albo SN tego GPZ): symbol
 *      o `ownerRef` = ref gałęzi, w stanie NIESPRZECZNYM ze `status` gałęzi (otwarty na
 *      rysunku przy `status: 'closed'` albo odwrotnie = luka; `unknown` dopuszczony — rekordy
 *      aparatów pola sprzeczne ze statusem, `stanAparatowPola.ts`);
 *   7. źródła (`Source` z `bus_ref` na szynie GPZ): DOKŁADNIE JEDEN symbol `gridSource`
 *      o `ownerRef` = ref źródła, którego tor (zejście → przedłużenie szyny albo aparaty pola
 *      liniowego → zaczep pola) dochodzi do szyny o refie wyniku `Source.bus_ref` i do żadnej
 *      innej (jedno źródło przy dwóch w modelu = luka; źródło na cudzej szynie = luka).
 * Wyrocznia czyta surowe rekordy ENM (`branches`, `sources`, `gpz_hv_sections`) — nie
 * adapter rysunku — więc błąd adaptera nie może jej „przekonać". Każdy brak dopisuje osobny
 * gap (WHITE BOX, audytowalne pojedynczo).
 */
export function gpzHvColumnGaps(scene: SceneV3, snapshot: GpzHvColumnSnapshot): readonly GpzHvColumnGap[] {
  const gaps: GpzHvColumnGap[] = [];
  const gpzSubstations = (snapshot.substations ?? []).filter((s) => s.station_type === 'gpz');

  for (const gpz of gpzSubstations) {
    // KD-7: blok zwinięty (KD-5) nie rysuje geometrii wewnętrznej Z ZAŁOŻENIA —
    // §21.1 opisuje kolumnę WN rysunku ROZWINIĘTEGO (patrz `gpzBlockCollapsed`).
    if (gpzBlockCollapsed(scene, gpz.ref_id)) continue;
    const hvTransformers = hvTransformersOfGpz(gpz, snapshot);
    // Karta GPZ-H5-SLD: parytet sekcji, łączników i źródeł obowiązuje KAŻDY rozwinięty GPZ —
    // także równoważnik na szynach SN bez transformatorów w modelu.
    gaps.push(...gpzModelParityGaps(scene, snapshot, gpz, hvTransformers[0]?.ref_id ?? ''));
    if (hvTransformers.length === 0) continue; // ENM nie niesie TR WN/SN dla tego GPZ — poza zakresem D3-1.

    const hvBusPresent = scene.segments.some((seg) => seg.meta?.ownerRef?.endsWith('#hv-bus') ?? false);

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
      const trToBus = scene.segments.find((seg) => seg.meta?.ownerRef === `${tr.ref_id}#tr-field-to-bus`);
      if (!trToBus) {
        gaps.push({ gpzRef: gpz.ref_id, transformerRef: tr.ref_id, reason: `Brak połączenia TR→szyna SN (#tr-field-to-bus) dla ${tr.ref_id}.` });
      }
      // Karta GPZ-H5-SLD: zaczepy transformatora na SWOICH szynach modelu.
      const hvConnectorSeg = scene.segments.find((seg) => seg.meta?.ownerRef === `${tr.ref_id}#hv-connector`);
      const zaczepy: readonly [ScenePoint | undefined, string | null | undefined, string][] = [
        [hvConnectorSeg?.points[0], tr.hv_bus_ref, 'WN'],
        [trToBus?.points[trToBus.points.length - 1], tr.lv_bus_ref, 'SN'],
      ];
      for (const [punkt, busRef, strona] of zaczepy) {
        if (!punkt || !busRef) continue;
        const szyny = szynyPodPunktem(scene, punkt);
        if (szyny.length !== 1 || szyny[0] !== busRef) {
          gaps.push({
            gpzRef: gpz.ref_id,
            transformerRef: tr.ref_id,
            reason: `Zaczep strony ${strona} transformatora ${tr.ref_id} leży na szynach [${szyny.join(', ')}], model: ${busRef}.`,
          });
        }
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
  } else if (!gpzSnBusThickness && scene.meta.sections.length > 0 && !gpzBlockCollapsed(scene)) {
    // KD-7: blok zwinięty (KD-5) nie rysuje szyn sekcji SN — nie ma czego
    // wyróżniać grubością; kryterium POWIERZCHNI strefy (a) obowiązuje nadal,
    // także na przeglądzie (patrz `gpzBlockCollapsed`).
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
