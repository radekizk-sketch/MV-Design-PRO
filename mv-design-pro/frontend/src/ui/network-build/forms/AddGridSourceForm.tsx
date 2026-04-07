import { useCallback, useState } from 'react';

import { useAppStateStore } from '../../app-state';
import { useSelectionStore } from '../../selection';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { OperationFormShell } from './OperationFormShell';
import { applySelectionHint } from './applySelectionHint';

export function AddGridSourceForm() {
  const closeForm = useNetworkBuildCloseForm();
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selectElement = useSelectionStore((s) => s.selectElement);
  const centerSldOnElement = useSelectionStore((s) => s.centerSldOnElement);

  const [sourceName, setSourceName] = useState('GPZ');
  const [busName, setBusName] = useState('Szyna GPZ 15 kV');
  const [voltageKv, setVoltageKv] = useState('15');
  const [sk3Mva, setSk3Mva] = useState('250');
  const [rxRatio, setRxRatio] = useState('0.1');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!activeCaseId) {
      setError('Brak aktywnego przypadku obliczeniowego.');
      return;
    }

    const parsedVoltageKv = Number(voltageKv);
    const parsedSk3Mva = Number(sk3Mva);
    const parsedRxRatio = Number(rxRatio);

    if (!Number.isFinite(parsedVoltageKv) || parsedVoltageKv <= 0) {
      setError('Podaj dodatnie napięcie znamionowe GPZ.');
      return;
    }
    if (!Number.isFinite(parsedSk3Mva) || parsedSk3Mva <= 0) {
      setError('Podaj dodatnią moc zwarciową 3-fazową.');
      return;
    }
    if (!Number.isFinite(parsedRxRatio) || parsedRxRatio < 0) {
      setError('Podaj poprawny współczynnik R/X.');
      return;
    }

    setError(null);
    const response = await executeDomainOperation(activeCaseId, 'add_grid_source_sn', {
      source_name: sourceName.trim() || undefined,
      bus_name: busName.trim() || undefined,
      voltage_kv: parsedVoltageKv,
      sk3_mva: parsedSk3Mva,
      rx_ratio: parsedRxRatio,
    });

    if (!response || response.error) {
      setError(response?.error ?? 'Nie udało się utworzyć źródła GPZ.');
      return;
    }

    applySelectionHint({ response, selectElement, centerSldOnElement });
    closeForm();
  }, [
    activeCaseId,
    busName,
    centerSldOnElement,
    closeForm,
    executeDomainOperation,
    rxRatio,
    selectElement,
    sk3Mva,
    sourceName,
    voltageKv,
  ]);

  return (
    <div className="h-full" data-testid="add-grid-source-form">
      <OperationFormShell
        title="Źródło zasilania GPZ"
        description="GPZ jest kanonicznym początkiem modelu SN. To jawny kontrakt techniczny, nie szkic do późniejszego uzupełnienia."
        submitLabel="Dodaj GPZ"
        error={error}
        onCancel={closeForm}
        onSubmit={() => {
          void handleSubmit();
        }}
      >
        <div className="space-y-4">
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
            Na tym etapie GPZ jest jedynym dopuszczalnym wyjątkiem od katalog-first. Źródło musi
            mieć jednak jawne parametry napięciowe i zwarciowe.
          </div>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
              Nazwa źródła
            </span>
            <input
              type="text"
              value={sourceName}
              onChange={(event) => setSourceName(event.target.value)}
              className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
              Nazwa szyny GPZ
            </span>
            <input
              type="text"
              value={busName}
              onChange={(event) => setBusName(event.target.value)}
              className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Napięcie SN [kV]
              </span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={voltageKv}
                onChange={(event) => setVoltageKv(event.target.value)}
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                Sk3 [MVA]
              </span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={sk3Mva}
                onChange={(event) => setSk3Mva(event.target.value)}
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
                R/X
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={rxRatio}
                onChange={(event) => setRxRatio(event.target.value)}
                className="mt-2 w-full rounded border border-chrome-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>
      </OperationFormShell>
    </div>
  );
}

function useNetworkBuildCloseForm() {
  return useNetworkBuildStore((s) => s.closeOperationForm);
}

export default AddGridSourceForm;
