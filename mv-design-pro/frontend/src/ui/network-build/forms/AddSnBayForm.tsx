import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { fetchMvApparatusTypes } from '../../catalog/api';
import type { MVApparatusType } from '../../catalog/types';
import { CatalogPicker, type CatalogEntry } from '../../topology/modals/CatalogPicker';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationForm, useNetworkBuildStore } from '../networkBuildStore';
import { catalogRefFromInput, normalizeCatalogBinding } from './catalogPayload';
import {
  listSnBusOptions,
  resolveBusSnRef,
  resolveStationRef,
  stationLabel,
} from './enmResolvers';

type SnBayRole = 'IN' | 'OUT' | 'FEEDER' | 'TR' | 'COUPLER' | 'MEASUREMENT' | 'OZE';
type ApparatusKind = 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH' | 'MEASUREMENT';

const BAY_ROLE_OPTIONS: Array<{ value: SnBayRole; label: string }> = [
  { value: 'OUT', label: 'Pole liniowe odpływowe' },
  { value: 'IN', label: 'Pole liniowe dopływowe' },
  { value: 'FEEDER', label: 'Pole liniowe / odgałęźne' },
  { value: 'TR', label: 'Pole transformatorowe' },
  { value: 'COUPLER', label: 'Pole sprzęgła sekcji' },
  { value: 'MEASUREMENT', label: 'Pole pomiarowe' },
  { value: 'OZE', label: 'Pole źródłowe' },
];

const APPARATUS_OPTIONS: Array<{ value: ApparatusKind; label: string }> = [
  { value: 'BREAKER', label: 'Wyłącznik' },
  { value: 'DISCONNECTOR', label: 'Odłącznik' },
  { value: 'LOAD_SWITCH', label: 'Rozłącznik' },
  { value: 'MEASUREMENT', label: 'Tor pomiarowy' },
];

function mapLegacyApparatusKind(value: unknown): ApparatusKind {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  switch (normalized) {
    case 'BREAKER':
    case 'CB':
      return 'BREAKER';
    case 'DISCONNECTOR':
    case 'DS':
      return 'DISCONNECTOR';
    case 'LOAD_SWITCH':
    case 'LS':
      return 'LOAD_SWITCH';
    case 'MEASUREMENT':
    case 'VT':
      return 'MEASUREMENT';
    default:
      return 'BREAKER';
  }
}

function toCatalogEntries(items: MVApparatusType[]): CatalogEntry[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    manufacturer: item.manufacturer,
    summary: `Un ${item.u_n_kv} kV, In ${item.i_n_a} A`,
  }));
}

export function AddSnBayForm() {
  const activeForm = useActiveOperationForm() as
    | {
        op: 'add_sn_bay';
        context?: Record<string, unknown>;
      }
    | null;
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);
  const context = activeForm?.context;

  const stationRef = useMemo(() => resolveStationRef(context, snapshot), [context, snapshot]);
  const busOptions = useMemo(() => listSnBusOptions(snapshot, stationRef), [snapshot, stationRef]);
  const resolvedBusRef = useMemo(() => resolveBusSnRef(context, snapshot), [context, snapshot]);
  const initialRole = useMemo<SnBayRole>(() => {
    const raw = typeof context?.bay_role === 'string' ? context.bay_role.trim().toUpperCase() : '';
    return BAY_ROLE_OPTIONS.find((option) => option.value === raw)?.value ?? 'OUT';
  }, [context?.bay_role]);
  const initialApparatusKind = useMemo(
    () => mapLegacyApparatusKind(context?.apparatus_kind ?? context?.bay_kind),
    [context?.apparatus_kind, context?.bay_kind],
  );
  const initialCatalogRef = useMemo(
    () =>
      catalogRefFromInput(context?.catalog_binding) ??
      catalogRefFromInput(context?.catalog_ref) ??
      '',
    [context],
  );

  const [busRef, setBusRef] = useState(resolvedBusRef ?? busOptions[0]?.ref_id ?? '');
  const [bayRole, setBayRole] = useState<SnBayRole>(initialRole);
  const [fieldName, setFieldName] = useState('Pole SN');
  const [apparatusKind, setApparatusKind] = useState<ApparatusKind>(initialApparatusKind);
  const [catalogItemId, setCatalogItemId] = useState(initialCatalogRef);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setBusRef(resolvedBusRef ?? busOptions[0]?.ref_id ?? '');
  }, [resolvedBusRef, busOptions]);

  useEffect(() => {
    setBayRole(initialRole);
  }, [initialRole]);

  useEffect(() => {
    setApparatusKind(initialApparatusKind);
  }, [initialApparatusKind]);

  useEffect(() => {
    setCatalogItemId(initialCatalogRef);
  }, [initialCatalogRef]);

  useEffect(() => {
    const defaultNames: Record<SnBayRole, string> = {
      IN: 'Pole dopływowe SN',
      OUT: 'Pole odpływowe SN',
      FEEDER: 'Pole liniowe SN',
      TR: 'Pole transformatorowe SN',
      COUPLER: 'Pole sprzęgła SN',
      MEASUREMENT: 'Pole pomiarowe SN',
      OZE: 'Pole źródłowe SN',
    };
    setFieldName(defaultNames[bayRole]);
  }, [bayRole]);

  useEffect(() => {
    let active = true;
    void fetchMvApparatusTypes()
      .then((types) => {
        if (!active) {
          return;
        }
        const filtered = types.filter((item) => {
          if (apparatusKind === 'MEASUREMENT') {
            return item.device_kind?.toUpperCase() === 'MEASUREMENT';
          }
          return item.device_kind?.toUpperCase() === apparatusKind;
        });
        setCatalogEntries(toCatalogEntries(filtered.length > 0 ? filtered : types));
        setCatalogError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setCatalogEntries([]);
        setCatalogError(
          error instanceof Error
            ? error.message
            : 'Nie udało się pobrać katalogu aparatury SN.',
        );
      });

    return () => {
      active = false;
    };
  }, [apparatusKind]);

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setSubmitError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }
    if (!stationRef) {
      setSubmitError('Nie udało się ustalić stacji lub GPZ dla nowego pola SN.');
      return;
    }
    if (!busRef) {
      setSubmitError('Wybierz szynę SN, do której ma zostać przypięte pole.');
      return;
    }
    if (!catalogItemId.trim()) {
      setSubmitError('Wskaż aparat SN z katalogu.');
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await executeDomainOperation(activeCaseId, 'add_sn_bay', {
        bus_ref: busRef,
        station_ref: stationRef,
        bay_role: bayRole,
        field_name: fieldName.trim() || undefined,
        apparatus_kind: apparatusKind,
        gpz_section_id:
          typeof context?.gpz_section_id === 'string' && context.gpz_section_id.trim()
            ? context.gpz_section_id.trim()
            : undefined,
        catalog_binding: normalizeCatalogBinding(catalogItemId, 'APARAT_SN') ?? undefined,
      });
      closeForm();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Nie udało się dodać pola SN.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeCaseId,
    apparatusKind,
    bayRole,
    busRef,
    catalogItemId,
    closeForm,
    context?.gpz_section_id,
    executeDomainOperation,
    fieldName,
    stationRef,
  ]);

  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="add-sn-bay-form">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Nowe pole SN</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Rozdzielnia: <span className="font-medium text-slate-700">{stationLabel(snapshot, stationRef)}</span>
        </p>
      </div>

      <div className="space-y-4 p-4">
        {submitError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {submitError}
          </div>
        )}
        {catalogError && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {catalogError} Możesz tymczasowo wpisać identyfikator katalogowy ręcznie.
          </div>
        )}

        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">Szyna SN</span>
          <select
            value={busRef}
            onChange={(event) => setBusRef(event.target.value)}
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

        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">Rola pola</span>
          <select
            value={bayRole}
            onChange={(event) => setBayRole(event.target.value as SnBayRole)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {BAY_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">Rodzaj aparatu głównego</span>
          <select
            value={apparatusKind}
            onChange={(event) => setApparatusKind(event.target.value as ApparatusKind)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {APPARATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">Nazwa pola</span>
          <input
            value={fieldName}
            onChange={(event) => setFieldName(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {catalogEntries.length > 0 ? (
          <CatalogPicker
            label="Aparat SN z katalogu"
            entries={catalogEntries}
            selectedId={catalogItemId}
            onChange={(id) => setCatalogItemId(id)}
            required
          />
        ) : (
          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">Identyfikator aparatu z katalogu</span>
            <input
              value={catalogItemId}
              onChange={(event) => setCatalogItemId(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
              placeholder="np. cb-24kv-1250a"
            />
          </label>
        )}

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
          <div className="font-semibold">Podsumowanie</div>
          <div className="mt-1">
            System dopisze pole do typed kontraktu stacji bez zapisu do legacy `bays`.
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Dodawanie…' : 'Dodaj pole SN'}
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

export default AddSnBayForm;
