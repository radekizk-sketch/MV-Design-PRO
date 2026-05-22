/**
 * buildTechCardSubject — adapter snapshotu na `TechCardSubject`.
 *
 * Pierwszy plaster integracji ujednoliconej karty technicznej w prawym
 * panelu. Buduje subject dla obsługiwanych klas obiektów (line_segment,
 * station, zksn, branch_pole, der). Dla pozostałych typów zwraca null,
 * a InspectorEngineeringView pokazuje swój dotychczasowy widok jako
 * fallback.
 *
 * Reguły:
 *  - Treść karty wynika ze snapshotu i katalogu. Brak fizyki, brak mutacji.
 *  - Nagłówek i sekcje publiczne nie pokazują surowych `seg/`, `ref_id`,
 *    `hash`, ani UUID-like ciągów. Surowe identyfikatory trafiają wyłącznie
 *    do bloku diagnostyki (zwiniętej domyślnie).
 *  - Akcje to deklaratywne ID (`open_operation:<name>` / `operation:<name>`)
 *    — wykonanie zostaje po stronie wywołującego.
 *
 * @public
 */

import type { CardAction, CardField, CardSection } from '../network-build/cards/ObjectCard';
import {
  isRawTechnicalIdentifier,
  publicTechnicalLabel,
  segmentPublicIdentity,
  stationPublicIdentity,
} from '../shared/publicTechnicalLabels';
import { formatStationSwitchgearLayoutLabelPl } from '../shared/stationTypeLabels';
import { resolveBranchPointBranchPortOccupancy } from '../network-build/operationContextResolvers';
import { selectStationDistributionTransformerRefs } from '../network-build/stationTransformerSelection';
import type {
  BranchPointSN,
  EnergyNetworkModel,
  Generator,
  Branch,
  Substation,
} from '../../types/enm';
import type { SelectedElement } from '../types';
import type { TechCardKind, TechCardSubject } from './types';

type SnapshotLike = EnergyNetworkModel | null | undefined;

export interface BuildTechCardOptions {
  /**
   * Komunikat blokady gotowości obliczeniowej (przekazany z górnego stanu
   * aplikacji). Karta wyświetla go w sekcji „Gotowość obliczeniowa".
   */
  readonly readinessBlocker?: string | null;
}

const ZKSN_TYPE_LABEL = 'ZKSN (złączka kablowa SN)';
const BRANCH_POLE_TYPE_LABEL = 'Słup rozgałęźny linii napowietrznej';

/**
 * Buduje `TechCardSubject` na podstawie zaznaczonego elementu i snapshotu.
 * Zwraca null, gdy klasa elementu nie jest obsługiwana albo dane są
 * niewystarczające (forma fallback w prawym panelu).
 */
export function buildTechCardSubject(
  snapshot: SnapshotLike,
  selectedElement: SelectedElement | null | undefined,
  options: BuildTechCardOptions = {},
): TechCardSubject | null {
  if (!snapshot || !selectedElement) return null;
  const id = selectedElement.id;
  if (!id) return null;

  const segment = findBranch(snapshot, id);
  if (segment && (segment.type === 'cable' || segment.type === 'line_overhead')) {
    return buildSegmentSubject(snapshot, segment, options, selectedElement);
  }

  const station = findStation(snapshot, id);
  if (station) {
    return buildStationSubject(snapshot, station, options);
  }

  const branchPoint = findBranchPoint(snapshot, id);
  if (branchPoint) {
    return buildBranchPointSubject(branchPoint, options);
  }

  const generator = findGenerator(snapshot, id);
  if (generator) {
    return buildDerSubject(generator, options);
  }

  return null;
}

// ----------------------------------------------------------------------------
// Lookups
// ----------------------------------------------------------------------------

function findBranch(snapshot: EnergyNetworkModel, id: string): Branch | null {
  return snapshot.branches?.find((branch) => branch.ref_id === id || branch.id === id) ?? null;
}

function findStation(snapshot: EnergyNetworkModel, id: string): Substation | null {
  return snapshot.substations?.find((station) => station.ref_id === id || station.id === id) ?? null;
}

function findBranchPoint(snapshot: EnergyNetworkModel, id: string): BranchPointSN | null {
  return snapshot.branch_points?.find(
    (branchPoint) => branchPoint.ref_id === id || branchPoint.id === id,
  ) ?? null;
}

function findGenerator(snapshot: EnergyNetworkModel, id: string): Generator | null {
  return snapshot.generators?.find(
    (generator) => generator.ref_id === id || generator.id === id,
  ) ?? null;
}

// ----------------------------------------------------------------------------
// Builders
// ----------------------------------------------------------------------------

function buildSegmentSubject(
  snapshot: EnergyNetworkModel,
  segment: Branch,
  options: BuildTechCardOptions,
  selectedElement: SelectedElement | null | undefined,
): TechCardSubject {
  const { displayName } = segmentPublicIdentity(snapshot, segment);
  const semanticKind = selectedElement?.semanticElementKind
    ?? selectedElement?.semanticEngineeringRole
    ?? null;
  // Selekcja semantyczna (semanticElementKind) jest źródłem prawdy o rodzaju
  // odcinka — branch.type może być nieaktualne (migracje, edycja inline).
  const isOverhead = semanticKind
    ? semanticKind === 'MV_OVERHEAD_SEGMENT'
    : segment.type === 'line_overhead';
  const typeLabelPl = isOverhead ? 'Odcinek linii napowietrznej SN' : 'Odcinek kablowy SN';
  const lengthKm =
    segment.type === 'cable' || segment.type === 'line_overhead'
      ? Number(segment.length_km)
      : null;

  const fields: CardField[] = [
    {
      key: 'rodzaj_odcinka',
      label: 'Rodzaj odcinka',
      value: isOverhead ? 'Linia napowietrzna SN' : 'Kabel SN',
    },
    {
      key: 'dlugosc',
      label: 'Długość',
      value: lengthKm !== null && Number.isFinite(lengthKm) ? lengthKm : null,
      unit: 'km',
    },
    {
      key: 'stan',
      label: 'Stan łącznika',
      value: segment.status === 'open' ? 'Otwarty' : 'Zamknięty',
    },
  ];

  const catalogFields: CardField[] = [
    {
      key: 'pozycja_katalogowa',
      label: 'Pozycja katalogowa',
      value: publicCatalogValue(segment.catalog_ref),
      source: 'catalog',
    },
    {
      key: 'przestrzen_katalogu',
      label: 'Przestrzeń katalogu',
      value: publicCatalogValue(segment.catalog_namespace),
      source: 'catalog',
    },
  ];

  const sections: CardSection[] = [
    { id: 'rola', label: 'Rola w sieci', fields },
    { id: 'katalog', label: 'Katalog', fields: catalogFields },
    {
      id: 'topologia',
      label: 'Topologia',
      fields: [
        {
          key: 'koniec_a',
          label: 'Wejście odcinka',
          value: terminalLabelForSegment(snapshot, segment.from_bus_ref),
        },
        {
          key: 'koniec_b',
          label: 'Wyjście odcinka',
          value: terminalLabelForSegment(snapshot, segment.to_bus_ref),
        },
      ],
    },
  ];

  const actions: CardAction[] = [
    {
      id: 'open_operation:insert_station_on_segment_sn',
      label: 'Wstaw stację na odcinku',
      variant: 'secondary',
      onClick: () => undefined,
    },
    {
      id: 'open_operation:continue_trunk_segment_sn',
      label: 'Kontynuuj ciąg SN',
      variant: 'primary',
      onClick: () => undefined,
    },
  ];

  // Wybór akcji wstawienia zależy ściśle od rodzaju odcinka (ZKSN tylko na
  // kablu, słup tylko na linii napowietrznej). Nie pokazujemy zablokowanej
  // alternatywy — istniejący inspektor poniżej wyświetla pełną semantykę.
  if (isOverhead) {
    actions.push({
      id: 'open_operation:insert_branch_pole_on_segment_sn',
      label: 'Wstaw słup rozgałęźny',
      variant: 'secondary',
      onClick: () => undefined,
    });
  } else {
    actions.push({
      id: 'open_operation:insert_zksn_on_segment_sn',
      label: 'Wstaw ZKSN',
      variant: 'secondary',
      onClick: () => undefined,
    });
  }

  return {
    kind: 'line_segment',
    displayName,
    typeLabelPl,
    technicalId: segment.ref_id || segment.id,
    status: 'none',
    sections,
    actions,
    diagnostics: diagnosticsForRef(segment.ref_id || segment.id, {
      from_bus_ref: segment.from_bus_ref,
      to_bus_ref: segment.to_bus_ref,
      catalog_ref: segment.catalog_ref,
    }),
    readinessBlocker: options.readinessBlocker ?? null,
  };
}

function buildStationSubject(
  snapshot: EnergyNetworkModel,
  station: Substation,
  options: BuildTechCardOptions,
): TechCardSubject {
  const isGpz = String(station.station_type ?? '').toLowerCase() === 'gpz';
  const kind: TechCardKind = isGpz ? 'gpz' : 'station';
  const { displayName, typeLabel } = stationPublicIdentity(snapshot, station);
  const switchgearLabel = formatStationSwitchgearLayoutLabelPl(station.station_type);

  const bays = (snapshot.bays ?? []).filter(
    (bay) => bay.substation_ref === station.ref_id || bay.substation_ref === station.id,
  );
  const grouped = {
    in: bays.filter((bay) => bay.bay_role === 'IN').length,
    out: bays.filter((bay) => bay.bay_role === 'OUT' || bay.bay_role === 'FEEDER').length,
    tr: bays.filter((bay) => bay.bay_role === 'TR').length,
    coupler: bays.filter((bay) => bay.bay_role === 'COUPLER').length,
    measurement: bays.filter((bay) => bay.bay_role === 'MEASUREMENT').length,
    oze: bays.filter((bay) => bay.bay_role === 'OZE').length,
  };

  const transformerCount = selectStationDistributionTransformerRefs(snapshot, station).length;

  const sections: CardSection[] = [
    {
      id: 'rola',
      label: 'Rola w sieci',
      fields: [
        { key: 'typ_stacji', label: 'Typ stacji', value: typeLabel },
        { key: 'uklad', label: 'Układ rozdzielni SN', value: switchgearLabel },
        {
          key: 'transformatory',
          label: 'Liczba transformatorów SN/nN',
          value: transformerCount,
        },
      ],
    },
    {
      id: 'pola',
      label: 'Pola rozdzielni SN',
      fields: [
        { key: 'pole_we', label: 'Pola dopływowe (WE)', value: grouped.in },
        { key: 'pole_wy', label: 'Pola odpływowe (WY)', value: grouped.out },
        { key: 'pole_tr', label: 'Pola transformatorowe (TR)', value: grouped.tr },
        { key: 'pole_sekcja', label: 'Pola sprzęgłowe / sekcyjne', value: grouped.coupler },
        { key: 'pole_pomiar', label: 'Pola pomiarowe', value: grouped.measurement },
        { key: 'pole_oze', label: 'Pola przyłączeniowe OZE', value: grouped.oze },
      ],
    },
  ];

  const actions: CardAction[] = isGpz
    ? [
      {
        id: 'open_operation:continue_trunk_segment_sn',
        label: 'Wyprowadź magistralę SN',
        variant: 'primary',
        onClick: () => undefined,
      },
    ]
    : [
      {
        id: 'open_operation:continue_trunk_segment_sn',
        label: 'Kontynuuj ciąg SN ze stacji',
        variant: 'primary',
        onClick: () => undefined,
      },
      {
        id: 'open_operation:start_branch_segment_sn',
        label: 'Rozpocznij odgałęzienie SN',
        variant: 'secondary',
        onClick: () => undefined,
      },
    ];

  return {
    kind,
    displayName,
    typeLabelPl: typeLabel,
    technicalId: station.ref_id || station.id,
    status: 'none',
    sections,
    actions,
    diagnostics: diagnosticsForRef(station.ref_id || station.id, {
      station_type: station.station_type,
      bus_refs: (station.bus_refs ?? []).join(', '),
    }),
    readinessBlocker: options.readinessBlocker ?? null,
  };
}

function buildBranchPointSubject(
  branchPoint: BranchPointSN,
  options: BuildTechCardOptions,
): TechCardSubject {
  const isZksn = branchPoint.branch_point_type === 'zksn';
  const kind: TechCardKind = isZksn ? 'zksn' : 'branch_pole';
  const typeLabelPl = isZksn ? ZKSN_TYPE_LABEL : BRANCH_POLE_TYPE_LABEL;
  const fallbackName = isZksn ? 'ZKSN' : 'Słup rozgałęźny SN';
  const displayName = publicTechnicalLabel(branchPoint.name, fallbackName);

  const branchPorts = Array.isArray(branchPoint.ports?.BRANCH) ? branchPoint.ports.BRANCH : []; // ui-terminology-ignore
  const freeBranches = branchPorts.filter(
    (_, idx) => !resolveBranchPointBranchPortOccupancy(branchPoint, idx),
  ).length;
  const occupiedBranches = branchPorts.length - freeBranches;

  const portsFields: CardField[] = [
    {
      key: 'main_in',
      label: 'Wejście trasy (MAIN_IN)',
      value: branchPoint.ports?.MAIN_IN ? 'Podłączone' : '—',
    },
    {
      key: 'main_out',
      label: 'Wyjście trasy (MAIN_OUT)',
      value: branchPoint.ports?.MAIN_OUT ? 'Podłączone' : '—',
    },
    {
      key: 'odgalezienia_wolne',
      label: 'Porty odgałęzień wolne',
      value: freeBranches,
    },
    {
      key: 'odgalezienia_zajete',
      label: 'Porty odgałęzień zajęte',
      value: occupiedBranches,
    },
  ];

  if (isZksn) {
    portsFields.push({
      key: 'pola_kablowe',
      label: 'Pola kablowe SN',
      value: 'WE + WY + odgałęzienia (wszystko cable-only)',
    });
  }

  const sections: CardSection[] = [
    {
      id: 'rola',
      label: 'Rola w sieci',
      fields: [
        {
          key: 'rola',
          label: 'Funkcja',
          value: isZksn
            ? 'Złączka kablowa SN z odgałęzieniami (cable-only)'
            : 'Słup linii napowietrznej z odgałęzieniem napowietrznym',
        },
        {
          key: 'stan',
          label: 'Stan łącznika',
          value: switchStateLabel(branchPoint.switch_state),
        },
      ],
    },
    { id: 'porty', label: 'Topologia portów', fields: portsFields },
    {
      id: 'katalog',
      label: 'Katalog',
      fields: [
        {
          key: 'pozycja_katalogowa',
          label: 'Pozycja katalogowa',
          value: publicCatalogValue(branchPoint.catalog_ref),
          source: 'catalog',
        },
        {
          key: 'tryb_zrodla',
          label: 'Tryb źródła',
          value: sourceModeLabel(branchPoint.source_mode),
        },
        {
          key: 'kompletnosc',
          label: 'Kompletność katalogu',
          value: completenessLabel(branchPoint.completeness_status),
        },
      ],
    },
  ];

  const status: TechCardSubject['status'] = (() => {
    if (branchPoint.completeness_status === 'KOMPLETNY') return 'ok';
    if (branchPoint.completeness_status === 'NIEKOMPLETNY') return 'warning';
    if (branchPoint.completeness_status === 'BRAK_KATALOGU') return 'error';
    return 'none';
  })();

  const actions: CardAction[] = isZksn
    ? [
      {
        id: 'open_operation:start_branch_segment_sn',
        label: 'Wyprowadź odgałęzienie kablowe SN',
        variant: 'primary',
        onClick: () => undefined,
        disabled: freeBranches === 0,
      },
    ]
    : [
      {
        id: 'open_operation:start_branch_segment_sn',
        label: 'Wyprowadź linię napowietrzną SN',
        variant: 'primary',
        onClick: () => undefined,
        disabled: freeBranches === 0,
      },
    ];

  return {
    kind,
    displayName,
    typeLabelPl,
    technicalId: branchPoint.ref_id || branchPoint.id,
    status,
    sections,
    actions,
    diagnostics: diagnosticsForRef(branchPoint.ref_id || branchPoint.id, {
      parent_segment_id: branchPoint.parent_segment_id,
      bus_ref: branchPoint.bus_ref,
      catalog_ref: branchPoint.catalog_ref,
    }),
    readinessBlocker: options.readinessBlocker ?? null,
  };
}

function buildDerSubject(
  generator: Generator,
  options: BuildTechCardOptions,
): TechCardSubject {
  const typeLabelPl = derTypeLabel(generator.gen_type);
  const displayName = publicTechnicalLabel(generator.name, typeLabelPl);

  const sections: CardSection[] = [
    {
      id: 'rola',
      label: 'Rola w sieci',
      fields: [
        { key: 'typ', label: 'Typ układu DER', value: typeLabelPl },
        { key: 'p_mw', label: 'Moc czynna znamionowa', value: generator.p_mw, unit: 'MW' },
        {
          key: 'q_mvar',
          label: 'Moc bierna znamionowa',
          value: generator.q_mvar ?? null,
          unit: 'Mvar',
        },
        {
          key: 'wariant',
          label: 'Wariant przyłączenia',
          value: connectionVariantLabel(generator.connection_variant ?? null),
        },
        {
          key: 'modul_nc_rfg',
          label: 'Moduł NC RfG',
          value: generator.nc_rfg_module ?? null,
        },
      ],
    },
    {
      id: 'katalog',
      label: 'Katalog',
      fields: [
        {
          key: 'pozycja_katalogowa',
          label: 'Pozycja katalogowa',
          value: publicCatalogValue(generator.catalog_ref),
          source: 'catalog',
        },
        {
          key: 'przestrzen_katalogu',
          label: 'Przestrzeń katalogu',
          value: publicCatalogValue(generator.catalog_namespace),
          source: 'catalog',
        },
      ],
    },
  ];

  const actions: CardAction[] = [
    {
      id: 'open_operation:update_element_parameters',
      label: 'Uzupełnij dane układu DER',
      variant: 'primary',
      onClick: () => undefined,
    },
  ];

  return {
    kind: 'der',
    displayName,
    typeLabelPl,
    technicalId: generator.ref_id || generator.id,
    status: 'none',
    sections,
    actions,
    diagnostics: diagnosticsForRef(generator.ref_id || generator.id, {
      bus_ref: generator.bus_ref,
      station_ref: generator.station_ref ?? null,
    }),
    readinessBlocker: options.readinessBlocker ?? null,
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function publicCatalogValue(value: string | null | undefined): string {
  if (!value) return 'Do uzupełnienia z katalogu';
  if (isRawTechnicalIdentifier(value)) return 'Pozycja katalogowa przypięta';
  return value;
}

function terminalLabelForSegment(snapshot: EnergyNetworkModel, busRef: string): string {
  const bus = snapshot.buses?.find((candidate) => candidate.ref_id === busRef || candidate.id === busRef);
  if (!bus) return 'Wolny zacisk SN';
  const fallback = `Szyna SN ${bus.voltage_kv} kV`;
  return publicTechnicalLabel(bus.name, fallback);
}

function switchStateLabel(state: string | null | undefined): string {
  if (state === 'closed') return 'Zamknięty';
  if (state === 'open') return 'Otwarty';
  return 'Nieokreślony';
}

function sourceModeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case 'KATALOG':
      return 'Z katalogu';
    case 'MIGRACJA':
      return 'Migracja danych';
    case 'EKSPERCKI_RECZNY':
      return 'Ręczny (ekspert)';
    default:
      return mode ?? '—';
  }
}

function completenessLabel(status: string | null | undefined): string {
  switch (status) {
    case 'KOMPLETNY':
      return 'Kompletny';
    case 'NIEKOMPLETNY':
      return 'Niekompletny';
    case 'BRAK_KATALOGU':
      return 'Powiązanie katalogowe do konfiguracji';
    default:
      return '—';
  }
}

function derTypeLabel(genType: Generator['gen_type'] | null | undefined): string {
  switch (genType) {
    case 'pv_inverter':
      return 'Falownik PV';
    case 'bess':
      return 'Magazyn energii BESS';
    case 'wind_inverter':
    case 'fw_pmsg':
    case 'fw_dfig':
    case 'fw_scig':
      return 'Układ farmy wiatrowej';
    case 'synchronous':
      return 'Generator synchroniczny';
    default:
      return 'Układ PV/BESS/FW';
  }
}

function connectionVariantLabel(variant: string | null): string {
  switch (variant) {
    case 'nn_side':
    case 'block_transformer':
      return 'Po stronie nN stacji (przez TR SN/nN)';
    case 'DEDICATED_MV_CONNECTION':
      return 'Dedykowane pole SN i transformator przyłączeniowy';
    case 'SOURCE_CONNECTION_STATION':
      return 'Osobna stacja przyłączeniowa źródła';
    default:
      return 'Do konfiguracji';
  }
}

function diagnosticsForRef(
  ref: string,
  extras: Record<string, string | null | undefined>,
): CardField[] {
  const fields: CardField[] = [{ key: 'ref_id', label: 'ref_id', value: ref }];
  for (const [key, value] of Object.entries(extras)) {
    if (value === null || value === undefined) continue;
    fields.push({ key, label: key, value });
  }
  return fields;
}
