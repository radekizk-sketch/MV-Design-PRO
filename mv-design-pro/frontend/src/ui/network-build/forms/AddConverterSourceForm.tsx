import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { CANONICAL_CATALOG_VERSION } from '../../catalog/catalogBinding';
import { fetchConverterTypes, fetchLvApparatusTypes } from '../../catalog/api';
import type { ConverterType, LVApparatusType } from '../../catalog/types';
import { CatalogPicker, type CatalogEntry } from '../../topology/modals/CatalogPicker';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationForm, useNetworkBuildStore } from '../networkBuildStore';
import { catalogRefFromInput, normalizeCatalogBinding } from './catalogPayload';
import {
  listNnBusOptions,
  listNnSourceFieldOptions,
  resolveBusNnRef,
  resolveStationRef,
  stationLabel,
} from './enmResolvers';

type SourceTechnology = 'PV' | 'BESS' | 'FW';
type ConnectionVariant = 'nn_side' | 'block_transformer';
type FieldPlacement = 'EXISTING_FIELD' | 'NEW_FIELD';

interface ConverterSourceContext extends Record<string, unknown> {
  source_technology?: SourceTechnology;
  connection_variant?: ConnectionVariant;
}

interface TechnologyConfig {
  label: string;
  shortLabel: string;
  fieldKind: 'PV' | 'BESS' | 'FW';
  catalogKind: 'PV' | 'BESS' | 'WIND';
  defaultName: string;
}

const TECHNOLOGY: Record<SourceTechnology, TechnologyConfig> = {
  PV: { label: 'Fotowoltaika', shortLabel: 'PV', fieldKind: 'PV', catalogKind: 'PV', defaultName: 'Blok PV' },
  BESS: { label: 'Magazyn energii', shortLabel: 'BESS', fieldKind: 'BESS', catalogKind: 'BESS', defaultName: 'Blok BESS' },
  FW: { label: 'Elektrownia wiatrowa', shortLabel: 'FW', fieldKind: 'FW', catalogKind: 'WIND', defaultName: 'Blok FW' },
};

function normalizeTechnology(value: unknown): SourceTechnology | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'PV' || normalized === 'BESS' || normalized === 'FW') return normalized;
  if (normalized === 'WIND' || normalized === 'WIND_INVERTER') return 'FW';
  return null;
}

function normalizeVariant(value: unknown): ConnectionVariant | null {
  return value === 'block_transformer' || value === 'nn_side' ? value : null;
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPower(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value.toFixed(3)} MW`;
}

function toCatalogEntries(types: ConverterType[] | LVApparatusType[]): CatalogEntry[] {
  return types.map((item) => ({
    id: item.id,
    name: item.name,
    manufacturer: item.manufacturer,
    summary: 'sn_mva' in item ? `S ${item.sn_mva.toFixed(3)} MVA, Pmax ${item.pmax_mw.toFixed(3)} MW` : `Un ${item.u_n_kv} kV, In ${item.i_n_a} A`,
  }));
}

export function AddConverterSourceForm() {
  const activeForm = useActiveOperationForm() as
    | {
        op: 'add_converter_source';
        context?: ConverterSourceContext;
      }
    | null;
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const context = activeForm?.context;

  const requestedTechnology = useMemo(
    () => normalizeTechnology(context?.source_technology),
    [context?.source_technology],
  );
  const requestedVariant = useMemo(
    () => normalizeVariant(context?.connection_variant),
    [context?.connection_variant],
  );

  const initialTechnology = requestedTechnology ?? 'PV';
  const initialVariant = requestedVariant ?? 'nn_side';
  const stationRef = useMemo(
    () => resolveStationRef(context, snapshot),
    [context, snapshot],
  );
  const busOptions = useMemo(() => listNnBusOptions(snapshot, stationRef), [snapshot, stationRef]);
  const resolvedBusRef = useMemo(
    () => resolveBusNnRef(context, snapshot),
    [context, snapshot],
  );
  const initialCatalogRef = useMemo(
    () =>
      catalogRefFromInput(context?.catalog_binding) ??
      catalogRefFromInput(context?.catalog_ref) ??
      '',
    [context],
  );
  const busDefaultRef = useMemo(
    () => resolvedBusRef ?? (busOptions.length === 1 ? (busOptions[0]?.ref_id ?? '') : ''),
    [busOptions, resolvedBusRef],
  );

  const contextIssues = useMemo(() => {
    const issues: string[] = [];
    if (context?.source_technology !== undefined && requestedTechnology === null) {
      issues.push('Nie rozpoznano typu źródła w kontekście operacji.');
    }
    if (context?.connection_variant !== undefined && requestedVariant === null) {
      issues.push('Nie rozpoznano wariantu przyłączenia w kontekście operacji.');
    }
    if (initialVariant === 'nn_side' && !busDefaultRef && busOptions.length !== 1) {
      issues.push('Wybierz jednoznaczną szynę nN dla źródła przekształtnikowego.');
    }
    return issues;
  }, [
    busDefaultRef,
    busOptions.length,
    context?.connection_variant,
    context?.source_technology,
    initialVariant,
    requestedTechnology,
    requestedVariant,
  ]);

  const [sourceTechnology, setSourceTechnology] = useState<SourceTechnology>(initialTechnology);
  const [connectionVariant, setConnectionVariant] = useState<ConnectionVariant>(initialVariant);
  const [placement, setPlacement] = useState<FieldPlacement>('NEW_FIELD');
  const [busNnRef, setBusNnRef] = useState(busDefaultRef);
  const [existingFieldRef, setExistingFieldRef] = useState('');
  const [newFieldName, setNewFieldName] = useState('Pole źródłowe nN');
  const [apparatusCatalogId, setApparatusCatalogId] = useState('');
  const [converterCatalogId, setConverterCatalogId] = useState(initialCatalogRef);
  const [sourceName, setSourceName] = useState(TECHNOLOGY[initialTechnology].defaultName);
  const [quantity, setQuantity] = useState('1');
  const [controlMode, setControlMode] = useState('STALY_COS_PHI');
  const [powerSetpointMw, setPowerSetpointMw] = useState('');
  const [qMinMvar, setQMinMvar] = useState('');
  const [qMaxMvar, setQMaxMvar] = useState('');
  const [bessMode, setBessMode] = useState('DWUKIERUNKOWY');
  const [socMinPercent, setSocMinPercent] = useState('10');
  const [socMaxPercent, setSocMaxPercent] = useState('90');
  const [transformerRef, setTransformerRef] = useState('');
  const [converterTypes, setConverterTypes] = useState<ConverterType[]>([]);
  const [lvApparatusTypes, setLvApparatusTypes] = useState<LVApparatusType[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSourceTechnology(initialTechnology);
    setSourceName(TECHNOLOGY[initialTechnology].defaultName);
  }, [initialTechnology]);

  useEffect(() => {
    setConnectionVariant(initialVariant);
  }, [initialVariant]);

  useEffect(() => {
    setBusNnRef(busDefaultRef);
  }, [busDefaultRef]);

  useEffect(() => {
    setConverterCatalogId(initialCatalogRef);
  }, [initialCatalogRef]);

  useEffect(() => {
    let active = true;

    void Promise.all([fetchConverterTypes(), fetchLvApparatusTypes()])
      .then(([converterResponse, apparatusResponse]) => {
        if (!active) {
          return;
        }
        setConverterTypes(converterResponse);
        setLvApparatusTypes(apparatusResponse);
        setCatalogError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setCatalogError(
          error instanceof Error
            ? error.message
            : 'Nie udało się pobrać katalogów źródeł przekształtnikowych.',
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const tech = TECHNOLOGY[sourceTechnology];
  const filteredConverters = useMemo(
    () => converterTypes.filter((entry) => entry.kind === tech.catalogKind),
    [converterTypes, tech.catalogKind],
  );
  const converterEntries = useMemo(() => toCatalogEntries(filteredConverters), [filteredConverters]);
  const apparatusEntries = useMemo(() => toCatalogEntries(lvApparatusTypes), [lvApparatusTypes]);
  const selectedConverter = useMemo(
    () => filteredConverters.find((entry) => entry.id === converterCatalogId) ?? null,
    [converterCatalogId, filteredConverters],
  );
  const sourceFieldOptions = useMemo(
    () => listNnSourceFieldOptions(snapshot, stationRef, busNnRef),
    [busNnRef, snapshot, stationRef],
  );
  const transformerOptions = useMemo(() => {
    const station = snapshot?.substations.find(
      (candidate) => candidate.ref_id === stationRef || candidate.id === stationRef,
    );
    if (!station) {
      return [];
    }

    return (snapshot?.transformers ?? [])
      .filter((transformer) => station.transformer_refs.includes(transformer.ref_id))
      .map((transformer) => ({
        ref_id: transformer.ref_id,
        name: transformer.name,
        lv_bus_ref: transformer.lv_bus_ref,
        sn_mva: transformer.sn_mva,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [snapshot, stationRef]);
  const selectedTransformer = useMemo(
    () => transformerOptions.find((item) => item.ref_id === transformerRef) ?? null,
    [transformerOptions, transformerRef],
  );
  const nominalPowerMw = useMemo(() => {
    if (!selectedConverter) {
      return null;
    }
    const parsedQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
    return selectedConverter.pmax_mw * parsedQuantity;
  }, [quantity, selectedConverter]);

  useEffect(() => {
    if (!filteredConverters.some((entry) => entry.id === converterCatalogId)) {
      setConverterCatalogId('');
    }
  }, [converterCatalogId, filteredConverters]);

  useEffect(() => {
    setNewFieldName(`Pole ${tech.shortLabel} nN`);
  }, [tech.shortLabel]);

  useEffect(() => {
    if (sourceFieldOptions.length === 0) {
      setPlacement('NEW_FIELD');
      setExistingFieldRef('');
      return;
    }
    setExistingFieldRef(
      (current) => current || (sourceFieldOptions.length === 1 ? sourceFieldOptions[0].ref_id : ''),
    );
  }, [sourceFieldOptions]);

  useEffect(() => {
    if (transformerOptions.length === 0) {
      setTransformerRef('');
      return;
    }
    setTransformerRef(
      (current) => current || (transformerOptions.length === 1 ? transformerOptions[0].ref_id : ''),
    );
  }, [transformerOptions]);

  const calcReady = Boolean(
    stationRef &&
      selectedConverter &&
      (connectionVariant === 'nn_side' ? busNnRef : selectedTransformer?.lv_bus_ref),
  );
  const protectionReady =
    connectionVariant === 'nn_side'
      ? placement === 'EXISTING_FIELD'
        ? Boolean(existingFieldRef)
        : Boolean(apparatusCatalogId)
      : Boolean(selectedTransformer);
  const reportReady = Boolean(calcReady && sourceName.trim());

  const readinessItems = [
    { label: 'Obliczeniowa', ready: calcReady },
    { label: 'Zabezpieczeniowa', ready: protectionReady },
    { label: 'Raportowa', ready: reportReady },
  ];

  const handleOpenSourceFieldForm = useCallback(() => {
    openOperationForm('add_nn_outgoing_field', {
      station_ref: stationRef,
      bus_nn_ref: busNnRef,
      field_role: 'SOURCE',
      source_field_kind: tech.fieldKind,
    });
  }, [busNnRef, openOperationForm, stationRef, tech.fieldKind]);

  const handleOpenTransformerForm = useCallback(() => {
    openOperationForm('add_transformer_sn_nn', {
      station_ref: stationRef,
    });
  }, [openOperationForm, stationRef]);

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setSubmitError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }
    if (contextIssues.length > 0) {
      setSubmitError(contextIssues[0]);
      return;
    }
    if (!stationRef) {
      setSubmitError('Nie udało się ustalić stacji dla nowego źródła.');
      return;
    }
    if (!selectedConverter) {
      setSubmitError(`Wybierz katalog dla źródła ${tech.shortLabel}.`);
      return;
    }
    if (connectionVariant === 'nn_side' && !busNnRef) {
      setSubmitError('Wybierz szynę nN dla wariantu po stronie nN.');
      return;
    }
    if (connectionVariant === 'nn_side' && placement === 'EXISTING_FIELD' && !existingFieldRef) {
      setSubmitError('Wybierz istniejące pole źródłowe nN albo utwórz nowe.');
      return;
    }
    if (
      connectionVariant === 'nn_side' &&
      placement === 'NEW_FIELD' &&
      !apparatusCatalogId.trim()
    ) {
      setSubmitError('Wskaż aparat nN dla nowego pola źródłowego.');
      return;
    }
    if (connectionVariant === 'block_transformer' && !selectedTransformer?.lv_bus_ref) {
      setSubmitError('Wybierz transformator blokowy z poprawnie zdefiniowaną stroną nN.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const parsedQuantity = Math.max(1, Number.parseInt(quantity, 10) || 1);
      const qMin = parseOptionalNumber(qMinMvar) ?? selectedConverter.qmin_mvar ?? null;
      const qMax = parseOptionalNumber(qMaxMvar) ?? selectedConverter.qmax_mvar ?? null;
      const pSetpoint =
        parseOptionalNumber(powerSetpointMw) ?? nominalPowerMw ?? selectedConverter.pmax_mw;
      const targetBusRef =
        connectionVariant === 'block_transformer'
          ? selectedTransformer?.lv_bus_ref ?? ''
          : busNnRef;

      const result = await executeDomainOperation(activeCaseId, 'add_converter_source', {
        source_technology: sourceTechnology,
        connection_variant: connectionVariant,
        station_ref: stationRef,
        bus_nn_ref: targetBusRef,
        placement: connectionVariant === 'nn_side' ? placement : undefined,
        existing_field_ref:
          connectionVariant === 'nn_side' && placement === 'EXISTING_FIELD'
            ? existingFieldRef
            : undefined,
        source_field:
          connectionVariant === 'nn_side' && placement === 'NEW_FIELD'
            ? {
                field_name: newFieldName.trim() || undefined,
                source_field_kind: tech.fieldKind,
                catalog_binding:
                  normalizeCatalogBinding(apparatusCatalogId, 'APARAT_NN') ?? undefined,
              }
            : undefined,
        source_name: sourceName.trim() || tech.defaultName,
        quantity: parsedQuantity,
        control_mode: controlMode,
        power_setpoint_mw: pSetpoint,
        q_min_mvar: qMin,
        q_max_mvar: qMax,
        bess_mode: sourceTechnology === 'BESS' ? bessMode : undefined,
        soc_min_percent:
          sourceTechnology === 'BESS' ? parseOptionalNumber(socMinPercent) : undefined,
        soc_max_percent:
          sourceTechnology === 'BESS' ? parseOptionalNumber(socMaxPercent) : undefined,
        blocking_transformer_ref:
          connectionVariant === 'block_transformer'
            ? selectedTransformer?.ref_id ?? undefined
            : undefined,
        catalog_binding: normalizeCatalogBinding(converterCatalogId, 'CONVERTER') ?? undefined,
        materialized_params: {
          catalog_item_id: selectedConverter.id,
          catalog_item_version: CANONICAL_CATALOG_VERSION,
          sn_mva: selectedConverter.sn_mva,
          pmax_mw: selectedConverter.pmax_mw,
          un_kv: selectedConverter.un_kv,
          qmin_mvar: selectedConverter.qmin_mvar ?? null,
          qmax_mvar: selectedConverter.qmax_mvar ?? null,
          cosphi_min: selectedConverter.cosphi_min ?? null,
          cosphi_max: selectedConverter.cosphi_max ?? null,
          e_kwh: selectedConverter.e_kwh ?? null,
        },
      });

      if (!result || result.error) {
        throw new Error(result?.error || 'Nie udało się utworzyć źródła.');
      }

      closeForm();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Nie udało się dodać źródła.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeCaseId,
    apparatusCatalogId,
    bessMode,
    busNnRef,
    closeForm,
    connectionVariant,
    contextIssues,
    controlMode,
    converterCatalogId,
    executeDomainOperation,
    existingFieldRef,
    newFieldName,
    nominalPowerMw,
    placement,
    powerSetpointMw,
    qMaxMvar,
    qMinMvar,
    quantity,
    selectedConverter,
    selectedTransformer,
    socMaxPercent,
    socMinPercent,
    sourceName,
    sourceTechnology,
    stationRef,
    tech,
  ]);

  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="add-converter-source-form">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Nowe źródło przekształtnikowe
        </h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Stacja:{' '}
          <span className="font-medium text-slate-700">{stationLabel(snapshot, stationRef)}</span>
        </p>
      </div>

      <div className="space-y-4 p-4">
        {(catalogError || submitError || contextIssues.length > 0) && (
          <div
            className={`rounded-md px-3 py-2 text-xs ${
              submitError
                ? 'border border-rose-200 bg-rose-50 text-rose-700'
                : 'border border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {submitError ?? contextIssues[0] ?? catalogError}
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Typ źródła
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(TECHNOLOGY) as SourceTechnology[]).map((technology) => (
              <button
                key={technology}
                type="button"
                onClick={() => setSourceTechnology(technology)}
                className={`rounded-md px-3 py-2 text-xs font-medium ${
                  sourceTechnology === technology
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-700'
                }`}
              >
                {TECHNOLOGY[technology].shortLabel}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Wariant przyłączenia
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setConnectionVariant('nn_side')}
              className={`rounded-md border px-3 py-3 text-left text-xs ${
                connectionVariant === 'nn_side'
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <div className="font-semibold">Po stronie nN</div>
              <div className="mt-1 text-[11px] text-slate-500">
                Źródło korzysta z rozdzielni nN istniejącej stacji.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setConnectionVariant('block_transformer')}
              className={`rounded-md border px-3 py-3 text-left text-xs ${
                connectionVariant === 'block_transformer'
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <div className="font-semibold">Blokowe do SN</div>
              <div className="mt-1 text-[11px] text-slate-500">
                Źródło wykorzystuje transformator blokowy i tor SN stacji.
              </div>
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">Nazwa źródła</span>
            <input
              value={sourceName}
              onChange={(event) => setSourceName(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder={tech.defaultName}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">Liczba jednostek</span>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              type="number"
              min="1"
              step="1"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {connectionVariant === 'nn_side' ? (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Tor przyłączeniowy nN
            </div>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">Szyna nN</span>
              <select
                value={busNnRef}
                onChange={(event) => setBusNnRef(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— wybierz —</option>
                {busOptions.map((bus) => (
                  <option key={bus.ref_id} value={bus.ref_id}>
                    {bus.name} ({bus.voltage_kv} kV)
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setPlacement('EXISTING_FIELD')}
                className={`rounded-md border px-3 py-2 text-left text-xs ${
                  placement === 'EXISTING_FIELD'
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                Użyj istniejącego pola źródłowego
              </button>
              <button
                type="button"
                onClick={() => setPlacement('NEW_FIELD')}
                className={`rounded-md border px-3 py-2 text-left text-xs ${
                  placement === 'NEW_FIELD'
                    ? 'border-blue-500 bg-blue-50 text-blue-900'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                Utwórz nowe pole źródłowe
              </button>
            </div>

            {placement === 'EXISTING_FIELD' ? (
              sourceFieldOptions.length > 0 ? (
                <label className="block">
                  <span className="text-[11px] font-medium text-slate-700">
                    Istniejące pole źródłowe
                  </span>
                  <select
                    value={existingFieldRef}
                    onChange={(event) => setExistingFieldRef(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {sourceFieldOptions.map((field) => (
                      <option key={field.ref_id} value={field.ref_id}>
                        {field.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Na tej stacji nie ma jeszcze pola źródłowego nN dla źródła {tech.shortLabel}.
                  <button
                    type="button"
                    onClick={handleOpenSourceFieldForm}
                    className="ml-3 rounded-md border border-amber-300 bg-white px-2 py-1 font-medium text-amber-900"
                  >
                    Dodaj pole źródłowe
                  </button>
                </div>
              )
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-medium text-slate-700">
                    Nazwa nowego pola
                  </span>
                  <input
                    value={newFieldName}
                    onChange={(event) => setNewFieldName(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <CatalogPicker
                  label="Aparat nN"
                  entries={apparatusEntries}
                  selectedId={apparatusCatalogId}
                  onChange={setApparatusCatalogId}
                  required
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Tor blokowy do SN
            </div>
            {transformerOptions.length > 0 ? (
              <label className="block">
                <span className="text-[11px] font-medium text-slate-700">
                  Transformator blokowy
                </span>
                <select
                  value={transformerRef}
                  onChange={(event) => setTransformerRef(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {transformerOptions.map((transformer) => (
                    <option key={transformer.ref_id} value={transformer.ref_id}>
                      {transformer.name} ({transformer.sn_mva.toFixed(3)} MVA)
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Ta stacja nie ma jeszcze transformatora, więc wariant blokowy nie jest gotowy.
                <button
                  type="button"
                  onClick={handleOpenTransformerForm}
                  className="ml-3 rounded-md border border-amber-300 bg-white px-2 py-1 font-medium text-amber-900"
                >
                  Dodaj transformator
                </button>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  Szyna strony nN
                </div>
                <div className="mt-1 font-medium text-slate-800">
                  {selectedTransformer?.lv_bus_ref ?? '—'}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  Transformator
                </div>
                <div className="mt-1 font-medium text-slate-800">
                  {selectedTransformer?.name ?? '—'}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  Moc bloku
                </div>
                <div className="mt-1 font-medium text-slate-800">
                  {formatPower(nominalPowerMw)}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Tożsamość techniczna
          </div>
          <div className="mt-3 grid gap-4">
            <CatalogPicker
              label={`Przekształtnik ${tech.shortLabel}`}
              entries={converterEntries}
              selectedId={converterCatalogId}
              onChange={setConverterCatalogId}
              required
            />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  Moc z katalogu
                </div>
                <div className="mt-1 font-medium text-slate-800">
                  {formatPower(nominalPowerMw)}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  Zakres Q
                </div>
                <div className="mt-1 font-medium text-slate-800">
                  {selectedConverter
                    ? `${selectedConverter.qmin_mvar ?? '—'} / ${
                        selectedConverter.qmax_mvar ?? '—'
                      } Mvar`
                    : '—'}
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Energia</div>
                <div className="mt-1 font-medium text-slate-800">
                  {selectedConverter?.e_kwh != null ? `${selectedConverter.e_kwh} kWh` : '—'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Sterowanie i ograniczenia
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">Tryb sterowania</span>
              <select
                value={controlMode}
                onChange={(event) => setControlMode(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="STALY_COS_PHI">Stały cos φ</option>
                <option value="Q_OD_U">Q(U)</option>
                <option value="P_OD_U">P(U)</option>
                <option value="WYLACZONE">Wyłączone</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">
                Moc robocza P [MW]
              </span>
              <input
                value={powerSetpointMw}
                onChange={(event) => setPowerSetpointMw(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder={nominalPowerMw != null ? nominalPowerMw.toFixed(3) : 'np. 0.500'}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">Qmin [Mvar]</span>
              <input
                value={qMinMvar}
                onChange={(event) => setQMinMvar(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder={selectedConverter?.qmin_mvar?.toString() ?? '—'}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-700">Qmax [Mvar]</span>
              <input
                value={qMaxMvar}
                onChange={(event) => setQMaxMvar(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder={selectedConverter?.qmax_mvar?.toString() ?? '—'}
              />
            </label>
          </div>

          {sourceTechnology === 'BESS' && (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-[11px] font-medium text-slate-700">Tryb pracy BESS</span>
                <select
                  value={bessMode}
                  onChange={(event) => setBessMode(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="DWUKIERUNKOWY">Dwukierunkowy</option>
                  <option value="TYLKO_GENERACJA">Tylko generacja</option>
                  <option value="TYLKO_MAGAZYNOWANIE">Tylko magazynowanie</option>
                  <option value="WYLACZONE">Wyłączone</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-slate-700">SoC min [%]</span>
                <input
                  value={socMinPercent}
                  onChange={(event) => setSocMinPercent(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-slate-700">SoC max [%]</span>
                <input
                  value={socMaxPercent}
                  onChange={(event) => setSocMaxPercent(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-900">
          <div className="font-semibold">Lokalna gotowość źródła</div>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {readinessItems.map((item) => (
              <div
                key={item.label}
                className={`rounded border px-2 py-2 ${
                  item.ready
                    ? 'border-emerald-300 bg-white text-emerald-900'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                }`}
              >
                <div className="text-[10px] uppercase tracking-wide">{item.label}</div>
                <div className="mt-1 font-medium">{item.ready ? 'Gotowe' : 'Braki'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Zapisywanie…' : 'Dodaj źródło'}
          </button>
          <button
            type="button"
            onClick={closeForm}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddConverterSourceForm;
