/**
 * InsertStationForm - formularz wstawiania stacji SN/nN na odcinku.
 *
 * UI wybiera tylko dane wejściowe i zgodne pozycje katalogowe. Napięcie strony nN
 * wynika z konfiguracji stacji albo katalogu falownika, nigdy ze stałej systemowej.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TransformerStationEditor,
  type TransformerStationFormData,
} from './shared/TransformerStationEditor';
import {
  FIELD_ROLE_LABELS,
  SOURCE_STATUS_LABEL_PL,
  stationRef,
  stationPublicName,
  isCompleteSourceStatus,
  isCompleteBayTemplate,
  compareBayTemplateOptions,
  bayKindLabel,
  templateOptionLabel,
  orderManufacturers,
  isUsableManufacturer,
  isUsableSwitchgearFamily,
  isStationNnSourceConverter,
  hasEnoughTransformerPower,
  voltageMatches,
  clampOutgoingFeederCount,
  formatKv,
  formatMva,
  findTransformerByCatalogRef,
  sourceFeederRole,
  compareStationNnSourceConverters,
  compareTransformersForSourcePower,
  DEFAULT_RECEIVER_NN_VOLTAGE_KV,
  describeConfigurationScope,
  sourceProtectionIntent,
  switchgearStatusLabel,
  stationNameFromData,
  SN_FIELD_ROLE_TO_BAY_KIND,
  SN_FIELD_ROLES,
  buildDefaultSnFields,
  contextString,
  resolveSegmentIdFromContext,
  elementTypeFromSelectionHint,
} from './InsertStationFormHelpers';
import { useSnapshotStore, selectBusOptions } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { useSelectionStore } from '../../selection/store';
import { validateCatalogFirst } from './catalogFirstRules';
import { catalogRefFromInput, normalizeCatalogBinding } from './catalogPayload';
import {
  fetchCompleteBayTemplates,
  fetchConverterTypes,
  fetchManufacturers,
  fetchSwitchgearFamilies,
  fetchTransformerTypes,
  getCatalogErrorMessage,
} from '../../catalog/api';
import type { BayKind, CompleteMvBayTemplateSummary } from '../../catalog/BayTemplatePicker';
import type { Manufacturer } from '../../catalog/manufacturer';
import type { SwitchgearFamily } from '../../catalog/SwitchgearFamilyPicker';
import type { ConverterType, TransformerType } from '../../catalog/types';
import { CatalogPicker, type CatalogEntry } from '../../topology/modals/CatalogPicker';
import { isTerrainSnSegment } from '../../shared/enmVisibility';
import {
  formatStationTypeLabelPl,
  normalizeTopologicalStationKind,
  type TopologicalStationKind,
} from '../../shared/stationTypeLabels';
import type { SelectedElement } from '../../types';
import type { DomainOpResponseV1, EnergyNetworkModel } from '../../../types/enm';

type NnConfiguration =
  | 'LOAD_NN'
  | 'PV_INVERTER'
  | 'BESS_INVERTER'
  | 'FW_INVERTER'
  | 'CUSTOM_NN';

type NnFeederRole = 'ODPLYW_NN' | 'ZRODLO_NN_PV' | 'ZRODLO_NN_BESS' | 'ZRODLO_NN_FW';
type SnFieldRole = 'LINIA_IN' | 'LINIA_OUT' | 'LINIA_ODG' | 'TRANSFORMATOROWE' | 'SPRZEGLO';

interface StationSwitchgearChoice {
  manufacturerRef: string;
  switchgearFamilyRef: string | null;
}

interface StationSnFieldTemplate {
  field_role: SnFieldRole;
  catalog_bindings: Record<string, unknown> | null;
  manufacturer_ref: string;
  switchgear_family_ref: string | null;
  bay_kind: BayKind;
  bay_template_ref: string | null;
  source_status: CompleteMvBayTemplateSummary['source_status'];
  source_refs: readonly string[];
}

interface NnConfigurationOption {
  value: NnConfiguration;
  label: string;
  description: string;
  converterKind?: ConverterType['kind'];
}

interface NnFeederPayload {
  feeder_role: NnFeederRole;
  catalog_bindings: Record<string, unknown> | null;
  protection?: {
    breaker_role: string;
    device_catalog_ref: string;
    device_label: string;
    protected_object: string;
    analysis_scope: string;
  };
}

// elementTypeFromSelectionHint moved to InsertStationFormHelpers.ts

function resolveSelectionName(
  snapshot: EnergyNetworkModel | null | undefined,
  elementId: string,
  fallbackName: string,
): string {
  const collections = [
    snapshot?.substations,
    snapshot?.branches,
    snapshot?.buses,
    snapshot?.transformers,
    snapshot?.sources,
    snapshot?.bays,
  ];
  for (const collection of collections) {
    const match = collection?.find((item) => item.ref_id === elementId || item.id === elementId);
    if (match?.name) {
      return match.name;
    }
  }
  return fallbackName;
}

function selectionFromDomainResponse(
  response: DomainOpResponseV1,
  fallbackName: string,
): SelectedElement | null {
  const hint = response.selection_hint;
  if (!hint?.element_id) {
    return null;
  }
  return {
    id: hint.element_id,
    type: elementTypeFromSelectionHint(hint.element_type),
    name: resolveSelectionName(response.snapshot, hint.element_id, fallbackName),
  };
}

// stationRef moved to InsertStationFormHelpers.ts

function stationSelectionFromMaterialization(
  response: DomainOpResponseV1,
  fallbackName: string,
  previousSnapshot: EnergyNetworkModel | null,
): SelectedElement | null {
  const hintedSelection = selectionFromDomainResponse(response, fallbackName);
  const hintedStation = hintedSelection?.type === 'Station'
    ? response.snapshot?.substations?.find(
      (station) => stationRef(station) === hintedSelection.id || station.id === hintedSelection.id,
    )
    : null;
  if (hintedSelection && hintedStation) {
    return {
      ...hintedSelection,
      name: stationPublicName(hintedStation, fallbackName),
    };
  }

  const previousStationRefs = new Set(
    (previousSnapshot?.substations ?? []).map((station) => stationRef(station)),
  );
  const createdStation = (response.snapshot?.substations ?? [])
    .filter((station) => station.station_type !== 'gpz')
    .find((station) => !previousStationRefs.has(stationRef(station)));
  if (!createdStation) return null;

  return {
    id: stationRef(createdStation),
    type: 'Station',
    name: stationPublicName(createdStation, fallbackName),
  };
}

// stationPublicName moved to InsertStationFormHelpers.ts

const STATION_KIND_OPTIONS: Array<{
  value: TopologicalStationKind;
  label: string;
  description: string;
}> = [
  {
    value: 'inline',
    label: 'Przelotowa',
    description: 'Wejście i wyjście magistrali SN oraz pole transformatorowe.',
  },
  {
    value: 'terminal',
    label: 'Końcowa',
    description: 'Zasilanie jednostronne, bez pola wyjściowego magistrali.',
  },
  {
    value: 'branch',
    label: 'Rozgałęźna',
    description: 'Magistrala z dodatkowym polem odgałęźnym.',
  },
  {
    value: 'sectional',
    label: 'Sekcyjna',
    description: 'Układ z polem sprzęgła dla podziału sekcji SN.',
  },
];

const STARTER_SWITCHGEAR_MANUFACTURERS: Manufacturer[] = [
  {
    manufacturer_ref: 'ZPUE_WLOSZCZOWA',
    name: 'ZPUE Włoszczowa',
    normalized_code: 'ZPUE',
    country: 'PL',
    status: 'verified',
    source_refs: ['MV_DESIGN_PRO_SWITCHGEAR_SOLUTION_V1'],
    notes_pl: 'Pakiet rozdzielnicy SN dostępny jako rozwiązanie katalogowe MV-DESIGN-PRO.',
  },
  {
    manufacturer_ref: 'ELEKTROMETAL',
    name: 'Elektrometal',
    normalized_code: 'ELEKTROMETAL',
    country: 'PL',
    status: 'verified',
    source_refs: ['MV_DESIGN_PRO_SWITCHGEAR_SOLUTION_V1'],
    notes_pl: 'Pakiet rozdzielnicy SN dostępny jako rozwiązanie katalogowe MV-DESIGN-PRO.',
  },
  {
    manufacturer_ref: 'SIEMENS',
    name: 'Siemens',
    normalized_code: 'SIEMENS',
    country: 'DE',
    status: 'verified',
    source_refs: ['MV_DESIGN_PRO_SWITCHGEAR_SOLUTION_V1'],
    notes_pl: 'Pakiet rozdzielnicy SN dostępny jako rozwiązanie katalogowe MV-DESIGN-PRO.',
  },
  {
    manufacturer_ref: 'ABB',
    name: 'ABB',
    normalized_code: 'ABB',
    country: 'CH',
    status: 'verified',
    source_refs: ['MV_DESIGN_PRO_SWITCHGEAR_SOLUTION_V1'],
    notes_pl: 'Pakiet rozdzielnicy SN dostępny jako rozwiązanie katalogowe MV-DESIGN-PRO.',
  },
];

// SWITCHGEAR_MANUFACTURER_ORDER moved to InsertStationFormHelpers.ts

// SN_FIELD_ROLE_TO_BAY_KIND moved to InsertStationFormHelpers.ts

// SN_FIELD_ROLES moved to InsertStationFormHelpers.ts

// SOURCE_STATUS_LABEL_PL moved to InsertStationFormHelpers.ts

// buildDefaultSnFields moved to InsertStationFormHelpers.ts

function buildStationSnFields(
  stationKind: TopologicalStationKind,
  templatesByRole: Partial<Record<SnFieldRole, CompleteMvBayTemplateSummary>>,
  switchgearChoice: StationSwitchgearChoice,
): StationSnFieldTemplate[] {
  return buildDefaultSnFields(stationKind).map((field) => {
    const role = field.field_role as SnFieldRole;
    const template = templatesByRole[role] ?? null;
    return {
      ...field,
      manufacturer_ref: switchgearChoice.manufacturerRef,
      switchgear_family_ref: switchgearChoice.switchgearFamilyRef,
      bay_kind: SN_FIELD_ROLE_TO_BAY_KIND[role],
      bay_template_ref: template?.template_ref ?? null,
      source_status: template?.source_status ?? 'requires_catalog',
      source_refs: template?.source_refs ?? [],
      catalog_bindings: template
        ? {
            switchgear_template: {
              catalog_namespace: 'ROZDZIELNICA_SN',
              catalog_item_id: template.template_ref,
              manufacturer_ref: switchgearChoice.manufacturerRef,
              switchgear_family_ref: switchgearChoice.switchgearFamilyRef,
              source_status: template.source_status,
            },
          }
        : null,
    };
  });
}

// orderManufacturers moved to InsertStationFormHelpers.ts

function mergeStarterManufacturers(loaded: Manufacturer[]): Manufacturer[] {
  const merged = new Map<string, Manufacturer>();
  for (const manufacturer of STARTER_SWITCHGEAR_MANUFACTURERS) {
    merged.set(manufacturer.manufacturer_ref, manufacturer);
  }
  for (const manufacturer of loaded) {
    const existing = merged.get(manufacturer.manufacturer_ref);
    if (existing && isUsableManufacturer(existing) && !isUsableManufacturer(manufacturer)) {
      continue;
    }
    merged.set(manufacturer.manufacturer_ref, manufacturer);
  }
  return orderManufacturers([...merged.values()]);
}

// switchgearStatusLabel moved to InsertStationFormHelpers.ts

function findTemplateForRole(
  templates: CompleteMvBayTemplateSummary[],
  role: SnFieldRole,
): CompleteMvBayTemplateSummary | null {
  return templateOptionsForRole(templates, role)[0] ?? null;
}

function templateOptionsForRole(
  templates: CompleteMvBayTemplateSummary[],
  role: SnFieldRole,
): CompleteMvBayTemplateSummary[] {
  const bayKind = SN_FIELD_ROLE_TO_BAY_KIND[role];
  return templates
    .filter((template) => template.bay_kind === bayKind)
    .filter(isCompleteBayTemplate)
    .sort(compareBayTemplateOptions);
}

// 7 helpers (compareBayTemplateOptions, sourceStatusRank, isCompleteSourceStatus,
// isCompleteBayTemplate, isUsableManufacturer, isUsableSwitchgearFamily,
// templateOptionLabel, bayKindLabel) moved to InsertStationFormHelpers.ts

// FIELD_ROLE_LABELS moved to InsertStationFormHelpers.ts

const NN_CONFIGURATION_OPTIONS: NnConfigurationOption[] = [
  {
    value: 'LOAD_NN',
    label: 'Rozdzielnia nN odbiorcza',
    description: 'Typowa rozdzielnia odbiorcza. 0,4 kV jest propozycją domyślną, nie regułą.',
  },
  {
    value: 'PV_INVERTER',
    label: 'PV przez falownik',
    description: 'Napięcie strony nN wynika z wybranej pozycji katalogowej falownika PV.',
    converterKind: 'PV',
  },
  {
    value: 'BESS_INVERTER',
    label: 'BESS przez falownik',
    description: 'Napięcie strony nN wynika z katalogu falownika magazynu energii.',
    converterKind: 'BESS',
  },
  {
    value: 'FW_INVERTER',
    label: 'FW przez falownik',
    description: 'Napięcie strony nN wynika z katalogu falownika elektrowni wiatrowej.',
    converterKind: 'WIND',
  },
  {
    value: 'CUSTOM_NN',
    label: 'Własne napięcie strony nN',
    description: 'Napięcie wybierane jawnie przez projektanta dla nietypowej strony nN.',
  },
];

const NN_VOLTAGE_OPTIONS_KV = [0.4, 0.5, 0.69, 0.8, 1, 3.15, 6, 6.3];
const STATION_SN_SIDE_REF = '__station_sn_side__';
const STATION_NN_SIDE_REF = '__station_nn_side__';
const DEFAULT_SN_VOLTAGE_KV = 15;
// DEFAULT_RECEIVER_NN_VOLTAGE_KV moved to InsertStationFormHelpers.ts
const DEFAULT_CUSTOM_NN_VOLTAGE_KV = 0.69;
const SN_VOLTAGE_TOLERANCE_KV = 0.01;
const NN_VOLTAGE_TOLERANCE_KV = 0.001;
// MAX_STATION_NN_SOURCE_VOLTAGE_KV moved to InsertStationFormHelpers.ts
const NO_COMPATIBLE_TRANSFORMER_MESSAGE =
  'Wybierz wariant stacji z transformatorem zgodnym z napięciem SN i napięciem strony nN źródła.';

// clampOutgoingFeederCount moved to InsertStationFormHelpers.ts

// describeConfigurationScope moved to InsertStationFormHelpers.ts

// voltageMatches moved to InsertStationFormHelpers.ts
// compareStationNnSourceConverters, compareTransformersForSourcePower,
// catalogItemIdFromRef, findTransformerByCatalogRef, sourceFeederRole
// moved to InsertStationFormHelpers.ts (Sprint Etap 4 decompose - druga fala)

// sourceProtectionIntent moved to InsertStationFormHelpers.ts

function toTransformerCatalogEntries(
  types: TransformerType[],
  sourcePowerMva: number | null,
): CatalogEntry[] {
  return types.map((type) => {
    const powerStatus =
      sourcePowerMva == null
        ? 'moc: do bilansu odbiorów'
        : type.rated_power_mva >= sourcePowerMva
          ? `moc zgodna dla ${formatMva(sourcePowerMva)} MVA`
          : `moc za mała dla ${formatMva(sourcePowerMva)} MVA`;
    return {
      id: type.id,
      name: type.name,
      manufacturer: type.manufacturer,
      summary:
        `SN zgodne · nN zgodne · ${powerStatus} · uk ${formatMva(type.uk_percent)}% · `
        + `${type.vector_group}`,
    };
  });
}

function toConverterCatalogEntries(types: ConverterType[]): CatalogEntry[] {
  return types.map((type) => ({
    id: type.id,
    name: type.name,
    manufacturer: type.manufacturer,
    summary:
      `Un ${formatKv(type.un_kv)} kV · Sn ${formatMva(type.sn_mva)} MVA · `
      + `Pmax ${formatMva(type.pmax_mw)} MW`,
  }));
}

function deriveSnVoltageKv(
  snapshot: unknown,
  busOptions: Array<{ ref_id: string; name: string; voltage_kv: number }>,
  segmentId: string,
): number {
  const model = snapshot as {
    branches?: Array<{
      id?: string;
      ref_id?: string;
      from_bus_ref?: string | null;
      to_bus_ref?: string | null;
    }>;
  } | null;
  const segment = model?.branches?.find(
    (branch) => branch.ref_id === segmentId || branch.id === segmentId,
  );
  const segmentBusRef = segment?.from_bus_ref ?? segment?.to_bus_ref ?? null;
  const segmentBusVoltage = busOptions.find((bus) => bus.ref_id === segmentBusRef)?.voltage_kv;
  if (
    typeof segmentBusVoltage === 'number'
    && Number.isFinite(segmentBusVoltage)
    && segmentBusVoltage > 0
  ) {
    return segmentBusVoltage;
  }

  const firstMvBus = busOptions.find((bus) => bus.voltage_kv >= 1 && bus.voltage_kv < 60);
  return firstMvBus?.voltage_kv ?? DEFAULT_SN_VOLTAGE_KV;
}

// contextString moved to InsertStationFormHelpers.ts

// resolveSegmentIdFromContext moved to InsertStationFormHelpers.ts

// branchExists moved to InsertStationFormHelpers.ts

function engineeringSegmentLabel(
  segmentId: string,
  model: { branches?: Array<{ ref_id?: string; id?: string; name?: string; label?: string }> } | null,
): string {
  const branch = model?.branches?.find(
    (candidate) => candidate.ref_id === segmentId || candidate.id === segmentId,
  );
  const terrainBranches = (model?.branches ?? []).filter(isTerrainSnSegment);
  const terrainIndex = terrainBranches.findIndex(
    (candidate) => candidate.ref_id === segmentId || candidate.id === segmentId,
  );
  const publicLabel = (branch?.name ?? branch?.label ?? '').trim();
  if (
    publicLabel
    && !/\b(?:seg|ref|hash)\b/i.test(publicLabel)
    && !/\/segment\b/i.test(publicLabel)
  ) {
    return publicLabel;
  }
  if (terrainIndex >= 0) {
    return `Odcinek ${String(terrainIndex + 1).padStart(2, '0')}`;
  }
  const match = segmentId.match(/(?:seg|segment|odcinek)[_/-]?(\d+)/i);
  if (match?.[1]) {
    return `Odcinek ${String(Number(match[1])).padStart(2, '0')}`;
  }
  return 'Odcinek SN';
}

// stationNameFromData moved to InsertStationFormHelpers.ts

function StationSystemPreview({
  stationTypeLabel,
  stationKind,
  snVoltageKv,
  nnVoltageKv,
  requiredNnVoltageIsValid,
  snFields,
  selectedManufacturer,
  selectedFamily,
  switchgearFamilyLabel,
  outgoingFeederCount,
  nnConfigurationLabel,
  recommendedTransformer,
  selectedConverter,
}: {
  stationTypeLabel: string;
  stationKind: TopologicalStationKind;
  snVoltageKv: number;
  nnVoltageKv: number | null;
  requiredNnVoltageIsValid: boolean;
  snFields: StationSnFieldTemplate[];
  selectedManufacturer: Manufacturer | null;
  selectedFamily: SwitchgearFamily | null;
  switchgearFamilyLabel: string;
  outgoingFeederCount: number;
  nnConfigurationLabel: string;
  recommendedTransformer: TransformerType | null;
  selectedConverter: ConverterType | null;
}) {
  const snFieldLabels = snFields.map((field) => FIELD_ROLE_LABELS[field.field_role] ?? field.field_role);
  const snFieldCount = snFieldLabels.length;
  const transformerLabel = recommendedTransformer
    ? `${recommendedTransformer.name} · ${formatMva(recommendedTransformer.rated_power_mva)} MVA`
    : 'transformator do doboru';
  const nnVoltageLabel = requiredNnVoltageIsValid ? `${formatKv(nnVoltageKv)} kV` : 'do ustalenia';
  const isPvBehindTransformer = selectedConverter?.kind === 'PV';
  const sourceProtection = sourceProtectionIntent(isPvBehindTransformer ? 'PV_INVERTER' : 'LOAD_NN');
  const sourceLabel = selectedConverter
    ? `${selectedConverter.name} · ${formatMva(selectedConverter.pmax_mw)} MW · ${formatKv(selectedConverter.un_kv)} kV`
    : 'źródło do wyboru z katalogu';
  const stationGoal =
    stationKind === 'terminal'
      ? 'Zasilanie jednostronne bez kontynuacji magistrali.'
      : stationKind === 'branch'
        ? 'Węzeł z odpływem odgałęźnym z magistrali SN.'
        : stationKind === 'sectional'
          ? 'Podział sekcji z polem sprzęgłowym.'
          : 'Wpięcie przelotowe w istniejącą magistralę SN.';

  return (
    <div className="mt-4 space-y-3">
      <div className="border border-[#1d4b69] bg-[#06111d] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono-eng text-[10px] uppercase tracking-[0.18em] text-[#79d7ff]">
              Schemat jednokreskowy stacji
            </div>
            <div className="mt-1 text-sm font-semibold text-white">{stationTypeLabel}</div>
            <div className="mt-1 text-xs leading-5 text-[#a8c7e2]">{stationGoal}</div>
          </div>
          <div className="border border-[#28425f] bg-[#07111c] px-3 py-2 text-right font-mono-eng text-[10px] uppercase tracking-[0.1em] text-[#9fc2df]">
            <div>{formatKv(snVoltageKv)} kV SN</div>
            <div>{nnVoltageLabel} nN</div>
          </div>
        </div>

        <div className="mt-4 border border-[#17314c] bg-[#07111c] p-3">
          <StationSwitchgearSld
            snFields={snFields}
            snVoltageKv={snVoltageKv}
            selectedManufacturer={selectedManufacturer}
            selectedFamily={selectedFamily}
            switchgearFamilyLabel={switchgearFamilyLabel}
          />

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <div className="border border-[#14532d] bg-[#061f18] px-3 py-3">
              <div className="font-mono-eng text-[10px] uppercase tracking-[0.14em] text-[#86efac]">
                Transformator SN/nN
              </div>
              <div className="mt-2 text-sm font-semibold leading-5 text-white">{transformerLabel}</div>
              <div className="mt-2 text-xs leading-5 text-[#a8c7e2]">
                Dobór filtrowany po napięciu SN i wymaganym napięciu strony nN.
              </div>
            </div>
            <div className="border border-[#164e63] bg-[#061826] px-3 py-3">
              <div className="font-mono-eng text-[10px] uppercase tracking-[0.14em] text-[#67e8f9]">
                Strona nN
              </div>
              <div className="mt-2 text-sm font-semibold text-white">
                {nnVoltageLabel} · {outgoingFeederCount} odpływy
              </div>
              <div className="mt-2 text-xs leading-5 text-[#a8c7e2]">{nnConfigurationLabel}</div>
            </div>
          </div>
          {isPvBehindTransformer && (
            <div className="mt-3 border border-[#d6a21d] bg-[#1d1704] px-3 py-3">
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr]">
                <div>
                  <div className="font-mono-eng text-[10px] uppercase tracking-[0.14em] text-[#ffe08a]">
                    PV za transformatorem SN/nN
                  </div>
                  <div className="mt-2 text-sm font-semibold leading-5 text-white">{sourceLabel}</div>
                  <div className="mt-1 text-xs leading-5 text-[#e8d79a]">
                    PCC po stronie nN, z wpływem na rozpływ mocy i wkład zwarciowy zgodnie ze statusem modelu.
                  </div>
                </div>
                <div>
                  <div className="font-mono-eng text-[10px] uppercase tracking-[0.14em] text-[#ffe08a]">
                    Aparatura nN PV
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-white">
                    <span className="grid h-7 w-7 place-items-center border border-[#86efac] bg-[#06351f] font-bold">Q1</span>
                    <span>wyłącznik nN falownika</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-white">
                    <span className="grid h-7 w-7 place-items-center border border-[#86efac] bg-[#06351f] font-bold">Q2</span>
                    <span>wyłącznik nN odpływu pomocniczego</span>
                  </div>
                </div>
                <div>
                  <div className="font-mono-eng text-[10px] uppercase tracking-[0.14em] text-[#ffe08a]">
                    Zabezpieczenie źródła
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {sourceProtection?.device_label}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[#e8d79a]">
                    Chroniony obiekt: {sourceProtection?.protected_object}. Zakres analizy: {sourceProtection?.analysis_scope}.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border border-[#28425f] bg-[#07111c] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono-eng text-[10px] uppercase tracking-[0.18em] text-[#79d7ff]">
            Decyzje projektowe
          </div>
          <div className="border border-[#31506f] px-2 py-1 text-[10px] font-semibold text-[#bfdbfe]">
            {snFieldCount} pól SN · {outgoingFeederCount} odpływy nN
          </div>
        </div>
        <dl className="mt-3 grid gap-2 text-xs md:grid-cols-2">
          <SystemPreviewRow label="Funkcja w sieci" value={stationTypeLabel} />
          <SystemPreviewRow label="Napięcie SN" value={`${formatKv(snVoltageKv)} kV`} />
          <SystemPreviewRow label="Napięcie nN" value={nnVoltageLabel} />
          <SystemPreviewRow label="Odpływy nN" value={`${outgoingFeederCount}`} />
          <SystemPreviewRow label="Pola SN" value={snFieldLabels.join(', ')} />
          <SystemPreviewRow label="Transformator" value={transformerLabel} />
          {isPvBehindTransformer && (
            <SystemPreviewRow
              label="PV po stronie nN"
              value={`${sourceLabel}; zabezpieczenie ${sourceProtection?.device_label ?? 'do doboru'}`}
            />
          )}
        </dl>
      </div>
    </div>
  );
}

function StationSwitchgearSld({
  snFields,
  snVoltageKv,
  selectedManufacturer,
  selectedFamily,
  switchgearFamilyLabel,
}: {
  snFields: StationSnFieldTemplate[];
  snVoltageKv: number;
  selectedManufacturer: Manufacturer | null;
  selectedFamily: SwitchgearFamily | null;
  switchgearFamilyLabel: string;
}) {
  const bayCount = Math.max(snFields.length, 1);
  const width = Math.max(520, 118 + bayCount * 112);
  const busY = 48;
  const bayPitch = (width - 120) / bayCount;
  const bayStart = 60 + bayPitch / 2;
  const familyLabel = selectedFamily ? selectedFamily.family_name : switchgearFamilyLabel;
  const sourceWarning = selectedManufacturer && isUsableManufacturer(selectedManufacturer)
    ? 'Pakiet katalogowy rozdzielnicy SN jest kompletny dla wybranego wariantu.'
    : 'Wybierz kompletny pakiet katalogowy rozdzielnicy SN.';

  return (
    <div data-testid="station-switchgear-catalog-preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono-eng text-[10px] uppercase tracking-[0.14em] text-[#79d7ff]">
            Rozdzielnica SN - szablony pól
          </div>
          <div className="mt-1 text-xs text-[#c7def4]">
            {selectedManufacturer?.name ?? 'Producent do wyboru'} / {familyLabel}
          </div>
        </div>
        <div className="border border-[#1d5b90] bg-[#071b34] px-2 py-1 text-xs font-semibold text-white">
          {formatKv(snVoltageKv)} kV SN
        </div>
      </div>

      <svg
        className="mt-3 h-[210px] w-full overflow-visible border border-[#12304a] bg-[#050b12]"
        viewBox={`0 0 ${width} 210`}
        role="img"
        aria-label="Podgląd rozdzielnicy SN stacji"
      >
        <line x1={36} y1={busY} x2={width - 36} y2={busY} stroke="#19c15f" strokeWidth={5} />
        <text x={42} y={busY - 12} fill="#79d7ff" fontSize={10} fontFamily="monospace">
          SZYNA SN
        </text>
        {snFields.map((field, index) => {
          const cx = bayStart + index * bayPitch;
          return (
            <StationBaySldColumn
              key={`${field.field_role}-${index}`}
              field={field}
              x={cx}
              busY={busY}
              index={index}
            />
          );
        })}
      </svg>

      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {snFields.map((field) => (
          <div
            key={`${field.field_role}-${field.bay_template_ref ?? 'missing'}`}
            className="border border-[#1d3550] bg-[#06111d] px-3 py-2 text-xs"
          >
            <span className="font-semibold text-white">
              {FIELD_ROLE_LABELS[field.field_role] ?? field.field_role}
            </span>
            <span className="ml-2 text-[#8eb1cf]">
              {field.bay_template_ref ? bayKindLabel(field.bay_kind) : 'wybierz szablon pola'}
            </span>
            <span className="mt-1 block text-[#ffd166]">
              {field.bay_template_ref
                ? SOURCE_STATUS_LABEL_PL[field.source_status]
                : 'oczekuje na wybór pakietu'}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 border border-[#6f4d12] bg-[#1d1704] px-3 py-2 text-xs leading-5 text-[#ffe08a]">
        {sourceWarning}
      </div>
    </div>
  );
}

function StationBaySldColumn({
  field,
  x,
  busY,
  index,
}: {
  field: StationSnFieldTemplate;
  x: number;
  busY: number;
  index: number;
}) {
  const label = FIELD_ROLE_LABELS[field.field_role] ?? field.field_role;
  const isTransformer = field.field_role === 'TRANSFORMATOROWE';
  const isCoupler = field.field_role === 'SPRZEGLO';
  const isMissing = !isCompleteSourceStatus(field.source_status);
  const bayTop = busY + 14;
  const switchY = bayTop + 28;
  const ctY = switchY + 28;
  const endY = isTransformer ? 168 : 154;

  return (
    <g data-testid={`station-switchgear-bay-${field.field_role}`}>
      <rect
        x={x - 34}
        y={bayTop - 8}
        width={68}
        height={isTransformer ? 132 : 112}
        fill="#091722"
        stroke="#1b415b"
        strokeWidth={0.8}
        opacity={0.78}
      />
      <line x1={x} y1={busY} x2={x} y2={endY} stroke="#dce9f5" strokeWidth={2} />
      <circle cx={x} cy={switchY - 18} r={7} fill="#050b12" stroke="#dce9f5" strokeWidth={1.6}>
        <title>Odłącznik szynowy</title>
      </circle>
      {isTransformer ? (
        <>
          <rect x={x - 6} y={switchY - 5} width={12} height={18} fill="#0f9f58" stroke="#62e99f" strokeWidth={1.4}>
            <title>Bezpiecznik / rozłącznik bezpiecznikowy pola TR</title>
          </rect>
          <circle cx={x - 8} cy={ctY + 22} r={10} fill="none" stroke="#a5c8ff" strokeWidth={2} />
          <circle cx={x + 8} cy={ctY + 22} r={10} fill="none" stroke="#a5c8ff" strokeWidth={2} />
        </>
      ) : isCoupler ? (
        <rect x={x - 9} y={switchY - 9} width={18} height={18} fill="none" stroke="#7ec8ff" strokeWidth={2}>
          <title>Wyłącznik / sprzęgło sekcyjne</title>
        </rect>
      ) : (
        <polygon
          points={`${x},${switchY - 12} ${x + 12},${switchY} ${x},${switchY + 12} ${x - 12},${switchY}`}
          fill={isMissing ? '#3a2a07' : '#0f9f58'}
          stroke={isMissing ? '#ffb020' : '#62e99f'}
          strokeWidth={1.5}
        >
          <title>Rozłącznik pola liniowego</title>
        </polygon>
      )}
      {!isTransformer && (
        <>
          <circle cx={x} cy={ctY} r={7} fill="none" stroke="#ffcf5a" strokeWidth={1.8}>
            <title>Przekładnik prądowy</title>
          </circle>
          <g>
            <line x1={x + 14} y1={ctY + 20} x2={x + 28} y2={ctY + 20} stroke="#dce9f5" strokeWidth={1.2} />
            <line x1={x + 28} y1={ctY + 20} x2={x + 28} y2={ctY + 34} stroke="#dce9f5" strokeWidth={1.2} strokeDasharray="2 2" />
            <line x1={x + 22} y1={ctY + 34} x2={x + 34} y2={ctY + 34} stroke="#dce9f5" strokeWidth={1.2} />
            <line x1={x + 24} y1={ctY + 38} x2={x + 32} y2={ctY + 38} stroke="#dce9f5" strokeWidth={1} />
          </g>
        </>
      )}
      <text x={x} y={28} textAnchor="middle" fill="#ffe08a" fontSize={12} fontWeight={800}>
        {index + 1}
      </text>
      <text x={x} y={190} textAnchor="middle" fill="#e6f4ff" fontSize={10} fontWeight={700}>
        {label.replace('Pole ', '')}
      </text>
      <text x={x} y={202} textAnchor="middle" fill={isMissing ? '#ffb020' : '#77e7a4'} fontSize={8}>
        {SOURCE_STATUS_LABEL_PL[field.source_status]}
      </text>
    </g>
  );
}

function SystemPreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#1d3550] bg-[#06111d] px-3 py-2">
      <dt className="font-mono-eng text-[10px] uppercase tracking-[0.12em] text-[#8eb1cf]">
        {label}
      </dt>
      <dd className="mt-1 break-words leading-5 text-[#e6f4ff]">{value}</dd>
    </div>
  );
}

export function InsertStationForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [outgoingFeederCount, setOutgoingFeederCount] = useState(2);
  const [nnConfiguration, setNnConfiguration] = useState<NnConfiguration>('LOAD_NN');
  const [receiverNnVoltageKv, setReceiverNnVoltageKv] = useState(DEFAULT_RECEIVER_NN_VOLTAGE_KV);
  const [customNnVoltageKv, setCustomNnVoltageKv] = useState(DEFAULT_CUSTOM_NN_VOLTAGE_KV);
  const [selectedConverterId, setSelectedConverterId] = useState('');
  const [transformerTypes, setTransformerTypes] = useState<TransformerType[]>([]);
  const [converterTypes, setConverterTypes] = useState<ConverterType[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(true);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>(
    STARTER_SWITCHGEAR_MANUFACTURERS,
  );
  const [switchgearFamilies, setSwitchgearFamilies] = useState<SwitchgearFamily[]>([]);
  const [bayTemplates, setBayTemplates] = useState<CompleteMvBayTemplateSummary[]>([]);
  const [switchgearCatalogError, setSwitchgearCatalogError] = useState<string | null>(null);
  const [selectedManufacturerRef, setSelectedManufacturerRef] = useState(
    STARTER_SWITCHGEAR_MANUFACTURERS[0].manufacturer_ref,
  );
  const [selectedFamilyRef, setSelectedFamilyRef] = useState<string | null>(null);
  const [selectedBayTemplateRefs, setSelectedBayTemplateRefs] = useState<
    Partial<Record<SnFieldRole, string>>
  >({});

  const busOptions = useMemo(() => selectBusOptions(snapshot), [snapshot]);
  const nextStationOrdinal = useMemo(() => {
    const existingStationCount = (snapshot?.substations ?? []).filter(
      (station) => station.station_type !== 'gpz',
    ).length;
    return existingStationCount + 1;
  }, [snapshot]);
  const defaultStationRefId = useMemo(
    () => `ST-${String(nextStationOrdinal).padStart(3, '0')}`,
    [nextStationOrdinal],
  );
  const defaultStationName = useMemo(
    () => `Stacja SN/nN ${nextStationOrdinal}`,
    [nextStationOrdinal],
  );

  const initialData = useMemo<Partial<TransformerStationFormData>>(() => {
    const transformerContext = context?.transformer as Record<string, unknown> | undefined;
    return {
      ref_id: (context?.ref_id as string) ?? defaultStationRefId,
      name: (context?.name as string) ?? defaultStationName,
      hv_bus_ref: (context?.hv_bus_ref as string) ?? STATION_SN_SIDE_REF,
      lv_bus_ref: (context?.lv_bus_ref as string) ?? STATION_NN_SIDE_REF,
      catalog_ref:
        catalogRefFromInput(transformerContext?.catalog_binding)
        ?? catalogRefFromInput(context?.catalog_binding)
        ?? '',
    };
  }, [context, defaultStationName, defaultStationRefId]);

  const segmentId = useMemo(
    () => resolveSegmentIdFromContext(context, snapshot),
    [context, snapshot],
  );
  const segmentLabel = useMemo(
    () => engineeringSegmentLabel(segmentId, snapshot),
    [segmentId, snapshot],
  );
  const rawPositionOnSegment = context?.position_on_segment;
  const positionOnSegment =
    typeof rawPositionOnSegment === 'number' && Number.isFinite(rawPositionOnSegment)
      ? rawPositionOnSegment
      : 0.5;
  const endpointBusRef = useMemo(
    () =>
      contextString(context, [
        'endpoint_bus_ref',
        'terminal_id',
        'terminalId',
        'from_bus_ref',
      ]),
    [context],
  );
  const runRef = useMemo(
    () => contextString(context, ['run_ref', 'corridor_ref', 'trunk_id', 'trunkId']),
    [context],
  );
  const placementMode = String(context?.placement_mode ?? '').toUpperCase();
  const isEndpointAppend =
    Boolean(endpointBusRef)
    && (placementMode === 'ENDPOINT_APPEND' || positionOnSegment >= 0.999);
  const placementLabel = isEndpointAppend
    ? 'koniec poprzedniego odcinka'
    : `podział odcinka w ${positionOnSegment.toFixed(2)}`;
  const initialStationKind = useMemo(
    () =>
      normalizeTopologicalStationKind(
        (context?.station as Record<string, unknown> | undefined)?.station_type
          ?? context?.station_type,
      ),
    [context],
  );
  const [stationKind, setStationKind] = useState<TopologicalStationKind>(initialStationKind);
  useEffect(() => {
    setStationKind(initialStationKind);
  }, [initialStationKind]);
  const stationTypeLabelPl = useMemo(
    () => formatStationTypeLabelPl(stationKind),
    [stationKind],
  );
  const stationSnVoltageKv = useMemo(
    () => deriveSnVoltageKv(snapshot, busOptions, segmentId),
    [busOptions, segmentId, snapshot],
  );
  const selectedManufacturer = useMemo(
    () =>
      manufacturers.find((manufacturer) => manufacturer.manufacturer_ref === selectedManufacturerRef)
      ?? null,
    [manufacturers, selectedManufacturerRef],
  );
  const familiesForManufacturer = useMemo(
    () =>
      switchgearFamilies
        .filter((family) => family.manufacturer_ref === selectedManufacturerRef)
        .filter(isUsableSwitchgearFamily)
        .filter(
          (family) =>
            family.voltage_levels.length === 0
            || family.voltage_levels.some((voltage) =>
              voltageMatches(voltage, stationSnVoltageKv, 0.5),
            ),
        )
        .sort(
          (left, right) =>
            left.family_name.localeCompare(right.family_name, 'pl-PL')
            || left.switchgear_family_ref.localeCompare(right.switchgear_family_ref),
        ),
    [selectedManufacturerRef, stationSnVoltageKv, switchgearFamilies],
  );
  const selectedFamily = useMemo(
    () =>
      familiesForManufacturer.find((family) => family.switchgear_family_ref === selectedFamilyRef)
      ?? null,
    [familiesForManufacturer, selectedFamilyRef],
  );
  const templatesForSwitchgear = useMemo(
    () =>
      bayTemplates.filter((template) => {
        const manufacturerMatches =
          template.manufacturer_ref == null || template.manufacturer_ref === selectedManufacturerRef;
        const familyMatches =
          !selectedFamilyRef
          || template.switchgear_family_ref == null
          || template.switchgear_family_ref === selectedFamilyRef;
        return manufacturerMatches && familyMatches && isCompleteBayTemplate(template);
      }),
    [bayTemplates, selectedFamilyRef, selectedManufacturerRef],
  );
  const switchgearFamilyLabel = useMemo(() => {
    if (selectedFamily) {
      return selectedFamily.family_name;
    }
    if (familiesForManufacturer.length === 0 && templatesForSwitchgear.length > 0) {
      return 'pakiet standardowy producenta';
    }
    return 'wybierz rodzinę rozdzielnicy';
  }, [familiesForManufacturer.length, selectedFamily, templatesForSwitchgear.length]);
  const templatesByRole = useMemo(() => {
    const byRole: Partial<Record<SnFieldRole, CompleteMvBayTemplateSummary>> = {};
    for (const role of SN_FIELD_ROLES) {
      const options = templateOptionsForRole(templatesForSwitchgear, role);
      const selectedRef = selectedBayTemplateRefs[role];
      byRole[role] =
        options.find((template) => template.template_ref === selectedRef)
        ?? findTemplateForRole(templatesForSwitchgear, role)
        ?? undefined;
    }
    return byRole;
  }, [selectedBayTemplateRefs, templatesForSwitchgear]);
  const stationSnFields = useMemo(
    () =>
      buildStationSnFields(stationKind, templatesByRole, {
        manufacturerRef: selectedManufacturerRef,
        switchgearFamilyRef: selectedFamilyRef,
      }),
    [selectedFamilyRef, selectedManufacturerRef, stationKind, templatesByRole],
  );
  const snFieldPreview = useMemo(
    () =>
      stationSnFields.map(
        (field) => FIELD_ROLE_LABELS[field.field_role] ?? field.field_role,
      ),
    [stationSnFields],
  );
  const selectedConfiguration = useMemo(
    () =>
      NN_CONFIGURATION_OPTIONS.find((option) => option.value === nnConfiguration)
      ?? NN_CONFIGURATION_OPTIONS[0],
    [nnConfiguration],
  );
  const filteredConverters = useMemo(
    () => {
      if (!selectedConfiguration.converterKind) return [];
      return converterTypes
        .filter(
          (type) =>
            type.kind === selectedConfiguration.converterKind
            && isStationNnSourceConverter(type),
        )
        .sort(compareStationNnSourceConverters);
    },
    [converterTypes, selectedConfiguration.converterKind],
  );
  const selectedConverter = useMemo(
    () => filteredConverters.find((type) => type.id === selectedConverterId) ?? null,
    [filteredConverters, selectedConverterId],
  );
  const requiredNnVoltageKv = useMemo((): number | null => {
    if (nnConfiguration === 'LOAD_NN') return receiverNnVoltageKv;
    if (nnConfiguration === 'CUSTOM_NN') return customNnVoltageKv;
    return selectedConverter?.un_kv ?? null;
  }, [customNnVoltageKv, nnConfiguration, receiverNnVoltageKv, selectedConverter?.un_kv]);
  const requiredNnVoltageIsValid =
    typeof requiredNnVoltageKv === 'number'
    && Number.isFinite(requiredNnVoltageKv)
    && requiredNnVoltageKv > 0;
  const sourcePowerMva =
    nnConfiguration === 'LOAD_NN' || nnConfiguration === 'CUSTOM_NN'
      ? null
      : selectedConverter?.sn_mva ?? null;
  const compatibleTransformerTypes = useMemo(() => {
    if (!requiredNnVoltageIsValid) return [];
    return transformerTypes
      .filter(
        (type) =>
          voltageMatches(type.voltage_hv_kv, stationSnVoltageKv, SN_VOLTAGE_TOLERANCE_KV)
          && voltageMatches(type.voltage_lv_kv, requiredNnVoltageKv, NN_VOLTAGE_TOLERANCE_KV),
      )
      .sort(compareTransformersForSourcePower(sourcePowerMva));
  }, [
    requiredNnVoltageIsValid,
    requiredNnVoltageKv,
    sourcePowerMva,
    stationSnVoltageKv,
    transformerTypes,
  ]);
  const hasAdequateTransformerPower = compatibleTransformerTypes.some((type) =>
    hasEnoughTransformerPower(type, sourcePowerMva),
  );
  const transformerCatalogEntries = useMemo(
    () => toTransformerCatalogEntries(compatibleTransformerTypes, sourcePowerMva),
    [compatibleTransformerTypes, sourcePowerMva],
  );
  const recommendedTransformer = compatibleTransformerTypes[0] ?? null;
  const editorInitialData = useMemo<Partial<TransformerStationFormData>>(
    () => ({
      ...initialData,
      catalog_ref: initialData.catalog_ref || recommendedTransformer?.id || '',
    }),
    [initialData, recommendedTransformer?.id],
  );
  const editorContextKey = useMemo(
    () =>
      [
        isEndpointAppend ? 'endpoint' : 'segment',
        endpointBusRef || segmentId || 'unknown-segment',
        editorInitialData.ref_id || 'station',
        editorInitialData.name || 'station-name',
        editorInitialData.catalog_ref || 'transformer',
      ].join(':'),
    [
      editorInitialData.catalog_ref,
      editorInitialData.name,
      editorInitialData.ref_id,
      endpointBusRef,
      isEndpointAppend,
      segmentId,
    ],
  );
  const converterCatalogEntries = useMemo(
    () => toConverterCatalogEntries(filteredConverters),
    [filteredConverters],
  );
  const configurationScopeLabel = useMemo(
    () => describeConfigurationScope(stationKind, nnConfiguration),
    [nnConfiguration, stationKind],
  );
  const stationBusOptions = useMemo(
    () => [
      ...busOptions,
      {
        ref_id: STATION_SN_SIDE_REF,
        name: 'Strona SN stacji',
        voltage_kv: stationSnVoltageKv,
      },
      {
        ref_id: STATION_NN_SIDE_REF,
        name: 'Strona nN stacji',
        voltage_kv: requiredNnVoltageIsValid
          ? (requiredNnVoltageKv as number)
          : DEFAULT_RECEIVER_NN_VOLTAGE_KV,
      },
    ],
    [busOptions, requiredNnVoltageIsValid, requiredNnVoltageKv, stationSnVoltageKv],
  );

  useEffect(() => {
    let cancelled = false;

    setCatalogsLoading(true);
    void Promise.all([fetchTransformerTypes(), fetchConverterTypes()])
      .then(([loadedTransformerTypes, loadedConverterTypes]) => {
        if (cancelled) return;
        setTransformerTypes(loadedTransformerTypes);
        setConverterTypes(loadedConverterTypes);
        setCatalogError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCatalogError(getCatalogErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([fetchManufacturers(), fetchSwitchgearFamilies()])
      .then(([loadedManufacturers, loadedFamilies]) => {
        if (cancelled) return;
        setManufacturers(mergeStarterManufacturers(loadedManufacturers).filter(isUsableManufacturer));
        setSwitchgearFamilies(loadedFamilies.filter(isUsableSwitchgearFamily));
        setSwitchgearCatalogError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setManufacturers(STARTER_SWITCHGEAR_MANUFACTURERS.filter(isUsableManufacturer));
          setSwitchgearFamilies([]);
          setSwitchgearCatalogError(getCatalogErrorMessage(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (manufacturers.some((manufacturer) => manufacturer.manufacturer_ref === selectedManufacturerRef)) {
      return;
    }
    setSelectedManufacturerRef(manufacturers[0]?.manufacturer_ref ?? 'ZPUE_WLOSZCZOWA');
  }, [manufacturers, selectedManufacturerRef]);

  useEffect(() => {
    if (
      selectedFamilyRef
      && familiesForManufacturer.some(
        (family) => family.switchgear_family_ref === selectedFamilyRef,
      )
    ) {
      return;
    }
    setSelectedFamilyRef(familiesForManufacturer[0]?.switchgear_family_ref ?? null);
  }, [familiesForManufacturer, selectedFamilyRef]);

  useEffect(() => {
    let cancelled = false;

    void fetchCompleteBayTemplates(selectedManufacturerRef)
      .then((loadedTemplates) => {
        if (cancelled) return;
        setBayTemplates(loadedTemplates.filter(isCompleteBayTemplate));
        setSwitchgearCatalogError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBayTemplates([]);
          setSwitchgearCatalogError(getCatalogErrorMessage(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedManufacturerRef]);

  useEffect(() => {
    setSelectedBayTemplateRefs((previous) => {
      const next: Partial<Record<SnFieldRole, string>> = {};
      let changed = false;
      for (const role of SN_FIELD_ROLES) {
        const selectedRef = previous[role];
        if (!selectedRef) continue;
        const stillAvailable = templateOptionsForRole(templatesForSwitchgear, role).some(
          (template) => template.template_ref === selectedRef,
        );
        if (stillAvailable) {
          next[role] = selectedRef;
        } else {
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [templatesForSwitchgear]);

  useEffect(() => {
    if (!filteredConverters.some((type) => type.id === selectedConverterId)) {
      setSelectedConverterId('');
    }
  }, [filteredConverters, selectedConverterId]);

  useEffect(() => {
    if (!selectedConfiguration.converterKind || selectedConverterId || filteredConverters.length === 0) {
      return;
    }
    setSelectedConverterId(filteredConverters[0].id);
  }, [filteredConverters, selectedConfiguration.converterKind, selectedConverterId]);

  const configurationBlocker = useMemo(() => {
    if (selectedConfiguration.converterKind && filteredConverters.length === 0) {
      return `Wybierz inny wariant przyłączenia: katalog falowników nie udostępnia pozycji dla konfiguracji ${selectedConfiguration.label}.`;
    }
    if (selectedConfiguration.converterKind && !selectedConverter) {
      return 'Wybierz falownik z katalogu, aby ustalić wymagane napięcie strony nN.';
    }
    if (!requiredNnVoltageIsValid) {
      return 'Wybierz prawidłowe napięcie strony nN.';
    }
    if (transformerTypes.length > 0 && compatibleTransformerTypes.length === 0) {
      return NO_COMPATIBLE_TRANSFORMER_MESSAGE;
    }
    if (transformerTypes.length > 0 && !hasAdequateTransformerPower) {
      return 'Dobierz wariant stacji z transformatorem o mocy zgodnej ze źródłem nN.';
    }
    return null;
  }, [
    compatibleTransformerTypes.length,
    filteredConverters.length,
    hasAdequateTransformerPower,
    requiredNnVoltageIsValid,
    selectedConfiguration.converterKind,
    selectedConfiguration.label,
    selectedConverter,
    transformerTypes.length,
  ]);
  const recommendedStationSaveDisabled =
    catalogsLoading || Boolean(configurationBlocker) || !editorInitialData.catalog_ref;

  const handleSubmit = useCallback(
    async (data: TransformerStationFormData) => {
      if (!activeCaseId) {
        setCatalogError('Wybierz aktywny przypadek obliczeniowy.');
        return;
      }
      if (configurationBlocker) {
        setCatalogError(configurationBlocker);
        return;
      }
      const incompleteField = stationSnFields.find(
        (field) => !field.bay_template_ref || !isCompleteSourceStatus(field.source_status),
      );
      if (incompleteField) {
        setCatalogError('Wybierz kompletne rozwiązanie rozdzielnicy SN dla wszystkich pól stacji.');
        return;
      }

      const hvBusVoltage =
        stationBusOptions.find((option) => option.ref_id === data.hv_bus_ref)?.voltage_kv
        ?? stationSnVoltageKv;
      const stationNnVoltageKv = requiredNnVoltageKv;
      if (!requiredNnVoltageIsValid || stationNnVoltageKv == null) {
        setCatalogError('Nie udało się ustalić napięcia strony nN stacji.');
        return;
      }

      const selectedTransformerType = findTransformerByCatalogRef(transformerTypes, data.catalog_ref);
      if (!selectedTransformerType) {
        setCatalogError('Wybierz transformator z katalogu zgodny z napięciem SN i stroną nN.');
        return;
      }
      const transformerVoltageMatches =
        voltageMatches(selectedTransformerType.voltage_hv_kv, hvBusVoltage, SN_VOLTAGE_TOLERANCE_KV)
        && voltageMatches(
          selectedTransformerType.voltage_lv_kv,
          stationNnVoltageKv,
          NN_VOLTAGE_TOLERANCE_KV,
        );
      if (!transformerVoltageMatches) {
        setCatalogError(NO_COMPATIBLE_TRANSFORMER_MESSAGE);
        return;
      }

      const transformerBinding = normalizeCatalogBinding(data.catalog_ref, 'TRAFO_SN_NN');
      const normalizedOutgoingFeederCount = clampOutgoingFeederCount(outgoingFeederCount);
      const outgoingFeeders: NnFeederPayload[] =
        Array.from({ length: normalizedOutgoingFeederCount }, () => ({
          feeder_role: 'ODPLYW_NN',
          catalog_bindings: null,
        }));
      const feederRole = sourceFeederRole(nnConfiguration);
      if (feederRole) {
        outgoingFeeders.push({
          feeder_role: feederRole,
          catalog_bindings: selectedConverter
            ? {
                source_converter: normalizeCatalogBinding(
                  selectedConverter.id,
                  nnConfiguration === 'PV_INVERTER'
                    ? 'ZRODLO_NN_PV'
                    : nnConfiguration === 'BESS_INVERTER'
                      ? 'ZRODLO_NN_BESS'
                      : 'CONVERTER',
                ),
              }
            : null,
          protection: sourceProtectionIntent(nnConfiguration),
        });
      }

      const stationPayload = {
        name: stationNameFromData(data),
        station_type: stationKind,
        station_role: 'STACJA_SN_NN',
        station_name: stationNameFromData(data),
        sn_voltage_kv: hvBusVoltage,
        nn_voltage_kv: stationNnVoltageKv,
        switchgear: {
          manufacturer_ref: selectedManufacturerRef,
          manufacturer_name: selectedManufacturer?.name ?? null,
          manufacturer_status: selectedManufacturer?.status ?? 'verified',
          switchgear_family_ref: selectedFamilyRef,
          switchgear_family_name: selectedFamily?.family_name ?? null,
        },
      };
      const transformerPayload = {
        create: true,
        transformer_catalog_ref: selectedTransformerType.id,
        catalog_ref: selectedTransformerType.id,
        catalog_binding: transformerBinding ?? undefined,
        model_type: 'DWU_UZWOJENIOWY',
        tap_changer_present: data.tap_position !== 0,
        sn_mva: selectedTransformerType.rated_power_mva,
        uk_percent: selectedTransformerType.uk_percent,
        pk_kw: selectedTransformerType.pk_kw,
      };
      const commonPayload = {
        name: data.name,
        station_type: stationKind,
        station: stationPayload,
        sn_fields: stationSnFields,
        transformer: transformerPayload,
        nn_block: {
          create_nn_bus: true,
          main_breaker_nn: true,
          nn_configuration: nnConfiguration,
          source_converter_catalog_ref: selectedConverter?.id,
          source_converter_name: selectedConverter?.name,
          source_converter_kind: selectedConverter?.kind,
          source_converter_un_kv: selectedConverter?.un_kv,
          source_converter_sn_mva: selectedConverter?.sn_mva,
          source_converter_pmax_mw: selectedConverter?.pmax_mw,
          source_protection: sourceProtectionIntent(nnConfiguration),
          outgoing_feeders_nn_count: outgoingFeeders.length,
          outgoing_feeders_nn: outgoingFeeders,
        },
        options: {
          create_transformer_field: true,
          create_default_fields: true,
          create_nn_bus: true,
        },
      };
      const payload = isEndpointAppend
        ? {
            ...commonPayload,
            endpoint_bus_ref: endpointBusRef,
            run_ref: runRef || undefined,
          }
        : {
            ...commonPayload,
            segment_id: segmentId || undefined,
            insert_at: {
              mode: 'RATIO',
              value: positionOnSegment,
            },
          };
      const operationName = isEndpointAppend
        ? 'append_station_on_endpoint'
        : 'insert_station_on_segment_sn';
      if (!isEndpointAppend) {
        const validationError = validateCatalogFirst('insert_station_on_segment_sn', payload);
        if (validationError) {
          setCatalogError(validationError);
          return;
        }
      }
      setCatalogError(null);
      const previousSnapshot = snapshot;
      const response = await executeDomainOperation(activeCaseId, operationName, payload);
      if (!response) {
        const operationError = useSnapshotStore.getState().error;
        setCatalogError(operationError ?? 'Nie udało się wstawić stacji SN/nN na odcinku.');
        return;
      }
      if (response.error) {
        setCatalogError(response.error);
        return;
      }
      const createdSelection = stationSelectionFromMaterialization(
        response,
        stationNameFromData(data) ?? 'Stacja SN/nN',
        previousSnapshot,
      );
      if (!createdSelection) {
        setCatalogError(
          'Operacja nie potwierdziła utworzenia stacji SN/nN. Wybierz odcinek na schemacie i ponów zakończenie stacją.',
        );
        return;
      }
      selectElement(createdSelection);
      centerSldOnElement(createdSelection.id);
      closeForm();
      openRouteSurface('E-13', {
        entityRef: createdSelection.id,
        entityType: 'station',
        subjectKind: 'entity',
        subjectRef: createdSelection.id,
        tabId: 'rozdzielnica-sn',
        titlePl: createdSelection.name,
        route: 'sld',
        openMode: 'replace_right_panel',
        supportsMiniSld: true,
        payload: {
          source: 'operation_result',
          selectedName: createdSelection.name,
          selectedType: createdSelection.type,
        },
      });
    },
    [
      activeCaseId,
      centerSldOnElement,
      closeForm,
      compatibleTransformerTypes.length,
      configurationBlocker,
      endpointBusRef,
      executeDomainOperation,
      isEndpointAppend,
      nnConfiguration,
      outgoingFeederCount,
      openRouteSurface,
      positionOnSegment,
      snapshot,
      requiredNnVoltageIsValid,
      requiredNnVoltageKv,
      runRef,
      segmentId,
      selectElement,
      selectedConverter?.id,
      selectedConverter?.kind,
      selectedConverter?.name,
      selectedConverter?.pmax_mw,
      selectedConverter?.sn_mva,
      selectedConverter?.un_kv,
      selectedFamily?.family_name,
      selectedFamilyRef,
      selectedManufacturer?.name,
      selectedManufacturer?.status,
      selectedManufacturerRef,
      stationBusOptions,
      stationKind,
      stationSnFields,
      stationSnVoltageKv,
      transformerTypes,
    ],
  );
  const handleSubmitRecommendedStation = useCallback(() => {
    const catalogRef = editorInitialData.catalog_ref || recommendedTransformer?.id || '';
    void handleSubmit({
      ref_id: editorInitialData.ref_id || defaultStationRefId,
      name: editorInitialData.name || defaultStationName,
      hv_bus_ref: editorInitialData.hv_bus_ref || STATION_SN_SIDE_REF,
      lv_bus_ref: editorInitialData.lv_bus_ref || STATION_NN_SIDE_REF,
      tap_position: editorInitialData.tap_position ?? 0,
      catalog_ref: catalogRef,
      parameter_source: 'CATALOG',
      overrides: [],
    });
  }, [
    defaultStationName,
    defaultStationRefId,
    editorInitialData.catalog_ref,
    editorInitialData.hv_bus_ref,
    editorInitialData.lv_bus_ref,
    editorInitialData.name,
    editorInitialData.ref_id,
    editorInitialData.tap_position,
    handleSubmit,
    recommendedTransformer?.id,
  ]);

  return (
    <div className="h-full overflow-y-auto bg-[#07111c] text-[#d7ecff]" data-testid="insert-station-form">
      <div className="border-b border-[#17314c] bg-[#081522] px-4 py-3">
        <h3 className="font-mono-eng text-sm font-semibold text-white">Wstawienie stacji SN/nN</h3>
        <p className="mt-1 text-[11px] text-[#8eb1cf]">
          Osadzenie {stationTypeLabelPl.toLowerCase()} na wskazanym odcinku magistrali. Najpierw
          określ stronę nN, potem dobierz transformator z katalogu.
        </p>
      </div>

      <div className="sticky top-0 z-20 border-b border-[#214263] bg-[#07111c]/95 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono-eng text-[10px] font-semibold uppercase tracking-[0.18em] text-[#26f0b1]">
              Gotowe rozwiązanie katalogowe
            </div>
            <p className="mt-1 text-xs leading-5 text-[#a8c7e2]">
              Zapisuje kompletną stację z rozdzielnią SN, transformatorem, stroną nN i polami
              wynikającymi z wybranego wariantu katalogowego.
            </p>
          </div>
          <button
            type="button"
            data-testid="insert-station-save-recommended"
            onClick={handleSubmitRecommendedStation}
            disabled={recommendedStationSaveDisabled}
            className="border border-[#1e6bff] bg-[#2864e8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3474ff] disabled:cursor-not-allowed disabled:border-[#22364e] disabled:bg-[#0b1623] disabled:text-[#607d99]"
          >
            Zapisz gotową stację z katalogu
          </button>
        </div>
        {recommendedStationSaveDisabled && (
          <p className="mt-2 text-xs text-[#ffc46b]">
            {configurationBlocker ?? 'Ładowanie katalogu transformatorów i rozdzielnic SN.'}
          </p>
        )}
      </div>

      <div className="space-y-4 p-4">
        <section className="border border-[#24405d] bg-[#081522] p-3 shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]">
          <div className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.18em] text-[#19e6ff]">
            Kontekst osadzenia
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <div className="border border-[#28425f] bg-[#07111c] px-3 py-2">
              <div className="font-mono-eng text-[10px] uppercase tracking-[0.12em] text-[#8eb1cf]">
                Odcinek magistrali
              </div>
              <div className="mt-1 text-xs font-semibold text-white">{segmentLabel}</div>
            </div>
            <div className="border border-[#28425f] bg-[#07111c] px-3 py-2">
              <div className="font-mono-eng text-[10px] uppercase tracking-[0.12em] text-[#8eb1cf]">
                Osadzenie
              </div>
              <div className="mt-1 text-xs font-semibold text-white">
                {placementLabel}
              </div>
            </div>
            <div className="border border-[#28425f] bg-[#07111c] px-3 py-2">
              <div className="font-mono-eng text-[10px] uppercase tracking-[0.12em] text-[#8eb1cf]">
                Typ stacji
              </div>
              <div className="mt-1 text-xs font-semibold text-white">{stationTypeLabelPl}</div>
            </div>
          </div>
        </section>

        <section className="border border-[#24405d] bg-[#081522] p-3 shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.18em] text-[#19e6ff]">
                Typ i schemat stacji
              </div>
              <p className="mt-1 text-xs leading-5 text-[#a8c7e2]">
                Wybierz funkcję stacji w sieci. Od tego zależą pola SN, dostępne zaciski i dalsze
                kroki modelowania.
              </p>
            </div>
            <div className="border border-[#1d4ed8] bg-[#071b34] px-3 py-2 text-xs text-[#bfdbfe]">
              SN {formatKv(stationSnVoltageKv)} kV / nN{' '}
              {requiredNnVoltageIsValid ? formatKv(requiredNnVoltageKv) : '-'} kV
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {STATION_KIND_OPTIONS.map((option) => {
              const active = stationKind === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStationKind(option.value)}
                  className={`border px-3 py-2 text-left transition ${
                    active
                      ? 'border-[#04d6ff] bg-[#063047] text-white'
                      : 'border-[#28425f] bg-[#07111c] text-[#a8c7e2] hover:border-[#3a668f]'
                  }`}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-[#8eb1cf]">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 border border-[#24405d] bg-[#06111d] p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono-eng text-[10px] font-semibold uppercase tracking-[0.18em] text-[#19e6ff]">
                  Katalog rozdzielnicy SN
                </div>
                <p className="mt-1 text-xs leading-5 text-[#a8c7e2]">
                  Producent, rodzina i szablony pól są wspólne dla podglądu SLD, portów,
                  warunków eksploatacyjnych oraz danych przekazywanych do modelu.
                </p>
              </div>
              <div className="border border-[#6f4d12] bg-[#1d1704] px-3 py-1 text-xs font-semibold text-[#ffe08a]">
                {switchgearStatusLabel(selectedManufacturer)}
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-4">
              {manufacturers.map((manufacturer) => {
                const active = manufacturer.manufacturer_ref === selectedManufacturerRef;
                return (
                  <button
                    key={manufacturer.manufacturer_ref}
                    type="button"
                    onClick={() => setSelectedManufacturerRef(manufacturer.manufacturer_ref)}
                    className={`border px-3 py-2 text-left transition ${
                      active
                        ? 'border-[#04d6ff] bg-[#063047] text-white'
                        : 'border-[#28425f] bg-[#07111c] text-[#a8c7e2] hover:border-[#3a668f]'
                    }`}
                  >
                    <span className="block text-xs font-semibold">{manufacturer.name}</span>
                    <span className="mt-1 block text-[10px] text-[#8eb1cf]">
                      {switchgearStatusLabel(manufacturer)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <label className="block" htmlFor="insert-station-switchgear-family">
                <span className="font-mono-eng text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
                  Rodzina / typ rozdzielnicy
                </span>
                <select
                  id="insert-station-switchgear-family"
                  value={selectedFamilyRef ?? ''}
                  onChange={(event) => setSelectedFamilyRef(event.target.value || null)}
                  disabled={familiesForManufacturer.length === 0}
                  className="mt-1 w-full border border-[#28425f] bg-[#07111c] px-3 py-2 text-sm text-[#e6f4ff] outline-none focus:border-[#04d6ff] disabled:opacity-60"
                >
                  <option value="">
                    {familiesForManufacturer.length === 0
                      ? switchgearFamilyLabel
                      : 'wybierz rodzinę rozdzielnicy'}
                  </option>
                  {familiesForManufacturer.map((family) => (
                    <option
                      key={family.switchgear_family_ref}
                      value={family.switchgear_family_ref}
                    >
                      {family.family_name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] leading-5 text-[#8eb1cf]">
                  {familiesForManufacturer.length === 0 && templatesForSwitchgear.length > 0
                    ? 'Wybrany producent udostępnia kompletny pakiet standardowy z aparatami, portami i szablonami pól SN.'
                    : 'Lista zawiera wyłącznie kompletne pakiety rozdzielnicy z aparatami, portami i szablonami pól SN.'}
                </p>
              </label>

              <div className="border border-[#28425f] bg-[#07111c] px-3 py-2">
                <div className="font-mono-eng text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
                  Szablony pól SN
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {stationSnFields.map((field) => (
                    <div
                      key={`${field.field_role}-${field.bay_kind}`}
                      className="border border-[#1d3550] bg-[#06111d] px-2 py-2 text-[11px]"
                    >
                      <div className="font-semibold text-white">
                        {FIELD_ROLE_LABELS[field.field_role] ?? field.field_role}
                      </div>
                      <select
                        aria-label={`Szablon pola ${FIELD_ROLE_LABELS[field.field_role] ?? field.field_role}`}
                        value={field.bay_template_ref ?? ''}
                        onChange={(event) => {
                          const nextRef = event.target.value;
                          setSelectedBayTemplateRefs((previous) => ({
                            ...previous,
                            [field.field_role]: nextRef || undefined,
                          }));
                        }}
                        disabled={templateOptionsForRole(templatesForSwitchgear, field.field_role).length === 0}
                        className="mt-1 w-full border border-[#28425f] bg-[#07111c] px-2 py-1 text-[11px] text-[#e6f4ff] outline-none focus:border-[#04d6ff] disabled:opacity-60"
                      >
                        <option value="">
                          wybierz szablon pola
                        </option>
                        {templateOptionsForRole(templatesForSwitchgear, field.field_role).map((template) => (
                          <option key={template.template_ref} value={template.template_ref}>
                            {templateOptionLabel(template, field.field_role)}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1 text-[#ffd166]">
                        {SOURCE_STATUS_LABEL_PL[field.source_status]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {switchgearCatalogError && (
              <div className="mt-3 border border-[#7f1d1d] bg-[#2a1014] px-3 py-2 text-xs text-[#ffb4b4]">
                {switchgearCatalogError}
              </div>
            )}
          </div>

          <StationSystemPreview
            stationTypeLabel={stationTypeLabelPl}
            stationKind={stationKind}
            snVoltageKv={stationSnVoltageKv}
            nnVoltageKv={requiredNnVoltageKv}
            requiredNnVoltageIsValid={requiredNnVoltageIsValid}
            snFields={stationSnFields}
            selectedManufacturer={selectedManufacturer}
            selectedFamily={selectedFamily}
            switchgearFamilyLabel={switchgearFamilyLabel}
            outgoingFeederCount={outgoingFeederCount}
            nnConfigurationLabel={selectedConfiguration.label}
            recommendedTransformer={recommendedTransformer}
            selectedConverter={selectedConverter}
          />
        </section>

        <section className="border border-[#24405d] bg-[#081522] p-3 shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.18em] text-[#19e6ff]">
                Konfiguracja strony nN
              </div>
              <p className="mt-1 text-xs text-[#a8c7e2]">
                Napięcie strony nN wynika z tej decyzji. Dla źródeł falownikowych pochodzi z
                katalogu falownika.
              </p>
            </div>
            <div className="border border-[#14532d] bg-[#061f18] px-3 py-1 text-xs font-semibold text-[#9ff6c5]">
              Zakres układu: {configurationScopeLabel}
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {NN_CONFIGURATION_OPTIONS.map((option) => {
              const active = nnConfiguration === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setNnConfiguration(option.value)}
                  className={`border px-3 py-2 text-left transition ${
                    active
                      ? 'border-[#04d6ff] bg-[#063047] text-white'
                      : 'border-[#28425f] bg-[#07111c] text-[#a8c7e2] hover:border-[#3a668f]'
                  }`}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs text-[#8eb1cf]">{option.description}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {nnConfiguration === 'LOAD_NN' && (
              <label className="block" htmlFor="insert-station-receiver-voltage">
                <span className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
                  Domyślne napięcie rozdzielni nN
                </span>
                <select
                  id="insert-station-receiver-voltage"
                  value={receiverNnVoltageKv}
                  onChange={(event) => setReceiverNnVoltageKv(Number(event.target.value))}
                  className="mt-1 w-full border border-[#28425f] bg-[#07111c] px-3 py-2 text-sm text-[#e6f4ff] outline-none focus:border-[#04d6ff]"
                >
                  {NN_VOLTAGE_OPTIONS_KV.map((voltage) => (
                    <option key={voltage} value={voltage}>
                      {formatKv(voltage)} kV
                    </option>
                  ))}
                </select>
              </label>
            )}

            {nnConfiguration === 'CUSTOM_NN' && (
              <label className="block" htmlFor="insert-station-custom-voltage">
                <span className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
                  Własne napięcie strony nN
                </span>
                <select
                  id="insert-station-custom-voltage"
                  value={customNnVoltageKv}
                  onChange={(event) => setCustomNnVoltageKv(Number(event.target.value))}
                  className="mt-1 w-full border border-[#28425f] bg-[#07111c] px-3 py-2 text-sm text-[#e6f4ff] outline-none focus:border-[#04d6ff]"
                >
                  {NN_VOLTAGE_OPTIONS_KV.map((voltage) => (
                    <option key={voltage} value={voltage}>
                      {formatKv(voltage)} kV
                    </option>
                  ))}
                </select>
              </label>
            )}

            {selectedConfiguration.converterKind && (
              <div className="md:col-span-2">
                <CatalogPicker
                  label="Falownik z katalogu"
                  entries={converterCatalogEntries}
                  selectedId={selectedConverterId}
                  onChange={setSelectedConverterId}
                  required
                  error={
                    selectedConfiguration.converterKind && !selectedConverter
                      ? 'Wybór falownika jest wymagany'
                      : undefined
                  }
                />
              </div>
            )}

            <div className="border border-[#28425f] bg-[#07111c] px-3 py-2">
              <div className="font-mono-eng text-[10px] uppercase tracking-[0.12em] text-[#8eb1cf]">
                Wymagane napięcie strony nN
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {requiredNnVoltageIsValid ? `${formatKv(requiredNnVoltageKv)} kV` : 'oczekuje na wybór'}
              </div>
            </div>

            <div className="border border-[#28425f] bg-[#07111c] px-3 py-2">
              <div className="font-mono-eng text-[10px] uppercase tracking-[0.12em] text-[#8eb1cf]">
                Filtr transformatorów
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                SN {formatKv(stationSnVoltageKv)} kV / nN{' '}
                {requiredNnVoltageIsValid ? formatKv(requiredNnVoltageKv) : '-'} kV
              </div>
              <div className="mt-1 text-xs text-[#8eb1cf]">
                {catalogsLoading
                  ? 'Ładowanie katalogu transformatorów...'
                  : `Dostępne zgodne pozycje: ${transformerCatalogEntries.length}`}
              </div>
            </div>
          </div>
        </section>

        <section className="border border-[#24405d] bg-[#081522] p-3 shadow-[inset_0_1px_0_rgba(148,163,184,0.05)]">
          <div className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.18em] text-[#19e6ff]">
            Pola i wyposażenie stacji
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block" htmlFor="insert-station-outgoing-feeders">
              <span className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
                Liczba odpływów nN odbiorczych
              </span>
              <input
                id="insert-station-outgoing-feeders"
                type="number"
                min={1}
                max={8}
                value={outgoingFeederCount}
                onChange={(event) => setOutgoingFeederCount(clampOutgoingFeederCount(Number(event.target.value)))}
                className="mt-1 w-full border border-[#28425f] bg-[#07111c] px-3 py-2 text-sm text-[#e6f4ff] outline-none focus:border-[#04d6ff]"
              />
            </label>

            <div className="border border-[#28425f] bg-[#07111c] px-3 py-2">
              <div className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
                Domyślne pola SN
              </div>
              <ul className="mt-2 space-y-1 text-xs text-[#a8c7e2]">
                {snFieldPreview.map((label) => (
                  <li key={label}>- {label}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {(catalogError || configurationBlocker) && (
          <p className="border border-[#7f1d1d] bg-[#2a1014] px-4 py-2 text-xs text-[#ff9a9a]">
            {catalogError ?? configurationBlocker}
          </p>
        )}

        <TransformerStationEditor
          key={editorContextKey}
          isOpen={true}
          mode="create"
          embedded={true}
          hideHeader={true}
          busSelectionMode="station-sides"
          stationSideLabels={{
            high: `Strona SN z odcinka magistrali (${formatKv(stationSnVoltageKv)} kV)`,
            low: requiredNnVoltageIsValid
              ? `Strona nN za transformatorem (${formatKv(requiredNnVoltageKv)} kV)`
              : 'Strona nN za transformatorem, napięcie po wyborze konfiguracji',
          }}
          initialData={editorInitialData}
          busOptions={stationBusOptions}
          catalogEntries={transformerCatalogEntries}
          submitLabel={isEndpointAppend ? 'Zakończ odcinek stacją' : 'Podziel odcinek i wstaw stację'}
          onSubmit={handleSubmit}
          onCancel={closeForm}
        />
      </div>
    </div>
  );
}
