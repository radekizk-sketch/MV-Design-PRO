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
import { useSnapshotStore, selectBusOptions } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import { validateCatalogFirst } from './catalogFirstRules';
import { catalogRefFromInput, normalizeCatalogBinding } from './catalogPayload';
import { fetchConverterTypes, fetchTransformerTypes, getCatalogErrorMessage } from '../../catalog/api';
import type { ConverterType, TransformerType } from '../../catalog/types';
import { CatalogPicker, type CatalogEntry } from '../../topology/modals/CatalogPicker';
import {
  formatStationTypeLabelPl,
  normalizeTopologicalStationKind,
  type TopologicalStationKind,
} from '../../shared/stationTypeLabels';

type NnConfiguration =
  | 'LOAD_NN'
  | 'PV_INVERTER'
  | 'BESS_INVERTER'
  | 'FW_INVERTER'
  | 'CUSTOM_NN';

type NnFeederRole = 'ODPLYW_NN' | 'ZRODLO_NN_PV' | 'ZRODLO_NN_BESS' | 'ZRODLO_NN_FW';

interface NnConfigurationOption {
  value: NnConfiguration;
  label: string;
  description: string;
  converterKind?: ConverterType['kind'];
}

function buildDefaultSnFields(stationKind: TopologicalStationKind) {
  const createField = (
    fieldRole: 'LINIA_IN' | 'LINIA_OUT' | 'LINIA_ODG' | 'TRANSFORMATOROWE' | 'SPRZEGLO',
  ) => ({
    field_role: fieldRole,
    catalog_bindings: null,
  });

  switch (stationKind) {
    case 'terminal':
      return [createField('LINIA_IN'), createField('TRANSFORMATOROWE')];
    case 'branch':
      return [
        createField('LINIA_IN'),
        createField('LINIA_OUT'),
        createField('LINIA_ODG'),
        createField('TRANSFORMATOROWE'),
      ];
    case 'sectional':
      return [
        createField('LINIA_IN'),
        createField('LINIA_OUT'),
        createField('SPRZEGLO'),
        createField('TRANSFORMATOROWE'),
      ];
    case 'inline':
    default:
      return [
        createField('LINIA_IN'),
        createField('LINIA_OUT'),
        createField('TRANSFORMATOROWE'),
      ];
  }
}

const FIELD_ROLE_LABELS: Record<string, string> = {
  LINIA_IN: 'Pole liniowe wejściowe',
  LINIA_OUT: 'Pole liniowe wyjściowe',
  LINIA_ODG: 'Pole odgałęźne',
  TRANSFORMATOROWE: 'Pole transformatorowe',
  SPRZEGLO: 'Pole sprzęgłowe',
};

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
const DEFAULT_RECEIVER_NN_VOLTAGE_KV = 0.4;
const DEFAULT_CUSTOM_NN_VOLTAGE_KV = 0.69;
const SN_VOLTAGE_TOLERANCE_KV = 0.01;
const NN_VOLTAGE_TOLERANCE_KV = 0.001;
const NO_COMPATIBLE_TRANSFORMER_MESSAGE =
  'Brak transformatora katalogowego zgodnego z napięciem SN i napięciem strony nN źródła.';

function clampOutgoingFeederCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(8, Math.trunc(value)));
}

function estimateReadiness(stationKind: TopologicalStationKind, nnConfiguration: NnConfiguration): number {
  const base: Record<TopologicalStationKind, number> = {
    terminal: 78,
    inline: 82,
    branch: 80,
    sectional: 76,
  };
  const sourceBonus = nnConfiguration === 'LOAD_NN' || nnConfiguration === 'CUSTOM_NN' ? 0 : 5;
  return Math.min(92, base[stationKind] + sourceBonus);
}

function voltageMatches(
  left: number | null | undefined,
  right: number | null | undefined,
  toleranceKv: number,
): boolean {
  return (
    typeof left === 'number'
    && Number.isFinite(left)
    && typeof right === 'number'
    && Number.isFinite(right)
    && Math.abs(left - right) <= toleranceKv
  );
}

function formatKv(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
}

function formatMva(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return value.toLocaleString('pl-PL', { maximumFractionDigits: 3 });
}

function catalogItemIdFromRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed.includes('/')) return trimmed;
  const parts = trimmed.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : trimmed;
}

function findTransformerByCatalogRef(types: TransformerType[], catalogRef: string): TransformerType | null {
  const itemId = catalogItemIdFromRef(catalogRef);
  return types.find((type) => type.id === itemId || type.id === catalogRef) ?? null;
}

function sourceFeederRole(configuration: NnConfiguration): NnFeederRole | null {
  switch (configuration) {
    case 'PV_INVERTER':
      return 'ZRODLO_NN_PV';
    case 'BESS_INVERTER':
      return 'ZRODLO_NN_BESS';
    case 'FW_INVERTER':
      return 'ZRODLO_NN_FW';
    case 'LOAD_NN':
    case 'CUSTOM_NN':
    default:
      return null;
  }
}

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

function contextString(
  context: Record<string, unknown> | undefined,
  keys: string[],
): string {
  for (const key of keys) {
    const value = context?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function resolveSegmentIdFromContext(
  context: Record<string, unknown> | undefined,
  snapshot: unknown,
): string {
  const directSegmentId = contextString(context, ['segment_id', 'segment_ref']);
  if (directSegmentId) return directSegmentId;

  const corridorRef = contextString(context, ['corridor_ref', 'trunk_id']);
  if (!corridorRef) return '';

  const model = snapshot as {
    corridors?: Array<{
      ref_id?: string;
      id?: string;
      ordered_segment_refs?: string[];
    }>;
  } | null;
  const corridor = model?.corridors?.find(
    (candidate) => candidate.ref_id === corridorRef || candidate.id === corridorRef,
  );
  return corridor?.ordered_segment_refs?.[0]?.trim() ?? '';
}

function engineeringSegmentLabel(segmentId: string): string {
  const match = segmentId.match(/(?:seg|segment|odcinek)[_/-]?(\d+)/i);
  if (match?.[1]) {
    return `Magistrala SN / odcinek ${Number(match[1])}`;
  }
  return 'Magistrala SN / odcinek 1';
}

function stationNameFromData(data: TransformerStationFormData): string | undefined {
  const name = data.name.trim();
  const refId = data.ref_id.trim();
  return name || refId || undefined;
}

export function InsertStationForm() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
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
  const segmentLabel = useMemo(() => engineeringSegmentLabel(segmentId), [segmentId]);
  const positionOnSegment = (context?.position_on_segment as number) ?? 0.5;
  const stationKind = useMemo(
    () =>
      normalizeTopologicalStationKind(
        (context?.station as Record<string, unknown> | undefined)?.station_type
          ?? context?.station_type,
      ),
    [context],
  );
  const stationTypeLabelPl = useMemo(
    () => formatStationTypeLabelPl(stationKind),
    [stationKind],
  );
  const snFieldPreview = useMemo(
    () =>
      buildDefaultSnFields(stationKind).map(
        (field) => FIELD_ROLE_LABELS[field.field_role] ?? field.field_role,
      ),
    [stationKind],
  );
  const stationSnVoltageKv = useMemo(
    () => deriveSnVoltageKv(snapshot, busOptions, segmentId),
    [busOptions, segmentId, snapshot],
  );
  const selectedConfiguration = useMemo(
    () =>
      NN_CONFIGURATION_OPTIONS.find((option) => option.value === nnConfiguration)
      ?? NN_CONFIGURATION_OPTIONS[0],
    [nnConfiguration],
  );
  const filteredConverters = useMemo(
    () =>
      selectedConfiguration.converterKind
        ? converterTypes.filter((type) => type.kind === selectedConfiguration.converterKind)
        : [],
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
    return transformerTypes.filter(
      (type) =>
        voltageMatches(type.voltage_hv_kv, stationSnVoltageKv, SN_VOLTAGE_TOLERANCE_KV)
        && voltageMatches(type.voltage_lv_kv, requiredNnVoltageKv, NN_VOLTAGE_TOLERANCE_KV),
    );
  }, [requiredNnVoltageIsValid, requiredNnVoltageKv, stationSnVoltageKv, transformerTypes]);
  const transformerCatalogEntries = useMemo(
    () => toTransformerCatalogEntries(compatibleTransformerTypes, sourcePowerMva),
    [compatibleTransformerTypes, sourcePowerMva],
  );
  const converterCatalogEntries = useMemo(
    () => toConverterCatalogEntries(filteredConverters),
    [filteredConverters],
  );
  const readinessEstimate = useMemo(
    () => estimateReadiness(stationKind, nnConfiguration),
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
    if (!filteredConverters.some((type) => type.id === selectedConverterId)) {
      setSelectedConverterId('');
    }
  }, [filteredConverters, selectedConverterId]);

  const configurationBlocker = useMemo(() => {
    if (selectedConfiguration.converterKind && filteredConverters.length === 0) {
      return `Brak pozycji katalogowych falowników dla konfiguracji: ${selectedConfiguration.label}.`;
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
    return null;
  }, [
    compatibleTransformerTypes.length,
    filteredConverters.length,
    requiredNnVoltageIsValid,
    selectedConfiguration.converterKind,
    selectedConfiguration.label,
    selectedConverter,
    transformerTypes.length,
  ]);

  const handleSubmit = useCallback(
    async (data: TransformerStationFormData) => {
      if (!activeCaseId) {
        setCatalogError('Brak aktywnego przypadku obliczeniowego.');
        return;
      }
      if (configurationBlocker) {
        setCatalogError(configurationBlocker);
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
      const outgoingFeeders: Array<{ feeder_role: NnFeederRole; catalog_bindings: null }> =
        Array.from({ length: normalizedOutgoingFeederCount }, () => ({
          feeder_role: 'ODPLYW_NN',
          catalog_bindings: null,
        }));
      const feederRole = sourceFeederRole(nnConfiguration);
      if (feederRole) {
        outgoingFeeders.push({ feeder_role: feederRole, catalog_bindings: null });
      }

      const payload = {
        segment_id: segmentId || undefined,
        name: data.name,
        station_type: stationKind,
        insert_at: {
          mode: 'RATIO',
          value: positionOnSegment,
        },
        station: {
          station_type: stationKind,
          station_role: 'STACJA_SN_NN',
          station_name: stationNameFromData(data),
          sn_voltage_kv: hvBusVoltage,
          nn_voltage_kv: stationNnVoltageKv,
        },
        sn_fields: buildDefaultSnFields(stationKind),
        transformer: {
          create: true,
          catalog_binding: transformerBinding ?? undefined,
          model_type: 'DWU_UZWOJENIOWY',
          tap_changer_present: data.tap_position !== 0,
        },
        nn_block: {
          create_nn_bus: true,
          main_breaker_nn: true,
          nn_configuration: nnConfiguration,
          source_converter_catalog_ref: selectedConverter?.id,
          source_converter_un_kv: selectedConverter?.un_kv,
          outgoing_feeders_nn_count: outgoingFeeders.length,
          outgoing_feeders_nn: outgoingFeeders,
        },
        options: {
          create_transformer_field: true,
          create_default_fields: true,
          create_nn_bus: true,
        },
      };
      const validationError = validateCatalogFirst('insert_station_on_segment_sn', payload);
      if (validationError) {
        setCatalogError(validationError);
        return;
      }
      setCatalogError(null);
      const response = await executeDomainOperation(activeCaseId, 'insert_station_on_segment_sn', payload);
      if (!response) {
        const operationError = useSnapshotStore.getState().error;
        setCatalogError(operationError ?? 'Nie udało się wstawić stacji SN/nN na odcinku.');
        return;
      }
      if (response.error) {
        setCatalogError(response.error);
        return;
      }
      closeForm();
    },
    [
      activeCaseId,
      closeForm,
      compatibleTransformerTypes.length,
      configurationBlocker,
      executeDomainOperation,
      nnConfiguration,
      outgoingFeederCount,
      positionOnSegment,
      requiredNnVoltageIsValid,
      requiredNnVoltageKv,
      segmentId,
      selectedConverter?.id,
      selectedConverter?.un_kv,
      stationBusOptions,
      stationKind,
      stationSnVoltageKv,
      transformerTypes,
    ],
  );

  return (
    <div className="h-full overflow-y-auto bg-[#07111c] text-[#d7ecff]" data-testid="insert-station-form">
      <div className="border-b border-[#17314c] bg-[#081522] px-4 py-3">
        <h3 className="font-mono-eng text-sm font-semibold text-white">Wstawienie stacji SN/nN</h3>
        <p className="mt-1 text-[11px] text-[#8eb1cf]">
          Osadzenie {stationTypeLabelPl.toLowerCase()} na wskazanym odcinku magistrali. Najpierw
          określ stronę nN, potem dobierz transformator z katalogu.
        </p>
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
                Pozycja na odcinku
              </div>
              <div className="mt-1 text-xs font-semibold text-white">
                {positionOnSegment.toFixed(2)}
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
              Gotowość formularza: ~{readinessEstimate}%
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
          initialData={initialData}
          busOptions={stationBusOptions}
          catalogEntries={transformerCatalogEntries}
          onSubmit={handleSubmit}
          onCancel={closeForm}
        />
      </div>
    </div>
  );
}
