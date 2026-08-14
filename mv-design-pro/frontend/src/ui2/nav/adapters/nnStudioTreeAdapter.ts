/*
 * Adapter drzewa nN STUDIO (karta P0.9, plan F §1 „Drzewo (LEWA)"): TR → RGnN
 * (sekcje) → odpływy → podrozdzielnice → odbiory/źródła. Czyta ISTNIEJĄCĄ
 * migawkę modelu (`useSnapshotStore.snapshot`, read-only) i mapuje na
 * `WezelDrzewa[]` — ten sam kontrakt co `topologyTreeAdapter.ts`, komponent
 * `ContextTree` pozostaje agnostyczny wobec źródła.
 *
 * Drzewo obejmuje WYŁĄCZNIE szyny/stacje/odbiory/źródła — odcinki (gałęzie)
 * NIE mają własnego węzła (są krawędzią rodzic→dziecko, niejawną): przegląd
 * i edycja odcinków żyje w zakładce ODCINKI (tabela edytowalna), zgodnie z
 * podziałem odpowiedzialności planu F §2 (drzewo = topologia obiektów,
 * tabela = atrybuty odcinków). Zero fizyki — wyłącznie odczyt struktury ENM.
 *
 * Zasięg wejścia (`stationRef`, kontekst „stacji/rozdzielnicy" z planu F §1):
 * - stacja z transformatorem SN/nN (`transformer_refs` niepuste) → korzeń to
 *   węzeł transformatora, poddrzewo zaczyna się od `transformer.lv_bus_ref`;
 * - samodzielna rozdzielnica nN (`station_type === 'rozdzielnica_nn'`) bez
 *   widocznego zasilania w tym zasięgu → korzeń to węzeł stacji wprost.
 *
 * Rozdzielnice nN napotkane W GŁĘBI drzewa (poddrzewo `add_nn_distribution_board`)
 * dają węzeł „podrozdzielnicy" tym samym mechanizmem — rekurencja, zero
 * duplikacji kodu (reguła KLASA NIE INSTANCJA §3: jedno miejsce wykrywania
 * przynależności szyny do rozdzielnicy nN, `stacjaDlaSzyny`).
 */

import { useMemo } from 'react';
import type { Branch, EnergyNetworkModel, Generator, Load, NnSection, Substation } from '../../../types/enm';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { LICZNIKI_ZERO, type WezelDrzewa } from '../treeModel';

const PASMO_NN_MAX_KV = 1.0;

function kolekcja<T>(wartosc: T[] | null | undefined): T[] {
  return Array.isArray(wartosc) ? wartosc : [];
}

function jestNn(snapshot: EnergyNetworkModel, busRef: string): boolean {
  const bus = snapshot.buses.find((b) => b.ref_id === busRef || b.id === busRef);
  if (!bus) return false;
  const dodatnie = bus.voltage_kv > 0;
  const ponizejProguNn = bus.voltage_kv < PASMO_NN_MAX_KV;
  return dodatnie && ponizejProguNn;
}

function znajdzStacje(
  snapshot: EnergyNetworkModel,
  ref: string | null | undefined,
): Substation | null {
  if (!ref) return null;
  return snapshot.substations.find((s) => s.ref_id === ref || s.id === ref) ?? null;
}

/** Rozdzielnica nN, do której należy dana szyna (główna albo sekcyjna) — jedno
 *  źródło prawdy przynależności, reużyte przez korzeń i rekurencję w głębi. */
function stacjaDlaSzyny(snapshot: EnergyNetworkModel, busRef: string): Substation | null {
  return (
    snapshot.substations.find((s) => {
      if (s.station_type !== 'rozdzielnica_nn') return false;
      if (s.bus_refs.includes(busRef)) return true;
      return kolekcja(s.nn_sections).some((sec) => sec.bus_ref === busRef);
    }) ?? null
  );
}

function sekcjeStacji(station: Substation): NnSection[] {
  const sekcje = kolekcja(station.nn_sections);
  if (sekcje.length > 0) {
    return [...sekcje].sort((a, b) => a.order - b.order);
  }
  // Rozdzielnica jednosekcyjna bez jawnego rejestru sekcji (C §2.1) — sekcja
  // domyślna zakotwiczona na pierwszej szynie głównej.
  const glownaSzyna = station.bus_refs[0];
  if (!glownaSzyna) return [];
  return [{ section_id: `${station.ref_id}::sekcja-1`, order: 1, bus_ref: glownaSzyna, coupler_ref: null, incoming_refs: [] }];
}

/** Sąsiednie gałęzie tej szyny, POMIJAJĄC gałąź, którą przyszliśmy (bez zawracania). */
function galezieSasiednie(branches: Branch[], busRef: string, pominGalazRef: string | null): Branch[] {
  return branches.filter((b) => {
    if (b.ref_id === pominGalazRef) return false;
    return b.from_bus_ref === busRef || b.to_bus_ref === busRef;
  });
}

function drugiKoniec(branch: Branch, busRef: string): string {
  return branch.from_bus_ref === busRef ? branch.to_bus_ref : branch.from_bus_ref;
}

function lisceOdbiorowZrodel(snapshot: EnergyNetworkModel, busRef: string): WezelDrzewa[] {
  const odbiory: WezelDrzewa[] = kolekcja(snapshot.loads)
    .filter((l: Load) => l.bus_ref === busRef)
    .map((l) => ({
      id: `nn-load-${l.ref_id}`,
      etykietaPL: l.name || 'Odbiór nN',
      ikona: 'szyna' as const,
      liczniki: LICZNIKI_ZERO,
      dzieci: [],
      trybMin: 'basic' as const,
    }));
  const zrodla: WezelDrzewa[] = kolekcja(snapshot.generators)
    .filter((g: Generator) => g.bus_ref === busRef)
    .map((g) => ({
      id: `nn-gen-${g.ref_id}`,
      etykietaPL: g.name || 'Źródło nN',
      ikona: 'zrodlo' as const,
      liczniki: LICZNIKI_ZERO,
      dzieci: [],
      trybMin: 'basic' as const,
    }));
  return [...odbiory, ...zrodla].sort((a, b) => a.etykietaPL.localeCompare(b.etykietaPL, 'pl'));
}

/** Poddrzewo zaczepione na szynie: gdy szyna należy do rozdzielnicy nN — węzeł
 *  stacji z jej sekcjami; w przeciwnym razie zwykły węzeł szyny. Rekurencyjne —
 *  podrozdzielnice w głębi drzewa dostają dokładnie tę samą obsługę. */
function poddrzewoSzyny(
  snapshot: EnergyNetworkModel,
  busRef: string,
  pominGalazRef: string | null,
  odwiedzone: Set<string>,
): WezelDrzewa | null {
  if (odwiedzone.has(busRef)) return null; // ochrona przed cyklem
  odwiedzone.add(busRef);

  const station = stacjaDlaSzyny(snapshot, busRef);
  if (station) {
    return wezelStacji(snapshot, station, busRef, pominGalazRef, odwiedzone);
  }
  return wezelSzyny(snapshot, busRef, pominGalazRef, odwiedzone);
}

function wezelSzyny(
  snapshot: EnergyNetworkModel,
  busRef: string,
  pominGalazRef: string | null,
  odwiedzone: Set<string>,
): WezelDrzewa {
  const bus = snapshot.buses.find((b) => b.ref_id === busRef || b.id === busRef);
  const sasiednie = galezieSasiednie(snapshot.branches, busRef, pominGalazRef);
  const dzieciOdplywow = sasiednie
    .map((b) => poddrzewoSzyny(snapshot, drugiKoniec(b, busRef), b.ref_id, odwiedzone))
    .filter((w): w is WezelDrzewa => w !== null)
    .sort((a, b) => a.etykietaPL.localeCompare(b.etykietaPL, 'pl'));
  return {
    id: `nn-bus-${busRef}`,
    etykietaPL: bus?.name || busRef,
    ikona: 'szyna',
    liczniki: LICZNIKI_ZERO,
    dzieci: [...dzieciOdplywow, ...lisceOdbiorowZrodel(snapshot, busRef)],
    trybMin: 'basic',
  };
}

function wezelSekcji(
  snapshot: EnergyNetworkModel,
  section: NnSection,
  stationBusRefs: ReadonlySet<string>,
  pominGalazRef: string | null,
  odwiedzone: Set<string>,
): WezelDrzewa {
  // Sprzęgło do INNEJ sekcji tej samej stacji jest już reprezentowane jako
  // siostrzany węzeł sekcji — nie zagnieżdżamy go pod tą sekcją drugi raz.
  const sasiednie = galezieSasiednie(snapshot.branches, section.bus_ref, pominGalazRef).filter((b) => {
    const koniec = drugiKoniec(b, section.bus_ref);
    return !stationBusRefs.has(koniec);
  });
  const dzieci = sasiednie
    .map((b) => poddrzewoSzyny(snapshot, drugiKoniec(b, section.bus_ref), b.ref_id, odwiedzone))
    .filter((w): w is WezelDrzewa => w !== null)
    .sort((a, b) => a.etykietaPL.localeCompare(b.etykietaPL, 'pl'));
  return {
    id: `nn-section-${section.section_id}`,
    etykietaPL: `Sekcja ${section.order}`,
    ikona: 'szyna',
    liczniki: LICZNIKI_ZERO,
    dzieci: [...dzieci, ...lisceOdbiorowZrodel(snapshot, section.bus_ref)],
    trybMin: 'basic',
  };
}

function wezelStacji(
  snapshot: EnergyNetworkModel,
  station: Substation,
  wejsciowaSzyna: string,
  pominGalazRef: string | null,
  odwiedzone: Set<string>,
): WezelDrzewa {
  const sekcje = sekcjeStacji(station);
  const stationBusRefs = new Set<string>(sekcje.map((s) => s.bus_ref));
  odwiedzone.add(wejsciowaSzyna);
  for (const s of sekcje) odwiedzone.add(s.bus_ref);

  const dzieciSekcji = sekcje.map((sec) =>
    wezelSekcji(
      snapshot,
      sec,
      stationBusRefs,
      sec.bus_ref === wejsciowaSzyna ? pominGalazRef : null,
      odwiedzone,
    ),
  );

  return {
    id: `nn-station-${station.ref_id}`,
    etykietaPL: station.designation ? `${station.name} (${station.designation})` : station.name,
    ikona: 'stacja',
    liczniki: LICZNIKI_ZERO,
    dzieci: dzieciSekcji,
    trybMin: 'basic',
  };
}

function wezelTransformatora(snapshot: EnergyNetworkModel, transformerRef: string): WezelDrzewa | null {
  const trafo = snapshot.transformers.find((t) => t.ref_id === transformerRef || t.id === transformerRef);
  if (!trafo || !jestNn(snapshot, trafo.lv_bus_ref)) return null;
  const odwiedzone = new Set<string>();
  const poddrzewo = poddrzewoSzyny(snapshot, trafo.lv_bus_ref, null, odwiedzone);
  return {
    id: `nn-tr-${trafo.ref_id}`,
    etykietaPL: `Transformator SN/nN ${trafo.name}`,
    ikona: 'transformator',
    liczniki: LICZNIKI_ZERO,
    dzieci: poddrzewo ? [poddrzewo] : [],
    trybMin: 'basic',
  };
}

/** Mapowanie czyste (bez React) — testowalne fixture'ami o realnym kształcie migawki. */
export function budujDrzewoNn(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null,
): WezelDrzewa[] {
  if (!snapshot || !stationRef) return [];
  const station = znajdzStacje(snapshot, stationRef);
  if (!station) return [];

  if (station.station_type === 'rozdzielnica_nn') {
    const odwiedzone = new Set<string>();
    return [wezelStacji(snapshot, station, station.bus_refs[0] ?? '', null, odwiedzone)];
  }

  const korzenie = kolekcja(station.transformer_refs)
    .map((ref) => wezelTransformatora(snapshot, ref))
    .filter((w): w is WezelDrzewa => w !== null);
  return korzenie;
}

/** Stacje kandydujące na wejście do nN STUDIO (kontekst „stacji/rozdzielnicy",
 *  plan F §1): stacje z transformatorem, którego strona nN istnieje, ORAZ
 *  samodzielne rozdzielnice nN — posortowane wg nazwy. */
export function listujStacjeNn(snapshot: EnergyNetworkModel | null): Substation[] {
  if (!snapshot) return [];
  const wynik = snapshot.substations.filter((s) => {
    if (s.station_type === 'rozdzielnica_nn') return true;
    return kolekcja(s.transformer_refs).some((ref) => {
      const trafo = snapshot.transformers.find((t) => t.ref_id === ref || t.id === ref);
      return trafo != null && jestNn(snapshot, trafo.lv_bus_ref);
    });
  });
  return [...wynik].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
}

/** Adapter read-only: `ui/topology/snapshotStore.ts` (migawka modelu). */
export function useNnStudioTree(stationRef: string | null): WezelDrzewa[] {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  return useMemo(() => budujDrzewoNn(snapshot, stationRef), [snapshot, stationRef]);
}

export function useStacjeNn(): Substation[] {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  return useMemo(() => listujStacjeNn(snapshot), [snapshot]);
}

// =============================================================================
// Odcinki kablowe nN (zakładka ODCINKI, karta P0.9) — lista PŁASKA (nie
// drzewo): BFS po WSZYSTKICH gałęziach nN (kabel/aparat/sprzęgło) od korzenia
// (korzenie transformatora) albo od szyny głównej samodzielnej rozdzielnicy nN,
// filtrowana do `type === 'cable'`. Reużywa `galezieSasiednie`/`drugiKoniec`
// (KLASA NIE INSTANCJA — jedna definicja sąsiedztwa gałęzi w tym pliku).
// =============================================================================

export interface OdcinekNnWiersz {
  readonly ref: string;
  readonly nazwa: string;
  readonly fromBusRef: string;
  readonly fromBusName: string;
  readonly toBusRef: string;
  readonly toBusName: string;
  readonly catalogRef: string | null;
  readonly crossSectionMm2: number | null;
  readonly conductorMaterial: string | null;
  readonly numberOfCores: number | null;
  readonly lengthM: number;
  readonly nParallel: number;
  readonly layingConditions: Record<string, unknown> | string | null;
  readonly ratedAmpacityA: number | null;
  readonly status: 'closed' | 'open';
}

function korzenieBus(snapshot: EnergyNetworkModel, station: Substation): string[] {
  if (station.station_type === 'rozdzielnica_nn') {
    return station.bus_refs.slice(0, 1);
  }
  return kolekcja(station.transformer_refs)
    .map((ref) => snapshot.transformers.find((t) => t.ref_id === ref || t.id === ref)?.lv_bus_ref)
    .filter((ref): ref is string => Boolean(ref) && jestNn(snapshot, ref!));
}

function nazwaSzyny(snapshot: EnergyNetworkModel, busRef: string): string {
  return snapshot.buses.find((b) => b.ref_id === busRef || b.id === busRef)?.name ?? busRef;
}

/** Mapowanie czyste (bez React) — testowalne fixture'ami. */
export function listujOdcinkiKablowNn(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null,
): OdcinekNnWiersz[] {
  if (!snapshot || !stationRef) return [];
  const station = znajdzStacje(snapshot, stationRef);
  if (!station) return [];

  const start = korzenieBus(snapshot, station);
  if (start.length === 0) return [];

  const odwiedzoneBusy = new Set<string>(start);
  const odwiedzoneGalezie = new Set<string>();
  const kolejka = [...start];
  const wiersze: OdcinekNnWiersz[] = [];

  while (kolejka.length > 0) {
    const busRef = kolejka.shift()!;
    const sasiednie = galezieSasiednie(snapshot.branches, busRef, null).filter((b) => !odwiedzoneGalezie.has(b.ref_id));
    for (const branch of sasiednie) {
      odwiedzoneGalezie.add(branch.ref_id);
      const koniec = drugiKoniec(branch, busRef);
      if (branch.type === 'cable') {
        wiersze.push({
          ref: branch.ref_id,
          nazwa: branch.name,
          fromBusRef: busRef,
          fromBusName: nazwaSzyny(snapshot, busRef),
          toBusRef: koniec,
          toBusName: nazwaSzyny(snapshot, koniec),
          catalogRef: branch.catalog_ref ?? null,
          crossSectionMm2: branch.cross_section_mm2 ?? null,
          conductorMaterial: branch.conductor_material ?? null,
          numberOfCores: branch.number_of_cores ?? null,
          lengthM: branch.length_km * 1000,
          nParallel: branch.n_parallel ?? 1,
          layingConditions: (branch.meta?.cable_laying_conditions as Record<string, unknown> | string | undefined) ?? null,
          ratedAmpacityA: branch.rating?.in_a ?? null,
          status: branch.status,
        });
      }
      if (!odwiedzoneBusy.has(koniec)) {
        odwiedzoneBusy.add(koniec);
        kolejka.push(koniec);
      }
    }
  }

  return wiersze.sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
}

export function useOdcinkiKablowNn(stationRef: string | null): OdcinekNnWiersz[] {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  return useMemo(() => listujOdcinkiKablowNn(snapshot, stationRef), [snapshot, stationRef]);
}
