import { useMemo, useState } from 'react';

import { MISSING_DASH } from '../../shared/formatPolishValue';
import { useSnapshotStore } from '../../topology/snapshotStore';
import type { WorkspaceSurfaceDescriptor } from '../types';

type GpzCardId = 'identification' | 'hv-side' | 'transformer' | 'sections' | 'bays-balance';
type ShortCircuitInputMode = 'HV_110_ADVANCED' | 'SN_SIMPLIFIED';

const CARD_LABELS: Record<GpzCardId, string> = {
  identification: 'Identyfikacja',
  'hv-side': 'Strona 110 kV',
  transformer: 'Transformator 110/SN',
  sections: 'Sekcje SN',
  'bays-balance': 'Bilans pól SN',
};

interface GpzConfiguratorSurfaceProps {
  readonly surface: WorkspaceSurfaceDescriptor;
}

interface GpzData {
  name: string;
  designation: string;
  operator: string;
  location: string;
  shortCircuitInputMode: ShortCircuitInputMode;
  snShortCircuitMva: number | null;
  hvVoltageKv: number;
  hvShortCircuitMva: number | null;
  hvRX: number | null;
  transformerCatalogId: string;
  transformerNominalMva: number | null;
  transformerUkPercent: number | null;
  transformerVectorGroup: string;
  sectionsCount: number;
  hasCoupler: boolean;
  busbarSystem: string;
  baysPerSectionCount: number[];
}

const TRAFO_110_CATALOG_OPTIONS = [
  { id: '__missing__', label: '-- wybierz --' },
  { id: 'tr-wn-sn-110-15-25mva', label: '110/15 kV · 25 MVA · Yyn0' },
  { id: 'tr-wn-sn-110-15-40mva', label: '110/15 kV · 40 MVA · YNyn0' },
  { id: 'tr-wn-sn-110-15-63mva', label: '110/15 kV · 63 MVA · YNyn0' },
  { id: 'tr-wn-sn-110-20-25mva', label: '110/20 kV · 25 MVA · Yyn0' },
  { id: 'tr-wn-sn-110-20-40mva', label: '110/20 kV · 40 MVA · YNyn0' },
];

function emptyGpzData(): GpzData {
  return {
    name: '',
    designation: '',
    operator: '',
    location: '',
    shortCircuitInputMode: 'HV_110_ADVANCED',
    snShortCircuitMva: null,
    hvVoltageKv: 110,
    hvShortCircuitMva: null,
    hvRX: null,
    transformerCatalogId: '__missing__',
    transformerNominalMva: null,
    transformerUkPercent: null,
    transformerVectorGroup: 'YNyn0',
    sectionsCount: 2,
    hasCoupler: true,
    busbarSystem: 'pojedynczy sekcjonowany',
    baysPerSectionCount: [0, 0],
  };
}

export function GpzConfiguratorSurface(props: GpzConfiguratorSurfaceProps): JSX.Element {
  const { surface } = props;
  const [activeCard, setActiveCard] = useState<GpzCardId>('identification');
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const gpzRef = surface.entityRef ?? null;
  const [data, setData] = useState<GpzData>(() => emptyGpzData());

  const gpzNameFromSnapshot = useMemo(() => {
    if (!gpzRef || !snapshot) return null;
    const source = (snapshot.sources ?? []).find(
      (s: { ref_id: string; name?: string }) => s.ref_id === gpzRef,
    );
    return source?.name ?? null;
  }, [gpzRef, snapshot]);

  const completeness = useMemo(() => {
    const hasShortCircuitInput =
      data.shortCircuitInputMode === 'HV_110_ADVANCED'
        ? data.hvShortCircuitMva !== null && data.hvShortCircuitMva > 0
        : data.snShortCircuitMva !== null && data.snShortCircuitMva > 0;
    const checks = [
      data.name.trim().length > 0,
      hasShortCircuitInput,
      data.transformerCatalogId !== '__missing__',
      data.sectionsCount > 0,
    ];
    const done = checks.filter(Boolean).length;
    return { done, total: checks.length };
  }, [data]);

  return (
    <div data-testid="gpz-configurator-surface" className="flex h-full w-full flex-col p-4">
      <div className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-scada-muted">
          E-10 · Główny Punkt Zasilający
        </div>
        <h2 className="mt-1 text-base font-semibold text-scada-text">
          {data.name || gpzNameFromSnapshot || (gpzRef ?? 'GPZ niewybrany')}
        </h2>
        <div className="mt-1 text-xs text-scada-muted">
          Kompletność: {completeness.done}/{completeness.total} pól wymaganych
        </div>
      </div>

      <nav role="tablist" className="flex shrink-0 border-b border-scada-border">
        {(Object.keys(CARD_LABELS) as GpzCardId[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            data-testid={`gpz-card-tab-${id}`}
            data-active={activeCard === id}
            aria-selected={activeCard === id}
            onClick={() => setActiveCard(id)}
            className={
              'whitespace-nowrap px-3 py-2 text-xs font-medium '
              + (activeCard === id
                ? 'border-b-2 border-scada-sn text-scada-text'
                : 'border-b-2 border-transparent text-scada-muted hover:text-scada-text')
            }
          >
            {CARD_LABELS[id]}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-4">
        {activeCard === 'identification' && (
          <div data-testid="gpz-card-content-identification" className="space-y-3">
            <Field
              label="Nazwa GPZ"
              required
              value={data.name}
              onChange={(v) => setData((d) => ({ ...d, name: v }))}
              placeholder="np. GPZ Wschód"
            />
            <Field
              label="Oznaczenie ruchowe"
              value={data.designation}
              onChange={(v) => setData((d) => ({ ...d, designation: v }))}
              placeholder="np. RPZ-W"
            />
            <Field
              label="OSD / operator"
              value={data.operator}
              onChange={(v) => setData((d) => ({ ...d, operator: v }))}
              placeholder="PSE / Energa / Tauron / Enea / PGE"
            />
            <Field
              label="Lokalizacja"
              value={data.location}
              onChange={(v) => setData((d) => ({ ...d, location: v }))}
              placeholder="Obszar / gmina"
            />
          </div>
        )}

        {activeCard === 'hv-side' && (
          <div data-testid="gpz-card-content-hv-side" className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                data-testid="gpz-short-circuit-mode-hv"
                onClick={() => setData((d) => ({ ...d, shortCircuitInputMode: 'HV_110_ADVANCED' }))}
                className={
                  'border px-3 py-2 text-left text-xs font-semibold '
                  + (data.shortCircuitInputMode === 'HV_110_ADVANCED'
                    ? 'border-scada-sn bg-scada-surface text-scada-text'
                    : 'border-scada-border text-scada-muted hover:text-scada-text')
                }
              >
                Tryb WN/SN: Sk3 na szynie 110 kV
              </button>
              <button
                type="button"
                data-testid="gpz-short-circuit-mode-sn"
                onClick={() => setData((d) => ({ ...d, shortCircuitInputMode: 'SN_SIMPLIFIED' }))}
                className={
                  'border px-3 py-2 text-left text-xs font-semibold '
                  + (data.shortCircuitInputMode === 'SN_SIMPLIFIED'
                    ? 'border-scada-sn bg-scada-surface text-scada-text'
                    : 'border-scada-border text-scada-muted hover:text-scada-text')
                }
              >
                Tryb uproszczony: tylko Sk3 po stronie SN
              </button>
            </div>

            {data.shortCircuitInputMode === 'HV_110_ADVANCED' && (
              <>
            <NumberField
              label="Napięcie znamionowe WN"
              unit="kV"
              value={data.hvVoltageKv}
              onChange={(v) => setData((d) => ({ ...d, hvVoltageKv: v ?? 110 }))}
              required
            />
            <NumberField
              label="Moc zwarciowa S''k 110 kV"
              unit="MVA"
              value={data.hvShortCircuitMva}
              onChange={(v) => setData((d) => ({ ...d, hvShortCircuitMva: v }))}
              required
              placeholder="np. 2500"
            />
            <NumberField
              label="Stosunek R/X źródła 110 kV"
              unit="-"
              value={data.hvRX}
              onChange={(v) => setData((d) => ({ ...d, hvRX: v }))}
              placeholder="0,1"
            />
              </>
            )}
            {data.shortCircuitInputMode === 'SN_SIMPLIFIED' && (
              <NumberField
                label="Moc zwarciowa S''k po stronie SN"
                unit="MVA"
                value={data.snShortCircuitMva}
                onChange={(v) => setData((d) => ({ ...d, snShortCircuitMva: v }))}
                required
                placeholder="np. 310"
              />
            )}
            <p className="rounded border border-scada-border bg-scada-surface p-2 text-[11px] text-scada-muted">
              Dane wejściowe są używane przez moduł obliczeń IEC 60909. Brak danych
              zwarciowych blokuje odpowiednie pozycje gotowości obliczeń.
            </p>
          </div>
        )}

        {activeCard === 'transformer' && (
          <div data-testid="gpz-card-content-transformer" className="space-y-3">
            <SelectField
              label="Katalog transformatora 110/SN"
              required
              value={data.transformerCatalogId}
              onChange={(v) => setData((d) => ({ ...d, transformerCatalogId: v }))}
              options={TRAFO_110_CATALOG_OPTIONS}
            />
            <NumberField
              label="Moc znamionowa Sn"
              unit="MVA"
              value={data.transformerNominalMva}
              onChange={(v) => setData((d) => ({ ...d, transformerNominalMva: v }))}
              placeholder="25 / 40 / 63"
            />
            <NumberField
              label="uk"
              unit="%"
              value={data.transformerUkPercent}
              onChange={(v) => setData((d) => ({ ...d, transformerUkPercent: v }))}
              placeholder="np. 12,5"
            />
            <Field
              label="Układ połączeń (grupa)"
              value={data.transformerVectorGroup}
              onChange={(v) => setData((d) => ({ ...d, transformerVectorGroup: v }))}
              placeholder="YNyn0 / Dyn5 / Dyn11"
            />
          </div>
        )}

        {activeCard === 'sections' && (
          <div data-testid="gpz-card-content-sections" className="space-y-3">
            <NumberField
              label="Liczba sekcji szyn SN"
              unit="szt."
              value={data.sectionsCount}
              onChange={(v) =>
                setData((d) => ({
                  ...d,
                  sectionsCount: Math.max(1, v ?? 1),
                  baysPerSectionCount:
                    v && v > d.baysPerSectionCount.length
                      ? [
                          ...d.baysPerSectionCount,
                          ...Array(v - d.baysPerSectionCount.length).fill(0),
                        ]
                      : d.baysPerSectionCount.slice(0, v ?? 1),
                }))}
              required
            />
            <CheckboxField
              label="Sprzęgło między sekcjami"
              checked={data.hasCoupler}
              onChange={(v) => setData((d) => ({ ...d, hasCoupler: v }))}
            />
            <SelectField
              label="System szyn"
              value={data.busbarSystem}
              onChange={(v) => setData((d) => ({ ...d, busbarSystem: v }))}
              options={[
                { id: 'pojedynczy sekcjonowany', label: 'Pojedynczy, sekcjonowany' },
                { id: 'pojedynczy bez sekcji', label: 'Pojedynczy, bez sekcji' },
                { id: 'podwojny', label: 'Podwójny' },
              ]}
            />
          </div>
        )}

        {activeCard === 'bays-balance' && (
          <div data-testid="gpz-card-content-bays-balance" className="space-y-3">
            <p className="text-sm text-scada-muted">
              Bilans pól SN per sekcja: pola liniowe, transformatorowe, pomiarowe,
              sprzęgłowe, sekcyjne, OZE i rezerwowe.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {data.baysPerSectionCount.map((count, idx) => (
                <div
                  key={idx}
                  className="rounded border border-scada-border bg-scada-surface p-3"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-scada-muted">
                    Sekcja {String.fromCharCode(65 + idx)}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-scada-text">
                    {count > 0 ? `${count} pól` : MISSING_DASH}
                  </div>
                  <p className="mt-2 text-xs text-scada-muted">
                    Pola dodaje się z menu kontekstowego sekcji lub przez akcję
                    "Dodaj pole SN".
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-scada-border p-3 text-xs text-scada-muted">
        Edytor GPZ pokazuje dane katalogowe, sekcje SN i braki wejściowe. Dodawanie
        nowego GPZ wykonuje formularz "Dodaj źródło zasilania GPZ" z panelu budowy modelu.
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

function Field({ label, value, onChange, placeholder, required }: FieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  unit?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  required?: boolean;
}

function NumberField({ label, unit, value, onChange, placeholder, required }: NumberFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {unit && <span className="text-scada-muted"> [{unit}]</span>}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <input
        type="number"
        value={value === null ? '' : value}
        onChange={(e) => {
          const next = e.target.value === '' ? null : Number(e.target.value);
          onChange(next === null || Number.isNaN(next) ? null : next);
        }}
        placeholder={placeholder ?? '-- brak danych --'}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text placeholder:text-scada-muted focus:border-scada-sn focus:outline-none"
      />
    </div>
  );
}

interface SelectOption {
  id: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  required?: boolean;
}

function SelectField({ label, value, onChange, options, required }: SelectFieldProps) {
  return (
    <div>
      <label className="mb-1 block text-xs text-scada-muted">
        {label}
        {required && <span className="text-red-400"> *</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-scada-border bg-scada-surface px-2 py-1.5 text-sm text-scada-text focus:border-scada-sn focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function CheckboxField({ label, checked, onChange }: CheckboxFieldProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-scada-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-scada-border bg-scada-surface text-scada-sn focus:ring-scada-sn"
      />
      {label}
    </label>
  );
}

export default GpzConfiguratorSurface;
