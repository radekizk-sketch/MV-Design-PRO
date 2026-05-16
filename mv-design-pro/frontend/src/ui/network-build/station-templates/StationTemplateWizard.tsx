/**
 * StationTemplateWizard — K30-16 multi-step station creation wizard.
 *
 * User K30-15.4 demand: "rozbuduj backedn station templates o conajmniej
 * 50 przykładów - następnie te templaty muszą być edytwoalne w zakresie
 * wszystkich parametrów tj np liczby falowników rozdzauj zabezpieczen,
 * typu rodzielnicy, mocy/typu TR, wszytko konfikguraowalne".
 *
 * 7 steps:
 *   1. Kategoria — 10 kategorii (Typowe / Słupowe / ZKSN / Prosument / Farma /
 *      BESS / Hybrydowe / Przemysłowe / Wiatrowe / Sekcyjne)
 *   2. Wybór szablonu — gallery z 57 templates filtered by category
 *   3. Lokalizacja — segment trunk + position
 *   4. Konfiguracja parametrów (CORE) — 6 tabs:
 *      Transformator / Rozdzielnia SN / Strona nN / DER / Zabezpieczenia / Pomiary
 *   5. Profil dostawcy — cascade (ZPUE / Elektrometal / ABB / Siemens / Schneider)
 *   6. Podgląd SLD — live preview
 *   7. Zatwierdź + analiza — apply
 */

import { useEffect, useMemo, useState } from 'react';

import {
  applyStationTemplate,
  fetchStationTemplate,
  fetchStationTemplateCategories,
  fetchStationTemplates,
  previewStationTemplate,
  type ApplyTemplateResult,
  type CategoryEntry,
  type PreviewTemplateResult,
  type StationTemplateFull,
  type StationTemplateSummary,
} from './api';

export type WizardStep =
  | 'category'
  | 'template'
  | 'location'
  | 'params'
  | 'profile'
  | 'preview'
  | 'apply';

export interface WizardState {
  step: WizardStep;
  selectedCategory: string | null;
  selectedTemplateId: string | null;
  paramOverrides: Record<string, unknown>;
  catalogProfile: string | null;
}

const INITIAL_STATE: WizardState = {
  step: 'category',
  selectedCategory: null,
  selectedTemplateId: null,
  paramOverrides: {},
  catalogProfile: null,
};

const STEP_ORDER: WizardStep[] = [
  'category',
  'template',
  'location',
  'params',
  'profile',
  'preview',
  'apply',
];

const STEP_LABELS_PL: Record<WizardStep, string> = {
  category: 'Kategoria',
  template: 'Szablon',
  location: 'Lokalizacja',
  params: 'Parametry',
  profile: 'Dostawca',
  preview: 'Podgląd',
  apply: 'Zatwierdź',
};

export interface StationTemplateWizardProps {
  /** Initial trunk segment for placement. */
  readonly targetSegmentRef?: string | null;
  /** Case ID dla backend apply (POST /api/station-templates/{id}/apply). */
  readonly caseId?: string | null;
  /** Called when wizard completes with apply payload (legacy callback). */
  readonly onApply?: (payload: {
    templateId: string;
    paramOverrides: Record<string, unknown>;
    catalogProfile: string | null;
  }) => void;
  /** K30-21: called z backend response after successful apply. */
  readonly onAppliedSuccess?: (result: ApplyTemplateResult) => void;
  /** Called when wizard is dismissed. */
  readonly onCancel?: () => void;
}

export function StationTemplateWizard(props: StationTemplateWizardProps): JSX.Element {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [categories, setCategories] = useState<readonly CategoryEntry[]>([]);
  const [templates, setTemplates] = useState<readonly StationTemplateSummary[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<StationTemplateFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load categories on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchStationTemplateCategories()
      .then((res) => {
        if (!cancelled) setCategories(res.categories);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load templates when category selected
  useEffect(() => {
    if (state.selectedCategory == null) return;
    let cancelled = false;
    setLoading(true);
    fetchStationTemplates(state.selectedCategory)
      .then((res) => {
        if (!cancelled) setTemplates(res.templates);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.selectedCategory]);

  // Load full template when selected
  useEffect(() => {
    if (state.selectedTemplateId == null) return;
    let cancelled = false;
    setLoading(true);
    fetchStationTemplate(state.selectedTemplateId)
      .then((res) => {
        if (!cancelled) {
          setActiveTemplate(res);
          // Pre-populate overrides with defaults
          setState((s) => ({
            ...s,
            paramOverrides: {
              transformer_count: res.schema.transformer_count.default,
              sn_bays_count: res.schema.sn_bays_count.default,
              nn_feeders_count: res.schema.nn_feeders_count.default,
              der_total_count: res.schema.der_total_count.default,
            },
            catalogProfile: res.schema.manufacturer_profile_default,
          }));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.selectedTemplateId]);

  const currentStepIndex = useMemo(
    () => STEP_ORDER.indexOf(state.step),
    [state.step]
  );

  const canGoNext = useMemo(() => {
    switch (state.step) {
      case 'category':
        return state.selectedCategory != null;
      case 'template':
        return state.selectedTemplateId != null;
      case 'location':
        return props.targetSegmentRef != null;
      case 'params':
      case 'profile':
      case 'preview':
        return activeTemplate != null;
      case 'apply':
        return false;
      default:
        return false;
    }
  }, [state, activeTemplate, props.targetSegmentRef]);

  const handleNext = () => {
    if (currentStepIndex < STEP_ORDER.length - 1) {
      setState((s) => ({ ...s, step: STEP_ORDER[currentStepIndex + 1] }));
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setState((s) => ({ ...s, step: STEP_ORDER[currentStepIndex - 1] }));
    }
  };

  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyTemplateResult | null>(null);

  const handleApply = async () => {
    if (state.selectedTemplateId == null) return;
    // Legacy callback (for tests / external integrations)
    props.onApply?.({
      templateId: state.selectedTemplateId,
      paramOverrides: state.paramOverrides,
      catalogProfile: state.catalogProfile,
    });
    // K30-21: backend apply if caseId + targetSegmentRef provided
    if (props.caseId != null && props.targetSegmentRef != null) {
      setApplying(true);
      setError(null);
      try {
        const result = await applyStationTemplate(state.selectedTemplateId, {
          case_id: props.caseId,
          target_segment_id: props.targetSegmentRef,
          insert_at_ratio: 0.5,
          params_override: state.paramOverrides,
          catalog_profile: state.catalogProfile,
        });
        setApplyResult(result);
        props.onAppliedSuccess?.(result);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setApplying(false);
      }
    }
  };

  return (
    <div
      data-testid="sld-v2-station-template-wizard"
      className="flex flex-col h-full bg-zinc-900 text-zinc-100"
    >
      {/* Stepper header */}
      <header className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        {STEP_ORDER.map((s, idx) => (
          <div
            key={s}
            data-testid={`wizard-step-${s}`}
            data-active={s === state.step}
            className={`px-2 py-1 rounded ${
              s === state.step
                ? 'bg-cyan-700 text-white'
                : idx < currentStepIndex
                ? 'bg-zinc-700 text-zinc-200'
                : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            {idx + 1}. {STEP_LABELS_PL[s]}
          </div>
        ))}
      </header>

      <main className="flex-1 overflow-auto p-4" data-testid="wizard-content">
        {error != null && (
          <div className="bg-red-900/40 border border-red-700 text-red-200 px-3 py-2 mb-3 rounded text-sm">
            {error}
          </div>
        )}
        {loading && (
          <div data-testid="wizard-loading" className="text-zinc-400 text-sm">
            Ładowanie…
          </div>
        )}

        {state.step === 'category' && (
          <CategoryStep
            categories={categories}
            selected={state.selectedCategory}
            onSelect={(cat) => setState((s) => ({ ...s, selectedCategory: cat }))}
          />
        )}

        {state.step === 'template' && (
          <TemplateStep
            templates={templates}
            selected={state.selectedTemplateId}
            onSelect={(id) => setState((s) => ({ ...s, selectedTemplateId: id }))}
          />
        )}

        {state.step === 'location' && (
          <LocationStep targetSegmentRef={props.targetSegmentRef ?? null} />
        )}

        {state.step === 'params' && activeTemplate != null && (
          <ParamsStep
            template={activeTemplate}
            overrides={state.paramOverrides}
            onChange={(key, value) =>
              setState((s) => ({
                ...s,
                paramOverrides: { ...s.paramOverrides, [key]: value },
              }))
            }
          />
        )}

        {state.step === 'profile' && activeTemplate != null && (
          <ProfileStep
            template={activeTemplate}
            value={state.catalogProfile}
            onChange={(p) => setState((s) => ({ ...s, catalogProfile: p }))}
          />
        )}

        {state.step === 'preview' && activeTemplate != null && (
          <PreviewStep
            template={activeTemplate}
            overrides={state.paramOverrides}
            catalogProfile={state.catalogProfile}
          />
        )}

        {state.step === 'apply' && (
          <ApplyStep
            template={activeTemplate}
            overrides={state.paramOverrides}
            applying={applying}
            applyResult={applyResult}
            onConfirm={handleApply}
          />
        )}
      </main>

      <footer className="px-4 py-3 border-t border-zinc-800 flex justify-between gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="px-3 py-1.5 text-sm text-zinc-300 hover:text-white"
          data-testid="wizard-cancel"
        >
          Anuluj
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentStepIndex === 0}
            className="px-3 py-1.5 text-sm bg-zinc-700 text-zinc-100 rounded disabled:opacity-40"
            data-testid="wizard-prev"
          >
            ← Wstecz
          </button>
          {state.step === 'apply' ? (
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || applyResult != null}
              className="px-4 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-40"
              data-testid="wizard-apply"
            >
              {applying
                ? 'Wykonywanie…'
                : applyResult != null
                  ? '✓ Utworzono'
                  : 'Zatwierdź i utwórz stację'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
              className="px-3 py-1.5 text-sm bg-cyan-700 text-white rounded disabled:opacity-40"
              data-testid="wizard-next"
            >
              Dalej →
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

// =============================================================================
// Step components
// =============================================================================

function CategoryStep(props: {
  categories: readonly CategoryEntry[];
  selected: string | null;
  onSelect: (cat: string) => void;
}): JSX.Element {
  return (
    <div data-testid="wizard-step-content-category">
      <h2 className="text-lg font-bold mb-3">Wybierz kategorię stacji</h2>
      <div className="grid grid-cols-2 gap-2">
        {props.categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            data-testid={`category-${cat.id}`}
            data-selected={cat.id === props.selected}
            onClick={() => props.onSelect(cat.id)}
            className={`text-left p-3 rounded border ${
              cat.id === props.selected
                ? 'border-cyan-500 bg-cyan-950'
                : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800'
            }`}
          >
            <div className="font-bold text-sm">{cat.label_pl}</div>
            <div className="text-xs text-zinc-400 mt-1">{cat.description_pl}</div>
            <div className="text-xs text-cyan-300 mt-1">
              {cat.template_count} szablonów
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TemplateStep(props: {
  templates: readonly StationTemplateSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <div data-testid="wizard-step-content-template">
      <h2 className="text-lg font-bold mb-3">Wybierz szablon</h2>
      <div className="space-y-2">
        {props.templates.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={`template-${t.id}`}
            data-selected={t.id === props.selected}
            onClick={() => props.onSelect(t.id)}
            className={`block w-full text-left p-3 rounded border ${
              t.id === props.selected
                ? 'border-cyan-500 bg-cyan-950'
                : 'border-zinc-700 hover:border-zinc-500 bg-zinc-800'
            }`}
          >
            <div className="font-bold text-sm">{t.name_pl}</div>
            <div className="text-xs text-zinc-400 mt-1">{t.description_pl}</div>
            <div className="text-xs text-zinc-500 mt-1">{t.use_case_pl}</div>
            {t.nc_rfg_type != null && (
              <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-amber-800 text-amber-100 rounded">
                NC RfG typ {t.nc_rfg_type}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function LocationStep(props: { targetSegmentRef: string | null }): JSX.Element {
  return (
    <div data-testid="wizard-step-content-location">
      <h2 className="text-lg font-bold mb-3">Lokalizacja stacji</h2>
      {props.targetSegmentRef != null ? (
        <div className="text-sm text-zinc-300">
          <div>Segment docelowy:</div>
          <div className="font-mono text-xs bg-zinc-800 p-2 rounded mt-1">
            {props.targetSegmentRef}
          </div>
        </div>
      ) : (
        <div className="text-sm text-amber-300">
          Kliknij segment trunk na schemacie SLD, aby wybrać miejsce wstawienia stacji.
        </div>
      )}
    </div>
  );
}

function ParamsStep(props: {
  template: StationTemplateFull;
  overrides: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}): JSX.Element {
  const { template, overrides, onChange } = props;
  const [tab, setTab] = useState<
    'transformer' | 'sn_switchgear' | 'nn_feeders' | 'der' | 'protection' | 'measurements'
  >('transformer');

  return (
    <div data-testid="wizard-step-content-params">
      <h2 className="text-lg font-bold mb-3">Konfiguracja parametrów (wszystko edytowalne)</h2>
      <div className="flex gap-1 mb-3 text-xs">
        {(
          [
            ['transformer', 'Transformator'],
            ['sn_switchgear', 'Rozdzielnia SN'],
            ['nn_feeders', 'Strona nN'],
            ['der', 'DER (PV/BESS/FW)'],
            ['protection', 'Zabezpieczenia'],
            ['measurements', 'Pomiary'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-testid={`params-tab-${id}`}
            data-active={tab === id}
            onClick={() => setTab(id)}
            className={`px-3 py-1 rounded ${
              tab === id ? 'bg-cyan-700 text-white' : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'transformer' && (
        <div className="space-y-3">
          <ParamInt
            label={template.schema.transformer_count.label_pl}
            value={(overrides.transformer_count as number) ?? template.schema.transformer_count.default}
            min={template.schema.transformer_count.min_value}
            max={template.schema.transformer_count.max_value}
            onChange={(v) => onChange('transformer_count', v)}
          />
          <ChoiceSelect
            label="Typ transformatora (katalog PTPiRE)"
            options={template.schema.transformer_options}
            value={overrides.transformer_ref as string | undefined}
            onChange={(v) => onChange('transformer_ref', v)}
          />
        </div>
      )}

      {tab === 'sn_switchgear' && (
        <div className="space-y-3">
          <SelectStr
            label="Producent rozdzielni SN"
            options={template.schema.sn_switchgear_manufacturers as string[]}
            value={(overrides.sn_manufacturer as string) ?? template.schema.sn_switchgear_default}
            onChange={(v) => onChange('sn_manufacturer', v)}
          />
          <ParamInt
            label={template.schema.sn_bays_count.label_pl}
            value={(overrides.sn_bays_count as number) ?? template.schema.sn_bays_count.default}
            min={template.schema.sn_bays_count.min_value}
            max={template.schema.sn_bays_count.max_value}
            onChange={(v) => onChange('sn_bays_count', v)}
          />
        </div>
      )}

      {tab === 'nn_feeders' && (
        <div className="space-y-3">
          <ParamInt
            label={template.schema.nn_feeders_count.label_pl}
            value={(overrides.nn_feeders_count as number) ?? template.schema.nn_feeders_count.default}
            min={template.schema.nn_feeders_count.min_value}
            max={template.schema.nn_feeders_count.max_value}
            onChange={(v) => onChange('nn_feeders_count', v)}
          />
          <ChoiceSelect
            label="Aparatura CB odpływów nN"
            options={template.schema.nn_feeder_cb_options}
            value={overrides.nn_feeder_cb_ref as string | undefined}
            onChange={(v) => onChange('nn_feeder_cb_ref', v)}
          />
        </div>
      )}

      {tab === 'der' && (
        <div className="space-y-3">
          {template.schema.der_options.length === 0 ? (
            <div className="text-sm text-zinc-400">Ten szablon nie zawiera modułów DER.</div>
          ) : (
            <>
              <ParamInt
                label={template.schema.der_total_count.label_pl}
                value={(overrides.der_total_count as number) ?? template.schema.der_total_count.default}
                min={template.schema.der_total_count.min_value}
                max={template.schema.der_total_count.max_value}
                onChange={(v) => onChange('der_total_count', v)}
              />
              {template.schema.der_options.map((der) => (
                <div key={der.kind} className="bg-zinc-800 p-2 rounded">
                  <div className="font-bold text-sm mb-2">{der.label_pl}</div>
                  <ChoiceSelect
                    label={`Katalog ${der.kind}`}
                    options={der.catalog_options}
                    value={overrides[`der_${der.kind}_ref`] as string | undefined}
                    onChange={(v) => onChange(`der_${der.kind}_ref`, v)}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'protection' && (
        <div className="space-y-3">
          <div className="text-sm text-zinc-300 mb-2">
            Wybierz przekaźniki zabezpieczeń per pole:
          </div>
          {template.schema.sn_bay_protection_options.map((prot) => (
            <button
              key={prot.device_catalog_ref}
              type="button"
              data-testid={`protection-${prot.device_catalog_ref}`}
              data-selected={overrides.protection_ref === prot.device_catalog_ref}
              onClick={() => onChange('protection_ref', prot.device_catalog_ref)}
              className={`block w-full text-left p-2 rounded border ${
                overrides.protection_ref === prot.device_catalog_ref
                  ? 'border-cyan-500 bg-cyan-950'
                  : 'border-zinc-700 bg-zinc-800'
              }`}
            >
              <div className="font-bold text-sm">{prot.label_pl}</div>
              <div className="text-xs text-zinc-400">{prot.vendor}</div>
              {prot.badge_pl && (
                <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-emerald-800 text-emerald-100 rounded">
                  {prot.badge_pl}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {tab === 'measurements' && (
        <div className="space-y-3">
          <ChoiceSelect
            label="Przekładnik prądowy (CT)"
            options={template.schema.ct_options}
            value={overrides.ct_ref as string | undefined}
            onChange={(v) => onChange('ct_ref', v)}
          />
          <ChoiceSelect
            label="Przekładnik napięciowy (VT)"
            options={template.schema.vt_options}
            value={overrides.vt_ref as string | undefined}
            onChange={(v) => onChange('vt_ref', v)}
          />
        </div>
      )}
    </div>
  );
}

function ProfileStep(props: {
  template: StationTemplateFull;
  value: string | null;
  onChange: (p: string) => void;
}): JSX.Element {
  return (
    <div data-testid="wizard-step-content-profile">
      <h2 className="text-lg font-bold mb-3">Profil dostawcy (cascade)</h2>
      <div className="text-sm text-zinc-300 mb-3">
        Wybierz dostawcę — domyślnie dotyczy wszystkich pól (możliwy override per element).
      </div>
      <SelectStr
        label="Producent"
        options={props.template.schema.sn_switchgear_manufacturers as string[]}
        value={props.value ?? props.template.schema.manufacturer_profile_default}
        onChange={props.onChange}
      />
    </div>
  );
}

function PreviewStep(props: {
  template: StationTemplateFull;
  overrides: Record<string, unknown>;
  catalogProfile: string | null;
}): JSX.Element {
  const [preview, setPreview] = useState<PreviewTemplateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // K30-27: live preview z debounce 300ms gdy params change
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setPreviewError(null);
      previewStationTemplate(props.template.id, {
        params_override: props.overrides,
        catalog_profile: props.catalogProfile,
      })
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch((err: Error) => {
          if (!cancelled) setPreviewError(err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [props.template.id, props.overrides, props.catalogProfile]);

  return (
    <div data-testid="wizard-step-content-preview">
      <h2 className="text-lg font-bold mb-3">Podgląd konfiguracji (live preview)</h2>
      {loading && (
        <div data-testid="preview-loading" className="text-zinc-400 text-sm mb-2">
          Aktualizowanie podglądu…
        </div>
      )}
      {previewError && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 px-3 py-2 mb-3 rounded text-sm">
          Błąd podglądu: {previewError}
        </div>
      )}
      {preview != null && (
        <div data-testid="preview-content" className="space-y-3 text-sm">
          <div className="bg-emerald-950 border border-emerald-700 px-3 py-2 rounded">
            <div className="font-bold text-emerald-200">
              {preview.template_name_pl}
            </div>
            <div className="text-xs text-emerald-300 mt-1">
              Typ: {preview.station_type}
              {preview.nc_rfg_type && ` · NC RfG typ ${preview.nc_rfg_type}`}
              {preview.catalog_profile_applied &&
                ` · Profil: ${preview.catalog_profile_applied}`}
            </div>
          </div>

          <div className="bg-zinc-800 p-3 rounded space-y-2 text-xs">
            <div>
              <span className="text-zinc-400">Transformator: </span>
              <span className="font-mono text-cyan-300">
                {preview.effective_config.transformer_ref ?? '—'}
              </span>
              <span className="text-zinc-500"> × {preview.effective_config.transformer_count}</span>
            </div>
            <div>
              <span className="text-zinc-400">Rozdzielnia SN: </span>
              <span className="font-mono text-cyan-300">
                {preview.effective_config.sn_manufacturer}
              </span>
              <span className="text-zinc-500"> ({preview.effective_config.sn_bays_count} pól)</span>
            </div>
            <div>
              <span className="text-zinc-400">Pola SN: </span>
              <span className="text-zinc-300">
                {preview.effective_config.sn_bay_roles.join(' → ')}
              </span>
            </div>
            <div>
              <span className="text-zinc-400">Odpływy nN: </span>
              <span className="text-zinc-300">{preview.effective_config.nn_feeders_count}</span>
              <span className="text-zinc-500"> ({preview.effective_config.nn_feeder_cb_ref ?? 'auto'})</span>
            </div>
            <div>
              <span className="text-zinc-400">Zabezpieczenia: </span>
              <span className="font-mono text-cyan-300">
                {preview.effective_config.protection_relay_ref ?? '—'}
              </span>
            </div>
            {preview.effective_config.der_total_count > 0 && (
              <div>
                <span className="text-zinc-400">DER: </span>
                <span className="text-zinc-300">{preview.effective_config.der_total_count}× </span>
                <span className="text-xs text-zinc-500">
                  ({preview.effective_config.der_mix.map((d) => `${d.kind} (${d.connection_variant})`).join(', ')})
                </span>
              </div>
            )}
          </div>

          <div className="bg-amber-950/30 border border-amber-700/50 px-3 py-2 rounded text-xs">
            <div className="text-amber-300">
              📐 Szacowana liczba elementów do utworzenia:{' '}
              <span className="font-bold">{preview.estimated_elements_count}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApplyStep(props: {
  template: StationTemplateFull | null;
  overrides: Record<string, unknown>;
  applying: boolean;
  applyResult: ApplyTemplateResult | null;
  onConfirm: () => void;
}): JSX.Element {
  return (
    <div data-testid="wizard-step-content-apply">
      <h2 className="text-lg font-bold mb-3">Zatwierdzenie</h2>
      {props.template != null ? (
        <div className="text-sm">
          <div>Stacja zostanie utworzona na podstawie szablonu:</div>
          <div className="font-bold text-cyan-300 mt-1">{props.template.name_pl}</div>
          {props.applying && (
            <div data-testid="apply-pending" className="mt-3 text-amber-300">
              Wykonywanie operacji na snapshot ENM…
            </div>
          )}
          {props.applyResult != null && (
            <div data-testid="apply-success" className="mt-3 bg-emerald-950 border border-emerald-700 p-3 rounded">
              <div className="font-bold text-emerald-200">
                ✓ Stacja utworzona pomyślnie
              </div>
              <div className="text-xs text-emerald-300 mt-2">
                Station ref: <span className="font-mono">{props.applyResult.station_ref ?? '—'}</span>
              </div>
              <div className="text-xs text-emerald-300 mt-1">
                Utworzone elementy:{' '}
                <span className="font-mono">{props.applyResult.created_element_refs.length}</span>
              </div>
              <div className="text-xs text-emerald-300 mt-1">
                Operacji wykonano:{' '}
                <span className="font-mono">{props.applyResult.operations_log.length}</span>
              </div>
            </div>
          )}
          {props.applyResult == null && !props.applying && (
            <div className="text-xs text-zinc-400 mt-3">
              Po zatwierdzeniu system wykona operację <code>apply_station_template</code> na
              aktywnym snapshocie ENM.
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-amber-300">Brak wybranego szablonu.</div>
      )}
    </div>
  );
}

// =============================================================================
// Reusable form components
// =============================================================================

function ParamInt(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div data-testid={`param-int-${props.label}`}>
      <label className="block text-xs text-zinc-400 mb-1">{props.label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={props.min}
          max={props.max}
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
          className="flex-1"
        />
        <input
          type="number"
          min={props.min}
          max={props.max}
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
          className="w-16 px-2 py-1 bg-zinc-800 text-zinc-100 rounded text-sm"
        />
      </div>
      <div className="text-xs text-zinc-500">
        zakres: {props.min} — {props.max}
      </div>
    </div>
  );
}

interface ChoiceLike {
  catalog_ref: string;
  label_pl: string;
  default?: boolean;
  badge_pl?: string | null;
}

function ChoiceSelect(props: {
  label: string;
  options: readonly ChoiceLike[];
  value: string | undefined;
  onChange: (v: string) => void;
}): JSX.Element {
  const effective =
    props.value ??
    props.options.find((o) => o.default)?.catalog_ref ??
    props.options[0]?.catalog_ref ??
    '';
  return (
    <div data-testid={`choice-${props.label}`}>
      <label className="block text-xs text-zinc-400 mb-1">{props.label}</label>
      <select
        value={effective}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full px-2 py-1.5 bg-zinc-800 text-zinc-100 rounded text-sm"
      >
        {props.options.map((opt) => (
          <option key={opt.catalog_ref} value={opt.catalog_ref}>
            {opt.label_pl}
            {opt.badge_pl ? ` (${opt.badge_pl})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function SelectStr(props: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div data-testid={`select-${props.label}`}>
      <label className="block text-xs text-zinc-400 mb-1">{props.label}</label>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full px-2 py-1.5 bg-zinc-800 text-zinc-100 rounded text-sm"
      >
        {props.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
