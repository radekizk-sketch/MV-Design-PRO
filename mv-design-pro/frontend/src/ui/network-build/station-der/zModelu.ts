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
 * SKĄD DANE (zero fabrykacji). WYŁĄCZNIE z migawki ENM: `generators[]` wraz
 * z `meta` zapisaną przez operacje domenowe. Moduł niczego nie liczy i niczego
 * nie dopowiada — brak danej zostaje `null`.
 *
 * REUŻYCIE, NIE DUPLIKACJA. Odwzorowanie mieszkało w `StationConfiguratorSurface`
 * i było widoczne wyłącznie dla JEDNEJ stacji na jednej powierzchni; tu jest
 * jedną funkcją dla całego modelu, a konfigurator stacji zawęża wynik do swojej
 * stacji tą samą drogą (`deryStacjiZModelu`).
 *
 * Warstwa PREZENTACJI: zero fizyki, zero mutacji modelu.
 */

import type {
  EnergyNetworkModel,
  Generator as EnmGenerator,
} from '../../../types/enm';
import { BLOCK_TRANSFORMER_CATALOG } from './catalogs';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  computeDerCompleteness,
  type ConnectionSide,
  type DerKindUnified,
  type StationDerConnection,
} from './types';

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

export function connectionSideFromGenerator(generator: EnmGenerator): ConnectionSide {
  switch (generator.connection_variant) {
    case 'LV_BEHIND_STATION_TRANSFORMER':
    case 'nn_side':
      return 'nN';
    case 'DEDICATED_MV_CONNECTION':
    case 'block_transformer':
      return 'dedicated_transformer';
    case 'SOURCE_CONNECTION_STATION':
      return 'SN';
    default:
      return generator.bus_ref.includes('/nn_') || generator.bus_ref.includes('/nn_bus') ? 'nN' : 'SN';
  }
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

export function inferBlockTransformerCatalogRef(
  snapshot: EnergyNetworkModel | null,
  transformerRef: string | null | undefined,
): string | null {
  if (!snapshot || !transformerRef) return null;
  const transformer = (snapshot.transformers ?? []).find(
    (candidate) => candidate.ref_id === transformerRef || candidate.id === transformerRef,
  );
  if (!transformer) return null;
  const snKva = Math.round(transformer.sn_mva * 1000);
  const vectorGroup = transformer.vector_group ?? null;
  const match = BLOCK_TRANSFORMER_CATALOG.find((candidate) =>
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
): StationDerConnection | null {
  const kind = derKindFromGenerator(generator);
  if (!kind) return null;
  const meta = generator.meta ?? {};
  const connectionSide = connectionSideFromGenerator(generator);
  const transformerRef = generator.blocking_transformer_ref ?? null;
  const blockTransformerCatalogRef = readString(meta.block_transformer_catalog_ref)
    ?? inferBlockTransformerCatalogRef(snapshot, transformerRef);
  const catalogs = {
    ...EMPTY_DER_CATALOGS,
    device_catalog_ref: generator.catalog_ref ?? null,
    bay_catalog_ref: readString(meta.field_ref),
    block_transformer_catalog_ref: blockTransformerCatalogRef,
    protection_catalog_ref: readString(meta.protection_catalog_ref),
    ct_catalog_ref: readString(meta.ct_catalog_ref),
    vt_catalog_ref: readString(meta.vt_catalog_ref),
    fault_current_data_ref: readString(meta.fault_current_data_ref),
    dynamic_model_ref: readString(meta.dynamic_model_ref),
  };
  const profiles = {
    ...EMPTY_DER_PROFILES,
    nc_rfg_profile_ref:
      readString(meta.nc_rfg_profile_ref) ?? readString(meta.operator_profile_ref),
    regulation_profile_ref: readString(meta.regulation_profile_ref),
    pf_curve_ref: readString(meta.pf_curve_ref),
  };
  const busPrzylaczeniaRef = readString(meta.bus_przylaczenia_ref) ?? generator.bus_ref;
  const voltageLevelRef = readString(meta.voltage_level_ref);
  // Napięcie przyłączenia WPROST z modelu (szyna wytwórcy) — patrz komentarz przy
  // `StationDerConnection.connection_voltage_kv`. Brak szyny w migawce ⇒ null.
  const szyna = (snapshot.buses ?? []).find(
    (bus) => bus.ref_id === generator.bus_ref || bus.id === generator.bus_ref,
  );
  const connectionVoltageKv = readNumber(szyna?.voltage_kv);
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
    connection_node_ref: readString(meta.connection_node_ref),
    internal_cable_ref: readString(meta.internal_cable_ref),
    voltage_level_ref: voltageLevelRef,
    connection_voltage_kv: connectionVoltageKv,
    catalogs,
    profiles,
    nominal_power_kw: Math.round(generator.p_mw * 1000),
    // Liczba jednostek z modelu (`quantity`) — bez niej moc grupy i moc jednostki
    // sa nierozroznialne (audyt E-21 pkt P2).
    unit_count: readNumber(meta.quantity) ?? readNumber(meta.n_parallel),
    completeness: computeDerCompleteness({
      connection_side: connectionSide,
      bus_przylaczenia_ref: busPrzylaczeniaRef,
      catalogs,
      profiles,
      voltage_level_ref: voltageLevelRef,
    }),
    readiness: { ...EMPTY_DER_READINESS },
    created_at: timestamp,
    updated_at: timestamp,
  };
}

/** Wszyscy wytwórcy DER z migawki (kolejność deterministyczna: sort po `id`). */
export function deryZModelu(
  snapshot: EnergyNetworkModel | null,
  projectId: string | null,
): readonly StationDerConnection[] {
  if (!snapshot) return [];
  const timestamp = snapshot.header.updated_at || snapshot.header.created_at || '1970-01-01T00:00:00Z';
  return (snapshot.generators ?? [])
    .map((generator) => {
      const stationRef = stationRefForGenerator(snapshot, generator);
      if (!stationRef) return null;
      return derZGeneratora(snapshot, generator, stationRef, projectId, timestamp);
    })
    .filter((der): der is StationDerConnection => der !== null)
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** Wytwórcy DER JEDNEJ stacji — to samo odwzorowanie zawężone do stacji. */
export function deryStacjiZModelu(
  snapshot: EnergyNetworkModel | null,
  stationRef: string | null,
  projectId: string | null,
): readonly StationDerConnection[] {
  if (!snapshot || !stationRef) return [];
  const timestamp = snapshot.header.updated_at || snapshot.header.created_at || '1970-01-01T00:00:00Z';
  return (snapshot.generators ?? [])
    .filter((generator) => isGeneratorAttachedToStation(generator, stationRef))
    .map((generator) => derZGeneratora(snapshot, generator, stationRef, projectId, timestamp))
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
