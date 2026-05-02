import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchLoadTypes } from '../../catalog/api';
import type { LoadCatalogType } from '../../catalog/types';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useActiveOperationContext, useNetworkBuildStore } from '../networkBuildStore';
import { useAppStateStore } from '../../app-state';
import {
  listNnBusOptions,
  listNnFeederOptions,
  resolveBusNnRef,
  resolveStationRef,
  stationLabel,
} from './enmResolvers';
import { normalizeCatalogBinding } from './catalogPayload';

type LoadKind = 'SKUPIONY' | 'ROZPROSZONY';
type ConnectionType = 'TROJFAZOWY' | 'JEDNOFAZOWY';

function kvarFromKwAndCosPhi(activePowerKw: number, cosPhi: number): number {
  if (activePowerKw <= 0 || cosPhi <= 0 || cosPhi > 1) {
    return 0;
  }

  const phi = Math.acos(cosPhi);
  return Number((activePowerKw * Math.tan(phi)).toFixed(2));
}

export function AddNnLoadForm() {
  const context = useActiveOperationContext() as Record<string, unknown> | undefined;
  const openOperationForm = useNetworkBuildStore((state) => state.openOperationForm);
  const closeForm = useNetworkBuildStore((state) => state.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);

  const stationRef = useMemo(
    () => resolveStationRef(context, snapshot),
    [context, snapshot],
  );
  const initialBusRef = useMemo(
    () => resolveBusNnRef(context, snapshot),
    [context, snapshot],
  );
  const busOptions = useMemo(() => listNnBusOptions(snapshot, stationRef), [snapshot, stationRef]);

  const [busNnRef, setBusNnRef] = useState(initialBusRef ?? busOptions[0]?.ref_id ?? '');
  const feederOptions = useMemo(
    () => listNnFeederOptions(snapshot, stationRef, busNnRef || initialBusRef || null),
    [snapshot, stationRef, busNnRef, initialBusRef],
  );
  const initialFeederRef = useMemo(
    () =>
      (typeof context?.feeder_ref === 'string' && context.feeder_ref.trim())
      || feederOptions[0]?.ref_id
      || '',
    [context, feederOptions],
  );

  const [feederRef, setFeederRef] = useState(initialFeederRef);
  const [loadName, setLoadName] = useState('Odbiór nN');
  const [loadKind, setLoadKind] = useState<LoadKind>('SKUPIONY');
  const [connectionType, setConnectionType] = useState<ConnectionType>('TROJFAZOWY');
  const [activePowerKw, setActivePowerKw] = useState<number | ''>('');
  const [cosPhi, setCosPhi] = useState<number | ''>(0.93);
  const [reactivePowerKvar, setReactivePowerKvar] = useState<number | ''>('');
  const [loadProfileRef, setLoadProfileRef] = useState('');
  const [catalogItems, setCatalogItems] = useState<LoadCatalogType[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setBusNnRef(initialBusRef ?? busOptions[0]?.ref_id ?? '');
  }, [initialBusRef, busOptions]);

  useEffect(() => {
    setFeederRef(initialFeederRef);
  }, [initialFeederRef]);

  useEffect(() => {
    let active = true;

    void fetchLoadTypes()
      .then((items) => {
        if (active) {
          setCatalogItems(items);
          setCatalogError(null);
        }
      })
      .catch((loadError) => {
        if (active) {
          setCatalogError(
            loadError instanceof Error
              ? loadError.message
              : 'Nie udało się pobrać katalogów obciążeń nN.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedCatalog = useMemo(
    () => catalogItems.find((item) => item.id === selectedCatalogId) ?? null,
    [catalogItems, selectedCatalogId],
  );

  useEffect(() => {
    if (!selectedCatalog) {
      return;
    }

    setActivePowerKw(selectedCatalog.p_kw);
    setReactivePowerKvar(selectedCatalog.q_kvar ?? '');
    setCosPhi(selectedCatalog.cos_phi ?? 0.93);
    setLoadProfileRef(selectedCatalog.profile_id ?? '');
  }, [selectedCatalog]);

  const selectedBus = useMemo(
    () => busOptions.find((bus) => bus.ref_id === busNnRef) ?? null,
    [busOptions, busNnRef],
  );

  const selectedFeeder = useMemo(
    () => feederOptions.find((feeder) => feeder.ref_id === feederRef) ?? null,
    [feederOptions, feederRef],
  );

  const effectiveReactivePower = useMemo(() => {
    if (typeof reactivePowerKvar === 'number' && Number.isFinite(reactivePowerKvar)) {
      return reactivePowerKvar;
    }
    if (typeof activePowerKw === 'number' && typeof cosPhi === 'number') {
      return kvarFromKwAndCosPhi(activePowerKw, cosPhi);
    }
    return null;
  }, [activePowerKw, cosPhi, reactivePowerKvar]);

  const handleCreateFeeder = useCallback(() => {
    openOperationForm('add_nn_outgoing_field', {
      station_ref: stationRef,
      bus_nn_ref: busNnRef || initialBusRef || null,
    });
  }, [busNnRef, initialBusRef, openOperationForm, stationRef]);

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }
    if (!busNnRef) {
      setError('Wybierz szynę nN.');
      return;
    }
    if (!feederRef) {
      setError('Wybierz odpływ nN dla nowego obciążenia.');
      return;
    }
    if (typeof activePowerKw !== 'number' || activePowerKw <= 0) {
      setError('Podaj dodatnią moc czynną odbioru.');
      return;
    }
    if (cosPhi !== '' && typeof cosPhi === 'number' && (cosPhi <= 0 || cosPhi > 1)) {
      setError('Współczynnik mocy cos φ musi być w zakresie (0, 1].');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await executeDomainOperation(activeCaseId, 'add_nn_load', {
        feeder_ref: feederRef,
        bus_nn_ref: busNnRef,
        load_name: loadName.trim() || undefined,
        load_kind: loadKind,
        connection_type: connectionType,
        active_power_kw: activePowerKw,
        reactive_power_kvar: effectiveReactivePower ?? undefined,
        cos_phi: typeof cosPhi === 'number' ? cosPhi : undefined,
        load_profile_ref: loadProfileRef.trim() || undefined,
        catalog_item_id: selectedCatalogId || undefined,
        catalog_ref: selectedCatalogId || undefined,
        catalog_binding: normalizeCatalogBinding(selectedCatalogId, 'OBCIAZENIE') ?? undefined,
      });
      if (!response) {
        const operationError = useSnapshotStore.getState().error;
        setError(operationError ?? 'Nie udało się dodać obciążenia nN.');
        return;
      }
      if (response.error) {
        setError(response.error);
        return;
      }
      closeForm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Nie udało się dodać obciążenia nN.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    activeCaseId,
    activePowerKw,
    busNnRef,
    closeForm,
    connectionType,
    cosPhi,
    effectiveReactivePower,
    executeDomainOperation,
    feederRef,
    loadKind,
    loadName,
    loadProfileRef,
    selectedCatalogId,
  ]);

  return (
    <div className="h-full overflow-y-auto bg-white" data-testid="add-nn-load-form">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">Nowe obciążenie nN</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Stacja: <span className="font-medium text-slate-700">{stationLabel(snapshot, stationRef)}</span>
        </p>
      </div>

      <div className="space-y-4 p-4">
        {(error || catalogError) && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error ?? catalogError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
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

          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">Odpływ nN</span>
            <select
              value={feederRef}
              onChange={(event) => setFeederRef(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— wybierz —</option>
              {feederOptions.map((feeder) => (
                <option key={feeder.ref_id} value={feeder.ref_id}>
                  {feeder.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {feederOptions.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
            <div className="font-semibold">Brak odpływu nN</div>
            <div className="mt-1">
              Aby dodać odbiór, najpierw utwórz odpływ na wybranej szynie nN.
            </div>
            <button
              type="button"
              onClick={handleCreateFeeder}
              className="mt-3 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              Dodaj odpływ nN
            </button>
          </div>
        )}

        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">Nazwa odbioru</span>
          <input
            value={loadName}
            onChange={(event) => setLoadName(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="np. Zespół pomp"
          />
        </label>

        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Profil katalogowy
          </div>
          <label className="mt-2 block">
            <span className="text-[11px] font-medium text-slate-700">Typ obciążenia z katalogu</span>
            <select
              value={selectedCatalogId}
              onChange={(event) => setSelectedCatalogId(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">— dane ręczne —</option>
              {catalogItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.p_kw} kW)
                </option>
              ))}
            </select>
          </label>
          {selectedCatalog && (
            <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              <div className="font-semibold">{selectedCatalog.name}</div>
              <div className="mt-1">
                P={selectedCatalog.p_kw} kW
                {typeof selectedCatalog.q_kvar === 'number' ? `, Q=${selectedCatalog.q_kvar} kvar` : ''}
                {typeof selectedCatalog.cos_phi === 'number' ? `, cos φ=${selectedCatalog.cos_phi}` : ''}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">Rodzaj obciążenia</span>
            <select
              value={loadKind}
              onChange={(event) => setLoadKind(event.target.value as LoadKind)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="SKUPIONY">Skupiony</option>
              <option value="ROZPROSZONY">Rozproszony</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">Przyłączenie</span>
            <select
              value={connectionType}
              onChange={(event) => setConnectionType(event.target.value as ConnectionType)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="TROJFAZOWY">Trójfazowy</option>
              <option value="JEDNOFAZOWY">Jednofazowy</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">Moc czynna [kW]</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={activePowerKw}
              onChange={(event) => setActivePowerKw(event.target.value ? Number(event.target.value) : '')}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">cos φ</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={cosPhi}
              onChange={(event) => setCosPhi(event.target.value ? Number(event.target.value) : '')}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-slate-700">Moc bierna [kvar]</span>
            <input
              type="number"
              step="0.1"
              value={reactivePowerKvar}
              onChange={(event) => setReactivePowerKvar(event.target.value ? Number(event.target.value) : '')}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder={effectiveReactivePower !== null ? String(effectiveReactivePower) : 'auto z cos φ'}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[11px] font-medium text-slate-700">Profil obciążenia</span>
          <input
            value={loadProfileRef}
            onChange={(event) => setLoadProfileRef(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="np. komunalny_mieszkaniowy"
          />
        </label>

        {(selectedBus || selectedFeeder) && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs text-emerald-800">
            <div className="font-semibold">Ścieżka przyłączenia</div>
            <div className="mt-1">
              {selectedBus ? selectedBus.name : '—'} → {selectedFeeder ? selectedFeeder.name : 'wybierz odpływ'}
            </div>
            {effectiveReactivePower !== null && (
              <div className="mt-1">
                Do solvera trafi Q = <span className="font-medium">{effectiveReactivePower}</span> kvar.
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-slate-200 pt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || feederOptions.length === 0}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Dodawanie…' : 'Dodaj obciążenie'}
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

export default AddNnLoadForm;
