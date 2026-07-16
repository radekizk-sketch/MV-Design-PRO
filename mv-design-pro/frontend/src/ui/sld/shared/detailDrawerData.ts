/**
 * F8c pkt 2 (REBUILD_PLAN_V3 §F8c, checklista bramkująca usunięcie v2,
 * pozycja 2 „Drawer szczegółów elementu"): budowniczy danych
 * `SldDetailDrawerData` — WSPÓŁDZIELONY między v2 (`SldWorkspaceContainer.tsx`)
 * i v3 (`SldCanvasV3Workspace.tsx`).
 *
 * ŹRÓDŁO: wyciągnięte z gałęzi `kind === 'station'` funkcji
 * `handleSelectElement` w `v2/canvas/SldWorkspaceContainer.tsx` (budowa
 * `transformerSpec`/`baysSpec`/`nnSpec`/`existingDers` + złożenie payloadu
 * `SldDetailDrawerData`, K30-72/K30-79/K30-80/K30-81/K30-82/K30-84). Funkcje
 * poniżej (`findSubstationByRef`, `selectStationBays`, `buildLiveMetrics`)
 * były wcześniej nieeksportowanymi funkcjami modułowymi w
 * `SldWorkspaceContainer.tsx` — WYCIĄGNIĘTE tu (nie duplikowane): v2 importuje
 * je z powrotem z tego modułu (patrz `SldWorkspaceContainer.tsx` import
 * `useMeasuredSize`-style re-import), zero zmiany zachowania.
 *
 * DLACZEGO BEZPIECZNE DO WYCIĄGNIĘCIA: wejście to WYŁĄCZNIE dane adaptera —
 * `EnergyNetworkModel` (ENM snapshot, WSPÓLNY store `useSnapshotStore`),
 * `SldDataPayload` (`v2/canvas/enmToSldAdapter.ts` — jawnie WSPÓŁDZIELONY
 * per REBUILD_PLAN_V3 §F8c: „poza adapterem elektrycznym
 * enmToSldAdapter.ts/SupplyPathHighlighter.ts — WSPÓŁDZIELONE, ZOSTAJĄ") i
 * `RawOverlayPayload` (`sld-overlay/rawResultOverlayStore`, globalny store
 * zasilany identycznie w obu wersjach kanwy). ZERO odczytu wewnętrznych
 * struktur LAYOUTU v2 (geometria SVG/kamera/hit-testing) — moduł nie
 * importuje niczego z `layout/`, `compose/`, `scene/`.
 *
 * LUKA UDOKUMENTOWANA (celowo NIE wyciągnięta tu): pozostałe ~14 gałęzi
 * `kind` w `handleSelectElement` (`node`/`zksn`/`branch_pole`, `cable_run`,
 * `bay`, `apparatus`, `transformer`, `der`, `gpz`, `lv_breaker`,
 * `protection`, `pv_inverter`, `pcc`, `der_block_transformer`,
 * `der_pcc_bay`, `section`) NIE zostały tu przeniesione — w
 * `SldWorkspaceContainer.tsx` są ENTANGLED z lokalnym stanem komponentu v2
 * (przechwytywanie klika stacji podczas `derDrag.state` — K30-78, sekwencja
 * `setDetailDrawerData`/`selectElement`/`collapseSurfaceStackTo`,
 * wielokrotne early-return per gałąź). Same BUDOWANE DANE per gałąź czytają
 * też wyłącznie adapter (ta sama własność co `station`), ale mechaniczne
 * wyciągnięcie WSZYSTKICH ~600 linii bez regresji v2 (parytet blokerów/
 * fallbacków per gałąź) to osobny, większy refaktor — poza budżetem
 * zadania F11.4-A (ono domyka checklistę F8c, nie robi pełnej migracji
 * drawera). Dlatego v3 (`SldCanvasV3Workspace`) pokazuje drawer WYŁĄCZNIE
 * dla `elementKind === 'station'` — inne `elementKind` → brak drawera
 * (uczciwy brak danych, NIE pusty/crashujący UI).
 */
import type { Bay, EnergyNetworkModel, Substation } from '../../../types/enm';
import { formatStationSwitchgearDescriptionPl } from '../../shared/stationTypeLabels';
import { stationPublicIdentity } from '../../shared/publicTechnicalLabels';
import { selectStationDistributionTransformers } from '../../network-build/stationTransformerSelection';
import { getMetric, formatMetric, type RawOverlayPayload } from '../../sld-overlay/rawResultOverlayStore';
import type { SldDataPayload } from '../v2/canvas/enmToSldAdapter';
import type { SldDetailDrawerData } from '../v2/canvas/SldDetailDrawer';

export function findSubstationByRef(
  snapshot: EnergyNetworkModel | null,
  substationRef: string,
): Substation | null {
  return (
    (snapshot?.substations ?? []).find(
      (substation) => substation.ref_id === substationRef || substation.id === substationRef,
    ) ?? null
  );
}

export function selectStationBays(
  snapshot: EnergyNetworkModel | null,
  station: Substation | null,
): Bay[] {
  if (!snapshot || !station) return [];
  return (snapshot.bays ?? []).filter((bay) => bay.substation_ref === station.ref_id);
}

/**
 * K30-84: Build live metrics chips (V/U_pu/P/Q/I) for selected element z
 * RawOverlayPayload (LF/SC). Returns empty array gdy brak payload lub brak
 * matching element ref. Element id mapping: station → '{id}/sn_bus' za snBusRef.
 */
export function buildLiveMetrics(
  payload: RawOverlayPayload | null,
  drawerKind: SldDetailDrawerData['kind'],
  elementId: string,
  nominalKv: number | null,
): SldDetailDrawerData['liveMetrics'] {
  if (!payload) return undefined;
  // Station → check SN bus metrics (U_kV, U_pu)
  if (drawerKind === 'station') {
    const snBusRef = elementId.endsWith('/station')
      ? `${elementId.slice(0, -'/station'.length)}/sn_bus`
      : `${elementId}/sn_bus`;
    const uKv = getMetric(payload, snBusRef, 'U_kV');
    const uPu = getMetric(payload, snBusRef, 'U_pu');
    const chips: Array<{ label: string; value: string; color?: string }> = [];
    if (uKv) chips.push({ label: 'U', value: formatMetric(uKv) });
    if (uPu) {
      const dev = uPu.value != null ? (uPu.value - 1) * 100 : null;
      const color = dev == null ? undefined
        : Math.abs(dev) <= 5 ? '#13C45A'
        : Math.abs(dev) <= 10 ? '#FFD166'
        : '#F25F5F';
      chips.push({ label: 'U_pu', value: formatMetric(uPu), color });
    }
    if (chips.length === 0 && nominalKv != null) {
      return undefined;
    }
    return chips.length > 0 ? chips : undefined;
  }
  // DER/Bay/Apparatus → check payload direct element ref
  const el = payload.elements[elementId];
  if (!el) return undefined;
  const chips: Array<{ label: string; value: string }> = [];
  for (const code of ['P_MW', 'Q_Mvar', 'I_A', 'U_kV']) {
    const m = el.metrics?.[code];
    if (m) chips.push({ label: code.split('_')[0], value: formatMetric(m) });
  }
  return chips.length > 0 ? chips : undefined;
}

const GEN_TYPE_TO_DER_KIND: Readonly<Record<string, 'PV' | 'BESS' | 'FW'>> = {
  pv_inverter: 'PV',
  bess: 'BESS',
  wind_inverter: 'FW',
  fw_pmsg: 'FW',
  fw_dfig: 'FW',
  fw_scig: 'FW',
};

/**
 * Buduje `SldDetailDrawerData` dla kliku w STACJĘ (kind='station', K30-72).
 * Odpowiednik gałęzi `drawerKind === 'station'` w
 * `SldWorkspaceContainer.handleSelectElement` — patrz nagłówek modułu dla
 * pełnego uzasadnienia i zakresu (WYŁĄCZNIE stacja, nie inne kind).
 *
 * `stationId` musi być realnym refem stacji (ENM `Substation.ref_id`/`id`
 * LUB `SldDataPayload.stations[].id` — oba adaptery używają tej samej
 * konwencji referencji). Zwraca `null` WYŁĄCZNIE gdy stacja nie istnieje w
 * ŻADNYM z dwóch źródeł (ani ENM, ani `sldData`) — uczciwy brak, wołający
 * nie powinien otwierać drawera.
 */
export function buildStationDetailDrawerData(
  snapshot: EnergyNetworkModel | null,
  sldData: SldDataPayload,
  overlayPayload: RawOverlayPayload | null,
  stationId: string,
): SldDetailDrawerData | null {
  const substation = findSubstationByRef(snapshot, stationId);
  const stationForDrawer = sldData.stations.find((s) => s.id === stationId);
  if (!substation && !stationForDrawer) return null;

  const stationLabelOverride = substation && snapshot
    ? stationPublicIdentity(snapshot, substation).displayName
    : null;
  const switchgearDescription = formatStationSwitchgearDescriptionPl(substation?.station_type);

  const transformers = selectStationDistributionTransformers(snapshot, substation ?? null);
  const tr = transformers[0];
  let transformerSpec: SldDetailDrawerData['transformerSpec'] = null;
  if (tr) {
    const transformerBlockers: string[] = [];
    if (!tr.catalog_ref) transformerBlockers.push('Brak pozycji katalogowej transformatora.');
    if (typeof tr.uk_percent !== 'number') transformerBlockers.push('Brak napięcia zwarcia u_k%.');
    if (!tr.vector_group) transformerBlockers.push('Brak grupy połączeń.');
    if (typeof tr.pk_kw !== 'number') transformerBlockers.push('Brak strat obciążeniowych Pk.');
    transformerSpec = {
      ref: tr.ref_id ?? tr.id ?? null,
      name: tr.name ?? null,
      vectorGroup: tr.vector_group ?? null,
      snMva: typeof tr.sn_mva === 'number' ? tr.sn_mva : null,
      uhvKv: typeof tr.uhv_kv === 'number' ? tr.uhv_kv : null,
      ulvKv: typeof tr.ulv_kv === 'number' ? tr.ulv_kv : null,
      ukPercent: typeof tr.uk_percent === 'number' ? tr.uk_percent : null,
      pkKw: typeof tr.pk_kw === 'number' ? tr.pk_kw : null,
      catalogRef: tr.catalog_ref ?? null,
      dataQuality: 'model',
      blockers: transformerBlockers,
    };
  } else if (stationForDrawer?.transformerRatedKva != null || stationForDrawer?.transformerRefs?.length) {
    const fallbackSnMva = stationForDrawer.transformerRatedKva != null
      ? stationForDrawer.transformerRatedKva / 1000
      : null;
    transformerSpec = {
      ref: stationForDrawer.transformerRefs?.[0] ?? null,
      name: stationForDrawer.transformerRefs?.[0] ? 'Transformator SN/nN stacji' : null,
      vectorGroup: stationForDrawer.transformerVectorGroup ?? null,
      snMva: fallbackSnMva,
      uhvKv: stationForDrawer.busVoltageKv ?? null,
      ulvKv: 0.4,
      ukPercent: null,
      pkKw: null,
      catalogRef: null,
      dataQuality: 'sld_fallback',
      blockers: [
        'Widok SLD ma dane transformatora, ale rekord ENM/katalog nie został znaleziony dla tej stacji.',
      ],
    };
  }

  const bays = selectStationBays(snapshot, substation ?? null);
  const baysSpec: SldDetailDrawerData['baysSpec'] = bays.map((b) => ({
    id: b.ref_id ?? b.id,
    name: b.name ?? null,
    bayRole: b.bay_role ?? null,
    bayNumber: b.bay_number ?? null,
    feederShortName: b.feeder_short_name ?? null,
  }));

  // K30-81: LV bus + loads na nim.
  const lvBusRef = tr?.lv_bus_ref ?? null;
  const lvBus = lvBusRef && snapshot
    ? (snapshot.buses ?? []).find((b) => b.ref_id === lvBusRef || b.id === lvBusRef)
    : null;
  const loadsOnLv = lvBusRef && snapshot
    ? (snapshot.loads ?? []).filter((l) => l.bus_ref === lvBusRef)
    : [];
  const nnSpec: SldDetailDrawerData['nnSpec'] = {
    busVoltageKv: lvBus?.voltage_kv ?? tr?.ulv_kv ?? null,
    loads: loadsOnLv.map((l) => ({
      id: l.ref_id ?? l.id,
      name: l.name ?? null,
      pKw: typeof l.p_mw === 'number' ? l.p_mw * 1000 : null,
      qKvar: typeof l.q_mvar === 'number' ? l.q_mvar * 1000 : null,
    })),
  };

  // K30-82: existing DERs — generators with station_ref == substation.
  const substationRef = substation?.ref_id ?? substation?.id ?? stationId;
  const dersOnStation = snapshot ? (snapshot.generators ?? []).filter(
    (g) => g.station_ref === substationRef,
  ) : [];
  const existingDers: SldDetailDrawerData['existingDers'] = dersOnStation.map((g) => ({
    id: g.ref_id ?? g.id,
    kind: g.gen_type ? GEN_TYPE_TO_DER_KIND[g.gen_type] ?? null : null,
    name: g.name ?? null,
    pMw: typeof g.p_mw === 'number' ? g.p_mw : null,
  }));

  return {
    kind: 'station',
    menuKind: 'station',
    elementId: stationId,
    label: stationLabelOverride
      ?? stationForDrawer?.name
      ?? stationForDrawer?.stationCode
      ?? stationId.split('/').pop()
      ?? stationId,
    voltageKv: transformerSpec?.uhvKv ?? stationForDrawer?.busVoltageKv ?? null,
    stationCode: stationForDrawer?.stationCode ?? null,
    accentColor: '#7EC8FF',
    transformerSpec,
    baysSpec,
    switchgearDescription,
    nnSpec,
    existingDers,
    liveMetrics: buildLiveMetrics(overlayPayload, 'station', stationId, stationForDrawer?.busVoltageKv ?? null),
    alarmSeverity: stationForDrawer?.alarmSeverity ?? null,
  };
}
