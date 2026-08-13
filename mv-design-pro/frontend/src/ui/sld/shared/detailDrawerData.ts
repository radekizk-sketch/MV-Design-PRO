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
 * F11.4-B / ARCH-4 (spec §10.1, „pełna migracja budowniczych danych
 * drawera" — druga bramka wymagana przed usunięciem v2): pozostałe gałęzie
 * `kind` z `handleSelectElement` PRZENIESIONE tu jako czyste budownicze —
 * `buildCableRunDetailDrawerData` (`cable_run`/`cable_segment_sn`/
 * `overhead_line_sn`, ŹRÓDŁO: dawna gałąź `kind === 'cable_run' || ...`,
 * ~linie 833-893), `buildNodeDetailDrawerData` (`zksn`/`branch_pole`, ŹRÓDŁO:
 * ~895-943), `buildDerDropDetailDrawerData` (drawer `kind:'der'` po
 * przeciągnięciu DER na stację — ŹRÓDŁO: ~950-962, WCZEŚNIEJ zduplikowane
 * TAKŻE w `SldCanvasV3Workspace.handleElementClick` — teraz JEDNA
 * implementacja), `buildStationBranchDetailDrawerData` (dyspozycyjny
 * budowniczy dla `station`/`gpz`/`bay`/`apparatus`/`lv_breaker`/
 * `protection`/`pcc`/`der_pcc_bay`/`transformer`/`der_block_transformer`/
 * `der`/`pv_inverter` — ŹRÓDŁO: blok `if (drawerKind) {...}`, ~967-1262,
 * dawniej ENTANGLED wyłącznie pozorne — blok czytał WYŁĄCZNIE
 * snapshot/sldData/overlayPayload/id/kind i kończył się jednym wywołaniem
 * `setDetailDrawerData`, więc jest w 100% czysty; zwraca `null` gdy
 * `mapKindToDrawerKind(kind)` nie rozpoznaje `kind` — kontener/v3 NIE
 * otwiera wtedy drawera, bez zgadywania). Pomocnicze funkcje modułowe
 * `mapKindToDrawerKind`/`mapKindToMenuKind`/`findBusVoltage`/`findBayByRef`/
 * `stationRefFromInternalElement`/`stationDisplayNameForRef`/
 * `stationRefForTransformerSelection`/`describeStationInternalElement` (+
 * stałe `INTERNAL_STATION_BAY_ROLE_LABELS_PL`/
 * `INTERNAL_STATION_DEVICE_LABELS_PL`) PRZENIESIONE razem z budowniczymi,
 * bo są wołane TAKŻE przez kod, który ZOSTAJE w v2 (selekcja typu elementu,
 * `openDetailFullView`/`openDetailConfiguration`, `detailDrawerActions`) —
 * v2 importuje je z powrotem stąd (wzorzec identyczny jak
 * `findSubstationByRef`/`selectStationBays`/`buildLiveMetrics` wyżej).
 *
 * CELOWO POZOSTAWIONE W KONTENERZE (v2 `handleSelectElement`, NIE tu):
 * sekwencja `selectElement(...)`/`collapseSurfaceStackTo(null)` po każdej
 * gałęzi (lokalny efekt uboczny wyboru — poza zakresem „budowy danych
 * drawera"), przechwycenie `derDrag.state`/`derDrag.dropOnStation(id)`
 * (mutacja stanu lokalnego hooka `useDerDragDrop`, nie dane), oraz CAŁY
 * drugi dyspozytor `let selected: SelectedElement | null = ...` (~1264-1371)
 * — to budowa `SelectedElement` dla `selectElement()`, INNY typ/INNY cel niż
 * `SldDetailDrawerData`, jawnie wyłączony z zakresu tego zadania (task B:
 * „selectElement sekwencje ZOSTAJĄ w kontenerze").
 */
import type { Bay, Branch, EnergyNetworkModel, Substation } from '../../../types/enm';
import type { SelectedElement } from '../../types';
import { formatStationSwitchgearDescriptionPl } from '../../shared/stationTypeLabels';
import { publicTechnicalLabel, segmentPublicIdentity, stationPublicIdentity } from '../../shared/publicTechnicalLabels';
import { selectStationDistributionTransformers } from '../../network-build/stationTransformerSelection';
import { getMetric, formatMetric, type RawOverlayPayload } from '../../sld-overlay/rawResultOverlayStore';
import { computeLfDerivedMetrics } from '../v2/canvas/lfDerivedMetrics';
import type { SldDataPayload } from '../v2/canvas/enmToSldAdapter';
import type { SldDetailDrawerData } from '../v2/canvas/SldDetailDrawer';
import type { SldElementKindForMenu } from '../v2/command/SldCommandService';

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

export function findBusVoltage(snapshot: EnergyNetworkModel | null, busRef: string): number | null {
  return (snapshot?.buses ?? []).find((bus) => bus.ref_id === busRef || bus.id === busRef)?.voltage_kv ?? null;
}

export function findBayByRef(snapshot: EnergyNetworkModel | null, bayRef: string): Bay | null {
  return (snapshot?.bays ?? []).find((bay) => bay.ref_id === bayRef || bay.id === bayRef) ?? null;
}

const INTERNAL_STATION_BAY_ROLE_LABELS_PL: Readonly<Record<string, string>> = {
  in: 'Pole wejściowe SN',
  out: 'Pole wyjściowe SN',
  feeder: 'Pole odgałęźne SN',
  tr: 'Pole transformatorowe SN',
  coupler: 'Pole sprzęgłowe SN',
  measurement: 'Pole pomiarowe SN',
  oze: 'Pole przyłączeniowe OZE',
};

const INTERNAL_STATION_DEVICE_LABELS_PL: Readonly<Record<string, string>> = {
  'switch-disconnector': 'Rozłącznik',
  fuse: 'Bezpiecznik',
  'earthing-switch': 'Uziemnik',
  'cable-head': 'Głowica kablowa',
  'transformer-device': 'Transformator SN/nN',
  breaker: 'Wyłącznik',
  disconnector: 'Odłącznik',
  vt: 'Przekładnik napięciowy',
};

/** `id` w postaci `${stationRef}/internal-bay/...`, `${stationRef}/nn/...`,
 *  `${stationRef}/pv/...`, `${stationRef}/transformer/...` — konwencja
 *  `StationInternalView` (K30). */
export function stationRefFromInternalElement(id: string): string | null {
  for (const marker of ['/internal-bay/', '/nn/', '/pv/', '/transformer/']) {
    const markerIndex = id.indexOf(marker);
    if (markerIndex > 0) return id.slice(0, markerIndex);
  }
  return null;
}

export function stationDisplayNameForRef(snapshot: EnergyNetworkModel | null, stationRef: string): string {
  const station = findSubstationByRef(snapshot, stationRef);
  return station && snapshot
    ? stationPublicIdentity(snapshot, station).displayName
    : 'stacja SN/nN';
}

export function stationRefForTransformerSelection(
  snapshot: EnergyNetworkModel | null,
  transformerRef: string,
): string | null {
  const internalStationRef = stationRefFromInternalElement(transformerRef);
  if (internalStationRef) return internalStationRef;
  if (!snapshot) return null;
  const transformer = (snapshot.transformers ?? []).find(
    (item) => item.ref_id === transformerRef || item.id === transformerRef,
  );
  if (!transformer) return null;
  const transformerBusRefs = new Set([transformer.hv_bus_ref, transformer.lv_bus_ref].filter(Boolean));
  const station = (snapshot.substations ?? []).find((item) =>
    item.transformer_refs?.includes(transformer.ref_id)
    || item.transformer_refs?.includes(transformer.id)
    || item.bus_refs?.some((busRef) => transformerBusRefs.has(busRef)),
  );
  return station?.ref_id ?? station?.id ?? null;
}

export function describeStationInternalElement(
  snapshot: EnergyNetworkModel | null,
  id: string,
): SelectedElement | null {
  const stationRef = stationRefFromInternalElement(id);
  if (!stationRef) return null;
  const stationName = stationDisplayNameForRef(snapshot, stationRef);

  if (id.includes('/internal-bay/')) {
    const bayPath = id.slice(id.indexOf('/internal-bay/') + '/internal-bay/'.length);
    const [bayKey, deviceKey] = bayPath.split('/');
    const roleKey = bayKey?.split('-')[0] ?? '';
    const bayLabel = INTERNAL_STATION_BAY_ROLE_LABELS_PL[roleKey] ?? 'Pole SN';
    const deviceLabel = deviceKey ? INTERNAL_STATION_DEVICE_LABELS_PL[deviceKey] ?? 'Aparat pola SN' : null;
    return {
      id,
      type: deviceLabel ? 'Switch' : 'BaySN',
      name: deviceLabel
        ? `${deviceLabel} - ${bayLabel}, ${stationName}`
        : `${bayLabel} - ${stationName}`,
    };
  }

  if (id.includes('/nn/')) {
    return {
      id,
      type: 'SwitchNN',
      name: `Wyłącznik nN - ${stationName}`,
    };
  }

  if (id.includes('/pv/nn-pcc')) {
    return {
      id,
      type: 'ConnectionPoint',
      name: `Punkt przyłączenia PV po stronie nN - ${stationName}`,
    };
  }

  if (id.includes('/pv/nn-breaker/')) {
    return {
      id,
      type: 'SwitchNN',
      name: `Wyłącznik nN PV - ${stationName}`,
    };
  }

  if (id.includes('/pv/protection/')) {
    return {
      id,
      type: 'ProtectionNN',
      name: `Zabezpieczenie PV - ${stationName}`,
    };
  }

  if (id.includes('/pv/inverter/')) {
    return {
      id,
      type: 'PVInverter',
      name: `Falownik PV - ${stationName}`,
      semanticHash: `source:${id}`,
      semanticElementKind: 'SOURCE',
      semanticEngineeringRole: 'PV_INVERTER',
    };
  }

  if (id.includes('/transformer/')) {
    return {
      id,
      type: 'TransformerBranch',
      name: `Transformator SN/nN - ${stationName}`,
    };
  }

  return null;
}

/** `kind` z `onSelectElement` → kind gałęzi drawera. `null` = brak
 *  dedykowanego drawera dla tego `kind` (np. `background`/`section`/
 *  `der_bess`/`der_fw`). */
export function mapKindToDrawerKind(kind: string): SldDetailDrawerData['kind'] | null {
  if (kind === 'station' || kind === 'gpz') return 'station';
  if (kind === 'bay') return 'bay';
  if (kind === 'apparatus' || kind === 'lv_breaker' || kind === 'protection' || kind === 'pcc' || kind === 'der_pcc_bay') return 'apparatus';
  if (kind === 'transformer' || kind === 'der_block_transformer') return 'transformer';
  if (kind === 'der' || kind === 'pv_inverter') return 'der';
  if (kind === 'cable_run' || kind === 'cable_segment_sn' || kind === 'overhead_line_sn') return 'cable_run';
  if (kind === 'zksn' || kind === 'branch_pole') return 'node';
  return null;
}

/** `kind` z `onSelectElement`/drawer `menuKind` → kategoria menu kontekstowego
 *  (`SldElementKindForMenu`, `SLD_MENU_REGISTRY`). `null` = brak menu. */
export function mapKindToMenuKind(kind: string): SldElementKindForMenu | null {
  if (kind === 'cable_run' || kind === 'cable_segment_sn') return 'cable_segment_sn';
  if (kind === 'overhead_line_sn') return 'overhead_line_sn';
  if (kind === 'der' || kind === 'pv_inverter') return 'der_pv';
  if (kind === 'der_block_transformer' || kind === 'der_pcc_bay' || kind === 'transformer') return 'apparatus';
  if (
    kind === 'background'
    || kind === 'gpz'
    || kind === 'section'
    || kind === 'bay'
    || kind === 'apparatus'
    || kind === 'station'
    || kind === 'zksn'
    || kind === 'branch_pole'
    || kind === 'der_pv'
    || kind === 'der_bess'
    || kind === 'der_fw'
  ) {
    return kind;
  }
  return null;
}

/**
 * Buduje `SldDetailDrawerData` dla kliku w ODCINEK SN (`kind` ===
 * `cable_run`/`cable_segment_sn`/`overhead_line_sn`). ŹRÓDŁO: gałąź
 * `kind === 'cable_run' || ...` w `SldWorkspaceContainer.handleSelectElement`
 * (patrz nagłówek modułu). ZAWSZE zwraca kompletny obiekt — oryginał nie
 * miał ścieżki „brak danych" (id jest ostatecznym fallbackiem elementId/
 * label), więc w przeciwieństwie do `buildStationDetailDrawerData` nie ma
 * tu `| null`. `elementId`/`label` w zwróconym obiekcie to DOKŁADNIE
 * `elementRef`/`elementName` z oryginału — wołający może użyć ich wprost do
 * `selectElement(...)` zamiast duplikować obliczenie.
 */
export function buildCableRunDetailDrawerData(
  snapshot: EnergyNetworkModel | null,
  sldData: SldDataPayload,
  overlayPayload: RawOverlayPayload | null,
  kind: 'cable_run' | 'cable_segment_sn' | 'overhead_line_sn',
  id: string,
): SldDetailDrawerData {
  const run = sldData.cableRuns.find((item) =>
    item.id === id || item.segmentRefs?.includes(id),
  );
  const clickedBranch = (snapshot?.branches ?? []).find(
    (item) => item.ref_id === id || item.id === id,
  ) as Branch | undefined;
  const fallbackSegmentRef = run?.segmentRefs?.[0] ?? id;
  const branch = clickedBranch
    ?? ((snapshot?.branches ?? []).find(
      (item) => item.ref_id === fallbackSegmentRef || item.id === fallbackSegmentRef,
    ) as Branch | undefined);
  const elementRef = branch?.ref_id ?? branch?.id ?? fallbackSegmentRef;
  const elementName = branch && snapshot
    ? segmentPublicIdentity(snapshot, branch).displayName
    : run?.label?.trim() || 'Odcinek SN';

  const segmentRefs = run?.segmentRefs?.length ? run.segmentRefs : [elementRef];
  const lengthKm = (() => {
    if (!snapshot) return typeof (branch as { length_km?: number } | undefined)?.length_km === 'number'
      ? (branch as { length_km: number }).length_km
      : null;
    let total = 0;
    let count = 0;
    for (const segmentRef of segmentRefs) {
      const segment = (snapshot.branches ?? []).find(
        (item) => item.ref_id === segmentRef || item.id === segmentRef,
      ) as ({ length_km?: number } & Branch) | undefined;
      if (typeof segment?.length_km === 'number') {
        total += segment.length_km;
        count += 1;
      }
    }
    return count > 0 ? total : null;
  })();
  return {
    kind: 'cable_run',
    menuKind: kind === 'overhead_line_sn' ? 'overhead_line_sn' : 'cable_segment_sn',
    elementId: elementRef,
    label: elementName,
    voltageKv: run?.voltageKv ?? null,
    accentColor: kind === 'overhead_line_sn' ? '#7EE0B5' : '#7EC8FF',
    cableRunSpec: {
      runKind: run?.runKind ?? null,
      segmentCount: segmentRefs.length,
      stationCount: null,
      lengthKm,
      segmentKind: kind === 'overhead_line_sn' ? 'overhead_line_sn' : 'cable_sn',
      maxLoadingPct: null,
      maxVoltageDropPct: null,
    },
    liveMetrics: buildLiveMetrics(overlayPayload, 'cable_run', elementRef, run?.voltageKv ?? null),
  };
}

/**
 * Buduje `SldDetailDrawerData` dla kliku w WĘZEŁ SN (`kind` ===
 * `zksn`/`branch_pole`). ŹRÓDŁO: gałąź `kind === 'zksn' || kind ===
 * 'branch_pole'` w `SldWorkspaceContainer.handleSelectElement`. ZAWSZE
 * zwraca kompletny obiekt (jak `buildCableRunDetailDrawerData` — `id` jest
 * ostatecznym fallbackiem, brak ścieżki „nie znaleziono"). `elementId`/
 * `label` == `elementRef`/`elementName` oryginału.
 */
export function buildNodeDetailDrawerData(
  snapshot: EnergyNetworkModel | null,
  overlayPayload: RawOverlayPayload | null,
  kind: 'zksn' | 'branch_pole',
  id: string,
): SldDetailDrawerData {
  const branchPoint = (snapshot?.branch_points ?? []).find(
    (item) => item.ref_id === id || item.id === id,
  );
  const elementRef = branchPoint?.ref_id ?? branchPoint?.id ?? id;
  const isZksn = kind === 'zksn';
  const elementName = publicTechnicalLabel(
    branchPoint?.name ?? null,
    isZksn ? 'ZK SN' : 'Słup rozgałęźny SN',
  );

  const branchPointAny = branchPoint as {
    bus_ref?: string | null;
    catalog_ref?: string | null;
  } | undefined;
  const nodeVoltage = branchPointAny?.bus_ref
    ? findBusVoltage(snapshot, branchPointAny.bus_ref)
    : null;
  const connectedSegments = branchPointAny?.bus_ref
    ? (snapshot?.branches ?? []).filter((branchItem) =>
      branchItem.from_bus_ref === branchPointAny.bus_ref || branchItem.to_bus_ref === branchPointAny.bus_ref,
    ).length
    : null;
  return {
    kind: 'node',
    menuKind: kind,
    elementId: elementRef,
    label: elementName,
    voltageKv: nodeVoltage,
    accentColor: isZksn ? '#7EC8FF' : '#7EE0B5',
    nodeSpec: {
      nodeKind: isZksn ? 'zksn' : 'branch_pole',
      rolePl: isZksn ? 'Złącze kablowe SN' : 'Słup rozgałęźny SN',
      voltageKv: nodeVoltage,
      connectedSegmentsCount: connectedSegments,
      catalogRef: branchPointAny?.catalog_ref ?? null,
      blockers: branchPointAny?.catalog_ref ? [] : ['Brak pozycji katalogowej węzła SN.'],
    },
    liveMetrics: buildLiveMetrics(overlayPayload, 'apparatus', elementRef, nodeVoltage),
  };
}

/**
 * Buduje `SldDetailDrawerData` (`kind: 'der'`) po przeciągnięciu DER
 * (PV/BESS/FW) na stację (K30-78 paleta DER, `useDerDragDrop.dropOnStation`).
 * ŹRÓDŁO: v2 `handleSelectElement`, gałąź `kind === 'station' &&
 * derDrag.state` po udanym `dropOnStation` (~950-962) — TA SAMA konstrukcja
 * była WCZEŚNIEJ zduplikowana w `SldCanvasV3Workspace.handleElementClick`
 * (paleta DER v3, F8c pkt 4); obie strony czytają teraz JEDNĄ implementację.
 * Samo wywołanie `dropOnStation` (mutacja stanu hooka) ZOSTAJE u wołającego
 * — ta funkcja przyjmuje już gotowy `derKind` z wyniku dropu.
 */
export function buildDerDropDetailDrawerData(
  sldData: SldDataPayload,
  stationId: string,
  derKind: 'PV' | 'BESS' | 'FW',
): SldDetailDrawerData {
  const stationForDrop = sldData.stations.find((s) => s.id === stationId);
  return {
    kind: 'der',
    elementId: stationId,
    label: stationForDrop?.stationCode
      ?? stationForDrop?.name
      ?? stationId.split('/').pop()
      ?? stationId,
    voltageKv: stationForDrop?.busVoltageKv ?? null,
    stationCode: stationForDrop?.stationCode ?? null,
    accentColor: derKind === 'PV' ? '#FFD166' : derKind === 'BESS' ? '#7DD3FC' : '#7EE0B5',
    derKind,
    derConnectionVariant: 'nn_side',
  };
}

/**
 * Dyspozytor drawera dla `station`/`gpz`/`bay`/`apparatus`/`lv_breaker`/
 * `protection`/`pcc`/`der_pcc_bay`/`transformer`/`der_block_transformer`/
 * `der`/`pv_inverter` (kategorie mapowane przez `mapKindToDrawerKind`).
 * ŹRÓDŁO: blok `if (drawerKind) {...}` w `handleSelectElement`
 * (~967-1262) — CAŁY blok czytał WYŁĄCZNIE snapshot/sldData/overlayPayload/
 * id/kind i kończył się jednym `setDetailDrawerData(...)`, więc jest 1:1
 * przenoszalny bez zmiany zachowania. Gałąź `drawerKind === 'station'`
 * deleguje do `buildStationDetailDrawerData` (istniejący budowniczy, F8c
 * pkt 2) — pozostałe gałęzie (transformer/cable_run(nieosiągalne tu, patrz
 * niżej)/bay/apparatus) asemblują generycznie, DOKŁADNIE jak oryginał.
 * Zwraca `null`, gdy `mapKindToDrawerKind(kind)` nie rozpoznaje `kind`
 * (np. `background`/`section`/`der_bess`/`der_fw`) — wołający NIE otwiera
 * wtedy drawera.
 *
 * UWAGA (zachowanie 1:1, nie błąd): `drawerKind === 'cable_run'` i
 * `drawerKind === 'node'` są w tej funkcji NIEOSIĄGALNE dla `kind` w
 * praktyce, bo `handleSelectElement` przechwytuje `cable_run`/
 * `cable_segment_sn`/`overhead_line_sn` i `zksn`/`branch_pole` WCZEŚNIEJ
 * (osobne `return` — patrz `buildCableRunDetailDrawerData`/
 * `buildNodeDetailDrawerData` wyżej) i NIGDY nie wywołuje tego dyspozytora
 * dla tych `kind` — gałęzie `cableRunSpec`/breadcrumb tu są martwym kodem
 * PRZENIESIONYM Z ORYGINAŁU 1:1 (ta sama martwota istniała w oryginalnym
 * `SldWorkspaceContainer.tsx`, nie jest wprowadzona tym refaktorem).
 */
export function buildStationBranchDetailDrawerData(
  snapshot: EnergyNetworkModel | null,
  sldData: SldDataPayload,
  overlayPayload: RawOverlayPayload | null,
  kind: string,
  id: string,
): SldDetailDrawerData | null {
  const drawerKind = mapKindToDrawerKind(kind);
  if (!drawerKind) return null;

  const stationForDrawer = sldData.stations.find((s) => s.id === id);
  const internalStationRef = stationRefFromInternalElement(id);
  const stationForInternalElement = internalStationRef
    ? sldData.stations.find((s) => s.id === internalStationRef)
    : undefined;
  const transformerStationRef = drawerKind === 'transformer'
    ? stationRefForTransformerSelection(snapshot, id)
    : null;
  const stationForTransformer = transformerStationRef
    ? sldData.stations.find((s) => s.id === transformerStationRef)
    : undefined;
  const stationContext = kind === 'station'
    ? stationForDrawer
    : stationForInternalElement ?? stationForTransformer ?? sldData.stations[0];
  const internalElementDescription = describeStationInternalElement(snapshot, id);
  // K30-79: real transformer spec from snapshot (gdy station kind)
  let transformerSpec: SldDetailDrawerData['transformerSpec'] = null;
  let transformerLabelOverride: string | null = null;
  const stationLabelOverride: string | null = null;
  // K30-80: bay list dla rozdzielnica tab
  const baysSpec: SldDetailDrawerData['baysSpec'] = undefined;
  const switchgearDescription: SldDetailDrawerData['switchgearDescription'] = null;
  // K30-81: nN side spec (LV bus + loads)
  const nnSpec: SldDetailDrawerData['nnSpec'] = null;
  // K30-82: existing DERs on station (snapshot.generators filter station_ref)
  const existingDers: SldDetailDrawerData['existingDers'] = undefined;
  // K30-83: bay apparatus list (from bay.equipment_refs + runtime_state)
  let apparatusSpec: SldDetailDrawerData['apparatusSpec'] = undefined;
  // F8c pkt 2: gałąź 'station' ma KOMPLETNY obiekt z budowniczego
  // współdzielonego (`stationDrawerData`) — użyty wprost. Pozostałe
  // gałęzie (transformer/cable_run/bay/apparatus/node) NIETKNIĘTE,
  // asemblacja generyczna jak przed wyciągnięciem.
  const stationDrawerData = drawerKind === 'station'
    ? buildStationDetailDrawerData(snapshot, sldData, overlayPayload, id)
    : null;
  if (drawerKind === 'transformer' && snapshot) {
    const directTransformer = (snapshot.transformers ?? []).find(
      (item) => item.ref_id === id || item.id === id,
    );
    const stationRef = transformerStationRef ?? internalStationRef;
    const transformerStation = stationRef ? findSubstationByRef(snapshot, stationRef) : null;
    const stationTransformers = selectStationDistributionTransformers(snapshot, transformerStation);
    const tr = directTransformer ?? stationTransformers[0] ?? null;

    if (tr) {
      const transformerBlockers: string[] = [];
      if (!tr.catalog_ref) transformerBlockers.push('Brak pozycji katalogowej transformatora.');
      if (typeof tr.uk_percent !== 'number') transformerBlockers.push('Brak napięcia zwarcia u_k%.');
      if (!tr.vector_group) transformerBlockers.push('Brak grupy połączeń.');
      if (typeof tr.pk_kw !== 'number') transformerBlockers.push('Brak strat obciążeniowych Pk.');
      transformerSpec = {
        ref: tr.ref_id ?? tr.id ?? null,
        name: tr.name ?? internalElementDescription?.name ?? null,
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
      transformerLabelOverride = tr.name ?? internalElementDescription?.name ?? 'Transformator SN/nN';
    } else if (stationForInternalElement?.transformerRatedKva != null || stationForInternalElement?.transformerRefs?.length) {
      transformerSpec = {
        ref: stationForInternalElement.transformerRefs?.[0] ?? id,
        name: internalElementDescription?.name ?? 'Transformator SN/nN stacji',
        vectorGroup: stationForInternalElement.transformerVectorGroup ?? null,
        snMva: stationForInternalElement.transformerRatedKva != null
          ? stationForInternalElement.transformerRatedKva / 1000
          : null,
        uhvKv: stationForInternalElement.busVoltageKv ?? null,
        ulvKv: 0.4,
        ukPercent: null,
        pkKw: null,
        catalogRef: null,
        dataQuality: 'sld_fallback',
        blockers: [
          'Widok SLD ma dane transformatora, ale rekord ENM/katalog nie został znaleziony.',
        ],
      };
      transformerLabelOverride = internalElementDescription?.name ?? 'Transformator SN/nN';
    } else {
      transformerSpec = {
        ref: id,
        name: internalElementDescription?.name ?? 'Transformator SN/nN',
        vectorGroup: null,
        snMva: null,
        uhvKv: null,
        ulvKv: null,
        ukPercent: null,
        pkKw: null,
        catalogRef: null,
        dataQuality: 'missing',
        blockers: ['Brak rekordu transformatora w ENM/katalogu.'],
      };
      transformerLabelOverride = internalElementDescription?.name ?? 'Transformator SN/nN';
    }
  }
  // K30-89: cable run spec (gdy drawer kind='cable_run')
  // K30-93: + maxLoadingPct + maxVoltageDropPct z lfDerivedMetrics
  let cableRunSpec: SldDetailDrawerData['cableRunSpec'] = null;
  if (drawerKind === 'cable_run') {
    const run = sldData.cableRuns.find((r) => r.id === id);
    if (run) {
      let lengthKm: number | null = null;
      if (snapshot && run.segmentRefs && run.segmentRefs.length > 0) {
        let total = 0;
        let countWithLength = 0;
        for (const segRef of run.segmentRefs) {
          const seg = (snapshot.branches ?? []).find(
            (b: { ref_id?: string; id?: string }) => b.ref_id === segRef || b.id === segRef,
          );
          if (seg && 'length_km' in seg && typeof (seg as { length_km: number }).length_km === 'number') {
            total += (seg as { length_km: number }).length_km;
            countWithLength++;
          }
        }
        if (countWithLength > 0) lengthKm = total;
      }
      // K30-93: pull cable loading from LF derived metrics
      let maxLoadingPct: number | null = null;
      let maxVoltageDropPct: number | null = null;
      if (overlayPayload) {
        const lfMeta = computeLfDerivedMetrics(
          overlayPayload,
          sldData.stations.map((s) => ({ id: s.id, busVoltageKv: s.busVoltageKv })),
          sldData.cableRuns.map((r) => ({
            id: r.id,
            segmentRefs: r.segmentRefs,
          })),
        );
        const loading = lfMeta.cableLoadingPctByRunId.get(run.id);
        if (typeof loading === 'number') maxLoadingPct = loading;
        // Voltage drop = max |station deviation| on stations along this run
        const devs = Array.from(lfMeta.voltageDeviationPctByStationId.values());
        if (devs.length > 0) {
          maxVoltageDropPct = Math.max(...devs.map((d) => Math.abs(d)));
        }
      }
      cableRunSpec = {
        runKind: run.runKind ?? null,
        segmentCount: run.segmentRefs?.length ?? null,
        stationCount: null,
        lengthKm,
        segmentKind: run.segmentKind ?? null,
        maxLoadingPct,
        maxVoltageDropPct,
      };
    }
  }
  // K30-83: bay apparatus list (gdy drawer kind='bay')
  if (drawerKind === 'bay' && snapshot) {
    const bay = findBayByRef(snapshot, id);
    const states = bay?.runtime_state?.primary_device_states ?? {};
    const inferKind = (appId: string): 'CB' | 'DS' | 'ES' | 'CT' | 'VT' | 'OTHER' => {
      const lower = appId.toLowerCase();
      if (lower.includes('breaker') || lower.endsWith('#cb')) return 'CB';
      if (lower.includes('disconnector') || lower.endsWith('#ds')) return 'DS';
      if (lower.includes('earthing') || lower.endsWith('#es')) return 'ES';
      if (lower.includes('current_transformer') || lower.endsWith('#ct')) return 'CT';
      if (lower.includes('voltage_transformer') || lower.endsWith('#vt')) return 'VT';
      return 'OTHER';
    };
    const labelFor = (k: 'CB' | 'DS' | 'ES' | 'CT' | 'VT' | 'OTHER', appId: string): string => {
      if (k === 'CB') return 'Wyłącznik';
      if (k === 'DS') return appId.includes('out') ? 'Odłącznik odpływowy' : 'Odłącznik';
      if (k === 'ES') return 'Uziemnik';
      if (k === 'CT') return 'Przekładnik prądowy';
      if (k === 'VT') return 'Przekładnik napięciowy';
      return appId.split('#').pop() ?? appId;
    };
    const mapState = (raw: unknown): 'closed' | 'open' | 'unknown' => {
      if (raw && typeof raw === 'object' && 'actual_state' in raw) {
        const v = (raw as { actual_state: string }).actual_state;
        if (v === 'zamkniety') return 'closed';
        if (v === 'otwarty') return 'open';
      }
      return 'unknown';
    };
    apparatusSpec = (bay?.equipment_refs ?? []).map((eqId) => {
      const k = inferKind(eqId);
      return {
        id: eqId,
        kind: k,
        label: labelFor(k, eqId),
        state: mapState(states[eqId]),
      };
    });
  }
  // K30-97: apparatus state (gdy drawer kind='apparatus')
  let apparatusState: SldDetailDrawerData['apparatusState'] = null;
  if (drawerKind === 'apparatus' && snapshot) {
    // Look up state across all bays' primary_device_states
    let raw: unknown = null;
    for (const sub of (snapshot.substations ?? []) as Array<{ bays?: Array<{ runtime_state?: { primary_device_states?: Record<string, unknown> } }> }>) {
      for (const b of sub.bays ?? []) {
        const ds = b.runtime_state?.primary_device_states ?? {};
        if (id in ds) { raw = ds[id]; break; }
      }
      if (raw) break;
    }
    if (raw && typeof raw === 'object') {
      const r = raw as {
        actual_state?: string;
        control_mode?: string;
        communication_ok?: boolean;
        interlock_blocked?: boolean;
        last_state_change_at?: string;
      };
      const mapState = (v: string | undefined): 'closed' | 'open' | 'unknown' | null =>
        v === 'zamkniety' ? 'closed' : v === 'otwarty' ? 'open' : v === 'nieznany' ? 'unknown' : null;
      const mapMode = (v: string | undefined): 'LOKALNY' | 'ZDALNY' | 'AUTO' | 'BLOKADA' | null => {
        if (!v) return null;
        const up = v.toUpperCase();
        if (up === 'LOKALNY' || up === 'ZDALNY' || up === 'AUTO' || up === 'BLOKADA') return up;
        return null;
      };
      apparatusState = {
        actualState: mapState(r.actual_state),
        controlMode: mapMode(r.control_mode),
        communicationOk: r.communication_ok ?? null,
        interlockBlocked: r.interlock_blocked ?? null,
        lastChangeAt: r.last_state_change_at ?? null,
      };
    }
  }
  // K30-98: breadcrumb context dla bay/apparatus selections
  let parentStationLabel: string | null = null;
  let parentBayLabel: string | null = null;
  if ((drawerKind === 'bay' || drawerKind === 'apparatus') && stationContext) {
    parentStationLabel = stationContext.stationCode
      ?? stationContext.name
      ?? null;
  }
  if (drawerKind === 'apparatus' && snapshot) {
    for (const sub of (snapshot.substations ?? []) as Array<{ name?: string; bays?: Array<{ name?: string; ref_id?: string; equipment_refs?: string[] }> }>) {
      for (const b of sub.bays ?? []) {
        if (b.equipment_refs?.includes(id)) {
          parentBayLabel = b.name ?? b.ref_id ?? null;
          break;
        }
      }
      if (parentBayLabel) break;
    }
  }

  // Recenzja NO-GO 2026-07-17 pkt 9 (spec §12.5): identyfikator GLOBALNY
  // ⟨stacja⟩.⟨pole⟩.⟨aparat⟩ (np. „S01.F01.Q2") — w INSPEKTORZE (rysunek
  // zostaje przy krótkich Q/QE/T w obrębie opisanego pola, per recenzja).
  // Części: kod stacji (stationCode), oznacznik pola = `Bay.bay_number`
  // (dane) albo deterministyczna numeracja F⟨nn⟩ wg pozycji pola w stacji
  // (TA SAMA konwencja co `gpzFieldOrdinalDesignation`, compose/gpz.ts),
  // aparat = Q/QE/T wg kolejności `equipment_refs` (TA SAMA klasa liter co
  // §19.1). Brak którejkolwiek części w danych ⇒ `null` (uczciwy brak).
  let globalId: string | null = null;
  if ((drawerKind === 'bay' || drawerKind === 'apparatus') && snapshot) {
    type BayLite = { ref_id?: string; bay_number?: string | null; equipment_refs?: string[] };
    const inferKindForId = (eqId: string): 'Q' | 'QE' | 'T' | null => {
      const tail = eqId.toLowerCase();
      if (tail.includes('es') || tail.includes('earth')) return 'QE';
      if (tail.includes('tr') || tail.includes('transformer')) return 'T';
      if (tail.includes('cb') || tail.includes('ds') || tail.includes('switch') || tail.includes('breaker')) return 'Q';
      return null;
    };
    outer: for (const sub of (snapshot.substations ?? []) as Array<{ bays?: BayLite[] }>) {
      const bays = sub.bays ?? [];
      for (let bi = 0; bi < bays.length; bi++) {
        const b = bays[bi];
        const isBayHit = drawerKind === 'bay' && b.ref_id === id;
        const isApparatusHit = drawerKind === 'apparatus' && (b.equipment_refs ?? []).includes(id);
        if (!isBayHit && !isApparatusHit) continue;
        const code = stationContext?.stationCode ?? null;
        if (!code) break outer;
        const fieldPart = (b.bay_number ?? '').trim() || `F${String(bi + 1).padStart(2, '0')}`;
        if (isBayHit) {
          globalId = `${code}.${fieldPart}`;
        } else {
          // Numeracja Q/QE/T po kolejności equipment_refs — lustro
          // `apparatusIdentifiers` (compose/apparatusSequence.ts).
          const counters: Record<string, number> = { Q: 0, QE: 0, T: 0 };
          let apparatusPart: string | null = null;
          for (const eqId of b.equipment_refs ?? []) {
            const cls = inferKindForId(eqId);
            if (cls) counters[cls] += 1;
            if (eqId === id) {
              apparatusPart = cls ? `${cls}${counters[cls]}` : eqId.split('/').pop() ?? eqId;
              break;
            }
          }
          globalId = apparatusPart ? `${code}.${fieldPart}.${apparatusPart}` : `${code}.${fieldPart}`;
        }
        break outer;
      }
    }
  }
  return drawerKind === 'station' && stationDrawerData
    ? stationDrawerData
    : {
        kind: drawerKind,
        menuKind: mapKindToMenuKind(kind),
        elementId: id,
        label: transformerLabelOverride
          ?? stationLabelOverride
          ?? (drawerKind === 'station'
            ? stationForDrawer?.name ?? stationForDrawer?.stationCode
            : stationForDrawer?.stationCode ?? stationForDrawer?.name)
          ?? internalElementDescription?.name
          ?? id.split('/').pop()
          ?? id,
        voltageKv: transformerSpec?.uhvKv
          ?? stationForDrawer?.busVoltageKv
          ?? stationForInternalElement?.busVoltageKv
          ?? stationForTransformer?.busVoltageKv
          ?? null,
        stationCode: stationContext?.stationCode ?? null,
        accentColor: '#7EC8FF',
        transformerSpec,
        baysSpec,
        switchgearDescription,
        nnSpec,
        existingDers,
        apparatusSpec,
        cableRunSpec,
        liveMetrics: buildLiveMetrics(overlayPayload, drawerKind, id, stationForDrawer?.busVoltageKv ?? null),
        alarmSeverity: stationForDrawer?.alarmSeverity ?? null,
        apparatusState,
        parentStationLabel,
        parentBayLabel,
        globalId,
      };
}

/**
 * Dyspozytor NAJWYŻSZEGO poziomu — spina WSZYSTKIE gałęzie budowniczych
 * drawera z JEDNYM jawnym `switch`/if-chain (spec §10.1 ARCH-4: „Jedna
 * funkcja dyspozycyjna `buildDetailDrawerDataForKind(kind, elementId, deps)`
 * może spinać gałęzie"). Kolejność sprawdzania kind ODZWIERCIEDLA oryginalną
 * kolejność `if`-ów w `handleSelectElement` (cable_run/cable_segment_sn/
 * overhead_line_sn → zksn/branch_pole → reszta przez
 * `buildStationBranchDetailDrawerData`). NIE obejmuje `buildDerDropDetail
 * DrawerData` (wymaga `derKind` z osobnego, stanowego `dropOnStation` —
 * wołający musi go wywołać oddzielnie, patrz nagłówek tej funkcji wyżej) ani
 * `buildStationDetailDrawerData` (wołane WEWNĄTRZ `buildStationBranchDetail
 * DrawerData` dla `drawerKind==='station'`). Zwraca `null`, gdy żadna gałąź
 * nie rozpoznaje `kind` (np. `section`/`background`) — wołający NIE otwiera
 * drawera (uczciwy brak danych, bez zgadywania).
 */
export function buildDetailDrawerDataForKind(
  kind: string,
  id: string,
  deps: {
    readonly snapshot: EnergyNetworkModel | null;
    readonly sldData: SldDataPayload;
    readonly overlayPayload: RawOverlayPayload | null;
  },
): SldDetailDrawerData | null {
  if (kind === 'cable_run' || kind === 'cable_segment_sn' || kind === 'overhead_line_sn') {
    return buildCableRunDetailDrawerData(deps.snapshot, deps.sldData, deps.overlayPayload, kind, id);
  }
  if (kind === 'zksn' || kind === 'branch_pole') {
    return buildNodeDetailDrawerData(deps.snapshot, deps.overlayPayload, kind, id);
  }
  return buildStationBranchDetailDrawerData(deps.snapshot, deps.sldData, deps.overlayPayload, kind, id);
}
