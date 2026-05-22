/**
 * SnSegmentSurface (E-12) - konfigurator odcinka SN.
 *
 * Etap 4 dostawy: parametry odcinka kabla SN albo linii napowietrznej SN:
 * 4 karty: Identyfikacja & rodzina / Katalog & przewód / Trasa & ułożenie /
 * Obciążalność.
 *
 * Backend: katalogi w mv_cable_line_catalog.py (KABEL_SN, LINIA_SN).
 * Pełne wpięcie do operacji domenowej continue_trunk_segment_sn /
 * insert_station_on_segment_sn - Etap 6 (insert tool).
 */

import { useMemo, useState } from 'react';

import { useSnapshotStore } from '../../topology/snapshotStore';
import { MISSING_DASH } from '../../shared/formatPolishValue';
import type { WorkspaceSurfaceDescriptor } from '../types';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSelectionStore } from '../../selection/store';
import { isTerrainSnSegment } from '../../shared/enmVisibility';
import { segmentPublicIdentity, stationPublicIdentity } from '../../shared/publicTechnicalLabels';
import type { Branch, Bus, EnergyNetworkModel, Substation } from '../../../types/enm';

type SegmentCardId = 'identification' | 'catalog' | 'route' | 'rating';

const CARD_LABELS: Record<SegmentCardId, string> = {
  identification: 'Identyfikacja',
  catalog: 'Typ katalogowy i przewód',
  route: 'Trasa i ułożenie',
  rating: 'Obciążalność',
};

interface SegmentData {
  designation: string;
  family: 'kabel_sn' | 'linia_napowietrzna_sn';
  catalogItemId: string;
  conductorMm2: number | null;
  lengthM: number | null;
  layingType: 'ziemia' | 'kanal' | 'powietrze';
  ambientTempC: number | null;
  groundResistivity: number | null;
  ampacityA: number | null;
}

interface SegmentEndpointStatus {
  endpointBusRef: string | null;
  isFree: boolean;
  reasonPl: string;
  station: Substation | null;
}

const CABLE_SN_CATALOG = [
  { id: 'cable-tfk-yakxs-3x70', label: 'YAKXS 3×70 mm² · 12/20 kV' },
  { id: 'cable-tfk-yakxs-3x120', label: 'YAKXS 3×120 mm² · 12/20 kV' },
  { id: 'cable-tfk-yakxs-3x240', label: 'YAKXS 3×240 mm² · 12/20 kV' },
  { id: 'cable-tfk-xrukpz-3x95', label: 'XRUKPZ 3×95 mm² · 12/20 kV' },
];

const LINE_SN_CATALOG = [
  { id: 'line-afl-50', label: 'AFL-6 50 mm² · żłobiona' },
  { id: 'line-afl-70', label: 'AFL-6 70 mm² · żłobiona' },
  { id: 'line-afl-95', label: 'AFL-6 95 mm² · żłobiona' },
  { id: 'line-afl-120', label: 'AFL-6 120 mm² · żłobiona' },
];

const DEFAULT_CABLE_SN_CATALOG_ID = CABLE_SN_CATALOG[0].id;
const DEFAULT_LINE_SN_CATALOG_ID = LINE_SN_CATALOG[0].id;

const SEGMENT_NUMBER_FORMAT_PL = new Intl.NumberFormat('pl-PL', {
  maximumFractionDigits: 2,
});

function refMatches(
  candidate: { ref_id?: string; id?: string } | null | undefined,
  ref: string,
): boolean {
  return candidate?.ref_id === ref || candidate?.id === ref;
}

function findBus(snapshot: EnergyNetworkModel | null, busRef: string | null | undefined): Bus | null {
  if (!snapshot || !busRef) return null;
  return (snapshot.buses ?? []).find((bus) => refMatches(bus, busRef)) ?? null;
}

function connectedTerrainSegments(snapshot: EnergyNetworkModel | null, busRef: string | null): Branch[] {
  if (!snapshot || !busRef) return [];
  return (snapshot.branches ?? []).filter(
    (branch) =>
      isTerrainSnSegment(branch)
      && (branch.from_bus_ref === busRef || branch.to_bus_ref === busRef),
  );
}

function findStationOnBus(
  snapshot: EnergyNetworkModel | null,
  busRef: string | null,
): Substation | null {
  if (!snapshot || !busRef) return null;
  return (snapshot.substations ?? []).find(
    (station) =>
      station.station_type !== 'gpz'
      && (station.bus_refs ?? []).includes(busRef),
  ) ?? null;
}

function evaluateSegmentEndpoint(
  snapshot: EnergyNetworkModel | null,
  segment: Branch | null,
): SegmentEndpointStatus {
  const endpointBusRef = segment?.to_bus_ref ?? null;
  if (!endpointBusRef) {
    return {
      endpointBusRef,
      isFree: false,
      reasonPl: 'Ten odcinek nie ma wskazanego końcowego zacisku SN.',
      station: null,
    };
  }

  const endpointBus = findBus(snapshot, endpointBusRef);
  if (!endpointBus) {
    return {
      endpointBusRef,
      isFree: false,
      reasonPl: 'Końcowy zacisk odcinka nie występuje w aktualnym modelu sieci.',
      station: null,
    };
  }

  const station = findStationOnBus(snapshot, endpointBusRef);
  if (station) {
    const identity = stationPublicIdentity(snapshot as EnergyNetworkModel, station);
    return {
      endpointBusRef,
      isFree: false,
      reasonPl: `Koniec odcinka jest już wpięty do stacji ${identity.displayName}. Dalszą budowę prowadź z karty tej stacji.`,
      station,
    };
  }

  const connectedSegments = connectedTerrainSegments(snapshot, endpointBusRef);
  if (connectedSegments.length !== 1) {
    return {
      endpointBusRef,
      isFree: false,
      reasonPl: 'Końcowy zacisk jest węzłem przelotowym ciągu SN. Wybierz wolny koniec ostatniego odcinka albo port stacji.',
      station: null,
    };
  }

  const busTags = endpointBus.tags ?? [];
  if (busTags.includes('substation_bus')) {
    return {
      endpointBusRef,
      isFree: false,
      reasonPl: 'Końcowy zacisk należy już do układu stacyjnego. Wybierz stację i kontynuuj ciąg z jej pola wyjściowego.',
      station: null,
    };
  }

  return {
    endpointBusRef,
    isFree: true,
    reasonPl: 'Końcowy zacisk odcinka jest wolny i może przyjąć stację, ZK SN albo słup rozgałęźny.',
    station: null,
  };
}

function formatLengthM(segment: Branch | null, draftLengthM: number | null): string {
  if (segment && 'length_km' in segment && typeof segment.length_km === 'number') {
    return `${SEGMENT_NUMBER_FORMAT_PL.format(segment.length_km * 1000)} m`;
  }
  return draftLengthM === null ? MISSING_DASH : `${SEGMENT_NUMBER_FORMAT_PL.format(draftLengthM)} m`;
}

function formatAmpacity(branch: Branch | null, draftAmpacityA: number | null): string {
  const rating = branch && 'rating' in branch ? branch.rating : null;
  const ratedCurrent = typeof rating?.in_a === 'number' ? rating.in_a : draftAmpacityA;
  return ratedCurrent === null ? MISSING_DASH : `${SEGMENT_NUMBER_FORMAT_PL.format(ratedCurrent)} A`;
}

function segmentFamilyLabel(branch: Branch | null, draftFamily: SegmentData['family']): string {
  if (branch?.type === 'line_overhead') return 'Linia napowietrzna SN';
  if (branch?.type === 'cable') return 'Kabel SN';
  return draftFamily === 'linia_napowietrzna_sn' ? 'Linia napowietrzna SN' : 'Kabel SN';
}

function selectedCatalogLabel(catalogId: string, family: SegmentData['family']): string {
  const catalog = family === 'kabel_sn' ? CABLE_SN_CATALOG : LINE_SN_CATALOG;
  return catalog.find((item) => item.id === catalogId)?.label ?? MISSING_DASH;
}

function readMaterializedString(branch: Branch | null, keys: readonly string[]): string | null {
  const materialized = branch?.materialized_params;
  if (!materialized || typeof materialized !== 'object') return null;
  for (const key of keys) {
    const value = materialized[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readMaterializedNumber(branch: Branch | null, keys: readonly string[]): number | null {
  const materialized = branch?.materialized_params;
  if (!materialized || typeof materialized !== 'object') return null;
  for (const key of keys) {
    const value = materialized[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(',', '.'));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
}

function stripCableOwnerPrefix(value: string): string {
  return value
    .replace(/^\s*ENEA\s+OPERATOR\s+STANDARD\s*[-–—]?\s*/iu, '')
    .replace(/^\s*ENEA\s+OPERATOR\s*[-–—]?\s*/iu, '')
    .replace(/^\s*TELE[-\s]?FONIKA\s+KABLE\s*[-–—]?\s*/iu, '')
    .replace(/^\s*TFK\s+STANDARD\s*[-–—]?\s*/iu, '')
    .replace(/^\s*NKT\s+STANDARD\s*[-–—]?\s*/iu, '')
    .trim();
}

function inferCableType(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[-_]+/g, ' ');
  const match = normalized.match(/\b(NA2XS2Y|N2XS2Y|XRUHAKXS|YHAKXS|YHKXS|YAKXS)\b/u);
  return match?.[1] ?? null;
}

function readSectionFromText(value: string | null, pattern: RegExp): number | null {
  if (!value) return null;
  const match = value.match(pattern);
  const raw = match?.[1];
  if (!raw) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readOverheadSectionFromRef(value: string | null): number | null {
  return readSectionFromText(value, /\bline[-_\s]+base[-_\s]+(?:al|cu|st|al[-_\s]*st|afl(?:[-_\s]*6)?)[-_\s]+(\d{2,4})\b/iu)
    ?? readSectionFromText(value, /\b(?:base\s+)?(?:al|cu|st|al[-\s]*st|afl(?:[-\s]*6)?)\s*(\d{2,4})\b/iu);
}

function readOverheadMaterialFromRef(value: string | null): string | null {
  if (!value) return null;
  if (/\bal[-_\s]*st\b/iu.test(value)) return 'Al/St';
  if (/\bafl(?:[-_\s]*6)?\b/iu.test(value)) return 'AFL-6';
  if (/\bal\b/iu.test(value)) return 'Al';
  if (/\bcu\b/iu.test(value)) return 'Cu';
  if (/\bst\b/iu.test(value)) return 'St';
  return null;
}

function formatMvCableCatalogLabel(branch: Branch | null, candidate: string | null): string | null {
  if (branch?.type !== 'cable') return null;
  const cableType = inferCableType(candidate) ?? inferCableType(branch.catalog_ref ?? null);
  if (!cableType) return null;

  const workingSection = typeof branch.cross_section_mm2 === 'number'
    ? branch.cross_section_mm2
    : readSectionFromText(candidate, /\b1\s*[x×]\s*(\d{2,4})/iu);
  if (!workingSection) return null;

  const returnSection = typeof branch.return_conductor_cross_section_mm2 === 'number'
    ? branch.return_conductor_cross_section_mm2
    : readSectionFromText(candidate, /\b1\s*[x×]\s*\d{2,4}\s*\/\s*(\d{1,3})/iu);

  const working = SEGMENT_NUMBER_FORMAT_PL.format(workingSection);
  const screen = returnSection ? `/${SEGMENT_NUMBER_FORMAT_PL.format(returnSection)}` : '';
  return `3 × ${cableType} 1×${working}${screen} mm²`;
}

function normalizeCatalogLabel(value: string): string | null {
  const trimmed = stripCableOwnerPrefix(value.trim());
  if (!trimmed) return null;
  if (/^(?:cable|line)-/iu.test(trimmed)) return null;
  if (/^base\s+/iu.test(trimmed)) return null;
  return trimmed
    .replace(/\s*[xX]\s*/gu, '×')
    .replace(/\bmm2\b/giu, 'mm²')
    .replace(/\s+/gu, ' ');
}

function conductorLabel(branch: Branch | null, draft: SegmentData): string {
  if (branch?.type === 'line_overhead') {
    const materializedMaterial = readMaterializedString(branch, [
      'conductor_material',
      'material',
    ]);
    const catalogRef = branch.catalog_ref?.trim() ?? '';
    const sectionValue = 'cross_section_mm2' in branch && typeof branch.cross_section_mm2 === 'number'
      ? branch.cross_section_mm2
      : readMaterializedNumber(branch, ['cross_section_mm2', 'section_mm2', 'conductor_cross_section_mm2'])
        ?? readOverheadSectionFromRef(catalogRef);
    const material = materializedMaterial?.replace(/^AL$/i, 'Al')
      ?? readOverheadMaterialFromRef(catalogRef);
    if (sectionValue) {
      const section = `${SEGMENT_NUMBER_FORMAT_PL.format(sectionValue)} mm²`;
      return [material, section].filter(Boolean).join(' ');
    }
    const normalized = normalizeCatalogLabel(catalogRef);
    return normalized ?? selectedCatalogLabel(draft.catalogItemId, 'linia_napowietrzna_sn');
  }
  if (branch?.type === 'cable') {
    const workingSection = typeof branch.cross_section_mm2 === 'number'
      ? SEGMENT_NUMBER_FORMAT_PL.format(branch.cross_section_mm2)
      : null;
    const returnSection = typeof branch.return_conductor_cross_section_mm2 === 'number'
      ? SEGMENT_NUMBER_FORMAT_PL.format(branch.return_conductor_cross_section_mm2)
      : null;
    const section = workingSection
      ? `${workingSection}${returnSection ? `/${returnSection}` : ''} mm²`
      : null;
    const material = branch.conductor_material?.trim().replace(/^AL$/i, 'Al') || null;
    return [material, section].filter(Boolean).join(' ') || selectedCatalogLabel(draft.catalogItemId, draft.family);
  }
  return selectedCatalogLabel(draft.catalogItemId, draft.family);
}

function catalogRefLabel(branch: Branch | null, draft: SegmentData): string {
  const materializedLabel = readMaterializedString(branch, [
    'type_designation',
    'type_label',
    'trade_name',
    'catalog_label',
    'display_name',
    'designation',
    'name',
  ]);
  const candidate = materializedLabel ?? branch?.catalog_ref?.trim() ?? null;
  if (branch?.type === 'line_overhead') {
    const normalized = candidate && !inferCableType(candidate) ? normalizeCatalogLabel(candidate) : null;
    if (normalized) {
      const section = readOverheadSectionFromRef(normalized);
      const material = readOverheadMaterialFromRef(normalized);
      if (section && material) {
        return `Linia napowietrzna ${material} ${SEGMENT_NUMBER_FORMAT_PL.format(section)} mm²`;
      }
      return normalized;
    }
    const conductor = conductorLabel(branch, draft);
    if (conductor && conductor !== MISSING_DASH) return `Linia napowietrzna ${conductor}`;
    return selectedCatalogLabel(draft.catalogItemId, 'linia_napowietrzna_sn');
  }
  const cableLabel = formatMvCableCatalogLabel(branch, candidate);
  if (cableLabel) return cableLabel;
  if (candidate) {
    const normalized = normalizeCatalogLabel(candidate);
    if (normalized) return normalized;
  }
  return selectedCatalogLabel(draft.catalogItemId, draft.family);
}

interface SnSegmentSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

export function SnSegmentSurface(props: SnSegmentSurfaceProps): JSX.Element {
  const { surface } = props;
  const segmentRef = surface.entityRef ?? null;
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);
  const [activeCard, setActiveCard] = useState<SegmentCardId>('identification');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [data, setData] = useState<SegmentData>(() => ({
    designation: '',
    family: 'kabel_sn',
    catalogItemId: DEFAULT_CABLE_SN_CATALOG_ID,
    conductorMm2: null,
    lengthM: null,
    layingType: 'ziemia',
    ambientTempC: 20,
    groundResistivity: 1,
    ampacityA: null,
  }));

  const segmentName = useMemo(() => {
    if (!segmentRef) return 'Odcinek SN';
    if (!snapshot) return 'Odcinek SN';
    const branches = snapshot.branches ?? [];
    const branch = branches.find((b) => b.ref_id === segmentRef || b.id === segmentRef) ?? null;
    return branch ? segmentPublicIdentity(snapshot, branch as Branch).displayName : 'Odcinek SN';
  }, [segmentRef, snapshot]);

  const catalogOptions = data.family === 'kabel_sn' ? CABLE_SN_CATALOG : LINE_SN_CATALOG;
  const segmentBranch = useMemo(() => {
    if (!segmentRef || !snapshot) return null;
    return (snapshot.branches ?? []).find((branch) => branch.ref_id === segmentRef || branch.id === segmentRef) ?? null;
  }, [segmentRef, snapshot]);
  const endpointStatus = useMemo(
    () => evaluateSegmentEndpoint(snapshot, segmentBranch as Branch | null),
    [segmentBranch, snapshot],
  );
  const runRef = useMemo(() => {
    if (!segmentRef || !snapshot) return null;
    const corridor = (snapshot.corridors ?? []).find((candidate) => {
      const refs = Array.isArray(candidate.ordered_segment_refs) ? candidate.ordered_segment_refs : [];
      return refs.includes(segmentRef);
    });
    return corridor?.ref_id ?? corridor?.id ?? null;
  }, [segmentRef, snapshot]);
  const segmentSummary = useMemo(() => ({
    family: segmentFamilyLabel(segmentBranch as Branch | null, data.family),
    catalog: catalogRefLabel(segmentBranch as Branch | null, data),
    conductor: conductorLabel(segmentBranch as Branch | null, data),
    length: formatLengthM(segmentBranch as Branch | null, data.lengthM),
    ampacity: formatAmpacity(segmentBranch as Branch | null, data.ampacityA),
    endpoint: endpointStatus.isFree ? 'wolny zacisk końcowy' : 'zacisk zajęty',
  }), [data, endpointStatus.isFree, segmentBranch]);
  const isOverheadSegment = segmentBranch
    ? segmentBranch.type === 'line_overhead'
    : data.family === 'linia_napowietrzna_sn';
  const isCableSegment = segmentBranch
    ? segmentBranch.type === 'cable'
    : data.family === 'kabel_sn';
  const canAppendZksn = endpointStatus.isFree && isCableSegment;
  const canAppendBranchPole = endpointStatus.isFree && isOverheadSegment;
  const terminationStandardHint = isOverheadSegment
    ? 'Linia napowietrzna: kontynuuj przez stację albo słup rozgałęźny. ZK SN stosuj na odcinku kablowym.'
    : 'Kabel SN: kontynuuj przez stację albo ZK SN. Słup rozgałęźny stosuj na linii napowietrznej.';
  const openEndpointOperation = (operation: 'insert_station_on_segment_sn' | 'insert_zksn_on_segment_sn' | 'insert_branch_pole_on_segment_sn') => {
    if (!segmentRef) return;
    if (!endpointStatus.isFree) {
      setActionNotice(endpointStatus.reasonPl);
      return;
    }
    if (operation === 'insert_zksn_on_segment_sn' && !isCableSegment) {
      setActionNotice('ZK SN jest rozwiązaniem kablowym. Dla linii napowietrznej wybierz słup rozgałęźny albo stację.');
      return;
    }
    if (operation === 'insert_branch_pole_on_segment_sn' && !isOverheadSegment) {
      setActionNotice('Słup rozgałęźny jest rozwiązaniem linii napowietrznej. Dla kabla wybierz ZK SN albo stację.');
      return;
    }
    const endpointBusRef = endpointStatus.endpointBusRef ?? null;
    setActionNotice(null);
    openOperationForm(operation, {
      segment_id: segmentRef,
      segment_ref: segmentRef,
      segmentRef,
      endpoint_bus_ref: endpointBusRef ?? undefined,
      terminal_id: endpointBusRef ?? undefined,
      terminalId: endpointBusRef ?? undefined,
      placement_mode: endpointBusRef ? 'ENDPOINT_APPEND' : 'RATIO',
      endpoint_role: 'TO_BUS',
      position_on_segment: endpointBusRef ? 1 : 0.5,
      run_ref: runRef ?? undefined,
      corridor_ref: runRef ?? undefined,
      element_ref: segmentRef,
      element_type: 'LineBranch',
    });
  };
  const openEndpointStation = () => {
    const station = endpointStatus.station;
    if (!station || !snapshot) return;
    const stationRef = station.ref_id || station.id;
    const identity = stationPublicIdentity(snapshot, station);
    selectElement({ id: stationRef, type: 'Station', name: identity.displayName });
    centerSldOnElement(stationRef);
    openRouteSurface('E-13', {
      entityRef: stationRef,
      entityType: 'station',
      subjectKind: 'entity',
      subjectRef: stationRef,
      tabId: 'rozdzielnica-sn',
      titlePl: identity.displayName,
      route: 'sld',
      openMode: 'replace_right_panel',
      supportsMiniSld: true,
    });
  };

  return (
    <div data-testid="sn-segment-surface" className="flex h-full w-full flex-col p-4">
      <div
        data-testid="segment-unified-card"
        className="mb-4 border border-scada-border bg-[#0d1726] p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
              Karta odcinka SN
            </div>
            <h2 className="mt-1 text-base font-semibold text-scada-text">{segmentName}</h2>
          </div>
          <span className="border border-scada-sn/40 bg-scada-sn/10 px-2 py-1 text-[11px] font-semibold text-scada-text">
            {segmentSummary.family}
          </span>
        </div>

        <div
          data-testid="segment-technical-summary"
          className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
        >
          <SummaryItem label="Typ katalogowy" value={segmentSummary.catalog} />
          <SummaryItem label="Przewód" value={segmentSummary.conductor} />
          <SummaryItem label="Długość" value={segmentSummary.length} />
          <SummaryItem label="Idd" value={segmentSummary.ampacity} />
          <SummaryItem label="Stan końca trasy" value={segmentSummary.endpoint} />
        </div>

      {segmentRef && (
        <div
          data-testid="segment-end-actions"
          className="mt-4 border-t border-scada-border pt-3"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-scada-muted">
            Dokończenie odcinka
          </div>
          {endpointStatus.isFree && (
            <>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  data-testid="segment-action-append-station"
                  onClick={() => openEndpointOperation('insert_station_on_segment_sn')}
                  className="border border-scada-sn bg-scada-sn/10 px-3 py-2 text-left text-xs font-semibold text-scada-text hover:bg-scada-sn/20"
                >
                  Zakończ stacją SN/nN
                </button>
                {isCableSegment && (
                  <button
                    type="button"
                    data-testid="segment-action-append-zksn"
                    disabled={!canAppendZksn}
                    onClick={() => openEndpointOperation('insert_zksn_on_segment_sn')}
                    className={`border border-scada-border px-3 py-2 text-left text-xs font-semibold text-scada-text ${
                      canAppendZksn
                        ? 'bg-[#07111c] hover:border-scada-sn'
                        : 'cursor-not-allowed bg-[#13202c] opacity-50'
                    }`}
                  >
                    Zakończ ZK SN
                  </button>
                )}
                {isOverheadSegment && (
                  <button
                    type="button"
                    data-testid="segment-action-append-branch-pole"
                    disabled={!canAppendBranchPole}
                    onClick={() => openEndpointOperation('insert_branch_pole_on_segment_sn')}
                    className={`border border-scada-border px-3 py-2 text-left text-xs font-semibold text-scada-text ${
                      canAppendBranchPole
                        ? 'bg-[#07111c] hover:border-scada-sn'
                        : 'cursor-not-allowed bg-[#13202c] opacity-50'
                    }`}
                  >
                    Zakończ słupem rozgałęźnym
                  </button>
                )}
              </div>
              <div
                data-testid="segment-termination-standard"
                className="mt-2 text-[11px] leading-5 text-scada-muted"
              >
                {terminationStandardHint}
              </div>
            </>
          )}
          {!endpointStatus.isFree && (
            <div
              data-testid="segment-endpoint-occupied"
              className="mt-2 border border-[#7c5b1c] bg-[#1f1706] p-3 text-xs leading-5 text-[#ffe08a]"
            >
              <div className="font-semibold text-white">Końcowy zacisk odcinka jest zajęty</div>
              <div className="mt-1">{endpointStatus.reasonPl}</div>
              {endpointStatus.station && (
                <button
                  type="button"
                  data-testid="segment-action-open-end-station"
                  onClick={openEndpointStation}
                  className="mt-3 border border-scada-sn bg-scada-sn/10 px-3 py-2 text-left text-xs font-semibold text-scada-text hover:bg-scada-sn/20"
                >
                  Otwórz stację na końcu odcinka
                </button>
              )}
            </div>
          )}
          {actionNotice && (
            <div
              data-testid="segment-action-notice"
              className="mt-2 border border-[#7c5b1c] bg-[#1f1706] px-3 py-2 text-xs text-[#ffe08a]"
            >
              {actionNotice}
            </div>
          )}
        </div>
      )}
      </div>

      <nav role="tablist" className="flex border-b border-scada-border">
        {(Object.keys(CARD_LABELS) as SegmentCardId[]).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`segment-tab-${id}`}
            data-active={activeCard === id}
            onClick={() => setActiveCard(id)}
            className={
              'whitespace-nowrap px-3 py-2 text-xs font-medium '
              + (activeCard === id
                ? 'border-b-2 border-scada-sn text-scada-text'
                : 'border-b-2 border-transparent text-scada-muted hover:text-scada-text')
            }
          >
            {CARD_LABELS[id]}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-4">
        {activeCard === 'identification' && (
          <div data-testid="segment-content-identification" className="space-y-3">
            <Field
              label="Oznaczenie"
              required
              value={data.designation}
              onChange={(v) => setData((d) => ({ ...d, designation: v }))}
              placeholder="np. K-12 / GPZ-Stacja-01"
            />
            <SelectField
              label="Rodzina"
              required
              value={data.family}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  family: v as SegmentData['family'],
                  catalogItemId:
                    v === 'linia_napowietrzna_sn'
                      ? DEFAULT_LINE_SN_CATALOG_ID
                      : DEFAULT_CABLE_SN_CATALOG_ID,
                }))
              }
              options={[
                { id: 'kabel_sn', label: 'Kabel SN' },
                { id: 'linia_napowietrzna_sn', label: 'Linia napowietrzna SN' },
              ]}
            />
          </div>
        )}

        {activeCard === 'catalog' && (
          <div data-testid="segment-content-catalog" className="space-y-3">
            <SelectField
              label="Typ katalogowy"
              required
              value={data.catalogItemId}
              onChange={(v) => setData((d) => ({ ...d, catalogItemId: v }))}
              options={catalogOptions}
            />
            <NumberField
              label="Przekrój żył roboczych"
              unit="mm²"
              value={data.conductorMm2}
              onChange={(v) => setData((d) => ({ ...d, conductorMm2: v }))}
            />
            <p className="rounded border border-scada-border bg-scada-surface p-2 text-[11px] text-scada-muted">
              Parametry elektryczne odcinka są pobierane z wybranego typu katalogowego.
              Zmiana R/X/C jest operacją ekspercką i wymaga jawnego uzasadnienia technicznego.
            </p>
          </div>
        )}

        {activeCard === 'route' && (
          <div data-testid="segment-content-route" className="space-y-3">
            <NumberField
              label="Długość trasy"
              unit="m"
              required
              value={data.lengthM}
              onChange={(v) => setData((d) => ({ ...d, lengthM: v }))}
              placeholder="np. 850"
            />
            <SelectField
              label="Sposób ułożenia"
              value={data.layingType}
              onChange={(v) => setData((d) => ({ ...d, layingType: v as SegmentData['layingType'] }))}
              options={[
                { id: 'ziemia', label: 'W ziemi' },
                { id: 'kanal', label: 'W kanale' },
                { id: 'powietrze', label: 'W powietrzu' },
              ]}
            />
            <NumberField
              label="Temperatura otoczenia"
              unit="°C"
              value={data.ambientTempC}
              onChange={(v) => setData((d) => ({ ...d, ambientTempC: v }))}
            />
            <NumberField
              label="Rezystywność gruntu"
              unit="K·m/W"
              value={data.groundResistivity}
              onChange={(v) => setData((d) => ({ ...d, groundResistivity: v }))}
            />
          </div>
        )}

        {activeCard === 'rating' && (
          <div data-testid="segment-content-rating" className="space-y-3">
            <NumberField
              label="Obciążalność długotrwała Idd"
              unit="A"
              value={data.ampacityA}
              onChange={(v) => setData((d) => ({ ...d, ampacityA: v }))}
            />
            <p className="rounded border border-scada-border bg-scada-surface p-2 text-[11px] text-scada-muted">
              Wynik analizy obciążalności cieplnej dostępny po obliczeniach
              rozpływu mocy. Aktualny wynik:{' '}
              <span className="font-medium">{MISSING_DASH}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-scada-border/80 bg-scada-surface/70 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-scada-muted">
        {label}
      </div>
      <div className="mt-1 min-h-[1.25rem] break-words text-xs font-semibold text-scada-text">
        {value || MISSING_DASH}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

function Field({ label, value, onChange, placeholder, required }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  unit?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  required?: boolean;
}

function NumberField({ label, unit, value, onChange, placeholder, required }: NumberFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {unit && <span> [{unit}]</span>}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="number"
        value={value === null ? '' : value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(null);
            return;
          }
          const num = Number(raw);
          onChange(Number.isNaN(num) ? null : num);
        }}
        placeholder={placeholder ?? 'Wprowadź wartość'}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  required?: boolean;
}

function SelectField({ label, value, onChange, options, required }: SelectFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text focus:border-scada-sn focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SnSegmentSurface;
