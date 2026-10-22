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
import type { Bus, EnergyNetworkModel } from '../../../../types/enm';
import { pickStationBus, stationSideBusRefs, stationSnSectionBusRefs } from '../../shared/stationBusResolution';
import { polaSnStacji } from '../../../shared/polaStacji';
import {
  kontekstTransformatorowStacji,
  selectStationDistributionTransformers,
} from '../../../shared/transformatoryStacji';
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


/**
 * Zbuduj most dla całej migawki. Pokrycie (rodzina → reguła wyprowadzenia,
 * wszystkie z DANYCH, nie z nazw):
 *
 * | element rysunku                 | punkt wyniku                  | reguła |
 * |---------------------------------|-------------------------------|--------|
 * | `${busRef}#sn-bus`              | szyna sekcji SN stacji        | `stationSnSectionBusRefs` (sekcja = odcinek rysunku) |
 * | `${stationRef}` (blok L0)       | jedyna sekcja SN stacji       | jw. — WYŁĄCZNIE stacja jednosekcyjna; GPZ: jedyna szyna `gpz_sections` |
 * | `${stationRef}#lv-bus`          | szyna nN stacji               | `pickStationBus(…,'nn')` |
 * | ref pola o roli `TR`            | transformator stacji          | `Substation.transformer_refs` — WYŁĄCZNIE gdy dokładnie jeden |
 *
 * Odmowy (zamiast zgadywania): blok L0 stacji wielosekcyjnej, stacja z dwiema szynami nN tego samego napięcia
 * (`StationBusPick.ambiguous`) i stacja z wieloma transformatorami — rysunek
 * ma po jednym odcinku szyny / symbolu na pole, więc przypisanie byłoby
 * zgadywaniem. Punkt trafia wtedy do licznika „bez elementu rysunku".
 */
export function buildResultRefBridge(snapshot: EnergyNetworkModel | null): ResultRefBridge {
  if (!snapshot) return EMPTY_BRIDGE;
  const buses = busIndex(snapshot);
  const bridge = new Map<string, ResultRefBinding>();
  // Kontekst jedynej reguły transformatorów stacji raz na migawkę (pętla po stacjach).
  const kontekstTransformatorow = kontekstTransformatorowStacji(snapshot);
  for (const substation of snapshot.substations ?? []) {
    const stationRef = substation.ref_id;
    const nn = pickStationBus(substation, buses, 'nn');
    // GEOMETRIA-STACJI (Z-03): KAŻDA sekcja szyn SN ma własny odcinek rysunku
    // `${busRef}#sn-bus` (`compose/station.ts`), więc każda dostaje WŁASNY punkt wyniku —
    // ta sama reguła sekcji co rysunek (`stationSnSectionBusRefs`). Stacja wielosekcyjna
    // nie jest już odmową, a wynik jednej sekcji nie trafia na drugą.
    // GPZ rysuje szyny sekcji własną kompozycją (odcinki niosą `busResultRef`, K5-A), nie
    // odcinkiem `${busRef}#sn-bus`; jego sekcje SN to rekordy `gpz_sections` (szyna WN
    // rozdzielni leży powyżej pasma nN, więc reguła sekcji stacji SN wzięłaby ją za sekcję
    // i blok GPZ straciłby wiązanie).
    const gpz = substation.station_type === 'gpz';
    const sekcje = gpz
      ? [...new Set((substation.gpz_sections ?? []).map((sec) => sec.bus_ref).filter((ref) => !!ref && buses.has(ref)))]
      : stationSnSectionBusRefs(substation, buses);
    if (!gpz) {
      for (const busRef of sekcje) {
        bridge.set(`${busRef}${STATION_SN_BUS_SUFFIX}`, { resultRef: busRef, kind: 'bus' });
      }
    }
    if (sekcje.length === 1) {
      // Blok stacji na poziomie przeglądu (L0) niesie wartość STACYJNĄ —
      // wielkość szyny SN stacji (dla zwarć: Ik″ punktu stacji; dla rozpływu:
      // napięcie szyny). Ten sam punkt wyniku, inna kotwica — dlatego most
      // wskazuje go z DWÓCH refów rysunku, a warstwa etykiet deduplikuje po
      // `resultRef` (jedna etykieta na punkt w obrębie jednej sceny). Blok L0 stacji
      // WIELOSEKCYJNEJ jest jednym symbolem dla kilku szyn — wskazanie jednej z nich
      // byłoby wyborem z domysłu; wartości sekcji niosą odcinki szyn od L1.
      bridge.set(stationRef, { resultRef: sekcje[0], kind: 'bus' });
    }
    if (nn.ref) {
      bridge.set(`${stationRef}${STATION_LV_BUS_SUFFIX}`, { resultRef: nn.ref, kind: 'bus' });
    }
    // SZYNY-STACJI-LUSTRO: transformatory pola TR = transformatory ROZDZIELCZE stacji z jednej
    // reguły (transformator blokowy źródła DER stoi w polu źródłowym, nie w polu TR).
    const transformerRefs = selectStationDistributionTransformers(snapshot, substation, kontekstTransformatorow).map((tr) => tr.ref_id);
    if (transformerRefs.length === 1) {
      for (const bay of polaSnStacji(snapshot, substation.ref_id)) {
        if (bay.bay_role !== 'TR') continue;
        bridge.set(bay.ref_id, { resultRef: transformerRefs[0], kind: 'transformer' });
      }
    }
  }
  return bridge;
}

// ---------------------------------------------------------------------------
// UCZCIWY RACHUNEK POKRYCIA — pięć ROZŁĄCZNYCH kategorii, suma = liczba punktów
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

/** Szyny rozdzielnicy nN stacji spoza jej szyn głównych (karta SLD-SUBSTRAT): szyny za
 *  aparatami pól nN promowanych do modelu — zacisk wyłącznika głównego nN, szyny odpływów
 *  i pól źródeł. Należą do rozdzielnicy nN stacji, a nie do schematu SN — kanwa SN pokazuje
 *  stację jednym symbolem z szyną nN i agregatem odbioru. Zbiór z JEDNEGO złożenia reguł
 *  (SZYNY-STACJI-LUSTRO): strona nN szyn stacji (`stationSideBusRefs`, ta sama reguła co
 *  agregat odbioru i inspektor) minus `Substation.bus_refs`. Zaciski pól SN leżą po stronie
 *  SN, więc tu nie trafiają. Punkt wyniku na takiej szynie nie jest „zgubiony" — ma
 *  nazwany powód braku etykiety na schemacie SN. */
export function resultPointsInStationNnBoard(snapshot: EnergyNetworkModel | null): ReadonlySet<string> {
  const refs = new Set<string>();
  if (!snapshot) return refs;
  const busByRef = new Map((snapshot.buses ?? []).map((bus) => [bus.ref_id, bus]));
  for (const station of snapshot.substations ?? []) {
    const own = new Set(station.bus_refs ?? []);
    for (const ref of stationSideBusRefs(snapshot, station, busByRef, 'nn')) {
      if (!own.has(ref)) refs.add(ref);
    }
  }
  return refs;
}

/** Rozkład punktów wyniku na pięć ROZŁĄCZNYCH kategorii (suma = `total`). */
export interface ResultPointCoverage {
  /** Wszystkie punkty payloadu (`elements`). */
  readonly total: number;
  /** Punkty z narysowaną etykietą (mają element rysunku i szablon treści). */
  readonly labelled: number;
  /** Punkty, których model JAWNIE nie rysuje (`meta.render_on_sld === false`). */
  readonly hiddenByModel: number;
  /** GPZ-PARYTET: punkty pokazane w karcie GPZ prawego inspektora (wiersze `Bay`
   *  i `Substation` z `results/v1`) — nie etykietą przy elemencie, tylko w tabeli pól
   *  i bilansie karty GPZ (klik w nagłówek bloku GPZ). */
  readonly inGpzPanel: number;
  /** Punkty bez szablonu treści dla tej rodziny analizy (np. gałąź w wyniku
   *  zwarciowym — rodzina `short_circuit` ma szablon wyłącznie dla szyn). */
  readonly withoutTemplate: number;
  /** Punkty na szynach odpływów nN stacji (`resultPointsInStationNnBoard`) — element
   *  istnieje w rozdzielnicy nN stacji, nie na schemacie SN. */
  readonly inStationNnBoard: number;
  /** Punkty rysowalne i z szablonem, dla których nie znaleziono elementu sceny
   *  (odmowa mostu albo element spoza bieżącej sieci) — REALNY brak pokrycia. */
  readonly withoutAnchor: number;
  /** Refy z `withoutAnchor` (posortowane) — do diagnostyki i testu; pusta lista
   *  to stan docelowy. */
  readonly withoutAnchorRefs: readonly string[];
}
