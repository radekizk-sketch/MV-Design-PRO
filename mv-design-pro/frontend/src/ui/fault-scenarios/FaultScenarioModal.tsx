/**
 * Fault Scenario Edit Modal — PR-24 + PR-25 (v2)
 * All labels in Polish. No project codenames.
 *
 * PR-25: Added fault mode (METALLIC/IMPEDANCE), Zf fields,
 * location type selector (NODE/BRANCH_POINT), alpha field.
 */

import { useState, useCallback, useEffect } from 'react';
import { useFaultScenariosStore } from './store';
import {
  FAULT_TYPE_LABELS,
  FAULT_MODE_LABELS,
  LOCATION_TYPE_LABELS,
  type FaultTypeValue,
  type FaultModeValue,
  type LocationType,
  type CreateFaultScenarioRequest,
  type UpdateFaultScenarioRequest,
} from './types';
import { SekcjaWspolczynnikaC } from './SekcjaWspolczynnikaC';
import {
  DOMYSLNE_POLA_C,
  konfiguracjaZwarciaZPol,
  polaCZKonfiguracji,
  type PolaWspolczynnikaC,
  poleCzasuWylaczenia,
} from './wspolczynnikC';

const FAULT_TYPES = Object.keys(FAULT_TYPE_LABELS) as FaultTypeValue[];
const FAULT_MODES: FaultModeValue[] = ['METALLIC', 'IMPEDANCE'];
const LOCATION_TYPES: LocationType[] = ['NODE', 'BRANCH_POINT'];

export function FaultScenarioModal() {
  const {
    studyCaseId, scenarios, isModalOpen, editingScenarioId, error,
    createScenario, updateScenario, closeModal,
  } = useFaultScenariosStore();

  const editingScenario = editingScenarioId
    ? scenarios.find((s) => s.scenario_id === editingScenarioId) ?? null
    : null;

  const [name, setName] = useState('');
  const [faultType, setFaultType] = useState<FaultTypeValue>('SC_3F');
  const [elementRef, setElementRef] = useState('');
  const [locationType, setLocationType] = useState<LocationType>('NODE');
  const [alpha, setAlpha] = useState('');
  const [faultMode, setFaultMode] = useState<FaultModeValue>('METALLIC');
  const [rOhm, setROhm] = useState('');
  const [xOhm, setXOhm] = useState('');
  // Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: scenariusz jest jedynym nośnikiem c i t_k —
  // bez `config.scenariusz` backend odmawia utworzenia scenariusza (422).
  const [polaC, setPolaC] = useState<PolaWspolczynnikaC>(DOMYSLNE_POLA_C);
  const [czasTk, setCzasTk] = useState('1');
  // Karta SC-IB-ITH-ZRODLA: t_b scenariusza — puste = brak danej (nazwane założenie biegu).
  const [czasTb, setCzasTb] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (editingScenario) {
      setName(editingScenario.name);
      setFaultType(editingScenario.fault_type);
      setElementRef(editingScenario.location.element_ref);
      setLocationType(editingScenario.location.location_type);
      setAlpha(editingScenario.location.position != null ? String(editingScenario.location.position) : '');
      setFaultMode(editingScenario.fault_mode ?? 'METALLIC');
      setROhm(editingScenario.fault_impedance != null ? String(editingScenario.fault_impedance.r_f_ohm) : '');
      setXOhm(editingScenario.fault_impedance != null ? String(editingScenario.fault_impedance.x_f_ohm) : '');
      setPolaC(polaCZKonfiguracji(editingScenario.config));
      setCzasTk(String(editingScenario.config?.thermal_time_seconds ?? 1));
      setCzasTb(poleCzasuWylaczenia(editingScenario.config));
    } else {
      setName('');
      setFaultType('SC_3F');
      setElementRef('');
      setLocationType('NODE');
      setAlpha('');
      setFaultMode('METALLIC');
      setROhm('');
      setXOhm('');
      setPolaC(DOMYSLNE_POLA_C);
      setCzasTk('1');
      setCzasTb('');
    }
    setValidationError(null);
  }, [editingScenario, isModalOpen]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) { setValidationError('Nazwa scenariusza jest wymagana'); return; }
    if (!elementRef.trim()) { setValidationError('Identyfikator elementu jest wymagany'); return; }

    if (locationType === 'BRANCH_POINT') {
      const alphaNum = parseFloat(alpha);
      if (isNaN(alphaNum) || alphaNum < 0 || alphaNum > 1) {
        setValidationError('Parametr alpha musi być liczbą z zakresu [0, 1]');
        return;
      }
    }

    if (faultMode === 'IMPEDANCE') {
      const r = parseFloat(rOhm);
      const x = parseFloat(xOhm);
      if (isNaN(r) || isNaN(x)) {
        setValidationError('Impedancja przejścia Z_f (R_f i X_f) jest wymagana dla trybu impedancyjnego');
        return;
      }
    }

    const czas = Number(czasTk.replace(',', '.'));
    if (!Number.isFinite(czas) || czas <= 0) {
      setValidationError('Czas trwania zwarcia t_k musi być liczbą dodatnią [s]');
      return;
    }
    const konfiguracja = konfiguracjaZwarciaZPol(
      polaC,
      czas,
      editingScenario?.config?.include_branch_contributions ?? false,
      czasTb,
    );
    if (!konfiguracja.ok) {
      setValidationError(konfiguracja.blad);
      return;
    }

    setValidationError(null);

    const position = locationType === 'BRANCH_POINT' ? parseFloat(alpha) : null;
    const faultImpedance = faultMode === 'IMPEDANCE'
      ? { r_f_ohm: parseFloat(rOhm), x_f_ohm: parseFloat(xOhm) }
      : undefined;

    try {
      if (editingScenarioId) {
        const updateData: UpdateFaultScenarioRequest = {
          name: name.trim(),
          fault_type: faultType,
          location: { element_ref: elementRef.trim(), location_type: locationType, position },
          config: konfiguracja.config,
          fault_mode: faultMode,
          fault_impedance: faultImpedance ?? null,
        };
        await updateScenario(editingScenarioId, updateData);
      } else if (studyCaseId) {
        const createData: CreateFaultScenarioRequest = {
          name: name.trim(),
          fault_type: faultType,
          location: { element_ref: elementRef.trim(), location_type: locationType, position },
          config: konfiguracja.config,
          fault_mode: faultMode,
          fault_impedance: faultImpedance,
        };
        await createScenario(studyCaseId, createData);
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Wystąpił błąd podczas zapisu scenariusza');
    }
  }, [name, faultType, elementRef, locationType, alpha, faultMode, rOhm, xOhm, polaC, czasTk, czasTb, editingScenario, editingScenarioId, studyCaseId, createScenario, updateScenario]);

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" data-testid="fault-scenario-modal">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-800">
            {editingScenarioId ? 'Edytuj scenariusz zwarcia' : 'Nowy scenariusz zwarcia'}
          </h3>
          <button onClick={closeModal} className="text-slate-400 hover:text-slate-600" data-testid="fault-scenario-modal-close">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Nazwa */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nazwa</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="np. Zwarcie na szynie głównej"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400"
              data-testid="fault-scenario-name-input" autoFocus
            />
          </div>

          {/* Typ analizy */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Typ analizy</label>
            <select
              value={faultType} onChange={(e) => setFaultType(e.target.value as FaultTypeValue)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400"
              data-testid="fault-scenario-type-select"
            >
              {FAULT_TYPES.map((ft) => (<option key={ft} value={ft}>{FAULT_TYPE_LABELS[ft]}</option>))}
            </select>
          </div>

          {/* Tryb zwarcia (v2) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tryb zwarcia</label>
            <select
              value={faultMode} onChange={(e) => setFaultMode(e.target.value as FaultModeValue)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400"
              data-testid="fault-scenario-mode-select"
            >
              {FAULT_MODES.map((fm) => (<option key={fm} value={fm}>{FAULT_MODE_LABELS[fm]}</option>))}
            </select>
          </div>

          {/* Impedancja zwarcia Zf (v2) — aktywne tylko dla IMPEDANCE */}
          {faultMode === 'IMPEDANCE' && (
            <div className="p-3 rounded border border-amber-200 bg-amber-50">
              <label className="block text-xs font-medium text-amber-800 mb-2">Impedancja przejścia Z_f w miejscu zwarcia</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-amber-700 mb-0.5">R_f [Ω]</label>
                  <input
                    type="number" step="any" min="0" value={rOhm} onChange={(e) => setROhm(e.target.value)}
                    placeholder="0.0"
                    className="w-full px-2 py-1.5 text-sm border border-amber-300 rounded focus:outline-none focus:border-amber-500"
                    data-testid="fault-scenario-r-ohm-input"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-amber-700 mb-0.5">X_f [Ω]</label>
                  <input
                    type="number" step="any" min="0" value={xOhm} onChange={(e) => setXOhm(e.target.value)}
                    placeholder="0.0"
                    className="w-full px-2 py-1.5 text-sm border border-amber-300 rounded focus:outline-none focus:border-amber-500"
                    data-testid="fault-scenario-x-ohm-input"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Lokalizacja zwarcia */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Typ lokalizacji</label>
            <select
              value={locationType} onChange={(e) => setLocationType(e.target.value as LocationType)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400"
              data-testid="fault-scenario-location-type-select"
            >
              {LOCATION_TYPES.map((lt) => (<option key={lt} value={lt}>{LOCATION_TYPE_LABELS[lt]}</option>))}
            </select>
          </div>

          {/* Identyfikator elementu */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {locationType === 'BRANCH_POINT' ? 'Identyfikator gałęzi' : 'Identyfikator węzła'}
            </label>
            <input
              type="text" value={elementRef} onChange={(e) => setElementRef(e.target.value)}
              placeholder={locationType === 'BRANCH_POINT' ? 'np. line-1' : 'np. bus-1'}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400"
              data-testid="fault-scenario-node-input"
            />
          </div>

          {/* Alpha (BRANCH_POINT only) */}
          {locationType === 'BRANCH_POINT' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Pozycja na odcinku (alpha: 0...1)
              </label>
              <input
                type="number" step="0.01" min="0" max="1" value={alpha}
                onChange={(e) => setAlpha(e.target.value)}
                placeholder="0.5"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400"
                data-testid="fault-scenario-alpha-input"
              />
              <p className="mt-1 text-xs text-slate-400">
                0 = poczatek odcinka, 1 = koniec odcinka
              </p>
            </div>
          )}

          {/* Współczynnik napięciowy c i czas t_k — nośnik: scenariusz zwarciowy */}
          <SekcjaWspolczynnikaC
            pola={polaC}
            onZmiana={setPolaC}
            testIdPrefix="fault-scenario"
            klasaPola="block text-xs text-slate-600 mb-1"
          />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Czas trwania zwarcia t_k [s]
            </label>
            <input
              type="number" step="0.1" min="0" value={czasTk}
              onChange={(e) => setCzasTk(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400"
              data-testid="fault-scenario-tk-input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="fault-scenario-tb-input">
              Czas wyłączenia t_b [s]
            </label>
            <input
              id="fault-scenario-tb-input"
              type="number" step="0.01" min="0" value={czasTb}
              placeholder="np. 0,1 — zabezpieczenie + czas własny wyłącznika"
              onChange={(e) => setCzasTb(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:border-blue-400"
              data-testid="fault-scenario-tb-input"
            />
            <p className="mt-1 text-xs text-slate-500">
              Puste pole = t_b w każdym punkcie zwarcia z pól przy jego szynie (nastawy + czas własny wyłącznika), a bez nich wartość robocza z oznaczeniem w wynikach.
            </p>
          </div>

          {/* Errors */}
          {validationError && (
            <div className="p-2 text-xs rounded bg-rose-50 text-rose-700 border border-rose-200" data-testid="fault-scenario-validation-error">
              {validationError}
            </div>
          )}
          {error && (
            <div className="p-2 text-xs rounded bg-rose-50 text-rose-700 border border-rose-200" data-testid="fault-scenario-api-error">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200">
          <button onClick={closeModal} className="px-4 py-2 text-sm border border-slate-300 rounded text-slate-600 hover:bg-slate-50" data-testid="fault-scenario-cancel-btn">
            Anuluj
          </button>
          <button onClick={handleSubmit} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700" data-testid="fault-scenario-save-btn">
            {editingScenarioId ? 'Zapisz zmiany' : 'Utwórz scenariusz'}
          </button>
        </div>
      </div>
    </div>
  );
}
