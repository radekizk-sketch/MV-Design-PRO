/**
 * Powierzchnie E-21/E-22/E-23 dla źródeł i magazynów energii.
 *
 * Ten widok jest kartą inżynierską urządzenia przyłączonego do stacji:
 * falownika PV, PCS BESS albo turbiny/regulatora farmy wiatrowej. Dane
 * prezentowane są z katalogów i profili zgodności, bez surowych identyfikatorów
 * jako podstawowej treści UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchCtTypes, fetchDerConverterTypes, fetchProtectionDeviceTypes, fetchVtTypes } from '../../catalog/api';
import type { ConverterType, CTCatalogType, ProtectionDeviceType, VTCatalogType } from '../../catalog/types';
import { useAppStateStore } from '../../app-state';
import {
  DerConfigurator,
  type DerCardId,
  type DerKind,
  type DerStationContext,
} from '../../network-build/der-configurator/DerConfigurator';
import { DerWiazaniaEditor } from '../../network-build/station-der/DerWiazaniaEditor';
import { DoborPrzekladnikowSekcja } from '../../network-build/station-der/DoborPrzekladnikowSekcja';
import { FunkcjeZabezpieczenSekcja } from '../../network-build/station-der/FunkcjeZabezpieczenSekcja';
import { MacierzAnalizSekcja } from '../../network-build/station-der/MacierzAnalizSekcja';
import { zlozMacierzAnaliz } from '../../network-build/station-der/macierzAnaliz';
import { buildAggregatedReadiness } from '../../network-build/station-der/readiness';
import { useExecutionRunsStore } from '../../study-cases/runStore';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import {
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  computeDerCompleteness,
  computeDerReadinessMatrix,
  formatDerDynamicProfileLabelPl,
  getBlockTransformer,
  getDerDynamicProfile,
  getNcRfgOperator,
  getSnConnectionPointKindLabelPl,
  selectAllDers,
  selectDerById,
  snPointKindForBus,
  useAudit2CatalogSnapshot,
  useBessBatteryTypes,
  useDerDynamicProfiles,
  useNcRfgModuleClassification,
  useNcRfgOperatorCatalog,
  useStationDerStore,
  type BessBatteryItem,
  type BlockTransformerItem,
  type DerDynamicProfileItem,
  type NcRfgOperatorItem,
  type PfCurveItem,
  type SnConnectionPointKind,
} from '../../network-build/station-der';
import { wzbogacOKlaseCt } from '../../network-build/station-der/ctZKatalogu';
import {
  identyfikacjaMocy,
  stanKonfiguracji,
  torMocy,
  type IdentyfikacjaMocy,
  type OgniwoToru,
} from '../../network-build/station-der/tozsamoscWytworcy';
import {
  PTPIREE_CERTIFIED_DEVICE_SOURCES,
  PTPIREE_CERTIFIED_INVERTERS,
  filterPtpireeCertifiedInverters,
  formatPtpireeCertificateLabel,
  getPtpireeCertifiedInverter,
  getPtpireeSource,
  getPtpireeSourceRecordCount,
  loadPtpireeCertifiedInverters,
} from '../../network-build/station-der/ptpireeCertifiedInverters';
import type {
  ConnectionSide,
  DerReadinessMatrix,
  ReadinessAxisStatus,
  StationDerConnection,
} from '../../network-build/station-der';
import { MISSING_DASH } from '../../shared/formatPolishValue';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { EnergyNetworkModel, Generator, Substation } from '../../../types/enm';
import type { WorkspaceSurfaceDescriptor } from '../types';

interface DerSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

interface DerWrapperProps {
  readonly surface: WorkspaceSurfaceDescriptor;
  readonly screenCode: string;
  readonly derKind: DerKind;
  readonly title: string;
  readonly testId: string;
}

// ZERO DOMYSLNEGO OPERATORA (V12K-236). Nie ma tu żadnego „profilu domyślnego":
// wcześniej brak profilu w modelu był zastępowany zestawem ENEA
// (`ncrfg_enea`/`lvrt_enea_b`/`hvrt_enea_b`/`pf_enea_b`), co fabrykowało OPERATORA —
// a każdy z pięciu obsługiwanych OSD (pse, energa, tauron, enea, pge) ma własne krzywe
// LVRT/HVRT i własne wymagania Q(U). Skutek: cztery osie gotowości (Q(U), FRT, HVRT,
// NC RfG) świeciły „gotowe" dla wytwórcy, którego model NIE NIESIE ŻADNEGO profilu,
// a `buildReadinessForGenerator` — czytający surowy rekord — mówił o tym samym
// wytwórcy „zablokowane". Backend takiego domysłu nie robi: `load_nc_rfg_profile`
// odrzuca nieznanego operatora wyjątkiem, zamiast podstawiać jakiegokolwiek.
// Brak profilu zostaje BRAKIEM (null) — reguła gotowości nazywa go kodem
// `der.nc_rfg.missing` z akcją naprawczą „wybierz profil OSD".

function cleanCatalogText(value: string): string {
  const replacements: readonly [string, string][] = [
    ['\u0102\u201a\u00c2\u00b7', '·'],
    ['\u0102\u02d8\u00e2\u201a\u00ac\u00e2\u20ac\u0165', '-'],
    ['\u00c4\u201a\u00e2\u20ac\u201d', 'x'],
    ['\u0102\u02d8\u00e2\u20ac\u00b0\u00c2\u0088', '≈'],
    ['\u0102\u02d8\u00e2\u20ac\u00b0\u00c4\u201e', '≥'],
    ['\u00c4\u017d\u00e2\u20ac\u00a0', 'Φ'],
    ['\u00c4\u2026\u0139\u00ba', 'ź'],
    ['\u00c4\u2026\u00e2\u20ac\u0161', 'ł'],
    ['\u00c4\u2026\u00e2\u20ac\u017e', 'ń'],
    ['\u00c4\u2026\u00e2\u20ac\u203a', 'ś'],
    ['\u0102\u201e\u00e2\u20ac\u2021', 'ć'],
    ['\u0102\u201e\u00e2\u20ac\u00a6', 'ą'],
    ['\u0102\u201e\u00e2\u201e\u02d8', 'ę'],
    ['\u00c4\u201a\u0139\u201a', 'ó'],
  ];
  return replacements.reduce((text, [bad, good]) => text.split(bad).join(good), value);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_REF_PATTERN = /\b(?:gpz|stn|seg|pv|bess|fw|nn)\/[a-z0-9/_#-]+/i;

function isInternalLabel(value: string | null | undefined): boolean {
  const text = value?.trim();
  if (!text) return true;
  return UUID_RE.test(text) || INTERNAL_REF_PATTERN.test(text);
}

function publicProjectName(value: string | null | undefined): string | undefined {
  if (!value || isInternalLabel(value)) return undefined;
  return value;
}

function stationTypeLabel(value: string | null | undefined): string {
  switch ((value ?? '').toLowerCase()) {
    case 'inline':
      return 'stacja przelotowa';
    case 'terminal':
      return 'stacja końcowa';
    case 'sectional':
      return 'stacja sekcyjna';
    case 'branch':
    case 'branching':
      return 'stacja rozgałęźna';
    case 'gpz':
      return 'GPZ';
    default:
      return 'stacja SN/nN';
  }
}

function isGenericStationName(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'stacja inline'
    || normalized === 'stacja terminal'
    || normalized === 'stacja sectional'
    || normalized === 'stacja branch';
}

function stationOrdinal(snapshot: EnergyNetworkModel | null, station: Substation | null): number | null {
  if (!snapshot || !station) return null;
  const stations = (snapshot.substations ?? []).filter((item) => item.station_type !== 'gpz');
  const index = stations.findIndex((item) => item.ref_id === station.ref_id || item.id === station.id);
  return index >= 0 ? index + 1 : null;
}

function publicStationName(
  snapshot: EnergyNetworkModel | null,
  station: Substation | null,
  fallbackRef: string,
): string {
  const name = station?.name?.trim();
  if (name && !isGenericStationName(name) && !isInternalLabel(name)) {
    return name;
  }

  const codeNumber = stationOrdinal(snapshot, station);
  const typeLabel = stationTypeLabel(
    station?.station_type ?? (asRecord(station?.meta).station_type_semantic as string | undefined),
  );
  if (codeNumber !== null) {
    return `S${String(codeNumber).padStart(2, '0')} · ${typeLabel}`;
  }
  return isInternalLabel(fallbackRef) ? typeLabel : fallbackRef;
}

/**
 * Nazwa typu z REALNEGO katalogu (V12K-239, kontrakt zawężony w V12K-242).
 *
 * Zwraca `null`, gdy typu NIE MA w katalogu (jeszcze nie pobrano albo referencja wskazuje
 * na typ nieznany). Rozróżnienie „brak przypisania" od „nie wiemy, jak się nazywa" robi
 * WYŁĄCZNIE wołający — tu nie zgadujemy, który z tych dwóch stanów pokazać.
 */
function nazwaTypuZKatalogu(
  katalog: readonly { readonly id: string; readonly name?: string }[],
  ref: string | null | undefined,
): string | null {
  if (!ref) return null;
  const typ = katalog.find((entry) => entry.id === ref);
  return typ?.name ? cleanCatalogText(typ.name) : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberFromRecord(
  record: Record<string, unknown>,
  keys: readonly string[],
): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function stringFromRecord(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/**
 * Referencja katalogowa urządzenia z modelu — BEZ podstawiania (naprawa FAB-I,
 * ta sama klasa co fallback `AddDerWizard`/`wizard-validation`).
 *
 * POMIAR PRZED NAPRAWĄ: gdy `explicitRef` (zapisany przez kreator, dziś zawsze
 * identyfikator z backendu) nie pasował do ŻADNEJ pozycji lokalnych katalogów
 * `PV_INVERTER_CATALOG`/`BESS_PCS_CATALOG`/`WIND_TURBINE_CATALOG` — co jest
 * ścieżką NORMALNĄ, nie brzegową, odkąd kreator DER wybiera urządzenie z
 * backendu — funkcja podstawiała inne urządzenie z lokalnej listy, dobrane
 * WYŁĄCZNIE po najbliższej mocy znamionowej. Karta inżynierska pokazywała więc
 * producenta, model i napięcie urządzenia, którego w stacji NIE MA. Dokładnie
 * ten sam mechanizm, jaki `nazwaTypuZKatalogu` miał dla CT/VT przed V12K-239/242
 * (patrz komentarz przy `KatalogiWiazan` niżej) — tam już naprawiony,
 * tu nie. Naprawa: referencja z modelu wraca 1:1, `null` zostaje `null`.
 * Brak dopasowania w katalogu jest teraz widoczny WPROST — `findDeviceLabel`
 * (karta FAB-J: szuka w `fetchDerConverterTypes`, to samo pobranie co kreator)
 * zwraca `„<ref> (pozycja spoza katalogu)"` zamiast fabrykować nazwę/producenta.
 */
function resolveDeviceCatalogRef(explicitRef: string | null): string | null {
  return explicitRef && explicitRef.trim().length > 0 ? explicitRef : null;
}

/**
 * Karta FAB-K (§0 R3, KLASA NIE INSTANCJA): `ConnectionSide` niesie WYŁĄCZNIE
 * poziom przyłączenia — nN, albo SN przez transformator dedykowany (żadne
 * urządzenie z katalogu przekształtników nie łączy się z siecią SN bez
 * pośredniczącego transformatora). Dawny wynik `'SN'` (dla legacy
 * `SOURCE_CONNECTION_STATION`) nie istnieje już jako wariant — grupowany z
 * pozostałymi „dedicated" tak jak w drugim niezależnym czytniku tej samej
 * wartości backendu (`enmToSldAdapter.ts::mapGeneratorConnectionSide`), żeby
 * oba czytniki zgadzały się co do tych samych legacy stringów.
 */
function connectionSideFromGenerator(generator: Generator): ConnectionSide {
  switch (generator.connection_variant) {
    case 'DEDICATED_MV_CONNECTION':
    case 'SOURCE_CONNECTION_STATION':
    case 'block_transformer':
      return 'dedicated_transformer';
    default:
      return 'nN';
  }
}

function profileRecordFromGenerator(generator: Generator): Record<string, unknown> {
  const materialized = asRecord(generator.materialized_params);
  const meta = asRecord(generator.meta);
  return {
    ...asRecord(meta.profiles),
    ...asRecord(materialized.profiles),
  };
}

function buildDerFromGenerator(
  generator: Generator | null | undefined,
  fallbackKind: DerKind,
  snapshot: EnergyNetworkModel | null,
  blockTransformers: readonly BlockTransformerItem[] = [],
): StationDerConnection | null {
  if (!generator) return null;
  const connectionSide = connectionSideFromGenerator(generator);
  const materialized = asRecord(generator.materialized_params);
  const meta = asRecord(generator.meta);
  const profiles = profileRecordFromGenerator(generator);
  const stationRef = generator.station_ref
    ?? stringFromRecord(meta, ['station_ref', 'station_id'])
    ?? stringFromRecord(materialized, ['station_ref', 'station_id'])
    ?? '';
  // V12K-268: nazwa kanoniczna PIERWSZA, zastane nazwy jako awaryjny odczyt.
  // Automigracja przy wczytaniu modelu (`enm/migrations/punkt_przylaczenia_der.py`)
  // przenosi klucz raz i na stale, ale rekord moze tu trafic takze sciezka, ktora
  // magazynu nie dotyka (np. podglad importu) — wtedy stara nazwa musi byc nadal
  // czytelna, inaczej gotowy projekt pokazalby brak przylaczenia.
  const busPrzylaczeniaRef = stringFromRecord(materialized, ['bus_przylaczenia_ref', 'pcc_ref', 'pcc'])
    ?? stringFromRecord(meta, ['bus_przylaczenia_ref', 'pcc_ref', 'pcc'])
    ?? generator.bus_ref
    ?? null;
  const transformerRef = generator.blocking_transformer_ref
    ?? stringFromRecord(materialized, ['transformer_ref', 'station_transformer_ref', 'blocking_transformer_ref'])
    ?? stringFromRecord(meta, ['transformer_ref', 'station_transformer_ref', 'blocking_transformer_ref'])
    ?? (connectionSide === 'dedicated_transformer' ? `tr_${generator.ref_id}` : null);
  const blockTransformerCatalogRef = stringFromRecord(materialized, ['block_transformer_catalog_ref'])
    ?? stringFromRecord(meta, ['block_transformer_catalog_ref'])
    ?? inferBlockTransformerCatalogRef(snapshot, transformerRef, blockTransformers);
  const lvBusbarRef = stringFromRecord(materialized, ['lv_busbar_ref', 'lv_bus_ref'])
    ?? stringFromRecord(meta, ['lv_busbar_ref', 'lv_bus_ref'])
    ?? (connectionSide === 'nN' ? generator.bus_ref ?? null : null);
  const ncRfgRef = stringFromRecord(profiles, ['nc_rfg_profile_ref', 'nc_rfg', 'ncrfg']);
  // Moc z modelu to moc CAŁEJ pozycji (operacja zapisuje moc katalogową × liczba sztuk).
  const nominalPowerKw = typeof generator.p_mw === 'number' ? Math.round(generator.p_mw * 1000) : null;
  // Liczba jednostek — dana modelu (`quantity`), do tej pory na ekran NIE DOCHODZILA,
  // wiec moc jednostkowa i grupowa byly nierozroznialne (audyt E-21 pkt P2).
  const unitCount = numberFromRecord(materialized, ['quantity', 'n_parallel'])
    ?? numberFromRecord(meta, ['quantity', 'n_parallel']);
  const catalogRef = resolveDeviceCatalogRef(
    generator.catalog_ref ?? stringFromRecord(materialized, ['device_catalog_ref']),
  );
  // Karta FAB-K (§0 R1/R4): napięcie punktu przyłączenia WPROST z modelu (szyna
  // wytwórcy) — JEDYNE źródło (ten sam mechanizm, co `zModelu.ts::derZGeneratora`,
  // KLASA NIE INSTANCJA: dwa niezależne czytniki tego samego generatora muszą
  // wyprowadzać napięcie tą samą regułą, inaczej rozjadą się na danych brzegowych).
  const szynaPrzylaczenia = (snapshot?.buses ?? []).find(
    (bus) => bus.ref_id === generator.bus_ref || bus.id === generator.bus_ref,
  );
  const connectionVoltageKv = typeof szynaPrzylaczenia?.voltage_kv === 'number'
    ? szynaPrzylaczenia.voltage_kv
    : null;
  // Karta FAB-K (§0 R3): punkt przyłączenia SN — szyna GÓRNA transformatora
  // dedykowanego, rodzaj wyprowadzony z typu elementu modelu, do którego ta
  // szyna należy (`snPointKindForBus`, ta sama funkcja co kreator DER i
  // `zModelu.ts`). Zero osobnego pola trzymanego jako wybór.
  let snConnectionBusRef: string | null = null;
  let snConnectionPointKind: SnConnectionPointKind | null = null;
  if (connectionSide === 'dedicated_transformer' && transformerRef && snapshot) {
    const transformator = (snapshot.transformers ?? []).find(
      (t) => t.ref_id === transformerRef || t.id === transformerRef,
    );
    snConnectionBusRef = transformator?.hv_bus_ref ?? null;
    if (snConnectionBusRef) {
      snConnectionPointKind = snPointKindForBus(snapshot, snConnectionBusRef);
    }
  }

  const rekord: StationDerConnection = {
    id: generator.ref_id,
    project_id: 'snapshot',
    station_id: stationRef,
    der_kind: fallbackKind,
    name: generator.name || generator.ref_id,
    connection_side: connectionSide,
    bus_przylaczenia_ref: busPrzylaczeniaRef,
    bay_ref: stringFromRecord(materialized, ['bay_ref']) ?? stringFromRecord(meta, ['bay_ref']),
    transformer_ref: transformerRef,
    lv_busbar_ref: lvBusbarRef,
    sn_connection_bus_ref: snConnectionBusRef,
    sn_connection_point_kind: snConnectionPointKind,
    connection_voltage_kv: connectionVoltageKv,
    catalogs: {
      ...EMPTY_DER_CATALOGS,
      device_catalog_ref: catalogRef,
      ptpiree_certificate_ref: stringFromRecord(materialized, ['ptpiree_certificate_ref'])
        ?? stringFromRecord(meta, ['ptpiree_certificate_ref']),
      battery_catalog_ref: stringFromRecord(materialized, ['battery_catalog_ref'])
        ?? stringFromRecord(meta, ['battery_catalog_ref']),
      protection_catalog_ref: stringFromRecord(materialized, ['protection_catalog_ref'])
        ?? stringFromRecord(meta, ['protection_catalog_ref']),
      ct_catalog_ref: stringFromRecord(materialized, ['ct_catalog_ref']) ?? stringFromRecord(meta, ['ct_catalog_ref']),
      vt_catalog_ref: stringFromRecord(materialized, ['vt_catalog_ref']) ?? stringFromRecord(meta, ['vt_catalog_ref']),
      dynamic_model_ref: stringFromRecord(materialized, ['dynamic_model_ref'])
        ?? stringFromRecord(meta, ['dynamic_model_ref']),
      block_transformer_catalog_ref: blockTransformerCatalogRef,
    },
    profiles: {
      ...EMPTY_DER_PROFILES,
      nc_rfg_profile_ref: ncRfgRef,
      lvrt_curve_ref: stringFromRecord(profiles, ['lvrt_curve_ref', 'lvrt']),
      hvrt_curve_ref: stringFromRecord(profiles, ['hvrt_curve_ref', 'hvrt']),
      pf_curve_ref: stringFromRecord(profiles, ['pf_curve_ref', 'p_f_curve_ref', 'pf']),
    },
    nominal_power_kw: nominalPowerKw,
    unit_count: unitCount,
    // Karta FAB-K (§0 R1, KLASA NIE INSTANCJA): JEDNA funkcja kompletności
    // (`types.ts::computeDerCompleteness`) — wczesniejszy lokalny duplikat
    // (`!busPrzylaczeniaRef ? 'no_pcc' : ...`) IGNOROWAL napiecie przylaczenia
    // i punkt SN, wiec ten ekran i `zModelu.ts` mogly wystawic RÓŻNY werdykt
    // kompletnosci dla tego samego wytworcy — dokladnie defekt, ktory ta
    // reguła zakazuje (dwa niezalezne predykaty, ktore "dzis sie zgadzaja").
    completeness: computeDerCompleteness({
      connection_side: connectionSide,
      bus_przylaczenia_ref: busPrzylaczeniaRef,
      catalogs: {
        ...EMPTY_DER_CATALOGS,
        device_catalog_ref: catalogRef,
      },
      profiles: { ...EMPTY_DER_PROFILES, nc_rfg_profile_ref: ncRfgRef },
      connection_voltage_kv: connectionVoltageKv,
      sn_connection_bus_ref: snConnectionBusRef,
    }),
    // JEDNA regula gotowosci na tym ekranie (V12K-243). Wczesniej stal tu lokalny,
    // slabszy duplikat (`buildReadinessForGenerator`): patrzyl wylacznie na obecnosc
    // urzadzenia katalogowego i profili, wiec IGNOROWAL klase przekladnika, dane pradu
    // zwarciowego, model dynamiczny, punkt przylaczenia i transformator blokowy —
    // trzecia ocena tego samego wytworcy, rozjezdzajaca sie z kanoniczna.
    // Ocena liczona na GOTOWYM rekordzie (nizej), zeby patrzyla na te sama, SUROWA
    // mape profili i katalogow, ktora widzi reszta ekranu — dwie oceny tego samego
    // wytworcy nie moga sie rozjezdzac (przed V12K-236 rekord dostawal profile
    // domyslne, a ocena surowe, wiec jedna mowila „gotowe", druga „zablokowane").
    readiness: EMPTY_DER_READINESS,
    created_at: '',
    updated_at: '',
  };
  return { ...rekord, readiness: computeDerReadinessMatrix(rekord) };
}

function buildDerFromSurfaceContext(
  surface: WorkspaceSurfaceDescriptor,
  fallbackKind: DerKind,
): StationDerConnection | null {
  const derId = surface.entityRef
    ?? (typeof surface.routeState.payload?.derId === 'string' ? surface.routeState.payload.derId : null);
  if (!derId) return null;

  const derName = typeof surface.routeState.payload?.derName === 'string'
    && surface.routeState.payload.derName.trim()
    ? surface.routeState.payload.derName
    : null;
  const stationId = typeof surface.routeState.payload?.stationId === 'string'
    ? surface.routeState.payload.stationId
    : '';

  return {
    id: derId,
    project_id: 'surface-context',
    station_id: stationId,
    der_kind: fallbackKind,
    name: derName ?? surface.titlePl,
    connection_side: 'nN',
    bus_przylaczenia_ref: null,
    bay_ref: null,
    transformer_ref: null,
    lv_busbar_ref: null,
    sn_connection_bus_ref: null,
    sn_connection_point_kind: null,
    connection_voltage_kv: null,
    catalogs: { ...EMPTY_DER_CATALOGS },
    profiles: { ...EMPTY_DER_PROFILES },
    nominal_power_kw: null,
    unit_count: null,
    completeness: 'no_pcc',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: '',
    updated_at: '',
  };
}

/**
 * Karta FAB-J: `blockTransformers` przychodzi ze snapshotu audytu 2
 * (`useAudit2CatalogSnapshot`) zamiast statyku modułowego usuniętego z
 * `catalogs.ts` — pominięcie (lista jeszcze nie pobrana) zwraca uczciwie `null`.
 */
function inferBlockTransformerCatalogRef(
  snapshot: EnergyNetworkModel | null,
  transformerRef: string | null | undefined,
  blockTransformers: readonly BlockTransformerItem[],
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
 * Etykieta urządzenia z katalogu — WYRÓŻNIA „brak wyboru" od „wybór spoza
 * katalogu backendu" (naprawa FAB-I, rozszerzona kartą FAB-J).
 *
 * `catalogLabel` (dzielona z CT/VT) traktuje obie sytuacje tak samo i zwraca
 * „wybierz wariant katalogowy" — komunikat prawdziwy, gdy referencja jest
 * pusta, ale MYLĄCY, gdy projektant już wybrał urządzenie w kreatorze
 * (backend), a lokalna lista go po prostu nie zna. Karta FAB-J usuwa OSTATNI
 * powód takiej rozbieżności: `converters` to TO SAMO pobranie
 * (`fetchDerConverterTypes`), którego kreator już używa — więc „spoza
 * katalogu" zostaje tylko dla referencji naprawdę nieznanej backendowi
 * (rekord legacy sprzed migracji katalogu).
 */
function findDeviceLabel(der: StationDerConnection, converters: readonly ConverterType[]): string {
  const ref = der.catalogs.device_catalog_ref;
  if (!ref) return 'wybierz wariant katalogowy';
  const item = converters.find((entry) => entry.id === ref);
  if (!item) return `${ref} (pozycja spoza katalogu)`;
  return cleanCatalogText(item.name || [item.manufacturer, item.model].filter(Boolean).join(' ') || ref);
}

function findConverter(
  der: StationDerConnection,
  converters: readonly ConverterType[],
): ConverterType | null {
  return converters.find((item) => item.id === der.catalogs.device_catalog_ref) ?? null;
}

/**
 * Moc POJEDYNCZEJ jednostki z katalogu urzadzenia.
 *
 * Odroznienie od `der.nominal_power_kw` (moc calej pozycji) jest sednem naprawy P2:
 * do V12K-245 jedna etykieta „Moc znamionowa AC" pokazywala raz jedno, raz drugie.
 */
function mocJednostkiZKatalogu(
  der: StationDerConnection,
  converters: readonly ConverterType[],
): number | null {
  const item = findConverter(der, converters);
  return item && Number.isFinite(item.pmax_mw) ? item.pmax_mw * 1000 : null;
}

function blockTransformerLabel(
  der: StationDerConnection,
  blockTransformers: readonly BlockTransformerItem[],
): string {
  const transformer = getBlockTransformer(blockTransformers, der.catalogs.block_transformer_catalog_ref);
  if (!transformer) return assignedLabel(der.transformer_ref, 'transformator blokowy przypisany');
  const voltage = `${transformer.hv_kv.toLocaleString('pl-PL')}/${transformer.lv_kv.toLocaleString('pl-PL')} kV`;
  const power = `${transformer.sn_kva.toLocaleString('pl-PL')} kVA`;
  return `TR blokowy ${voltage} ${power} ${transformer.vector_group}`;
}

/**
 * Karta FAB-L: katalog WYŁĄCZNIE z backendu (`GET /api/catalog/der-dynamic-profiles`,
 * `useDerDynamicProfiles`) — dawny `DER_DYNAMIC_MODEL_CATALOG` niósł pola ZMYŚLONE
 * (`k_factor_iq_over_du`, `voltage_drop_detection_time_ms`) bez odpowiednika w
 * realnym resolverze (`network_model.catalog.der_dynamic`). Dobór PO URZĄDZENIU
 * (`applicable_device_ids`) skasowany bez zamiennika: backend nie wyraża mapowania
 * „to urządzenie → ten profil" żadną końcówką — wybór jest dziś JAWNY
 * (`dynamic_model_ref` wybrany przez projektanta w konfiguratorze), nigdy cichym
 * domyślnym po dopasowaniu urządzenia.
 */
function dynamicModelLabel(der: StationDerConnection, profiles: readonly DerDynamicProfileItem[]): string {
  const selected = getDerDynamicProfile(profiles, der.catalogs.dynamic_model_ref);
  return selected ? cleanCatalogText(formatDerDynamicProfileLabelPl(selected)) : 'model dynamiczny z wariantu katalogowego';
}

/**
 * Stan braku granicznego prądu zwarciowego falownika (karta K-Q, 2026-08-14).
 * Wzorzec `BRAK_PASMA_BEZPIECZNIKA`: pole nie znika z karty (ciche zniknięcie to
 * inne kłamstwo), tylko mówi wprost, czego brakuje i skąd to wziąć.
 *
 * Karta FAB-L: JEDYNY komunikat dla „model zwarciowy" na całym ekranie (dawny
 * `faultCurrentLabel` czytał drugi, sfabrykowany katalog `DER_FAULT_CURRENT_
 * DATA_CATALOG` — inwentarz solvera IEC 60909 wykazał zero konsumentów tych
 * danych; ten sam komunikat zastępuje oba miejsca, patrz `buildDerCards`).
 */
const BRAK_PRADU_ZWARCIOWEGO_FALOWNIKA_PL = 'wymaga karty katalogowej wyrobu (wynik zwarciowy: SC3F/SC1F)';

/**
 * Karta FAB-J: `ref` jest teraz `operator_id` (pse/energa/...), bo backend
 * (`GET /api/ncrfg-tests/catalog`) niesie JEDNĄ parę krzywych LVRT/HVRT na
 * operatora — bez podziału wg modułu, którego front dawniej nie miał czym
 * potwierdzić.
 */
function rideThroughLabel(
  kind: 'LVRT' | 'HVRT',
  ref: string | null,
  ncRfgOperators: readonly NcRfgOperatorItem[],
): string {
  const operator = getNcRfgOperator(ncRfgOperators, ref);
  if (!operator) return `${kind}: profil z wariantu operatora`;
  const punkty = kind === 'LVRT' ? operator.ride_through.lvrt : operator.ride_through.hvrt;
  return `${kind}: ${operator.operator_name_pl} (${punkty.length} pkt czas/napięcie)`;
}

function pfCurveLabel(ref: string | null, pfCurves: readonly PfCurveItem[]): string {
  const item = pfCurves.find((entry) => entry.id === ref);
  return item ? cleanCatalogText(item.label_pl) : 'charakterystyka z profilu operatora';
}

/**
 * Karta FAB-J: moduł NC RfG jest klasyfikacją NORMATYWNĄ liczoną backendem
 * (`GET /api/ncrfg-tests/modul`, `compliance/nc_rfg_modul.py`) — ekran go
 * WYŚWIETLA (przekazany przez komponent, który woła klasyfikację), nie liczy
 * sam z progów mocy.
 */
function moduleTypeLabel(moduleType: string | null): string {
  return moduleType ? `moduł ${moduleType}` : 'moduł wg profilu NC RfG';
}

function readinessPl(value: ReadinessAxisStatus): string {
  switch (value) {
    case 'ready':
      return 'zakres kompletny';
    case 'partial':
      return 'zakres do przeliczenia';
    case 'blocked':
      return 'wymaga wariantu katalogowego';
    case 'not_applicable':
      return 'nie dotyczy';
    case 'no_module':
      return 'zakres poza bieżącym modułem';
  }
}

/** Moc grupy — tyle wnosi ta pozycja do modelu (`p_mw`). */
function mocGrupyPl(moc: IdentyfikacjaMocy): string {
  if (moc.mocGrupyKw === null) return 'brak danej w modelu';
  const podstawa = `${moc.mocGrupyKw.toLocaleString('pl-PL')} kW`;
  if (!moc.sprzecznosc) return podstawa;
  // SPRZECZNOSC POKAZANA, NIE UKRYTA (audyt E-21 pkt P2): iloczyn jednostka × liczba
  // nie zgadza sie z moca zapisana w modelu — od tej liczby zaleza prady robocze,
  // dobor transformatora, CT i kategoria NC RfG, wiec projektant musi to zobaczyc.
  return `${podstawa} — niezgodne z iloczynem `
    + `${moc.sprzecznosc.oczekiwanaKw.toLocaleString('pl-PL')} kW (jednostka × liczba)`;
}

function liczbaJednostekPl(moc: IdentyfikacjaMocy): string {
  if (moc.liczbaJednostek === null) return 'brak danej w modelu';
  return moc.liczbaJednostek === 1 ? '1 (pojedyncza jednostka)' : `${moc.liczbaJednostek}`;
}

function mocJednostkiPl(moc: IdentyfikacjaMocy): string {
  if (moc.mocJednostkiKw === null) return 'wg wybranego urządzenia katalogowego';
  return `${moc.mocJednostkiKw.toLocaleString('pl-PL')} kW`;
}

/** Tor mocy z elementow modelu; brakujace ogniwo jest NAZWANE, nie pomijane. */
function torMocyPl(tor: readonly OgniwoToru[]): string {
  return tor
    .filter((ogniwo) => ogniwo.wymagane || ogniwo.nazwa !== null)
    .map((ogniwo) => `${ogniwo.rola}: ${ogniwo.nazwa ?? 'brak w modelu'}`)
    .join(' → ');
}




function assignedLabel(value: string | null | undefined, label: string): string {
  return value ? label : 'do konfiguracji w wariancie katalogowym';
}

function ptpireeSourceSummary(): string {
  return `${getPtpireeSourceRecordCount()} pozycji źródłowych PTPiREE`;
}

/**
 * Wiersz pola: etykieta NAD wartością na wąskim ekranie, obok wartości od `sm` w górę
 * (karta E21-5, audyt E-21 pkt P12). Sztywna kolumna 170 px na telefonie zostawiała
 * wartościom kilkadziesiąt pikseli i wypychała treść poza ekran — układ tabelaryczny
 * wraca dopiero tam, gdzie jest na niego miejsce. Treść, kolejność i etykiety bez zmian.
 */
function FieldRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-scada-border/60 py-1.5 last:border-b-0 sm:grid-cols-[170px_1fr] sm:gap-3">
      <dt className="text-scada-muted">{label}</dt>
      <dd className="break-words font-medium text-scada-text">{value}</dd>
    </div>
  );
}

function EngineeringNote({ children }: { readonly children: string }) {
  return (
    <p className="mt-3 border-l-2 border-sygnal-info bg-sygnal-info-tlo px-3 py-2 text-xs text-sygnal-info-tusz">
      {children}
    </p>
  );
}

/**
 * Katalogi wiązań POBRANE z backendu (V12K-239, rozszerzone o zabezpieczenia w V12K-242).
 * Etykiety nie mogą stać na lokalnej liście syntetycznej: POMIAR pokrycia identyfikatorów
 * z katalogiem realnym to ZERO (CT 5 lokalnych vs 12 realnych, VT 4 vs 9), wiec dla
 * przekładnika wybranego w prawdziwym kreatorze `catalogLabel` nie znajdowal wpisu i
 * wypisywal „wybierz wariant katalogowy" — ekran kazal projektantowi wybrac aparat,
 * ktory JUZ wybral.
 */
interface KatalogiWiazan {
  readonly ct: readonly CTCatalogType[];
  readonly vt: readonly VTCatalogType[];
  readonly zabezpieczenia: readonly ProtectionDeviceType[];
}

function buildDerCards(
  der: StationDerConnection,
  /** Rozbicie mocy na jednostke, liczbe sztuk i grupe (audyt E-21 pkt P2). */
  moc: IdentyfikacjaMocy,
  /** Tor mocy z ELEMENTOW MODELU, z jawnie brakujacymi ogniwami (pkt P3). */
  tor: readonly OgniwoToru[],
  /**
   * Macierz gotowosci liczona NA ZYWO z rekordu (V12K-243). Ekran czytal wczesniej pole
   * `der.readiness` ZAPISANE na rekordzie — nikt go nie przeliczal po zmianie wiazan, wiec
   * karta, w ktorej projektant NAPRAWIA brak, pokazywala werdykt sprzed naprawy. Diagnoza
   * i naprawa siedzialy w jednej karcie i nie rozmawialy ze soba.
   */
  gotowosc: DerReadinessMatrix,
  edytorWiazan: JSX.Element,
  /** Sekcja funkcji zabezpieczeniowych — wynik reguly domenowej (E21-3, pkt P7/P8). */
  funkcjeZabezpieczen: JSX.Element,
  /** Macierz analiz: po co · czego brakuje · stan wyniku · dzialanie (E21-2, P5/P10). */
  macierzAnaliz: JSX.Element,
  /** Dobor przekladnikow: kryteria normowe z jawnym rachunkiem (E21-4, pkt P9). */
  doborPrzekladnikow: JSX.Element,
  /** Karta FAB-J: katalogi WYŁĄCZNIE z backendu — zero statyku modułowego. */
  katalogi: {
    readonly converters: readonly ConverterType[];
    readonly blockTransformers: readonly BlockTransformerItem[];
    readonly ncRfgOperators: readonly NcRfgOperatorItem[];
    readonly pfCurves: readonly PfCurveItem[];
    readonly bessBatteries: readonly BessBatteryItem[];
    /** Karta FAB-L: profile dynamiczne DER — `GET /api/catalog/der-dynamic-profiles`. */
    readonly dynamicProfiles: readonly DerDynamicProfileItem[];
    /** Moduł NC RfG oczekiwany dla (moc, napięcie) tego wytwórcy — z backendu. */
    readonly moduleType: string | null;
  },
): Partial<Record<DerCardId, JSX.Element>> {
  const {
    converters, blockTransformers, ncRfgOperators, pfCurves, bessBatteries, dynamicProfiles, moduleType,
  } = katalogi;
  const ncRfg = getNcRfgOperator(ncRfgOperators, der.profiles.nc_rfg_profile_ref);
  const inverter = findConverter(der, converters);
  const ptpireeCertificate = getPtpireeCertifiedInverter(der.catalogs.ptpiree_certificate_ref);
  // Graniczny prąd zwarciowy falownika (karta K-Q): katalog mirrorowy NIE niesie
  // już tej liczby, bo podaje ją wyłącznie karta katalogowa konkretnego wyrobu,
  // a wcześniejsza wartość była wpisana z ręki. Udział źródła w prądzie zwarcia
  // liczy solver ze składowych symetrycznych modelu — ekran mówi, skąd to wziąć,
  // zamiast pokazywać liczbę bez pokrycia.
  const faultCurrent = BRAK_PRADU_ZWARCIOWEGO_FALOWNIKA_PL;
  const isDedicatedTransformer = der.connection_side === 'dedicated_transformer';
  const bateriaLabel = der.catalogs.battery_catalog_ref
    ? (nazwaTypuZKatalogu(bessBatteries, der.catalogs.battery_catalog_ref)
      ?? `${der.catalogs.battery_catalog_ref} (pozycja spoza katalogu)`)
    : 'wybierz wariant katalogowy';

  return {
    basic: (
      <section>
        <dl>
          <FieldRow label="Nazwa źródła" value={der.name} />
          <FieldRow
            label="Punkt przyłączenia"
            value={assignedLabel(der.bus_przylaczenia_ref, 'Punkt przyłączenia przypisany do toru')}
          />
          <FieldRow label="Moc pozycji (grupy)" value={mocGrupyPl(moc)} />
          <FieldRow label="Liczba jednostek" value={liczbaJednostekPl(moc)} />
          <FieldRow label="Moc jednostki (katalog)" value={mocJednostkiPl(moc)} />
          {isDedicatedTransformer && (
            <FieldRow label="Transformator blokowy" value={blockTransformerLabel(der, blockTransformers)} />
          )}
          <FieldRow label="Urządzenie katalogowe" value={findDeviceLabel(der, converters)} />
          <FieldRow label="Certyfikat PTPiREE" value={formatPtpireeCertificateLabel(ptpireeCertificate)} />
          <FieldRow label="Moduł NC RfG" value={moduleTypeLabel(moduleType)} />
        </dl>
        <EngineeringNote>
          Konfiguracja zaczyna się od falownika lub PCS, bo to urządzenie definiuje napięcie nN, prąd zwarciowy, model dynamiczny i wymagania FRT.
        </EngineeringNote>
      </section>
    ),
    topology: (
      <section>
        <dl>
          <FieldRow label="Stacja" value={assignedLabel(der.station_id, 'stacja przypisana')} />
          <FieldRow label="Strona przyłączenia" value={connectionSidePl(der.connection_side, der.sn_connection_point_kind)} />
          <FieldRow label="Tor mocy" value={torMocyPl(tor)} />
          <FieldRow label="Pole SN" value={assignedLabel(der.bay_ref, 'pole SN przypisane')} />
          <FieldRow label="Szyna nN" value={assignedLabel(der.lv_busbar_ref, 'szyna nN przypisana')} />
          <FieldRow
            label={isDedicatedTransformer ? 'Transformator blokowy' : 'Transformator'}
            value={isDedicatedTransformer ? blockTransformerLabel(der, blockTransformers) : assignedLabel(der.transformer_ref, 'transformator przypisany')}
          />
        </dl>
        <EngineeringNote>
          Dla PV za transformatorem SN/nN wymagane są klikalne aparaty po stronie SN, transformator, szyna nN oraz wyłącznik nN chroniący falownik.
        </EngineeringNote>
      </section>
    ),
    inverters: der.der_kind === 'PV' ? (
      <PvInverterCatalogPanel
        der={der}
        inverterLabel={findDeviceLabel(der, converters)}
        inverterManufacturer={inverter?.manufacturer ?? null}
        inverterVoltage={inverter ? `${inverter.un_kv} kV` : null}
        faultCurrent={faultCurrent}
      />
    ) : (
      <section>
        <dl>
          <FieldRow label={der.der_kind === 'FW' ? 'Turbina z katalogu' : 'Falownik / PCS'} value={findDeviceLabel(der, converters)} />
          <FieldRow label="Producent" value={inverter?.manufacturer ?? MISSING_DASH} />
          <FieldRow
            label="Napięcie urządzenia"
            value={inverter ? `${inverter.un_kv} kV` : MISSING_DASH}
          />
          <FieldRow label="Prąd zwarciowy falownika" value={faultCurrent} />
          <FieldRow label="Bateria BESS" value={bateriaLabel} />
        </dl>
      </section>
    ),
    'plant-controller': (
      <section>
        <dl>
          <FieldRow
            label="Charakterystyka Q(U)"
            value={ncRfg ? `${ncRfg.operator_name_pl}: zakres ${(ncRfg.reactive_power.q_range_pct_pn_min * 100).toFixed(0)}…${(ncRfg.reactive_power.q_range_pct_pn_max * 100).toFixed(0)}% Pn` : 'wg profilu operatora'}
          />
          <FieldRow label="Charakterystyka P(f)" value={pfCurveLabel(der.profiles.pf_curve_ref, pfCurves)} />
          <FieldRow
            label="Zakres cos φ"
            value={ncRfg ? `min. ${ncRfg.reactive_power.cos_phi_min.toFixed(2)}` : 'wg profilu operatora'}
          />
          <FieldRow label="Ograniczenie eksportu" value="do wyznaczenia w rozpływie mocy" />
        </dl>
      </section>
    ),
    'frt-hvrt': (
      <section>
        <dl>
          <FieldRow label="LVRT" value={rideThroughLabel('LVRT', der.profiles.lvrt_curve_ref, ncRfgOperators)} />
          <FieldRow label="HVRT" value={rideThroughLabel('HVRT', der.profiles.hvrt_curve_ref, ncRfgOperators)} />
          <FieldRow label="Model dynamiczny" value={dynamicModelLabel(der, dynamicProfiles)} />
          <FieldRow label="Status FRT" value={readinessPl(gotowosc.frt)} />
          <FieldRow label="Status HVRT" value={readinessPl(gotowosc.hvrt)} />
        </dl>
      </section>
    ),
    ncrfg: (
      <section>
        <dl>
          <FieldRow
            label="Profil zgodności"
            value={ncRfg ? cleanCatalogText(ncRfg.operator_name_pl) : 'wybierz profil zgodności przyłączeniowej'}
          />
          <FieldRow label="P(f)" value={pfCurveLabel(der.profiles.pf_curve_ref, pfCurves)} />
          <FieldRow label="Model zwarciowy" value={BRAK_PRADU_ZWARCIOWEGO_FALOWNIKA_PL} />
          <FieldRow
            label="Minimalna moc zwarciowa PCC"
            value={ncRfg ? `${moduleTypeLabel(moduleType)}: wg profilu ${ncRfg.operator_name_pl}` : 'wg profilu operatora'}
          />
          <FieldRow label="Zgodność przyłączeniowa" value={readinessPl(gotowosc.nc_rfg)} />
        </dl>
      </section>
    ),
    readiness: (
      <section>
        <dl>
          <FieldRow label="Stan konfiguracji" value={stanKonfiguracji(gotowosc).zdanie} />
        </dl>
        {/* MACIERZ ZAMIAST OSMIU OGOLNIKOW (E21-2, audyt E-21 pkt P5). Wiersze „os:
            zakres kompletny / zakres do przeliczenia" nie mowily, czy analiza nie byla
            uruchomiona, czy wynik utracil aktualnosc, czy brakuje danych wejsciowych.
            Regula gotowosci miala NAZWANE powody — prezentacja je zgniatala do jednego
            slowa. Macierz pokazuje je wraz ze stanem wyniku i nastepnym krokiem. */}
        {macierzAnaliz}
        {edytorWiazan}
        {/* DOBOR ZAMIAST NAZWY KATALOGOWEJ (E21-4, audyt E-21 pkt P9). Sam wpis
            „CT 200/5 A kl. 5P10" nie mowil, czy przekladnik pasuje do tego toru:
            przekladnia wobec pradu roboczego, nasycenie, wytrzymalosc cieplna i
            dynamiczna, zgodnosc z wejsciem przekaznika. Teraz kazde kryterium ma
            podstawe normowa i jawny rachunek — a brak danej jest widoczny. */}
        {doborPrzekladnikow}
        {funkcjeZabezpieczen}
      </section>
    ),
  };
}

function PvInverterCatalogPanel({
  der,
  inverterLabel,
  inverterManufacturer,
  inverterVoltage,
  faultCurrent,
}: {
  readonly der: StationDerConnection;
  readonly inverterLabel: string;
  readonly inverterManufacturer: string | null;
  readonly inverterVoltage: string | null;
  readonly faultCurrent: string;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [certificateRegistry, setCertificateRegistry] = useState(PTPIREE_CERTIFIED_INVERTERS);
  useEffect(() => {
    let mounted = true;
    loadPtpireeCertifiedInverters().then((items) => {
      if (mounted) setCertificateRegistry(items);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const selectedCertificate = getPtpireeCertifiedInverter(
    der.catalogs.ptpiree_certificate_ref,
    certificateRegistry,
  );
  const matchingCertificates = useMemo(
    () => filterPtpireeCertifiedInverters(query, certificateRegistry),
    [certificateRegistry, query],
  );
  const filteredCertificates = matchingCertificates.slice(0, 24);
  const storeDer = useStationDerStore((state) => selectDerById(state, der.id));
  const attachDer = useStationDerStore((state) => state.attachDer);
  const updateDerCatalogs = useStationDerStore((state) => state.updateDerCatalogs);
  const updateDerReadiness = useStationDerStore((state) => state.updateDerReadiness);

  const applyCertificate = useCallback((certificateRef: string) => {
    const nextCatalogs = {
      ...der.catalogs,
      ptpiree_certificate_ref: certificateRef,
    };
    const now = der.updated_at || der.created_at || '1970-01-01T00:00:00Z';

    if (!storeDer) {
      attachDer({
        id: der.id,
        project_id: der.project_id,
        station_id: der.station_id,
        der_kind: der.der_kind,
        name: der.name,
        connection_side: der.connection_side,
        bus_przylaczenia_ref: der.bus_przylaczenia_ref,
        bay_ref: der.bay_ref,
        transformer_ref: der.transformer_ref,
        lv_busbar_ref: der.lv_busbar_ref,
        sn_connection_bus_ref: der.sn_connection_bus_ref,
        sn_connection_point_kind: der.sn_connection_point_kind,
        connection_voltage_kv: der.connection_voltage_kv,
        catalogs: nextCatalogs,
        profiles: der.profiles,
        nominal_power_kw: der.nominal_power_kw,
        created_at: der.created_at || now,
      });
      updateDerReadiness(der.id, der.readiness);
      return;
    }

    updateDerCatalogs(der.id, { ptpiree_certificate_ref: certificateRef }, now);
  }, [attachDer, der, storeDer, updateDerCatalogs, updateDerReadiness]);

  return (
    <section className="space-y-3">
      <div className="rounded border border-scada-border bg-scada-surface/60 p-3">
        <h3 className="text-sm font-semibold text-scada-text">Dobór techniczny falownika</h3>
        <dl className="mt-2">
          <FieldRow label="Falownik / PCS" value={inverterLabel} />
          <FieldRow label="Producent" value={inverterManufacturer ?? MISSING_DASH} />
          <FieldRow label="Napięcie urządzenia" value={inverterVoltage ?? MISSING_DASH} />
          <FieldRow label="Prąd zwarciowy falownika" value={faultCurrent} />
          <FieldRow label="Certyfikat PTPiREE" value={formatPtpireeCertificateLabel(selectedCertificate)} />
          <FieldRow label="Zakres bazy źródłowej" value={ptpireeSourceSummary()} />
        </dl>
        <EngineeringNote>
          Certyfikat PTPiREE potwierdza wpis urządzenia w wykazie NC RfG/WOS. Parametry Un, Sn, Ik, FRT i model dynamiczny nadal muszą pochodzić z karty katalogowej lub typu katalogowego.
        </EngineeringNote>
      </div>

      <div className="rounded border border-scada-border bg-scada-surface/60 p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-scada-text">Certyfikowane falowniki PTPiREE</h3>
            <p className="mt-1 text-[11px] text-scada-muted">
              Pełny indeks lokalny obejmuje {certificateRegistry.length} pozycji falownikowych i konwerterowych z oficjalnych wykazów PTPiREE.
            </p>
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj producenta, modelu, dokumentu..."
            className="min-h-9 w-full rounded border border-scada-border bg-scada-panel px-3 py-1 text-xs text-scada-text outline-none focus:border-cyan-400 md:w-80"
            aria-label="Szukaj w certyfikatach PTPiREE"
          />
        </div>

        <div className="mt-3 text-[11px] text-scada-muted">
          {matchingCertificates.length} wyników; tabela pokazuje pierwsze 24. Użyj wyszukiwarki po producencie, modelu albo numerze dokumentu.
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {PTPIREE_CERTIFIED_DEVICE_SOURCES.map((source) => (
            <a
              key={source.id}
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-scada-border bg-scada-panel p-2 text-xs text-scada-text hover:border-cyan-400"
            >
              <span className="block font-semibold">{source.version} · {source.publishedAt}</span>
              <span className="mt-1 block text-scada-muted">{source.titlePl}</span>
              <span className="mt-1 block text-cyan-200">{source.sourceRecordCount} pozycji w wykazie</span>
            </a>
          ))}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-[11px]">
            <thead className="text-scada-muted">
              <tr className="border-b border-scada-border">
                <th className="py-2 pr-3 font-semibold">Producent / model</th>
                <th className="py-2 pr-3 font-semibold">Dokument</th>
                <th className="py-2 pr-3 font-semibold">WOS / PPM</th>
                <th className="py-2 pr-3 font-semibold">Źródło</th>
                <th className="py-2 text-right font-semibold">Akcja</th>
              </tr>
            </thead>
            <tbody>
              {filteredCertificates.map((item) => {
                const source = getPtpireeSource(item.sourceId);
                const selected = item.id === der.catalogs.ptpiree_certificate_ref;
                return (
                  <tr key={item.id} className="border-b border-scada-border/60 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-scada-text">{item.manufacturer}</div>
                      <div className="text-scada-muted">{item.model}</div>
                      <div className="text-scada-muted/80">{item.deviceKind}</div>
                      <div className="mt-1 text-amber-200">{item.electricalDataStatus === 'requires_datasheet' ? 'wymaga karty katalogowej do parametrów elektrycznych' : ''}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-scada-text">{item.documentNumber}</div>
                      <div className="text-scada-muted">akceptacja: {item.acceptanceDate}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div>{item.wosVersion ?? item.sourceVersion}</div>
                      <div className="text-scada-muted">moduł {item.moduleTypes.length ? item.moduleTypes.join('/') : MISSING_DASH}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <a
                        href={`${item.sourceUrl}#page=${item.sourcePage}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-200 hover:text-cyan-100"
                      >
                        {source?.version ?? item.sourceVersion}, poz. {item.sourceRow}
                      </a>
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => applyCertificate(item.id)}
                        className="rounded border border-scada-border px-2 py-1 text-[11px] font-semibold text-scada-text hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={selected}
                      >
                        {selected ? 'wybrano' : 'zastosuj'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function DerSurfaceShell({
  surface,
  screenCode,
  derKind,
  title,
  testId,
}: DerWrapperProps): JSX.Element {
  const derId = surface.entityRef
    ?? (typeof surface.routeState.payload?.derId === 'string' ? surface.routeState.payload.derId : null);
  const storeDer = useStationDerStore((state) =>
    derId ? selectDerById(state, derId) : null,
  );
  const snapshot = useSnapshotStore((state) => state.snapshot);
  // Karta FAB-J: snapshot audytu 2 pobrany TU (przed jego pierwszym użyciem w
  // `snapshotDer` niżej) — transformatory dedykowane WYŁĄCZNIE z backendu,
  // zero statyku modułowego usuniętego z `catalogs.ts`.
  const blockTransformers = useAudit2CatalogSnapshot().data?.block_transformers ?? [];
  const snapshotDer = useMemo(
    () => buildDerFromGenerator(
      derId ? snapshot?.generators?.find((generator) => generator.ref_id === derId) : null,
      derKind,
      snapshot ?? null,
      blockTransformers,
    ),
    [derId, derKind, snapshot, blockTransformers],
  );
  const surfaceContextDer = useMemo(
    () => buildDerFromSurfaceContext(surface, derKind),
    [derKind, surface],
  );
  const der = storeDer ?? snapshotDer ?? surfaceContextDer;

  // Katalogi przekładników z BACKENDU (V12K-239). Błąd pobrania zostawia listy puste —
  // etykieta pokaże wtedy kreskę („nie wiemy, jak się nazywa"), a nie „wybierz wariant",
  // bo przypisanie w modelu istnieje i podpowiadanie wyboru byłoby nieprawdą.
  const [katalogiWiazan, setKatalogiWiazan] = useState<KatalogiWiazan>({
    ct: [],
    vt: [],
    zabezpieczenia: [],
  });
  useEffect(() => {
    let aktualne = true;
    void (async () => {
      const [ct, vt, zabezpieczenia] = await Promise.all([
        fetchCtTypes().catch(() => [] as CTCatalogType[]),
        fetchVtTypes().catch(() => [] as VTCatalogType[]),
        fetchProtectionDeviceTypes().catch(() => [] as ProtectionDeviceType[]),
      ]);
      if (aktualne) setKatalogiWiazan({ ct, vt, zabezpieczenia });
    })();
    return () => {
      aktualne = false;
    };
  }, []);
  // Karta FAB-J: urządzenia DER (PV/BESS/FW) WYŁĄCZNIE z tego samego pobrania,
  // którego kreator już używa (`fetchDerConverterTypes`, FAB-I) — zero listy
  // lokalnej, zero fabrykowanej nazwy/producenta dla urządzenia nieznanego
  // lokalnie, ale realnie wybranego z katalogu backendu.
  const [converters, setConverters] = useState<readonly ConverterType[]>([]);
  useEffect(() => {
    let aktualne = true;
    void fetchDerConverterTypes()
      .then((items) => { if (aktualne) setConverters(items); })
      .catch(() => { if (aktualne) setConverters([]); });
    return () => {
      aktualne = false;
    };
  }, []);
  // Karta FAB-J: PF curves ze snapshotu audytu 2 (`blockTransformers` już
  // pobrany wyżej) + katalog operatorów NC RfG (profil + ride-through) +
  // katalog baterii BESS — WYŁĄCZNIE z backendu, zero statyku modułowego
  // usuniętego z `catalogs.ts`.
  const pfCurves = useAudit2CatalogSnapshot().data?.pf_curves ?? [];
  const ncRfgOperators = useNcRfgOperatorCatalog().data ?? [];
  const bessBatteries = useBessBatteryTypes().data ?? [];
  // Karta FAB-L: profile dynamiczne DER — WYŁĄCZNIE z backendu, zero statyku
  // modułowego usuniętego z `catalogs.ts` (`DER_DYNAMIC_MODEL_CATALOG`).
  const dynamicProfiles = useDerDynamicProfiles().data ?? [];
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const activeProjectId = useAppStateStore((state) => state.activeProjectId);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const updateDerCatalogsWiazania = useStationDerStore((state) => state.updateDerCatalogs);
  const setSnapshotPoZapisie = useSnapshotStore((state) => state.setSnapshot);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);

  // Gotowosc liczona NA ZYWO z rekordu, kanoniczna regula (V12K-243) — ta sama, ktorej
  // uzywa router przy agregacji. Rekord wzbogacamy o klase przekladnika z REALNEGO
  // katalogu, bo bez niej os zabezpieczen konczy sie kodem „klasy nie da sie ustalic"
  // nawet dla przekladnika, ktory katalog zna (V12K-233/239).
  const wszystkieDery = useStationDerStore((state) => selectAllDers(state));
  const gotowosc = useMemo(() => {
    if (!der) return EMPTY_DER_READINESS;
    const wStacji = wszystkieDery.filter(
      (inny) => inny.station_id === der.station_id && inny.id !== der.id,
    ).length;
    return computeDerReadinessMatrix(wzbogacOKlaseCt(der, katalogiWiazan.ct), {
      otherDersInStation: wStacji,
    });
  }, [der, katalogiWiazan.ct, wszystkieDery]);

  // Tozsamosc mocy i tor mocy — dane modelu, nie stale etykiety (audyt E-21 P2/P3).
  const mocWytworcy = useMemo(
    () => identyfikacjaMocy(
      der ?? { nominal_power_kw: null, unit_count: null },
      der ? mocJednostkiZKatalogu(der, converters) : null,
    ),
    [der, converters],
  );
  // Karta FAB-J: moduł NC RfG oczekiwany dla (moc, napięcie) — klasyfikacja
  // normatywna liczona WYŁĄCZNIE backendem (`compliance/nc_rfg_modul.py`),
  // ekran ją tylko wyświetla. Napięcie: szyna przyłączenia z modelu.
  const moduleTypeQuery = useNcRfgModuleClassification(
    mocWytworcy.mocGrupyKw !== null ? mocWytworcy.mocGrupyKw / 1000 : null,
    der?.connection_voltage_kv ?? null,
  );
  const moduleType = moduleTypeQuery.data ?? null;
  const torWytworcy = useMemo(() => {
    if (!der) return [];
    const nazwaSzyny = (ref: string | null): string | null =>
      ref ? snapshot?.buses?.find((bus) => bus.ref_id === ref)?.name ?? ref : null;
    const stacja = snapshot?.substations?.find(
      (item) => item.ref_id === der.station_id || item.id === der.station_id,
    );
    return torMocy(der, {
      stacja: der.station_id ? publicStationName(snapshot ?? null, stacja ?? null, der.station_id) : null,
      szynaNn: nazwaSzyny(der.lv_busbar_ref),
      transformator: der.transformer_ref
        ? snapshot?.transformers?.find((tr) => tr.ref_id === der.transformer_ref)?.name
          ?? der.transformer_ref
        : null,
      poleSn: der.bay_ref
        ? snapshot?.bays?.find((bay) => bay.ref_id === der.bay_ref)?.name ?? der.bay_ref
        : null,
      pcc: nazwaSzyny(der.bus_przylaczenia_ref),
    });
  }, [der, snapshot]);

  const navigateToStation = useCallback(() => {
    if (!der?.station_id) return;
    openRouteSurface('E-13', {
      entityRef: der.station_id,
      subjectKind: 'helper_context',
    });
  }, [der?.station_id, openRouteSurface]);

  // Edytor wiazan (V12K-242): stan pickera trzyma komponent, wiec `buildDerCards`
  // pozostaje czysta. Po udanym zapisie odswiezamy OBIE strony prawdy — model
  // (snapshot z odpowiedzi operacji) i rekord warsztatu — zeby regula gotowosci
  // przeliczyla sie od razu, bez odswiezania strony.
  const edytorWiazan = useMemo(() => {
    if (!der) return <></>;
    return (
      <DerWiazaniaEditor
        derId={der.id}
        projectId={activeProjectId}
        caseId={activeCaseId}
        wartosci={{
          protection_catalog_ref: der.catalogs.protection_catalog_ref,
          ct_catalog_ref: der.catalogs.ct_catalog_ref,
          vt_catalog_ref: der.catalogs.vt_catalog_ref,
        }}
        etykietaTypu={(pole) => {
          if (pole === 'vt_catalog_ref') {
            return nazwaTypuZKatalogu(katalogiWiazan.vt, der.catalogs.vt_catalog_ref);
          }
          if (pole === 'ct_catalog_ref') {
            return nazwaTypuZKatalogu(katalogiWiazan.ct, der.catalogs.ct_catalog_ref);
          }
          if (pole === 'protection_catalog_ref') {
            return nazwaTypuZKatalogu(
              katalogiWiazan.zabezpieczenia,
              der.catalogs.protection_catalog_ref,
            );
          }
          return null;
        }}
        poZapisie={(pole, ref, odpowiedz) => {
          updateDerCatalogsWiazania(
            der.id,
            { [pole]: ref },
            der.updated_at || der.created_at || '1970-01-01T00:00:00Z',
          );
          // Snapshot podmieniamy TYLKO, gdy operacja go zwrociła. `setSnapshot` wpisuje
          // `response.snapshot` bez warunku, wiec pusta odpowiedz WYKASOWALABY model z
          // ekranu — brak danej nie moze skasowac danych, ktore juz sa.
          if (odpowiedz.snapshot) setSnapshotPoZapisie(odpowiedz);
        }}
      />
    );
  }, [
    activeCaseId,
    activeProjectId,
    der,
    katalogiWiazan,
    setSnapshotPoZapisie,
    updateDerCatalogsWiazania,
  ]);

  // Sekcja funkcji zabezpieczeniowych (E21-3): dobor liczy REGULA DOMENOWA, ekran go
  // pokazuje. Zastapila stala liste 13 kodow ANSI, identyczna dla kazdej instalacji.
  const sekcjaFunkcji = useMemo(() => {
    if (!der) return <></>;
    return (
      <FunkcjeZabezpieczenSekcja
        derId={der.id}
        projectId={activeProjectId}
        caseId={activeCaseId}
      />
    );
  }, [activeCaseId, activeProjectId, der]);

  // Dobor przekladnikow (E21-4): kryteria normowe licza REGULA DOMENOWA na danych toru
  // (prad roboczy z solvera, Ik''/ip z przebiegu zwarciowego) — ekran je pokazuje.
  const sekcjaDoboru = useMemo(() => {
    if (!der) return <></>;
    return (
      <DoborPrzekladnikowSekcja
        derId={der.id}
        projectId={activeProjectId}
        caseId={activeCaseId}
      />
    );
  }, [activeCaseId, activeProjectId, der]);

  // Macierz analiz (E21-2): osie z NAZWANYMI powodami z kanonicznej reguly frontu plus
  // przebiegi z magazynu wykonan. Rekord wzbogacony o klase przekladnika z katalogu,
  // zeby powody byly te same, ktore widzi reszta ekranu.
  const przebiegi = useExecutionRunsStore((state) => state.runs);
  const sekcjaMacierzy = useMemo(() => {
    if (!der) return <></>;
    const wStacji = wszystkieDery.filter(
      (inny) => inny.station_id === der.station_id && inny.id !== der.id,
    ).length;
    const osie = buildAggregatedReadiness(wzbogacOKlaseCt(der, katalogiWiazan.ct), {
      otherDersInStation: wStacji,
    });
    return <MacierzAnalizSekcja wiersze={zlozMacierzAnaliz(osie, przebiegi)} />;
  }, [der, katalogiWiazan.ct, przebiegi, wszystkieDery]);

  const stationContext: DerStationContext | undefined = useMemo(() => {
    if (!der) return undefined;
    const station = snapshot?.substations?.find(
      (item) => item.ref_id === der.station_id || item.id === der.station_id,
    );
    return {
      stationId: der.station_id,
      stationName: publicStationName(snapshot ?? null, station ?? null, der.station_id),
      projectName: publicProjectName(projectName),
      connectionSide: der.connection_side,
      snConnectionPointKind: der.sn_connection_point_kind,
      busPrzylaczeniaRef: der.bus_przylaczenia_ref,
      bayRef: der.bay_ref,
      transformerRef: der.transformer_ref,
      lvBusbarRef: der.lv_busbar_ref,
      onNavigateToStation: navigateToStation,
    };
  }, [der, projectName, navigateToStation, snapshot?.substations]);

  return (
    <div
      data-testid={testId}
      data-station-id={der?.station_id ?? ''}
      className="flex h-full w-full flex-col p-4"
    >
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
          {screenCode} · {title}
        </div>
        <h2 className="mt-1 text-base font-semibold text-scada-text">
          {der?.name ?? 'Układ PV/BESS/FW niewybrany'}
        </h2>
        {!der && (
          <p className="mt-2 rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-3 text-xs text-sygnal-uwaga-tusz">
            Wybierz układ PV/BESS/FW z karty stacji „Układy przyłączeniowe” albo z menu
            kontekstowego SLD, aby otworzyć jego konfigurację przyłączeniową.
          </p>
        )}
        {der === surfaceContextDer && !storeDer && !snapshotDer && (
          <p className="mt-2 rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-3 text-xs text-sygnal-uwaga-tusz">
            Falownik wybrany na schemacie wymaga przypisania kompletnego pakietu
            katalogowego OZE: urządzenia, PCC, toru przyłączenia, profili NC RfG/FRT
            i zabezpieczeń.
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto rounded border border-scada-border bg-scada-panel">
        <DerConfigurator
          derId={derId ?? 'unselected'}
          derKind={derKind}
          stationContext={stationContext}
          children={der ? buildDerCards(
                der,
                mocWytworcy,
                torWytworcy,
                gotowosc,
                edytorWiazan,
                sekcjaFunkcji,
                sekcjaMacierzy,
                sekcjaDoboru,
                { converters, blockTransformers, ncRfgOperators, pfCurves, bessBatteries, dynamicProfiles, moduleType },
              ) : undefined}
        />
      </div>
      {der && (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <DerKpi label="Punkt przyłączenia" value={connectionSidePl(der.connection_side, der.sn_connection_point_kind)} />
          {/* Kafel nazywa POZIOM mocy, ktory pokazuje (V12K-245). „Moc znamionowa" bez
              wskazania, czy chodzi o jednostke czy o cala pozycje, byla dokladnie ta
              dwuznacznoscia, ktora audyt E-21 wskazal w pkt P2. */}
          <DerKpi
            label={mocWytworcy.grupaJednostek ? 'Moc pozycji (grupy)' : 'Moc znamionowa AC'}
            value={mocWytworcy.mocGrupyKw !== null
              ? `${mocWytworcy.mocGrupyKw.toLocaleString('pl-PL')} kW`
              + (mocWytworcy.grupaJednostek ? ` (${mocWytworcy.liczbaJednostek} × jednostka)` : '')
              : MISSING_DASH}
          />
          <DerKpi
            label="Profil NC RfG"
            value={
              der.profiles.nc_rfg_profile_ref
                ? cleanCatalogText(getNcRfgOperator(ncRfgOperators, der.profiles.nc_rfg_profile_ref)?.operator_name_pl ?? MISSING_DASH)
                : MISSING_DASH
            }
          />
          {der.connection_side === 'dedicated_transformer' && (
            <DerKpi label="Transformator blokowy" value={blockTransformerLabel(der, blockTransformers)} />
          )}
        </div>
      )}
    </div>
  );
}

function DerKpi({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded border border-scada-border bg-scada-surface p-2">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-scada-muted">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-scada-text">{cleanCatalogText(value)}</div>
    </div>
  );
}

/**
 * Karta FAB-K (§0 R3, KLASA NIE INSTANCJA): `ConnectionSide` niesie WYŁĄCZNIE
 * poziom (nN / SN przez transformator dedykowany) — dawne pozastacjonarne
 * warianty (`at_zksn`/`at_branch_pole`/`at_cable_joint`) i gołe `'SN'` bez
 * transformatora nie istnieją już jako wartości tego typu. Dla SN etykieta
 * dołącza RODZAJ punktu przyłączenia (`sn_connection_point_kind`) — ta sama
 * informacja, którą kreator DER pokazuje w kroku „Punkt" i w podsumowaniu.
 */
function connectionSidePl(side: ConnectionSide, pointKind: SnConnectionPointKind | null): string {
  if (side === 'nN') return 'po stronie nN';
  const kindLabel = getSnConnectionPointKindLabelPl(pointKind);
  return pointKind ? `transformator dedykowany — ${kindLabel}` : 'transformator dedykowany';
}

export function PvSourceSurface({ surface }: DerSurfaceProps): JSX.Element {
  return (
    <DerSurfaceShell
      surface={surface}
      screenCode="E-21"
      derKind="PV"
      title="Konfigurator falownika PV"
      testId="pv-source-surface"
    />
  );
}

export function BessSurface({ surface }: DerSurfaceProps): JSX.Element {
  return (
    <DerSurfaceShell
      surface={surface}
      screenCode="E-22"
      derKind="BESS"
      title="Konfigurator PCS BESS"
      testId="bess-surface"
    />
  );
}

export function FwSurface({ surface }: DerSurfaceProps): JSX.Element {
  return (
    <DerSurfaceShell
      surface={surface}
      screenCode="E-23"
      derKind="FW"
      title="Konfigurator farmy wiatrowej"
      testId="fw-surface"
    />
  );
}
