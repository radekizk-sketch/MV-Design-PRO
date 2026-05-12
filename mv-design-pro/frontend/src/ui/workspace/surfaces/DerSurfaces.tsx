/**
 * Powierzchnie E-21/E-22/E-23 dla źródeł i magazynów energii.
 *
 * Ten widok jest kartą inżynierską urządzenia przyłączonego do stacji:
 * falownika PV, PCS BESS albo turbiny/regulatora farmy wiatrowej. Dane
 * prezentowane są z katalogów i profili zgodności, bez surowych identyfikatorów
 * jako podstawowej treści UI.
 */

import { useCallback, useMemo } from 'react';

import { useAppStateStore } from '../../app-state';
import {
  DerConfigurator,
  type DerCardId,
  type DerKind,
  type DerStationContext,
} from '../../network-build/der-configurator/DerConfigurator';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import {
  BESS_BATTERY_CATALOG,
  BESS_PCS_CATALOG,
  CT_CATALOG,
  DER_DYNAMIC_MODEL_CATALOG,
  DER_FAULT_CURRENT_DATA_CATALOG,
  EMPTY_DER_CATALOGS,
  EMPTY_DER_PROFILES,
  EMPTY_DER_READINESS,
  HVRT_CURVE_CATALOG,
  LVRT_CURVE_CATALOG,
  NC_RFG_PROFILE_CATALOG,
  PF_CURVE_CATALOG,
  PROTECTION_FUNCTION_CATALOG,
  PV_INVERTER_CATALOG,
  VT_CATALOG,
  WIND_TURBINE_CATALOG,
  getNcRfgProfile,
  selectDerById,
  useStationDerStore,
} from '../../network-build/station-der';
import type {
  ConnectionSide,
  DerCompleteness,
  DerReadinessMatrix,
  ReadinessAxisStatus,
  StationDerConnection,
} from '../../network-build/station-der';
import { MISSING_DASH } from '../../shared/formatPolishValue';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { Generator } from '../../../types/enm';
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

type CatalogItem = {
  readonly id: string;
  readonly label_pl: string;
};

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
function catalogLabel<T extends CatalogItem>(
  catalog: readonly T[],
  id: string | null | undefined,
): string {
  if (!id) return 'brak danych katalogowych';
  const item = catalog.find((entry) => entry.id === id);
  return item ? cleanCatalogText(item.label_pl) : 'brak danych katalogowych';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

function connectionSideFromGenerator(generator: Generator): ConnectionSide {
  switch (generator.connection_variant) {
    case 'DEDICATED_MV_CONNECTION':
    case 'block_transformer':
      return 'dedicated_transformer';
    case 'SOURCE_CONNECTION_STATION':
      return 'SN';
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

function buildReadinessForGenerator(generator: Generator): DerReadinessMatrix {
  const hasCatalog = Boolean(generator.catalog_ref);
  const profiles = profileRecordFromGenerator(generator);
  const hasNcRfg = Boolean(stringFromRecord(profiles, ['nc_rfg_profile_ref', 'nc_rfg', 'ncrfg']));
  const hasFrt = Boolean(stringFromRecord(profiles, ['lvrt_curve_ref', 'lvrt']))
    && Boolean(stringFromRecord(profiles, ['hvrt_curve_ref', 'hvrt']));
  return {
    ...EMPTY_DER_READINESS,
    equipment: hasCatalog ? 'ready' : 'blocked',
    sc_3f: hasCatalog ? 'partial' : 'blocked',
    sc_1f: hasCatalog ? 'partial' : 'blocked',
    sc_2f: hasCatalog ? 'partial' : 'blocked',
    sc_2fg: hasCatalog ? 'partial' : 'blocked',
    vdrop: hasCatalog ? 'ready' : 'blocked',
    q_u: hasNcRfg ? 'ready' : 'blocked',
    protection: hasCatalog ? 'partial' : 'blocked',
    protection_selectivity: hasCatalog ? 'partial' : 'blocked',
    frt: hasFrt ? 'ready' : 'blocked',
    hvrt: hasFrt ? 'ready' : 'blocked',
    nc_rfg: hasNcRfg ? 'ready' : 'blocked',
    report_osd: hasNcRfg ? 'partial' : 'blocked',
    report_technical: hasCatalog ? 'partial' : 'blocked',
  };
}

function buildDerFromGenerator(
  generator: Generator | null | undefined,
  fallbackKind: DerKind,
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
  const pccRef = stringFromRecord(materialized, ['pcc_ref', 'pcc'])
    ?? stringFromRecord(meta, ['pcc_ref', 'pcc'])
    ?? generator.bus_ref
    ?? null;
  const transformerRef = stringFromRecord(materialized, ['transformer_ref', 'station_transformer_ref'])
    ?? stringFromRecord(meta, ['transformer_ref', 'station_transformer_ref'])
    ?? (connectionSide === 'dedicated_transformer' ? `tr_${generator.ref_id}` : null);
  const lvBusbarRef = stringFromRecord(materialized, ['lv_busbar_ref', 'lv_bus_ref'])
    ?? stringFromRecord(meta, ['lv_busbar_ref', 'lv_bus_ref'])
    ?? (connectionSide === 'nN' ? generator.bus_ref ?? null : null);
  const ncRfgRef = stringFromRecord(profiles, ['nc_rfg_profile_ref', 'nc_rfg', 'ncrfg']);
  const catalogRef = generator.catalog_ref ?? stringFromRecord(materialized, ['device_catalog_ref']);
  const completeness: DerCompleteness = !pccRef
    ? 'no_pcc'
    : !catalogRef
      ? 'missing_catalog'
      : !ncRfgRef
        ? 'missing_profile'
        : 'complete';

  return {
    id: generator.ref_id,
    project_id: 'snapshot',
    station_id: stationRef,
    der_kind: fallbackKind,
    name: generator.name || generator.ref_id,
    connection_side: connectionSide,
    pcc_ref: pccRef,
    bay_ref: stringFromRecord(materialized, ['bay_ref']) ?? stringFromRecord(meta, ['bay_ref']),
    transformer_ref: transformerRef,
    lv_busbar_ref: lvBusbarRef,
    connection_node_ref: stringFromRecord(materialized, ['connection_node_ref'])
      ?? stringFromRecord(meta, ['connection_node_ref']),
    internal_cable_ref: stringFromRecord(materialized, ['internal_cable_ref'])
      ?? stringFromRecord(meta, ['internal_cable_ref']),
    voltage_level_ref: stringFromRecord(materialized, ['voltage_level_ref'])
      ?? stringFromRecord(meta, ['voltage_level_ref']),
    catalogs: {
      ...EMPTY_DER_CATALOGS,
      device_catalog_ref: catalogRef,
      controller_catalog_ref: stringFromRecord(materialized, ['controller_catalog_ref'])
        ?? stringFromRecord(meta, ['controller_catalog_ref']),
      battery_catalog_ref: stringFromRecord(materialized, ['battery_catalog_ref'])
        ?? stringFromRecord(meta, ['battery_catalog_ref']),
      protection_catalog_ref: stringFromRecord(materialized, ['protection_catalog_ref'])
        ?? stringFromRecord(meta, ['protection_catalog_ref']),
      ct_catalog_ref: stringFromRecord(materialized, ['ct_catalog_ref']) ?? stringFromRecord(meta, ['ct_catalog_ref']),
      vt_catalog_ref: stringFromRecord(materialized, ['vt_catalog_ref']) ?? stringFromRecord(meta, ['vt_catalog_ref']),
      dynamic_model_ref: stringFromRecord(materialized, ['dynamic_model_ref'])
        ?? stringFromRecord(meta, ['dynamic_model_ref']),
      fault_current_data_ref: stringFromRecord(materialized, ['fault_current_data_ref'])
        ?? stringFromRecord(meta, ['fault_current_data_ref']),
    },
    profiles: {
      ...EMPTY_DER_PROFILES,
      nc_rfg_profile_ref: ncRfgRef,
      lvrt_curve_ref: stringFromRecord(profiles, ['lvrt_curve_ref', 'lvrt']),
      hvrt_curve_ref: stringFromRecord(profiles, ['hvrt_curve_ref', 'hvrt']),
      regulation_profile_ref: stringFromRecord(profiles, ['regulation_profile_ref', 'q_u_curve_ref']),
      pf_curve_ref: stringFromRecord(profiles, ['pf_curve_ref', 'p_f_curve_ref', 'pf']),
    },
    nominal_power_kw: typeof generator.p_mw === 'number' ? Math.round(generator.p_mw * 1000) : null,
    completeness,
    readiness: buildReadinessForGenerator(generator),
    created_at: '',
    updated_at: '',
  };
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
    pcc_ref: null,
    bay_ref: null,
    transformer_ref: null,
    lv_busbar_ref: null,
    connection_node_ref: null,
    internal_cable_ref: null,
    voltage_level_ref: null,
    catalogs: { ...EMPTY_DER_CATALOGS },
    profiles: { ...EMPTY_DER_PROFILES },
    nominal_power_kw: null,
    completeness: 'no_pcc',
    readiness: { ...EMPTY_DER_READINESS },
    created_at: '',
    updated_at: '',
  };
}

function findDeviceLabel(der: StationDerConnection): string {
  if (der.der_kind === 'PV') return catalogLabel(PV_INVERTER_CATALOG, der.catalogs.device_catalog_ref);
  if (der.der_kind === 'BESS') return catalogLabel(BESS_PCS_CATALOG, der.catalogs.device_catalog_ref);
  return catalogLabel(WIND_TURBINE_CATALOG, der.catalogs.device_catalog_ref);
}

function findPvInverter(der: StationDerConnection) {
  return PV_INVERTER_CATALOG.find((item) => item.id === der.catalogs.device_catalog_ref) ?? null;
}

function findDeviceNominalPower(der: StationDerConnection): number | null {
  if (der.nominal_power_kw !== null) return der.nominal_power_kw;
  if (der.der_kind === 'PV') return findPvInverter(der)?.nominal_power_kw ?? null;
  if (der.der_kind === 'BESS') {
    return BESS_PCS_CATALOG.find((item) => item.id === der.catalogs.device_catalog_ref)?.nominal_power_kw
      ?? null;
  }
  return WIND_TURBINE_CATALOG.find((item) => item.id === der.catalogs.device_catalog_ref)?.nominal_power_kw
    ?? null;
}

function dynamicModelLabel(der: StationDerConnection): string {
  const selected = DER_DYNAMIC_MODEL_CATALOG.find((item) => item.id === der.catalogs.dynamic_model_ref)
    ?? DER_DYNAMIC_MODEL_CATALOG.find((item) =>
      der.catalogs.device_catalog_ref ? item.applicable_device_ids.includes(der.catalogs.device_catalog_ref) : false,
    );
  return selected ? cleanCatalogText(selected.label_pl) : 'brak modelu dynamicznego';
}

function faultCurrentLabel(der: StationDerConnection): string {
  const selected = DER_FAULT_CURRENT_DATA_CATALOG.find((item) => item.id === der.catalogs.fault_current_data_ref)
    ?? DER_FAULT_CURRENT_DATA_CATALOG.find((item) =>
      der.catalogs.device_catalog_ref ? item.applicable_device_ids.includes(der.catalogs.device_catalog_ref) : false,
    );
  return selected ? cleanCatalogText(selected.label_pl) : 'wynik zablokowany do czasu wyboru danych zwarciowych';
}

function rideThroughLabel(kind: 'LVRT' | 'HVRT', ref: string | null): string {
  const catalog = kind === 'LVRT' ? LVRT_CURVE_CATALOG : HVRT_CURVE_CATALOG;
  const item = catalog.find((entry) => entry.id === ref);
  return item ? `${kind}: ${item.operator_code}, moduł ${item.module_type}` : 'brak danych';
}

function pfCurveLabel(ref: string | null): string {
  const item = PF_CURVE_CATALOG.find((entry) => entry.id === ref);
  return item ? cleanCatalogText(item.label_pl) : 'brak danych';
}

function moduleTypeLabel(der: StationDerConnection): string {
  const inverter = findPvInverter(der);
  const profile = der.profiles.nc_rfg_profile_ref ? getNcRfgProfile(der.profiles.nc_rfg_profile_ref) : null;
  const module = inverter?.applicable_module_types[0] ?? profile?.applicable_module_types[0] ?? null;
  return module ? `moduł ${module}` : 'brak danych';
}

function readinessPl(value: ReadinessAxisStatus): string {
  switch (value) {
    case 'ready':
      return 'gotowe';
    case 'partial':
      return 'wynik częściowy';
    case 'blocked':
      return 'wynik zablokowany';
    case 'not_applicable':
      return 'nie dotyczy';
    case 'no_module':
      return 'brak modułu obliczeniowego';
  }
}

function completenessPl(value: DerCompleteness): string {
  switch (value) {
    case 'complete':
      return 'kompletne';
    case 'partial':
      return 'wynik częściowy';
    case 'missing_catalog':
      return 'brak danych katalogowych';
    case 'missing_profile':
      return 'brak profilu zgodności przyłączeniowej';
    case 'voltage_mismatch':
      return 'niezgodność napięcia';
    case 'no_pcc':
      return 'brak punktu przyłączenia';
  }
}

function pccPathLabel(der: StationDerConnection): string {
  if (der.connection_side === 'nN') return 'falownik → wyłącznik nN → szyna nN → transformator SN/nN → pole SN';
  if (der.connection_side === 'SN') return 'falownik/transformator → pole SN → szyna SN';
  if (der.connection_side === 'dedicated_transformer') return 'falownik → transformator blokowy → pole SN dedykowane';
  if (der.connection_side === 'at_zksn') return 'źródło → ZK SN → ciąg główny SN';
  if (der.connection_side === 'at_branch_pole') return 'źródło → słup rozgałęźny → ciąg główny SN';
  return 'źródło → mufa kablowa → ciąg główny SN';
}

function derProtectionSummary(): string {
  return PROTECTION_FUNCTION_CATALOG
    .filter((item) => item.required_for_der)
    .map((item) => item.ansi_code)
    .join(', ');
}

function assignedLabel(value: string | null | undefined, label: string): string {
  return value ? label : 'brak danych';
}

function FieldRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-[170px_1fr] gap-3 border-b border-scada-border/60 py-1.5 last:border-b-0">
      <dt className="text-scada-muted">{label}</dt>
      <dd className="font-medium text-scada-text">{value}</dd>
    </div>
  );
}

function EngineeringNote({ children }: { readonly children: string }) {
  return (
    <p className="mt-3 border-l-2 border-cyan-400 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
      {children}
    </p>
  );
}

function buildDerCards(der: StationDerConnection): Partial<Record<DerCardId, JSX.Element>> {
  const ncRfg = der.profiles.nc_rfg_profile_ref
    ? NC_RFG_PROFILE_CATALOG.find((profile) => profile.id === der.profiles.nc_rfg_profile_ref)
    : null;
  const inverter = findPvInverter(der);
  const devicePower = findDeviceNominalPower(der);
  const faultCurrent = inverter?.fault_current_capability_pu
    ? `${inverter.fault_current_capability_pu.toFixed(2)} × In`
    : MISSING_DASH;

  return {
    basic: (
      <section>
        <dl>
          <FieldRow label="Nazwa źródła" value={der.name} />
          <FieldRow
            label="Punkt przyłączenia"
            value={assignedLabel(der.pcc_ref, 'PCC przypisany do toru przyłączenia')}
          />
          <FieldRow label="Moc znamionowa AC" value={devicePower !== null ? `${devicePower} kW` : 'brak danych'} />
          <FieldRow label="Urządzenie katalogowe" value={findDeviceLabel(der)} />
          <FieldRow label="Moduł NC RfG" value={moduleTypeLabel(der)} />
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
          <FieldRow label="Strona przyłączenia" value={connectionSidePl(der.connection_side)} />
          <FieldRow label="Tor mocy" value={pccPathLabel(der)} />
          <FieldRow label="Pole SN" value={assignedLabel(der.bay_ref, 'pole SN przypisane')} />
          <FieldRow label="Szyna nN" value={assignedLabel(der.lv_busbar_ref, 'szyna nN przypisana')} />
          <FieldRow label="Transformator" value={assignedLabel(der.transformer_ref, 'transformator przypisany')} />
        </dl>
        <EngineeringNote>
          Dla PV za transformatorem SN/nN wymagane są klikalne aparaty po stronie SN, transformator, szyna nN oraz wyłącznik nN chroniący falownik.
        </EngineeringNote>
      </section>
    ),
    inverters: (
      <section>
        <dl>
          <FieldRow label={der.der_kind === 'FW' ? 'Turbina z katalogu' : 'Falownik / PCS'} value={findDeviceLabel(der)} />
          <FieldRow label="Producent" value={inverter?.manufacturer ?? MISSING_DASH} />
          <FieldRow
            label="Napięcie urządzenia"
            value={inverter ? `${inverter.nominal_voltage_kv} kV` : MISSING_DASH}
          />
          <FieldRow label="Prąd zwarciowy falownika" value={faultCurrent} />
          <FieldRow label="Bateria BESS" value={catalogLabel(BESS_BATTERY_CATALOG, der.catalogs.battery_catalog_ref)} />
          <FieldRow
            label="Regulator źródła"
            value={assignedLabel(der.catalogs.controller_catalog_ref, 'regulator przypisany z katalogu')}
          />
        </dl>
      </section>
    ),
    'plant-controller': (
      <section>
        <dl>
          <FieldRow
            label="Charakterystyka Q(U)"
            value={ncRfg ? `${ncRfg.operator_code}: martwa strefa ${ncRfg.q_u_deadzone_percent}%` : 'brak danych'}
          />
          <FieldRow label="Charakterystyka P(f)" value={pfCurveLabel(der.profiles.pf_curve_ref)} />
          <FieldRow
            label="Zakres cos φ"
            value={ncRfg ? `min. ${ncRfg.cos_phi_min_lagging.toFixed(2)}` : 'brak danych'}
          />
          <FieldRow label="Ograniczenie eksportu" value="do wyznaczenia w rozpływie mocy" />
        </dl>
      </section>
    ),
    'frt-hvrt': (
      <section>
        <dl>
          <FieldRow label="LVRT" value={rideThroughLabel('LVRT', der.profiles.lvrt_curve_ref)} />
          <FieldRow label="HVRT" value={rideThroughLabel('HVRT', der.profiles.hvrt_curve_ref)} />
          <FieldRow label="Model dynamiczny" value={dynamicModelLabel(der)} />
          <FieldRow label="Status FRT" value={readinessPl(der.readiness.frt)} />
          <FieldRow label="Status HVRT" value={readinessPl(der.readiness.hvrt)} />
        </dl>
      </section>
    ),
    ncrfg: (
      <section>
        <dl>
          <FieldRow
            label="Profil zgodności"
            value={ncRfg ? cleanCatalogText(ncRfg.label_pl) : 'brak danych'}
          />
          <FieldRow label="P(f)" value={pfCurveLabel(der.profiles.pf_curve_ref)} />
          <FieldRow label="Model zwarciowy" value={faultCurrentLabel(der)} />
          <FieldRow
            label="Minimalna moc zwarciowa PCC"
            value={ncRfg ? `${moduleTypeLabel(der)}: wg profilu ${ncRfg.operator_code}` : 'brak danych'}
          />
          <FieldRow label="Zgodność przyłączeniowa" value={readinessPl(der.readiness.nc_rfg)} />
        </dl>
      </section>
    ),
    readiness: (
      <section>
        <dl>
          <FieldRow label="Kompletność konfiguracji" value={completenessPl(der.completeness)} />
          <FieldRow label="Zwarcie 3-fazowe" value={readinessPl(der.readiness.sc_3f)} />
          <FieldRow label="Zwarcie doziemne" value={readinessPl(der.readiness.sc_1f)} />
          <FieldRow label="Rozpływ mocy" value={readinessPl(der.readiness.vdrop)} />
          <FieldRow label="Regulacja Q(U)" value={readinessPl(der.readiness.q_u)} />
          <FieldRow label="Zabezpieczenia DER" value={readinessPl(der.readiness.protection)} />
          <FieldRow label="Selektywność" value={readinessPl(der.readiness.protection_selectivity)} />
          <FieldRow label="Funkcje ANSI wymagane" value={derProtectionSummary()} />
          <FieldRow label="Przekładnik CT" value={catalogLabel(CT_CATALOG, der.catalogs.ct_catalog_ref)} />
          <FieldRow label="Przekładnik VT" value={catalogLabel(VT_CATALOG, der.catalogs.vt_catalog_ref)} />
          <FieldRow label="Raport OSD" value={readinessPl(der.readiness.report_osd)} />
          <FieldRow label="Raport techniczny" value={readinessPl(der.readiness.report_technical)} />
        </dl>
      </section>
    ),
  };
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
  const snapshotDer = useMemo(
    () => buildDerFromGenerator(
      derId ? snapshot?.generators?.find((generator) => generator.ref_id === derId) : null,
      derKind,
    ),
    [derId, derKind, snapshot?.generators],
  );
  const surfaceContextDer = useMemo(
    () => buildDerFromSurfaceContext(surface, derKind),
    [derKind, surface],
  );
  const der = storeDer ?? snapshotDer ?? surfaceContextDer;
  const projectName = useAppStateStore((state) => state.activeProjectName);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);

  const navigateToStation = useCallback(() => {
    if (!der?.station_id) return;
    openRouteSurface('E-13', {
      entityRef: der.station_id,
      subjectKind: 'helper_context',
    });
  }, [der?.station_id, openRouteSurface]);

  const stationContext: DerStationContext | undefined = useMemo(() => {
    if (!der) return undefined;
    const station = snapshot?.substations?.find(
      (item) => item.ref_id === der.station_id || item.id === der.station_id,
    );
    return {
      stationId: der.station_id,
      stationName: station?.name ?? der.station_id,
      projectName: projectName ?? undefined,
      connectionSide: der.connection_side,
      pccRef: der.pcc_ref,
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
          {der?.name ?? 'Źródło niewybrane'}
        </h2>
        {!der && (
          <p className="mt-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
            Brak referencji do źródła OZE w kontekście. Otwórz konfigurator z poziomu
            karty stacji „Źródła i magazyny” albo z menu kontekstowego SLD.
          </p>
        )}
        {der === surfaceContextDer && !storeDer && !snapshotDer && (
          <p className="mt-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-xs text-amber-200">
            Falownik wybrany na schemacie, ale brakuje pełnego wpisu OZE w modelu.
            Uzupełnij katalog, PCC, tor przyłączenia, profile NC RfG/FRT i zabezpieczenia.
          </p>
        )}
      </div>
      <div className="flex-1 overflow-auto rounded border border-scada-border bg-scada-panel">
        <DerConfigurator
          derId={derId ?? 'unselected'}
          derKind={derKind}
          stationContext={stationContext}
          children={der ? buildDerCards(der) : undefined}
        />
      </div>
      {der && (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <DerKpi label="Punkt przyłączenia" value={connectionSidePl(der.connection_side)} />
          <DerKpi
            label="Moc znamionowa"
            value={findDeviceNominalPower(der) !== null ? `${findDeviceNominalPower(der)} kW` : MISSING_DASH}
          />
          <DerKpi
            label="Profil NC RfG"
            value={
              der.profiles.nc_rfg_profile_ref
                ? cleanCatalogText(getNcRfgProfile(der.profiles.nc_rfg_profile_ref)?.label_pl ?? MISSING_DASH)
                : MISSING_DASH
            }
          />
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

function connectionSidePl(side: ConnectionSide): string {
  switch (side) {
    case 'SN':
      return 'po stronie SN';
    case 'nN':
      return 'po stronie nN';
    case 'dedicated_transformer':
      return 'transformator dedykowany';
    case 'at_zksn':
      return 'na ZK SN';
    case 'at_branch_pole':
      return 'na słupie rozgałęźnym';
    case 'at_cable_joint':
      return 'na mufie kablowej';
  }
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
