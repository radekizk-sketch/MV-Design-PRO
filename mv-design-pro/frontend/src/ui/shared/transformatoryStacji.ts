/**
 * KARTA SZYNY-STACJI-LUSTRO (commit 2) — JEDNA reguła „transformatory stacji” we froncie.
 *
 * Do tej karty odpowiedź na pytanie „które transformatory należą do stacji / do której stacji
 * należy transformator” istniała w trzech kopiach z różnymi filtrami transformatora blokowego
 * źródła DER (rysunek: słowa w nazwie bez „pv/der”; kreator źródła: słowa w nazwie z „pv/der”;
 * szyna nN kreatora: bez filtra) oraz w kilkunastu miejscach czytających samo
 * `Substation.transformer_refs` (bez dopasowania po szynach). Tu jest jedna reguła, jeden
 * filtr i jej odwrotność; lustro backendu `enm/pole_transformatorowe.py::transformatory_stacji`
 * (parytet przypięty plikiem `szynyStacjiParytet.json`, klucz `transformatory`).
 */
import type { EnergyNetworkModel, Substation, Transformer } from '../../types/enm';
import { grupaTransformatoraUziemiajacego } from '../../types/uziemienie';
import { wPasmieSn } from '../../ui2/model/pasmaNapieciowe';
import { szynyStacji } from './szynyStacji';

/** Minimalny wycinek migawki czytany przez regułę (wyrocznie sceny niosą tylko część pól). */
export type ModelTransformatorow = Pick<EnergyNetworkModel, 'transformers'>
  & Partial<Pick<EnergyNetworkModel, 'branches' | 'generators' | 'substations' | 'bays'>>;

/** Rola pola zespołu uziemiającego — backend `ROLA_POLA_ZESPOLU_UZIEMIAJACEGO`. */
export const ROLA_POLA_ZESPOLU_UZIEMIAJACEGO = 'ZU';

/** Wycinek transformatora czytany przez predykat transformatora uziemiającego. */
export type TransformatorZespolu = {
  readonly ref_id?: string;
  readonly id?: string;
  readonly vector_group?: string | null;
  readonly uhv_kv?: number | null;
};

/**
 * Czy transformator JEST transformatorem uziemiającym sieci SN (jedyny nośnik zespołu
 * uziemiającego, karta ZU-JEDEN-NOSNIK) — lustro backendu
 * `enm.punkt_neutralny_zespolu.jest_transformatorem_uziemiajacym`: uzwojenie GÓRNE w zygzak
 * z wyprowadzonym punktem neutralnym (`grupaTransformatoraUziemiajacego`) na napięciu z pasma SN.
 */
export function jestTransformatoremUziemiajacym(transformer: TransformatorZespolu): boolean {
  return grupaTransformatoraUziemiajacego(transformer.vector_group) && wPasmieSn(transformer.uhv_kv);
}

/**
 * Pole zespołu uziemiającego (rola `ZU`), do którego należy transformator — JEDNO źródło
 * odpowiedzi „transformator uziemiający ma swoje pole” we froncie (marker braku pola TR,
 * rysunek pola ZU w GPZ, stacja transformatora). Lustro backendu
 * `enm.zespol_uziemiajacy.pole_zespolu_transformatora` (parytet: wiersze `tr-*` tablicy
 * `pole_transformatorowe_parytet_v1.json`): transformator JEST transformatorem uziemiającym
 * i wskazuje go typowane wyposażenie pola roli `ZU` (`Bay.equipment_refs`); pola w kolejności
 * `ref_id` (transformator należy do jednego pola). Inaczej `null` — inny transformator
 * w wyposażeniu pola ZU nie jest aparatem zespołu (działa dla niego zwykła reguła W041).
 */
export function poleZespoluTransformatora<
  B extends {
    readonly ref_id?: string;
    readonly id?: string;
    readonly bay_role?: string | null;
    readonly equipment_refs?: readonly string[] | null;
  },
>(bays: readonly B[] | null | undefined, transformer: TransformatorZespolu): B | null {
  if (!jestTransformatoremUziemiajacym(transformer)) return null;
  const refy = new Set([transformer.ref_id, transformer.id].filter(nonEmptyRef).map((r) => r.trim()));
  if (refy.size === 0) return null;
  const kandydaci = (bays ?? [])
    .filter((bay) => (bay.bay_role ?? '').trim().toUpperCase() === ROLA_POLA_ZESPOLU_UZIEMIAJACEGO)
    .sort((a, b) => {
      const ra = a.ref_id ?? '';
      const rb = b.ref_id ?? '';
      return ra < rb ? -1 : ra > rb ? 1 : 0;
    });
  return (
    kandydaci.find((bay) =>
      (bay.equipment_refs ?? []).some((ref) => nonEmptyRef(ref) && refy.has(ref.trim())),
    ) ?? null
  );
}

/** Rola katalogowa transformatora blokowego toru DER po stronie SN — backend
 *  `enm.domain_operations_v2` zapisuje ją w `Transformer.meta.catalog_role` przy
 *  materializacji toru („odróżnia go jednoznacznie od TR stacji”). */
export const ROLA_TRANSFORMATORA_BLOKOWEGO_DER = 'TRANSFORMATOR_BLOKOWY_DER';

function nonEmptyRef(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function transformerRefs(transformer: Transformer): string[] {
  return [transformer.ref_id, transformer.id].filter(nonEmptyRef);
}

/** Refy transformatorów wskazanych przez źródła jako blokowe (`Generator.blocking_transformer_ref`). */
export function refyTransformatorowBlokowych(snapshot: ModelTransformatorow | null | undefined): Set<string> {
  const refs = new Set<string>();
  for (const generator of snapshot?.generators ?? []) {
    const ref = (generator as { readonly blocking_transformer_ref?: string | null }).blocking_transformer_ref;
    if (nonEmptyRef(ref)) refs.add(ref);
  }
  return refs;
}

/**
 * JEDYNY filtr transformatora blokowego źródła DER (karta SZYNY-STACJI-LUSTRO, commit 2) —
 * wyłącznie z JAWNYCH danych modelu, w obu kanałach, w których backend je zapisuje:
 *  1. źródło wskazuje transformator w `Generator.blocking_transformer_ref`;
 *  2. transformator niesie `meta.catalog_role === 'TRANSFORMATOR_BLOKOWY_DER'` (tor DER po
 *     stronie SN materializowany doborem — operacja NIE wypełnia wtedy `blocking_transformer_ref`).
 * Dawne dopasowanie po słowach w nazwie, roli, wariancie i pozycji katalogu („blok”,
 * „dedykowany”, „pv”, „der”…) było zgadywaniem i istniało w dwóch różnych wersjach
 * (rysunek i kreator źródła) — usunięte. Lustro backendu:
 * `enm.pole_transformatorowe.transformator_blokowy_der`.
 */
export function transformatorBlokowyDer(
  transformer: Pick<Transformer, 'ref_id' | 'id'> & { readonly meta?: unknown },
  refyBlokowe: ReadonlySet<string>,
): boolean {
  if (transformerRefs(transformer as Transformer).some((ref) => refyBlokowe.has(ref))) return true;
  const meta = transformer.meta;
  return (
    meta !== null
    && typeof meta === 'object'
    && (meta as Record<string, unknown>).catalog_role === ROLA_TRANSFORMATORA_BLOKOWEGO_DER
  );
}

/**
 * Transformatory ROZDZIELCZE stacji — JEDNA reguła frontu (lustro backendu
 * `enm.pole_transformatorowe.transformatory_stacji`), czytana przez rysunek, inspektor,
 * konfigurator stacji, kartę stacji i kreator źródła:
 *  1. transformator blokowy źródła DER (`transformatorBlokowyDer`) jest wykluczony — także
 *     wtedy, gdy stacja deklaruje go w `transformer_refs`; tak samo transformator uziemiający
 *     z polem zespołu (`poleZespoluTransformatora`) — aparat pola ZU, nie transformator rozdzielczy;
 *  2. dalej rozstrzyga deklaracja stacji (`transformer_refs`);
 *  3. przy BRAKU deklaracji — transformator, którego koniec leży na szynie stacji z lustra
 *     `szynyStacji` (strona górna na zacisku pola TR, strona dolna za wyłącznikiem głównym nN).
 */
/**
 * Czy transformator NALEŻY do stacji (bez filtra blokowego) — rdzeń jedynej reguły:
 * deklaracja `transformer_refs` rozstrzyga, gdy stacja deklaruje jakikolwiek transformator;
 * przy braku deklaracji — koniec transformatora na szynie stacji z lustra `szynyStacji`.
 */
function transformatorStacji(
  transformer: Transformer,
  deklarowane: ReadonlySet<string>,
  szynyStacjiRefs: ReadonlySet<string>,
  stacjaRef: string | null | undefined,
  kontekst: KontekstTransformatorowStacji,
): boolean {
  // Transformator uziemiający z polem zespołu należy do stacji TEGO pola (`Bay.substation_ref`)
  // — rozstrzyga przed deklaracją i szynami: jego zaciski leżą na zacisku pola ZU i na szynie
  // potrzeb własnych, których lustro `szynyStacji` nie niesie, a stacja zwykle go nie deklaruje.
  // Bez tego blok stacji na L0, eksport i topologia gubiły aparat pola ZU (reguła kompletności).
  if (kontekst.stacjaZespolu.has(transformer)) return kontekst.stacjaZespolu.get(transformer) === stacjaRef;
  if (deklarowane.size > 0) return transformerRefs(transformer).some((ref) => deklarowane.has(ref));
  return szynyStacjiRefs.has(transformer.hv_bus_ref) || szynyStacjiRefs.has(transformer.lv_bus_ref);
}

/**
 * Dane reguły, które zależą WYŁĄCZNIE od migawki (nie od stacji): refy transformatorów blokowych DER i zbiór transformatorów blokowych. Wołający, który
 * pyta o wiele stacji albo wiele transformatorów tej samej migawki (adapter SLD, eksport,
 * kompletność rysunku, topologia), buduje go RAZ — bez tego każde pytanie przeglądało wszystkie
 * gałęzie i generatory (koszt O(stacje × migawka)). Wynik reguły z kontekstem i bez jest
 * identyczny; kontekst zbudowany dla innej migawki jest błędem wołającego (wyjątek).
 */
export interface KontekstTransformatorowStacji {
  readonly snapshot: ModelTransformatorow;
  readonly refyBlokowe: ReadonlySet<string>;
  /** Transformatory migawki spełniające `transformatorBlokowyDer` (jedyny filtr, wyżej). */
  readonly blokowe: ReadonlySet<Transformer>;
  /** Transformatory uziemiające z polem zespołu (`poleZespoluTransformatora`) — aparaty pola ZU,
   *  nie transformatory rozdzielcze. */
  readonly zespolu: ReadonlySet<Transformer>;
  /** Stacja pola zespołu (`Bay.substation_ref`) transformatora uziemiającego z `zespolu`. */
  readonly stacjaZespolu: ReadonlyMap<Transformer, string | null>;
  /** Pamięć szyn i deklaracji stacji (wyliczane raz na stację migawki przy pierwszym pytaniu —
   *  odwrotność reguły pyta o każdą stację dla każdego transformatora). */
  readonly stacje: Map<Substation, DaneStacji>;
}

interface DaneStacji {
  readonly deklarowane: ReadonlySet<string>;
  readonly szyny: ReadonlySet<string>;
}

export function kontekstTransformatorowStacji(snapshot: ModelTransformatorow): KontekstTransformatorowStacji {
  const refyBlokowe = refyTransformatorowBlokowych(snapshot);
  const stacjaZespolu = new Map<Transformer, string | null>();
  for (const transformer of snapshot.transformers ?? []) {
    const pole = poleZespoluTransformatora(snapshot.bays, transformer);
    if (pole) stacjaZespolu.set(transformer, pole.substation_ref ?? null);
  }
  return {
    snapshot,
    stacjaZespolu,
    refyBlokowe,
    blokowe: new Set(
      (snapshot.transformers ?? []).filter((transformer) => transformatorBlokowyDer(transformer, refyBlokowe)),
    ),
    zespolu: new Set(stacjaZespolu.keys()),
    stacje: new Map(),
  };
}

function kontekstDla(
  snapshot: ModelTransformatorow,
  kontekst: KontekstTransformatorowStacji | undefined,
): KontekstTransformatorowStacji {
  if (!kontekst) return kontekstTransformatorowStacji(snapshot);
  if (kontekst.snapshot !== snapshot) {
    throw new Error('Kontekst transformatorów stacji zbudowany dla innej migawki');
  }
  return kontekst;
}

function daneStacji(station: Substation, kontekst: KontekstTransformatorowStacji): DaneStacji {
  let dane = kontekst.stacje.get(station);
  if (!dane) {
    dane = {
      deklarowane: new Set((station.transformer_refs ?? []).filter(nonEmptyRef)),
      szyny: szynyStacji(kontekst.snapshot, station),
    };
    kontekst.stacje.set(station, dane);
  }
  return dane;
}

export function selectStationDistributionTransformers(
  snapshot: ModelTransformatorow | null | undefined,
  station: Substation | null | undefined,
  kontekst?: KontekstTransformatorowStacji,
): Transformer[] {
  if (!snapshot || !station) return [];
  const pelny = kontekstDla(snapshot, kontekst);
  const { deklarowane, szyny } = daneStacji(station, pelny);
  // KOMPLETNOSC-POLA-TR — GRANICA TEJ REGUŁY, ZMIERZONA I NAZWANA: transformator blokowy
  // źródła DER jest wykluczony TAKŻE wtedy, gdy stacja deklaruje go w `transformer_refs`
  // (operacja DER dopisuje tam transformator blokowy toru źródłowego). Stacja, której jedyny
  // transformator jest zarazem transformatorem blokowym źródła (`tr-stacji-z-der-na-nn`
  // w `pole_transformatorowe_parytet_v1.json`), NIE dostaje ani markera, ani ostrzeżenia —
  // ZNANA GRANICA po obu stronach parytetu, nie cichy wyjątek.
  return (snapshot.transformers ?? []).filter(
    (transformer) =>
      !pelny.blokowe.has(transformer)
      && !pelny.zespolu.has(transformer)
      && transformatorStacji(transformer, deklarowane, szyny, station.ref_id, pelny),
  );
}

/**
 * WSZYSTKIE transformatory należące do stacji (ta sama reguła `transformatorStacji`, BEZ
 * filtra blokowego) — dla pytań o przynależność elementu (kontener eksportu, blok stacji na
 * rysunku, topologia, referencje dowodu), gdzie transformator blokowy źródła DER też jest
 * elementem stacji. Transformatory ROZDZIELCZE daje `selectStationDistributionTransformers`.
 */
export function transformatoryNalezaceDoStacji(
  snapshot: ModelTransformatorow | null | undefined,
  station: Substation | null | undefined,
  kontekst?: KontekstTransformatorowStacji,
): Transformer[] {
  if (!snapshot || !station) return [];
  const pelny = kontekstDla(snapshot, kontekst);
  const { deklarowane, szyny } = daneStacji(station, pelny);
  return (snapshot.transformers ?? []).filter((transformer) => transformatorStacji(transformer, deklarowane, szyny, station.ref_id, pelny));
}

/**
 * Stacja transformatora — ODWROTNOŚĆ tej samej reguły (`transformatorStacji`), BEZ filtra
 * blokowego (transformator blokowy źródła DER też ma stację, w której go zadeklarowano albo
 * na której szynie leży). Pierwsza stacja modelu; `null` — żadna.
 */
export function stationRefOfTransformer(
  snapshot: ModelTransformatorow | null | undefined,
  transformerRef: string,
  kontekst?: KontekstTransformatorowStacji,
): string | null {
  const transformer = (snapshot?.transformers ?? []).find((item) => transformerRefs(item).includes(transformerRef));
  if (!snapshot || !transformer) return null;
  const pelny = kontekstDla(snapshot, kontekst);
  for (const station of snapshot.substations ?? []) {
    const { deklarowane, szyny } = daneStacji(station, pelny);
    if (transformatorStacji(transformer, deklarowane, szyny, station.ref_id, pelny)) {
      return station.ref_id ?? null;
    }
  }
  return null;
}
