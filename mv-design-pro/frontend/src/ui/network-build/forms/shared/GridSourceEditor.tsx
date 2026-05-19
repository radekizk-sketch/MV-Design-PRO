import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { clsx } from 'clsx';

import { fetchMvApparatusTypes, fetchSourceSystemTypes, getCatalogErrorMessage } from '../../../catalog/api';
import type { MVApparatusType, SourceSystemCatalogType } from '../../../catalog/types';
import type {
  GpzGroundingType,
  ManualSourceShortCircuitMode,
} from '../catalogPayload';
import {
  fetchGridSourcePreview,
  type ComplexOhmResponse,
  type GridSourcePreviewRequest,
  type GridSourcePreviewResponse,
} from '../gridSourcePreviewApi';

export interface GridSourceFormData {
  source_name: string;
  sn_voltage_kv: number | null;
  hv_voltage_kv: number | null;
  sk3_mva: number | null;
  sk3_hv_mva: number | null;
  rx_ratio: number | null;
  short_circuit_input_side: ShortCircuitInputSide;
  short_circuit_mode: ManualSourceShortCircuitMode;
  r_ohm: number | null;
  x_ohm: number | null;
  notes: string;
  catalog_ref: string | null;
  gpz_section_name: string;
  gpz_line_field_name: string;
  gpz_line_field_apparatus_kind: GpzLineFieldApparatusKind;
  gpz_line_field_apparatus_catalog_ref: string | null;
  sections_count: number;
  transformer_count: number;
  line_fields_per_section: number;
  manual_mode: boolean;
  zero_sequence_enabled: boolean;
  r0_ohm: number | null;
  x0_ohm: number | null;
  z0_z1_ratio: number | null;
  grounding_type: GpzGroundingType;
  grounding_r_ohm: number | null;
  grounding_x_ohm: number | null;
  thermal_time_s: number;
  /**
   * K3 toggle: tryb edycji formularza GPZ.
   * 'simplified' — tylko Sk''SN + R/X (szybka definicja źródła zewnętrznego).
   * 'advanced'   — pełna topologia: sekcje 110kV + TR + pola odpływowe GPZ.
   * UI-only: nie jest wysyłany do backendu.
   */
  complexity_mode: 'simplified' | 'advanced';
}

export interface GridSourceEditorProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialData?: Partial<GridSourceFormData>;
  onSubmit: (data: GridSourceFormData) => void;
  onCancel: () => void;
}

interface FieldError {
  field: string;
  message: string;
}

type ReadinessState = 'complete' | 'warning' | 'missing';
type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error';
type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';
type GpzLineFieldApparatusKind = 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH';
type ShortCircuitInputSide = 'SN' | 'HV_110';

interface GpzEditorSection {
  order: number;
  sectionName: string;
  busName: string;
  lineFieldNames: string[];
}

const DEFAULT_DATA: GridSourceFormData = {
  source_name: 'GPZ 1',
  sn_voltage_kv: 15,
  hv_voltage_kv: 110,
  sk3_mva: 310,
  sk3_hv_mva: null,
  rx_ratio: 0.12,
  short_circuit_input_side: 'SN',
  short_circuit_mode: 'SHORT_CIRCUIT_POWER',
  r_ohm: null,
  x_ohm: null,
  notes: '',
  catalog_ref: null,
  gpz_section_name: 'Sekcja',
  gpz_line_field_name: 'Pole odpływowe',
  gpz_line_field_apparatus_kind: 'BREAKER',
  gpz_line_field_apparatus_catalog_ref: null,
  sections_count: 2,
  transformer_count: 2,
  line_fields_per_section: 2,
  manual_mode: false,
  zero_sequence_enabled: true,
  r0_ohm: null,
  x0_ohm: null,
  z0_z1_ratio: 3.2,
  grounding_type: 'resistor_grounded',
  grounding_r_ohm: 12,
  grounding_x_ohm: null,
  thermal_time_s: 1,
  complexity_mode: 'simplified',
};

const FIELD_LABEL_CLASS =
  'block font-mono-eng text-[11px] font-semibold leading-tight text-[#a8bed6]';
const INPUT_CLASS =
  'h-8 w-full rounded-[3px] border bg-[#020812] px-2 font-mono-eng text-[12px]'
  + ' font-bold text-scada-text outline-none transition-colors placeholder:text-[#536b86]'
  + ' focus:border-[#00e5ff]';
const INPUT_DISABLED_CLASS =
  'disabled:border-[#15263a] disabled:bg-[#07111f] disabled:text-[#6d8198] disabled:opacity-100';
const ERROR_CLASS = 'mt-1 font-mono-eng text-[10px] text-[#ff4666]';

function isBlankValue(value: unknown): boolean {
  return value === undefined
    || value === null
    || (typeof value === 'string' && value.trim().length === 0);
}

function mergeInitialData(initialData?: Partial<GridSourceFormData>): GridSourceFormData {
  const merged: GridSourceFormData = { ...DEFAULT_DATA };

  for (const [key, value] of Object.entries(initialData ?? {})) {
    if (isBlankValue(value)) {
      continue;
    }
    (merged as unknown as Record<string, unknown>)[key] = value;
  }

  return {
    ...merged,
    manual_mode: false,
    short_circuit_input_side: 'SN',
    short_circuit_mode: 'SHORT_CIRCUIT_POWER',
    sections_count: Math.max(1, Math.min(4, Math.trunc(merged.sections_count || 1))),
    transformer_count: Math.max(1, Math.min(4, Math.trunc(merged.transformer_count || 1))),
    line_fields_per_section: Math.max(
      1,
      Math.min(12, Math.trunc(merged.line_fields_per_section || 1)),
    ),
  };
}

function withIndexedSuffix(base: string, index: number, total: number, fallback: string): string {
  const normalized = base.trim() || fallback;
  return total <= 1 ? normalized : `${normalized} ${index + 1}`;
}

function buildEditorGpzSections(data: GridSourceFormData): GpzEditorSection[] {
  const count = Math.max(1, Math.min(4, Math.trunc(data.sections_count || 1)));
  const lineFieldsPerSection = Math.max(
    1,
    Math.min(12, Math.trunc(data.line_fields_per_section || 1)),
  );
  const voltageLabel = formatNumber(data.sn_voltage_kv, 0);

  return Array.from({ length: count }, (_, index) => ({
    order: index + 1,
    sectionName: withIndexedSuffix(data.gpz_section_name, index, count, 'Sekcja GPZ'),
    busName: `Szyna GPZ S${index + 1} ${voltageLabel} kV`,
    lineFieldNames: Array.from(
      { length: lineFieldsPerSection },
      (_unused, fieldIndex) => withIndexedSuffix(
        data.gpz_line_field_name,
        fieldIndex,
        lineFieldsPerSection,
        'Pole liniowe GPZ',
      ),
    ),
  }));
}

function asNullableNumber(rawValue: string): number | null {
  return rawValue.trim() ? Number(rawValue) : null;
}

function isPositive(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validateForm(data: GridSourceFormData): FieldError[] {
  const errors: FieldError[] = [];
  const sourceDescriptor = 'wybranego katalogu systemowego';

  if (!data.source_name.trim()) {
    errors.push({ field: 'source_name', message: 'Nazwa GPZ jest wymagana.' });
  }

  if (!data.manual_mode && !data.catalog_ref?.trim()) {
    errors.push({ field: 'catalog_ref', message: 'Pozycja katalogowa jest wymagana.' });
  }

  if (!isPositive(data.sn_voltage_kv)) {
    errors.push({
      field: 'sn_voltage_kv',
      message: `Napięcie SN musi pochodzić z ${sourceDescriptor}.`,
    });
  }

  if (!Number.isInteger(data.sections_count) || data.sections_count < 1 || data.sections_count > 4) {
    errors.push({
      field: 'sections_count',
      message: 'Liczba sekcji GPZ musi mieścić się w zakresie 1-4.',
    });
  }

  if (
    !Number.isInteger(data.transformer_count)
    || data.transformer_count < 1
    || data.transformer_count > 4
  ) {
    errors.push({
      field: 'transformer_count',
      message: 'Liczba transformatorów 110/SN musi mieścić się w zakresie 1-4.',
    });
  }

  if (
    !Number.isInteger(data.line_fields_per_section)
    || data.line_fields_per_section < 1
    || data.line_fields_per_section > 12
  ) {
    errors.push({
      field: 'line_fields_per_section',
      message: 'Liczba pól liniowych na sekcję musi mieścić się w zakresie 1-12.',
    });
  }

  if (!Number.isFinite(data.thermal_time_s) || data.thermal_time_s <= 0) {
    errors.push({
      field: 'thermal_time_s',
      message: 'Czas cieplny tk musi być dodatni.',
    });
  }

  if (data.gpz_section_name.trim().length > 0 && data.gpz_section_name.trim().length < 3) {
    errors.push({
      field: 'gpz_section_name',
      message: 'Nazwa sekcji GPZ musi mieć co najmniej 3 znaki.',
    });
  }

  if (data.gpz_line_field_name.trim().length > 0 && data.gpz_line_field_name.trim().length < 3) {
    errors.push({
      field: 'gpz_line_field_name',
      message: 'Nazwa pola liniowego GPZ musi mieć co najmniej 3 znaki.',
    });
  }

  if (!data.gpz_line_field_apparatus_catalog_ref?.trim()) {
    errors.push({
      field: 'gpz_line_field_apparatus_catalog_ref',
      message: 'Dobierz aparat SN dla pól liniowych GPZ.',
    });
  }

  if (data.manual_mode) {
    if (data.short_circuit_input_side === 'HV_110') {
      if (!isPositive(data.hv_voltage_kv)) {
        errors.push({
          field: 'hv_voltage_kv',
          message: 'Tryb WN/SN wymaga dodatniego napiÄ™cia strony WN.',
        });
      }
      if (!isPositive(data.sk3_hv_mva)) {
        errors.push({
          field: 'sk3_hv_mva',
          message: 'Podaj moc zwarciowÄ… Sk3 na szynie 110 kV.',
        });
      }
      if (data.rx_ratio === null || data.rx_ratio < 0) {
        errors.push({
          field: 'rx_ratio',
          message: 'Stosunek R/X musi byc nieujemny.',
        });
      }
    } else if (data.short_circuit_mode === 'IMPEDANCE') {
      if (data.r_ohm === null || data.r_ohm < 0) {
        errors.push({
          field: 'r_ohm',
          message: 'W trybie impedancyjnym rezystancja R musi być nieujemna.',
        });
      }
      if (data.x_ohm === null || data.x_ohm <= 0) {
        errors.push({
          field: 'x_ohm',
          message: 'W trybie impedancyjnym reaktancja X musi być dodatnia.',
        });
      }
    } else {
      if (!isPositive(data.sk3_mva)) {
        errors.push({
          field: 'sk3_mva',
          message: 'Moc zwarciowa Sk3 musi być dodatnia.',
        });
      }
      if (data.rx_ratio === null || data.rx_ratio < 0) {
        errors.push({
          field: 'rx_ratio',
          message: 'Stosunek R/X musi być nieujemny.',
        });
      }
    }
  } else {
    if (!isPositive(data.sk3_mva)) {
      errors.push({
        field: 'sk3_mva',
        message: `Moc zwarciowa Sk3 musi pochodzić z ${sourceDescriptor}.`,
      });
    }
    if (data.rx_ratio === null || data.rx_ratio < 0) {
      errors.push({
        field: 'rx_ratio',
        message: `Stosunek R/X musi pochodzić z ${sourceDescriptor}.`,
      });
    }
  }

  if (data.zero_sequence_enabled) {
    if (data.r0_ohm !== null && data.r0_ohm < 0) {
      errors.push({
        field: 'r0_ohm',
        message: 'R0 nie może być ujemne.',
      });
    }
    if (data.x0_ohm !== null && data.x0_ohm <= 0) {
      errors.push({
        field: 'x0_ohm',
        message: 'X0 musi być dodatnie.',
      });
    }
    if (data.z0_z1_ratio !== null && data.z0_z1_ratio <= 0) {
      errors.push({
        field: 'z0_z1_ratio',
        message: 'Z0/Z1 musi być dodatnie.',
      });
    }
  }

  if (data.grounding_type === 'resistor_grounded') {
    if (data.grounding_r_ohm === null || data.grounding_r_ohm <= 0) {
      errors.push({
        field: 'grounding_r_ohm',
        message: 'Uziemienie rezystorowe wymaga dodatniej rezystancji R.',
      });
    }
  }

  if (data.grounding_type === 'petersen_coil') {
    if (data.grounding_x_ohm === null || data.grounding_x_ohm <= 0) {
      errors.push({
        field: 'grounding_x_ohm',
        message: 'Cewka Petersena wymaga dodatniej reaktancji X.',
      });
    }
  }

  return errors;
}

function normalizePolishIdentifier(value: string): string {
  return value
    .replace(/[ąćęłńóśźż]/gi, (match) => {
      const lower = match.toLowerCase();
      const normalized: Record<string, string> = {
        ą: 'a',
        ć: 'c',
        ę: 'e',
        ł: 'l',
        ń: 'n',
        ó: 'o',
        ś: 's',
        ź: 'z',
        ż: 'z',
      };
      const replacement = normalized[lower] ?? lower;
      return match === lower ? replacement : replacement.toUpperCase();
    })
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
}

function buildGpzIdentifier(sourceName: string): string {
  const normalized = normalizePolishIdentifier(sourceName);
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts[0]?.toUpperCase() === 'GPZ' && /^\d+$/.test(parts[1] ?? '')) {
    return `GPZ-${parts[1].padStart(2, '0')}`;
  }
  const token = parts.length > 1
    ? parts.slice(1).map((part) => part.slice(0, 3)).join('-')
    : parts[0]?.slice(0, 6);
  return `GPZ-${(token || 'SN').toUpperCase()}-01`;
}

function formatNumber(value: number | null | undefined, digits: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(digits);
}

function formatMva(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(1)} MVA`
    : '—';
}

function formatKiloamp(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} kA` : '—';
}

function formatComplex(value: ComplexOhmResponse | null | undefined): string {
  if (!value) {
    return '—';
  }
  const sign = value.x_ohm >= 0 ? '+' : '-';
  return `${value.r_ohm.toFixed(3)} ${sign} j${Math.abs(value.x_ohm).toFixed(4)} Ω`;
}

function sourceCatalogLabel(item: SourceSystemCatalogType): string {
  const manufacturer = item.operator_name ?? item.series ?? item.catalog_number;
  const voltage = Number.isFinite(item.voltage_rating_kv) ? `${item.voltage_rating_kv} kV` : 'SN';
  const sk = Number.isFinite(item.sk3_mva) ? `Sk3 ${item.sk3_mva} MVA` : 'Sk3 —';
  return [item.name, manufacturer, voltage, sk].filter(Boolean).join(' · ');
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
    default:
      return value ?? 'Aparat SN';
  }
}

function mvApparatusLabel(item: MVApparatusType): string {
  return `${item.name} · ${apparatusKindLabel(item.device_kind)} · Un ${formatNumber(item.u_n_kv, 1)} kV · In ${formatNumber(item.i_n_a, 0)} A`;
}

function matchesLineFieldApparatusKind(
  item: MVApparatusType,
  kind: GpzLineFieldApparatusKind,
): boolean {
  const deviceKind = item.device_kind?.toUpperCase();
  if (kind === 'BREAKER') {
    return deviceKind === 'WYLACZNIK' || deviceKind === 'REKLOZER' || deviceKind === 'BREAKER';
  }
  if (kind === 'DISCONNECTOR') {
    return deviceKind === 'ODLACZNIK' || deviceKind === 'UZIEMNIK' || deviceKind === 'DISCONNECTOR';
  }
  return deviceKind === 'ROZLACZNIK'
    || deviceKind === 'ROZLACZNIK_BEZPIECZNIKOWY'
    || deviceKind === 'LOAD_SWITCH';
}

function findCatalogItem(
  items: SourceSystemCatalogType[],
  catalogRef: string | null,
): SourceSystemCatalogType | null {
  if (!catalogRef) {
    return null;
  }
  return items.find((item) => item.id === catalogRef || `ZRODLO_SN/${item.id}` === catalogRef) ?? null;
}

function buildPreviewPayload(data: GridSourceFormData): GridSourcePreviewRequest | null {
  const previewVoltageKv = data.manual_mode && data.short_circuit_input_side === 'HV_110'
    ? data.hv_voltage_kv
    : data.sn_voltage_kv;
  const previewSk3Mva = data.manual_mode && data.short_circuit_input_side === 'HV_110'
    ? data.sk3_hv_mva
    : data.sk3_mva;

  if (!isPositive(previewVoltageKv) || !Number.isFinite(data.thermal_time_s) || data.thermal_time_s <= 0) {
    return null;
  }

  if (data.short_circuit_mode === 'IMPEDANCE') {
    if (data.r_ohm === null || data.r_ohm < 0 || !isPositive(data.x_ohm)) {
      return null;
    }
  } else if (!isPositive(previewSk3Mva) || data.rx_ratio === null || data.rx_ratio < 0) {
    return null;
  }

  if (
    data.zero_sequence_enabled
    && (
      data.r0_ohm !== null
      || data.x0_ohm !== null
    )
    && (data.r0_ohm === null || data.r0_ohm < 0 || !isPositive(data.x0_ohm))
  ) {
    return null;
  }

  return {
    voltage_kv: previewVoltageKv,
    short_circuit_mode: data.short_circuit_mode,
    sk3_mva: previewSk3Mva,
    rx_ratio: data.rx_ratio,
    r_ohm: data.r_ohm,
    x_ohm: data.x_ohm,
    zero_sequence_enabled: data.zero_sequence_enabled,
    r0_ohm: data.r0_ohm,
    x0_ohm: data.x0_ohm,
    z0_z1_ratio: data.z0_z1_ratio,
    tk_s: data.thermal_time_s,
    tb_s: 0.1,
  };
}

function getReadinessRows(data: GridSourceFormData): Array<[string, ReadinessState, string]> {
  const hasZeroSequenceInput =
    (data.r0_ohm !== null && data.x0_ohm !== null) || isPositive(data.z0_z1_ratio);
  const hasShortCircuitInput = data.manual_mode && data.short_circuit_input_side === 'HV_110'
    ? isPositive(data.hv_voltage_kv) && isPositive(data.sk3_hv_mva) && data.rx_ratio !== null
    : isPositive(data.sk3_mva) && data.rx_ratio !== null;

  return [
    ['Identyfikacja', data.source_name.trim() ? 'complete' : 'missing', 'Kompletne'],
    ['Napięcie SN', isPositive(data.sn_voltage_kv) ? 'complete' : 'missing', 'Kompletne'],
    [
      'Parametry zwarciowe',
      hasShortCircuitInput ? 'complete' : 'missing',
      'Kompletne',
    ],
    [
      'Uziemienie neutralnego',
      data.grounding_type === 'resistor_grounded' && !isPositive(data.grounding_r_ohm)
        ? 'missing'
        : 'complete',
      'Kompletne',
    ],
    ['Parametry normowe', 'complete', 'Kompletne'],
    ['Sekcje i pola', data.sections_count > 0 ? 'complete' : 'missing', 'Kompletne'],
    [
      'Składowa zerowa',
      !data.zero_sequence_enabled || !hasZeroSequenceInput
        ? 'warning'
        : 'complete',
      data.zero_sequence_enabled ? 'Niepełne' : 'Wymaga uzupełnienia',
    ],
  ];
}

function getReadinessText(state: ReadinessState, fallback: string): string {
  if (state === 'complete') {
    return 'Kompletne';
  }
  if (state === 'warning') {
    return fallback;
  }
  return 'Do konfiguracji';
}

export function GridSourceEditor({
  isOpen,
  mode,
  initialData,
  onSubmit,
  onCancel,
}: GridSourceEditorProps) {
  const [formData, setFormData] = useState<GridSourceFormData>(mergeInitialData(initialData));
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<GridSourcePreviewResponse | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [catalogItems, setCatalogItems] = useState<SourceSystemCatalogType[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>('idle');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [mvApparatusItems, setMvApparatusItems] = useState<MVApparatusType[]>([]);
  const [mvApparatusStatus, setMvApparatusStatus] = useState<CatalogStatus>('idle');
  const [mvApparatusError, setMvApparatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFormData(mergeInitialData(initialData));
    setErrors([]);
    setTouched(new Set());
    setPreview(null);
    setPreviewStatus('idle');
    setPreviewError(null);
  }, [initialData, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    let cancelled = false;
    setCatalogStatus('loading');
    setCatalogError(null);

    fetchSourceSystemTypes()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setCatalogItems(Array.isArray(items) ? items : []);
        setCatalogStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setCatalogItems([]);
        setCatalogStatus('error');
        setCatalogError(getCatalogErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || formData.catalog_ref || catalogItems.length === 0) {
      return;
    }

    const firstCatalogItem = catalogItems[0];
    setFormData((previous) => {
      if (previous.catalog_ref) {
        return previous;
      }

      return {
        ...previous,
        catalog_ref: firstCatalogItem.id,
        manual_mode: false,
        sn_voltage_kv: Number.isFinite(firstCatalogItem.voltage_rating_kv)
          ? firstCatalogItem.voltage_rating_kv
          : previous.sn_voltage_kv,
        sk3_mva: Number.isFinite(firstCatalogItem.sk3_mva)
          ? firstCatalogItem.sk3_mva
          : previous.sk3_mva,
        rx_ratio: typeof firstCatalogItem.rx_ratio === 'number' && Number.isFinite(firstCatalogItem.rx_ratio)
          ? firstCatalogItem.rx_ratio
          : previous.rx_ratio,
      };
    });
  }, [catalogItems, formData.catalog_ref, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    let cancelled = false;
    setMvApparatusStatus('loading');
    setMvApparatusError(null);

    fetchMvApparatusTypes()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setMvApparatusItems(Array.isArray(items) ? items : []);
        setMvApparatusStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setMvApparatusItems([]);
        setMvApparatusStatus('error');
        setMvApparatusError(getCatalogErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleChange = useCallback((field: keyof GridSourceFormData, value: unknown) => {
    setFormData((previous) => ({ ...previous, [field]: value as never }));
    setTouched((previous) => new Set(previous).add(field));
  }, []);

  const handleNumericChange = useCallback(
    (field: keyof GridSourceFormData) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        handleChange(field, asNullableNumber(event.target.value));
      },
    [handleChange],
  );

  const handleCatalogSelect = useCallback(
    (catalogRef: string) => {
      const selected = findCatalogItem(catalogItems, catalogRef);
      setFormData((previous) => ({
        ...previous,
        catalog_ref: catalogRef,
        manual_mode: false,
        sn_voltage_kv: selected?.voltage_rating_kv ?? previous.sn_voltage_kv,
        sk3_mva: selected?.sk3_mva ?? previous.sk3_mva,
        rx_ratio: selected?.rx_ratio ?? previous.rx_ratio,
      }));
      setTouched((previous) => {
        const next = new Set(previous);
        next.add('catalog_ref');
        next.add('manual_mode');
        return next;
      });
    },
    [catalogItems],
  );

  const handleSubmit = useCallback(() => {
    const validationErrors = validateForm(formData);
    setErrors(validationErrors);
    if (validationErrors.length === 0) {
      onSubmit(formData);
    }
  }, [formData, onSubmit]);

  const getFieldError = (field: string): string | undefined => {
    if (!touched.has(field) && errors.length === 0) {
      return undefined;
    }
    return errors.find((entry) => entry.field === field)?.message;
  };

  const sourceIdentifier = useMemo(
    () => buildGpzIdentifier(formData.source_name),
    [formData.source_name],
  );
  const selectedCatalogItem = useMemo(
    () => findCatalogItem(catalogItems, formData.catalog_ref),
    [catalogItems, formData.catalog_ref],
  );
  const filteredMvApparatusItems = useMemo(
    () =>
      mvApparatusItems.filter((item) =>
        matchesLineFieldApparatusKind(item, formData.gpz_line_field_apparatus_kind),
      ),
    [formData.gpz_line_field_apparatus_kind, mvApparatusItems],
  );
  const selectedLineFieldApparatus = useMemo(
    () =>
      mvApparatusItems.find((item) => item.id === formData.gpz_line_field_apparatus_catalog_ref)
      ?? null,
    [formData.gpz_line_field_apparatus_catalog_ref, mvApparatusItems],
  );
  const isHvShortCircuitInput =
    formData.manual_mode && formData.short_circuit_input_side === 'HV_110';
  const showRxInput = !formData.manual_mode || isHvShortCircuitInput;
  const shortCircuitSectionTitle = isHvShortCircuitInput
    ? 'Parametry zwarciowe na szynie 110 kV'
    : 'Parametry zwarciowe na szynach SN';
  const shortCircuitPowerField: keyof GridSourceFormData = isHvShortCircuitInput
    ? 'sk3_hv_mva'
    : 'sk3_mva';
  useEffect(() => {
    if (!isOpen || formData.gpz_line_field_apparatus_catalog_ref || filteredMvApparatusItems.length === 0) {
      return;
    }
    handleChange('gpz_line_field_apparatus_catalog_ref', filteredMvApparatusItems[0].id);
  }, [
    filteredMvApparatusItems,
    formData.gpz_line_field_apparatus_catalog_ref,
    handleChange,
    isOpen,
  ]);
  const gpzBuildSections = useMemo(() => buildEditorGpzSections(formData), [formData]);
  const gpzCouplerCount = Math.max(0, gpzBuildSections.length - 1);
  const dataSourceLabel =
    selectedCatalogItem?.name ?? formData.catalog_ref ?? 'Katalog źródła systemowego';
  const catalogBindingLabel = selectedCatalogItem
    ? sourceCatalogLabel(selectedCatalogItem)
    : formData.catalog_ref
      ? 'wybrano pozycję katalogową'
      : 'wybierz wariant katalogowy';
  const previewPayload = useMemo(() => buildPreviewPayload(formData), [formData]);
  const readinessRows = useMemo(() => getReadinessRows(formData), [formData]);
  const pendingMetricLabel = previewStatus === 'loading' ? 'obliczanie...' : '—';
  const ik1MetricLabel = previewStatus === 'loading'
    ? 'obliczanie...'
    : previewStatus === 'ready' && preview?.ik1_ka === null
      ? 'brak składowej zerowej Z0'
      : formatKiloamp(preview?.ik1_ka);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    if (previewPayload === null) {
      setPreview(null);
      setPreviewStatus('idle');
      setPreviewError(null);
      return undefined;
    }

    const controller = new AbortController();
    setPreview(null);
    setPreviewStatus('loading');
    setPreviewError(null);

    void fetchGridSourcePreview(previewPayload, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        setPreview(result);
        setPreviewStatus('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setPreview(null);
        setPreviewStatus('error');
        setPreviewError(
          error instanceof Error
            ? error.message
            : 'Backend solvera nie zwrócił podsumowania GPZ.',
        );
      });

    return () => controller.abort();
  }, [isOpen, previewPayload]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="grid-source-editor-panel h-full min-h-0 bg-[#050810]"
      data-testid="grid-source-editor-shell"
    >
      <div
        role="dialog"
        aria-labelledby="grid-source-editor-title"
        className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#050810] text-scada-text"
        data-testid="grid-source-editor-dialog"
      >
        <div className="shrink-0 border-b border-[#15324f] bg-[#07111f] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#00ffaa]" aria-hidden="true" />
                <h2
                  id="grid-source-editor-title"
                  className="font-mono-eng text-[16px] font-bold leading-none text-scada-text"
                >
                  {formData.source_name || 'GPZ'}
                </h2>
              </div>
              <p className="mt-1 font-mono-eng text-[11px] text-[#8fb4d8]">
                Dodanie GPZ do modelu sieci · {formatNumber(formData.sn_voltage_kv, 0)} kV
              </p>
            </div>
            <span className="rounded-[3px] border border-[#1d3550] bg-[#091728] px-2 py-1 font-mono-eng text-[10px] font-semibold uppercase tracking-[0.14em] text-[#67d9ff]">
              {mode === 'create' ? 'Nowy GPZ' : 'Edycja GPZ'}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <GpzAdvancedSummary
            sourceName={formData.source_name || 'GPZ'}
            sourceIdentifier={sourceIdentifier}
            voltageKv={formData.sn_voltage_kv}
            dataSourceLabel={dataSourceLabel}
            sectionsCount={gpzBuildSections.length}
            couplerCount={gpzCouplerCount}
            previewStatus={previewStatus}
          />

          {/* K3 toggle: Uproszczony / Zaawansowany */}
          <div
            className="flex items-center gap-0 overflow-hidden rounded-[3px] border border-[#15324f]"
            data-testid="k3-complexity-toggle"
            role="group"
            aria-label="Tryb edycji GPZ"
          >
            <button
              type="button"
              data-testid="k3-mode-simplified"
              onClick={() => handleChange('complexity_mode', 'simplified')}
              className={clsx(
                'flex-1 px-4 py-2 font-mono-eng text-[11px] font-bold transition-colors',
                formData.complexity_mode === 'simplified'
                  ? 'bg-[#06324c] text-[#66f6ff]'
                  : 'bg-[#020812] text-[#6d8fb3] hover:bg-[#071828] hover:text-[#a8bed6]',
              )}
            >
              Uproszczony
            </button>
            <div className="w-px self-stretch bg-[#15324f]" aria-hidden="true" />
            <button
              type="button"
              data-testid="k3-mode-advanced"
              onClick={() => handleChange('complexity_mode', 'advanced')}
              className={clsx(
                'flex-1 px-4 py-2 font-mono-eng text-[11px] font-bold transition-colors',
                formData.complexity_mode === 'advanced'
                  ? 'bg-[#06324c] text-[#66f6ff]'
                  : 'bg-[#020812] text-[#6d8fb3] hover:bg-[#071828] hover:text-[#a8bed6]',
              )}
            >
              Zaawansowany
            </button>
          </div>
          {formData.complexity_mode === 'simplified' && (
            <div className="rounded-[3px] border border-[#15324f] bg-[#050c17] px-3 py-2 font-mono-eng text-[10px] text-[#6d8fb3]">
              Tryb uproszczony: definiuj S&#x2033;<sub>k</sub> SN + R/X. Sekcje GPZ i topologia 110kV/TR pomijane (domyślne).
            </div>
          )}

          <ScadaSection title="Źródło danych i katalog">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div className="rounded-[3px] border border-[#15324f] bg-[#050c17] px-3 py-2">
                <div className="font-mono-eng text-[11px] font-bold uppercase tracking-[0.12em] text-[#66f6ff]">
                  Pakiet katalogowy GPZ
                </div>
                <p className="mt-1 font-mono-eng text-[10px] leading-snug text-[#8fb4d8]">
                  Źródło systemowe, parametry zwarciowe, uziemienie i pola SN pochodzą
                  z kompletnego wariantu katalogowego.
                </p>
              </div>

              <FieldShell label="Typ źródła z katalogu" error={getFieldError('catalog_ref')}>
                <select
                  value={formData.catalog_ref ?? ''}
                  onChange={(event) => handleCatalogSelect(event.target.value)}
                  disabled={catalogStatus === 'loading'}
                  className={clsx(selectClass(getFieldError('catalog_ref')), INPUT_DISABLED_CLASS)}
                >
                  <option value="">
                    {catalogStatus === 'loading'
                      ? 'Ładowanie katalogu źródeł...'
                      : '— wybierz źródło systemowe GPZ —'}
                  </option>
                  {catalogItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {sourceCatalogLabel(item)}
                    </option>
                  ))}
                </select>
              </FieldShell>
            </div>

            {catalogStatus === 'error' && (
              <SolverMessage tone="warning">
                {catalogError ?? 'Nie udało się pobrać katalogu źródeł systemowych SN.'}
              </SolverMessage>
            )}

            <div className="grid gap-2 lg:grid-cols-3">
              <AdvancedDataRow label="Źródło parametrów" value={dataSourceLabel} />
              <AdvancedDataRow
                label="Powiązanie katalogowe"
                value={catalogBindingLabel}
                tone={!formData.catalog_ref ? 'warning' : 'normal'}
              />
              <AdvancedDataRow
                label="Zasada obliczeń"
                value="Interfejs wysyła dane wejściowe, wynik wraca z backendu"
              />
            </div>
          </ScadaSection>

          <ScadaSection title="Identyfikacja GPZ">
            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-[1fr_1fr_130px]">
              <FieldShell label="Nazwa GPZ" error={getFieldError('source_name')}>
                <input
                  type="text"
                  value={formData.source_name}
                  onChange={(event) => handleChange('source_name', event.target.value)}
                  className={fieldClass(getFieldError('source_name'))}
                  placeholder="np. GPZ-01 albo nazwa stacji"
                />
              </FieldShell>

              <FieldShell label="Oznaczenie">
                <input
                  type="text"
                  value={sourceIdentifier}
                  readOnly
                  className={clsx(INPUT_CLASS, INPUT_DISABLED_CLASS, 'border-[#1d3550]')}
                />
              </FieldShell>

              <FieldShell label="Napięcie SN">
                <select
                  value={formData.sn_voltage_kv ?? ''}
                  onChange={(event) => handleChange('sn_voltage_kv', Number(event.target.value))}
                  className={selectClass(getFieldError('sn_voltage_kv'))}
                >
                  <option value={15}>15 kV</option>
                  <option value={20}>20 kV</option>
                  <option value={30}>30 kV</option>
                </select>
              </FieldShell>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <FieldShell label="Uziemienie punktu neutralnego" error={getFieldError('grounding_type')}>
                <select
                  value={formData.grounding_type}
                  onChange={(event) =>
                    handleChange('grounding_type', event.target.value as GpzGroundingType)
                  }
                  className={selectClass(getFieldError('grounding_type'))}
                >
                  <option value="resistor_grounded">rezystancja</option>
                  <option value="isolated">izolowany</option>
                  <option value="petersen_coil">cewka Petersena</option>
                  <option value="solid_grounded">bezpośrednio uziemiony</option>
                </select>
              </FieldShell>

              <FieldShell
                label={formData.grounding_type === 'petersen_coil' ? 'X cewki [ohm]' : 'R uziemienia [ohm]'}
                error={getFieldError(
                  formData.grounding_type === 'petersen_coil'
                    ? 'grounding_x_ohm'
                    : 'grounding_r_ohm',
                )}
              >
                <input
                  type="number"
                  value={
                    formData.grounding_type === 'petersen_coil'
                      ? formData.grounding_x_ohm ?? ''
                      : formData.grounding_r_ohm ?? ''
                  }
                  onChange={
                    formData.grounding_type === 'petersen_coil'
                      ? handleNumericChange('grounding_x_ohm')
                      : handleNumericChange('grounding_r_ohm')
                  }
                  disabled={!['resistor_grounded', 'petersen_coil'].includes(formData.grounding_type)}
                  className={clsx(
                    fieldClass(
                      getFieldError(
                        formData.grounding_type === 'petersen_coil'
                          ? 'grounding_x_ohm'
                          : 'grounding_r_ohm',
                      ),
                    ),
                    INPUT_DISABLED_CLASS,
                  )}
                />
              </FieldShell>
            </div>
          </ScadaSection>

          <ScadaSection title={shortCircuitSectionTitle}>
            {formData.manual_mode && (
              <div className="grid gap-2 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleChange('short_circuit_input_side', 'SN')}
                  className={modeButtonClass(formData.short_circuit_input_side === 'SN')}
                >
                  Tryb uproszczony: Sk3 po stronie SN
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('short_circuit_input_side', 'HV_110')}
                  className={modeButtonClass(formData.short_circuit_input_side === 'HV_110')}
                >
                  Tryb WN/SN: Sk3 na szynie 110 kV
                </button>
              </div>
            )}

            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {isHvShortCircuitInput && (
                <FieldShell label="Napiecie szyny WN" unit="kV" error={getFieldError('hv_voltage_kv')}>
                  <input
                    type="number"
                    value={formData.hv_voltage_kv ?? ''}
                    onChange={handleNumericChange('hv_voltage_kv')}
                    className={fieldClass(getFieldError('hv_voltage_kv'))}
                  />
                </FieldShell>
              )}

              <FieldShell
                label={isHvShortCircuitInput ? "Moc zwarciowa Sk'' na 110 kV" : "Moc zwarciowa Sk'' po stronie SN"}
                unit="MVA"
                error={getFieldError(shortCircuitPowerField)}
              >
                <input
                  type="number"
                  value={isHvShortCircuitInput ? formData.sk3_hv_mva ?? '' : formData.sk3_mva ?? ''}
                  onChange={handleNumericChange(shortCircuitPowerField)}
                  className={fieldClass(getFieldError(shortCircuitPowerField))}
                />
              </FieldShell>

              {showRxInput && (
                <FieldShell label="Stosunek R/X" error={getFieldError('rx_ratio')}>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.rx_ratio ?? ''}
                    onChange={handleNumericChange('rx_ratio')}
                    className={fieldClass(getFieldError('rx_ratio'))}
                  />
                </FieldShell>
              )}

              <FieldShell label="Normalny czas obliczeń">
                <select className={selectClass()}>
                  <option>minimum / maksimum</option>
                  <option>maksimum</option>
                  <option>minimum</option>
                </select>
              </FieldShell>

              <FieldShell label="Czas cieplny tk" unit="s" error={getFieldError('thermal_time_s')}>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={formData.thermal_time_s}
                  onChange={(event) =>
                    handleChange('thermal_time_s', Number(event.target.value || 0))
                  }
                  className={fieldClass(getFieldError('thermal_time_s'))}
                />
              </FieldShell>
            </div>

            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              <FieldShell label="Prąd zwarciowy Ik'' (3-faz. maks.)">
                <ReadOnlyMetric value={preview ? formatKiloamp(preview.ik3_ka) : pendingMetricLabel} />
              </FieldShell>

              <FieldShell label="Prąd zwarciowy Ik'' (1-faz. maks.)">
                <ReadOnlyMetric
                  value={ik1MetricLabel}
                  tone={previewStatus === 'ready' && preview?.ik1_ka !== null ? 'ok' : 'warning'}
                />
              </FieldShell>

              <FieldShell label="Z1 źródła">
                <ReadOnlyMetric value={preview ? formatComplex(preview.z1_ohm) : pendingMetricLabel} />
              </FieldShell>
            </div>
          </ScadaSection>

          <ScadaSection title="Parametry normowe">
            <div className="grid gap-3 lg:grid-cols-2">
              <FieldShell label="Norma obliczeniowa">
                <select className={selectClass()}>
                  <option>IEC 60909:2016</option>
                </select>
              </FieldShell>

              <FieldShell label="Częstotliwość">
                <select className={selectClass()}>
                  <option>50 Hz</option>
                  <option>60 Hz</option>
                </select>
              </FieldShell>

              <FieldShell label="Współczynnik napięcia c (maks.)">
                <select className={selectClass()}>
                  <option>1.10</option>
                  <option>1.05</option>
                </select>
              </FieldShell>

              <FieldShell label="Współczynnik napięcia c (min.)">
                <select className={selectClass()}>
                  <option>1.00</option>
                  <option>0.95</option>
                </select>
              </FieldShell>
            </div>
          </ScadaSection>

          {formData.complexity_mode === 'advanced' && <ScadaSection title="Sekcje szyn GPZ">
            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              <FieldShell label="Liczba sekcji szyn SN" error={getFieldError('sections_count')}>
                <select
                  value={formData.sections_count}
                  onChange={(event) => handleChange('sections_count', Number(event.target.value))}
                  className={selectClass(getFieldError('sections_count'))}
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </FieldShell>

              <FieldShell label="Transformatory 110/SN" error={getFieldError('transformer_count')}>
                <select
                  value={formData.transformer_count}
                  onChange={(event) => handleChange('transformer_count', Number(event.target.value))}
                  className={selectClass(getFieldError('transformer_count'))}
                >
                  <option value={1}>1 x 110/SN</option>
                  <option value={2}>2 x 110/SN</option>
                  <option value={3}>3 x 110/SN</option>
                  <option value={4}>4 x 110/SN</option>
                </select>
              </FieldShell>

              <FieldShell label="Bazowa nazwa sekcji GPZ" error={getFieldError('gpz_section_name')}>
                <input
                  type="text"
                  value={formData.gpz_section_name}
                  onChange={(event) => handleChange('gpz_section_name', event.target.value)}
                  className={fieldClass(getFieldError('gpz_section_name'))}
                />
              </FieldShell>

              <FieldShell label="Bazowa nazwa pola liniowego" error={getFieldError('gpz_line_field_name')}>
                <input
                  type="text"
                  value={formData.gpz_line_field_name}
                  onChange={(event) => handleChange('gpz_line_field_name', event.target.value)}
                  className={fieldClass(getFieldError('gpz_line_field_name'))}
                />
              </FieldShell>

              <FieldShell
                label="Liczba pól liniowych na sekcję"
                error={getFieldError('line_fields_per_section')}
              >
                <select
                  value={formData.line_fields_per_section}
                  onChange={(event) =>
                    handleChange('line_fields_per_section', Number(event.target.value))
                  }
                  className={selectClass(getFieldError('line_fields_per_section'))}
                >
                  {Array.from({ length: 12 }, (_unused, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </FieldShell>
            </div>

            <div className="grid gap-3 xl:grid-cols-[180px_minmax(0,1fr)]">
              <FieldShell label="Aparat pól liniowych">
                <select
                  value={formData.gpz_line_field_apparatus_kind}
                  onChange={(event) => {
                    handleChange(
                      'gpz_line_field_apparatus_kind',
                      event.target.value as GpzLineFieldApparatusKind,
                    );
                    handleChange('gpz_line_field_apparatus_catalog_ref', null);
                  }}
                  className={selectClass()}
                >
                  <option value="BREAKER">Wyłącznik</option>
                  <option value="LOAD_SWITCH">Rozłącznik</option>
                  <option value="DISCONNECTOR">Odłącznik</option>
                </select>
              </FieldShell>

              <FieldShell
                label="Typ katalogowy aparatu GPZ"
                error={getFieldError('gpz_line_field_apparatus_catalog_ref')}
              >
                <select
                  value={formData.gpz_line_field_apparatus_catalog_ref ?? ''}
                  onChange={(event) =>
                    handleChange('gpz_line_field_apparatus_catalog_ref', event.target.value || null)
                  }
                  className={selectClass()}
                >
                  <option value="">
                    {mvApparatusStatus === 'loading'
                      ? 'Ładowanie katalogu APARAT_SN...'
                      : '— wybierz aparat dla pól GPZ —'}
                  </option>
                  {filteredMvApparatusItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {mvApparatusLabel(item)}
                    </option>
                  ))}
                </select>
                {mvApparatusStatus === 'error' && (
                  <span className={ERROR_CLASS}>
                    {mvApparatusError ?? 'Nie udało się pobrać katalogu APARAT_SN.'}
                  </span>
                )}
              </FieldShell>
            </div>

            <div className="grid gap-2 xl:grid-cols-2">
              {gpzBuildSections.map((section) => (
                <div
                  key={section.order}
                  className="rounded-[3px] border border-[#163a5c] bg-[#050c17] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono-eng text-[12px] font-bold text-scada-text">
                        {section.sectionName}
                      </p>
                      <p className="mt-1 font-mono-eng text-[10px] text-[#83a8ca]">
                        {section.busName}
                      </p>
                    </div>
                    <span className="rounded-[3px] border border-[#1d5b90] bg-[#081d33] px-2 py-1 font-mono-eng text-[10px] font-bold text-[#67d9ff]">
                      {section.lineFieldNames.length} pól
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {section.lineFieldNames.slice(0, 12).map((fieldName, fieldIndex) => (
                      <div
                        key={`${section.order}-${fieldName}-${fieldIndex}`}
                        className="min-w-0 rounded-[3px] border border-[#102d48] bg-[#020812] px-2 py-1 font-mono-eng text-[10px] text-[#a8bed6]"
                        title={`${fieldName} · ${selectedLineFieldApparatus?.name ?? 'aparat nie wybrany'}`}
                      >
                        <div className="truncate font-bold text-scada-text">{fieldName}</div>
                        <div className="truncate text-[#6f9fc5]">
                          {selectedLineFieldApparatus?.name ?? 'dobierz aparat'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <CheckLine checked={gpzBuildSections.length > 1} label="Sprzęgło sekcji między szynami" />
              <CheckLine checked label="Zacisk wyjściowy każdego pola liniowego" />
            </div>
          </ScadaSection>}

          {formData.complexity_mode === 'advanced' && <ScadaSection title="Składowa zerowa">
            <label className="flex items-center gap-2 font-mono-eng text-[12px] text-scada-text">
              <input
                type="checkbox"
                checked={formData.zero_sequence_enabled}
                onChange={(event) => handleChange('zero_sequence_enabled', event.target.checked)}
                className="h-3.5 w-3.5 accent-[#00a7ff]"
              />
              Definiuj R0/X0 dla obliczeń doziemnych
            </label>

            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              <FieldShell label="R0 [ohm]" error={getFieldError('r0_ohm')}>
                <input
                  type="number"
                  value={formData.r0_ohm ?? ''}
                  onChange={handleNumericChange('r0_ohm')}
                  disabled={!formData.zero_sequence_enabled}
                  className={clsx(fieldClass(getFieldError('r0_ohm')), INPUT_DISABLED_CLASS)}
                />
              </FieldShell>
              <FieldShell label="X0 [ohm]" error={getFieldError('x0_ohm')}>
                <input
                  type="number"
                  value={formData.x0_ohm ?? ''}
                  onChange={handleNumericChange('x0_ohm')}
                  disabled={!formData.zero_sequence_enabled}
                  className={clsx(fieldClass(getFieldError('x0_ohm')), INPUT_DISABLED_CLASS)}
                />
              </FieldShell>
              <FieldShell label="Z0/Z1" error={getFieldError('z0_z1_ratio')}>
                <input
                  type="number"
                  value={formData.z0_z1_ratio ?? ''}
                  onChange={handleNumericChange('z0_z1_ratio')}
                  disabled={!formData.zero_sequence_enabled}
                  className={clsx(fieldClass(getFieldError('z0_z1_ratio')), INPUT_DISABLED_CLASS)}
                />
              </FieldShell>
            </div>
          </ScadaSection>}

          <ScadaSection title="Podsumowanie obliczone">
            <div className="rounded-[3px] border border-[#1d5b90] bg-[#081d33] p-3">
              {previewStatus === 'loading' && (
                <SolverMessage tone="neutral">
                  Trwa obliczanie podsumowania z danych wejściowych.
                </SolverMessage>
              )}
              {previewStatus === 'error' && (
                <SolverMessage tone="warning">
                  {previewError ?? 'Nie udało się wyznaczyć podsumowania GPZ.'}
                </SolverMessage>
              )}
              <SummaryRow
                label="Sk'' (SN)"
                value={formatMva(preview?.sk_mva)}
              />
              <SummaryRow
                label="Ik'' (3-faz. maks.)"
                value={formatKiloamp(preview?.ik3_ka)}
              />
              <SummaryRow
                label="Ik'' (1-faz. maks.)"
                value={formatKiloamp(preview?.ik1_ka)}
              />
              <SummaryRow label="κ (IEC 60909)" value={formatNumber(preview?.kappa, 3)} />
              <SummaryRow label="ip (3-faz. maks.)" value={formatKiloamp(preview?.ip_ka)} />
              <SummaryRow label="Ith (3-faz., tk)" value={formatKiloamp(preview?.ith_ka)} />
              <SummaryRow label="Z1 źródła" value={formatComplex(preview?.z1_ohm)} />
              <SummaryRow label="Z0 źródła" value={formatComplex(preview?.z0_ohm)} />
              <SummaryRow
                label="Źródło wyników"
                value={preview ? 'Obliczenie IEC 60909 po stronie serwera' : 'nie wyznaczono'}
              />
            </div>
          </ScadaSection>

          <ScadaSection title="Kontrola GPZ">
            <div className="divide-y divide-[#193451] border border-[#193451]">
              {readinessRows.map(([label, state, fallback]) => (
                <ReadinessRow
                  key={label}
                  label={label}
                  state={state}
                  value={getReadinessText(state, fallback)}
                />
              ))}
            </div>

            {previewStatus === 'ready' && preview?.z0_ohm === null && (
              <div className="rounded-[3px] border border-[#f0b429]/50 bg-[#2b2105] px-3 py-2 font-mono-eng text-[11px] leading-snug text-[#ffce73]">
                Backend nie zwrócił składowej zerowej. Wynik zwarcia doziemnego pozostaje niedostępny.
              </div>
            )}
          </ScadaSection>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-[#15324f] bg-[#07111f] px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-[3px] border border-[#1d3550] bg-[#08111f] px-5 font-mono-eng text-[12px] font-semibold text-[#a8bed6] transition-colors hover:border-[#67d9ff] hover:text-scada-text"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="h-9 rounded-[3px] border border-[#1d63ff] bg-[#2d6bf0] px-8 font-mono-eng text-[13px] font-bold text-white shadow-[0_0_18px_rgba(45,107,240,0.22)] transition-colors hover:bg-[#3a7cff]"
          >
            Zapisz GPZ
          </button>
        </div>
      </div>
    </div>
  );
}

function modeButtonClass(active: boolean): string {
  return clsx(
    'min-h-9 rounded-[3px] border px-3 py-2 text-left font-mono-eng text-[11px] font-bold transition-colors',
    active
      ? 'border-[#00e5ff] bg-[#06324c] text-[#66f6ff] shadow-[inset_0_0_0_1px_rgba(0,229,255,0.25)]'
      : 'border-[#1d3550] bg-[#020812] text-[#8fb4d8] hover:border-[#2f6b95]',
  );
}

function GpzAdvancedSummary({
  sourceName,
  sourceIdentifier,
  voltageKv,
  dataSourceLabel,
  sectionsCount,
  couplerCount,
  previewStatus,
}: {
  sourceName: string;
  sourceIdentifier: string;
  voltageKv: number | null;
  dataSourceLabel: string;
  sectionsCount: number;
  couplerCount: number;
  previewStatus: PreviewStatus;
}) {
  const solverText =
    previewStatus === 'ready'
      ? 'podsumowanie z backendu'
      : previewStatus === 'loading'
        ? 'backend liczy preview'
        : 'brak wyniku preview';

  return (
    <section
      className="overflow-hidden rounded-[3px] border border-[#15547b] bg-[#06101c]"
      data-testid="gpz-advanced-summary"
    >
      <div className="border-b border-[#15547b] bg-[#020812] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono-eng text-[10px] font-bold uppercase tracking-[0.24em] text-[#66f6ff]">
              GPZ / rozdzielnia SN
            </p>
            <h3 className="mt-2 font-mono-eng text-[18px] font-bold leading-tight text-scada-text">
              {sourceName}
            </h3>
            <p className="mt-1 font-mono-eng text-[11px] text-[#8fb4d8]">
              {sourceIdentifier} · {formatNumber(voltageKv, 0)} kV · {dataSourceLabel}
            </p>
          </div>
          <div className="grid min-w-[260px] grid-cols-3 gap-2">
            <HeaderMetric label="Sekcje szyn" value={String(sectionsCount)} />
            <HeaderMetric label="Sprzęgła" value={String(couplerCount)} />
            <HeaderMetric label="Wynik" value={solverText} tone={previewStatus === 'ready' ? 'ok' : 'normal'} />
          </div>
        </div>
      </div>
      <div className="grid gap-0 border-t border-[#0c2d45] md:grid-cols-3">
        <AdvancedDataRow label="Tok budowy" value="GPZ → pole liniowe → magistrala SN" />
        <AdvancedDataRow label="Zaciski" value="każde pole ma osobny zacisk wyjściowy" />
        <AdvancedDataRow label="Obliczenia" value="wartości liczbowe tylko z backendu" />
      </div>
    </section>
  );
}

function HeaderMetric({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'ok';
}) {
  return (
    <div className="rounded-[3px] border border-[#15324f] bg-[#020812] px-2 py-1.5">
      <div className="font-mono-eng text-[9px] uppercase tracking-[0.12em] text-[#6d8fb3]">
        {label}
      </div>
      <div
        className={clsx(
          'mt-1 truncate font-mono-eng text-[11px] font-bold',
          tone === 'ok' ? 'text-[#00ffaa]' : 'text-scada-text',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function AdvancedDataRow({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'warning';
}) {
  return (
    <div className="min-w-0 border-[#12324f] px-3 py-2 md:border-r md:last:border-r-0">
      <div className="font-mono-eng text-[9px] uppercase tracking-[0.14em] text-[#6d8fb3]">
        {label}
      </div>
      <div
        className={clsx(
          'mt-1 truncate font-mono-eng text-[11px] font-bold',
          tone === 'warning' ? 'text-[#ffce73]' : 'text-scada-text',
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function fieldClass(error?: string): string {
  return clsx(
    INPUT_CLASS,
    INPUT_DISABLED_CLASS,
    error ? 'border-[#ff4666]' : 'border-[#1d3550]',
  );
}

function selectClass(error?: string): string {
  return clsx(
    INPUT_CLASS,
    'appearance-auto',
    error ? 'border-[#ff4666]' : 'border-[#1d3550]',
  );
}

function ScadaSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[3px] border border-[#12324f] bg-[#07111f]">
      <div className="border-b border-[#12324f] bg-[#020812] px-3 py-2 font-mono-eng text-[12px] font-bold uppercase tracking-[0.14em] text-[#66f6ff]">
        {title}
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  );
}

function FieldShell({
  label,
  unit,
  error,
  children,
}: {
  label: string;
  unit?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1">
      <span className={FIELD_LABEL_CLASS}>
        {label}
        {unit && <span className="ml-1 text-[#6d8fb3]">{unit}</span>}
      </span>
      {children}
      {error && <span className={ERROR_CLASS}>{error}</span>}
    </label>
  );
}

function ReadOnlyMetric({
  value,
  tone = 'ok',
}: {
  value: string;
  tone?: 'ok' | 'warning';
}) {
  return (
    <div
      className={clsx(
        'flex h-8 items-center rounded-[3px] border border-[#1d3550] bg-[#020812] px-2 font-mono-eng text-[12px] font-bold',
        tone === 'warning' ? 'text-[#ffce73]' : 'text-[#00ffaa]',
      )}
    >
      {value}
    </div>
  );
}

function CheckLine({
  checked,
  label,
}: {
  checked: boolean;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2 font-mono-eng text-[12px] text-scada-text">
      <input type="checkbox" checked={checked} readOnly className="h-3.5 w-3.5 accent-[#00a7ff]" />
      {label}
    </span>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,auto)] gap-3 border-b border-[#2a5b88]/70 py-1 last:border-b-0">
      <span className="font-mono-eng text-[11px] text-[#9ecbff]">{label}</span>
      <span className="text-right font-mono-eng text-[11px] font-bold text-scada-text">{value}</span>
    </div>
  );
}

function SolverMessage({
  tone,
  children,
}: {
  tone: 'neutral' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        'mb-2 rounded-[3px] border px-3 py-2 font-mono-eng text-[11px] leading-snug',
        tone === 'warning'
          ? 'border-[#f0b429]/50 bg-[#2b2105] text-[#ffce73]'
          : 'border-[#1d5b90] bg-[#061426] text-[#9ecbff]',
      )}
    >
      {children}
    </div>
  );
}

function ReadinessRow({
  label,
  state,
  value,
}: {
  label: string;
  state: ReadinessState;
  value: string;
}) {
  const tone = state === 'complete'
    ? 'text-[#00ffaa]'
    : state === 'warning'
      ? 'text-[#ffb547]'
      : 'text-[#ff4666]';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3 bg-[#050c17] px-3 py-2 font-mono-eng text-[11px]">
      <span className="text-[#a8bed6]">{label}</span>
      <span className={clsx('text-right font-bold', tone)}>{value}</span>
    </div>
  );
}
