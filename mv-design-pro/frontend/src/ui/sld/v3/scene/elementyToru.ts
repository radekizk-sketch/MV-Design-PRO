/**
 * Karta SLD-SUBSTRAT (kontynuacja) — ELEMENTY LEŻĄCE NA TORZE, które nie są
 * odcinkiem ani stacją: łącznik sekcyjny (punkt podziału), węzeł nazwany i odcinek
 * powiązania pierścieniowego między końcami dwóch ciągów.
 *
 * Każdy z nich był w modelu i NIE miał żadnego prymitywu na kanwie (wyrocznia
 * `kompletnoscRysunku`): adapter kładzie na ciągu wyłącznie odcinki, więc łącznik
 * sekcyjny znikał między dwiema połówkami kabla (rysunek pokazywał tor ciągły tam,
 * gdzie model ma łącznik — także OTWARTY), węzeł nazwany nie miał ani kropki, ani
 * nazwy, a powiązanie pierścieniowe (odcinek poza korytarzem, np. rezerwa
 * pierścieniowa między końcami dwóch odgałęzień) nie było rysowane wcale, przy czym
 * oba jego końce nosiły słupek „koniec otwarty" — rysunek twierdził coś przeciwnego
 * do modelu.
 *
 * Położenie jest WYPROWADZONE z geometrii odcinków już narysowanych (kawałki toru
 * z `ownerRef` = ref odcinka ENM): łącznik stoi w punkcie, w którym kończy się
 * odcinek wchodzący do jego węzła i zaczyna odcinek wychodzący z drugiego węzła;
 * węzeł nazwany — w końcu odcinka, który do niego dochodzi; powiązanie — para znaków
 * odsyłacza w końcach odcinków kończących się w jego szynach. Brak takiej geometrii = notatka
 * STOP z nazwą elementu (wyrocznia kompletności zgłosi go jako niewyjaśniony),
 * nigdy domysł położenia.
 */
import type { EnergyNetworkModel } from '../../../../types/enm';
import { GRID, snapToGrid } from '../core/grid';
import { measureLabelWidth } from '../core/text';
import type { PreviewSegment, PreviewSymbol } from '../compose/preview';
import type { SimpleAnchoredOwnerInput } from '../layout/labels';
import type { RouteVertex } from '../layout/route';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';

export interface WynikElementowToru {
  /** Pełna lista odcinków sceny po zmianach (przerwy pod łącznikami, powiązania,
   *  zdjęte słupki „koniec otwarty" na końcach powiązanych). */
  readonly segments: readonly PreviewSegment[];
  readonly symbols: readonly PreviewSymbol[];
  readonly labels: readonly SimpleAnchoredOwnerInput[];
  readonly stopNotes: readonly string[];
  /** Odcinek, którego koniec przestał być otwarty → ref powiązania, które go zamyka —
   *  wołający zamienia jego etykietę „koniec otwarty" na odsyłacz powiązania. */
  readonly zamknieteKonceOdcinkow: ReadonlyMap<string, string>;
}

type Galaz = {
  readonly ref_id: string;
  readonly name: string;
  readonly type: string;
  readonly from_bus_ref: string;
  readonly to_bus_ref: string;
  readonly status?: string;
  readonly meta?: Readonly<Record<string, unknown>> | null;
};

const TYPY_ODCINKA = new Set(['cable', 'line_overhead']);
const TYPY_LACZNIKA = new Set(['switch', 'breaker']);

const rowne = (a: RouteVertex, b: RouteVertex): boolean => a.x === b.x && a.y === b.y;

export function elementyToru(
  snapshot: EnergyNetworkModel,
  segments: readonly PreviewSegment[],
  lod: 0 | 1 | 2,
): WynikElementowToru {
  const odcinki = [...segments];
  const kawalkiOdcinka = new Map<string, number[]>();
  odcinki.forEach((segment, indeks) => {
    const ref = segment.meta?.ownerRef;
    if (segment.meta?.elementKind !== 'segment' || typeof ref !== 'string' || ref.includes('#')) return;
    const lista = kawalkiOdcinka.get(ref) ?? [];
    lista.push(indeks);
    kawalkiOdcinka.set(ref, lista);
  });
  const galezie = (snapshot.branches ?? []) as unknown as readonly Galaz[];
  const symbols: PreviewSymbol[] = [];
  const labels: SimpleAnchoredOwnerInput[] = [];
  const stopNotes: string[] = [];
  const zamknieteKonceOdcinkow = new Map<string, string>();

  /** Końce narysowanego odcinka: [początek pierwszego kawałka, koniec ostatniego]. */
  const konce = (ref: string): readonly [RouteVertex, RouteVertex] | null => {
    const indeksy = kawalkiOdcinka.get(ref);
    if (!indeksy || indeksy.length === 0) return null;
    const pierwszy = odcinki[indeksy[0]].points;
    const ostatni = odcinki[indeksy[indeksy.length - 1]].points;
    return [pierwszy[0], ostatni[ostatni.length - 1]];
  };
  /** Punkt szyny = koniec narysowanego odcinka, który się w niej kończy (orientacja
   *  kawałków od zasilania: `to_bus_ref` ↔ ostatni wierzchołek) albo zaczyna. */
  const punktSzyny = (busRef: string, bezOdcinka?: string): RouteVertex | null => {
    for (const galaz of galezie) {
      if (!TYPY_ODCINKA.has(galaz.type) || galaz.ref_id === bezOdcinka) continue;
      const k = konce(galaz.ref_id);
      if (!k) continue;
      if (galaz.to_bus_ref === busRef) return k[1];
      if (galaz.from_bus_ref === busRef) return k[0];
    }
    return null;
  };
  const zamienPunkt = (indeks: number, stary: RouteVertex, nowy: RouteVertex): void => {
    const segment = odcinki[indeks];
    odcinki[indeks] = { ...segment, points: segment.points.map((p) => (rowne(p, stary) ? nowy : p)) };
  };
  /** Kawałek odcinka, który ma wierzchołek `p`, i sąsiedni wierzchołek (kierunek biegu). */
  const kawalekPrzy = (p: RouteVertex): { indeks: number; sasiad: RouteVertex } | null => {
    for (const [ref, indeksy] of kawalkiOdcinka) {
      void ref;
      for (const indeks of indeksy) {
        const pts = odcinki[indeks].points;
        if (rowne(pts[0], p) && pts.length > 1) return { indeks, sasiad: pts[1] };
        if (rowne(pts[pts.length - 1], p) && pts.length > 1) return { indeks, sasiad: pts[pts.length - 2] };
      }
    }
    return null;
  };

  // -- (1) Łączniki na torze: gałąź switch/breaker między dwoma końcami odcinków.
  for (const galaz of galezie) {
    if (!TYPY_LACZNIKA.has(galaz.type) || galaz.meta?.render_on_sld === false) continue;
    const a = punktSzyny(galaz.from_bus_ref);
    const b = punktSzyny(galaz.to_bus_ref);
    if (a == null && b == null) continue; // łącznik poza torem SN (pole stacji, nN) — nie ta klasa.
    if (a == null || b == null || !rowne(a, b)) {
      stopNotes.push(
        `Łącznik „${galaz.name}" (${galaz.ref_id}) leży między odcinkami, których końce na rysunku się nie spotykają — łącznik bez symbolu.`,
      );
      continue;
    }
    const przy = kawalekPrzy(a);
    const poziomy = przy == null || przy.sasiad.y === a.y;
    const wylacznik = galaz.type === 'breaker';
    const symbolId: SymbolId = poziomy
      ? wylacznik ? 'lineBreaker' : 'lineSwitch'
      : wylacznik ? 'breaker' : 'disconnector';
    const def = SYMBOL_DEFS[symbolId];
    const x = snapToGrid(a.x - def.width / 2);
    const y = snapToGrid(a.y - def.height / 2);
    const stan = galaz.status === 'open' ? 'open' : galaz.status === 'closed' ? 'closed' : 'unknown';
    symbols.push({
      symbolId,
      x,
      y,
      state: stan,
      meta: { testId: `sld-v3-lacznik-toru-${galaz.ref_id}`, ownerRef: galaz.ref_id, elementKind: 'apparatus' },
    });
    // Przerwa toru pod glifem: kawałki odcinków dochodzą do PORTÓW glifu (na
    // siatce), nie przechodzą przez nóż łącznika (otwarty łącznik z torem ciągłym
    // pod spodem czytałby się jako zamknięty).
    const portWe: RouteVertex = poziomy ? { x, y: a.y } : { x: a.x, y };
    const portWy: RouteVertex = poziomy ? { x: x + def.width, y: a.y } : { x: a.x, y: y + def.height };
    const wchodzacy = odcinkiWchodzace(galaz.from_bus_ref);
    const wychodzacy = odcinkiWychodzace(galaz.to_bus_ref);
    for (const ref of wchodzacy) przytnij(ref, a, portWe);
    for (const ref of wychodzacy) przytnij(ref, a, portWy);
    if (lod === 2) {
      labels.push({
        ownerRef: `${galaz.ref_id}#name`,
        ownerKind: 'lacznik-toru',
        text: galaz.name,
        labelClass: 't3',
        anchor: poziomy
          ? { x: a.x, y: y + def.height }
          : { x: snapToGrid(x + def.width + GRID + measureLabelWidth(galaz.name, 't3') / 2), y: a.y },
        placement: 'below',
      });
    }
  }

  function odcinkiWchodzace(busRef: string): string[] {
    return galezie.filter((g) => TYPY_ODCINKA.has(g.type) && g.to_bus_ref === busRef).map((g) => g.ref_id);
  }
  function odcinkiWychodzace(busRef: string): string[] {
    return galezie.filter((g) => TYPY_ODCINKA.has(g.type) && g.from_bus_ref === busRef).map((g) => g.ref_id);
  }
  function przytnij(ref: string, stary: RouteVertex, nowy: RouteVertex): void {
    for (const indeks of kawalkiOdcinka.get(ref) ?? []) {
      const pts = odcinki[indeks].points;
      if (rowne(pts[0], stary) || rowne(pts[pts.length - 1], stary)) zamienPunkt(indeks, stary, nowy);
    }
  }

  // -- (2) Węzły nazwane (NAMED_TERMINAL rysowany na schemacie).
  for (const bus of snapshot.buses ?? []) {
    const meta = (bus.meta ?? {}) as Record<string, unknown>;
    if (meta.visual_role !== 'NAMED_TERMINAL' || meta.render_on_sld === false) continue;
    const p = punktSzyny(bus.ref_id);
    if (p == null) {
      stopNotes.push(`Węzeł „${bus.name}" (${bus.ref_id}) nie leży na końcu żadnego narysowanego odcinka — węzeł bez symbolu.`);
      continue;
    }
    const def = SYMBOL_DEFS.junction;
    symbols.push({
      symbolId: 'junction',
      x: snapToGrid(p.x - def.width / 2),
      y: snapToGrid(p.y - def.height / 2),
      meta: { testId: `sld-v3-wezel-toru-${bus.ref_id}`, ownerRef: bus.ref_id, elementKind: 'bus' },
    });
    if (lod !== 0) {
      labels.push({
        ownerRef: `${bus.ref_id}#name`,
        ownerKind: 'busbar-voltage',
        text: bus.name,
        labelClass: 't3',
        anchor: { x: p.x, y: p.y - GRID },
        placement: 'above',
      });
    }
  }

  // -- (3) Powiązania: odcinek SN poza korytarzami (np. rezerwa pierścieniowa między
  // końcami dwóch odgałęzień), oba końce na narysowanych torach. Rysowany jako PARA
  // ZNAKÓW POWIĄZANIA w obu końcach (konwencja odsyłacza, własna klasa odcinka
  // `tieMarker` — marker na torze, nie tor), a nie jako
  // trasa przez cały arkusz: trasa między dowolnymi dwoma końcami przecinałaby tory
  // i opisy innych ciągów (kontraktowe zero skrzyżowań toru mocy i kolizji etykiet).
  // Znak zastępuje słupek „koniec otwarty" — koniec powiązany NIE jest otwarty.
  const wKorytarzu = new Set((snapshot.corridors ?? []).flatMap((c) => c.ordered_segment_refs ?? []));
  const znakiPowiazan: RouteVertex[][] = [];
  const wlascicielZnaku: string[] = [];
  for (const galaz of galezie) {
    if (!TYPY_ODCINKA.has(galaz.type) || kawalkiOdcinka.has(galaz.ref_id) || wKorytarzu.has(galaz.ref_id)) continue;
    const a = punktSzyny(galaz.from_bus_ref, galaz.ref_id);
    const b = punktSzyny(galaz.to_bus_ref, galaz.ref_id);
    if (a == null || b == null) continue; // odcinek poza SN/rysunkiem — wyrocznia kompletności go nazwie.
    for (const [busRef, punkt] of [
      [galaz.from_bus_ref, a],
      [galaz.to_bus_ref, b],
    ] as const) {
      for (const ref of odcinkiWchodzace(busRef)) zamknieteKonceOdcinkow.set(ref, galaz.ref_id);
      const przy = kawalekPrzy(punkt);
      const poziomy = przy == null || przy.sasiad.y === punkt.y;
      znakiPowiazan.push(
        poziomy
          ? [
              { x: punkt.x, y: punkt.y - GRID },
              { x: punkt.x, y: punkt.y + GRID },
            ]
          : [
              { x: punkt.x - GRID, y: punkt.y },
              { x: punkt.x + GRID, y: punkt.y },
            ],
      );
      wlascicielZnaku.push(`${galaz.ref_id}#powiazanie-${znakiPowiazan.length}`);
    }
  }

  // Słupek „koniec otwarty" na końcu, który jest powiązany, jest nieprawdą — zdjęty
  // (kawałek i jego znacznik `openTerminal`), a w jego miejscu stoi znak powiązania.
  const wynikowe = odcinki
    .filter((segment) => {
      const ref = segment.meta?.ownerRef;
      return !(typeof ref === 'string' && ref.endsWith('#open-terminal') && zamknieteKonceOdcinkow.has(ref.slice(0, -'#open-terminal'.length)));
    })
    .map((segment) => {
      const ref = segment.meta?.ownerRef;
      if (typeof ref === 'string' && zamknieteKonceOdcinkow.has(ref) && segment.meta?.openTerminal) {
        const { openTerminal: _pominiete, ...reszta } = segment.meta;
        void _pominiete;
        return { ...segment, meta: reszta };
      }
      return segment;
    });
  znakiPowiazan.forEach((points, i) => {
    wynikowe.push({ points, meta: { kind: 'tieMarker', ownerRef: wlascicielZnaku[i] } });
  });

  return { segments: wynikowe, symbols, labels, stopNotes, zamknieteKonceOdcinkow };
}
