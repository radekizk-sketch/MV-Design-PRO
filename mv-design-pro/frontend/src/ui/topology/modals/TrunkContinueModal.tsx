import { useCallback, useEffect, useMemo, useState } from 'react';
import { CatalogPicker, type CatalogEntry } from './CatalogPicker';

export type SegmentKind = 'KABEL_SN' | 'LINIA_NAPOWIETRZNA';
export type TrunkNextStep = 'station' | 'zksn' | 'branch_pole' | 'continue';

export interface TrunkContinueFormData {
  segment_kind: SegmentKind;
  length_m: number;
  catalog_ref: string | null;
  next_step: TrunkNextStep;
  notes: string;
}

interface TrunkContinueModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  trunkId: string;
  terminalId: string;
  terminalPortId?: string;
  terminalName?: string;
  terminalVoltageLabel?: string;
  initialData?: Partial<TrunkContinueFormData>;
  cableCatalogEntries?: CatalogEntry[];
  lineCatalogEntries?: CatalogEntry[];
  catalogLoading?: boolean;
  catalogLoadError?: string | null;
  submitDisabled?: boolean;
  submitDisabledReason?: string | null;
  onSubmit: (data: TrunkContinueFormData) => void;
  onCancel: () => void;
}

interface FieldError {
  field: string;
  message: string;
}

const DEFAULT_DATA: TrunkContinueFormData = {
  segment_kind: 'KABEL_SN',
  length_m: 0,
  catalog_ref: null,
  next_step: 'station',
  notes: '',
};

const SEGMENT_KIND_LABELS: Record<SegmentKind, string> = {
  KABEL_SN: 'Kabel SN',
  LINIA_NAPOWIETRZNA: 'Linia napowietrzna SN',
};

const LENGTH_PRESETS = [100, 250, 500, 700, 1000];

const NEXT_STEP_OPTIONS: Array<{
  id: TrunkNextStep;
  label: string;
  submitLabel: string;
}> = [
  {
    id: 'station',
    label: 'Wstaw stację SN/nN',
    submitLabel: 'Utwórz odcinek i wstaw stację SN/nN',
  },
  {
    id: 'zksn',
    label: 'Wstaw ZK SN',
    submitLabel: 'Utwórz odcinek i wstaw ZK SN',
  },
  {
    id: 'branch_pole',
    label: 'Wstaw słup rozgałęźny',
    submitLabel: 'Utwórz odcinek i wstaw słup rozgałęźny',
  },
  {
    id: 'continue',
    label: 'Kontynuuj kolejny odcinek',
    submitLabel: 'Utwórz odcinek i kontynuuj ciąg',
  },
];

function validateForm(data: TrunkContinueFormData): FieldError[] {
  const errors: FieldError[] = [];

  if (!data.segment_kind) {
    errors.push({ field: 'segment_kind', message: 'Rodzaj odcinka jest wymagany.' });
  }

  if (!Number.isFinite(data.length_m) || data.length_m <= 0) {
    errors.push({ field: 'length_m', message: 'Podaj długość odcinka większą od 0 m.' });
  }

  if (!data.catalog_ref) {
    errors.push({ field: 'catalog_ref', message: 'Wybierz typ z katalogu SN.' });
  }

  return errors;
}

function engineeringTrunkLabel(trunkId: string): string {
  if (!trunkId.trim()) {
    return 'Nowy ciąg główny SN';
  }

  const indexedMatch = trunkId.match(/(?:corridor|trunk|magistrala)[_-]?(\d+)/i);
  if (indexedMatch?.[1]) {
    return `Ciąg główny SN ${Number(indexedMatch[1])}`;
  }

  return 'Ciąg główny SN';
}

function engineeringPortLabel(portId: string): string {
  const normalized = portId.trim().toLowerCase();
  if (normalized === 'trunk_end') return 'wolny koniec ciągu SN';
  if (normalized === 'station_out') return 'port wyjściowy stacji SN';
  if (!normalized) return 'głowica odpływowa pola SN';
  if (normalized.includes('branch')) return 'głowica odgałęzienia SN';
  if (normalized.includes('out')) return 'głowica odpływowa pola SN';
  if (normalized.includes('in')) return 'głowica wejściowa pola SN';
  return 'głowica odpływowa pola SN';
}

function formatValue(value: number | undefined, unit: string, fractionDigits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return 'brak danych';
  return `${value.toLocaleString('pl-PL', {
    maximumFractionDigits: fractionDigits,
  })} ${unit}`;
}

function techRows(entry: CatalogEntry | null, segmentKind: SegmentKind) {
  if (!entry) return [];

  return [
    ['Napięcie znamionowe', formatValue(entry.voltage_rating_kv, 'kV', 1)],
    ['Przekrój żył', formatValue(entry.cross_section_mm2, 'mm²', 0)],
    ['Obciążalność długotrwała', formatValue(entry.rated_current_a, 'A', 0)],
    ['Rezystancja R', formatValue(entry.r_ohm_per_km, 'Ω/km', 4)],
    ['Reaktancja X', formatValue(entry.x_ohm_per_km, 'Ω/km', 4)],
    [
      segmentKind === 'KABEL_SN' ? 'Pojemność C' : 'Susceptancja B',
      segmentKind === 'KABEL_SN'
        ? formatValue(entry.c_nf_per_km, 'nF/km', 1)
        : formatValue(entry.b_us_per_km, 'uS/km', 1),
    ],
    ['Materiał żył', entry.conductor_material || 'brak danych'],
    ['Izolacja', entry.insulation_type || (segmentKind === 'KABEL_SN' ? 'brak danych' : 'nie dotyczy')],
    ['Temperatura dopuszczalna', formatValue(entry.max_temperature_c, '°C', 0)],
    ['Norma / standard', entry.standard || 'brak danych'],
  ];
}

function normativeRows(segmentKind: SegmentKind) {
  if (segmentKind === 'KABEL_SN') {
    return [
      ['Zakres normowy', 'PN-HD 620 / IEC 60502-2; obciążalność według IEC 60287'],
      ['Warunki do sprawdzenia', 'temperatura gruntu, rezystywność cieplna gruntu, głębokość ułożenia, sposób ułożenia'],
      ['Współczynniki korekcyjne', 'kg dla grupowania torów, korekta temperatury, korekta gruntu i osłon rurowych'],
    ];
  }

  return [
    ['Zakres normowy', 'PN-EN 50341; przewody według PN-EN 50182 / IEC 61089'],
    ['Warunki do sprawdzenia', 'temperatura powietrza, wiatr, nasłonecznienie, sadź, naprężenia mechaniczne'],
    ['Współczynniki korekcyjne', 'korekta temperatury przewodu, warunków chłodzenia i obciążeń klimatycznych'],
  ];
}

function lengthLabel(lengthM: number): string {
  if (!Number.isFinite(lengthM) || lengthM <= 0) return 'nie podano';
  if (lengthM >= 1000) return `${(lengthM / 1000).toLocaleString('pl-PL')} km`;
  return `${lengthM.toLocaleString('pl-PL')} m`;
}

function saveBlockerLabel(reason: string | null, hasCatalog: boolean, lengthM: number): string | null {
  if (reason) {
    return reason;
  }
  if (!hasCatalog) return 'Wybierz typ katalogowy odcinka SN.';
  if (!Number.isFinite(lengthM) || lengthM <= 0) {
    return 'Podaj długość odcinka lub wybierz typową długość.';
  }
  return null;
}

export function TrunkContinueModal({
  isOpen,
  mode,
  trunkId,
  terminalId,
  terminalPortId = '',
  terminalName = '',
  terminalVoltageLabel = '',
  initialData,
  cableCatalogEntries = [],
  lineCatalogEntries = [],
  catalogLoading = false,
  catalogLoadError = null,
  submitDisabled = false,
  submitDisabledReason = null,
  onSubmit,
  onCancel,
}: TrunkContinueModalProps) {
  const [formData, setFormData] = useState<TrunkContinueFormData>({
    ...DEFAULT_DATA,
    ...initialData,
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [catalogEdited, setCatalogEdited] = useState(false);
  const lockSegmentKind = Boolean(initialData?.segment_kind);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...DEFAULT_DATA, ...initialData });
      setErrors([]);
      setTouched(new Set());
      setCatalogEdited(false);
    }
  }, [isOpen, initialData]);

  const activeCatalogEntries = useMemo(
    () => (formData.segment_kind === 'LINIA_NAPOWIETRZNA' ? lineCatalogEntries : cableCatalogEntries),
    [cableCatalogEntries, formData.segment_kind, lineCatalogEntries],
  );

  useEffect(() => {
    if (
      !isOpen
      || catalogLoading
      || catalogEdited
      || formData.catalog_ref
      || activeCatalogEntries.length === 0
    ) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      catalog_ref: activeCatalogEntries[0].id,
    }));
  }, [activeCatalogEntries, catalogEdited, catalogLoading, formData.catalog_ref, isOpen]);

  const selectedCatalogEntry = useMemo(
    () => activeCatalogEntries.find((entry) => entry.id === formData.catalog_ref) ?? null,
    [activeCatalogEntries, formData.catalog_ref],
  );

  const handleChange = useCallback((field: keyof TrunkContinueFormData, value: unknown) => {
    if (field === 'catalog_ref') {
      setCatalogEdited(true);
    }
    if (field === 'segment_kind') {
      setCatalogEdited(false);
    }
    setErrors((prev) =>
      prev.filter((error) => (
        error.field !== field
        && !(field === 'segment_kind' && error.field === 'catalog_ref')
      )),
    );
    setFormData((prev) => ({
      ...prev,
      [field]: value,
      ...(field === 'segment_kind' ? { catalog_ref: null } : {}),
    }));
    setTouched((prev) => new Set(prev).add(field));
  }, []);

  const submitData = useCallback((data: TrunkContinueFormData) => {
    const validationErrors = validateForm(data);
    setErrors(validationErrors);
    if (validationErrors.length === 0 && !submitDisabled) {
      onSubmit(data);
    }
  }, [onSubmit, submitDisabled]);

  const handleSubmit = useCallback(() => {
    submitData(formData);
  }, [formData, submitData]);

  const handleNextStepClick = useCallback((nextStep: TrunkNextStep) => {
    const nextData = { ...formData, next_step: nextStep };
    setFormData(nextData);
    setTouched((prev) => {
      const next = new Set(prev);
      next.add('next_step');
      if (!nextData.catalog_ref) next.add('catalog_ref');
      if (!Number.isFinite(nextData.length_m) || nextData.length_m <= 0) {
        next.add('length_m');
      }
      return next;
    });
    submitData(nextData);
  }, [formData, submitData]);

  const getFieldError = (field: string): string | undefined => {
    if (!touched.has(field) && errors.length === 0) return undefined;
    return errors.find((error) => error.field === field)?.message;
  };

  if (!isOpen) return null;

  const terminalDisplayName = terminalName || engineeringPortLabel(terminalPortId);
  const trunkDisplayName = engineeringTrunkLabel(trunkId);
  const terminalPortDisplayName = engineeringPortLabel(terminalPortId);
  const startsFromOpenEndpoint = ['trunk_end', 'station_out'].includes(
    terminalPortId.trim().toLowerCase(),
  );
  const rows = techRows(selectedCatalogEntry, formData.segment_kind);
  const normRows = normativeRows(formData.segment_kind);
  const catalogDisplayName = selectedCatalogEntry?.name ?? SEGMENT_KIND_LABELS[formData.segment_kind];
  const sourceLabel = startsFromOpenEndpoint
    ? 'Port wyjściowy stacji / wolny koniec ciągu SN'
    : 'Głowica odpływowa pola SN';
  const sourceHint = startsFromOpenEndpoint
    ? 'Kontynuacja zaczyna się za istniejącą stacją albo na wolnym końcu odcinka. Kolejny obiekt będzie końcem tworzonego odcinka.'
    : 'Odcinek zaczyna się dokładnie w głowicy odpływowej pola SN. Sekcja i szyna są tylko kontekstem rozdzielni.';
  const selectedNextStep =
    NEXT_STEP_OPTIONS.find((option) => option.id === formData.next_step) ?? NEXT_STEP_OPTIONS[0];
  const formBlockedReason = saveBlockerLabel(
    submitDisabledReason,
    Boolean(formData.catalog_ref),
    formData.length_m,
  );
  const buttonDisabled = submitDisabled || !formData.catalog_ref || formData.length_m <= 0;

  const sectionTitleClass =
    'mb-3 font-mono-eng text-[11px] font-bold uppercase tracking-[0.22em] text-[#19e6ff]';
  const labelClass =
    'mb-1 block font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]';
  const inputClass =
    'w-full border border-[#28425f] bg-[#07111c] px-3 py-2 font-mono-eng text-sm text-[#e6f4ff] outline-none focus:border-[#04d6ff]';
  const selectClass = `${inputClass} disabled:border-[#22364e] disabled:bg-[#050c14] disabled:text-[#607d99]`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#010711]/75 backdrop-blur-sm">
      <div
        className="mx-4 max-h-[92vh] w-full max-w-4xl overflow-y-auto border border-[#24405d] bg-[#07111c] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        data-testid="trunk-continue-modal"
        data-terminal-id={terminalId || undefined}
      >
        <div className="border-b border-[#17314c] bg-[#081522] px-6 py-4">
          <p className="font-mono-eng text-[11px] font-bold uppercase tracking-[0.22em] text-[#19e6ff]">
            Budowa ciągu SN
          </p>
          <h2 className="mt-1 font-mono-eng text-xl font-semibold text-white">
            {mode === 'create'
              ? startsFromOpenEndpoint
                ? 'Kontynuuj ciąg SN z wybranego portu'
                : 'Wyprowadź odcinek z głowicy pola SN'
              : 'Edycja odcinka SN'}
          </h2>
          <p className="mt-2 text-sm text-[#a8c7e2]">
            {startsFromOpenEndpoint
              ? 'Nowy odcinek zostanie dołączony do wolnego portu wyjściowego SN. Dalej wybierzesz stację, ZK SN, słup albo kolejny odcinek.'
              : 'Odcinek zostanie przypięty do konkretnej głowicy odpływowej pola SN. Sekcja i szyna są tylko kontekstem rozdzielni.'}
          </p>
        </div>

        <div className="grid gap-5 px-6 py-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <section>
              <h3 className={sectionTitleClass}>Kontekst elektryczny</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="border border-[#17314c] bg-[#0a1724] p-3 sm:col-span-2">
                  <span className="block text-[11px] uppercase tracking-[0.14em] text-[#8eb1cf]">
                    {sourceLabel}
                  </span>
                  <strong className="mt-1 block text-sm text-white">{terminalDisplayName}</strong>
                </div>
                <div className="border border-[#17314c] bg-[#0a1724] p-3">
                  <span className="block text-[11px] uppercase tracking-[0.14em] text-[#8eb1cf]">
                    Rola portu
                  </span>
                  <strong className="mt-1 block text-sm text-white">{terminalPortDisplayName}</strong>
                  <span className="mt-1 block text-[11px] text-[#8fb3d1]">
                    {terminalVoltageLabel || 'Napięcie niepodane w modelu'}
                  </span>
                </div>
                <div className="border border-[#17314c] bg-[#0a1724] p-3 sm:col-span-2">
                  <span className="block text-[11px] uppercase tracking-[0.14em] text-[#8eb1cf]">
                    Ciąg zasilania
                  </span>
                  <strong className="mt-1 block text-sm text-white">{trunkDisplayName}</strong>
                  <span className="mt-1 block text-[11px] text-[#8fb3d1]">
                    Dalej: utwórz odcinek, a w następnym kroku zakończ go stacją, ZK SN albo punktem
                    rozgałęźnym.
                  </span>
                </div>
              </div>
            </section>

            {formBlockedReason && (
              <div className="border border-[#a16207] bg-[#241806] px-3 py-2 text-xs text-[#ffc46b]">
                {formBlockedReason}
              </div>
            )}

            <section>
              <h3 className={sectionTitleClass}>Odcinek do utworzenia</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Rodzaj odcinka</label>
                  <select
                    value={formData.segment_kind}
                    onChange={(event) => handleChange('segment_kind', event.target.value)}
                    disabled={lockSegmentKind}
                    className={`${selectClass} ${
                      getFieldError('segment_kind') ? 'border-[#ff4d4d]' : ''
                    }`}
                  >
                    {Object.entries(SEGMENT_KIND_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {getFieldError('segment_kind') && (
                    <p className="mt-1 text-xs text-[#ff6b6b]">{getFieldError('segment_kind')}</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>Długość [m]</label>
                  <input
                    type="number"
                    value={formData.length_m || ''}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      handleChange('length_m', Number.isFinite(next) ? next : 0);
                    }}
                    step="1"
                    min="0"
                    className={`${inputClass} ${getFieldError('length_m') ? 'border-[#ff4d4d]' : ''}`}
                    placeholder="np. 500"
                  />
                  {getFieldError('length_m') && (
                    <p className="mt-1 text-xs text-[#ff6b6b]">{getFieldError('length_m')}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2" aria-label="Typowe długości odcinka">
                {LENGTH_PRESETS.map((length) => (
                  <button
                    key={length}
                    type="button"
                    onClick={() => handleChange('length_m', length)}
                    className={`border px-3 py-1.5 text-xs font-semibold ${
                      formData.length_m === length
                        ? 'border-[#26f0b1] bg-[#073024] text-[#26f0b1]'
                        : 'border-[#28425f] bg-[#07111c] text-[#b7d3ed] hover:border-[#04d6ff] hover:text-white'
                    }`}
                    data-testid={`length-preset-${length}`}
                  >
                    {lengthLabel(length)}
                  </button>
                ))}
              </div>
            </section>

            <section className="border-t border-[#17314c] pt-4">
              <h3 className={sectionTitleClass}>Typ katalogowy</h3>
              {catalogLoading ? (
                <div className="border border-[#174c75] bg-[#071b2b] px-3 py-2 text-xs text-[#a8c7e2]">
                  Ładowanie katalogu kabli i linii SN.
                </div>
              ) : activeCatalogEntries.length > 0 ? (
                <CatalogPicker
                  label={
                    formData.segment_kind === 'LINIA_NAPOWIETRZNA'
                      ? 'Linia z katalogu'
                      : 'Kabel z katalogu'
                  }
                  entries={activeCatalogEntries}
                  selectedId={formData.catalog_ref ?? ''}
                  onChange={(id) => handleChange('catalog_ref', id || null)}
                  required
                  error={getFieldError('catalog_ref')}
                  placeholder="Wyszukaj typ katalogowy SN"
                />
              ) : (
                <div className="border border-[#a16207] bg-[#241806] px-3 py-2 text-xs text-[#ffc46b]">
                  {catalogLoadError ?? 'Brak pozycji katalogowych dla wybranego rodzaju odcinka.'}
                </div>
              )}
            </section>

            <section className="border-t border-[#17314c] pt-4">
              <h3 className={sectionTitleClass}>Punkt wyprowadzenia</h3>
              <div className="border border-[#17314c] bg-[#071b2b] px-3 py-2 text-xs text-[#a8c7e2]">
                {sourceHint}
              </div>
            </section>

            <section className="border-t border-[#17314c] pt-4">
              <h3 className={sectionTitleClass}>Uwagi techniczne</h3>
              <div className="mb-3 grid gap-2">
                {normRows.map(([label, value]) => (
                  <div key={label} className="border border-[#17314c] bg-[#06101a] p-2 text-xs">
                    <span className="block uppercase tracking-[0.12em] text-[#7899b5]">{label}</span>
                    <strong className="mt-1 block font-medium text-[#e6f4ff]">{value}</strong>
                  </div>
                ))}
              </div>
              <textarea
                value={formData.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="Opcjonalnie: warunki ułożenia, rezerwa trasy, uwagi do katalogu."
              />
            </section>
          </div>

          <aside className="space-y-4">
            <section className="border border-[#1d3854] bg-[#081522] p-4">
              <h3 className={sectionTitleClass}>Decyzja techniczna</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-[#8eb1cf]">Źródło</dt>
                  <dd className="mt-1 text-white">{sourceLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-[#8eb1cf]">Odcinek</dt>
                  <dd className="mt-1 text-white">
                    {catalogDisplayName} · {lengthLabel(formData.length_m)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-[#8eb1cf]">Dalej</dt>
                  <dd className="mt-1 text-[#a8c7e2]">
                    W następnym kroku wybierz właściwy koniec odcinka.
                  </dd>
                </div>
              </dl>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {NEXT_STEP_OPTIONS.map((option) => {
                  const isSelected = formData.next_step === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleNextStepClick(option.id)}
                      className={`border px-2 py-2 text-left text-xs font-semibold ${
                        isSelected
                          ? 'border-[#26f0b1] bg-[#073024] text-[#26f0b1]'
                          : 'border-[#28425f] bg-[#06101a] text-[#d7ecff] hover:border-[#04d6ff] hover:text-white'
                      }`}
                      data-testid={`trunk-next-step-${option.id}`}
                      aria-pressed={isSelected}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              className="border border-[#1d3854] bg-[#081522] p-4"
              data-testid="trunk-selected-catalog-params"
            >
              <h3 className={sectionTitleClass}>Parametry katalogowe</h3>
              {selectedCatalogEntry ? (
                <>
                  <p className="text-sm font-semibold text-white">{selectedCatalogEntry.name}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {rows.map(([label, value]) => (
                      <div key={label} className="border border-[#17314c] bg-[#06101a] p-2">
                        <span className="block text-[10px] uppercase tracking-[0.12em] text-[#7899b5]">
                          {label}
                        </span>
                        <strong className="mt-1 block text-xs text-[#e6f4ff]">{value}</strong>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[#ffc46b]">
                  Wybierz typ katalogowy, żeby zapisać parametry techniczne odcinka.
                </p>
              )}
            </section>

            <section className="border border-[#28425f] bg-[#06101a] p-4">
              <h3 className={sectionTitleClass}>Warunek zapisu</h3>
              {formBlockedReason ? (
                <p className="text-sm text-[#ffc46b]">{formBlockedReason}</p>
              ) : (
                <p className="text-sm text-[#26f0b1]">
                  Dane odcinka są kompletne. Można utworzyć odcinek z wybranego punktu sieci.
                </p>
              )}
            </section>
          </aside>
        </div>

        <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-[#17314c] bg-[#050c14] px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="border border-[#28425f] bg-[#07111c] px-4 py-2 text-sm font-medium text-[#b7d3ed] hover:border-[#42617e] hover:bg-[#0a1826]"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={buttonDisabled}
            className="border border-[#1e6bff] bg-[#2864e8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3474ff] disabled:cursor-not-allowed disabled:border-[#22364e] disabled:bg-[#0b1623] disabled:text-[#607d99]"
          >
            {mode === 'create' ? selectedNextStep.submitLabel : 'Zapisz zmiany'}
          </button>
        </div>
      </div>
    </div>
  );
}
