/**
 * Wytwórcy DER Z MODELU (migawka ENM) — jedno odwzorowanie dla całej aplikacji.
 *
 * PO CO. `useStationDerStore` powstał jako stan LOKALNY kreatora stacji
 * (`AddDerWizard` woła `attachDer`), ale czytają go dziś ekrany strumienia OZE
 * pracujące na MODELU: macierz zgodności NC RfG, pulpit instalacji OZE, krzywe
 * P–Q, walidacja falownika. Wytwórca zapisany do modelu inną drogą (kreator
 * źródła OZE → operacja domenowa `add_converter_source`, import projektu,
 * odświeżenie po restarcie przeglądarki) NIE trafiał do tego store'a, więc te
 * ekrany pokazywały „Brak modułów wytwórczych do oceny" mimo generatora
 * w modelu — łańcuch „dodaj źródło OZE → oceń zgodność" był przerwany.
 *
 * SKĄD DANE (zero fabrykacji). WYŁĄCZNIE z migawki ENM: `generators[]`.
 *
 * KARTA FAB-K (naprawa łańcucha danych DER, 2026-09-05). Operacja domenowa
 * `set_der_catalog_bindings` (wiązania wybierane PO utworzeniu wytwórcy —
 * zabezpieczenie, CT/VT, dane zwarciowe, model dynamiczny, profile zgodności)
 * zapisuje WYŁĄCZNIE do `generator.materialized_params` (płasko) i
 * `materialized_params.profiles` — NIGDY do `generator.meta`. Ten moduł czytał
 * do tej pory WYŁĄCZNIE `generator.meta`, więc każde wiązanie zapisane przez
 * `PATCH …/generators/{ref}/bindings` znikało z tego odwzorowania (a więc
 * z całego frontu) natychmiast po odświeżeniu strony — sześć osi gotowości
 * (zabezpieczenia, selektywność, SC1F, SC2FG, FRT, HVRT) liczyło werdykt
 * z danych, których store nigdy nie widział.
 *
 * `DER_MATERIALIZED_BINDING_KEYS`/`DER_MATERIALIZED_PROFILE_KEYS` niżej
 * MUSZĄ nazywać dokładnie te same klucze co backendowe `DER_BINDING_KEYS`/
 * `DER_PROFILE_KEYS` (`enm/domain_operations_v2.py`) — test parytetu
 * (`__tests__/zModelu.test.ts`) pilnuje, żeby żadna strona nie dodała klucza
 * bez drugiej. `meta` zostaje źródłem WYŁĄCZNIE dla kluczy, które faktycznie
 * pisze `add_converter_source` (pole źródłowe, sekwencja, tryb pracy, Q(U)/P(f)
 * — patrz `_resolve_converter_defaults`), nigdy dla wiązań katalogowych/profili.
 *
 * Warstwa PREZENTACJI: zero fizyki, zero mutacji modelu.
 */

import type {
  Branch,
  EnergyNetworkModel,
  Generator as EnmGenerator,
} from '../../../types/enm';
import type { BlockTransformerItem } from './audit2-api';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  computeDerCompleteness,
  type ConnectionSide,
  type DerKindUnified,
  type SnConnectionPointKind,
  type StationDerConnection,
} from './types';

/**
 * Wiązania katalogowe wytwórcy — nazwy 1:1 z backendowym `DER_BINDING_KEYS`
 * (`enm/domain_operations_v2.py`). JEDYNA definicja po stronie frontu: testy
 * i odczyt (`derZGeneratora` niżej) czytają z TEJ listy, nie z ręcznie
 * wypisanych kluczy w dwóch miejscach.
 *
 * Karta FAB-L: `fault_current_data_ref` USUNIĘTE — solver IEC 60909 (inwentarz
 * `network_model/solvers/short_circuit_iec60909.py` + `enm/mapping.py`) nigdy
 * nie czytał tego pola; była to równoległa fizyka w UI (κ liczone drugi raz),
 * nie brakujące wiązanie.
 */
export const DER_MATERIALIZED_BINDING_KEYS = [
  'protection_catalog_ref',
  'ct_catalog_ref',
  'vt_catalog_ref',
  'dynamic_model_ref',
] as const;

/**
 * Profile zgodności przyłączeniowej (wartość SKALARNA) — nazwy 1:1 z
 * backendowym `DER_PROFILE_KEYS`. Trzymane przez backend w podsłowniku
 * `materialized_params.profiles`.
 *
 * `bess_operation_mode_refs` NIE jest tu — backendowe `DER_PROFILE_KEYS` niesie
 * tę nazwę w TYM SAMYM podsłowniku, ale wartość jest LISTĄ, nie skalarem
 * (jedyne pole tego kształtu w obu zbiorach); czyta ją osobno
 * `bessOperationModeRefsZMaterializowanych` niżej, żeby ta stała i pętla po
 * niej (`derZGeneratora`) mogły zostać jednorodne (string → string | null).
 */
export const DER_MATERIALIZED_PROFILE_KEYS = [
  'nc_rfg_profile_ref',
  'lvrt_curve_ref',
  'hvrt_curve_ref',
  'pf_curve_ref',
] as const;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Karta FAB-L: `profiles.bess_operation_mode_refs` — lista, filtruje wpisy
 * spoza kształtu kontraktu (nie-string, string pusty) zamiast rzutować `as`.
 */
function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function derKindFromGenerator(generator: EnmGenerator): DerKindUnified | null {
  const genType = (generator.gen_type ?? '').toLowerCase();
  const catalogGroup = (generator.catalog_namespace ?? '').toUpperCase();
  const ref = `${generator.ref_id} ${generator.name} ${generator.catalog_ref ?? ''}`.toLowerCase();
  if (genType.includes('bess') || catalogGroup.includes('BESS') || ref.includes('bess')) return 'BESS';
  if (genType.includes('wind') || genType.startsWith('fw_') || catalogGroup.includes('FW') || ref.includes('/fw/')) return 'FW';
  if (genType.includes('pv') || catalogGroup.includes('PV') || ref.includes('/pv/')) return 'PV';
  return null;
}

/**
 * Poziom przyłączenia — WYŁĄCZNIE z `connection_variant` kanonicznego (karta
 * FAB-K). Backend zapisuje na generatorze zawsze wartość PO tłumaczeniu
 * aliasów (`add_converter_source::_VARIANT_ALIASES`) — `nn_side` albo
 * `block_transformer` — więc odczyt nie zgaduje z podciągów `bus_ref`
 * (dawny `bus_ref.includes('/nn_')` KASOWANY razem z domyślnym fallbackiem:
 * zgadywanie poziomu z nazwy szyny jest tą samą klasą fabrykacji, którą ta
 * karta usuwa wszędzie indziej). Aliasy `LV_BEHIND_STATION_TRANSFORMER` /
 * `DEDICATED_MV_CONNECTION` / `SOURCE_CONNECTION_STATION` zostają jako odczyt
 * WYŁĄCZNIE dla modeli zapisanych przed kartą FAB-K (nowe zapisy ich nie
 * produkują — Literal kontraktu `DerGeneratorCreateRequest` ich nie przyjmuje).
 */
export function connectionSideFromGenerator(generator: EnmGenerator): ConnectionSide {
  switch (generator.connection_variant) {
    case 'nn_side':
    case 'LV_BEHIND_STATION_TRANSFORMER':
      return 'nN';
    default:
      return 'dedicated_transformer';
  }
}

/**
 * Rodzaj punktu przyłączenia SN — POCHODNA typu elementu modelu, do którego
 * należy `busRef` (szyna stacji wg pól / `BranchPointSN` / `Junction`).
 * Mirror odczytu backendu (`enm/topology.py::_find_junction_bus` dla Junction —
 * heurystyka „szyna z największą liczbą powiązanych gałęzi węzła", jedyne
 * źródło prawdy o tym, jaką szynę reprezentuje węzeł T, bo `Junction` nie
 * niesie własnego `bus_ref`). `null` gdy szyna nie należy do żadnego z trzech
 * rodzajów (np. usunięta ze snapshotu).
 */
export function snPointKindForBus(
  snapshot: EnergyNetworkModel,
  busRef: string,
): SnConnectionPointKind | null {
  const branchPoint = (snapshot.branch_points ?? []).find((bp) => bp.bus_ref === busRef);
  if (branchPoint) {
    return branchPoint.branch_point_type === 'zksn' ? 'zksn' : 'branch_pole';
  }
  const station = (snapshot.substations ?? []).find((s) => (s.bus_refs ?? []).includes(busRef));
  if (station) return 'station_bus';

  const branchByRef = new Map<string, Branch>(
    (snapshot.branches ?? []).map((branch) => [branch.ref_id, branch]),
  );
  for (const junction of snapshot.junctions ?? []) {
    const busCounts = new Map<string, number>();
    for (const branchRef of junction.connected_branch_refs) {
      const branch = branchByRef.get(branchRef);
      if (!branch) continue;
      busCounts.set(branch.from_bus_ref, (busCounts.get(branch.from_bus_ref) ?? 0) + 1);
      busCounts.set(branch.to_bus_ref, (busCounts.get(branch.to_bus_ref) ?? 0) + 1);
    }
    let bestRef: string | null = null;
    let bestCount = -1;
    for (const [ref, count] of busCounts) {
      if (count > bestCount) {
        bestRef = ref;
        bestCount = count;
      }
    }
    if (bestRef === busRef) return 'junction';
  }
  return null;
}

export function isGeneratorAttachedToStation(
  generator: EnmGenerator,
  stationRef: string,
): boolean {
  if (generator.station_ref === stationRef) return true;
  const stationPrefix = stationRef.endsWith('/station')
    ? stationRef.slice(0, -'/station'.length)
    : stationRef;
  return generator.bus_ref.startsWith(`${stationPrefix}/`);
}

export function generatorDisplayName(generator: EnmGenerator, kind: DerKindUnified): string {
  const meta = generator.meta ?? {};
  const sourceIndex = readNumber(meta.source_sequence_index);
  const ordinal = String((sourceIndex ?? 0) + 1).padStart(2, '0');
  const baseName = generator.name?.trim();
  if (baseName && !/^blok\s/i.test(baseName)) return baseName;
  const label = kind === 'BESS' ? 'magazyn energii' : kind === 'FW' ? 'farma wiatrowa' : 'fotowoltaika';
  return `${kind} ${ordinal} - ${label}`;
}

/**
 * Karta FAB-J: `blockTransformers` przychodzi ze snapshotu audytu 2
 * (`useAudit2CatalogSnapshot`) — bez niego (lista pusta, jeszcze nie
 * pobrana) inferencja uczciwie zwraca `null` zamiast zgadywać z pustego
 * katalogu.
 */
export function inferBlockTransformerCatalogRef(
  snapshot: EnergyNetworkModel | null,
  transformerRef: string | null | undefined,
  blockTransformers: readonly BlockTransformerItem[] = [],
): string | null {
  if (!snapshot || !transformerRef) return null;
  const transformer = (snapshot.transformers ?? []).find(
    (candidate) => candidate.ref_id === transformerRef || candidate.id === transformerRef,
  );
  if (!transformer) return null;
  const snKva = Math.round(transformer.sn_mva * 1000);
  const vectorGroup = transformer.vector_group ?? null;
  const match = blockTransformers.find((candidate) =>
    candidate.sn_kva === snKva
    && Math.abs(candidate.hv_kv - transformer.uhv_kv) < 0.01
    && Math.abs(candidate.lv_kv - transformer.ulv_kv) < 0.01
    && (!vectorGroup || candidate.vector_group === vectorGroup),
  );
  return match?.id ?? null;
}

/**
 * Stacja wytwórcy Z MODELU. Pierwszeństwo ma jawna referencja `station_ref`
 * generatora; gdy jej nie ma, szukamy stacji, do której należy szyna
 * przyłączenia (ta sama reguła prefiksu co `isGeneratorAttachedToStation`).
 * Brak dopasowania ⇒ `null` — wytwórca nie dostaje stacji „z domysłu".
 */
function stationRefForGenerator(
  snapshot: EnergyNetworkModel,
  generator: EnmGenerator,
): string | null {
  const jawna = readString(generator.station_ref);
  if (jawna) return jawna;
  const stacja = (snapshot.substations ?? []).find((substation) =>
    isGeneratorAttachedToStation(generator, substation.ref_id),
  );
  return stacja?.ref_id ?? null;
}

function derZGeneratora(
  snapshot: EnergyNetworkModel,
  generator: EnmGenerator,
  stationRef: string,
  projectId: string | null,
  timestamp: string,
  blockTransformers: readonly BlockTransformerItem[] = [],
): StationDerConnection | null {
  const kind = derKindFromGenerator(generator);
  if (!kind) return null;
  // KARTA FAB-K: `materialized_params` PIERWSZE — to jest gdzie pisze
  // `set_der_catalog_bindings` (bindings PATCH) I gdzie `add_converter_source`
  // materializuje tabliczkę urządzenia (un_kv, ptpiree_certificate_ref,
  // battery_catalog_ref/battery). `meta` zostaje WYŁĄCZNIE dla kluczy, które
  // `add_converter_source` faktycznie tam zapisuje (`field_ref`,
  // `source_sequence_index`, tryb pracy, Q(U)/P(f) — `_resolve_converter_defaults`).
  const materialized = asRecord(generator.materialized_params);
  const meta = asRecord(generator.meta);
  const connectionSide = connectionSideFromGenerator(generator);
  const transformerRef = generator.blocking_transformer_ref ?? null;
  const blockTransformerCatalogRef = readString(meta.block_transformer_catalog_ref)
    ?? inferBlockTransformerCatalogRef(snapshot, transformerRef, blockTransformers);

  // Karta FAB-K (parytet FE/BE, reguła KLASA NIE INSTANCJA): odczyt PĘTLĄ po
  // kanonicznych listach kluczy (`DER_MATERIALIZED_BINDING_KEYS`/`_PROFILE_KEYS`)
  // zamiast ręcznie wypisanych literałów jeden po drugim. Wcześniej te stałe
  // były eksportowane, ale WYŁĄCZNIE dekoracyjne — nikt tu ich nie odczytywał,
  // więc dopisanie klucza do listy bez dopisania osobnej linii niżej cicho
  // gubiło dane. Teraz brak takiej osobnej linii nie jest już możliwy.
  const materializedBindings = Object.fromEntries(
    DER_MATERIALIZED_BINDING_KEYS.map((key) => [key, readString(materialized[key])]),
  ) as Record<(typeof DER_MATERIALIZED_BINDING_KEYS)[number], string | null>;
  const materializedProfiles = Object.fromEntries(
    DER_MATERIALIZED_PROFILE_KEYS.map((key) => [key, readString(asRecord(materialized.profiles)[key])]),
  ) as Record<(typeof DER_MATERIALIZED_PROFILE_KEYS)[number], string | null>;
  // Karta FAB-L: `bess_operation_mode_refs` — lista, tego samego podsłownika
  // `materialized_params.profiles`, poza pętlą skalarów wyżej (patrz komentarz
  // przy `DER_MATERIALIZED_PROFILE_KEYS`).
  const bessOperationModeRefs = readStringArray(asRecord(materialized.profiles).bess_operation_mode_refs);

  const catalogs = {
    ...EMPTY_DER_CATALOGS,
    device_catalog_ref: generator.catalog_ref ?? null,
    bay_catalog_ref: readString(meta.field_ref),
    block_transformer_catalog_ref: blockTransformerCatalogRef,
    // Materializacja urządzenia (PV/BESS/FW) niesie certyfikat PTPiREE 1:1 z
    // tabliczką falownika — pochodna, nie osobny wybór (`_certyfikat_ptpiree_z_katalogu`).
    ptpiree_certificate_ref: readString(materialized.ptpiree_certificate_ref),
    battery_catalog_ref: readString(materialized.battery_catalog_ref),
    ...materializedBindings,
  };
  const profiles = {
    ...EMPTY_DER_PROFILES,
    ...materializedProfiles,
    bess_operation_mode_refs: bessOperationModeRefs,
  };
  const busPrzylaczeniaRef = readString(meta.bus_przylaczenia_ref) ?? generator.bus_ref;
  // Napięcie przyłączenia WPROST z modelu (szyna wytwórcy) — patrz komentarz przy
  // `StationDerConnection.connection_voltage_kv`. Brak szyny w migawce ⇒ null.
  const szyna = (snapshot.buses ?? []).find(
    (bus) => bus.ref_id === generator.bus_ref || bus.id === generator.bus_ref,
  );
  const connectionVoltageKv = readNumber(szyna?.voltage_kv);

  // Punkt przyłączenia SN (karta FAB-K): szyna GÓRNA transformatora dedykowanego,
  // rodzaj wyprowadzony z typu elementu, do którego ta szyna należy — nigdy
  // osobny wybór trzymany na rekordzie.
  let snConnectionBusRef: string | null = null;
  let snConnectionPointKind: SnConnectionPointKind | null = null;
  if (connectionSide === 'dedicated_transformer' && transformerRef) {
    const transformator = (snapshot.transformers ?? []).find(
      (t) => t.ref_id === transformerRef || t.id === transformerRef,
    );
    snConnectionBusRef = readString(transformator?.hv_bus_ref);
    if (snConnectionBusRef) {
      snConnectionPointKind = snPointKindForBus(snapshot, snConnectionBusRef);
    }
  }

  return {
    id: generator.ref_id,
    project_id: projectId ?? 'project-from-enm',
    station_id: stationRef,
    der_kind: kind,
    name: generatorDisplayName(generator, kind),
    connection_side: connectionSide,
    bus_przylaczenia_ref: busPrzylaczeniaRef,
    bay_ref: readString(meta.field_ref),
    transformer_ref: transformerRef,
    lv_busbar_ref: connectionSide === 'nN' ? generator.bus_ref : null,
    sn_connection_bus_ref: snConnectionBusRef,
    sn_connection_point_kind: snConnectionPointKind,
    connection_voltage_kv: connectionVoltageKv,
    catalogs,
    profiles,
    nominal_power_kw: Math.round(generator.p_mw * 1000),
    // Liczba jednostek z modelu (`quantity`) — bez niej moc grupy i moc jednostki
    // sa nierozroznialne (audyt E-21 pkt P2). Zapisywane przez `add_converter_source`
    // do `meta.quantity`, nie do `materialized_params` (patrz `_resolve_converter_defaults`).
    unit_count: readNumber(meta.quantity) ?? readNumber(meta.n_parallel),
    completeness: computeDerCompleteness({
      connection_side: connectionSide,
      bus_przylaczenia_ref: busPrzylaczeniaRef,
      catalogs,
      profiles,
      connection_voltage_kv: connectionVoltageKv,
      sn_connection_bus_ref: snConnectionBusRef,
    }),
    readiness: { ...EMPTY_DER_READINESS },
    created_at: timestamp,
    updated_at: timestamp,
  };
}

/**
 * Wszyscy wytwórcy DER z migawki (kolejność deterministyczna: sort po `id`).
 *
 * `blockTransformers` (opcjonalne, karta FAB-J): snapshot audytu 2, żeby
 * inferencja transformatora dedykowanego dla wytwórców bez jawnego
 * `meta.block_transformer_catalog_ref` czytała z realnego katalogu. Pominięcie
 * nie jest błędem — inferencja po prostu nie znajdzie dopasowania (`null`).
 */
export function deryZModelu(
  snapshot: EnergyNetworkModel | null,
  projectId: string | null,
  blockTransformers: readonly BlockTransformerItem[] = [],
): readonly StationDerConnection[] {
  if (!snapshot) return [];
  const timestamp = snapshot.header.updated_at || snapshot.header.created_at || '1970-01-01T00:00:00Z';
  return (snapshot.generators ?? [])
    .map((generator) => {
      const stationRef = stationRefForGenerator(snapshot, generator);
      if (!stationRef) return null;
      return derZGeneratora(snapshot, generator, stationRef, projectId, timestamp, blockTransformers);
    })
    .filter((der): der is StationDerConnection => der !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** Wytwórcy DER JEDNEJ stacji — to samo odwzorowanie zawężone do stacji. */
export function deryStacjiZModelu(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null,
  projectId: string | null,
  blockTransformers: readonly BlockTransformerItem[] = [],
): readonly StationDerConnection[] {
  if (!snapshot || !stationRef) return [];
  const timestamp = snapshot.header.updated_at || snapshot.header.created_at || '1970-01-01T00:00:00Z';
  return (snapshot.generators ?? [])
    .filter((generator) => isGeneratorAttachedToStation(generator, stationRef))
    .map((generator) => derZGeneratora(snapshot, generator, stationRef, projectId, timestamp, blockTransformers))
    .filter((der): der is StationDerConnection => der !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Tożsamość ZNACZENIOWA rekordu — ten sam wytwórca zapisany lokalnie i odczytany
 * z modelu ma inne `id`, więc bez tego klucza lista dublowałaby wpisy.
 *
 * NAZWA NIE WCHODZI DO KLUCZA (naprawa 2026-08-05): rekord z modelu dostaje
 * nazwę wyświetlaną z `generatorDisplayName` („Blok PV" → „PV 01 - fotowoltaika"),
 * więc klucz z nazwą NIGDY nie zrównywał pary lokalny/modelowy i ten sam fizyczny
 * wytwórca pojawiał się w macierzy zgodności DWA razy — certyfikat meldowałby
 * dwa moduły dla jednego urządzenia. Tożsamość niesie rozdzielnia, rodzaj, strona
 * przyłączenia, pozycja katalogowa urządzenia i moc; etykieta jest prezentacją.
 */
export function derSemanticKey(der: StationDerConnection): string {
  return [
    der.station_id,
    der.der_kind,
    der.connection_side,
    der.catalogs.device_catalog_ref ?? '',
    der.nominal_power_kw ?? '',
  ].join('|');
}

/** Model wygrywa po `id`; rekord lokalny zostaje, o ile nie dubluje modelowego. */
export function mergeStationDers(
  snapshotDers: readonly StationDerConnection[],
  localDers: readonly StationDerConnection[],
): readonly StationDerConnection[] {
  const byId = new Map<string, StationDerConnection>();
  const snapshotSemanticKeys = new Set(snapshotDers.map(derSemanticKey));
  snapshotDers.forEach((der) => byId.set(der.id, der));
  localDers.forEach((der) => {
    if (!byId.has(der.id) && snapshotSemanticKeys.has(derSemanticKey(der))) {
      return;
    }
    byId.set(der.id, der);
  });
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}
