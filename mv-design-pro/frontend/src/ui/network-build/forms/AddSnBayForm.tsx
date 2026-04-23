import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { fetchMvApparatusTypes } from '../../catalog/api';
import type { MVApparatusType } from '../../catalog/types';
import { CatalogPicker, type CatalogEntry } from '../../topology/modals/CatalogPicker';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationForm, useNetworkBuildStore } from '../networkBuildStore';
import { catalogRefFromInput, normalizeCatalogBinding } from './catalogPayload';
import { validateCatalogFirst } from './catalogFirstRules';
import {
  listSnBusOptions,
  resolveBusSnRef,
  resolveStationRef,
  stationLabel,
} from './enmResolvers';

type SnBayRole = 'IN' | 'OUT' | 'FEEDER' | 'TR' | 'COUPLER' | 'MEASUREMENT' | 'OZE';
type ApparatusKind = 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH' | 'MEASUREMENT';

const BAY_ROLE_OPTIONS: Array<{ value: SnBayRole; label: string }> = [
  { value: 'OUT', label: 'Pole liniowe odplywowe' },
  { value: 'IN', label: 'Pole liniowe doplywowe' },
  { value: 'FEEDER', label: 'Pole liniowe / odgalezne' },
  { value: 'TR', label: 'Pole transformatorowe' },
  { value: 'COUPLER', label: 'Pole sprzegla sekcji' },
  { value: 'MEASUREMENT', label: 'Pole pomiarowe' },
  { value: 'OZE', label: 'Pole zrodlowe' },
];

const APPARATUS_OPTIONS: Array<{ value: ApparatusKind; label: string }> = [
  { value: 'BREAKER', label: 'Wylacznik' },
  { value: 'DISCONNECTOR', label: 'Odlacznik' },
  { value: 'LOAD_SWITCH', label: 'Rozlacznik' },
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

function defaultFieldName(role: SnBayRole): string {
  const map: Record<SnBayRole, string> = {
    IN: 'Pole doplywowe SN',
    OUT: 'Pole odplywowe SN',
    FEEDER: 'Pole liniowe SN',
    TR: 'Pole transformatorowe SN',
    COUPLER: 'Pole sprzegla SN',
    MEASUREMENT: 'Pole pomiarowe SN',
    OZE: 'Pole zrodlowe SN',
  };
  return map[role];
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
  const hasRequestedPrimaryApparatus = Boolean(context?.apparatus_kind || context?.bay_kind || initialCatalogRef);

  const [busRef, setBusRef] = useState(resolvedBusRef ?? busOptions[0]?.ref_id ?? '');
  const [bayRole, setBayRole] = useState<SnBayRole>(initialRole);
  const [fieldName, setFieldName] = useState(defaultFieldName(initialRole));
  const [configurePrimaryApparatus, setConfigurePrimaryApparatus] = useState(
    hasRequestedPrimaryApparatus,
  );
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
    setFieldName(defaultFieldName(bayRole));
  }, [bayRole]);

  useEffect(() => {
    if (!configurePrimaryApparatus) {
      setCatalogEntries([]);
      setCatalogError(null);
      return;
    }

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
            : 'Nie udalo sie pobrac katalogu aparatury SN.',
        );
      });

    return () => {
      active = false;
    };
  }, [apparatusKind, configurePrimaryApparatus]);

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setSubmitError('Brak aktywnego zakresu obliczen.');
      return;
    }
    if (!stationRef) {
      setSubmitError('Nie udalo sie ustalic stacji lub GPZ dla nowego pola SN.');
      return;
    }
    if (!busRef) {
      setSubmitError('Wybierz szyne SN, do ktorej ma zostac przypiete pole.');
      return;
    }

    const payload: Record<string, unknown> = {
      bus_ref: busRef,
      station_ref: stationRef,
      bay_role: bayRole,
      field_name: fieldName.trim() || undefined,
      gpz_section_id:
        typeof context?.gpz_section_id === 'string' && context.gpz_section_id.trim()
          ? context.gpz_section_id.trim()
          : undefined,
      creation_mode: configurePrimaryApparatus ? 'WITH_PRIMARY_APPARATUS' : 'TOPOLOGICAL_CONTAINER',
      configure_primary_apparatus: configurePrimaryApparatus,
    };

    if (configurePrimaryApparatus) {
      payload.apparatus_kind = apparatusKind;
      payload.catalog_binding = normalizeCatalogBinding(catalogItemId, 'APARAT_SN') ?? undefined;
    }

    const validationError = validateCatalogFirst('add_sn_bay', payload);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await executeDomainOperation(activeCaseId, 'add_sn_bay', payload);
      closeForm();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Nie udalo sie dodac pola SN.');
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
    configurePrimaryApparatus,
    context?.gpz_section_id,
    executeDomainOperation,
    fieldName,
    stationRef,
  ]);

  return (
    <div
      className="h-full overflow-y-auto bg-[#07141f] text-slate-100"
      data-testid="add-sn-bay-form"
    >
      <div className="border-b border-cyan-950/80 bg-[#081b2c] px-4 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">
          Pole SN
        </div>
        <h3 className="mt-1 text-sm font-semibold text-white">
          Kontener pola i technika pola
        </h3>
        <p className="mt-1 text-xs text-slate-300">
          Rozdzielnia: <span className="font-medium text-cyan-100">{stationLabel(snapshot, stationRef)}</span>
        </p>
      </div>

      <div className="space-y-4 p-4">
        {submitError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-3 text-xs text-rose-100">
            {submitError}
          </div>
        )}

        <section className="rounded-2xl border border-cyan-950/80 bg-[#0b1b29] p-4 shadow-[0_0_0_1px_rgba(8,145,178,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-400/80">
            Kontekst pola
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-300">Szyna SN</span>
              <select
                value={busRef}
                onChange={(event) => setBusRef(event.target.value)}
                className="mt-1 w-full rounded-xl border border-cyan-900/70 bg-[#07141f] px-3 py-2 text-sm text-slate-100"
              >
                <option value="">- wybierz -</option>
                {busOptions.map((bus) => (
                  <option key={bus.ref_id} value={bus.ref_id}>
                    {bus.name} ({bus.voltage_kv} kV)
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-300">Rola pola</span>
              <select
                value={bayRole}
                onChange={(event) => setBayRole(event.target.value as SnBayRole)}
                className="mt-1 w-full rounded-xl border border-cyan-900/70 bg-[#07141f] px-3 py-2 text-sm text-slate-100"
              >
                {BAY_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block md:col-span-2">
              <span className="text-[11px] font-medium text-slate-300">Nazwa pola</span>
              <input
                value={fieldName}
                onChange={(event) => setFieldName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-cyan-900/70 bg-[#07141f] px-3 py-2 text-sm text-slate-100"
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-cyan-950/80 bg-[#0b1b29] p-4 shadow-[0_0_0_1px_rgba(8,145,178,0.08)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-400/80">
            Tryb utworzenia
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setConfigurePrimaryApparatus(false)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                !configurePrimaryApparatus
                  ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-100'
                  : 'border-cyan-950/80 bg-[#07141f] text-slate-200'
              }`}
            >
              <div className="text-sm font-semibold">Kontener pola teraz</div>
              <div className="mt-1 text-xs text-slate-300">
                Tworzy topologiczne pole SN bez wymuszania aparatu. To jest jedyna
                kanoniczna sciezka startu procesu.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setConfigurePrimaryApparatus(true)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                configurePrimaryApparatus
                  ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-50'
                  : 'border-cyan-950/80 bg-[#07141f] text-slate-200'
              }`}
            >
              <div className="text-sm font-semibold">Kontener i aparat glowny</div>
              <div className="mt-1 text-xs text-slate-300">
                Tworzy pole oraz od razu przypisuje aparat glowny z katalogu.
              </div>
            </button>
          </div>
        </section>

        {configurePrimaryApparatus ? (
          <section className="rounded-2xl border border-cyan-950/80 bg-[#0b1b29] p-4 shadow-[0_0_0_1px_rgba(8,145,178,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-400/80">
              Aparat glowny pola
            </div>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-[11px] font-medium text-slate-300">Rodzaj aparatu glownego</span>
                <select
                  value={apparatusKind}
                  onChange={(event) => setApparatusKind(event.target.value as ApparatusKind)}
                  className="mt-1 w-full rounded-xl border border-cyan-900/70 bg-[#07141f] px-3 py-2 text-sm text-slate-100"
                >
                  {APPARATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {catalogError && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-3 py-3 text-xs text-amber-100">
                  {catalogError} Mozesz tymczasowo wpisac identyfikator katalogowy recznie.
                </div>
              )}

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
                  <span className="text-[11px] font-medium text-slate-300">Identyfikator aparatu z katalogu</span>
                  <input
                    value={catalogItemId}
                    onChange={(event) => setCatalogItemId(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-cyan-900/70 bg-[#07141f] px-3 py-2 font-mono text-sm text-slate-100"
                    placeholder="np. cb-24kv-1250a"
                  />
                </label>
              )}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
              Status jakosci danych
            </div>
            <div className="mt-2 text-sm font-medium text-emerald-50">
              Pole powstanie jako kontener topologiczno-funkcyjny.
            </div>
            <div className="mt-1 text-xs text-emerald-100/90">
              Aparat glowny, CT, VT i zabezpieczenia zostana dodane pozniej w powierzchni pola.
              Model pozostaje prowadzony dalej, ale gotowosc obliczeniowa i raportowa moze
              pozostac czesciowa do czasu uzupelnienia techniki pola.
            </div>
          </section>
        )}

        <div className="flex items-center gap-2 border-t border-cyan-950/80 pt-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-xl border border-cyan-400/60 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Tworzenie pola...' : 'Utworz pole SN'}
          </button>
          <button
            type="button"
            onClick={closeForm}
            className="rounded-xl border border-cyan-950/80 bg-[#07141f] px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-800 hover:text-white"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddSnBayForm;
