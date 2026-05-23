/**
 * PowerFlowRunDialog — dialog konfiguracji obliczeń rozpływu mocy.
 *
 * Pozwala wybrać algorytm (NR/GS/FD), tolerancję, max iteracji, flat start.
 * Po Run → callback z parametrami solver.
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useState } from 'react';

export type PowerFlowAlgorithm = 'NEWTON_RAPHSON' | 'GAUSS_SEIDEL' | 'FAST_DECOUPLED';

const ALGORITHM_LABELS: Record<PowerFlowAlgorithm, { label: string; description: string }> = {
  NEWTON_RAPHSON: {
    label: 'Newton-Raphson (NR)',
    description: 'Domyślny dla sieci SN. Kwadratowa zbieżność (3-5 iteracji). Wymaga macierzy Jacobi - drogi dla bardzo dużych sieci, ale stabilny.',
  },
  GAUSS_SEIDEL: {
    label: 'Gauss-Seidel (GS)',
    description: 'Liniowa zbieżność (50-200 iteracji). Tani na iterację, ale wolny. Dobry jako warm-start dla NR. Zalecany dla sieci nN.',
  },
  FAST_DECOUPLED: {
    label: 'Fast Decoupled (FD)',
    description: 'Przybliżona NR dla sieci wysokonapięciowych z dominującą reaktancją. Bardzo szybki dla sieci 110+ kV. Mniej stabilny dla SN z dużym R/X.',
  },
};

export interface PowerFlowRunOptions {
  algorithm: PowerFlowAlgorithm;
  tolerance: number;
  maxIterations: number;
  flatStart: boolean;
  enforceQLimits: boolean;
}

export const DEFAULT_RUN_OPTIONS: PowerFlowRunOptions = {
  algorithm: 'NEWTON_RAPHSON',
  tolerance: 1e-6,
  maxIterations: 30,
  flatStart: false,
  enforceQLimits: true,
};

export interface PowerFlowRunDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onRun?: (options: PowerFlowRunOptions) => void | Promise<void>;
  readonly initialOptions?: Partial<PowerFlowRunOptions>;
}

export function PowerFlowRunDialog({
  isOpen,
  onClose,
  onRun,
  initialOptions,
}: PowerFlowRunDialogProps): JSX.Element | null {
  const [options, setOptions] = useState<PowerFlowRunOptions>({
    ...DEFAULT_RUN_OPTIONS,
    ...initialOptions,
  });
  const [running, setRunning] = useState(false);

  const update = useCallback(
    <K extends keyof PowerFlowRunOptions>(key: K, value: PowerFlowRunOptions[K]) => {
      setOptions((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      await onRun?.(options);
    } finally {
      setRunning(false);
    }
  }, [options, onRun]);

  if (!isOpen) return null;

  const inputClass = 'w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded focus:outline-none focus:border-blue-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="power-flow-run-dialog"
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[560px] max-w-[95vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Uruchom rozpływ mocy"
      >
        <header className="border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">Uruchom rozpływ mocy</h3>
          <p className="text-[10px] text-gray-500">
            Wybierz algorytm i parametry solver. Zmiana parametrów wpływa na zbieżność i precyzję.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Algorithm */}
          <fieldset>
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Algorytm solver
            </legend>
            <div className="space-y-2">
              {(Object.entries(ALGORITHM_LABELS) as [PowerFlowAlgorithm, { label: string; description: string }][]).map(
                ([key, info]) => (
                  <label
                    key={key}
                    className={`block cursor-pointer rounded border p-3 ${
                      options.algorithm === key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    data-testid={`pf-algorithm-${key}`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="pf-algorithm"
                        value={key}
                        checked={options.algorithm === key}
                        onChange={() => update('algorithm', key)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-[11px] font-semibold text-gray-800">{info.label}</div>
                        <p className="mt-0.5 text-[10px] text-gray-600">{info.description}</p>
                      </div>
                    </div>
                  </label>
                ),
              )}
            </div>
          </fieldset>

          {/* Parameters */}
          <fieldset>
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Parametry zbieżności
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Tolerancja
                  <span className="ml-1 text-blue-400 cursor-help" title="Maksymalny błąd residualny dla zatrzymania iteracji. Default 1e-6 = 1 µpu (PSE precision).">ⓘ</span>
                </label>
                <select
                  value={options.tolerance}
                  onChange={(e) => update('tolerance', Number(e.target.value))}
                  className={inputClass}
                  data-testid="pf-tolerance"
                >
                  <option value={1e-4}>1×10⁻⁴ (szybko, mniej dokładne)</option>
                  <option value={1e-5}>1×10⁻⁵ (standard nN)</option>
                  <option value={1e-6}>1×10⁻⁶ (standard SN - PSE)</option>
                  <option value={1e-7}>1×10⁻⁷ (high precision)</option>
                  <option value={1e-8}>1×10⁻⁸ (research)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Max iteracji
                  <span className="ml-1 text-blue-400 cursor-help" title="Limit iteracji solver. NR: 30 wystarcza dla większości. GS: 200-500. FD: 30.">ⓘ</span>
                </label>
                <input
                  type="number"
                  min={5}
                  max={500}
                  value={options.maxIterations}
                  onChange={(e) => update('maxIterations', Number(e.target.value))}
                  className={inputClass}
                  data-testid="pf-max-iterations"
                />
              </div>
            </div>
          </fieldset>

          {/* Options */}
          <fieldset>
            <legend className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Opcje
            </legend>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.flatStart}
                  onChange={(e) => update('flatStart', e.target.checked)}
                  data-testid="pf-flat-start"
                />
                <span>Flat start (V=1.0 pu, δ=0°)</span>
                <span className="text-blue-400 cursor-help" title="Inicjalizacja wartościami nominalnymi zamiast poprzedniego stanu. Wolniejsze ale stabilne dla zmienionego modelu.">ⓘ</span>
              </label>
              <label className="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.enforceQLimits}
                  onChange={(e) => update('enforceQLimits', e.target.checked)}
                  data-testid="pf-enforce-q-limits"
                />
                <span>Wymuszaj limity mocy biernej generatorów (Qmin/Qmax)</span>
                <span className="text-blue-400 cursor-help" title="Generatory osiągające limit Q przechodzą z PV na PQ. Realistyczne dla DER z saturacją.">ⓘ</span>
              </label>
            </div>
          </fieldset>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
            data-testid="pf-cancel"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="px-4 py-1.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:bg-gray-300"
            data-testid="pf-run"
          >
            {running ? 'Trwa obliczenie...' : 'Uruchom obliczenia'}
          </button>
        </footer>
      </div>
    </div>
  );
}
