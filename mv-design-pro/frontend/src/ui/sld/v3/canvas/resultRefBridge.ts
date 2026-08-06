/**
 * S9-2 (AUDYT_JAKOSCI_SLD_2026-08, znalezisko W-1 „wyniki NIE pojawiają się na
 * schemacie") — MOST PRZESTRZENI REFÓW: element rysunku ↔ punkt wyniku backendu.
 *
 * DIAGNOZA (pomiar, nie domysł — sieć zbudowana operacjami domenowymi API,
 * bieg zwarciowy i rozpływowy z żywego backendu):
 *   * payload `/api/execution/runs/{run}/results/v1` klucza elementy
 *     KANONICZNYM refem ENM (`stn/…/sn_bus`, `stn/…/nn_bus`, `seg/…/segment`,
 *     `stn/…/transformer`);
 *   * scena v3 nazywa te same obiekty refami KOMPOZYTOWYMI rysunku
 *     (`${stationRef}#sn-bus`, `${stationRef}#lv-bus`) albo refem POLA
 *     (`…/sn_field/003` dla symbolu transformatora stacji);
 *   * most istniał WYŁĄCZNIE dla GPZ (`meta.busResultRef`, ADAPTER-BUSREF /
 *     V12K-163 — sekcja SN i szyna 110 kV), więc na sieci 1 GPZ + 16 stacji
 *     dopasowywał się 1 punkt na 32. To ta sama KLASA defektu, co naprawiona
 *     wtedy INSTANCJA (przegląd 2026-08-01: „naprawiono instancję, nie klasę").
 *
 * Ten moduł domyka klasę: buduje mapę `ownerRef sceny → punkt wyniku` dla
 * WSZYSTKICH pozostałych rodzin elementów, WYŁĄCZNIE z danych ENM (żadnej
 * heurystyki nazw, żadnego zgadywania). Miejsce, którego most nie pokrywa, jest
 * policzone jawnie (`classifyResultPoints`), nie ginie po cichu.
 *
 * ZERO fizyki (§0): most nie czyta ani jednej wielkości wyniku — operuje na
 * refach i deklaracjach modelu.
 */
import type { Bus, EnergyNetworkModel, Substation, Transformer } from '../../../../types/enm';
import { pickStationBus } from '../../shared/stationBusResolution';
import type { ResultLabelKind } from './resultLabelTemplates';

/** Sufiksy refów rysunkowych szyn stacji (`compose/station.ts`) — jedyne dwa
 *  odcinki szyny, które kompozycja stacji rysuje: strona SN i strona nN. */
const STATION_SN_BUS_SUFFIX = '#sn-bus';
const STATION_LV_BUS_SUFFIX = '#lv-bus';

/** Wiązanie elementu rysunku z punktem wyniku: ref punktu w przestrzeni ENM +
 *  klasa elementu (decyduje o rodzinie szablonów i kotwicy etykiety). */
export interface ResultRefBinding {
  readonly resultRef: string;
  readonly kind: ResultLabelKind;
}

/** Most: `ownerRef` elementu sceny → punkt wyniku. Brak wpisu = element nie ma
 *  udowodnionego odpowiednika w wyniku (wołający schodzi do `meta.busResultRef`
 *  / `ownerRef`, czyli zachowania sprzed karty). */
export type ResultRefBridge = ReadonlyMap<string, ResultRefBinding>;

const EMPTY_BRIDGE: ResultRefBridge = new Map();

function busIndex(snapshot: EnergyNetworkModel): ReadonlyMap<string, Bus> {
  return new Map((snapshot.buses ?? []).map((bus) => [bus.ref_id, bus]));
}

/** Rekordy `field_specs` stacji (ENM `Substation.meta.field_specs`) — źródło
 *  roli pola. Ten sam kanał, z którego adapter v2 czyta pola stacji. */
interface FieldSpecLike {
  readonly field_ref?: string;
  readonly bay_role?: string;
  readonly bus_ref?: string;
}

/**
 * Szyna, do której RYSUNEK przyczepia pola stacji — jedyna szyna wskazywana
 * przez `field_specs[].bus_ref` wszystkich pól SN stacji. To NIE jest to samo
 * pytanie, co „szyna o najwyższym napięciu" (`pickStationBus`): kompozycja
 * stacji rysuje odcinek `#sn-bus` OD PIERWSZEGO DO OSTATNIEGO ZACZEPU POLA
 * (`compose/station.ts`), więc narysowana szyna to dokładnie szyna pól — i to
 * ona ma dostać etykietę. Dla GPZ reguła „najwyższe napięcie" wskazałaby szynę
 * 110 kV, a blok GPZ na poziomie przeglądu reprezentuje rozdzielnię SN.
 *
 * Pola wskazujące RÓŻNE szyny (stacja dwusekcyjna) ⇒ `null`: rysunek ma jeden
 * odcinek `#sn-bus`, więc przypisanie byłoby zgadywaniem, którą sekcję pokazuje.
 */
function stationFieldBusRef(substation: Substation): string | null {
  let found: string | null = null;
  for (const spec of fieldSpecsOf(substation)) {
    const busRef = spec.bus_ref;
    if (!busRef) continue;
    if (found === null) found = busRef;
    else if (found !== busRef) return null;
  }
  return found;
}

function fieldSpecsOf(substation: Substation): readonly FieldSpecLike[] {
  const meta = substation.meta as { field_specs?: readonly FieldSpecLike[] } | undefined;
  const specs = meta?.field_specs;
  return Array.isArray(specs) ? specs : [];
}

/**
 * Zbuduj most dla całej migawki. Pokrycie (rodzina → reguła wyprowadzenia,
 * wszystkie z DANYCH, nie z nazw):
 *
 * | element rysunku                 | punkt wyniku                  | reguła |
 * |---------------------------------|-------------------------------|--------|
 * | `${stationRef}#sn-bus`          | szyna pól SN stacji           | `stationFieldBusRef` (szyna, z której rysunek buduje odcinek) |
 * | `${stationRef}` (blok L0)       | szyna pól SN stacji           | jw. — wartość STACYJNA na poziomie przeglądu |
 * | `${stationRef}#lv-bus`          | szyna nN stacji               | `pickStationBus(…,'nn')` |
 * | ref pola o roli `TR`            | transformator stacji          | `Substation.transformer_refs` — WYŁĄCZNIE gdy dokładnie jeden |
 *
 * Odmowy (zamiast zgadywania): stacja, której pola wskazują różne szyny
 * (dwusekcyjna), stacja z dwiema szynami nN tego samego napięcia
 * (`StationBusPick.ambiguous`) i stacja z wieloma transformatorami — rysunek
 * ma po jednym odcinku szyny / symbolu na pole, więc przypisanie byłoby
 * zgadywaniem. Punkt trafia wtedy do licznika „bez elementu rysunku".
 */
export function buildResultRefBridge(snapshot: EnergyNetworkModel | null): ResultRefBridge {
  if (!snapshot) return EMPTY_BRIDGE;
  const buses = busIndex(snapshot);
  const transformerByRef = new Map<string, Transformer>(
    (snapshot.transformers ?? []).map((tr) => [tr.ref_id, tr]),
  );
  const bridge = new Map<string, ResultRefBinding>();
  for (const substation of snapshot.substations ?? []) {
    const stationRef = substation.ref_id;
    const snBusRef = stationFieldBusRef(substation);
    const nn = pickStationBus(substation, buses, 'nn');
    if (snBusRef && buses.has(snBusRef)) {
      bridge.set(`${stationRef}${STATION_SN_BUS_SUFFIX}`, { resultRef: snBusRef, kind: 'bus' });
      // Blok stacji na poziomie przeglądu (L0) niesie wartość STACYJNĄ —
      // wielkość szyny SN stacji (dla zwarć: Ik″ punktu stacji; dla rozpływu:
      // napięcie szyny). Ten sam punkt wyniku, inna kotwica — dlatego most
      // wskazuje go z DWÓCH refów rysunku, a warstwa etykiet deduplikuje po
      // `resultRef` (jedna etykieta na punkt w obrębie jednej sceny).
      bridge.set(stationRef, { resultRef: snBusRef, kind: 'bus' });
    }
    if (nn.ref) {
      bridge.set(`${stationRef}${STATION_LV_BUS_SUFFIX}`, { resultRef: nn.ref, kind: 'bus' });
    }
    const transformerRefs = (substation.transformer_refs ?? []).filter((ref) => transformerByRef.has(ref));
    if (transformerRefs.length === 1) {
      for (const spec of fieldSpecsOf(substation)) {
        if (!spec.field_ref || String(spec.bay_role ?? '').toUpperCase() !== 'TR') continue;
        bridge.set(spec.field_ref, { resultRef: transformerRefs[0], kind: 'transformer' });
      }
    }
  }
  return bridge;
}

// ---------------------------------------------------------------------------
// UCZCIWY RACHUNEK POKRYCIA — cztery ROZŁĄCZNE kategorie, suma = liczba punktów
// wyniku (inwariant testowany). Wzorzec 1:1 z nakładką różnic A/B (V12K-327):
// brak etykiety ma mieć NAZWANY powód, nigdy „po prostu nie widać".
// ---------------------------------------------------------------------------

/** Deklaracja modelu „tego węzła nie rysujemy na schemacie"
 *  (`Bus.meta.render_on_sld === false`, ENM: `INLINE_TERMINAL` — mufa/węzeł
 *  ciągu, `FIELD_TERMINAL` — zacisk pola). To NIE jest brak warstwy wynikowej,
 *  tylko własne oświadczenie modelu: taki punkt nie ma elementu rysunku z
 *  definicji. */
export function resultPointsHiddenByModel(snapshot: EnergyNetworkModel | null): ReadonlySet<string> {
  const hidden = new Set<string>();
  if (!snapshot) return hidden;
  const collections: readonly { readonly ref_id: string; readonly meta?: Record<string, unknown> | null }[][] = [
    (snapshot.buses ?? []) as never,
    (snapshot.branches ?? []) as never,
    (snapshot.transformers ?? []) as never,
  ];
  for (const collection of collections) {
    for (const element of collection) {
      if (element?.meta?.render_on_sld === false) hidden.add(element.ref_id);
    }
  }
  return hidden;
}

/** Rozkład punktów wyniku na cztery ROZŁĄCZNE kategorie (suma = `total`). */
export interface ResultPointCoverage {
  /** Wszystkie punkty payloadu (`elements`). */
  readonly total: number;
  /** Punkty z narysowaną etykietą (mają element rysunku i szablon treści). */
  readonly labelled: number;
  /** Punkty, których model JAWNIE nie rysuje (`meta.render_on_sld === false`). */
  readonly hiddenByModel: number;
  /** Punkty bez szablonu treści dla tej rodziny analizy (np. gałąź w wyniku
   *  zwarciowym — rodzina `short_circuit` ma szablon wyłącznie dla szyn). */
  readonly withoutTemplate: number;
  /** Punkty rysowalne i z szablonem, dla których nie znaleziono elementu sceny
   *  (odmowa mostu albo element spoza bieżącej sieci) — REALNY brak pokrycia. */
  readonly withoutAnchor: number;
  /** Refy z `withoutAnchor` (posortowane) — do diagnostyki i testu; pusta lista
   *  to stan docelowy. */
  readonly withoutAnchorRefs: readonly string[];
}
