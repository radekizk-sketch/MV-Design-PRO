import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { fetchMvApparatusTypes } from '../../catalog/api';
import type { MVApparatusType } from '../../catalog/types';
import { CatalogPicker, type CatalogEntry } from '../../topology/modals/CatalogPicker';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { navigateToSld } from '../../navigation/routes';
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

const BAY_ROLE_OPTIONS: Array<{ value: SnBayRole; label: string; description: string }> = [
  {
    value: 'OUT',
    label: 'Pole liniowe odpływowe',
    description: 'Standardowe pole z wyprowadzeniem ciągu SN (linii/kabla). Zwykle z wyłącznikiem, CT 5P, zabezpieczeniem 50/51/67.',
  },
  {
    value: 'IN',
    label: 'Pole liniowe dopływowe',
    description: 'Pole zasilające szyny GPZ od strony WN (po transformatorze WN/SN). CT pomiarowe + zabezpieczenia 87T/50/51.',
  },
  {
    value: 'FEEDER',
    label: 'Pole liniowe / odgałęźne',
    description: 'Pole rozdzielcze pośrednie - wyprowadza odgałęzienie z ciągu głównego. Stosowane w sieciach pętlowych/promienistych.',
  },
  {
    value: 'TR',
    label: 'Pole transformatorowe',
    description: 'Pole z transformatorem SN/nN dla stacji. Zabezpieczenia: 50/51 strony SN + relay 87T różnicowy + temperatura.',
  },
  {
    value: 'COUPLER',
    label: 'Pole sprzęgła sekcji',
    description: 'Łącznik między sekcjami szyn (CB lub DS). Tryb pracy normal-open (NOP) lub normal-closed (NC). Kluczowy dla N-1.',
  },
  {
    value: 'MEASUREMENT',
    label: 'Pole pomiarowe',
    description: 'Pole tylko z VT (przekładniki napięciowe) + bezpiecznik. Bez wyłącznika - do pomiarów napięcia U na szynach.',
  },
  {
    value: 'OZE',
    label: 'Pole źródłowe (OZE/DER)',
    description: 'Pole dla źródła rozproszonego (PV/BESS/FW). Wymaga zabezpieczeń 27/59/81U/81O + anti-islanding ROCOF.',
  },
];

const APPARATUS_OPTIONS: Array<{ value: ApparatusKind; label: string; description: string }> = [
  {
    value: 'BREAKER',
    label: 'Wyłącznik (CB)',
    description: 'Wyłącznik mocy SN - łączy/rozłącza przy obciążeniu i zwarciu. Wymagany dla pól z zabezpieczeniami 50/51/67.',
  },
  {
    value: 'DISCONNECTOR',
    label: 'Odłącznik (DS)',
    description: 'Tylko bezpieczna sekcja - łączy/rozłącza BEZ obciążenia. Dla widzialnej separacji galwanicznej.',
  },
  {
    value: 'LOAD_SWITCH',
    label: 'Rozłącznik (LBS)',
    description: 'Łączy/rozłącza przy normalnej pracy ale NIE wyłącza zwarcia. Tańsza alternatywa CB dla mniej krytycznych pól.',
  },
  {
    value: 'MEASUREMENT',
    label: 'Tor pomiarowy (VT/CT)',
    description: 'Pole bez przełączania - tylko przekładniki pomiarowe. Wykorzystywane dla pomiarów napięcia/prądu/mocy.',
  },
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
    summary: `${apparatusKindLabel(item.device_kind)} · Un ${item.u_n_kv} kV, In ${item.i_n_a} A`,
  }));
}

function apparatusKindLabel(value: string | undefined): string {
  switch ((value ?? '').trim().toUpperCase()) {
    case 'WYLACZNIK':
    case 'BREAKER':
      return 'Wyłącznik';
    case 'ODLACZNIK':
    case 'DISCONNECTOR':
      return 'Odłącznik';
    case 'ROZLACZNIK':
    case 'ROZLACZNIK_BEZPIECZNIKOWY':
    case 'LOAD_SWITCH':
      return 'Rozłącznik';
    case 'REKLOZER':
      return 'Reklozer';
    case 'UZIEMNIK':
      return 'Uziemnik';
    default:
      return value ?? 'Aparat SN';
  }
}

function catalogItemMatchesApparatusKind(item: MVApparatusType, apparatusKind: ApparatusKind): boolean {
  const deviceKind = item.device_kind?.toUpperCase();
  if (apparatusKind === 'BREAKER') {
    return deviceKind === 'WYLACZNIK' || deviceKind === 'REKLOZER' || deviceKind === 'BREAKER';
  }
  if (apparatusKind === 'DISCONNECTOR') {
    return deviceKind === 'ODLACZNIK' || deviceKind === 'UZIEMNIK' || deviceKind === 'DISCONNECTOR';
  }
  if (apparatusKind === 'LOAD_SWITCH') {
    return deviceKind === 'ROZLACZNIK'
      || deviceKind === 'ROZLACZNIK_BEZPIECZNIKOWY'
      || deviceKind === 'LOAD_SWITCH';
  }
  return deviceKind === 'MEASUREMENT';
}

export function AddSnBayForm() {
  const activeForm = useActiveOperationForm() as
    | {
        op: 'add_sn_bay';
        context?: Record<string, unknown>;
      }
    | null;
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const collapseSurfaceStackTo = useNetworkBuildStore((state) => state.collapseSurfaceStackTo);
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
  const initialFieldName = useMemo(() => {
    const raw = context?.field_name ?? context?.name;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  }, [context?.field_name, context?.name]);

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
    setFieldName(initialFieldName ?? defaultNames[bayRole]);
  }, [bayRole, initialFieldName]);

  useEffect(() => {
    let active = true;
    void fetchMvApparatusTypes()
      .then((types) => {
        if (!active) {
          return;
        }
        const filtered = types.filter((item) => catalogItemMatchesApparatusKind(item, apparatusKind));
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
      setSubmitError('Wybierz zakres obliczeń przed zapisem pola SN.');
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
      const response = await executeDomainOperation(activeCaseId, 'add_sn_bay', {
        bus_ref: busRef,
        station_ref: stationRef,
        existing_field_ref:
          typeof context?.existing_field_ref === 'string' && context.existing_field_ref.trim()
            ? context.existing_field_ref.trim()
            : undefined,
        bay_role: bayRole,
        field_name: fieldName.trim() || undefined,
        apparatus_kind: apparatusKind,
        gpz_section_id:
          typeof context?.gpz_section_id === 'string' && context.gpz_section_id.trim()
            ? context.gpz_section_id.trim()
            : undefined,
        catalog_binding: normalizeCatalogBinding(catalogItemId, 'APARAT_SN') ?? undefined,
      });
      if (!response) {
        setSubmitError(
          useSnapshotStore.getState().error ?? 'Nie udało się dodać pola SN do modelu.',
        );
        return;
      }
      if (response.error) {
        setSubmitError(response.error);
        return;
      }
      collapseSurfaceStackTo(null);
      navigateToSld();
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
    collapseSurfaceStackTo,
    context?.gpz_section_id,
    context?.existing_field_ref,
    executeDomainOperation,
    fieldName,
    stationRef,
  ]);

  return (
    <div
      className="h-full overflow-y-auto bg-[#07111c] text-[#d7ecff]"
      data-testid="add-sn-bay-form"
    >
      <div className="border-b border-[#17314c] bg-[#081522] px-4 py-3">
        <h3 className="font-mono-eng text-sm font-semibold text-white">Nowe pole SN</h3>
        <p className="mt-1 text-[11px] text-[#7da1bf]">
          Rozdzielnia:{' '}
          <span className="font-medium text-[#18e6ff]">{stationLabel(snapshot, stationRef)}</span>
        </p>
      </div>

      <div className="space-y-4 p-4">
        {submitError && (
          <div className="border border-[#7f1d1d] bg-[#2a1014] px-3 py-2 text-xs text-[#ff9a9a]">
            {submitError}
          </div>
        )}
        {catalogError && (
          <div className="border border-[#a16207] bg-[#241806] px-3 py-2 text-xs text-[#ffc46b]">
            {catalogError} Możesz tymczasowo wpisać identyfikator katalogowy ręcznie.
          </div>
        )}

        <label className="block">
          <span className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
            Szyna SN
          </span>
          <select
            value={busRef}
            onChange={(event) => setBusRef(event.target.value)}
            className="mt-1 w-full border border-[#2a4562] bg-[#08111d] px-3 py-2 text-sm text-white outline-none focus:border-[#04d6ff]"
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
          <span className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
            Rola pola
          </span>
          <select
            value={bayRole}
            onChange={(event) => setBayRole(event.target.value as SnBayRole)}
            className="mt-1 w-full border border-[#2a4562] bg-[#08111d] px-3 py-2 text-sm text-white outline-none focus:border-[#04d6ff]"
          >
            {BAY_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[10px] leading-snug text-[#7691b3]">
            {BAY_ROLE_OPTIONS.find((o) => o.value === bayRole)?.description ?? ''}
          </span>
        </label>

        <label className="block">
          <span className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
            Rodzaj aparatu głównego
          </span>
          <select
            value={apparatusKind}
            onChange={(event) => setApparatusKind(event.target.value as ApparatusKind)}
            className="mt-1 w-full border border-[#2a4562] bg-[#08111d] px-3 py-2 text-sm text-white outline-none focus:border-[#04d6ff]"
          >
            {APPARATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[10px] leading-snug text-[#7691b3]">
            {APPARATUS_OPTIONS.find((o) => o.value === apparatusKind)?.description ?? ''}
          </span>
        </label>

        <label className="block">
          <span className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
            Nazwa pola
          </span>
          <input
            value={fieldName}
            onChange={(event) => setFieldName(event.target.value)}
            className="mt-1 w-full border border-[#2a4562] bg-[#08111d] px-3 py-2 text-sm text-white outline-none focus:border-[#04d6ff]"
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
            <span className="font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
              Identyfikator aparatu z katalogu
            </span>
            <input
              value={catalogItemId}
              onChange={(event) => setCatalogItemId(event.target.value)}
              className="mt-1 w-full border border-[#2a4562] bg-[#08111d] px-3 py-2 font-mono-eng text-sm text-white outline-none focus:border-[#04d6ff]"
              placeholder="np. cb-24kv-1250a"
            />
          </label>
        )}

        <div className="border border-[#14532d] bg-[#061f18] px-3 py-3 text-xs text-[#9ff6c5]">
          <div className="font-mono-eng font-semibold uppercase tracking-[0.12em] text-[#17f7a8]">
            Następny krok
          </div>
          <div className="mt-1">
            Po zapisie tego pola magistrala SN będzie wyprowadzana z jego zacisku wyjściowego.
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-[#17314c] pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="border border-[#04d6ff] bg-[#075071] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a678d] disabled:opacity-50"
          >
            {isSubmitting ? 'Dodawanie…' : 'Dodaj pole SN'}
          </button>
          <button
            type="button"
            onClick={closeForm}
            className="border border-[#2a4562] bg-[#091521] px-4 py-2 text-sm text-[#b9d4ea] hover:border-[#4b6b89]"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddSnBayForm;
