/**
 * ZAKRES KADRU — co rysunek obejmuje, gdy projektant prosi o kadr celu (karta K2,
 * kontrakt UIUX-PRZEMYSLOWY UI-04, W5-UI-04/14/15).
 *
 * ---------------------------------------------------------------------------
 * PO CO
 * ---------------------------------------------------------------------------
 * Kamera kanwy znała dwa cele dopasowania: „treść" (cała sieć) i „arkusz". Kadru
 * stacji, sekcji szyn, pola, magistrali czy toru nie było — zrzut „widoku stacji"
 * powstawał przybliżaniem kółkiem myszy, stąd ucięte fragmenty sąsiadów. Ten
 * moduł jest JEDYNYM miejscem, w którym cel kadru zamienia się na zbiór refów
 * rysunku; kamera dostaje gotowe prostokąty (`prostokatyZakresu`) i o refach nie
 * wie nic (`camera.ts`, akcja `'kadruj'`).
 *
 * ---------------------------------------------------------------------------
 * ŹRÓDŁA PRAWDY (zero domysłów, zero przeszukiwania topologii)
 * ---------------------------------------------------------------------------
 *  - przynależność obiektu rysunku do elementu: `kluczePrzynaleznosci`
 *    (`viewAnchor.ts`) — ta sama relacja co kotwica widoku;
 *  - przynależność elementu do stacji/sekcji/pola: POLA REKORDÓW modelu
 *    (`Bay.substation_ref`, `Bay.bus_ref`, `Bay.terminal_bus_ref`,
 *    `Bay.gpz_section_id`, `Bay.equipment_refs`, `Substation.bus_refs`,
 *    `Substation.transformer_refs`, `Substation.gpz_sections`, `bus_ref`
 *    źródeł/odbiorów) — odczyt atrybutów, nie przejście po grafie;
 *  - magistrala: rozstrzygnięcie sceny (`meta.mainTrunkStationIds`, klasa
 *    odcinka `snTrunk`), czyli to, co rysunek wyróżnia jako ciąg główny;
 *  - tor zasilania: WYŁĄCZNIE odpowiedź backendu (`GET …/enm/topologia/tor`,
 *    karta K6a) — front nie szuka dróg.
 *
 * Moduł jest CZYSTY (zero DOM, zero Reacta, zero fizyki) i deterministyczny:
 * listy refów są unikalne i posortowane.
 */
import type { BoundingBox } from '../../v2/viewport/ViewportController';
import type { Bay, Bus, EnergyNetworkModel, GPZSection, Substation } from '../../../../types/enm';
import { jestRodzajemGaleziAparatu } from '../../../../types/rodzajeGalezi';
import type { TorElementuOdpowiedz } from '../../../../ui2/adapters/topologiaZasilenia';
import { sceneObstacleRects, type SceneLod, type SceneV3 } from '../scene/buildScene';
import { sheetSizeFor } from '../sheet/outline';
import { pickStationBus, stationSnSectionBusRefs, type StationBusSide } from '../../shared/stationBusResolution';
import { pasmoNapieciowe, powyzejPasmaNn, wPasmieNn } from '../../../../ui2/model/pasmaNapieciowe';
import type { TuszEtykietKadru } from './camera';
import { planSceneLabels, type PodlogaOpisowCelu } from './labelLegibility';
import { kluczePrzynaleznosci, prostokatRefowWScenie } from './viewAnchor';

/** Cele kadru (rozstrzygnięcie §0.1 karty). */
export type CelKadru = 'siec' | 'magistrala' | 'stacja' | 'sekcja' | 'pole' | 'tor' | 'zaznaczenie';

/** Kolejność pozycji menu „Dopasuj do…". */
export const CELE_MENU_KADRU: readonly CelKadru[] = [
  'zaznaczenie',
  'siec',
  'magistrala',
  'stacja',
  'sekcja',
  'pole',
  'tor',
];

export const ETYKIETA_CELU_KADRU: Readonly<Record<CelKadru, string>> = {
  siec: 'Cała sieć',
  magistrala: 'Magistrala (ciąg główny)',
  stacja: 'Stacja',
  sekcja: 'Sekcja szyn',
  pole: 'Pole',
  tor: 'Tor zasilania',
  zaznaczenie: 'Zaznaczenie',
};

/** Poziom mini-ścieżki kontekstu („Sieć › Stacja S3 › Pole F02"). `kontekst` to
 *  refy MODELU, z których poziom da się odtworzyć ponownym kadrem. */
export interface PoziomSciezki {
  readonly cel: CelKadru;
  readonly kontekst: readonly string[];
  readonly etykieta: string;
}

export interface ZakresKadru {
  readonly cel: CelKadru;
  /** Refy RYSUNKU objęte kadrem (unikalne, posortowane). Pusta lista dla celu
   *  `siec` — całą sieć kadruje istniejący refit „treść". */
  readonly refy: readonly string[];
  /** Najniższy poziom szczegółu kadru (stacja, sekcja, pole: wnętrze ⇒ 1). */
  readonly minLod: SceneLod;
  /** Obiekty sąsiednie, których kadr ma unikać (inne stacje przy kadrze stacji),
   *  posortowane po `ref`. */
  readonly przeszkody: readonly PrzeszkodaKadru[];
  /** Ścieżka kontekstu od sieci do celu. */
  readonly sciezka: readonly PoziomSciezki[];
}

/**
 * Przeszkoda kadru: sąsiednia stacja z PEŁNYM zbiorem refów rysunku — tym samym
 * `refyStacji`, którym ta stacja byłaby kadrowana jako cel (predykaty parami:
 * zasięg stacji jako celu i jako przeszkody pochodzi z jednego źródła). Pomiar
 * e2e K2 (okno 1440×900, kadr stacji przelotowej): przeszkoda liczona z samego
 * refu stacji gubiła źródło zasilania GPZ (`…/source/main`, osobny rekord
 * modelu) i jego napis nazwy wchodził 6 px w kadr.
 */
export interface PrzeszkodaKadru {
  readonly ref: string;
  readonly refy: readonly string[];
}

export type WynikZakresu =
  | { readonly dostepny: true; readonly zakres: ZakresKadru }
  | { readonly dostepny: false; readonly przyczyna: string };

// ---------------------------------------------------------------------------
// Indeks modelu (jedno przejście kolekcji, pamiętany per migawka)
// ---------------------------------------------------------------------------

interface SekcjaGpz {
  readonly stacja: Substation;
  readonly sekcja: GPZSection;
}

interface IndeksModelu {
  readonly stacje: ReadonlyMap<string, Substation>;
  readonly pola: ReadonlyMap<string, Bay>;
  readonly szyny: ReadonlyMap<string, Bus>;
  readonly polaStacji: ReadonlyMap<string, readonly Bay[]>;
  /** Szyna → stacja (z `bus_refs` stacji oraz szyn i zacisków jej pól). */
  readonly stacjaSzyny: ReadonlyMap<string, string>;
  readonly sekcjeGpz: ReadonlyMap<string, SekcjaGpz>;
  /** Szyna sekcji GPZ → sekcja. */
  readonly sekcjaSzynyGpz: ReadonlyMap<string, SekcjaGpz>;
  /** Urządzenie pola (`equipment_refs`) → pole. */
  readonly poleUrzadzenia: ReadonlyMap<string, string>;
  /** Zacisk pola (`terminal_bus_ref`) → pole. */
  readonly poleZacisku: ReadonlyMap<string, string>;
  readonly stacjaTransformatora: ReadonlyMap<string, string>;
  /** Transformator → pola, w których jest rysowany (symbol TR stacji nosi ref POLA). */
  readonly polaTransformatora: ReadonlyMap<string, readonly string[]>;
  /** Elementy przyłączone do szyny (źródła, wytwórcy, odbiory, kondensatory). */
  readonly przylaczoneDoSzyny: ReadonlyMap<string, readonly string[]>;
  /** Element przyłączony (źródło/wytwórca/odbiór/kondensator) → jego szyna. */
  readonly szynaPrzylaczonego: ReadonlyMap<string, string>;
  /** Źródło → stacja wprost z rekordu (`Source.substation_ref`). */
  readonly stacjaZrodla: ReadonlyMap<string, string>;
  /** Łączniki (rekordy `branches` typu łącznikowego) obu końców w tej samej stacji. */
  readonly lacznikiStacji: ReadonlyMap<string, readonly string[]>;
  readonly stacjaLacznika: ReadonlyMap<string, string>;
  readonly nazwy: ReadonlyMap<string, string>;
}

const INDEKSY_MODELU = new WeakMap<EnergyNetworkModel, IndeksModelu>();

function dopisz<K, V>(mapa: Map<K, V[]>, klucz: K, wartosc: V): void {
  const lista = mapa.get(klucz);
  if (lista) lista.push(wartosc);
  else mapa.set(klucz, [wartosc]);
}

function indeksModelu(snapshot: EnergyNetworkModel): IndeksModelu {
  const zapamietany = INDEKSY_MODELU.get(snapshot);
  if (zapamietany) return zapamietany;

  const nazwy = new Map<string, string>();
  const stacje = new Map<string, Substation>();
  for (const st of snapshot.substations ?? []) {
    stacje.set(st.ref_id, st);
    nazwy.set(st.ref_id, st.name);
  }
  const szyny = new Map<string, Bus>();
  for (const b of snapshot.buses ?? []) {
    szyny.set(b.ref_id, b);
    nazwy.set(b.ref_id, b.name);
  }
  const pola = new Map<string, Bay>();
  const polaStacji = new Map<string, Bay[]>();
  const stacjaSzyny = new Map<string, string>();
  const poleUrzadzenia = new Map<string, string>();
  const poleZacisku = new Map<string, string>();
  for (const st of stacje.values()) {
    for (const bus of st.bus_refs ?? []) stacjaSzyny.set(bus, st.ref_id);
  }
  for (const bay of snapshot.bays ?? []) {
    pola.set(bay.ref_id, bay);
    nazwy.set(bay.ref_id, bay.name);
    for (const dev of bay.equipment_refs ?? []) poleUrzadzenia.set(dev, bay.ref_id);
    if (bay.terminal_bus_ref) poleZacisku.set(bay.terminal_bus_ref, bay.ref_id);
    const st = bay.substation_ref;
    if (!st) continue;
    dopisz(polaStacji, st, bay);
    if (!stacjaSzyny.has(bay.bus_ref)) stacjaSzyny.set(bay.bus_ref, st);
    if (bay.terminal_bus_ref && !stacjaSzyny.has(bay.terminal_bus_ref)) stacjaSzyny.set(bay.terminal_bus_ref, st);
  }
  const sekcjeGpz = new Map<string, SekcjaGpz>();
  const sekcjaSzynyGpz = new Map<string, SekcjaGpz>();
  for (const st of stacje.values()) {
    for (const sekcja of [...(st.gpz_sections ?? []), ...(st.gpz_hv_sections ?? [])]) {
      const wpis = { stacja: st, sekcja };
      sekcjeGpz.set(sekcja.section_id, wpis);
      sekcjaSzynyGpz.set(sekcja.bus_ref, wpis);
      nazwy.set(sekcja.section_id, sekcja.name ?? sekcja.section_id);
    }
  }
  const stacjaTransformatora = new Map<string, string>();
  for (const st of stacje.values()) {
    for (const tr of st.transformer_refs ?? []) stacjaTransformatora.set(tr, st.ref_id);
  }
  const polaTransformatora = new Map<string, string[]>();
  for (const tr of snapshot.transformers ?? []) {
    nazwy.set(tr.ref_id, tr.name);
    // Pole transformatora: zacisk pola = szyna strony GN transformatora (rekord
    // `terminal_bus_ref`, POLA-W-TORZE). Brak dopasowania zacisku — pola o roli
    // TR stacji transformatora (stacja z jednym TR: dokładnie jego pole).
    const poZacisku = [tr.hv_bus_ref, tr.lv_bus_ref]
      .map((bus) => poleZacisku.get(bus))
      .filter((ref): ref is string => !!ref);
    if (poZacisku.length > 0) {
      for (const ref of poZacisku) dopisz(polaTransformatora, tr.ref_id, ref);
      continue;
    }
    const st = stacjaTransformatora.get(tr.ref_id);
    for (const bay of (st ? polaStacji.get(st) : undefined) ?? []) {
      if (bay.bay_role === 'TR') dopisz(polaTransformatora, tr.ref_id, bay.ref_id);
    }
  }
  const przylaczoneDoSzyny = new Map<string, string[]>();
  const szynaPrzylaczonego = new Map<string, string>();
  const stacjaZrodla = new Map<string, string>();
  const przylaczone: readonly { readonly ref_id: string; readonly name: string; readonly bus_ref: string }[] = [
    ...(snapshot.sources ?? []),
    ...(snapshot.generators ?? []),
    ...(snapshot.loads ?? []),
    ...(snapshot.shunt_capacitors ?? []),
  ];
  for (const el of przylaczone) {
    nazwy.set(el.ref_id, el.name);
    dopisz(przylaczoneDoSzyny, el.bus_ref, el.ref_id);
    szynaPrzylaczonego.set(el.ref_id, el.bus_ref);
  }
  for (const zr of snapshot.sources ?? []) {
    if (zr.substation_ref) stacjaZrodla.set(zr.ref_id, zr.substation_ref);
  }
  const lacznikiStacji = new Map<string, string[]>();
  const stacjaLacznika = new Map<string, string>();
  for (const br of snapshot.branches ?? []) {
    nazwy.set(br.ref_id, br.name);
    if (!jestRodzajemGaleziAparatu(br.type)) continue;
    const z = stacjaSzyny.get(br.from_bus_ref);
    const doS = stacjaSzyny.get(br.to_bus_ref);
    if (z && z === doS) {
      dopisz(lacznikiStacji, z, br.ref_id);
      stacjaLacznika.set(br.ref_id, z);
    }
  }

  const indeks: IndeksModelu = {
    stacje,
    pola,
    szyny,
    polaStacji,
    stacjaSzyny,
    sekcjeGpz,
    sekcjaSzynyGpz,
    poleUrzadzenia,
    poleZacisku,
    stacjaTransformatora,
    polaTransformatora,
    przylaczoneDoSzyny,
    szynaPrzylaczonego,
    stacjaZrodla,
    lacznikiStacji,
    stacjaLacznika,
    nazwy,
  };
  INDEKSY_MODELU.set(snapshot, indeks);
  return indeks;
}

/** Ref modelu kompozytu rysunku (`stn/A/station#sn-bus` → `stn/A/station`). Ref
 *  bez znaku `#` zwraca bez zmian. */
function refBazowy(ref: string): string {
  return kluczePrzynaleznosci(ref)[0] ?? ref;
}

function unikalnePosortowane(refy: Iterable<string>): string[] {
  return [...new Set(refy)].sort();
}

function nazwa(ix: IndeksModelu, ref: string): string {
  return ix.nazwy.get(ref) ?? ref;
}

// ---------------------------------------------------------------------------
// Przynależność elementu modelu: stacja, pole, sekcja
// ---------------------------------------------------------------------------

/** Stacja, do której element należy (`null`: element poza stacją, np. kabel). */
function stacjaElementu(ix: IndeksModelu, ref: string): string | null {
  const baza = refBazowy(ref);
  if (ix.stacje.has(baza)) return baza;
  const pole = ix.pola.get(baza);
  if (pole) return pole.substation_ref ?? null;
  const zUrzadzenia = ix.poleUrzadzenia.get(baza);
  if (zUrzadzenia) return ix.pola.get(zUrzadzenia)?.substation_ref ?? null;
  const sekcja = ix.sekcjeGpz.get(baza);
  if (sekcja) return sekcja.stacja.ref_id;
  const zTr = ix.stacjaTransformatora.get(baza);
  if (zTr) return zTr;
  const zLacznika = ix.stacjaLacznika.get(baza);
  if (zLacznika) return zLacznika;
  const zeZrodla = ix.stacjaZrodla.get(baza);
  if (zeZrodla) return zeZrodla;
  const szyna = ix.szyny.has(baza) ? baza : ix.szynaPrzylaczonego.get(baza);
  if (szyna) return ix.stacjaSzyny.get(szyna) ?? null;
  return null;
}

/** Pola, do których element należy (pole, aparat pola, transformator, zacisk). */
function polaElementu(ix: IndeksModelu, ref: string): string[] {
  const baza = refBazowy(ref);
  if (ix.pola.has(baza)) return [baza];
  const zUrzadzenia = ix.poleUrzadzenia.get(baza);
  if (zUrzadzenia) return [zUrzadzenia];
  const zTr = ix.polaTransformatora.get(baza);
  if (zTr && zTr.length > 0) return [...zTr];
  const zZacisku = ix.poleZacisku.get(baza);
  if (zZacisku) return [zZacisku];
  const szynaPrzylaczenia = ix.szynaPrzylaczonego.get(baza);
  if (szynaPrzylaczenia) {
    const pole = ix.poleZacisku.get(szynaPrzylaczenia);
    if (pole) return [pole];
  }
  return [];
}

type Sekcja =
  | { readonly rodzaj: 'gpz'; readonly wpis: SekcjaGpz }
  | { readonly rodzaj: 'szyna'; readonly stacja: Substation; readonly szyna: string };

function szynySnStacji(ix: IndeksModelu, st: Substation): string[] {
  return (st.bus_refs ?? []).filter((b) => powyzejPasmaNn(ix.szyny.get(b)?.voltage_kv));
}

/** Strona stacji szyny — para predykatów z jednego lustra granic pasm (szyna bez
 *  napięcia znamionowego nie należy do żadnej strony: brak danej ≠ nN). */
function stronaSzyny(ix: IndeksModelu, szyna: string): StationBusSide | null {
  const napiecie = ix.szyny.get(szyna)?.voltage_kv;
  if (powyzejPasmaNn(napiecie)) return 'sn';
  if (wPasmieNn(napiecie)) return 'nn';
  return null;
}

/**
 * Ref odcinka szyny stacji na rysunku (`compose/station.ts`), gdy rysuje DOKŁADNIE tę
 * szynę: strona SN — odcinek sekcji `szyna#sn-bus` (każda sekcja SN stacji ma własny);
 * strona nN — jeden kompozyt `stacja#lv-bus`, którego szynę rozstrzyga reguła
 * `pickStationBus` (`sld/shared/stationBusResolution.ts`): najwyższe napięcie strony,
 * remis ⇒ brak jednoznacznej szyny ⇒ kompozyt nie jest dopisywany.
 */
function kompozytSzyny(ix: IndeksModelu, stacja: Substation, szyna: string): string | null {
  const strona = stronaSzyny(ix, szyna);
  if (strona === null) return null;
  // GEOMETRIA-STACJI (Z-03): strona SN rysuje odcinek NA SEKCJĘ (`${busRef}#sn-bus`,
  // reguła `stationSnSectionBusRefs` — ta sama co rysunek), więc kadr sekcji stacji
  // wielosekcyjnej wskazuje WŁASNY odcinek zamiast odmowy przy remisie napięć.
  if (strona === 'sn') {
    return stationSnSectionBusRefs(stacja, ix.szyny).includes(szyna) ? `${szyna}#sn-bus` : null;
  }
  if (pickStationBus(stacja, ix.szyny, strona).ref !== szyna) return null;
  return `${stacja.ref_id}#lv-bus`;
}

/** Sekcja szyn elementu: sekcja GPZ albo szyna stacji, na której stoi pole. */
function sekcjaElementu(ix: IndeksModelu, ref: string): Sekcja | null {
  const baza = refBazowy(ref);
  const sekcja = ix.sekcjeGpz.get(baza);
  if (sekcja) return { rodzaj: 'gpz', wpis: sekcja };
  const zSzyny = (bus: string): Sekcja | null => {
    const gpz = ix.sekcjaSzynyGpz.get(bus);
    if (gpz) return { rodzaj: 'gpz', wpis: gpz };
    const st = ix.stacje.get(ix.stacjaSzyny.get(bus) ?? '');
    return st ? { rodzaj: 'szyna', stacja: st, szyna: bus } : null;
  };
  const pole = ix.pola.get(baza) ?? ix.pola.get(ix.poleUrzadzenia.get(baza) ?? '');
  if (pole) {
    if (pole.gpz_section_id && ix.sekcjeGpz.has(pole.gpz_section_id)) {
      return { rodzaj: 'gpz', wpis: ix.sekcjeGpz.get(pole.gpz_section_id)! };
    }
    return zSzyny(pole.bus_ref);
  }
  if (ix.szyny.has(baza)) return zSzyny(baza);
  const szynaPrzylaczenia = ix.szynaPrzylaczonego.get(baza);
  if (szynaPrzylaczenia) return zSzyny(szynaPrzylaczenia);
  const st = ix.stacje.get(baza);
  if (st) {
    // Stacja jako całość wskazuje sekcję TYLKO wtedy, gdy ma dokładnie jedną.
    const gpz = st.gpz_sections ?? [];
    if (gpz.length === 1) return { rodzaj: 'gpz', wpis: { stacja: st, sekcja: gpz[0] } };
    if (gpz.length === 0) {
      const sn = szynySnStacji(ix, st);
      if (sn.length === 1) return { rodzaj: 'szyna', stacja: st, szyna: sn[0] };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Refy rysunku
// ---------------------------------------------------------------------------

function refyPola(ix: IndeksModelu, poleRef: string): string[] {
  const pole = ix.pola.get(poleRef);
  return pole ? [pole.ref_id, ...(pole.equipment_refs ?? [])] : [poleRef];
}

function refyStacji(ix: IndeksModelu, stacjaRef: string): string[] {
  const st = ix.stacje.get(stacjaRef);
  if (!st) return [stacjaRef];
  const pola = ix.polaStacji.get(stacjaRef) ?? [];
  const szyny = new Set<string>(st.bus_refs ?? []);
  for (const pole of pola) {
    szyny.add(pole.bus_ref);
    if (pole.terminal_bus_ref) szyny.add(pole.terminal_bus_ref);
  }
  const refy: string[] = [stacjaRef, ...szyny];
  for (const pole of pola) refy.push(...refyPola(ix, pole.ref_id));
  for (const tr of st.transformer_refs ?? []) refy.push(tr, ...(ix.polaTransformatora.get(tr) ?? []));
  for (const sekcja of [...(st.gpz_sections ?? []), ...(st.gpz_hv_sections ?? [])]) refy.push(sekcja.section_id);
  for (const szyna of szyny) refy.push(...(ix.przylaczoneDoSzyny.get(szyna) ?? []));
  for (const [zrodlo, stacja] of ix.stacjaZrodla) if (stacja === stacjaRef) refy.push(zrodlo);
  refy.push(...(ix.lacznikiStacji.get(stacjaRef) ?? []));
  return refy;
}

function refySekcji(ix: IndeksModelu, sekcja: Sekcja): string[] {
  if (sekcja.rodzaj === 'gpz') {
    const { stacja, sekcja: s } = sekcja.wpis;
    const refy = [s.section_id, s.bus_ref];
    for (const pole of ix.polaStacji.get(stacja.ref_id) ?? []) {
      if (pole.gpz_section_id === s.section_id || pole.bus_ref === s.bus_ref) refy.push(...refyPola(ix, pole.ref_id));
    }
    refy.push(...(ix.przylaczoneDoSzyny.get(s.bus_ref) ?? []));
    if (s.incoming_source_ref) refy.push(s.incoming_source_ref);
    return refy;
  }
  const { stacja, szyna } = sekcja;
  const refy = [szyna];
  // Kompozycja stacji rysuje szynę SN jako odcinek sekcji `szyna#sn-bus`
  // (`compose/station.ts`), a szynę nN jako `stacja#lv-bus` — należy do sekcji,
  // gdy rysuje tę szynę (`kompozytSzyny`, jedna reguła szyn stacji).
  const kompozyt = kompozytSzyny(ix, stacja, szyna);
  if (kompozyt) refy.push(kompozyt);
  for (const pole of ix.polaStacji.get(stacja.ref_id) ?? []) {
    if (pole.bus_ref === szyna) refy.push(...refyPola(ix, pole.ref_id));
  }
  refy.push(...(ix.przylaczoneDoSzyny.get(szyna) ?? []));
  return refy;
}

/** Refy rysunku POJEDYNCZEGO elementu modelu (bez rozszerzania na stację). */
function refyElementu(ix: IndeksModelu, ref: string): string[] {
  if (ref.includes('#')) return [ref];
  if (ix.stacje.has(ref)) return refyStacji(ix, ref);
  if (ix.pola.has(ref)) return refyPola(ix, ref);
  const sekcjaGpz = ix.sekcjeGpz.get(ref);
  if (sekcjaGpz) return refySekcji(ix, { rodzaj: 'gpz', wpis: sekcjaGpz });
  if (ix.szyny.has(ref)) {
    const sekcja = sekcjaElementu(ix, ref);
    const refy = [ref];
    if (sekcja?.rodzaj === 'gpz') refy.push(sekcja.wpis.sekcja.section_id);
    if (sekcja?.rodzaj === 'szyna') {
      const kompozyt = kompozytSzyny(ix, sekcja.stacja, ref);
      if (kompozyt) refy.push(kompozyt);
    }
    return refy;
  }
  const polaTr = ix.polaTransformatora.get(ref);
  if (polaTr) return [ref, ...polaTr];
  return [ref];
}

/** Minimalny poziom szczegółu, na którym element jest czytelny jako on sam:
 *  wnętrze stacji (pole, szyna stacji, aparat, sekcja, stacja) istnieje od L1. */
function minLodElementu(ix: IndeksModelu, ref: string): SceneLod {
  const baza = refBazowy(ref);
  if (ix.stacje.has(baza) || ix.pola.has(baza) || ix.sekcjeGpz.has(baza) || ix.poleUrzadzenia.has(baza)) return 1;
  if (ix.szyny.has(baza) && ix.stacjaSzyny.has(baza)) return 1;
  if (ix.polaTransformatora.has(baza)) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Ścieżka kontekstu
// ---------------------------------------------------------------------------

const POZIOM_SIECI: PoziomSciezki = { cel: 'siec', kontekst: [], etykieta: 'Sieć' };

function etykietaSekcji(ix: IndeksModelu, sekcja: Sekcja): string {
  if (sekcja.rodzaj === 'gpz') return sekcja.wpis.sekcja.name ?? `Sekcja ${sekcja.wpis.sekcja.order + 1}`;
  // Szyna stacji: nazwa rekordu bywa nazwą stacji (szyna SN „Stacja T3"), więc
  // poziom ścieżki „Stacja T3 › Stacja T3" nic by nie mówił. Etykieta niesie
  // napięcie znamionowe z rekordu szyny, a nazwę dopisuje, gdy jest inna.
  const szyna = ix.szyny.get(sekcja.szyna);
  const napiecie = szyna?.voltage_kv;
  // Pasmo z jednego lustra granic (1 kV włącznie = nN); brak napięcia znamionowego
  // jest nazwany wprost — bez cichego zera udającego szynę nN „0 kV".
  const pasmo = pasmoNapieciowe(napiecie);
  const opis =
    pasmo !== null && napiecie != null
      ? `Szyna ${pasmo} ${String(napiecie).replace('.', ',')} kV`
      : 'Szyna bez napięcia znamionowego';
  const nazwaSzyny = szyna?.name ?? '';
  if (!nazwaSzyny || nazwaSzyny === sekcja.stacja.name) return opis;
  return nazwaSzyny.toLowerCase().startsWith('szyna') ? nazwaSzyny : `${opis} — ${nazwaSzyny}`;
}

function kluczSekcji(sekcja: Sekcja): string {
  return sekcja.rodzaj === 'gpz' ? sekcja.wpis.sekcja.section_id : sekcja.szyna;
}

/** Ścieżka kontekstu pojedynczego elementu: Sieć › Stacja › (Sekcja) › Pole/element. */
function sciezkaElementu(ix: IndeksModelu, ref: string): PoziomSciezki[] {
  const baza = refBazowy(ref);
  const sciezka: PoziomSciezki[] = [POZIOM_SIECI];
  const st = stacjaElementu(ix, baza);
  if (st) sciezka.push({ cel: 'stacja', kontekst: [st], etykieta: nazwa(ix, st) });
  if (baza === st) return sciezka;
  const pola = polaElementu(ix, baza);
  const sekcja = sekcjaElementu(ix, baza);
  if (sekcja && ix.sekcjeGpz.has(kluczSekcji(sekcja))) {
    sciezka.push({ cel: 'sekcja', kontekst: [kluczSekcji(sekcja)], etykieta: etykietaSekcji(ix, sekcja) });
    if (baza === kluczSekcji(sekcja)) return sciezka;
  }
  if (pola.length === 1) {
    sciezka.push({ cel: 'pole', kontekst: [pola[0]], etykieta: nazwa(ix, pola[0]) });
    if (pola[0] === baza) return sciezka;
  }
  if (ix.szyny.has(baza) && sekcja?.rodzaj === 'szyna') {
    sciezka.push({ cel: 'sekcja', kontekst: [baza], etykieta: etykietaSekcji(ix, sekcja) });
    return sciezka;
  }
  sciezka.push({ cel: 'zaznaczenie', kontekst: [baza], etykieta: nazwa(ix, baza) });
  return sciezka;
}

// ---------------------------------------------------------------------------
// Zakres celu
// ---------------------------------------------------------------------------

const BRAK_ZAZNACZENIA = 'Brak zaznaczenia — zaznacz element na schemacie, w drzewie albo w wynikach.';

function zakres(
  cel: CelKadru,
  refy: Iterable<string>,
  minLod: SceneLod,
  sciezka: readonly PoziomSciezki[],
  przeszkody: readonly PrzeszkodaKadru[] = [],
): WynikZakresu {
  return {
    dostepny: true,
    zakres: {
      cel,
      refy: unikalnePosortowane(refy),
      minLod,
      przeszkody: [...przeszkody].sort((a, b) => a.ref.localeCompare(b.ref)),
      sciezka,
    },
  };
}

/**
 * K2b §0.1 — SĄSIEDZI ELEKTRYCZNIE WYMAGANI: zamknięta lista przypadków, w których
 * element INNEJ stacji wchodzi do zakresu kadru stacji (i tylko wtedy poszerza
 * kadr). Lista jest PUSTA, i to jest rozstrzygnięcie merytoryczne, nie brak:
 * wszystko, czego projektant potrzebuje, żeby ocenić stację elektrycznie, jest
 * rekordem TEJ stacji — pola liniowe z aparatami (strona, z której przychodzi
 * i dokąd odchodzi kabel), pole transformatorowe z transformatorem, strona nN,
 * łączniki obu końców w stacji (w tym łącznik punktu normalnie otwartego
 * zabudowany w tej stacji), źródło zasilania GPZ (`refyStacji`). Odcinek kabla
 * lub linii między stacjami jest elementem SIECI (kadr magistrali, toru
 * zasilania), a stacja po drugiej stronie jest osiągalna jednym klikiem
 * („następna/poprzednia stacja" ścieżki kontekstu) — dociąganie jej do kadru
 * odtwarzałoby dokładnie wadę Z-02 (dwa różne cele, ten sam obraz). Nowy wpis
 * wymaga przypadku elektrycznego i testu w `__tests__/zakresKadru.test.ts`.
 */
export interface SasiadElektrycznieWymagany {
  /** Przypadek elektryczny (zdanie projektanta). */
  readonly przypadek: string;
  /** Refy modelu INNEJ stacji, które kadr stacji `stacjaRef` musi objąć. */
  readonly refy: (snapshot: EnergyNetworkModel, stacjaRef: string) => readonly string[];
}

export const SASIEDZI_ELEKTRYCZNIE_WYMAGANI: readonly SasiadElektrycznieWymagany[] = [];

/** K2b §0.2 (b): podłoga opisów celu kadru [px ekranu]. */
export const MIN_OPIS_CELU_KADRU_PX = 13;

/**
 * Czy obiekt rysunku o `ownerRef` należy do zakresu kadru `refy` — JEDNA relacja
 * przynależności (`kluczePrzynaleznosci`) dla prostokąta celu, tuszu etykiet,
 * podłogi opisów celu i kurtyny kanwy (predykaty parami: to, co kadr obejmuje,
 * jest dokładnie tym, czego kurtyna nie przyciemnia).
 */
export function nalezyDoZakresu(ownerRef: string | undefined | null, refy: ReadonlySet<string>): boolean {
  return kluczePrzynaleznosci(ownerRef).some((k) => refy.has(k));
}

/** Podłoga opisów celu dla planu etykiet (kanwa i tusz kamery — ten sam obiekt). */
export function podlogaOpisowCelu(refy: ReadonlySet<string>): PodlogaOpisowCelu {
  return { screenPx: MIN_OPIS_CELU_KADRU_PX, nalezy: (label) => nalezyDoZakresu(label.ownerRef, refy) };
}

/** Każda stacja modelu spoza `wlasne` jako przeszkoda kadru (pełny zbiór refów rysunku). */
function przeszkodyStacji(ix: IndeksModelu, wlasne: ReadonlySet<string>): PrzeszkodaKadru[] {
  return [...ix.stacje.keys()]
    .filter((st) => !wlasne.has(st))
    .map((st) => ({ ref: st, refy: unikalnePosortowane(refyStacji(ix, st)) }));
}

/**
 * Zakres celu `cel` dla kontekstu `kontekst` (refy modelu — zwykle zaznaczenie).
 * Cel niedostępny zwraca przyczynę w języku projektanta (kontrakt §9: „każde
 * polecenie działa albo jest niedostępne z podaną przyczyną"). Cel `tor` wymaga
 * odpowiedzi backendu — patrz `zakresToru`.
 */
export function zakresCelu(
  cel: Exclude<CelKadru, 'tor'>,
  snapshot: EnergyNetworkModel,
  kontekst: readonly string[],
  scenaL2: SceneV3,
): WynikZakresu {
  const ix = indeksModelu(snapshot);
  if (cel === 'siec') return zakres('siec', [], 0, [POZIOM_SIECI]);

  if (cel === 'magistrala') {
    const stacje = scenaL2.meta.mainTrunkStationIds;
    if (stacje.length === 0) {
      return { dostepny: false, przyczyna: 'Sieć nie ma ciągu głównego magistrali — nie ma czego kadrować.' };
    }
    const refy: string[] = [];
    for (const st of stacje) refy.push(...refyStacji(ix, st));
    if (scenaL2.meta.gpzId) refy.push(...refyStacji(ix, scenaL2.meta.gpzId));
    // Odcinki magistrali: klasa `snTrunk`, którą scena nadaje WYŁĄCZNIE trasie
    // ciągu głównego (wyrocznia `trunkThicknessGaps`).
    for (const seg of scenaL2.segments) {
      if (seg.meta?.kind === 'snTrunk' && seg.meta.ownerRef) refy.push(refBazowy(seg.meta.ownerRef));
    }
    return zakres('magistrala', refy, 0, [POZIOM_SIECI, { cel: 'magistrala', kontekst: [], etykieta: 'Magistrala' }]);
  }

  if (kontekst.length === 0) {
    return {
      dostepny: false,
      przyczyna:
        cel === 'zaznaczenie'
          ? BRAK_ZAZNACZENIA
          : cel === 'stacja'
            ? 'Zaznacz stację albo jej element, aby wykadrować stację.'
            : cel === 'sekcja'
              ? 'Zaznacz pole albo szynę, aby wykadrować sekcję szyn.'
              : 'Zaznacz pole albo jego aparat, aby wykadrować pole.',
    };
  }

  if (cel === 'stacja') {
    const stacje = unikalnePosortowane(kontekst.map((r) => stacjaElementu(ix, r)).filter((r): r is string => !!r));
    if (stacje.length === 0) return { dostepny: false, przyczyna: 'Zaznaczenie nie należy do żadnej stacji.' };
    const refy = stacje.flatMap((st) => [
      ...refyStacji(ix, st),
      ...SASIEDZI_ELEKTRYCZNIE_WYMAGANI.flatMap((s) => s.refy(snapshot, st).flatMap((r) => refyElementu(ix, r))),
    ]);
    const przeszkody = przeszkodyStacji(ix, new Set(stacje));
    const sciezka: PoziomSciezki[] =
      stacje.length === 1
        ? [POZIOM_SIECI, { cel: 'stacja', kontekst: stacje, etykieta: nazwa(ix, stacje[0]) }]
        : [POZIOM_SIECI, { cel: 'stacja', kontekst: stacje, etykieta: `Stacje (${stacje.length})` }];
    return zakres('stacja', refy, 1, sciezka, przeszkody);
  }

  if (cel === 'sekcja') {
    const sekcje = new Map<string, Sekcja>();
    for (const r of kontekst) {
      const s = sekcjaElementu(ix, r);
      if (s) sekcje.set(kluczSekcji(s), s);
    }
    if (sekcje.size === 0) {
      return {
        dostepny: false,
        przyczyna: 'Zaznaczenie nie wskazuje sekcji szyn — zaznacz pole albo szynę sekcji (stacja z kilkoma sekcjami nie wskazuje jednej).',
      };
    }
    const lista = [...sekcje.entries()].sort(([a], [b]) => a.localeCompare(b));
    const refy = lista.flatMap(([, s]) => refySekcji(ix, s));
    const [, pierwsza] = lista[0];
    const stacjaRef = pierwsza.rodzaj === 'gpz' ? pierwsza.wpis.stacja.ref_id : pierwsza.stacja.ref_id;
    const sciezka: PoziomSciezki[] = [
      POZIOM_SIECI,
      { cel: 'stacja', kontekst: [stacjaRef], etykieta: nazwa(ix, stacjaRef) },
      {
        cel: 'sekcja',
        kontekst: lista.map(([k]) => k),
        etykieta: lista.length === 1 ? etykietaSekcji(ix, pierwsza) : `Sekcje (${lista.length})`,
      },
    ];
    return zakres('sekcja', refy, 1, sciezka);
  }

  if (cel === 'pole') {
    const pola = unikalnePosortowane(kontekst.flatMap((r) => polaElementu(ix, r)));
    if (pola.length === 0) return { dostepny: false, przyczyna: 'Zaznaczenie nie jest polem ani elementem pola.' };
    const refy = pola.flatMap((p) => refyPola(ix, p));
    const stacjaRef = stacjaElementu(ix, pola[0]);
    const sciezka: PoziomSciezki[] = [POZIOM_SIECI];
    if (stacjaRef) sciezka.push({ cel: 'stacja', kontekst: [stacjaRef], etykieta: nazwa(ix, stacjaRef) });
    sciezka.push({
      cel: 'pole',
      kontekst: pola,
      etykieta: pola.length === 1 ? nazwa(ix, pola[0]) : `Pola (${pola.length})`,
    });
    return zakres('pole', refy, 1, sciezka);
  }

  // cel === 'zaznaczenie': każdy element swoim zakresem rysunku (stacja ⇒ cała
  // stacja, pole ⇒ pole z aparatami, inne ⇒ ich własny rysunek).
  const posortowane = unikalnePosortowane(kontekst);
  const refy = posortowane.flatMap((r) => refyElementu(ix, r));
  const minLod = posortowane.reduce<SceneLod>((acc, r) => (minLodElementu(ix, r) > acc ? minLodElementu(ix, r) : acc), 0);
  const sciezka =
    posortowane.length === 1
      ? sciezkaElementu(ix, posortowane[0])
      : [POZIOM_SIECI, { cel: 'zaznaczenie' as const, kontekst: posortowane, etykieta: `Zaznaczenie (${posortowane.length})` }];
  // Sąsiedzi poza kadrem (W5-UI-15) — te same przeszkody co przy celu „Stacja":
  // każda stacja, do której NIE należy żaden z zaznaczonych elementów. Wskazanie
  // stacji z wyników albo z gotowości kadruje ją więc tak samo jak dwuklik.
  const stacjeZaznaczenia = new Set(
    posortowane.map((r) => stacjaElementu(ix, r)).filter((r): r is string => !!r),
  );
  const przeszkody = przeszkodyStacji(ix, stacjeZaznaczenia);
  return zakres('zaznaczenie', refy, minLod, sciezka, przeszkody);
}

/**
 * Zakres toru zasilania z odpowiedzi backendu (karta K6a). Kadr obejmuje SUMĘ
 * dróg (każda droga od źródła sieciowego do elementu) wraz z samym elementem.
 * Brak dróg = cel niedostępny z przyczyną z odpowiedzi — bez pozornej ciągłości.
 */
export function zakresToru(snapshot: EnergyNetworkModel, tor: TorElementuOdpowiedz): WynikZakresu {
  const ix = indeksModelu(snapshot);
  if (tor.drogi.length === 0) {
    const przyczyna = tor.przyczyny.map((p) => p.opis).join(' ');
    return {
      dostepny: false,
      przyczyna: przyczyna || 'Element nie ma drogi zasilania od źródła sieciowego w topologii łączeniowej.',
    };
  }
  const refy: string[] = [...refyElementu(ix, tor.element.ref_id)];
  for (const droga of tor.drogi) {
    for (const el of droga.elementy) {
      refy.push(...refyElementu(ix, el.ref_id));
      if (el.pole_ref) refy.push(...refyPola(ix, el.pole_ref));
    }
  }
  return zakres('tor', refy, 0, [
    POZIOM_SIECI,
    { cel: 'tor', kontekst: [tor.element.ref_id], etykieta: `Tor zasilania: ${tor.element.nazwa || tor.element.ref_id}` },
  ]);
}

// ---------------------------------------------------------------------------
// Prostokąty na rysunku
// ---------------------------------------------------------------------------

export interface ProstokatyZakresu {
  /** Prostokąt celu na każdym poziomie (układ podany przez `przelicz`); `null` =
   *  na tym poziomie nic z zakresu nie jest narysowane. */
  readonly celByLod: Readonly<Record<SceneLod, BoundingBox | null>>;
  readonly przeszkodyByLod: Readonly<Record<SceneLod, readonly BoundingBox[]>>;
  /**
   * Tusz ETYKIET celu i każdej przeszkody przy skali kamery `scale` — z TEGO
   * SAMEGO planu etykiet, który rysuje kanwa (`planSceneLabels` na całej scenie
   * z przeszkodami `sceneObstacleRects` i obrysem arkusza `sheetSizeFor`).
   * Etykieta tożsamości poniżej progu czytelności rysuje się pismem
   * POWIĘKSZONYM, więc przy oddaleniu wystaje poza swój slot w scenie
   * (pomiar e2e K2, okno 1440×900: napis „FT1 · transformatorowe" stacji
   * przelotowej wystawał 73 px poza kadr policzony z samych slotów). Kolejność
   * `przeszkody` = kolejność `przeszkodyByLod[lod]` (jedno filtrowanie, niżej).
   */
  readonly tuszEtykiet: (lod: SceneLod, scale: number) => TuszEtykietKadru;
}

/**
 * Prostokąty zakresu na scenach trzech poziomów — czytane z indeksu
 * przynależności sceny (jedno przejście, pamiętane per scena). `przelicz` mostkuje
 * układ sceny na świat kamery (`sceneBoxToCameraWorld`).
 */
export function prostokatyZakresu(
  sceneByLod: Readonly<Record<SceneLod, SceneV3>>,
  zakresKadru: ZakresKadru,
  przelicz: (bbox: BoundingBox) => BoundingBox = (b) => b,
): ProstokatyZakresu {
  const naPoziomie = (lod: SceneLod): BoundingBox | null => {
    const box = prostokatRefowWScenie(sceneByLod[lod], zakresKadru.refy);
    return box ? przelicz(box) : null;
  };
  // Predykaty parami: przeszkody z prostokątem na poziomie — JEDNA lista, z której
  // powstają i prostokąty przeszkód, i przypisanie tuszu etykiet.
  const narysowanePrzeszkody = (lod: SceneLod): readonly { readonly przeszkoda: PrzeszkodaKadru; readonly box: BoundingBox }[] =>
    zakresKadru.przeszkody.flatMap((przeszkoda) => {
      const box = prostokatRefowWScenie(sceneByLod[lod], przeszkoda.refy);
      return box ? [{ przeszkoda, box }] : [];
    });
  const przeszkody = (lod: SceneLod): readonly BoundingBox[] => narysowanePrzeszkody(lod).map(({ box }) => przelicz(box));
  const refyCelu = new Set(zakresKadru.refy);
  // Podłoga opisów celu tylko dla kadru z kurtyną (cel ≠ sieć) — dokładnie ten
  // warunek stosuje kanwa (`SldCanvasV3`, `refyKadru` puste ⇒ brak podłogi).
  const podloga = refyCelu.size > 0 ? podlogaOpisowCelu(refyCelu) : undefined;
  const pamiec = new Map<string, TuszEtykietKadru>();
  const tuszEtykiet = (lod: SceneLod, scale: number): TuszEtykietKadru => {
    const klucz = `${lod}|${scale}`;
    const zapamietany = pamiec.get(klucz);
    if (zapamietany) return zapamietany;
    const scena = sceneByLod[lod];
    const lista = narysowanePrzeszkody(lod);
    const indeksPrzeszkody = new Map<string, number>();
    lista.forEach(({ przeszkoda }, i) => {
      for (const ref of przeszkoda.refy) indeksPrzeszkody.set(ref, i);
    });
    let cel: BoundingBox | null = null;
    const tuszPrzeszkod: (BoundingBox | null)[] = lista.map(() => null);
    const dolacz = (box: BoundingBox | null, r: { x: number; y: number; width: number; height: number }): BoundingBox =>
      box
        ? {
            minX: Math.min(box.minX, r.x),
            minY: Math.min(box.minY, r.y),
            maxX: Math.max(box.maxX, r.x + r.width),
            maxY: Math.max(box.maxY, r.y + r.height),
          }
        : { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.height };
    const plan = planSceneLabels(scena.labels, sceneObstacleRects(scena), scale, sheetSizeFor(scena), podloga);
    for (const narysowana of plan.drawn) {
      const klucze = kluczePrzynaleznosci(narysowana.label.ownerRef);
      if (nalezyDoZakresu(narysowana.label.ownerRef, refyCelu)) cel = dolacz(cel, narysowana.rect);
      for (const k of klucze) {
        const i = indeksPrzeszkody.get(k);
        if (i !== undefined) tuszPrzeszkod[i] = dolacz(tuszPrzeszkod[i], narysowana.rect);
      }
    }
    const wynik: TuszEtykietKadru = {
      cel: cel ? przelicz(cel) : null,
      przeszkody: tuszPrzeszkod.map((b) => (b ? przelicz(b) : null)),
    };
    pamiec.set(klucz, wynik);
    return wynik;
  };
  return {
    celByLod: { 0: naPoziomie(0), 1: naPoziomie(1), 2: naPoziomie(2) },
    przeszkodyByLod: { 0: przeszkody(0), 1: przeszkody(1), 2: przeszkody(2) },
    tuszEtykiet,
  };
}

/** Czy zakres jest narysowany na którymkolwiek dopuszczalnym poziomie (≥ `minLod`). */
export function zakresNarysowany(
  sceneByLod: Readonly<Record<SceneLod, SceneV3>>,
  zakresKadru: ZakresKadru,
): boolean {
  if (zakresKadru.cel === 'siec') return true;
  const { celByLod } = prostokatyZakresu(sceneByLod, zakresKadru);
  return ([0, 1, 2] as const).some((lod) => lod >= zakresKadru.minLod && celByLod[lod] !== null);
}
