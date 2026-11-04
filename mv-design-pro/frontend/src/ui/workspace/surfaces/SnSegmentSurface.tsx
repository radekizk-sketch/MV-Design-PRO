/**
 * SnSegmentSurface (E-12) - konfigurator odcinka SN.
 *
 * Etap 4 dostawy: parametry odcinka kabla SN albo linii napowietrznej SN:
 * 4 karty: Identyfikacja & rodzina / Katalog & przewód / Trasa & ułożenie /
 * Obciążalność.
 *
 * Karta JEDNA-SCIEZKA-EDYCJI: każda kontrolka czyta wartość z modelu ENM i zapisuje ją
 * operacją domenową albo jest jawnym odczytem. Dawna karta trzymała osiem pól w lokalnym
 * stanie bez zapisu (oznaczenie, rodzina, przekrój, długość, sposób ułożenia, temperatura
 * otoczenia, rezystywność gruntu, Idd), startowała z wartościami wpisanymi w kod (20 °C,
 * 1 K·m/W, „w ziemi") i miała własną listę katalogową. Teraz:
 * - oznaczenie, długość, warunki ułożenia — definicje rejestru pól (`ui2/model/rejestrPol.ts`)
 *   → `update_element_parameters`;
 * - typ katalogowy — lista z katalogu backendu (`/api/catalog/cable-types`, `line-types`)
 *   → `assign_catalog_to_element`;
 * - rodzina (kabel / linia), przekrój, Idd — odczyt z modelu (zmiana rodziny to inny element,
 *   przekrój i Idd wynikają z typu katalogowego);
 * - temperatura otoczenia i rezystywność gruntu USUNIĘTE: rdzeń korekty obciążalności SN nie
 *   ma tablic IEC 60287 dla tych wielkości, więc pola nie miały żadnego konsumenta. Warunki
 *   ułożenia to nazwany zestaw współczynników z udokumentowaną podstawą (ten sam katalog
 *   zestawów co kreator źródła OZE, `/api/solver/cable-laying-conditions`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveCaseId } from '../../app-state/store';
import { buildCatalogBinding } from '../../catalog/catalogBinding';
import type { CableType, CatalogNamespace, LineType } from '../../catalog/types';
import { fetchCableTypes, fetchLineTypes, getCatalogErrorMessage } from '../../catalog/api';
import {
  fetchCableLayingConditions,
  type CableLayingConditionsCatalog,
} from '../../../ui2/kreatory/zrodlo-oze/derSelectionApi';
import {
  POLE_DLUGOSC_ODCINKA,
  POLE_WARUNKI_ULOZENIA_KABLA,
  polaNazwy,
  warunkiUlozeniaZModelu,
  type DefinicjaPola,
  type RekordModelu,
} from '../../../ui2/model/rejestrPol';
import { MISSING_DASH } from '../../shared/formatPolishValue';
import type { WorkspaceSurfaceDescriptor } from '../types';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSelectionStore } from '../../selection/store';
import { isTerrainSnSegment } from '../../shared/enmVisibility';
import { segmentPublicIdentity, stationPublicIdentity } from '../../shared/publicTechnicalLabels';
import { szynyStacji } from '../../shared/szynyStacji';
import { useDzialaniaPaskaNadOknem } from '../../network-build/inspektor-elementu/panelNadOknem';
import type { Branch, Bus, EnergyNetworkModel, Substation } from '../../../types/enm';

type SegmentCardId = 'identification' | 'catalog' | 'route' | 'rating';

const CARD_LABELS: Record<SegmentCardId, string> = {
  identification: 'Identyfikacja',
  catalog: 'Typ katalogowy i przewód',
  route: 'Trasa i ułożenie',
  rating: 'Obciążalność',
};

/**
 * V12K-352: karta startowa z deep-linku `payload.defaultCard` (wzorzec
 * `stationDefaultCard`/`gpzDefaultCard`). Pozycje menu odcinka („Zmień katalog",
 * „Edytuj parametry ułożenia/linii", „Pokaż obciążalność cieplną") i pasek inspektora
 * („Otwórz konfigurację odcinka (trasa)") obiecują KONKRETNĄ kartę — dotąd konfigurator
 * ignorował payload i zawsze otwierał „Identyfikację". Klucz spoza listy = karta domyślna.
 */
function segmentDefaultCard(routeState: WorkspaceSurfaceDescriptor['routeState'] | undefined): SegmentCardId {
  const payload = routeState?.payload;
  const defaultCard = payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>).defaultCard
    : null;
  return typeof defaultCard === 'string' && Object.prototype.hasOwnProperty.call(CARD_LABELS, defaultCard)
    ? (defaultCard as SegmentCardId)
    : 'identification';
}

interface SegmentEndpointStatus {
  endpointBusRef: string | null;
  isFree: boolean;
  reasonPl: string;
  station: Substation | null;
}

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
  // SZYNY-STACJI-LUSTRO: koniec odcinka leży na zacisku pola stacji (zasada toru), więc
  // przynależność szyny do stacji z jednego lustra `szynyStacji`, nie z `bus_refs`.
  return (snapshot.substations ?? []).find(
    (station) =>
      station.station_type !== 'gpz'
      && szynyStacji(snapshot, station).has(busRef),
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
      reasonPl: 'Końcowy zacisk należy już do układu stacyjnego. Wybierz stację i kontynuuj ciąg z jej pola liniowego wyjściowego.',
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

function formatLengthM(segment: Branch | null): string {
  const metry = segment ? POLE_DLUGOSC_ODCINKA.odczyt(segment as unknown as RekordModelu) : null;
  return typeof metry === 'number' ? `${SEGMENT_NUMBER_FORMAT_PL.format(metry)} m` : MISSING_DASH;
}

/** Idd z modelu (`rating.in_a`, materializowane z typu katalogowego) — odczyt, nie edycja. */
function ampacityA(branch: Branch | null): number | null {
  const rating = branch && 'rating' in branch ? branch.rating : null;
  return typeof rating?.in_a === 'number' ? rating.in_a : null;
}

function formatAmpacity(branch: Branch | null): string {
  const ratedCurrent = ampacityA(branch);
  return ratedCurrent === null ? MISSING_DASH : `${SEGMENT_NUMBER_FORMAT_PL.format(ratedCurrent)} A`;
}

function segmentFamilyLabel(branch: Branch | null): string {
  if (branch?.type === 'line_overhead') return 'Linia napowietrzna SN';
  if (branch?.type === 'cable') return 'Kabel SN';
  return MISSING_DASH;
}

/** Nazwa typu z katalogu backendu (pozycja o identyfikatorze `catalog_ref` odcinka). */
function catalogItemName(catalogRef: string | null | undefined, items: readonly { id: string; name: string }[]): string {
  if (!catalogRef) return MISSING_DASH;
  return items.find((item) => item.id === catalogRef)?.name ?? MISSING_DASH;
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

function conductorLabel(branch: Branch | null, catalogName: string): string {
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
    return normalized ?? catalogName;
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
    return [material, section].filter(Boolean).join(' ') || catalogName;
  }
  return catalogName;
}

function catalogRefLabel(branch: Branch | null, catalogName: string): string {
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
    const conductor = conductorLabel(branch, catalogName);
    if (conductor && conductor !== MISSING_DASH) return `Linia napowietrzna ${conductor}`;
    return catalogName;
  }
  const cableLabel = formatMvCableCatalogLabel(branch, candidate);
  if (cableLabel) return cableLabel;
  if (candidate) {
    const normalized = normalizeCatalogLabel(candidate);
    if (normalized) return normalized;
  }
  return catalogName;
}

interface SnSegmentSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

export function SnSegmentSurface(props: SnSegmentSurfaceProps): JSX.Element {
  const { surface } = props;
  const segmentRef = surface.entityRef ?? null;
  // UI-02b JEDEN-INSPEKTOR: dokończenie odcinka, które pasek działań inspektora nad tym
  // oknem pokazuje dla tego samego odcinka (ta sama pozycja rejestru), nie jest dublowane.
  const dzialaniaPaska = useDzialaniaPaskaNadOknem(segmentRef);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const activeCaseId = useActiveCaseId();
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const openRouteSurface = useNetworkBuildStore((state) => state.openRouteSurface);
  const selectElement = useSelectionStore((state) => state.selectElement);
  const centerSldOnElement = useSelectionStore((state) => state.centerSldOnElement);
  const routeState = surface.routeState;
  const [activeCard, setActiveCard] = useState<SegmentCardId>(() => segmentDefaultCard(routeState));
  // Ponowne wejście deep-linkiem (nowy `routeState` tej samej powierzchni) otwiera kartę,
  // którą obiecała pozycja menu — także gdy okno odcinka jest już otwarte.
  useEffect(() => {
    setActiveCard(segmentDefaultCard(routeState));
  }, [routeState]);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [catalogItems, setCatalogItems] = useState<{ kable: CableType[]; linie: LineType[] }>({ kable: [], linie: [] });
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [layingCatalog, setLayingCatalog] = useState<CableLayingConditionsCatalog | null>(null);
  const [layingCatalogError, setLayingCatalogError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Katalog typów odcinków SN z backendu — ta sama lista co kreator magistrali.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCableTypes(), fetchLineTypes()])
      .then(([kable, linie]) => {
        if (cancelled) return;
        setCatalogItems({ kable: Array.isArray(kable) ? kable : [], linie: Array.isArray(linie) ? linie : [] });
        setCatalogError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCatalogError(getCatalogErrorMessage(error));
      });
    fetchCableLayingConditions()
      .then((katalog) => {
        if (!cancelled) setLayingCatalog(katalog);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLayingCatalogError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const segmentName = useMemo(() => {
    if (!segmentRef) return 'Odcinek SN';
    if (!snapshot) return 'Odcinek SN';
    const branches = snapshot.branches ?? [];
    const branch = branches.find((b) => b.ref_id === segmentRef || b.id === segmentRef) ?? null;
    return branch ? segmentPublicIdentity(snapshot, branch as Branch).displayName : 'Odcinek SN';
  }, [segmentRef, snapshot]);

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
  const isOverheadSegment = segmentBranch?.type === 'line_overhead';
  const isCableSegment = segmentBranch?.type === 'cable';
  const catalogOptions = useMemo(
    () => (isOverheadSegment ? catalogItems.linie : isCableSegment ? catalogItems.kable : []),
    [catalogItems, isCableSegment, isOverheadSegment],
  );
  const segmentSummary = useMemo(() => {
    const branch = segmentBranch as Branch | null;
    const catalogName = catalogItemName(branch?.catalog_ref, catalogOptions);
    return {
      family: segmentFamilyLabel(branch),
      catalog: catalogRefLabel(branch, catalogName),
      conductor: conductorLabel(branch, catalogName),
      length: formatLengthM(branch),
      ampacity: formatAmpacity(branch),
      endpoint: endpointStatus.isFree ? 'wolny zacisk końcowy' : 'zacisk zajęty',
    };
  }, [catalogOptions, endpointStatus.isFree, segmentBranch]);
  const segmentRecord = (segmentBranch ?? {}) as unknown as RekordModelu;
  const layingConditions = segmentBranch ? warunkiUlozeniaZModelu(segmentRecord) : null;
  const canAppendZksn = endpointStatus.isFree && isCableSegment;
  const canAppendBranchPole = endpointStatus.isFree && isOverheadSegment;
  const selectedCatalogNamespace: CatalogNamespace | null = segmentBranch?.catalog_namespace
    ? segmentBranch.catalog_namespace as CatalogNamespace
    : isOverheadSegment
      ? 'LINIA_SN'
      : isCableSegment
        ? 'KABEL_SN'
        : null;
  const selectedCatalogRef = segmentBranch?.catalog_ref ?? null;
  const terminationStandardHint = isOverheadSegment
    ? 'Linia napowietrzna: kontynuuj przez stację albo słup rozgałęźny. ZK SN stosuj na odcinku kablowym.'
    : 'Kabel SN: kontynuuj przez stację albo ZK SN. Słup rozgałęźny stosuj na linii napowietrznej.';
  /** Zapis pola rejestru: walidacja definicji → operacja domenowa (jedna ścieżka edycji). */
  const savePole = useCallback(
    (definicja: DefinicjaPola, wartosc: unknown) => {
      const odmowa = definicja.waliduj(wartosc);
      setFieldErrors((prev) => {
        const next = { ...prev };
        if (odmowa) next[definicja.id] = odmowa;
        else delete next[definicja.id];
        return next;
      });
      if (odmowa) return;
      if (!activeCaseId || !segmentRef) {
        setActionNotice('Zapis parametru odcinka wymaga aktywnego zakresu obliczeń i odcinka SN.');
        return;
      }
      setActionNotice(null);
      const { operacja, ladunek } = definicja.zapis(segmentRef, wartosc, segmentRecord);
      void executeDomainOperation(activeCaseId, operacja, ladunek);
    },
    [activeCaseId, executeDomainOperation, segmentRecord, segmentRef],
  );
  const handleCatalogItemChange = (catalogItemId: string) => {
    if (!catalogItemId) return;
    if (!activeCaseId || !segmentRef || !selectedCatalogNamespace) {
      setActionNotice('Zmiana typu katalogowego wymaga aktywnego zakresu obliczeń i odcinka SN.');
      return;
    }
    setActionNotice(null);
    void executeDomainOperation(activeCaseId, 'assign_catalog_to_element', {
      element_ref: segmentRef,
      catalog_binding: buildCatalogBinding(selectedCatalogNamespace, catalogItemId),
    });
  };
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
    <div
      data-testid="sn-segment-surface"
      data-segment-ref={segmentRef ?? ''}
      className="flex h-full w-full flex-col p-4"
    >
      <div
        data-testid="segment-unified-card"
        className="mb-4 border border-scada-border bg-scada-bg p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-scada-muted">
              Karta odcinka SN
            </div>
            <h2 className="mt-1 text-base font-semibold text-scada-text">{segmentName}</h2>
          </div>
          <span className="border border-scada-sn/40 bg-scada-sn/10 px-2 py-1 text-[length:var(--mvd-font-size-data)] font-semibold text-scada-text">
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

        <div
          data-testid="sld-segment-inspector"
          data-segment-ref={segmentRef ?? ''}
          className="mt-3 grid gap-2 border border-scada-border/70 bg-scada-bg p-3 text-[length:var(--mvd-font-size-data)] text-scada-muted sm:grid-cols-3"
        >
          <div>
            <div className="font-semibold">Odcinek SN</div>
            <div className="mt-1 font-mono text-scada-text">{segmentRef ?? MISSING_DASH}</div>
          </div>
          <div data-testid="sld-segment-inspector-catalog">
            <div className="font-semibold">Katalog</div>
            <div className="mt-1 font-mono text-scada-text">{selectedCatalogRef ?? MISSING_DASH}</div>
          </div>
          <div data-testid="sld-segment-inspector-catalog-family">
            <div className="font-semibold">Przestrzeń katalogu</div>
            <div className="mt-1 font-mono text-scada-text">{selectedCatalogNamespace ?? MISSING_DASH}</div>
          </div>
          <div data-testid="sld-segment-catalog-status" className="sm:col-span-2">
            Aktualny typ: <span className="font-mono text-scada-text">{selectedCatalogRef ?? MISSING_DASH}</span>
          </div>
          <button
            type="button"
            data-testid="sld-segment-open-catalog-picker"
            onClick={() => setActiveCard('catalog')}
            className="border border-scada-border bg-scada-surface px-3 py-2 text-left font-semibold text-scada-text hover:border-scada-sn"
          >
            Zmień typ katalogowy
          </button>
        </div>

      {segmentRef && (
        <div
          data-testid="segment-end-actions"
          className="mt-4 border-t border-scada-border pt-3"
        >
          <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-scada-muted">
            Dokończenie odcinka
          </div>
          {endpointStatus.isFree && (
            <>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {!dzialaniaPaska.has('insert-station') && (
                <button
                  type="button"
                  data-testid="segment-action-append-station"
                  onClick={() => openEndpointOperation('insert_station_on_segment_sn')}
                  className="border border-scada-sn bg-scada-sn/10 px-3 py-2 text-left text-[length:var(--mvd-font-size-data)] font-semibold text-scada-text hover:bg-scada-sn/20"
                >
                  Zakończ stacją SN/nN
                </button>
                )}
                {isCableSegment && !dzialaniaPaska.has('insert-zksn') && (
                  <button
                    type="button"
                    data-testid="segment-action-append-zksn"
                    disabled={!canAppendZksn}
                    onClick={() => openEndpointOperation('insert_zksn_on_segment_sn')}
                    className={`border border-scada-border px-3 py-2 text-left text-[length:var(--mvd-font-size-data)] font-semibold text-scada-text ${
                      canAppendZksn
                        ? 'bg-scada-bg hover:border-scada-sn'
                        : 'cursor-not-allowed bg-scada-surface opacity-50'
                    }`}
                  >
                    Zakończ ZK SN
                  </button>
                )}
                {isOverheadSegment && !dzialaniaPaska.has('insert-pole') && (
                  <button
                    type="button"
                    data-testid="segment-action-append-branch-pole"
                    disabled={!canAppendBranchPole}
                    onClick={() => openEndpointOperation('insert_branch_pole_on_segment_sn')}
                    className={`border border-scada-border px-3 py-2 text-left text-[length:var(--mvd-font-size-data)] font-semibold text-scada-text ${
                      canAppendBranchPole
                        ? 'bg-scada-bg hover:border-scada-sn'
                        : 'cursor-not-allowed bg-scada-surface opacity-50'
                    }`}
                  >
                    Zakończ słupem rozgałęźnym
                  </button>
                )}
              </div>
              <div
                data-testid="segment-termination-standard"
                className="mt-2 text-[length:var(--mvd-font-size-data)] leading-5 text-scada-muted"
              >
                {terminationStandardHint}
              </div>
            </>
          )}
          {!endpointStatus.isFree && (
            <div
              data-testid="segment-endpoint-occupied"
              className="mt-2 border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-3 text-[length:var(--mvd-font-size-data)] leading-5 text-sygnal-uwaga-tusz"
            >
              <div className="font-semibold text-white">Końcowy zacisk odcinka jest zajęty</div>
              <div className="mt-1">{endpointStatus.reasonPl}</div>
              {endpointStatus.station && (
                <button
                  type="button"
                  data-testid="segment-action-open-end-station"
                  onClick={openEndpointStation}
                  className="mt-3 border border-scada-sn bg-scada-sn/10 px-3 py-2 text-left text-[length:var(--mvd-font-size-data)] font-semibold text-scada-text hover:bg-scada-sn/20"
                >
                  Otwórz stację na końcu odcinka
                </button>
              )}
            </div>
          )}
          {actionNotice && (
            <div
              data-testid="segment-action-notice"
              className="mt-2 border border-sygnal-uwaga bg-sygnal-uwaga-tlo px-3 py-2 text-[length:var(--mvd-font-size-data)] text-sygnal-uwaga-tusz"
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
              'whitespace-nowrap px-3 py-2 text-[length:var(--mvd-font-size-data)] font-medium '
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
        {!segmentBranch && (
          <div data-testid="segment-missing-in-model" className="text-[length:var(--mvd-font-size-data)] text-scada-muted">
            Odcinka nie ma w bieżącym modelu sieci — parametry pokaże karta po wskazaniu odcinka na schemacie.
          </div>
        )}

        {segmentBranch && activeCard === 'identification' && (
          <div data-testid="segment-content-identification" className="space-y-3">
            <CommitTextField
              label="Oznaczenie"
              required
              testId="segment-field-name"
              value={typeof segmentBranch.name === 'string' ? segmentBranch.name : ''}
              error={fieldErrors[NAZWA_ODCINKA.id] ?? null}
              onCommit={(v) => savePole(NAZWA_ODCINKA, v)}
              placeholder="np. K-12 / GPZ-Stacja-01"
            />
            <ReadOnlyField
              label="Rodzina"
              testId="segment-field-family"
              value={segmentSummary.family}
              hint="Kabel i linia napowietrzna to różne elementy modelu — zmianę rodziny wykonuje się przez wymianę odcinka."
            />
          </div>
        )}

        {segmentBranch && activeCard === 'catalog' && (
          <div data-testid="segment-content-catalog" className="space-y-3">
            <SelectField
              label="Typ katalogowy"
              required
              value={selectedCatalogRef ?? ''}
              onChange={handleCatalogItemChange}
              options={[
                ...(selectedCatalogRef ? [] : [{ id: '', label: 'Wybierz typ z katalogu' }]),
                ...(selectedCatalogRef && !catalogOptions.some((o) => o.id === selectedCatalogRef)
                  ? [{ id: selectedCatalogRef, label: selectedCatalogRef }]
                  : []),
                ...catalogOptions.map((o) => ({ id: o.id, label: o.name })),
              ]}
              testId="segment-catalog-item-select"
            />
            {catalogError && (
              <div data-testid="segment-catalog-error" className="text-[length:var(--mvd-font-size-data)] text-sygnal-uwaga-tusz">
                {catalogError}
              </div>
            )}
            <ReadOnlyField
              label="Przewód (z typu katalogowego)"
              testId="segment-field-conductor"
              value={segmentSummary.conductor}
            />
            <p className="rounded border border-scada-border bg-scada-surface p-2 text-[length:var(--mvd-font-size-data)] text-scada-muted">
              Parametry elektryczne i przekrój odcinka są pobierane z wybranego typu katalogowego.
              Zmiana R/X/C jest operacją ekspercką i wymaga jawnego uzasadnienia technicznego.
            </p>
          </div>
        )}

        {segmentBranch && activeCard === 'route' && (
          <div data-testid="segment-content-route" className="space-y-3">
            <CommitNumberField
              label={POLE_DLUGOSC_ODCINKA.etykieta}
              unit={POLE_DLUGOSC_ODCINKA.jednostka ?? undefined}
              required
              testId="segment-field-length"
              value={POLE_DLUGOSC_ODCINKA.odczyt(segmentRecord) as number | null}
              error={fieldErrors[POLE_DLUGOSC_ODCINKA.id] ?? null}
              onCommit={(v) => savePole(POLE_DLUGOSC_ODCINKA, v)}
              placeholder="np. 850"
            />
            {isCableSegment ? (
              <LayingConditionsEditor
                catalog={layingCatalog}
                catalogError={layingCatalogError}
                current={layingConditions}
                error={fieldErrors[POLE_WARUNKI_ULOZENIA_KABLA.id] ?? null}
                onSave={(v) => savePole(POLE_WARUNKI_ULOZENIA_KABLA, v)}
              />
            ) : (
              <p data-testid="segment-laying-not-applicable" className="text-[length:var(--mvd-font-size-data)] text-scada-muted">
                Warunki ułożenia dotyczą kabla. Obciążalność linii napowietrznej wynika z typu przewodu.
              </p>
            )}
          </div>
        )}

        {segmentBranch && activeCard === 'rating' && (
          <div data-testid="segment-content-rating" className="space-y-3">
            <ReadOnlyField
              label="Obciążalność długotrwała Idd (z typu katalogowego)"
              testId="segment-field-ampacity"
              value={segmentSummary.ampacity}
            />
            {isCableSegment && (
              <ReadOnlyField
                label="Warunki ułożenia"
                testId="segment-field-laying-summary"
                value={layingSummary(layingCatalog, layingConditions)}
              />
            )}
            <p className="rounded border border-scada-border bg-scada-surface p-2 text-[length:var(--mvd-font-size-data)] text-scada-muted">
              Obciążalność skorygowaną warunkami ułożenia i jej wykorzystanie prądem roboczym
              liczy analiza obciążalności cieplnej po obliczeniu rozpływu mocy.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const NAZWA_ODCINKA = polaNazwy('branches');

/** Opis warunków ułożenia z katalogu zestawów (dane backendu, bez rachunku). */
function layingSummary(
  catalog: CableLayingConditionsCatalog | null,
  current: { set_name: string; opis_pl?: string } | null,
): string {
  if (!catalog) return MISSING_DASH;
  const name = current?.set_name ?? catalog.default_name;
  const set = catalog.sets.find((item) => item.name === name);
  if (name === catalog.custom_name) {
    return `Współczynniki własne${current?.opis_pl ? ` — ${current.opis_pl}` : ''}`;
  }
  return set ? `${set.label_pl} (f = ${SEGMENT_NUMBER_FORMAT_PL.format(set.total)}; ${set.basis})` : name;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-scada-border/80 bg-scada-surface/70 px-3 py-2">
      <div className="text-[length:var(--mvd-font-size-data)] font-semibold text-scada-muted">
        {label}
      </div>
      <div className="mt-1 min-h-[1.25rem] break-words text-[length:var(--mvd-font-size-data)] font-semibold text-scada-text">
        {value || MISSING_DASH}
      </div>
    </div>
  );
}

const INPUT_CLASS =
  'w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none';

function FieldLabel({ label, unit, required }: { label: string; unit?: string; required?: boolean }) {
  return (
    <label className="mb-1 block text-[length:var(--mvd-font-size-data)] text-scada-muted">
      {label}
      {unit && <span> [{unit}]</span>}
      {required && <span className="text-red-400"> *</span>}
    </label>
  );
}

function FieldError({ error, testId }: { error: string | null; testId?: string }) {
  if (!error) return null;
  return (
    <div data-testid={testId ? `${testId}-error` : undefined} className="mt-1 text-[length:var(--mvd-font-size-data)] text-sygnal-uwaga-tusz">
      {error}
    </div>
  );
}

interface CommitTextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  error: string | null;
  testId: string;
  placeholder?: string;
  required?: boolean;
}

/** Pole tekstowe modelu: wartość z modelu, zapis przy opuszczeniu pola albo Enter. */
function CommitTextField({ label, value, onCommit, error, testId, placeholder, required }: CommitTextFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <input
        type="text"
        data-testid={testId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
      <FieldError error={error} testId={testId} />
    </div>
  );
}

interface CommitNumberFieldProps {
  label: string;
  unit?: string;
  value: number | null;
  onCommit: (value: number | null) => void;
  error: string | null;
  testId: string;
  placeholder?: string;
  required?: boolean;
}

function parseNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const num = Number(raw.replace(',', '.'));
  return Number.isFinite(num) ? num : Number.NaN;
}

/** Pole liczbowe modelu: wartość z modelu, zapis przy opuszczeniu pola albo Enter. */
function CommitNumberField({ label, unit, value, onCommit, error, testId, placeholder, required }: CommitNumberFieldProps) {
  const fromModel = value === null ? '' : String(value);
  const [draft, setDraft] = useState(fromModel);
  useEffect(() => setDraft(fromModel), [fromModel]);
  const commit = () => {
    if (draft !== fromModel) onCommit(parseNumber(draft));
  };
  return (
    <div>
      <FieldLabel label={label} unit={unit} required={required} />
      <input
        type="text"
        inputMode="decimal"
        data-testid={testId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        placeholder={placeholder ?? 'Wprowadź wartość'}
        className={INPUT_CLASS}
      />
      <FieldError error={error} testId={testId} />
    </div>
  );
}

function ReadOnlyField({ label, value, testId, hint }: { label: string; value: string; testId: string; hint?: string }) {
  return (
    <div>
      <FieldLabel label={label} />
      <div data-testid={testId} className="rounded border border-scada-border/70 bg-scada-bg px-2 py-1.5 text-sm text-scada-text">
        {value || MISSING_DASH}
      </div>
      {hint && <div className="mt-1 text-[length:var(--mvd-font-size-data)] text-scada-muted">{hint}</div>}
    </div>
  );
}

interface LayingConditionsEditorProps {
  catalog: CableLayingConditionsCatalog | null;
  catalogError: string | null;
  current: { set_name: string; f_grunt?: number; f_wiazka?: number; f_grupa?: number; opis_pl?: string } | null;
  error: string | null;
  onSave: (value: Record<string, unknown>) => void;
}

/**
 * Warunki ułożenia kabla: nazwany zestaw z katalogu backendu (zapis od razu) albo
 * współczynniki własne z opisem (zapis przyciskiem — trzy współczynniki i opis tworzą jeden
 * opis warunków, który backend waliduje w całości).
 */
function LayingConditionsEditor({ catalog, catalogError, current, error, onSave }: LayingConditionsEditorProps) {
  const selected = current?.set_name ?? catalog?.default_name ?? '';
  const [choice, setChoice] = useState(selected);
  useEffect(() => setChoice(selected), [selected]);
  const isCustom = catalog !== null && choice === catalog.custom_name;
  const fromModel = (klucz: 'f_grunt' | 'f_wiazka' | 'f_grupa') =>
    current?.set_name === catalog?.custom_name && typeof current?.[klucz] === 'number' ? String(current[klucz]) : '';
  const [custom, setCustom] = useState({ f_grunt: '', f_wiazka: '', f_grupa: '', opis_pl: '' });
  useEffect(() => {
    setCustom({
      f_grunt: fromModel('f_grunt'),
      f_wiazka: fromModel('f_wiazka'),
      f_grupa: fromModel('f_grupa'),
      opis_pl: current?.set_name === catalog?.custom_name ? current?.opis_pl ?? '' : '',
    });
  }, [current, catalog]);

  if (!catalog) {
    return (
      <div data-testid="segment-laying-loading" className="text-[length:var(--mvd-font-size-data)] text-scada-muted">
        {catalogError ?? 'Wczytywanie zestawów warunków ułożenia z katalogu…'}
      </div>
    );
  }
  const set = catalog.sets.find((item) => item.name === choice);
  return (
    <div className="space-y-2">
      <FieldLabel label="Warunki ułożenia kabla" />
      <select
        data-testid="segment-field-laying"
        value={choice}
        onChange={(e) => {
          const name = e.target.value;
          setChoice(name);
          if (name !== catalog.custom_name) onSave({ set_name: name });
        }}
        className={INPUT_CLASS}
      >
        {catalog.sets.map((item) => (
          <option key={item.name} value={item.name}>
            {item.label_pl}
          </option>
        ))}
        {!catalog.sets.some((item) => item.name === catalog.custom_name) && (
          <option value={catalog.custom_name}>Współczynniki własne</option>
        )}
      </select>
      {set && (
        <div data-testid="segment-laying-basis" className="text-[length:var(--mvd-font-size-data)] text-scada-muted">
          Współczynnik łączny f = {SEGMENT_NUMBER_FORMAT_PL.format(set.total)} · {set.basis}. {set.assumption_pl}
        </div>
      )}
      {isCustom && (
        <div data-testid="segment-laying-custom" className="grid gap-2 sm:grid-cols-3">
          {(['f_grunt', 'f_wiazka', 'f_grupa'] as const).map((klucz) => (
            <div key={klucz}>
              <FieldLabel label={{ f_grunt: 'Współczynnik gruntu', f_wiazka: 'Współczynnik wiązki', f_grupa: 'Współczynnik grupy' }[klucz]} />
              <input
                type="text"
                inputMode="decimal"
                data-testid={`segment-laying-${klucz}`}
                value={custom[klucz]}
                onChange={(e) => setCustom((c) => ({ ...c, [klucz]: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
          ))}
          <div className="sm:col-span-3">
            <FieldLabel label="Opis warunków" required />
            <input
              type="text"
              data-testid="segment-laying-opis"
              value={custom.opis_pl}
              onChange={(e) => setCustom((c) => ({ ...c, opis_pl: e.target.value }))}
              className={INPUT_CLASS}
            />
          </div>
          <button
            type="button"
            data-testid="segment-laying-save"
            onClick={() => {
              const opis: Record<string, unknown> = { set_name: catalog.custom_name, opis_pl: custom.opis_pl.trim() };
              for (const klucz of ['f_grunt', 'f_wiazka', 'f_grupa'] as const) {
                const liczba = parseNumber(custom[klucz]);
                if (liczba !== null) opis[klucz] = liczba;
              }
              onSave(opis);
            }}
            className="border border-scada-sn bg-scada-sn/10 px-3 py-2 text-left text-[length:var(--mvd-font-size-data)] font-semibold text-scada-text hover:bg-scada-sn/20"
          >
            Zapisz współczynniki własne
          </button>
        </div>
      )}
      <p className="text-[length:var(--mvd-font-size-data)] text-scada-muted">{catalog.limitation_pl}</p>
      <FieldError error={error} testId="segment-field-laying" />
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  required?: boolean;
  testId?: string;
}

function SelectField({ label, value, onChange, options, required, testId }: SelectFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-[length:var(--mvd-font-size-data)] text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <select
        data-testid={testId}
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
