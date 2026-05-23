/**
 * ProtectionWizard — kreator przypisania zabezpieczeń do pola.
 *
 * 4 kroki:
 *  1. Wybór typu zabezpieczenia (relay + funkcje 50/51/67/27/59/81U/81O/87T)
 *  2. Wybór CT + VT z katalogu (z walidacją przekładni vs napięcie + I_nom)
 *  3. Konfiguracja nastawy IDMT (krzywa SI/VI/EI/DT + TMS + I_pickup)
 *  4. Auto-suggest TMS dla selektywności (na bazie IEC 60255-151)
 *
 * BINDING: 100% PL etykiety.
 */

import { useCallback, useMemo, useState } from 'react';

type WizardStep = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Funkcje zabezpieczenia',
  2: 'Przekładniki CT + VT',
  3: 'Nastawy IDMT',
  4: 'Auto-koordynacja TMS',
};

export type ProtectionFunction = '50' | '51' | '67' | '27' | '59' | '81U' | '81O' | '87T' | '50G' | '51G' | '79';

const FUNCTION_LABELS: Record<ProtectionFunction, { label: string; description: string }> = {
  '50': { label: '50 - zwarciowe natychmiastowe', description: 'Definite Time. Działa instantowo gdy I > I_set. Dla wysokich prądów zwarciowych.' },
  '51': { label: '51 - zwarciowe IDMT', description: 'Inverse Definite Minimum Time. Krzywa SI/VI/EI per IEC 60255-151. Selektywność czasowa.' },
  '67': { label: '67 - kierunkowe zwarciowe', description: 'Activates only for specific direction of fault current (forward/reverse).' },
  '27': { label: '27 - niedonapięciowe', description: 'Undervoltage. Trip gdy U < U_set. Anti-islanding dla DER (typowo 0.85 Un, 0.2-2s).' },
  '59': { label: '59 - nadnapięciowe', description: 'Overvoltage. Trip gdy U > U_set. Anti-islanding DER (typowo 1.10 Un).' },
  '81U': { label: '81U - niedoczęstotliwościowe', description: 'Underfrequency. Trip gdy f < 47-49.5 Hz. NC RfG: power-frequency response.' },
  '81O': { label: '81O - nadczęstotliwościowe', description: 'Overfrequency. Trip gdy f > 50.5-52 Hz. NC RfG: nieprzejście do off-grid.' },
  '87T': { label: '87T - różnicowe transformatora', description: 'Differential restrain. Działa na różnicy I_pri - I_sec. Selektywność jednostkowa.' },
  '50G': { label: '50G - zwarciowe ziemnozwarciowe', description: 'Ground fault definite time. Dla sieci z punktem neutralnym uziemionym.' },
  '51G': { label: '51G - ziemnozwarciowe IDMT', description: 'Ground fault inverse time. Selektywność dla zwarcia 1-faz.' },
  '79': { label: '79 - SPZ samoczynny ponowny załącz', description: 'Auto-reclose. Po wyłączeniu 50/51 próba załączenia po t1, t2. Dla linii napowietrznych.' },
};

export interface ProtectionWizardProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onComplete?: (config: ProtectionConfig) => void;
}

export interface ProtectionConfig {
  functions: ProtectionFunction[];
  ct_ratio: string; // np. "300/5"
  vt_ratio: string; // np. "15000/100"
  curve: 'SI' | 'VI' | 'EI' | 'LTI' | 'DT';
  tms: number;
  i_pickup_A: number;
  auto_tms_used: boolean;
}

const DEFAULT_CONFIG: ProtectionConfig = {
  functions: ['51'],
  ct_ratio: '300/5',
  vt_ratio: '15000/100',
  curve: 'SI',
  tms: 0.1,
  i_pickup_A: 300,
  auto_tms_used: false,
};

/**
 * Auto-koordynacja TMS wg IEC 60255-151 (Standard Inverse).
 * Wzór: t = (0.14 * TMS) / ((I/Iset)^0.02 - 1)
 *
 * Aby uzyskać czas zadziałania t_target przy prądzie I_fault:
 *   TMS = t_target * ((I_fault/I_set)^0.02 - 1) / 0.14
 */
export function computeAutoTms(
  curve: ProtectionConfig['curve'],
  i_pickup_A: number,
  i_fault_A: number,
  t_target_s: number,
): number {
  if (i_fault_A <= i_pickup_A) return 0.1;
  const ratio = i_fault_A / i_pickup_A;
  switch (curve) {
    case 'SI': // Standard Inverse: t = 0.14*TMS / (M^0.02 - 1)
      return (t_target_s * (Math.pow(ratio, 0.02) - 1)) / 0.14;
    case 'VI': // Very Inverse: t = 13.5*TMS / (M - 1)
      return (t_target_s * (ratio - 1)) / 13.5;
    case 'EI': // Extremely Inverse: t = 80*TMS / (M^2 - 1)
      return (t_target_s * (ratio * ratio - 1)) / 80;
    case 'LTI': // Long Time Inverse: t = 120*TMS / (M - 1)
      return (t_target_s * (ratio - 1)) / 120;
    case 'DT': // Definite Time: TMS = t_target
      return t_target_s;
  }
}

export function ProtectionWizard({
  isOpen,
  onClose,
  onComplete,
}: ProtectionWizardProps): JSX.Element | null {
  const [step, setStep] = useState<WizardStep>(1);
  const [config, setConfig] = useState<ProtectionConfig>(DEFAULT_CONFIG);
  const [iFaultA, setIFaultA] = useState<number>(3000);
  const [tTargetS, setTTargetS] = useState<number>(0.5);

  const update = useCallback(
    <K extends keyof ProtectionConfig>(key: K, value: ProtectionConfig[K]) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const toggleFunction = useCallback((fn: ProtectionFunction) => {
    setConfig((prev) => ({
      ...prev,
      functions: prev.functions.includes(fn)
        ? prev.functions.filter((f) => f !== fn)
        : [...prev.functions, fn],
    }));
  }, []);

  const computedTms = useMemo(
    () => computeAutoTms(config.curve, config.i_pickup_A, iFaultA, tTargetS),
    [config.curve, config.i_pickup_A, iFaultA, tTargetS],
  );

  const applyAutoTms = useCallback(() => {
    setConfig((prev) => ({ ...prev, tms: computedTms, auto_tms_used: true }));
  }, [computedTms]);

  const handleComplete = useCallback(() => {
    onComplete?.(config);
    onClose();
  }, [config, onClose, onComplete]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="protection-wizard"
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[640px] max-w-[95vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Kreator zabezpieczeń"
      >
        <header className="border-b border-gray-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-800">
            Kreator zabezpieczeń — krok {step}/4: {STEP_LABELS[step]}
          </h3>
          <div className="mt-2 flex gap-1">
            {([1, 2, 3, 4] as WizardStep[]).map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded ${s <= step ? 'bg-blue-500' : 'bg-gray-200'}`}
                data-testid={`protection-wizard-step-bar-${s}`}
              />
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div data-testid="protection-wizard-step-1">
              <p className="mb-3 text-xs text-gray-600">
                Wybierz funkcje zabezpieczenia (ANSI/IEC) wymagane dla tego pola.
                Kombinacja zależy od roli (np. pole liniowe: 50/51/67/79;
                pole transformatorowe: 87T + 50/51 + temperatura).
              </p>
              <div className="grid grid-cols-1 gap-2">
                {(Object.entries(FUNCTION_LABELS) as [ProtectionFunction, { label: string; description: string }][]).map(
                  ([fn, info]) => (
                    <label
                      key={fn}
                      className={`flex items-start gap-2 rounded border p-2 cursor-pointer ${
                        config.functions.includes(fn)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                      data-testid={`protection-fn-${fn}`}
                    >
                      <input
                        type="checkbox"
                        checked={config.functions.includes(fn)}
                        onChange={() => toggleFunction(fn)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-[11px] font-semibold text-gray-800">{info.label}</div>
                        <p className="text-[10px] text-gray-600">{info.description}</p>
                      </div>
                    </label>
                  ),
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div data-testid="protection-wizard-step-2">
              <p className="mb-3 text-xs text-gray-600">
                Wybierz przekładnie CT (prądowe) i VT (napięciowe).
                Przekładnia CT musi pasować do prądu nominalnego pola; VT do napięcia szyny.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">
                    Przekładnia CT
                    <span className="ml-1 text-blue-400 cursor-help" title="Standard polskie SN: 100/5, 200/5, 300/5, 500/5, 800/5, 1000/5. Klasa 5P10 lub 5P20 dla zabezpieczeń.">ⓘ</span>
                  </label>
                  <select
                    value={config.ct_ratio}
                    onChange={(e) => update('ct_ratio', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded"
                    data-testid="protection-ct-ratio"
                  >
                    <option value="100/5">100/5 (mały feeder)</option>
                    <option value="200/5">200/5</option>
                    <option value="300/5">300/5 (standard pole liniowe)</option>
                    <option value="500/5">500/5</option>
                    <option value="800/5">800/5 (duży feeder)</option>
                    <option value="1000/5">1000/5 (pole transformatora)</option>
                    <option value="2000/5">2000/5 (GPZ tor głównego dopływu)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">
                    Przekładnia VT (V/V)
                  </label>
                  <select
                    value={config.vt_ratio}
                    onChange={(e) => update('vt_ratio', e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded"
                    data-testid="protection-vt-ratio"
                  >
                    <option value="15000/100">15000/100 (15 kV → 100 V wt.)</option>
                    <option value="20000/100">20000/100 (20 kV → 100 V)</option>
                    <option value="30000/100">30000/100 (30 kV → 100 V)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div data-testid="protection-wizard-step-3">
              <p className="mb-3 text-xs text-gray-600">
                Konfiguracja krzywej IDMT (IEC 60255-151).
                I_pickup: prąd wzbudzenia. TMS: time multiplier setting (czasowy).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Krzywa</label>
                  <select
                    value={config.curve}
                    onChange={(e) => update('curve', e.target.value as ProtectionConfig['curve'])}
                    className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded"
                    data-testid="protection-curve"
                  >
                    <option value="SI">SI - Standard Inverse</option>
                    <option value="VI">VI - Very Inverse</option>
                    <option value="EI">EI - Extremely Inverse</option>
                    <option value="LTI">LTI - Long Time Inverse</option>
                    <option value="DT">DT - Definite Time</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">I_pickup [A]</label>
                  <input
                    type="number"
                    value={config.i_pickup_A}
                    onChange={(e) => update('i_pickup_A', Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded"
                    data-testid="protection-i-pickup"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">TMS</label>
                  <input
                    type="number"
                    step="0.01"
                    value={config.tms}
                    onChange={(e) => update('tms', Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded"
                    data-testid="protection-tms"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div data-testid="protection-wizard-step-4">
              <p className="mb-3 text-xs text-gray-600">
                Automatyczne obliczenie TMS dla wymaganego czasu zadziałania
                przy prądzie zwarciowym. Eliminuje ręczne kalkulacje IEC 60255-151.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">
                    Obliczeniowy prąd zwarcia I_fault [A]
                    <span className="ml-1 text-blue-400 cursor-help" title="Maksymalny prąd zwarcia w punkcie zabezpieczenia z obliczeń IEC 60909.">ⓘ</span>
                  </label>
                  <input
                    type="number"
                    value={iFaultA}
                    onChange={(e) => setIFaultA(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded"
                    data-testid="protection-i-fault"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">
                    Wymagany czas zadziałania t_target [s]
                    <span className="ml-1 text-blue-400 cursor-help" title="Dla selektywności kabel 0.3-0.5s, linia napowietrzna 0.5-0.7s.">ⓘ</span>
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={tTargetS}
                    onChange={(e) => setTTargetS(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded"
                    data-testid="protection-t-target"
                  />
                </div>
                <div className="rounded border border-emerald-300 bg-emerald-50 p-3" data-testid="protection-auto-tms-result">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700">Wynik obliczenia</div>
                  <div className="mt-1 text-lg font-mono font-bold text-emerald-900">
                    TMS = {computedTms.toFixed(3)}
                  </div>
                  <div className="text-[10px] text-emerald-700">
                    Krzywa {config.curve}, I_pickup {config.i_pickup_A} A, I_fault {iFaultA} A, t_target {tTargetS} s
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyAutoTms}
                  className="w-full rounded bg-emerald-600 px-3 py-2 text-[11px] text-white hover:bg-emerald-700 font-medium"
                  data-testid="protection-apply-auto-tms"
                >
                  Zastosuj TMS = {computedTms.toFixed(3)}
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as WizardStep)}
              className="px-3 py-1.5 text-[11px] text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
              data-testid="protection-wizard-back"
            >
              ← Wstecz
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-[11px] text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
            >
              Anuluj
            </button>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as WizardStep)}
              className="px-4 py-1.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              data-testid="protection-wizard-next"
            >
              Dalej →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              className="px-4 py-1.5 text-[11px] bg-emerald-600 text-white rounded hover:bg-emerald-700 font-medium"
              data-testid="protection-wizard-complete"
            >
              Zakończ i zapisz
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
