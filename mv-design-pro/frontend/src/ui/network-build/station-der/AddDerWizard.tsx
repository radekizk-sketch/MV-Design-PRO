/**
 * AddDerWizard — guided 5-step flow dodawania DER (PV/BESS/FW) ze stacji E-13.
 *
 * Przepływ:
 *  Krok 1: Wybór wariantu przyłączenia (SN / nN / dedicated_transformer).
 *  Krok 2: Wybór punktu przyłączenia (existing/new) — kontekstowy katalog.
 *  Krok 3: Wybór urządzenia z katalogu (falownik PV / PCS BESS / turbina FW).
 *  Krok 4: Wybór profilu NC RfG + krzywych LVRT/HVRT (zgodnie z operatorem).
 *  Krok 5: Review & Create — lista obiektów + przycisk "Utwórz".
 *
 * Zasady:
 *  - Każdy wybór ma catalog_ref. Custom value tylko jako pozycja katalogowa
 *    użytkownika (Faza H — out of MVP wizard, ale reguła zachowana).
 *  - Anulowanie w dowolnym kroku usuwa szkic — nie ma pół-obiektów.
 *  - Po Create: attachDer w useStationDerStore + zamknięcie modal'a.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { notify } from '../../notifications/store';
import {
  BESS_BATTERY_CATALOG,
  BESS_PCS_CATALOG,
  HVRT_CURVE_CATALOG,
  LV_VOLTAGE_LEVEL_CATALOG,
  LVRT_CURVE_CATALOG,
  NC_RFG_PROFILE_CATALOG,
  PV_INVERTER_CATALOG,
  WIND_TURBINE_CATALOG,
  selectConnectionVariantsForKind,
  selectHvrtCurvesForProfile,
  selectLvrtCurvesForProfile,
} from './catalogs';
import { useStationDerStore } from './store';
import type { ConnectionSide, DerKindUnified } from './types';

export interface AddDerWizardProps {
  readonly isOpen: boolean;
  readonly stationId: string | null;
  readonly stationName: string;
  readonly derKind: DerKindUnified;
  readonly projectId: string;
  readonly onClose: () => void;
  /** Override zegara dla testów (deterministyczne created_at). */
  readonly nowIso?: string;
}

type StepId = 'variant' | 'point' | 'device' | 'profile' | 'review';

const STEP_LABELS: Record<StepId, string> = {
  variant: '1 · Wariant przyłączenia',
  point: '2 · Punkt przyłączenia',
  device: '3 · Urządzenie z katalogu',
  profile: '4 · Profil NC RfG i krzywe',
  review: '5 · Podsumowanie',
};

const STEPS: readonly StepId[] = ['variant', 'point', 'device', 'profile', 'review'];

const DER_KIND_LABELS: Record<DerKindUnified, string> = {
  PV: 'PV / FV',
  BESS: 'BESS (magazyn energii)',
  FW: 'Farma wiatrowa',
};

interface WizardSelections {
  connectionSide: ConnectionSide | null;
  voltageLevelRef: string | null;
  pccLabel: string;
  bayName: string;
  deviceCatalogRef: string | null;
  batteryCatalogRef: string | null;
  ncRfgProfileRef: string | null;
  lvrtCurveRef: string | null;
  hvrtCurveRef: string | null;
  derName: string;
}

const EMPTY_SELECTIONS: WizardSelections = {
  connectionSide: null,
  voltageLevelRef: null,
  pccLabel: '',
  bayName: '',
  deviceCatalogRef: null,
  batteryCatalogRef: null,
  ncRfgProfileRef: null,
  lvrtCurveRef: null,
  hvrtCurveRef: null,
  derName: '',
};

export function AddDerWizard(props: AddDerWizardProps): JSX.Element | null {
  const { isOpen, stationId, stationName, derKind, projectId, onClose, nowIso } = props;
  const attachDer = useStationDerStore((state) => state.attachDer);
  const [step, setStep] = useState<StepId>('variant');
  const [selections, setSelections] = useState<WizardSelections>(EMPTY_SELECTIONS);

  // Reset stanu kreatora przy każdym otwarciu.
  useEffect(() => {
    if (isOpen) {
      setStep('variant');
      setSelections({ ...EMPTY_SELECTIONS });
    }
  }, [isOpen, derKind]);

  const variants = useMemo(() => selectConnectionVariantsForKind(derKind), [derKind]);

  const lvrtCurves = useMemo(() =>
    selections.ncRfgProfileRef ? selectLvrtCurvesForProfile(selections.ncRfgProfileRef) : [],
  [selections.ncRfgProfileRef]);

  const hvrtCurves = useMemo(() =>
    selections.ncRfgProfileRef ? selectHvrtCurvesForProfile(selections.ncRfgProfileRef) : [],
  [selections.ncRfgProfileRef]);

  const deviceCatalog = useMemo(() => {
    if (derKind === 'PV') return PV_INVERTER_CATALOG;
    if (derKind === 'BESS') return BESS_PCS_CATALOG;
    return WIND_TURBINE_CATALOG;
  }, [derKind]);

  const canGoNext = useMemo(() => {
    switch (step) {
      case 'variant':
        return selections.connectionSide !== null;
      case 'point':
        return (
          selections.derName.trim().length > 0 &&
          selections.pccLabel.trim().length > 0 &&
          (selections.connectionSide !== 'nN' || selections.voltageLevelRef !== null) &&
          (selections.connectionSide !== 'SN' || selections.bayName.trim().length > 0)
        );
      case 'device':
        return selections.deviceCatalogRef !== null
          && (derKind !== 'BESS' || selections.batteryCatalogRef !== null);
      case 'profile':
        return (
          selections.ncRfgProfileRef !== null &&
          selections.lvrtCurveRef !== null &&
          selections.hvrtCurveRef !== null
        );
      case 'review':
        return true;
      default:
        return false;
    }
  }, [step, selections, derKind]);

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
    }
  }, [step]);

  const goPrev = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) {
      setStep(STEPS[idx - 1]);
    }
  }, [step]);

  const handleCreate = useCallback(() => {
    if (!stationId || !selections.connectionSide) return;
    const id = `der_${derKind.toLowerCase()}_${Date.now().toString(36)}`;
    const pccRef = `pcc_${stationId}_${selections.pccLabel.trim()}`;
    const device = deviceCatalog.find((d) => d.id === selections.deviceCatalogRef);
    const nominalPowerKw = device && 'nominal_power_kw' in device ? device.nominal_power_kw : null;

    attachDer({
      id,
      project_id: projectId,
      station_id: stationId,
      der_kind: derKind,
      name: selections.derName,
      connection_side: selections.connectionSide,
      pcc_ref: pccRef,
      bay_ref:
        selections.connectionSide === 'SN' ? `bay_${stationId}_${selections.bayName}` : null,
      lv_busbar_ref:
        selections.connectionSide === 'nN' ? `busbar_${stationId}_main` : null,
      transformer_ref:
        selections.connectionSide === 'dedicated_transformer'
          ? `tr_dedicated_${id}`
          : null,
      voltage_level_ref: selections.voltageLevelRef,
      nominal_power_kw: nominalPowerKw,
      catalogs: {
        device_catalog_ref: selections.deviceCatalogRef,
        battery_catalog_ref: selections.batteryCatalogRef,
      },
      profiles: {
        nc_rfg_profile_ref: selections.ncRfgProfileRef,
        lvrt_curve_ref: selections.lvrtCurveRef,
        hvrt_curve_ref: selections.hvrtCurveRef,
      },
      created_at: nowIso,
    });

    notify(
      `Utworzono ${DER_KIND_LABELS[derKind]} "${selections.derName}" w stacji "${stationName}".`,
      'success',
    );
    onClose();
  }, [
    attachDer,
    deviceCatalog,
    derKind,
    nowIso,
    onClose,
    projectId,
    selections,
    stationId,
    stationName,
  ]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="add-der-wizard"
      data-der-kind={derKind}
      data-current-step={step}
      role="dialog"
      aria-modal="true"
      aria-label={`Dodaj ${DER_KIND_LABELS[derKind]}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="w-[760px] max-w-[95vw] rounded-lg border border-scada-border bg-scada-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-scada-border bg-scada-surface px-5 py-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-scada-muted">
              Dodaj źródło / magazyn
            </div>
            <h3 className="text-sm font-semibold text-scada-text">
              {DER_KIND_LABELS[derKind]} → {stationName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="add-der-wizard-close"
            className="rounded p-1 text-scada-muted hover:bg-scada-hover-nav hover:text-scada-text"
            aria-label="Zamknij konfigurację"
          >
            ✕
          </button>
        </div>

        {/* Stepper */}
        <div className="flex border-b border-scada-border bg-scada-surface px-5 py-2 text-[10px] font-medium">
          {STEPS.map((s, idx) => (
            <div
              key={s}
              data-testid={`add-der-step-${s}`}
              data-active={step === s}
              className={
                'flex-1 px-2 py-1 '
                + (step === s
                  ? 'text-scada-sn'
                  : idx < STEPS.indexOf(step)
                    ? 'text-status-ok'
                    : 'text-scada-muted')
              }
            >
              {STEP_LABELS[s]}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto p-5 text-xs">
          {step === 'variant' && (
            <div data-testid="add-der-step-content-variant" className="space-y-2">
              <p className="mb-2 text-scada-muted">
                Wybierz wariant przyłączenia. Opcje są filtrowane wg rodzaju DER
                (FW nie obsługuje "po stronie nN" zgodnie z modelem przyłączeń).
              </p>
              {variants.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  data-testid={`variant-${v.side}`}
                  data-active={selections.connectionSide === v.side}
                  onClick={() => setSelections((s) => ({ ...s, connectionSide: v.side }))}
                  className={
                    'w-full rounded border p-3 text-left text-xs '
                    + (selections.connectionSide === v.side
                      ? 'border-scada-sn bg-scada-hover-nav text-scada-text'
                      : 'border-scada-border bg-scada-surface text-scada-muted hover:border-scada-sn')
                  }
                >
                  <div className="text-sm font-semibold text-scada-text">{v.label_pl}</div>
                  <div className="mt-1 text-[11px]">{v.description_pl}</div>
                  <div className="mt-2 text-[10px]">
                    Wymagane elementy:{' '}
                    {v.required_objects_pl.map((o, i) => (
                      <span key={i} className="mr-1 rounded bg-scada-panel px-1.5 py-0.5">
                        {o}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 'point' && (
            <div data-testid="add-der-step-content-point" className="space-y-3">
              <p className="text-scada-muted">
                Wybierz punkt przyłączenia (PCC) i podstawowe dane DER.
                Pola tekstowe to projektowe oznaczenia, niewybór z katalogu.
              </p>
              <Field
                label="Nazwa DER"
                required
                value={selections.derName}
                onChange={(v) => setSelections((s) => ({ ...s, derName: v }))}
                placeholder={`np. ${derKind === 'PV' ? 'PV Polna 1' : derKind === 'BESS' ? 'BESS-1' : 'FW Pomorze'}`}
                testId="add-der-name"
              />
              <Field
                label="Oznaczenie PCC (etykieta projektowa)"
                required
                value={selections.pccLabel}
                onChange={(v) => setSelections((s) => ({ ...s, pccLabel: v }))}
                placeholder="np. PCC-01"
                testId="add-der-pcc-label"
              />
              {selections.connectionSide === 'SN' && (
                <Field
                  label="Oznaczenie pola SN (do utworzenia/wyboru)"
                  required
                  value={selections.bayName}
                  onChange={(v) => setSelections((s) => ({ ...s, bayName: v }))}
                  placeholder="np. Pole-PV-01"
                  testId="add-der-bay-name"
                />
              )}
              {selections.connectionSide === 'nN' && (
                <Select
                  label="Poziom napięcia nN (z katalogu)"
                  required
                  value={selections.voltageLevelRef ?? ''}
                  onChange={(v) => setSelections((s) => ({ ...s, voltageLevelRef: v }))}
                  options={[
                    { id: '', label: '— wybierz —' },
                    ...LV_VOLTAGE_LEVEL_CATALOG.map((l) => ({ id: l.id, label: l.label_pl })),
                  ]}
                  testId="add-der-voltage-level"
                />
              )}
            </div>
          )}

          {step === 'device' && (
            <div data-testid="add-der-step-content-device" className="space-y-3">
              <p className="text-scada-muted">
                Wybierz urządzenie z katalogu producenta. Wszystkie wartości
                techniczne (moc, napięcie, charakterystyki) pochodzą z katalogu.
              </p>
              <Select
                label={derKind === 'PV' ? 'Falownik PV' : derKind === 'BESS' ? 'PCS BESS' : 'Turbina wiatrowa'}
                required
                value={selections.deviceCatalogRef ?? ''}
                onChange={(v) => setSelections((s) => ({ ...s, deviceCatalogRef: v }))}
                options={[
                  { id: '', label: '— wybierz —' },
                  ...deviceCatalog.map((d) => ({ id: d.id, label: d.label_pl })),
                ]}
                testId="add-der-device"
              />
              {derKind === 'BESS' && (
                <Select
                  label="Bateria BESS"
                  required
                  value={selections.batteryCatalogRef ?? ''}
                  onChange={(v) => setSelections((s) => ({ ...s, batteryCatalogRef: v }))}
                  options={[
                    { id: '', label: '— wybierz —' },
                    ...BESS_BATTERY_CATALOG.map((b) => ({ id: b.id, label: b.label_pl })),
                  ]}
                  testId="add-der-battery"
                />
              )}
            </div>
          )}

          {step === 'profile' && (
            <div data-testid="add-der-step-content-profile" className="space-y-3">
              <p className="text-scada-muted">
                Wybierz profil zgodności przyłączeniowej (NC RfG) operatora oraz
                krzywe LVRT i HVRT zgodnie z modułem typu A/B/C/D.
              </p>
              <Select
                label="Profil NC RfG (operator)"
                required
                value={selections.ncRfgProfileRef ?? ''}
                onChange={(v) =>
                  setSelections((s) => ({
                    ...s,
                    ncRfgProfileRef: v,
                    lvrtCurveRef: null,
                    hvrtCurveRef: null,
                  }))
                }
                options={[
                  { id: '', label: '— wybierz —' },
                  ...NC_RFG_PROFILE_CATALOG.map((p) => ({ id: p.id, label: p.label_pl })),
                ]}
                testId="add-der-ncrfg"
              />
              <Select
                label="Krzywa LVRT"
                required
                disabled={!selections.ncRfgProfileRef}
                value={selections.lvrtCurveRef ?? ''}
                onChange={(v) => setSelections((s) => ({ ...s, lvrtCurveRef: v }))}
                options={[
                  { id: '', label: '— wybierz —' },
                  ...lvrtCurves.map((c) => ({ id: c.id, label: c.label_pl })),
                ]}
                testId="add-der-lvrt"
              />
              <Select
                label="Krzywa HVRT"
                required
                disabled={!selections.ncRfgProfileRef}
                value={selections.hvrtCurveRef ?? ''}
                onChange={(v) => setSelections((s) => ({ ...s, hvrtCurveRef: v }))}
                options={[
                  { id: '', label: '— wybierz —' },
                  ...hvrtCurves.map((c) => ({ id: c.id, label: c.label_pl })),
                ]}
                testId="add-der-hvrt"
              />
            </div>
          )}

          {step === 'review' && (
            <div data-testid="add-der-step-content-review" className="space-y-2">
              <p className="text-scada-muted">
                Podsumowanie konfiguracji. Po zatwierdzeniu w modelu sieci zostaną
                utworzone następujące obiekty:
              </p>
              <ul className="space-y-1 rounded border border-scada-border bg-scada-surface p-3 text-[11px]">
                <ReviewRow label="Stacja" value={stationName} />
                <ReviewRow label="Rodzaj DER" value={DER_KIND_LABELS[derKind]} />
                <ReviewRow label="Nazwa DER" value={selections.derName} />
                <ReviewRow label="Wariant przyłączenia" value={selections.connectionSide ?? ''} />
                <ReviewRow label="PCC" value={selections.pccLabel} />
                {selections.connectionSide === 'SN' && (
                  <ReviewRow label="Pole SN" value={selections.bayName} />
                )}
                {selections.connectionSide === 'nN' && (
                  <ReviewRow
                    label="Poziom napięcia nN"
                    value={
                      LV_VOLTAGE_LEVEL_CATALOG.find((l) => l.id === selections.voltageLevelRef)?.label_pl ?? ''
                    }
                  />
                )}
                <ReviewRow
                  label="Urządzenie (katalog)"
                  value={
                    deviceCatalog.find((d) => d.id === selections.deviceCatalogRef)?.label_pl ?? ''
                  }
                />
                {derKind === 'BESS' && (
                  <ReviewRow
                    label="Bateria (katalog)"
                    value={
                      BESS_BATTERY_CATALOG.find((b) => b.id === selections.batteryCatalogRef)?.label_pl ?? ''
                    }
                  />
                )}
                <ReviewRow
                  label="Profil NC RfG"
                  value={
                    NC_RFG_PROFILE_CATALOG.find((p) => p.id === selections.ncRfgProfileRef)?.label_pl ?? ''
                  }
                />
                <ReviewRow
                  label="Krzywa LVRT"
                  value={
                    LVRT_CURVE_CATALOG.find((c) => c.id === selections.lvrtCurveRef)?.label_pl ?? ''
                  }
                />
                <ReviewRow
                  label="Krzywa HVRT"
                  value={
                    HVRT_CURVE_CATALOG.find((c) => c.id === selections.hvrtCurveRef)?.label_pl ?? ''
                  }
                />
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-scada-border bg-scada-surface px-5 py-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 'variant'}
            data-testid="add-der-prev"
            className="rounded border border-scada-border px-3 py-1.5 text-xs text-scada-text hover:bg-scada-hover-nav disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Wstecz
          </button>
          <div className="text-[11px] text-scada-muted">
            Krok {STEPS.indexOf(step) + 1} z {STEPS.length}
          </div>
          {step === 'review' ? (
            <button
              type="button"
              onClick={handleCreate}
              data-testid="add-der-create"
              className="rounded bg-scada-sn px-4 py-1.5 text-xs font-medium text-scada-bg hover:bg-yellow-300"
            >
              Utwórz {DER_KIND_LABELS[derKind]}
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              data-testid="add-der-next"
              className="rounded bg-scada-sn px-3 py-1.5 text-xs font-medium text-scada-bg hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Dalej →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="text"
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-scada-border bg-scada-panel px-2 py-1.5 text-xs text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  required,
  disabled,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded border border-scada-border bg-scada-panel px-2 py-1.5 text-xs text-scada-text focus:border-scada-sn focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="text-scada-muted">{label}:</span>
      <span className="text-right font-medium text-scada-text">{value || '—'}</span>
    </li>
  );
}

export default AddDerWizard;
