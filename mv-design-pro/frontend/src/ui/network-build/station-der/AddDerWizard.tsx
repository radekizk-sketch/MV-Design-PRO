/**
 * AddDerWizard — guided 5-step flow dodawania PV/BESS/FW ze stacji.
 *
 * Przepływ:
 *  Krok 1: Wybór wariantu przyłączenia (SN / nN / transformator dedykowany).
 *  Krok 2: Wybór punktu przyłączenia (existing/new) — kontekstowy katalog.
 *  Krok 3: Wybór urządzenia z katalogu (falownik PV / PCS BESS / turbina FW).
 *  Krok 4: Wybór profilu NC RfG + krzywych LVRT/HVRT (zgodnie z operatorem).
 *  Krok 5: Review & Create — lista obiektów + przycisk "Utwórz".
 *
 * Zasady:
 *  - Każdy wybór ma catalog_ref. Custom value tylko jako pozycja katalogowa
 *    użytkownika (Faza H — out of MVP wizard, ale reguła zachowana).
 *  - Anulowanie w dowolnym kroku usuwa szkic — nie ma pół-obiektów.
 *  - Po Create: attachDer w useStationDerStore + zamknięcie modal'a.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { fetchDerConverterTypes } from '../../catalog/api';
import type { ConverterType, TransformerType } from '../../catalog/types';
import { notify } from '../../notifications/store';
import {
  DerPersistenceApiError,
  postDerGeneratorConfig,
  type DerConnectionVariant,
  type DerGeneratorConfigRequest,
} from '../../sld/v2/canvas/derPersistenceApi';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../types/enm';
import { useAudit2CatalogSnapshot } from './audit2-hooks';
import type { BlockTransformerItem } from './audit2-api';
import {
  formatLvVoltageLabelPl,
  getNcRfgOperator,
  opisKlasyfikacjiNcRfg,
  useBessBatteryTypes,
  useNcRfgModuleClassification,
  useNcRfgOperatorCatalog,
  useStationTransformerTypes,
} from './derRemoteCatalogs';
import {
  KOD_ODMOWY_MOCY_TRANSFORMATORA,
  useDoborTransformatoraDedykowanego,
  useProbaZapisuDer,
} from './probaZapisuDer';
import { generateDeterministicDerId, validateWizardSelections } from './wizard-validation';
import {
  getBlockTransformer,
  getSnConnectionPointKindLabelPl,
  selectBessModesForPcs,
  selectBlockTransformersForDer,
  selectConnectionLevelsForKind,
} from './catalogs';
import {
  usePtpireeManifest,
  type PtpireeManifest,
  type StanRejestruPtpiree,
} from './ptpireeCertifiedInverters';
import { useStationDerStore } from './store';
import { snPointKindForBus } from './zModelu';
import type { ConnectionSide, DerKindUnified, SnConnectionPointKind } from './types';
import { HelpTooltip } from '../../shared/HelpTooltip';
import {
  PUSTE_DANE_MODULU,
  polaNcRfgDoPayloadu,
  zbudujPolaNcRfgGeneratora,
  type FormularzDanychModulu,
} from '../../../ui2/oze/ncrfg/daneModulu';
import { SekcjaDanychModulu } from '../../../ui2/oze/ncrfg/SekcjaDanychModulu';
import { getTooltip } from '../../shared/engineerTooltips';
import {
  powyzejPasmaNn,
  toSamoNapiecieZnamionowe,
  wPasmieNn,
} from '../../../ui2/model/pasmaNapieciowe';
import { selectStationDistributionTransformers } from '../../shared/transformatoryStacji';
import { TekstZWzorami } from '../../../ui2/kreatory/rama/tekstZWzorami';
import { MathInline } from '../../proof/MathRenderer';

export interface AddDerWizardProps {
  readonly isOpen: boolean;
  readonly stationId: string | null;
  readonly stationName: string;
  readonly derKind: DerKindUnified;
  readonly projectId: string;
  readonly onClose: () => void;
  /** Override zegara dla testów (deterministyczne created_at). */
  readonly nowIso?: string;
}

type StepId = 'variant' | 'point' | 'device' | 'profile' | 'review';

type DerDeviceCatalogItem = {
  readonly id: string;
  readonly label_pl: string;
  readonly nominal_power_kw: number;
  readonly nominal_voltage_kv?: number;
  /**
   * Katalog urządzeń DER (PV/BESS/FW) ma WYŁĄCZNIE jedno źródło — backend
   * (karta FAB-I). Pole zostaje jako dowód pochodzenia w White Box wyświetlanym
   * projektantowi, nie jako przełącznik między źródłami.
   */
  readonly catalog_source: 'backend';
  readonly catalog_kind?: 'PV' | 'BESS' | 'WIND';
  readonly manufacturer?: string | null;
  readonly model?: string | null;
  readonly s_n_kva?: number | null;
  readonly qmin_mvar?: number | null;
  readonly qmax_mvar?: number | null;
  readonly cosphi_min?: number | null;
  readonly cosphi_max?: number | null;
  /**
   * Wspolczynnik udzialu zwarciowego z karty producenta (Ik = k_sc * In, IEC 60909-0).
   * `null` = brak deklaracji → domyslka systemowa 1.1 (karta S-2 AUTORYTET); wynik
   * zwarciowy oparty na domyslce NIE jest miarodajny dla doboru aparatury.
   */
  readonly k_sc?: number | null;
  readonly e_kwh?: number | null;
  readonly control_mode?: string | null;
  readonly grid_code?: string | null;
  readonly dynamic_profile_id?: string | null;
  readonly ptpiree_status?: string | null;
  readonly ptpiree_certificate_ref?: string | null;
  readonly ptpiree_document_number?: string | null;
  readonly ptpiree_document_acceptance_date?: string | null;
  readonly ptpiree_wos_version?: string | null;
  readonly ptpiree_wipwc_version?: string | null;
  readonly ptpiree_ppm_scope?: string | null;
  readonly source_reference?: string | null;
  readonly verification_status?: string | null;
  readonly catalog_status?: string | null;
  /**
   * Karta FAB-J: zdolność do pracy w czterech ćwiartkach WYŁĄCZNIE z realnych
   * granic mocy biernej katalogu (`qmin_mvar`/`qmax_mvar`) — `null`, gdy katalog
   * ich nie niesie ("brak danych w katalogu"), nigdy domysł "każdy BESS jest
   * czterokwadrantowy" (usunięty tą kartą razem z `applicable_module_types`,
   * który udawał klasyfikację NC RfG na podstawie samej mocy — patrz
   * `useNcRfgModuleClassification`, jedyne źródło tej klasyfikacji).
   */
  readonly four_quadrant?: boolean | null;
  readonly grid_forming_capable?: boolean;
};

type StationTransformerInfo = {
  readonly ref: string;
  readonly name: string;
  readonly snMva: number;
  readonly hvKv: number | null;
  readonly lvKv: number | null;
};

const STEP_LABELS: Record<StepId, string> = {
  variant: '1 · Wariant przyłączenia',
  point: '2 · Punkt przyłączenia',
  device: '3 · Urządzenie z katalogu',
  profile: '4 · Profil NC RfG i krzywe',
  review: '5 · Podsumowanie',
};

const STEPS: readonly StepId[] = ['variant', 'point', 'device', 'profile', 'review'];

const DER_KIND_LABELS: Record<DerKindUnified, string> = {
  PV: 'PV / FV',
  BESS: 'BESS (magazyn energii)',
  FW: 'Farma wiatrowa',
};

function toBackendConnectionVariant(connectionSide: ConnectionSide): DerConnectionVariant {
  return connectionSide === 'nN' ? 'nn_side' : 'block_transformer';
}

function formatConnectionSideForReview(
  connectionSide: ConnectionSide | null,
  levels: ReturnType<typeof selectConnectionLevelsForKind>,
): string {
  if (!connectionSide) return '';
  return levels.find((level) => level.side === connectionSide)?.label_pl ?? connectionSide;
}

interface WizardSelections {
  connectionSide: ConnectionSide | null;
  /**
   * Liczba jednostek wytwórczych w tej pozycji (V12K-249).
   *
   * Do tej pory kreator wysyłał na sztywno `quantity: 1`, więc farmy 8 × 1 MW NIE DAŁO
   * SIĘ w modelu wyrazić — a moc pozycji, prądy robocze, dobór transformatora, CT
   * i kategoria NC RfG zależą właśnie od iloczynu.
   */
  unitCount: number;
  pccLabel: string;
  /**
   * Karta FAB-K: punkt przyłączenia SN — szyna ISTNIEJĄCA w modelu (szyna SN stacji,
   * `BranchPointSN.bus_ref`, albo szyna `Junction`), wybrana z listy kandydatów
   * migawki. Wymagany gdy `connectionSide==='dedicated_transformer'`. Zastępuje dawne
   * `bayName` (etykieta tekstowa fabrykująca pseudo-referencję `bay_<stacja>_<nazwa>`
   * / `node_zksn_<nazwa>` / `node_branch_pole_<nazwa>` / `node_cable_joint_<nazwa>`).
   */
  snConnectionBusRef: string | null;
  deviceCatalogRef: string | null;
  batteryCatalogRef: string | null;
  ncRfgProfileRef: string | null;
  lvrtCurveRef: string | null;
  hvrtCurveRef: string | null;
  derName: string;
  /** Naprawa eng.10: tryby pracy BESS (multi-select). */
  bessOperationModeRefs: readonly string[];
  /** Pakiet H: katalog transformatora dedykowanego dla dedicated_transformer. */
  blockTransformerCatalogRef: string | null;
  /** Pakiet H: krzywa P(f) — regulacja częstotliwości. */
  pfCurveRef: string | null;
}

const EMPTY_SELECTIONS: WizardSelections = {
  connectionSide: null,
  pccLabel: '',
  snConnectionBusRef: null,
  deviceCatalogRef: null,
  batteryCatalogRef: null,
  unitCount: 1,
  ncRfgProfileRef: null,
  lvrtCurveRef: null,
  hvrtCurveRef: null,
  derName: '',
  bessOperationModeRefs: [],
  blockTransformerCatalogRef: null,
  pfCurveRef: null,
};

// ZERO PRESELEKCJI OPERATORA (V12K-245). Krok „profil" podstawial wczesniej zestaw ENEA
// (profil + krzywe LVRT/HVRT + P(f)), wiec projektant mogl przejsc dalej JEDNYM klikiem,
// nie podejmujac decyzji — a wybor OSD wynika z lokalizacji przylaczenia i determinuje
// krzywe FRT oraz wymagania Q(U). Bramka kroku i tak wymaga profilu, wiec usuniecie
// preselekcji zamienia „domyslnie ENEA" na „wybierz operatora" — bez zadnej straty
// funkcji, za to bez fabrykacji danej projektowej.

function stationToken(stationName: string): string {
  const numeric = stationName.match(/(\d+)(?!.*\d)/)?.[1];
  if (numeric) return `S${numeric.padStart(2, '0')}`;
  const normalized = stationName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase()
    .slice(0, 12);
  return normalized || 'S01';
}

function defaultDerName(derKind: DerKindUnified, stationName: string): string {
  return `${derKind} ${stationToken(stationName)}`;
}

function defaultPccLabel(derKind: DerKindUnified, stationName: string): string {
  return `PCC-${derKind}-${stationToken(stationName)}`;
}

function applyPointDefaults(
  selections: WizardSelections,
  connectionSide: ConnectionSide,
  derKind: DerKindUnified,
  stationName: string,
): WizardSelections {
  // Transformator dedykowany NIE jest tu preselekcjonowany: przed wyborem punktu SN
  // i urządzenia nie znamy napięć, a dawny wybór „pierwszej pozycji katalogu" podstawiał
  // transformator, którego napięć nikt nie sprawdził. Dobiera go próba backendu
  // (`useDoborTransformatoraDedykowanego`) albo projektant.
  return {
    ...selections,
    connectionSide,
    derName: selections.derName.trim() || defaultDerName(derKind, stationName),
    pccLabel: selections.pccLabel.trim() || defaultPccLabel(derKind, stationName),
  };
}

/** Kandydat punktu przyłączenia SN — element ISTNIEJĄCY w migawce (karta FAB-K). */
interface SnConnectionPointCandidate {
  readonly busRef: string;
  readonly kind: SnConnectionPointKind;
  readonly label: string;
  readonly voltageKv: number;
}

/**
 * Szyna nN stacji — jedyny punkt przyłączenia dla `connectionSide==='nN'` (nie
 * jest wyborem: stacja ma DOKŁADNIE jedną szynę nN za swoim transformatorem
 * SN/nN). Mirror backendu (`api/generators.py::_resolve_nn_bus_ref`): pierwsza
 * szyna LV transformatora stacji, w braku transformatora — pierwsza szyna
 * stacji w paśmie nN (`wPasmieNn`, lustro `w_pasmie_nn`).
 */
function resolveStationNnBus(
  snapshot: EnergyNetworkModel | null,
  stationId: string | null,
): { readonly busRef: string; readonly name: string; readonly voltageKv: number } | null {
  if (!snapshot || !stationId) return null;
  const station = (snapshot.substations ?? []).find(
    (candidate) => candidate.ref_id === stationId || candidate.id === stationId,
  );
  if (!station) return null;
  const busByRef = new Map((snapshot.buses ?? []).map((bus) => [bus.ref_id, bus]));

  // SZYNY-STACJI-LUSTRO: transformatory stacji z JEDNEJ reguły
  // (`selectStationDistributionTransformers` — bez transformatora blokowego źródła DER).
  for (const transformer of selectStationDistributionTransformers(snapshot, station)) {
    const lvBus = busByRef.get(transformer.lv_bus_ref);
    if (lvBus) {
      return { busRef: lvBus.ref_id, name: lvBus.name, voltageKv: lvBus.voltage_kv };
    }
  }
  for (const busRef of station.bus_refs ?? []) {
    const bus = busByRef.get(busRef);
    if (bus && wPasmieNn(bus.voltage_kv)) {
      return { busRef: bus.ref_id, name: bus.name, voltageKv: bus.voltage_kv };
    }
  }
  return null;
}

/**
 * Kandydaci punktu przyłączenia SN — WYŁĄCZNIE elementy ISTNIEJĄCE w migawce
 * (karta FAB-K): szyny SN bieżącej stacji, `BranchPointSN` (ZK SN / słup
 * rozgałęźny — elementy sieciowe, niekoniecznie w tej stacji) i `Junction`
 * (odgałęzienie, szyna rozwiązana `snPointKindForBus`). Zero pseudo-referencji
 * fabrykowanych w UI — dawne `node_zksn_<nazwa>` / `bay_<stacja>_<nazwa>` itd.
 * Posortowani deterministycznie (rodzaj, potem etykieta) dla stabilnego UI.
 */
function selectSnConnectionPointCandidates(
  snapshot: EnergyNetworkModel | null,
  stationId: string | null,
): readonly SnConnectionPointCandidate[] {
  if (!snapshot) return [];
  const candidates: SnConnectionPointCandidate[] = [];

  const station = stationId
    ? (snapshot.substations ?? []).find((s) => s.ref_id === stationId || s.id === stationId)
    : null;
  if (station) {
    for (const busRef of station.bus_refs ?? []) {
      const bus = (snapshot.buses ?? []).find((b) => b.ref_id === busRef);
      if (bus && powyzejPasmaNn(bus.voltage_kv)) {
        candidates.push({
          busRef: bus.ref_id,
          kind: 'station_bus',
          label: `${bus.name} (${bus.voltage_kv.toLocaleString('pl-PL')} kV)`,
          voltageKv: bus.voltage_kv,
        });
      }
    }
  }

  for (const branchPoint of snapshot.branch_points ?? []) {
    const bus = (snapshot.buses ?? []).find((b) => b.ref_id === branchPoint.bus_ref);
    if (!bus) continue;
    candidates.push({
      busRef: branchPoint.bus_ref,
      kind: branchPoint.branch_point_type === 'zksn' ? 'zksn' : 'branch_pole',
      label: `${branchPoint.name} (${bus.voltage_kv.toLocaleString('pl-PL')} kV)`,
      voltageKv: bus.voltage_kv,
    });
  }

  for (const junction of snapshot.junctions ?? []) {
    for (const branchRef of junction.connected_branch_refs) {
      const branch = (snapshot.branches ?? []).find((b) => b.ref_id === branchRef);
      if (!branch) continue;
      for (const candidateBusRef of [branch.from_bus_ref, branch.to_bus_ref]) {
        if (snPointKindForBus(snapshot, candidateBusRef) !== 'junction') continue;
        const bus = (snapshot.buses ?? []).find((b) => b.ref_id === candidateBusRef);
        if (!bus || candidates.some((c) => c.busRef === candidateBusRef)) continue;
        candidates.push({
          busRef: candidateBusRef,
          kind: 'junction',
          label: `${junction.name} (${bus.voltage_kv.toLocaleString('pl-PL')} kV)`,
          voltageKv: bus.voltage_kv,
        });
      }
    }
  }

  return candidates.sort((a, b) => {
    const kindOrder = { station_bus: 0, zksn: 1, branch_pole: 2, junction: 3 } as const;
    return kindOrder[a.kind] - kindOrder[b.kind] || a.label.localeCompare(b.label);
  });
}


function readStationTransformers(snapshot: unknown, stationId: string | null): StationTransformerInfo[] {
  if (!snapshot || typeof snapshot !== 'object' || !stationId) return [];
  const model = snapshot as EnergyNetworkModel;
  const station = (model.substations ?? []).find((candidate) =>
    candidate.ref_id === stationId || candidate.id === stationId);
  if (!station) return [];

  // SZYNY-STACJI-LUSTRO: transformatory stacji z JEDNEJ reguły i JEDNEGO filtra
  // transformatora blokowego źródła DER (`selectStationDistributionTransformers`).
  return selectStationDistributionTransformers(model, station).flatMap((transformer) => {
    const ref = transformer.ref_id ?? transformer.id;
    const snMva = transformer.sn_mva;
    if (typeof ref !== 'string' || typeof snMva !== 'number' || !Number.isFinite(snMva)) {
      return [];
    }
    return [{
      ref,
      name: typeof transformer.name === 'string' ? transformer.name : ref,
      snMva,
      hvKv: typeof transformer.uhv_kv === 'number' ? transformer.uhv_kv : null,
      lvKv: typeof transformer.ulv_kv === 'number' ? transformer.ulv_kv : null,
    }];
  });
}

function readStationTransformerCapacityKw(transformers: readonly StationTransformerInfo[]): number | null {
  const totalMva = transformers.reduce((sum, transformer) => sum + transformer.snMva, 0);
  return totalMva > 0 ? totalMva * 1000 : null;
}

function formatKw(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} MW` : `${Math.round(value)} kW`;
}

function formatKva(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 2)} MVA` : `${Math.round(value)} kVA`;
}

function formatMvar(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} MVAr` : '-';
}

function formatKv(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} kV` : '-';
}

function toConverterKind(derKind: DerKindUnified): ConverterType['kind'] {
  return derKind === 'FW' ? 'WIND' : derKind;
}

function mapBackendConverterToDerDevice(item: ConverterType): DerDeviceCatalogItem {
  const pmaxMw = Number.isFinite(item.pmax_mw) ? item.pmax_mw : 0;
  const snMva = Number.isFinite(item.sn_mva) ? item.sn_mva : pmaxMw;
  const nominalPowerKw = Math.max(0, pmaxMw * 1000);
  const manufacturer = item.manufacturer ?? null;
  const model = item.model ?? null;
  return {
    id: item.id,
    label_pl: item.name || [manufacturer, model].filter(Boolean).join(' ') || item.id,
    nominal_power_kw: nominalPowerKw,
    nominal_voltage_kv: item.un_kv,
    catalog_source: 'backend',
    catalog_kind: item.kind === 'WIND' ? 'WIND' : item.kind === 'BESS' ? 'BESS' : 'PV',
    manufacturer,
    model,
    s_n_kva: snMva * 1000,
    qmin_mvar: item.qmin_mvar ?? null,
    qmax_mvar: item.qmax_mvar ?? null,
    cosphi_min: item.cosphi_min ?? null,
    cosphi_max: item.cosphi_max ?? null,
    k_sc: item.k_sc ?? null,
    e_kwh: item.e_kwh ?? null,
    control_mode: item.control_mode ?? null,
    grid_code: item.grid_code ?? null,
    dynamic_profile_id: item.dynamic_profile_id ?? null,
    ptpiree_status: item.ptpiree_status ?? null,
    ptpiree_certificate_ref: item.ptpiree_certificate_ref ?? null,
    ptpiree_document_number: item.ptpiree_document_number ?? null,
    ptpiree_document_acceptance_date: item.ptpiree_document_acceptance_date ?? null,
    ptpiree_wos_version: item.ptpiree_wos_version ?? null,
    ptpiree_wipwc_version: item.ptpiree_wipwc_version ?? null,
    ptpiree_ppm_scope: item.ptpiree_ppm_scope ?? null,
    source_reference: item.source_reference ?? null,
    verification_status: item.verification_status ?? null,
    catalog_status: item.catalog_status ?? null,
    // Karta FAB-J: cztery ćwiartki WYŁĄCZNIE z granic mocy biernej katalogu —
    // qmin ujemny i qmax dodatni to jedyny realny dowód zdolności do pracy w
    // czterech ćwiartkach. Brak obu granic w katalogu = `null` ("brak danych"),
    // nigdy założenie "każdy BESS jest czterokwadrantowy".
    four_quadrant:
      typeof item.qmin_mvar === 'number' && typeof item.qmax_mvar === 'number'
        ? item.qmin_mvar < 0 && item.qmax_mvar > 0
        : null,
    grid_forming_capable: item.control_mode === 'GRID_FORMING',
  };
}

function deviceSearchHaystack(device: DerDeviceCatalogItem): string {
  return [
    device.id,
    device.label_pl,
    device.manufacturer,
    device.model,
    device.control_mode,
    device.grid_code,
    device.dynamic_profile_id,
    device.ptpiree_document_number,
    device.ptpiree_certificate_ref,
    device.ptpiree_wipwc_version,
    device.ptpiree_ppm_scope,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

/**
 * `null` = katalog nie niesie granic mocy biernej — "brak danych", nie "nie".
 * Wołający decyduje, jak potraktować nieznaną zdolność (patrz `selectBessModesForPcs`:
 * nieznane traktujemy jak `false`, żeby nie zaoferować usługi, której nie da się
 * potwierdzić — karta FAB-J, decyzja #6).
 */
function deviceFourQuadrantCapable(device: DerDeviceCatalogItem | null): boolean | null {
  return device?.four_quadrant ?? null;
}

function deviceGridFormingCapable(device: DerDeviceCatalogItem | null): boolean {
  return device?.grid_forming_capable ?? device?.control_mode === 'GRID_FORMING';
}

/**
 * Dokument certyfikatu PTPiREE urządzenia — WYŁĄCZNIE z adnotacji backendu na rekordzie
 * katalogu (`annotate_with_ptpiree_status`: relacja równości producent × model na kluczach
 * znormalizowanych). Karta AB-1a Pakiet D1 usunęła frontowe „dopasowanie" etykiety urządzenia
 * do wykazu zawieraniem podciągu (`findPtpireeCertificateForDevice`): dawało certyfikat
 * urządzeniu, które backend oznacza NIEPOWIAZANY (klasa „fałszywe POWIĄZANY", przed którą
 * ostrzega `mv_ptpiree_catalog.py`), a liczniki i filtr „PTPiREE" tego samego kroku używały
 * już wyłącznie adnotacji — dwa predykaty tej samej relacji.
 */
function resolvePtpireeDocument(device: DerDeviceCatalogItem | null): string {
  return device?.ptpiree_document_number
    ?? device?.ptpiree_certificate_ref
    ?? '-';
}

/**
 * Opis wykazu PTPiREE w kroku „Urządzenie" — wersje, data publikacji i liczność Z MANIFESTU
 * backendu. Stan ładowania i błędu jest jawny: brak odpowiedzi to „rejestr niedostępny",
 * nigdy liczba udająca stan wykazu.
 */
function opisWykazuPtpiree(stan: StanRejestruPtpiree<PtpireeManifest>): string {
  if (stan.stan === 'ladowanie') return '(wczytywanie manifestu wykazu z backendu…)';
  if (stan.stan === 'blad') return `(rejestr PTPiREE niedostępny — ${stan.komunikat})`;
  const wersje = stan.dane.sources.map((zrodlo) => `WiPWC ${zrodlo.wipwc_version}`).join(' i ');
  return `(${wersje}, publikacja ${stan.dane.publication_date}: ${stan.dane.record_count} pozycji)`;
}

function getDeviceNominalVoltageKv(device: unknown): number | null {
  if (!device || typeof device !== 'object') return null;
  const value = (device as { nominal_voltage_kv?: unknown }).nominal_voltage_kv;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fitsSelectedLvVoltage(
  device: DerDeviceCatalogItem,
  connectionSide: ConnectionSide | null,
  stationNnBusVoltageKv: number | null,
): boolean {
  if (connectionSide !== 'nN' || stationNnBusVoltageKv === null) return true;
  const deviceKv = getDeviceNominalVoltageKv(device);
  if (deviceKv === null) return true;
  // Równość DANYCH (napięcie znamionowe przekształtnika = napięcie szyny nN), nie ocena:
  // ta sama równość co reguła backendu `converter.voltage_mismatch`.
  return toSamoNapiecieZnamionowe(deviceKv, stationNnBusVoltageKv);
}

/**
 * Warianty „większego transformatora stacji" — pozycje katalogu backendu o TYCH SAMYCH
 * napięciach znamionowych co transformator stacji (równość danych) i mocy większej od jego
 * mocy, rosnąco. Bez napięć transformatora w modelu nie ma wariantów (dawne podstawienie
 * 15/0,4 kV fabrykowało dopasowanie). Wystarczalność mocy ocenia WYŁĄCZNIE backend (próba
 * zapisu po zmianie transformatora) — lista nie przesiewa wariantów progiem mocy.
 */
function selectTransformerUpgradeOptions(
  currentTransformer: StationTransformerInfo | null,
  catalog: readonly TransformerType[],
): TransformerType[] {
  if (!currentTransformer || currentTransformer.hvKv === null || currentTransformer.lvKv === null) {
    return [];
  }
  const { hvKv, lvKv, snMva } = currentTransformer;
  return catalog
    .filter((item) =>
      toSamoNapiecieZnamionowe(item.voltage_hv_kv, hvKv)
      && toSamoNapiecieZnamionowe(item.voltage_lv_kv, lvKv)
      && item.rated_power_mva > snMva)
    .sort((a, b) => a.rated_power_mva - b.rated_power_mva || a.id.localeCompare(b.id));
}

/**
 * Kandydaci na transformator dedykowany: katalog transformatorów dedykowanych dla rodzaju DER,
 * strona górna RÓWNA napięciu punktu przyłączenia SN (ta sama równość co backend
 * `_resolve_sn_connection_bus`), strona dolna RÓWNA napięciu przekształtnika; rosnąco mocą.
 * Nieznane napięcie nie zawęża listy (krok „Punkt" przed wyborem urządzenia).
 */
function blockTransformerCandidates(
  derKind: DerKindUnified,
  snPointVoltageKv: number | null,
  deviceKv: number | null,
  blockTransformers: readonly BlockTransformerItem[],
): BlockTransformerItem[] {
  return [
    ...selectBlockTransformersForDer(blockTransformers, {
      derKind,
      hvKv: snPointVoltageKv ?? undefined,
      lvKv: deviceKv ?? undefined,
    }),
  ].sort((a, b) => a.sn_kva - b.sn_kva || a.id.localeCompare(b.id));
}

/**
 * JEDNO zadanie zapisu DER dla próby (`dry_run`) i dla zapisu — predykaty parami: werdykt
 * próby i zapisu pochodzą z tej samej konfiguracji. `null` — konfiguracja niekompletna.
 */
function zbudujZadanieDer(args: {
  readonly stationId: string | null;
  readonly derKind: DerKindUnified;
  readonly selections: WizardSelections;
  readonly device: DerDeviceCatalogItem | null;
  readonly blockTransformerCatalogRef: string | null;
  readonly ncRfgModule: DerGeneratorConfigRequest['nc_rfg_module'];
  readonly daneModulu: FormularzDanychModulu;
}): DerGeneratorConfigRequest | null {
  const { stationId, derKind, selections, device } = args;
  if (!stationId || !selections.connectionSide || !selections.deviceCatalogRef || !device) {
    return null;
  }
  if (!(device.nominal_power_kw > 0)) return null;
  const dedykowany = selections.connectionSide === 'dedicated_transformer';
  if (dedykowany && !selections.snConnectionBusRef) return null;
  const liczbaJednostek = Math.max(1, Math.round(selections.unitCount || 1));
  return {
    station_ref: stationId,
    der_kind: derKind,
    // Model trzyma moc CAŁEJ pozycji (backend mnoży moc katalogową przez liczbę sztuk,
    // gdy nie dostanie mocy jawnej) — wysyłamy iloczyn, żeby obie strony mówiły to samo.
    power_mw: (device.nominal_power_kw * liczbaJednostek) / 1000,
    connection_variant: toBackendConnectionVariant(selections.connectionSide),
    catalog_ref: selections.deviceCatalogRef,
    block_transformer_catalog_ref: dedykowany ? args.blockTransformerCatalogRef : null,
    // Karta FAB-K (§0 R3): punkt przyłączenia SN — element ISTNIEJĄCY w modelu (szyna
    // stacji / `BranchPointSN` / `Junction`), WYMAGANY przez backend dla `block_transformer`
    // bez zapisanego `blocking_transformer_ref` (`_resolve_sn_connection_bus`). Pomijany dla
    // `nn_side` — backend go tam nie czyta.
    sn_connection_bus_ref: dedykowany ? selections.snConnectionBusRef ?? undefined : undefined,
    // Karta FAB-K (§0 R2): pakiet baterii BESS z katalogu `BATERIA_BESS` — WYŁĄCZNIE dla BESS
    // (backend odrzuca go na innej technologii: `converter.battery_catalog_not_applicable`).
    battery_catalog_ref: derKind === 'BESS' ? selections.batteryCatalogRef ?? undefined : undefined,
    source_name: selections.derName,
    quantity: liczbaJednostek,
    // Karta FAB-J (decyzja #5): moduł wyliczony PRZEZ BACKEND dla (moc, napięcie
    // przyłączenia). Brak napięcia = pole pominięte: backend weryfikuje `nc_rfg_module`
    // tylko zadeklarowany (`_weryfikuj_modul_ncrfg`), a zgadywanie modułu byłoby fabrykacją.
    nc_rfg_module: args.ncRfgModule ?? undefined,
    // Dane modułu NC RfG (art. 4, data umowy, nastawy, deklaracje) — wyłącznie podane.
    ...polaNcRfgDoPayloadu(args.daneModulu),
  };
}

export function AddDerWizard(props: AddDerWizardProps): JSX.Element | null {
  const { isOpen, stationId, stationName, derKind, projectId, onClose, nowIso } = props;
  const attachDer = useStationDerStore((state) => state.attachDer);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const snapshotCaseId = useSnapshotStore((state) => state.caseId);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const setSnapshot = useSnapshotStore((state) => state.setSnapshot);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const [step, setStep] = useState<StepId>('variant');
  const [selections, setSelections] = useState<WizardSelections>(EMPTY_SELECTIONS);
  const [isCreating, setIsCreating] = useState(false);
  // Plan AB O-50 pkt 5–6 (karta AB-1a Pakiet D2 §0 pkt 8): dane modułu NC RfG zapisywane
  // RAZEM z wytwórcą (`POST …/generators` → `add_converter_source`, jeden walidator
  // backendu). Pusty formularz = stan „nieustalone" (pola nieobecne w ładunku).
  const [daneModulu, setDaneModulu] = useState<FormularzDanychModulu>(PUSTE_DANE_MODULU);
  const wynikDanychModulu = useMemo(() => zbudujPolaNcRfgGeneratora(daneModulu), [daneModulu]);
  const [selectedTransformerUpgradeRef, setSelectedTransformerUpgradeRef] = useState('');
  const [isUpdatingTransformer, setIsUpdatingTransformer] = useState(false);
  // Wykaz PTPiREE: WYŁĄCZNIE manifest z backendu (liczność i wersja w opisie kroku) — status
  // certyfikatu urządzeń niesie adnotacja backendu na rekordach katalogu, nie ten wykaz.
  const ptpireeManifest = usePtpireeManifest();
  const [backendDeviceCatalog, setBackendDeviceCatalog] =
    useState<DerDeviceCatalogItem[] | null>(null);
  const [deviceCatalogStatus, setDeviceCatalogStatus] =
    useState<'loading' | 'backend' | 'error'>('loading');
  const [deviceCatalogError, setDeviceCatalogError] = useState<string | null>(null);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [deviceVoltageFilter, setDeviceVoltageFilter] = useState('all');
  const [deviceModeFilter, setDeviceModeFilter] = useState('all');
  // Karta FAB-J: PF curves + transformatory dedykowane WYŁĄCZNIE ze snapshotu
  // audytu 2 już pobieranego przez kreator — zero drugiego zapytania sieciowego
  // dla danych, które i tak przychodzą (decyzja #1/#7 karty).
  const auditCatalogSnapshotQuery = useAudit2CatalogSnapshot();
  const pfCurves = auditCatalogSnapshotQuery.data?.pf_curves ?? [];
  const blockTransformers = auditCatalogSnapshotQuery.data?.block_transformers ?? [];
  // Karta FAB-L: tryby pracy BESS WYŁĄCZNIE ze snapshotu audytu 2 — zero
  // statyku modułowego usuniętego z `catalogs.ts` (`BESS_OPERATION_MODE_CATALOG`).
  const bessOperationModes = auditCatalogSnapshotQuery.data?.bess_operation_modes ?? [];
  // Karta FAB-J: operatorzy NC RfG (profil + ride-through LVRT/HVRT 1:1 na
  // operatora) — `GET /api/ncrfg-tests/catalog` (decyzja #2).
  const ncRfgOperatorsQuery = useNcRfgOperatorCatalog();
  const ncRfgOperators = ncRfgOperatorsQuery.data ?? [];
  // Karta FAB-J: pakiety baterii BESS — `GET /api/catalog/bess-battery-types`
  // (decyzja #4). Backend nie miał żadnego katalogu baterii przed tą kartą.
  const bessBatteryTypesQuery = useBessBatteryTypes();
  const bessBatteries = bessBatteryTypesQuery.data ?? [];

  useEffect(() => {
    if (!isOpen) return undefined;
    let active = true;
    setDeviceCatalogStatus('loading');
    setDeviceCatalogError(null);
    void fetchDerConverterTypes(toConverterKind(derKind))
      .then((records) => {
        if (!active) return;
        if (!Array.isArray(records)) {
          throw new Error('Backend nie zwrócił listy konwerterów DER.');
        }
        const mapped = records
          .map(mapBackendConverterToDerDevice)
          .filter((device) => device.nominal_power_kw > 0);
        if (mapped.length === 0) {
          throw new Error('Katalog konwerterów nie zawiera pozycji dla wybranego typu DER.');
        }
        setBackendDeviceCatalog(mapped);
        setDeviceCatalogStatus('backend');
      })
      .catch((error) => {
        if (!active) return;
        setBackendDeviceCatalog(null);
        setDeviceCatalogStatus('error');
        setDeviceCatalogError(
          error instanceof Error
            ? error.message
            : 'Nie udało się pobrać katalogu konwerterów DER.',
        );
      });
    return () => {
      active = false;
    };
  }, [derKind, isOpen]);

  // Reset stanu kreatora przy każdym otwarciu.
  useEffect(() => {
    if (isOpen) {
      setStep('variant');
      setSelections({ ...EMPTY_SELECTIONS });
      setDeviceSearch('');
      setDeviceVoltageFilter('all');
      setDeviceModeFilter('all');
    }
  }, [isOpen, derKind]);

  // Naprawa hmi.11: reset stanu również przy zamknięciu, aby uniknąć
  // wycieku poprzednich selekcji do następnego otwarcia (np. innym DER).
  const handleClose = useCallback(() => {
    setStep('variant');
    setSelections({ ...EMPTY_SELECTIONS });
    setDaneModulu(PUSTE_DANE_MODULU);
    setDeviceSearch('');
    setDeviceVoltageFilter('all');
    setDeviceModeFilter('all');
    onClose();
  }, [onClose]);

  const levels = useMemo(() => selectConnectionLevelsForKind(derKind), [derKind]);

  // Karta FAB-K: szyna nN stacji — JEDYNY punkt przyłączenia dla poziomu 'nN'
  // (nie jest wyborem projektanta, patrz `resolveStationNnBus`).
  const stationNnBus = useMemo(
    () => resolveStationNnBus(snapshot, stationId),
    [snapshot, stationId],
  );
  // Karta FAB-K: kandydaci punktu przyłączenia SN — WYŁĄCZNIE elementy
  // istniejące w migawce (szyny SN stacji / BranchPointSN / Junction).
  const snConnectionPointCandidates = useMemo(
    () => selectSnConnectionPointCandidates(snapshot, stationId),
    [snapshot, stationId],
  );
  const selectedSnConnectionPoint = useMemo(
    () => snConnectionPointCandidates.find((c) => c.busRef === selections.snConnectionBusRef) ?? null,
    [snConnectionPointCandidates, selections.snConnectionBusRef],
  );

  const stationBelongsToSnapshot = useMemo(() => {
    if (!snapshot || !stationId) return false;
    return (snapshot.substations ?? []).some(
      (station) => station.ref_id === stationId || station.id === stationId,
    );
  }, [snapshot, stationId]);

  const effectiveCaseId = stationBelongsToSnapshot && snapshotCaseId
    ? snapshotCaseId
    : activeCaseId;

  // Karta FAB-J: backend niesie JEDNĄ parę krzywych ride-through (LVRT/HVRT) na
  // operatora (`NcRfgOperatorItem.ride_through`) — nie różnicuje ich wg modułu,
  // więc front przestaje udawać wybór, którego backend nie oferuje. Krzywa jest
  // pochodną wyboru operatora (`selections.lvrtCurveRef === selections.ncRfgProfileRef`,
  // patrz `wizard-validation.ts`), nie niezależną decyzją projektanta.
  const selectedNcRfgOperator = useMemo(
    () => getNcRfgOperator(ncRfgOperators, selections.ncRfgProfileRef),
    [ncRfgOperators, selections.ncRfgProfileRef],
  );

  // ZERO LISTY ZASTĘPCZEJ (FAB-I). Katalog urządzeń DER (PV/BESS/FW) pochodzi
  // WYŁĄCZNIE z backendu — brak/błąd odpowiedzi backendu to uczciwy stan pusty,
  // NIE podstawienie statycznej listy `catalogs.ts`. Użytkownik nie może wybrać
  // urządzenia, którego backend nie zna, więc zapis nigdy nie odbije się od
  // walidacji 422 z powodu urządzenia widocznego tylko lokalnie.
  const deviceCatalog = useMemo<readonly DerDeviceCatalogItem[]>(
    () => backendDeviceCatalog ?? [],
    [backendDeviceCatalog],
  );

  const stationTransformers = useMemo(
    () => readStationTransformers(snapshot, stationId),
    [snapshot, stationId],
  );

  const stationTransformerCapacityKw = useMemo(
    () => readStationTransformerCapacityKw(stationTransformers),
    [stationTransformers],
  );

  const primaryStationTransformer = stationTransformers[0] ?? null;

  // Zgodność listy urządzeń z wariantem nN to RÓWNOŚĆ napięcia znamionowego z szyną nN
  // (dana). Moc transformatora stacji wobec mocy źródła ocenia wyłącznie backend — próbą
  // zapisu wybranej konfiguracji (`useProbaZapisuDer`), bez progu P/cosφ we froncie.
  const compatibleDeviceCatalog = useMemo(
    () => deviceCatalog.filter((device) =>
      fitsSelectedLvVoltage(device, selections.connectionSide, stationNnBus?.voltageKv ?? null)),
    [deviceCatalog, selections.connectionSide, stationNnBus],
  );

  const incompatibleDeviceCount = deviceCatalog.length - compatibleDeviceCatalog.length;

  const deviceVoltageOptions = useMemo(
    () => Array.from(new Set(
      deviceCatalog
        .map((device) => getDeviceNominalVoltageKv(device))
        .filter((value): value is number => value !== null),
    )).sort((a, b) => a - b),
    [deviceCatalog],
  );

  const filteredDeviceCatalog = useMemo(() => {
    const normalizedSearch = deviceSearch.trim().toLowerCase();
    return deviceCatalog.filter((device) => {
      if (normalizedSearch && !deviceSearchHaystack(device).includes(normalizedSearch)) {
        return false;
      }
      if (
        deviceVoltageFilter !== 'all'
        && getDeviceNominalVoltageKv(device)?.toFixed(2) !== deviceVoltageFilter
      ) {
        return false;
      }
      if (deviceModeFilter === 'ptpiree' && resolvePtpireeDocument(device) === '-') {
        return false;
      }
      if (deviceModeFilter === 'gfm' && !deviceGridFormingCapable(device)) {
        return false;
      }
      if (
        deviceModeFilter === 'q-control'
        && !device.control_mode
        && (device.qmin_mvar === null || device.qmin_mvar === undefined)
        && (device.qmax_mvar === null || device.qmax_mvar === undefined)
      ) {
        return false;
      }
      return true;
    });
  }, [deviceCatalog, deviceModeFilter, deviceSearch, deviceVoltageFilter]);

  const deviceCatalogCounters = useMemo(() => ({
    total: deviceCatalog.length,
    filtered: filteredDeviceCatalog.length,
    ptpiree: deviceCatalog.filter((device) => resolvePtpireeDocument(device) !== '-').length,
    gfm: deviceCatalog.filter(deviceGridFormingCapable).length,
    backend: deviceCatalog.filter((device) => device.catalog_source === 'backend').length,
  }), [deviceCatalog, filteredDeviceCatalog.length]);

  const deviceSelectOptions = useMemo(
    () => filteredDeviceCatalog.map((device) => {
      const voltageOk = fitsSelectedLvVoltage(
        device,
        selections.connectionSide,
        stationNnBus?.voltageKv ?? null,
      );
      const ptpireeDocument = resolvePtpireeDocument(device);
      const ptpireeSuffix = ptpireeDocument !== '-' ? ` · PTPiREE ${ptpireeDocument}` : '';
      if (voltageOk) {
        return { id: device.id, label: `${device.label_pl}${ptpireeSuffix}` };
      }
      return {
        id: device.id,
        label: `${device.label_pl}${ptpireeSuffix} — wymaga innego poziomu napięcia`,
      };
    }),
    [filteredDeviceCatalog, selections.connectionSide, stationNnBus],
  );

  const selectedDevice = useMemo(
    () => deviceCatalog.find((d) => d.id === selections.deviceCatalogRef) ?? null,
    [deviceCatalog, selections.deviceCatalogRef],
  );

  const availableBessModes = useMemo(
    () => derKind === 'BESS' && selectedDevice
      ? selectBessModesForPcs(bessOperationModes, {
        // Nieznana zdolność (katalog bez qmin/qmax) = `false`: nie oferujemy
        // usługi, której nie potwierdza katalog (karta FAB-J, decyzja #6).
        fourQuadrant: deviceFourQuadrantCapable(selectedDevice) ?? false,
        gridFormingCapable: deviceGridFormingCapable(selectedDevice),
      })
      : [],
    [derKind, selectedDevice, bessOperationModes],
  );

  const availableBessModeIds = useMemo(
    () => availableBessModes.map((mode) => mode.id).join('|'),
    [availableBessModes],
  );

  // Wersja modelu w kluczu prób backendu: każda nowa migawka (np. po zmianie transformatora
  // stacji) to nowa próba — werdykt nigdy nie dotyczy modelu sprzed zmiany.
  const licznikMigawekRef = useRef(0);
  const wersjaModelu = useMemo(() => {
    licznikMigawekRef.current += 1;
    const header = (snapshot as { header?: { hash_sha256?: unknown } } | null)?.header;
    const hash = typeof header?.hash_sha256 === 'string' ? header.hash_sha256 : '';
    return `${hash}#${licznikMigawekRef.current}`;
  }, [snapshot]);
  const kontekstProby = useMemo(
    () => ({ projectId, caseId: effectiveCaseId, wersjaModelu }),
    [effectiveCaseId, projectId, wersjaModelu],
  );

  const selectedDeviceKv = getDeviceNominalVoltageKv(selectedDevice);
  const snPointVoltageKv = selectedSnConnectionPoint?.voltageKv ?? null;
  // Kandydaci z RÓWNOŚCI napięć (punkt SN ↔ strona górna, przekształtnik ↔ strona dolna).
  const kandydaciTransformatoraDedykowanego = useMemo(
    () => blockTransformerCandidates(derKind, snPointVoltageKv, selectedDeviceKv, blockTransformers),
    [blockTransformers, derKind, selectedDeviceKv, snPointVoltageKv],
  );
  // Ci sami kandydaci bez znanego punktu SN — przełączenie z wariantu nN na dedykowany.
  const kandydaciDlaNapieciaUrzadzenia = useMemo(
    () => blockTransformerCandidates(derKind, null, selectedDeviceKv, blockTransformers),
    [blockTransformers, derKind, selectedDeviceKv],
  );

  // Dobór transformatora dedykowanego = najmniejszy kandydat, którego konfigurację backend
  // przyjmuje (kontrola mocy O-53 w `add_converter_source`) — dawny dobór liczył próg
  // P/0,9 we froncie (założone cos φ = 0,9), sprzeczny z regułą backendu.
  const zadanieDoboruTransformatora = useMemo(
    () => selections.connectionSide === 'dedicated_transformer'
      && selectedDeviceKv !== null
      && snPointVoltageKv !== null
      && (derKind !== 'BESS' || selections.batteryCatalogRef !== null)
      ? zbudujZadanieDer({
        stationId,
        derKind,
        selections,
        device: selectedDevice,
        blockTransformerCatalogRef: null,
        ncRfgModule: null,
        daneModulu: PUSTE_DANE_MODULU,
      })
      : null,
    [derKind, selectedDevice, selectedDeviceKv, selections, snPointVoltageKv, stationId],
  );
  const doborTransformatoraQuery = useDoborTransformatoraDedykowanego(
    kontekstProby,
    zadanieDoboruTransformatora,
    kandydaciTransformatoraDedykowanego,
  );
  const autoBlockTransformer = doborTransformatoraQuery.data?.wybrany ?? null;
  const odmowaDoboruTransformatora = doborTransformatoraQuery.data?.odmowa ?? null;

  const effectiveBlockTransformerCatalogRef = useMemo(() => {
    if (selections.connectionSide !== 'dedicated_transformer') {
      return null;
    }
    return (
      autoBlockTransformer?.id
      ?? selections.blockTransformerCatalogRef
      ?? kandydaciTransformatoraDedykowanego[0]?.id
      ?? null
    );
  }, [
    autoBlockTransformer,
    kandydaciTransformatoraDedykowanego,
    selections.blockTransformerCatalogRef,
    selections.connectionSide,
  ]);

  // Karta FAB-J (decyzja #5): napięcie w punkcie przyłączenia — WYPROWADZONE tą
  // samą regułą, co backend (`api/generators.py::_napiecie_przylaczenia_kv`):
  // dla nN to poziom napięcia szyny nN, dla każdego innego wariantu — strona
  // górna (SN) transformatora dedykowanego. Bez tego napięcia klasyfikacji nie
  // da się policzyć uczciwie, więc zostaje `null` (backend i tak weryfikuje
  // moduł tylko wtedy, gdy klient go zadeklarował — brak deklaracji nie blokuje
  // zapisu, patrz `_weryfikuj_modul_ncrfg`).
  const napiecicPrzylaczeniaKv = useMemo(() => {
    if (selections.connectionSide === 'nN') {
      return stationNnBus?.voltageKv ?? null;
    }
    return getBlockTransformer(blockTransformers, effectiveBlockTransformerCatalogRef)?.hv_kv ?? null;
  }, [
    blockTransformers,
    effectiveBlockTransformerCatalogRef,
    selections.connectionSide,
    stationNnBus,
  ]);

  const liczbaJednostekWybranych = Math.max(1, Math.round(selections.unitCount || 1));
  const mocGrupyKwLive =
    selectedDevice && selectedDevice.nominal_power_kw > 0
      ? selectedDevice.nominal_power_kw * liczbaJednostekWybranych
      : null;

  // Karta FAB-J (decyzja #5): JEDYNE źródło klasyfikacji modułu NC RfG —
  // `catalog/profiles/nc_rfg::klasyfikacja_modulu` przez `GET /api/ncrfg-tests/modul`. Kreator
  // POKAZUJE oczekiwany moduł projektantowi i wysyła go jawnie w
  // `POST .../generators`, gdzie backend weryfikuje go NIEZALEŻNIE (422 przy
  // rozjeździe) — zero duplikacji progów ustawowych w froncie.
  const ncRfgModuleQuery = useNcRfgModuleClassification(mocGrupyKwLive, napiecicPrzylaczeniaKv);
  // Typ modułu z klasyfikacji backendu; `null` poniżej progu istotności (powód w `powod_pl`)
  // albo gdy klasyfikacji nie da się wyznaczyć (brak mocy lub napięcia przyłączenia).
  const expectedNcRfgModule = ncRfgModuleQuery.data?.modul ?? null;
  const opisKlasyfikacji = opisKlasyfikacjiNcRfg(ncRfgModuleQuery);

  const stationTransformerTypesQuery = useStationTransformerTypes();
  const transformerUpgradeOptions = useMemo(
    () => selectTransformerUpgradeOptions(
      primaryStationTransformer,
      stationTransformerTypesQuery.data ?? [],
    ),
    [primaryStationTransformer, stationTransformerTypesQuery.data],
  );

  const voltageMismatchWarning = useMemo(() => {
    if (selections.connectionSide !== 'nN' || !stationNnBus || !selectedDevice) {
      return null;
    }
    if (!('nominal_voltage_kv' in selectedDevice)) return null;
    const deviceKv = selectedDevice.nominal_voltage_kv as number;
    if (!toSamoNapiecieZnamionowe(deviceKv, stationNnBus.voltageKv)) {
      return (
        `Niezgodność napięcia: urządzenie ${deviceKv.toFixed(2)} kV vs `
        + `szyna nN ${stationNnBus.voltageKv.toFixed(2)} kV. `
        + 'Wymagany transformator dedykowany albo zmiana wariantu przyłączenia.'
      );
    }
    return null;
  }, [selections.connectionSide, stationNnBus, selectedDevice]);

  // Werdykt backendu dla WYBRANEJ konfiguracji — próba zapisu tej samej końcówki co
  // „Utwórz" (to samo zadanie `zbudujZadanieDer`). Znana niezgodność napięcia nie jest
  // próbowana (komunikat wyżej mówi więcej niż odmowa backendu o tym samym).
  const zadanieProby = useMemo(
    () => voltageMismatchWarning === null
      && (derKind !== 'BESS' || selections.batteryCatalogRef !== null)
      && (selections.connectionSide !== 'dedicated_transformer'
        || effectiveBlockTransformerCatalogRef !== null)
      ? zbudujZadanieDer({
        stationId,
        derKind,
        selections,
        device: selectedDevice,
        blockTransformerCatalogRef: effectiveBlockTransformerCatalogRef,
        ncRfgModule: expectedNcRfgModule,
        daneModulu: wynikDanychModulu.stan === 'ok' ? daneModulu : PUSTE_DANE_MODULU,
      })
      : null,
    [
      daneModulu,
      derKind,
      effectiveBlockTransformerCatalogRef,
      expectedNcRfgModule,
      selectedDevice,
      selections,
      stationId,
      voltageMismatchWarning,
      wynikDanychModulu.stan,
    ],
  );
  const probaQuery = useProbaZapisuDer(kontekstProby, zadanieProby);
  const odmowaProby = probaQuery.data?.stan === 'odmowa' ? probaQuery.data : null;
  const transformerPowerWarning =
    odmowaProby?.kod === KOD_ODMOWY_MOCY_TRANSFORMATORA ? odmowaProby.komunikat : null;
  const innaOdmowaProby =
    odmowaProby && odmowaProby.kod !== KOD_ODMOWY_MOCY_TRANSFORMATORA ? odmowaProby.komunikat : null;
  // Werdykt backendu PRZED przejściem dalej: próba konfiguracji i dobór transformatora
  // dedykowanego w toku blokują krok (bez tego „Dalej” w oknie odpowiedzi przepuszczał
  // konfigurację, której odmowa przychodziła chwilę później).
  const werdyktBackenduWToku =
    (zadanieProby !== null && probaQuery.isFetching)
    || (zadanieDoboruTransformatora !== null && doborTransformatoraQuery.isFetching);

  const canGoNext = useMemo(() => {
    switch (step) {
      case 'variant':
        return selections.connectionSide !== null;
      case 'point':
        return (
          selections.derName.trim().length > 0 &&
          selections.pccLabel.trim().length > 0 &&
          // nN: stacja musi mieć realną szynę nN w modelu (patrz `resolveStationNnBus`)
          (selections.connectionSide !== 'nN' || stationNnBus !== null) &&
          // SN via transformator dedykowany: punkt przyłączenia MUSI wskazywać
          // element ISTNIEJĄCY w modelu (karta FAB-K, §0 R3) — bez fabrykowanej
          // pseudo-referencji.
          (selections.connectionSide !== 'dedicated_transformer' || selections.snConnectionBusRef !== null)
        );
      case 'device':
        // Katalog niegotowy (ładowanie/pusty/błąd backendu) BLOKUJE krok — bez
        // wyjątku dla ewentualnej resztki wyboru sprzed zmiany technologii.
        return deviceCatalogStatus === 'backend'
          && selections.deviceCatalogRef !== null
          && voltageMismatchWarning === null
          && transformerPowerWarning === null
          && innaOdmowaProby === null
          && !werdyktBackenduWToku
          && (
            selections.connectionSide !== 'dedicated_transformer'
            || effectiveBlockTransformerCatalogRef !== null
          )
          // Karta FAB-K (§0 R3, KLASA NIE INSTANCJA — predykaty parami): TA SAMA
          // bramka co krok „Punkt" — punkt przyłączenia SN wymagany dla
          // dedicated_transformer NIEZALEŻNIE od tego, JAK projektant tam trafił
          // (wybór na kroku 1, albo przełączenie „na transformator dedykowany"
          // wprost z ostrzeżenia napięciowego na kroku „Urządzenie"). Bez tej
          // powtórzonej bramki przełączenie ze skrótu omijało krok „Punkt" i
          // pozwalało dojść do podsumowania bez punktu SN — backend i tak
          // odrzuciłby zapis 422-ką, ale dopiero po kliknięciu „Utwórz".
          && (
            selections.connectionSide !== 'dedicated_transformer'
            || selections.snConnectionBusRef !== null
          )
          && (
            derKind !== 'BESS'
            || (selections.batteryCatalogRef !== null && selections.bessOperationModeRefs.length > 0)
          );
      case 'profile':
        return (
          selections.ncRfgProfileRef !== null &&
          selections.lvrtCurveRef !== null &&
          selections.hvrtCurveRef !== null &&
          // Dane modułu spoza kontraktu (data, nastawy, deklaracje bez źródła) blokują
          // przejście z nazwanym błędem pola — backend odrzuciłby zapis kodem 422.
          wynikDanychModulu.stan === 'ok'
        );
      case 'review':
        return true;
      default:
        return false;
    }
  }, [
    derKind,
    deviceCatalogStatus,
    effectiveBlockTransformerCatalogRef,
    innaOdmowaProby,
    selections,
    stationNnBus,
    step,
    transformerPowerWarning,
    voltageMismatchWarning,
    werdyktBackenduWToku,
    wynikDanychModulu.stan,
  ]);

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      const nextStep = STEPS[idx + 1];
      setStep(nextStep);
    }
  }, [step]);

  const goPrev = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) {
      setStep(STEPS[idx - 1]);
    }
  }, [step]);

  const selectConnectionSide = useCallback(
    (connectionSide: ConnectionSide) => {
      setSelections((current) =>
        applyPointDefaults(current, connectionSide, derKind, stationName));
    },
    [blockTransformers, derKind, stationName],
  );

  useEffect(() => {
    if (!transformerPowerWarning || transformerUpgradeOptions.length === 0) {
      setSelectedTransformerUpgradeRef('');
      return;
    }
    // Bez preselekcji: wariant wybiera projektant, a wystarczalność mocy po zmianie ocenia
    // ponowna próba backendu (komunikat odmowy wyżej podaje moc wymaganą).
    setSelectedTransformerUpgradeRef((current) =>
      transformerUpgradeOptions.some((option) => option.id === current) ? current : '');
  }, [transformerPowerWarning, transformerUpgradeOptions]);

  useEffect(() => {
    if (
      selections.connectionSide !== 'dedicated_transformer'
      || !autoBlockTransformer
      || selections.blockTransformerCatalogRef === autoBlockTransformer.id
    ) {
      return;
    }
    setSelections((current) => ({
      ...current,
      blockTransformerCatalogRef: autoBlockTransformer.id,
    }));
  }, [
    autoBlockTransformer,
    selections.blockTransformerCatalogRef,
    selections.connectionSide,
  ]);

  // Karta FAB-K (§0 R4): `voltage_level_ref` USUNIĘTE jako phantom — backend
  // nigdy go nie akceptował (dla `nn_side` wyprowadza szynę nN stacji sam,
  // patrz `_resolve_nn_bus_ref`). Napięcie nN pokazuje się projektantowi
  // WYŁĄCZNIE jako odczyt rzeczywistej szyny stacji (`stationNnBus`) — nie ma
  // już domyślnego auto-wyboru z listy katalogowej, bo nie ma już wyboru.
  const handleSwitchToDedicatedTransformer = useCallback(() => {
    if (kandydaciDlaNapieciaUrzadzenia.length === 0) {
      notify('Brak transformatora dedykowanego w katalogu dla napięcia wybranego urządzenia.', 'error');
      return;
    }
    setSelections((current) => ({
      ...applyPointDefaults(current, 'dedicated_transformer', derKind, stationName),
      blockTransformerCatalogRef: null,
    }));
    notify(
      'Przełączono wariant przyłączenia na transformator dedykowany — wskaż punkt przyłączenia SN, '
      + 'a moc transformatora dobierze próba backendu.',
      'success',
    );
  }, [derKind, kandydaciDlaNapieciaUrzadzenia, notify, stationName]);

  const handleChooseOtherDevice = useCallback(() => {
    setSelections((current) => ({ ...current, deviceCatalogRef: null }));
  }, []);

  useEffect(() => {
    if (derKind !== 'BESS' || !selectedDevice || availableBessModes.length === 0) {
      return;
    }
    const validModeIds = new Set(availableBessModes.map((mode) => mode.id));
    setSelections((current) => {
      const stillValid = current.bessOperationModeRefs.filter((ref) => validModeIds.has(ref));
      return stillValid.length === current.bessOperationModeRefs.length
        ? current
        : { ...current, bessOperationModeRefs: stillValid };
    });
  }, [availableBessModeIds, availableBessModes, derKind, selectedDevice]);

  const handleUpgradeStationTransformer = useCallback(async () => {
    if (!effectiveCaseId || !primaryStationTransformer || !selectedTransformerUpgradeRef) {
      notify('Wybierz transformator stacji i wariant katalogowy większej mocy.', 'error');
      return;
    }
    const selectedUpgrade = transformerUpgradeOptions.find(
      (option) => option.id === selectedTransformerUpgradeRef,
    );
    if (!selectedUpgrade) {
      notify('Wybrany wariant transformatora nie jest dostępny w katalogu.', 'error');
      return;
    }
    setIsUpdatingTransformer(true);
    try {
      // Jeden toast sukcesu — z magazynu, ze zdaniem nazywającym nowy wariant.
      const response = await executeDomainOperation(
        effectiveCaseId,
        'assign_catalog_to_element',
        {
          element_ref: primaryStationTransformer.ref,
          catalog_binding: {
            catalog_namespace: 'TRAFO_SN_NN',
            catalog_item_id: selectedUpgrade.id,
            catalog_item_version: '2024.1',
          },
        },
        { komunikatSukcesuPl: `Zmieniono transformator stacji na ${selectedUpgrade.name}.` },
      );
      if (response?.error) {
        notify(response.error, 'error');
        return;
      }
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : 'Nie udało się zmienić transformatora stacji.',
        'error',
      );
    } finally {
      setIsUpdatingTransformer(false);
    }
  }, [
    effectiveCaseId,
    executeDomainOperation,
    primaryStationTransformer,
    selectedTransformerUpgradeRef,
    transformerUpgradeOptions,
  ]);

  const handleCreate = useCallback(async () => {
    if (!stationId || !selections.connectionSide) return;
    if (!effectiveCaseId || !projectId || projectId === 'no-project') {
      notify('Wybierz aktywny projekt i zakres obliczeń przed utworzeniem układu przyłączeniowego.', 'error');
      return;
    }
    // Walidacja runtime: catalog_refs muszą istnieć w katalogach
    // (chroni przed manipulacją selections w devtools).
    const validation = validateWizardSelections(selections, derKind, {
      allowedDeviceCatalogIds: deviceCatalog.map((device) => device.id),
      allowedBatteryCatalogIds: bessBatteries.map((battery) => battery.id),
      allowedNcRfgOperatorIds: ncRfgOperators.map((operator) => operator.operator_id),
    });
    if (!validation.ok) {
      notify(
        `Walidacja kreatora DER nie powiodła się: ${validation.errors.join('; ')}`,
        'error',
      );
      return;
    }
    // Deterministyczne ID — fnv1a hash z (project + station + kind + name).
    // Dwa wywołania kreatora z identycznymi danymi → identyczne id.
    const id = generateDeterministicDerId({
      projectId,
      stationId,
      derKind,
      derName: selections.derName,
      pccLabel: selections.pccLabel,
    });
    const busPrzylaczeniaRef = `pcc_${stationId}_${selections.pccLabel.trim()}`;
    if (voltageMismatchWarning || transformerPowerWarning || innaOdmowaProby) {
      notify(
        voltageMismatchWarning ?? transformerPowerWarning ?? innaOdmowaProby ?? 'Konfiguracja DER wymaga korekty.',
        'error',
      );
      return;
    }
    if (selections.connectionSide === 'dedicated_transformer' && !effectiveBlockTransformerCatalogRef) {
      notify('Wybierz transformator dedykowany z katalogu.', 'error');
      return;
    }
    // Karta FAB-K (§0 R3): punkt przyłączenia SN — backend odrzuca 422-ką
    // (`generator.sn_connection_bus_missing`) zapis `block_transformer` bez
    // tego pola; ten sam strażnik parami co transformator dedykowany wyżej.
    if (selections.connectionSide === 'dedicated_transformer' && !selections.snConnectionBusRef) {
      notify(
        'Wybierz punkt przyłączenia SN (szyna stacji / ZK SN / słup rozgałęźny / odgałęzienie).',
        'error',
      );
      return;
    }

    const device = deviceCatalog.find((d) => d.id === selections.deviceCatalogRef);
    const nominalPowerKw = device && 'nominal_power_kw' in device ? device.nominal_power_kw : null;
    // ZERO PODSTAWIANIA MOCY (V12K-249). Poprzednio brak mocy katalogowej dawał
    // `power_mw: (nominalPowerKw ?? 500) / 1000` — czyli 500 kW WPISANE DO MODELU jako
    // moc wytwórcy. To nie była wartość domyślna interfejsu, tylko sfabrykowana dana
    // projektowa, od której zależą wszystkie obliczenia sieciowe. Brak mocy zatrzymuje
    // zapis z nazwanym powodem.
    if (nominalPowerKw === null || !(nominalPowerKw > 0)) {
      notify(
        'Wybrane urządzenie nie ma w katalogu mocy znamionowej, więc mocy pozycji nie da '
        + 'się wyznaczyć. Wybierz urządzenie z kompletną tabliczką albo uzupełnij katalog.',
        'error',
      );
      return;
    }
    const liczbaJednostek = Math.max(1, Math.round(selections.unitCount || 1));
    const mocGrupyKw = nominalPowerKw * liczbaJednostek;
    // Typ urządzenia to dana projektowa wybrana JAWNIE w kroku „Urządzenie"
    // (`validateWizardSelections` wyżej odrzuca brak). Dawna mapa zapasowych
    // identyfikatorów per (technologia, strona przyłączenia) podstawiała typ,
    // którego nikt nie wybrał — ta sama klasa co `_DEFAULT_CATALOG_BY_VARIANT`
    // na backendzie (usunięta 2026-09-05); backend odrzuca pusty `catalog_ref` 422.
    // Zadanie zapisu = zadanie próby (`zbudujZadanieDer`) — werdykt pokazany w kroku
    // „Urządzenie" dotyczy DOKŁADNIE tej konfiguracji, którą zapisujemy.
    const zadanie = zbudujZadanieDer({
      stationId,
      derKind,
      selections,
      device: device ?? null,
      blockTransformerCatalogRef: effectiveBlockTransformerCatalogRef,
      ncRfgModule: expectedNcRfgModule,
      daneModulu,
    });
    if (!zadanie) {
      notify('Wybierz urządzenie z katalogu — bez pozycji katalogowej zapis DER jest niemożliwy.', 'error');
      return;
    }

    setIsCreating(true);
    try {
      const response = await postDerGeneratorConfig(projectId, effectiveCaseId, zadanie);

      if (response.snapshot) {
        setSnapshot(response);
      }

      // Karta FAB-K: rekord LOKALNY jest scaffoldingiem widocznym WYŁĄCZNIE do
      // najbliższego odświeżenia migawki — `useSynchronizacjaDerZModelu`
      // (`synchronizacjaZModelu.ts`) nadpisuje go rekordem z modelu, gdy tylko
      // `derSemanticKey` (stacja+rodzaj+strona+katalog+moc) się zgodzi, co
      // nastąpi natychmiast po `setSnapshot(response)` wyżej. `bay_ref` zostaje
      // `null` (dawne pole SN nie istnieje już fizycznie jako wariant — model
      // czyta je z NIEZALEŻNEGO `meta.field_ref`, którego ta ścieżka nie
      // zapisuje) i `transformer_ref` zostaje etykietą prowizoryczną (realny
      // ref transformatora bloku zna dopiero migawka) — obie wartości i tak
      // zostają natychmiast zastąpione realnymi z modelu.
      attachDer({
        id,
        project_id: projectId,
        station_id: stationId,
        der_kind: derKind,
        name: selections.derName,
        connection_side: selections.connectionSide,
        bus_przylaczenia_ref: busPrzylaczeniaRef,
        bay_ref: null,
        lv_busbar_ref:
          selections.connectionSide === 'nN' ? stationNnBus?.busRef ?? null : null,
        transformer_ref:
          selections.connectionSide === 'dedicated_transformer'
            ? `tr_dedicated_${id}`
            : null,
        sn_connection_bus_ref:
          selections.connectionSide === 'dedicated_transformer' ? selections.snConnectionBusRef : null,
        sn_connection_point_kind:
          selections.connectionSide === 'dedicated_transformer'
            ? selectedSnConnectionPoint?.kind ?? null
            : null,
        connection_voltage_kv: napiecicPrzylaczeniaKv,
        nominal_power_kw: mocGrupyKw,
        unit_count: liczbaJednostek,
        catalogs: {
          device_catalog_ref: selections.deviceCatalogRef,
          battery_catalog_ref: selections.batteryCatalogRef,
          block_transformer_catalog_ref: effectiveBlockTransformerCatalogRef,
        },
        profiles: {
          nc_rfg_profile_ref: selections.ncRfgProfileRef,
          lvrt_curve_ref: selections.lvrtCurveRef,
          hvrt_curve_ref: selections.hvrtCurveRef,
          pf_curve_ref: selections.pfCurveRef,
          bess_operation_mode_refs: selections.bessOperationModeRefs,
        },
        created_at: nowIso,
      });

      notify(
        `Utworzono ${DER_KIND_LABELS[derKind]} "${selections.derName}" w stacji "${stationName}".`,
        'success',
      );
      window.dispatchEvent(
        new CustomEvent('mvdesignpro:der-created', {
          detail: { stationId, derKind, sourceId: id },
        }),
      );
      handleClose();
    } catch (error) {
      notify(
        error instanceof DerPersistenceApiError
          ? error.message
          : 'Nie udało się zapisać układu przyłączeniowego w modelu sieci.',
        'error',
      );
    } finally {
      setIsCreating(false);
    }
  }, [
    attachDer,
    bessBatteries,
    daneModulu,
    deviceCatalog,
    derKind,
    effectiveBlockTransformerCatalogRef,
    effectiveCaseId,
    expectedNcRfgModule,
    napiecicPrzylaczeniaKv,
    nowIso,
    handleClose,
    ncRfgOperators,
    projectId,
    selectedSnConnectionPoint,
    selections,
    setSnapshot,
    stationId,
    stationName,
    stationNnBus,
    innaOdmowaProby,
    transformerPowerWarning,
    voltageMismatchWarning,
  ]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="add-der-wizard"
      data-der-kind={derKind}
      data-current-step={step}
      role="dialog"
      aria-modal="true"
      aria-label={`Dodaj ${DER_KIND_LABELS[derKind]}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="w-[980px] max-w-[95vw] rounded-lg border border-scada-border bg-scada-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-scada-border bg-scada-surface px-5 py-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-scada-muted">
              Dodaj układ przyłączeniowy
            </div>
            <h3 className="text-sm font-semibold text-scada-text">
              {DER_KIND_LABELS[derKind]} → {stationName}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            data-testid="add-der-wizard-close"
            className="rounded p-1 text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text"
            aria-label="Zamknij konfigurację"
          >
            ✕
          </button>
        </div>

        {/* Stepper */}
        <div className="flex border-b border-scada-border bg-scada-surface px-5 py-2 text-[10px] font-medium">
          {STEPS.map((s, idx) => (
            <div
              key={s}
              data-testid={`add-der-step-${s}`}
              data-active={step === s}
              className={
                'flex-1 px-2 py-1 '
                + (step === s
                  ? 'text-scada-sn'
                  : idx < STEPS.indexOf(step)
                    ? 'text-status-ok'
                    : 'text-scada-muted')
              }
            >
              {STEP_LABELS[s]}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5 text-xs">
          {step === 'variant' && (
            <div data-testid="add-der-step-content-variant" className="space-y-2">
              <p className="mb-2 text-scada-muted">
                Wybierz wariant przyłączenia. Opcje są filtrowane wg rodzaju DER
                (FW nie obsługuje "po stronie nN" zgodnie z modelem przyłączeń).
              </p>
              {levels.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  data-testid={`variant-${v.side}`}
                  data-active={selections.connectionSide === v.side}
                  onClick={() => selectConnectionSide(v.side)}
                  className={
                    'w-full rounded border p-3 text-left text-xs '
                    + (selections.connectionSide === v.side
                      ? 'border-scada-sn bg-scada-hover-nav text-scada-text'
                      : 'border-scada-border bg-scada-surface text-scada-muted hover:border-scada-sn')
                  }
                >
                  <div className="text-sm font-semibold text-scada-text">{v.label_pl}</div>
                  <div className="mt-1 text-[11px]">{v.description_pl}</div>
                  <div className="mt-2 text-[10px]">
                    Wymagane elementy:{' '}
                    {v.required_objects_pl.map((o, i) => (
                      <span key={i} className="mr-1 rounded bg-scada-panel px-1.5 py-0.5">
                        {o}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'point' && (
            <div data-testid="add-der-step-content-point" className="space-y-3">
              <p className="text-scada-muted">
                Wybierz punkt przyłączenia (PCC) i podstawowe dane układu.
                Pola tekstowe to projektowe oznaczenia, niewybór z katalogu.
              </p>
              <Field
                label="Nazwa DER"
                required
                value={selections.derName}
                onChange={(v) => setSelections((s) => ({ ...s, derName: v }))}
                placeholder={`np. ${derKind === 'PV' ? 'PV Polna 1' : derKind === 'BESS' ? 'BESS-1' : 'FW Pomorze'}`}
                testId="add-der-name"
              />
              <Field
                label="Oznaczenie PCC (etykieta projektowa)"
                required
                value={selections.pccLabel}
                onChange={(v) => setSelections((s) => ({ ...s, pccLabel: v }))}
                placeholder="np. PCC-01"
                testId="add-der-pcc-label"
              />
              {selections.connectionSide === 'nN' && (
                <>
                  {/* Karta FAB-K (§0 R4): `voltage_level_ref` USUNIĘTY jako
                      phantom — backend dla nN sam wyprowadza szynę stacji
                      (`_resolve_nn_bus_ref`), więc to NIE JEST wybór projektanta.
                      Poniżej odczyt szyny RZECZYWISTEJ, nie lista do wyboru. */}
                  {stationNnBus ? (
                    <div
                      data-testid="add-der-nn-bus-readonly"
                      className="rounded border border-scada-border bg-scada-panel p-2 text-[11px] text-scada-text"
                    >
                      <div className="text-scada-muted">Szyna nN stacji (z modelu)</div>
                      <div className="mt-0.5 font-semibold">
                        {stationNnBus.name} · {stationNnBus.voltageKv.toLocaleString('pl-PL')} kV
                      </div>
                    </div>
                  ) : (
                    <div
                      data-testid="add-der-nn-bus-empty"
                      className="rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-2 text-[11px] text-sygnal-uwaga-tusz"
                    >
                      Stacja nie ma jeszcze transformatora SN/nN w modelu — brak szyny nN do
                      przyłączenia. Dodaj transformator stacji, potem wróć do tego kreatora.
                    </div>
                  )}
                </>
              )}
              {/* Karta FAB-K (§0 R3): dla SN — PUNKT przyłączenia to element
                  ISTNIEJĄCY w modelu (szyna stacji / ZK SN / słup rozgałęźny /
                  odgałęzienie), NIE etykieta tekstowa fabrykująca pseudo-ref. */}
              {selections.connectionSide === 'dedicated_transformer' && (
                <>
                  {snConnectionPointCandidates.length > 0 ? (
                    <Select
                      label="Punkt przyłączenia SN (element istniejący w modelu)"
                      required
                      value={selections.snConnectionBusRef ?? ''}
                      onChange={(v) =>
                        setSelections((s) => ({ ...s, snConnectionBusRef: v || null }))
                      }
                      options={[
                        { id: '', label: '— wybierz punkt przyłączenia —' },
                        ...snConnectionPointCandidates.map((c) => ({
                          id: c.busRef,
                          label: `${getSnConnectionPointKindLabelPl(c.kind)} — ${c.label}`,
                        })),
                      ]}
                      testId="add-der-sn-connection-point"
                    />
                  ) : (
                    <div
                      data-testid="add-der-sn-connection-point-empty"
                      className="rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-2 text-[11px] text-sygnal-uwaga-tusz"
                    >
                      Model nie ma jeszcze żadnego punktu przyłączenia SN (szyny stacji, ZK SN,
                      słupa rozgałęźnego ani odgałęzienia). Utwórz go kreatorem stacji SN, ZK SN /
                      słupa rozgałęźnego albo odgałęzienia, potem wróć do tego kreatora — mufa
                      kablowa (T-joint) nie jest punktem przyłączenia: nie dzieli topologii.
                    </div>
                  )}
                  {/* Pakiet H: transformator dedykowany ZAWSZE widoczny dla SN
                      (karta FAB-K, §0 R3) — nie warunkowany wyborem punktu. */}
                  {(() => {
                    // Kandydaci z równości napięcia: strona górna = napięcie wskazanego punktu SN.
                    const candidates = blockTransformerCandidates(
                      derKind,
                      snPointVoltageKv,
                      null,
                      blockTransformers,
                    );
                    return (
                      <Select
                        label="Transformator dedykowany z katalogu"
                        required
                        value={selections.blockTransformerCatalogRef ?? ''}
                        onChange={(v) =>
                          setSelections((s) => ({ ...s, blockTransformerCatalogRef: v || null }))
                        }
                        options={[
                          { id: '', label: '— wybierz transformator dedykowany —' },
                          ...candidates.map((b) => ({ id: b.id, label: b.label_pl })),
                        ]}
                        testId="add-der-block-transformer"
                      />
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {step === 'device' && (
            <div data-testid="add-der-step-content-device" className="space-y-3">
              <div
                data-testid="add-der-catalog-source"
                className="rounded border border-scada-border bg-scada-bg p-2 text-[11px] text-scada-muted"
              >
                Lista urządzeń łączy katalog techniczny falowników z wykazem PTPiREE/NC RfG
                {' '}
                <span data-testid="add-der-ptpiree-wykaz" data-stan={ptpireeManifest.stan}>
                  {opisWykazuPtpiree(ptpireeManifest)}
                </span>
                . Wybór falownika steruje napięciem układu i doborem transformatora.
              </div>
              {selections.connectionSide === 'dedicated_transformer'
                && selectedDevice
                && selectedDeviceKv !== null
                && autoBlockTransformer && (
                <div
                  data-testid="add-der-auto-block-transformer"
                  className="rounded border border-emerald-700 bg-emerald-950/30 p-2 text-[11px] text-scada-text"
                >
                  Automatycznie dobrano transformator dedykowany:
                  {' '}
                  <span className="font-medium text-emerald-200">
                    {autoBlockTransformer.label_pl}
                  </span>
                  {' '}
                  dla urządzenia {selectedDeviceKv.toFixed(2)} kV
                  i mocy {formatKw(selectedDevice.nominal_power_kw)} — najmniejszy z katalogu,
                  przy którym backend przyjmuje konfigurację (kontrola mocy transformatora).
                </div>
              )}
              {selections.connectionSide === 'dedicated_transformer'
                && selectedDevice
                && odmowaDoboruTransformatora && (
                <div
                  data-testid="add-der-auto-block-transformer-odmowa"
                  className="rounded border border-sygnal-blokada bg-sygnal-blokada-tlo p-2 text-[11px] text-sygnal-blokada-tusz"
                >
                  Żaden transformator dedykowany z katalogu o napięciach tego toru nie spełnia
                  kontroli backendu. Odmowa dla największego: {odmowaDoboruTransformatora.komunikat}
                </div>
              )}
              {selections.connectionSide === 'dedicated_transformer'
                && selectedDevice
                && selectedDeviceKv !== null
                && snPointVoltageKv !== null
                && kandydaciTransformatoraDedykowanego.length === 0 && (
                <div
                  data-testid="add-der-auto-block-transformer-brak"
                  className="rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-2 text-[11px] text-sygnal-uwaga-tusz"
                >
                  Katalog transformatorów dedykowanych nie ma pozycji {formatKv(snPointVoltageKv)}
                  {' / '}
                  {formatKv(selectedDeviceKv)} dla tego rodzaju źródła.
                </div>
              )}
              <p className="text-scada-muted">
                Wybierz urządzenie z katalogu producenta. Wszystkie wartości
                techniczne (moc, napięcie, charakterystyki) pochodzą z katalogu.
              </p>
              <div
                data-testid="add-der-device-catalog-summary"
                className="grid grid-cols-2 gap-2 rounded border border-scada-border bg-scada-surface p-2 text-[11px] text-scada-muted md:grid-cols-5"
              >
                <CatalogMetric label="Katalog" value={deviceCatalogStatus === 'backend' ? 'backend' : deviceCatalogStatus} />
                <CatalogMetric label="Pozycje" value={`${deviceCatalogCounters.filtered}/${deviceCatalogCounters.total}`} />
                <CatalogMetric label="Backend" value={`${deviceCatalogCounters.backend}`} />
                <CatalogMetric label="PTPiREE" value={`${deviceCatalogCounters.ptpiree}`} />
                <CatalogMetric label="GFM" value={`${deviceCatalogCounters.gfm}`} />
              </div>
              {deviceCatalogStatus === 'loading' && (
                <div
                  data-testid="add-der-device-catalog-loading"
                  className="rounded border border-scada-border bg-scada-bg p-3 text-[11px] text-scada-muted"
                >
                  Pobieram katalog urządzeń {DER_KIND_LABELS[derKind]} z backendu…
                </div>
              )}
              {deviceCatalogStatus === 'error' && (
                <div
                  data-testid="add-der-device-catalog-error"
                  className="space-y-2 rounded border border-sygnal-blokada bg-sygnal-blokada-tlo p-3 text-[11px] text-sygnal-blokada-tusz"
                >
                  <div className="font-semibold">
                    Katalog urządzeń {DER_KIND_LABELS[derKind]} jest niedostępny — krok „Urządzenie” jest
                    zablokowany. Katalog urządzeń DER pochodzi wyłącznie z backendu, więc kreator NIE
                    podstawia listy zastępczej.
                  </div>
                  <div>
                    {deviceCatalogError ?? 'Backend nie zwrócił katalogu konwerterów DER.'}
                  </div>
                </div>
              )}
              <div
                data-testid="add-der-device-filters"
                className="grid grid-cols-1 gap-2 rounded border border-scada-border bg-scada-bg p-2 md:grid-cols-[1fr_160px_180px]"
              >
                <Field
                  label="Szukaj w katalogu DER"
                  value={deviceSearch}
                  onChange={setDeviceSearch}
                  placeholder="producent, model, certyfikat, napięcie, PTPiREE"
                  testId="add-der-device-search"
                />
                <Select
                  label="Napięcie"
                  value={deviceVoltageFilter}
                  onChange={setDeviceVoltageFilter}
                  options={[
                    { id: 'all', label: 'wszystkie' },
                    ...deviceVoltageOptions.map((voltageKv) => ({
                      id: voltageKv.toFixed(2),
                      label: `${voltageKv.toFixed(2)} kV`,
                    })),
                  ]}
                  testId="add-der-device-voltage-filter"
                />
                <Select
                  label="Cechy"
                  value={deviceModeFilter}
                  onChange={setDeviceModeFilter}
                  options={[
                    { id: 'all', label: 'wszystkie' },
                    { id: 'ptpiree', label: 'PTPiREE' },
                    { id: 'q-control', label: 'regulacja Q/U' },
                    { id: 'gfm', label: 'grid-forming' },
                  ]}
                  testId="add-der-device-mode-filter"
                />
              </div>
              {voltageMismatchWarning && (
                <div
                  data-testid="add-der-voltage-mismatch-warning"
                  className="rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-2 text-[11px] text-sygnal-uwaga-tusz"
                >
                  <div className="font-semibold text-red-200">
                    Niezgodność napięciowa blokuje zapis wariantu nN.
                  </div>
                  <div>{voltageMismatchWarning}</div>
                  {kandydaciDlaNapieciaUrzadzenia.length > 0 ? (
                    <div className="text-red-100/80">
                      Katalog ma {kandydaciDlaNapieciaUrzadzenia.length} transformator(y)
                      dedykowane dla napięcia urządzenia; moc dobierze próba backendu po
                      wskazaniu punktu przyłączenia SN.
                    </div>
                  ) : (
                    <div className="text-red-100/80">
                      Katalog nie wskazał transformatora dedykowanego dla tego urządzenia.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="add-der-switch-dedicated-transformer"
                      onClick={handleSwitchToDedicatedTransformer}
                      disabled={kandydaciDlaNapieciaUrzadzenia.length === 0}
                      className="rounded border border-red-300 px-3 py-1 text-[11px] font-semibold text-red-50 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Przełącz na TR dedykowany
                    </button>
                    <button
                      type="button"
                      data-testid="add-der-clear-device-selection"
                      onClick={handleChooseOtherDevice}
                      className="rounded border border-scada-border px-3 py-1 text-[11px] font-semibold text-scada-text transition hover:bg-scada-hover-nav"
                    >
                      Wybierz inne urządzenie
                    </button>
                  </div>
                </div>
              )}
              {transformerPowerWarning && (
                <div
                  data-testid="add-der-transformer-power-warning"
                  className="rounded border border-sygnal-blokada bg-sygnal-blokada-tlo p-2 text-[11px] text-sygnal-blokada-tusz"
                >
                  {transformerPowerWarning}
                </div>
              )}
              {innaOdmowaProby && (
                <div
                  data-testid="add-der-proba-odmowa"
                  className="rounded border border-sygnal-blokada bg-sygnal-blokada-tlo p-2 text-[11px] text-sygnal-blokada-tusz"
                >
                  Backend odmówi zapisu tej konfiguracji: {innaOdmowaProby}
                </div>
              )}
              {transformerPowerWarning && transformerUpgradeOptions.length > 0 && (
                <div
                  data-testid="add-der-transformer-upgrade-panel"
                  className="space-y-2 rounded border border-scada-sn/70 bg-scada-sn/10 p-2 text-[11px] text-scada-text"
                >
                  <div>
                    <div className="font-medium text-scada-sn">
                      Dobierz większy transformator stacji z katalogu
                    </div>
                    <div className="text-scada-muted">
                      Aktualizowany jest istniejący transformator SN/nN stacji (pozycje katalogu
                      o tych samych napięciach i większej mocy). Po zmianie backend ponownie
                      sprawdza moc transformatora wobec mocy źródła.
                    </div>
                  </div>
                  <Select
                    label="Nowy transformator SN/nN"
                    value={selectedTransformerUpgradeRef}
                    onChange={setSelectedTransformerUpgradeRef}
                    options={[
                      { id: '', label: '— wybierz transformator —' },
                      ...transformerUpgradeOptions.map((option) => ({
                        id: option.id,
                        label: `${option.name} · ${formatKva(option.rated_power_mva * 1000)}`,
                      })),
                    ]}
                    testId="add-der-transformer-upgrade"
                  />
                  <button
                    type="button"
                    data-testid="add-der-upgrade-transformer"
                    onClick={handleUpgradeStationTransformer}
                    disabled={isUpdatingTransformer || !selectedTransformerUpgradeRef}
                    className="rounded border border-scada-sn px-3 py-1.5 text-[11px] font-medium text-scada-sn hover:bg-scada-sn/10 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isUpdatingTransformer ? 'Zmieniam transformator...' : 'Zmień TR stacji'}
                  </button>
                </div>
              )}
              {transformerPowerWarning && transformerUpgradeOptions.length === 0 && (
                <div
                  data-testid="add-der-transformer-upgrade-empty"
                  className="rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-2 text-[11px] text-sygnal-uwaga-tusz"
                >
                  Katalog nie ma większego transformatora o napięciach transformatora tej stacji.
                  Wybierz mniejszy wariant źródła albo przyłączenie po stronie SN.
                </div>
              )}
              {selections.connectionSide === 'nN' && stationTransformerCapacityKw !== null && (
                <div
                  data-testid="add-der-compatible-device-summary"
                  className="rounded border border-scada-border bg-scada-bg p-2 text-[11px] text-scada-muted"
                >
                  Wariant nN: urządzenia o napięciu szyny nN stacji; moc transformatora stacji
                  {' '}
                  {formatKva(stationTransformerCapacityKw)} wobec mocy źródła sprawdza backend
                  po wyborze urządzenia (próba zapisu, bez zmiany modelu).
                  {incompatibleDeviceCount > 0 && (
                    <>
                      {' '}
                      {incompatibleDeviceCount} urządzeń o innym napięciu wymaga transformatora
                      dedykowanego.
                    </>
                  )}
                </div>
              )}
              <Select
                label={derKind === 'PV' ? 'Falownik PV' : derKind === 'BESS' ? 'PCS BESS' : 'Turbina wiatrowa'}
                required
                disabled={deviceCatalogStatus !== 'backend'}
                value={selections.deviceCatalogRef ?? ''}
                onChange={(v) => setSelections((s) => ({ ...s, deviceCatalogRef: v }))}
                options={[
                  {
                    id: '',
                    label: deviceCatalogStatus === 'backend' ? '— wybierz —' : '— katalog niedostępny —',
                  },
                  ...deviceSelectOptions,
                ]}
                testId="add-der-device"
              />
              {/* Liczba jednostek (V12K-249): dana, bez ktorej moc pozycji i moc
                  jednostki sa nierozroznialne, a farma 8 × 1 MW nie jest wyrazalna. */}
              <label className="mt-2 flex flex-col gap-1 text-xs text-scada-muted">
                Liczba jednostek
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={selections.unitCount}
                  onChange={(event) =>
                    setSelections((s) => ({
                      ...s,
                      unitCount: Math.max(1, Math.round(Number(event.target.value) || 1)),
                    }))
                  }
                  className="min-h-[44px] rounded border border-scada-border bg-scada-bg px-3 py-2 text-sm text-scada-text"
                  data-testid="add-der-unit-count"
                />
                <span className="text-[11px]">
                  Moc pozycji = moc jednostki × liczba jednostek. Od tego iloczynu zależą
                  prądy robocze, dobór transformatora i przekładników oraz kategoria NC RfG.
                </span>
              </label>
              <div
                data-testid="add-der-device-results"
                className="max-h-72 overflow-y-auto rounded border border-scada-border bg-scada-bg text-[11px]"
              >
                <div className="grid min-w-[760px] grid-cols-[minmax(220px,1.7fr)_120px_90px_90px_110px_minmax(170px,1fr)] gap-2 border-b border-scada-border bg-scada-surface px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-scada-muted">
                  <span>Urządzenie</span>
                  <span>Producent</span>
                  <span>
                    <MathInline latex="P_{\max}" />
                  </span>
                  <span>
                    <MathInline latex="U_{n}" />
                  </span>
                  <span>NC RfG</span>
                  <span>Ocena doboru</span>
                </div>
                {filteredDeviceCatalog.slice(0, 80).map((device) => {
                  const isSelected = selections.deviceCatalogRef === device.id;
                  const ptpireeDocument = resolvePtpireeDocument(device);
                  const voltageOk = fitsSelectedLvVoltage(
                    device,
                    selections.connectionSide,
                    stationNnBus?.voltageKv ?? null,
                  );
                  // Moc transformatora ocenia backend wyłącznie dla WYBRANEGO urządzenia
                  // (próba zapisu) — karta listy nie zgaduje werdyktu progiem.
                  const odmowaBackendu = isSelected && odmowaProby !== null;
                  const eligibilityText = !voltageOk
                    ? 'wymaga innego napięcia/TR'
                    : odmowaBackendu
                      ? 'odmowa backendu'
                      : 'napięcie zgodne';
                  const eligibilityClass = voltageOk && !odmowaBackendu
                    ? 'border-sygnal-ok bg-sygnal-ok-tlo text-sygnal-ok-tusz'
                    : 'border-sygnal-uwaga bg-sygnal-uwaga-tlo text-sygnal-uwaga-tusz';
                  return (
                    <button
                      key={device.id}
                      type="button"
                      data-testid={`add-der-device-card-${device.id}`}
                      data-active={isSelected}
                      onClick={() => setSelections((s) => ({ ...s, deviceCatalogRef: device.id }))}
                      className={
                        'grid min-w-[760px] grid-cols-[minmax(220px,1.7fr)_120px_90px_90px_110px_minmax(170px,1fr)] items-center gap-2 border-b px-3 py-2 text-left transition last:border-b-0 '
                        + (isSelected
                          ? 'border-scada-sn bg-scada-sn/10 text-scada-text'
                          : 'border-scada-border text-scada-muted hover:bg-scada-hover-nav')
                      }
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-scada-text">{device.label_pl}</div>
                        <div className="truncate text-[10px] text-scada-muted">{device.model || device.id}</div>
                      </div>
                      <span className="truncate">{device.manufacturer || '-'}</span>
                      <span className="text-scada-text">{formatKw(device.nominal_power_kw)}</span>
                      <span>{formatKv(getDeviceNominalVoltageKv(device))}</span>
                      <span>{device.grid_code ?? 'NC RfG'}</span>
                      <span className="flex flex-wrap gap-1">
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${eligibilityClass}`}>
                          {eligibilityText}
                        </span>
                        {ptpireeDocument !== '-' && (
                          <span className="rounded bg-sygnal-ok-tlo px-1.5 py-0.5 text-sygnal-ok-tusz">
                            PTPiREE {ptpireeDocument}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
                {filteredDeviceCatalog.length === 0 && (
                  <div
                    data-testid="add-der-device-results-empty"
                    className="rounded border border-sygnal-uwaga bg-sygnal-uwaga-tlo p-3 text-[11px] text-sygnal-uwaga-tusz"
                  >
                    Brak pozycji dla aktualnych filtrów. Zmień tekst wyszukiwania, napięcie
                    albo cechy katalogowe.
                  </div>
                )}
              </div>
              {selectedDevice && (
                <div
                  data-testid="add-der-device-details"
                  className="rounded border border-scada-border bg-scada-surface p-3 text-[11px]"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-scada-muted">
                        Wybrane urządzenie DER
                      </div>
                      <div className="text-sm font-semibold text-scada-text">{selectedDevice.label_pl}</div>
                    </div>
                    <span className="rounded border border-scada-border bg-scada-bg px-2 py-1 text-[10px] text-scada-muted">
                      katalog backendowy
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <CatalogMetric label="$P_{max}$" value={formatKw(selectedDevice.nominal_power_kw)} />
                    <CatalogMetric label="$U_n$" value={formatKv(getDeviceNominalVoltageKv(selectedDevice))} />
                    <CatalogMetric label="$S_n$" value={selectedDevice.s_n_kva ? formatKva(selectedDevice.s_n_kva) : '-'} />
                    <CatalogMetric label="$Q_{min}$ / $Q_{max}$" value={`${formatMvar(selectedDevice.qmin_mvar)} / ${formatMvar(selectedDevice.qmax_mvar)}`} />
                    <CatalogMetric label="$\cos\varphi_{min}$ / $\cos\varphi_{max}$" value={`${selectedDevice.cosphi_min ?? '-'} / ${selectedDevice.cosphi_max ?? '-'}`} />
                    <CatalogMetric
                      label="$k_{sc}$ (udział zwarciowy)"
                      value={
                        typeof selectedDevice.k_sc === 'number' && Number.isFinite(selectedDevice.k_sc)
                          ? selectedDevice.k_sc.toFixed(2)
                          : 'brak — wprowadź z karty producenta'
                      }
                    />
                    <CatalogMetric label="Sterowanie" value={selectedDevice.control_mode ?? '-'} />
                    <CatalogMetric label="NC RfG" value={selectedDevice.grid_code ?? '-'} />
                    <CatalogMetric
                      label="PTPiREE"
                      value={resolvePtpireeDocument(selectedDevice)}
                    />
                    <CatalogMetric label="Model EMT/RMS" value={selectedDevice.dynamic_profile_id ?? '-'} />
                    <CatalogMetric label="WOS/WiPWC" value={[selectedDevice.ptpiree_wos_version, selectedDevice.ptpiree_wipwc_version].filter(Boolean).join(' / ') || '-'} />
                    <CatalogMetric label="Źródło" value={selectedDevice.source_reference ?? selectedDevice.verification_status ?? '-'} />
                  </div>
                </div>
              )}
              {derKind === 'BESS' && (
                <Select
                  label="Bateria BESS (z katalogu backendu)"
                  required
                  disabled={bessBatteryTypesQuery.isLoading}
                  value={selections.batteryCatalogRef ?? ''}
                  onChange={(v) => setSelections((s) => ({ ...s, batteryCatalogRef: v }))}
                  options={[
                    {
                      id: '',
                      label: bessBatteryTypesQuery.isLoading ? '— ładowanie —' : '— wybierz —',
                    },
                    ...bessBatteries.map((b) => ({
                      id: b.id,
                      label: `${b.name} · ${b.capacity_kwh} kWh · ${b.chemistry}`,
                    })),
                  ]}
                  testId="add-der-battery"
                />
              )}

              {/* Naprawa eng.10: tryby pracy BESS — multi-select z katalogu. */}
              {derKind === 'BESS' && selections.deviceCatalogRef && selectedDevice && (() => {
                if (availableBessModes.length === 0) return null;
                return (
                  <div data-testid="add-der-bess-modes" className="space-y-1">
                    <label className="block text-[11px] text-scada-muted">
                      Tryby pracy BESS (NC RfG Art. 13/15) — wybierz min. 1
                    </label>
                    <div className="grid grid-cols-1 gap-1 rounded border border-scada-border bg-scada-bg p-2 text-[11px]">
                      {availableBessModes.map((m) => (
                        <label
                          key={m.id}
                          data-testid={`add-der-bess-mode-${m.mode_code}`}
                          className="flex items-start gap-2 hover:bg-scada-hover-nav"
                        >
                          <input
                            type="checkbox"
                            checked={selections.bessOperationModeRefs.includes(m.id)}
                            onChange={(e) => {
                              setSelections((s) => ({
                                ...s,
                                bessOperationModeRefs: e.target.checked
                                  ? [...s.bessOperationModeRefs, m.id]
                                  : s.bessOperationModeRefs.filter((r) => r !== m.id),
                              }));
                            }}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-scada-text">{m.label_pl}</div>
                            <div className="text-[10px] text-scada-muted">
                              {m.description_pl}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {step === 'profile' && (
            <div data-testid="add-der-step-content-profile" className="space-y-3">
              <p className="flex flex-wrap items-center gap-1 text-scada-muted">
                Wybierz profil zgodności przyłączeniowej (NC RfG) operatora oraz
                krzywe LVRT i HVRT zgodnie z modułem typu A/B/C/D.
                {(() => {
                  const frt = getTooltip('oze_frt');
                  return frt ? <HelpTooltip text={frt.text} norm={frt.norm} inline /> : null;
                })()}
                {(() => {
                  const ai = getTooltip('oze_anti_islanding');
                  return ai ? <HelpTooltip text={ai.text} norm={ai.norm} inline /> : null;
                })()}
              </p>
              <Select
                label="Profil NC RfG (operator)"
                required
                disabled={ncRfgOperatorsQuery.isLoading}
                value={selections.ncRfgProfileRef ?? ''}
                onChange={(v) =>
                  setSelections((s) => ({
                    ...s,
                    ncRfgProfileRef: v || null,
                    // Karta FAB-J: backend niesie JEDNĄ parę krzywych ride-through
                    // (LVRT/HVRT) na operatora — krzywa jest tożsamościowo związana
                    // z operatorem, nie osobną decyzją (patrz `wizard-validation.ts`).
                    lvrtCurveRef: v || null,
                    hvrtCurveRef: v || null,
                    // Warianty nastawy P(f) nie zależą od operatora (karta K-Q):
                    // rozporządzenie 2016/631 podaje przedział nastawialny, a nie
                    // wartość „dla PSE / Energi". Wybór zostaje projektantowi.
                    pfCurveRef: s.pfCurveRef,
                  }))
                }
                options={[
                  {
                    id: '',
                    label: ncRfgOperatorsQuery.isLoading ? '— ładowanie —' : '— wybierz —',
                  },
                  ...ncRfgOperators.map((o) => ({ id: o.operator_id, label: o.operator_name_pl })),
                ]}
                testId="add-der-ncrfg"
              />
              {!ncRfgOperatorsQuery.isLoading && ncRfgOperators.length === 0 && (
                <div
                  data-testid="add-der-ncrfg-empty"
                  className="rounded border border-sygnal-blokada bg-sygnal-blokada-tlo p-2 text-[11px] text-sygnal-blokada-tusz"
                >
                  Katalog operatorów NC RfG jest niedostępny z backendu — krok „Profil" jest
                  zablokowany do czasu jego wczytania.
                </div>
              )}
              {/* Karta FAB-J: backend niesie JEDNĄ krzywą LVRT/HVRT na operatora —
                  wyświetlana jako dowód White Box, nie jako niezależny wybór. */}
              <div
                data-testid="add-der-lvrt"
                className="rounded border border-scada-border bg-scada-bg p-2 text-[11px] text-scada-muted"
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest">
                  Krzywa LVRT (<MathInline latex="U/U_{n}" /> w funkcji czasu wg profilu operatora)
                </div>
                {selectedNcRfgOperator ? (
                  <span className="text-scada-text">
                    {selectedNcRfgOperator.ride_through.lvrt
                      .map((p) => `${p.time_s.toFixed(2)} s / ${p.voltage_pu.toFixed(2)} pu`)
                      .join(' → ')}
                  </span>
                ) : (
                  <span>Wybierz profil NC RfG operatora, aby zobaczyć krzywą LVRT.</span>
                )}
              </div>
              <div
                data-testid="add-der-hvrt"
                className="rounded border border-scada-border bg-scada-bg p-2 text-[11px] text-scada-muted"
              >
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest">
                  Krzywa HVRT (<MathInline latex="U/U_{n}" /> w funkcji czasu wg profilu operatora)
                </div>
                {selectedNcRfgOperator ? (
                  <span className="text-scada-text">
                    {selectedNcRfgOperator.ride_through.hvrt
                      .map((p) => `${p.time_s.toFixed(2)} s / ${p.voltage_pu.toFixed(2)} pu`)
                      .join(' → ')}
                  </span>
                ) : (
                  <span>Wybierz profil NC RfG operatora, aby zobaczyć krzywą HVRT.</span>
                )}
              </div>
              {/* Pakiet H: P(f) krzywa regulacji częstotliwości (NC RfG Art. 13/15). */}
              <Select
                label="Nastawa P(f) — statyzm regulacji częstotliwości (NC RfG art. 13 ust. 2)"
                disabled={auditCatalogSnapshotQuery.isLoading}
                value={selections.pfCurveRef ?? ''}
                onChange={(v) => setSelections((s) => ({ ...s, pfCurveRef: v || null }))}
                options={[
                  {
                    id: '',
                    label: auditCatalogSnapshotQuery.isLoading
                      ? '— ładowanie —'
                      : '— wybierz (opcjonalnie) —',
                  },
                  ...pfCurves.map((c) => ({ id: c.id, label: c.label_pl })),
                ]}
                testId="add-der-pf-curve"
              />
              {/* Karta FAB-J (decyzja #5): moduł NC RfG WYŁĄCZNIE z klasyfikacji
                  backendu — pokazany projektantowi jako fakt, nie pole edytowalne. */}
              <div
                data-testid="add-der-expected-module"
                className="rounded border border-scada-sn/70 bg-scada-sn/10 p-2 text-[11px] text-scada-text"
              >
                <span className="font-semibold">Oczekiwany moduł NC RfG: </span>
                <span>{opisKlasyfikacji}</span>
              </div>
              <SekcjaDanychModulu
                formularz={daneModulu}
                bledy={wynikDanychModulu.stan === 'blad' ? wynikDanychModulu.bledy : {}}
                onZmien={setDaneModulu}
                testid="add-der-dane-modulu"
              />
            </div>
          )}

          {step === 'review' && (
            <div data-testid="add-der-step-content-review" className="space-y-2">
              <p className="text-scada-muted">
                Podsumowanie konfiguracji. Po zatwierdzeniu w modelu sieci zostaną
                utworzone następujące obiekty:
              </p>
              <ul className="space-y-1 rounded border border-scada-border bg-scada-surface p-3 text-[11px]">
                <ReviewRow label="Stacja" value={stationName} />
                <ReviewRow label="Rodzaj układu" value={DER_KIND_LABELS[derKind]} />
                <ReviewRow label="Nazwa układu" value={selections.derName} />
                <ReviewRow label="Wariant przyłączenia" value={formatConnectionSideForReview(selections.connectionSide, levels)} />
                <ReviewRow label="PCC" value={selections.pccLabel} />
                <ReviewRow
                  label="Napięcie punktu przyłączenia"
                  value={napiecicPrzylaczeniaKv != null ? formatLvVoltageLabelPl(napiecicPrzylaczeniaKv) : ''}
                />
                {selections.connectionSide === 'dedicated_transformer' && (
                  <ReviewRow
                    label="Punkt przyłączenia SN"
                    value={
                      selectedSnConnectionPoint
                        ? `${getSnConnectionPointKindLabelPl(selectedSnConnectionPoint.kind)} — ${selectedSnConnectionPoint.label}`
                        : ''
                    }
                  />
                )}
                <ReviewRow
                  label="Urządzenie (katalog)"
                  value={
                    deviceCatalog.find((d) => d.id === selections.deviceCatalogRef)?.label_pl ?? ''
                  }
                />
                {selections.connectionSide === 'dedicated_transformer' && (
                  <ReviewRow
                    label="Transformator blokowy"
                    value={getBlockTransformer(blockTransformers, effectiveBlockTransformerCatalogRef)?.label_pl ?? ''}
                  />
                )}
                {derKind === 'BESS' && (
                  <ReviewRow
                    label="Bateria (katalog)"
                    value={
                      bessBatteries.find((b) => b.id === selections.batteryCatalogRef)?.name ?? ''
                    }
                  />
                )}
                <ReviewRow
                  label="Profil NC RfG"
                  value={selectedNcRfgOperator?.operator_name_pl ?? ''}
                />
                <ReviewRow
                  label="Krzywa LVRT"
                  value={
                    selectedNcRfgOperator
                      ? `${selectedNcRfgOperator.ride_through.lvrt.length} punktów t-U/$U_{n}$`
                      : ''
                  }
                />
                <ReviewRow
                  label="Krzywa HVRT"
                  value={
                    selectedNcRfgOperator
                      ? `${selectedNcRfgOperator.ride_through.hvrt.length} punktów t-U/$U_{n}$`
                      : ''
                  }
                />
                <ReviewRow
                  label="Moduł NC RfG (oczekiwany przez backend)"
                  value={ncRfgModuleQuery.data ? opisKlasyfikacji : ''}
                />
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-scada-border bg-scada-surface px-5 py-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 'variant'}
            data-testid="add-der-prev"
            className="rounded border border-scada-border px-3 py-1.5 text-xs text-scada-text hover:bg-scada-hover-nav disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Wstecz
          </button>
          <div className="text-[11px] text-scada-muted">
            Krok {STEPS.indexOf(step) + 1} z {STEPS.length}
          </div>
          {step === 'review' ? (
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              data-testid="add-der-create"
              className="rounded bg-scada-sn px-4 py-1.5 text-xs font-medium text-scada-bg hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              {isCreating ? 'Tworzenie w modelu sieci...' : `Utwórz ${DER_KIND_LABELS[derKind]}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              data-testid="add-der-next"
              className="rounded bg-scada-sn px-3 py-1.5 text-xs font-medium text-scada-bg hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Dalej →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="text"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-scada-border bg-scada-panel px-2 py-1.5 text-xs text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  required,
  disabled,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded border border-scada-border bg-scada-panel px-2 py-1.5 text-xs text-scada-text focus:border-scada-sn focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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

function CatalogMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-scada-border bg-scada-bg px-2 py-1">
      <div className="truncate text-[10px] uppercase tracking-wide text-scada-muted">
        <TekstZWzorami tekst={label} />
      </div>
      <div className="truncate text-[11px] font-medium text-scada-text">{value || '-'}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-scada-muted">{label}:</span>
      <span className="text-right font-medium text-scada-text">
        <TekstZWzorami tekst={value || '—'} />
      </span>
    </li>
  );
}

export default AddDerWizard;
