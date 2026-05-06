/**
 * formatPolishValue — kanoniczny formatter wartości i braków danych.
 *
 * KONTRAKT (BINDING):
 *   • brak wartości (null / undefined / NaN) → '—' (lub etykieta tekstowa wybrana przez wywołującego)
 *   • status obliczeń ≠ 'ok' → tekstowa etykieta polskojęzyczna, NIGDY '0.00'
 *   • wartość 0 z statusem 'ok' jest jedynym przypadkiem, w którym wolno wyrenderować '0.00'
 *
 * Cel: wyeliminować chaos „ściany zer” w SLD i panelach inżynierskich
 * w sytuacjach, gdy obliczenia nie zostały uruchomione, dane są niekompletne,
 * a komponent zwracał błędnie `(value ?? 0).toFixed(2)`.
 *
 * Używaj zamiast lokalnych `formatNumber`. Każdy nowy widok inżynierski powinien
 * korzystać wyłącznie z tej funkcji albo z helperów `formatCurrent` /
 * `formatActivePower` / `formatReactivePower` / `formatVoltage` / `formatPower`.
 *
 * @see docs/sld/SLD_CAD_SCADA_REBUILD.md §3 (zakaz 0.00)
 * @see docs/audits/SLD_REBUILD_CAD_SCADA_AUDIT.md PR-1
 */

/** Status wyniku obliczeń wg kanonu V12.x. */
export type CalculationStatus =
  | 'ok'
  | 'partial'
  | 'error'
  | 'none'
  | 'n_a'
  | 'pending';

/** Etykiety polskojęzyczne dla statusów. */
export const POLISH_STATUS_LABEL: Readonly<Record<CalculationStatus, string>> = {
  ok: 'wynik pełny',
  partial: 'wynik częściowy',
  error: 'wynik błędny',
  none: 'brak obliczeń',
  n_a: 'nie dotyczy',
  pending: 'w toku',
};

/** Skrócone etykiety placeholdera (dla SLD i wąskich kolumn). */
export const POLISH_STATUS_SHORT: Readonly<Record<CalculationStatus, string>> = {
  ok: '—', // przy ok wartość renderuje wywołujący
  partial: 'cz.',
  error: 'bł.',
  none: '—',
  n_a: 'n.d.',
  pending: '…',
};

/** Standardowy placeholder braku danych (em-dash). */
export const MISSING_DASH = '—' as const;

/** Tekstowa etykieta braku danych (do inspektora i tabel). */
export const MISSING_LABEL = 'brak danych' as const;

/** Tekstowa etykieta nieuruchomionych obliczeń. */
export const NO_CALC_LABEL = 'brak obliczeń' as const;

export interface FormatPolishValueOptions {
  /** Liczba miejsc po przecinku (domyślnie 2). */
  decimals?: number;
  /** Jednostka dopisana po wartości, np. 'A', 'kV', 'kW'. */
  unit?: string;
  /**
   * Status obliczeń. Steruje renderowaniem braków:
   *   • 'ok'      → renderuje value
   *   • 'partial' → renderuje value z badge 'cz.'
   *   • 'error'   → renderuje 'wynik błędny'
   *   • 'none'    → renderuje 'brak obliczeń'
   *   • 'n_a'     → renderuje 'nie dotyczy'
   *   • 'pending' → renderuje 'w toku'
   * Jeżeli pominięty, status wnioskowany z value (null/undefined/NaN → 'none').
   */
  status?: CalculationStatus;
  /**
   * Forma placeholdera braku:
   *   • 'short' → '—' / 'cz.' / 'n.d.' / '…'  (do SLD i wąskich kolumn)
   *   • 'long'  → 'brak danych' / 'wynik częściowy' / ...  (do inspektora)
   */
  placeholder?: 'short' | 'long';
  /**
   * Locale dla formatowania liczb. Domyślnie 'pl-PL' (separator dziesiętny ',', tysięcy ' ').
   * Zmieniamy tylko w testach lub eksportach inżynierskich.
   */
  locale?: string;
}

/**
 * Główny formatter wartości inżynierskich.
 *
 * Niezmienniki:
 *   • value === null / undefined / NaN  ⇒  zwraca placeholder bez '0.00'
 *   • status !== 'ok' i status !== 'partial'  ⇒  zwraca tekst statusu
 *   • value === 0 i status === 'ok'  ⇒  renderuje '0,00 <unit>'
 */
export function formatPolishValue(
  value: number | null | undefined,
  options: FormatPolishValueOptions = {},
): string {
  const {
    decimals = 2,
    unit,
    status,
    placeholder = 'short',
    locale = 'pl-PL',
  } = options;

  const valueIsMissing =
    value === null ||
    value === undefined ||
    Number.isNaN(value as number) ||
    !Number.isFinite(value as number);

  // Jeżeli status jest podany jawnie i nie jest 'ok'/'partial', zwracamy etykietę
  // statusu (np. 'brak obliczeń', 'nie dotyczy') — niezależnie od value.
  if (status && status !== 'ok' && status !== 'partial') {
    return placeholder === 'long'
      ? POLISH_STATUS_LABEL[status]
      : POLISH_STATUS_SHORT[status];
  }

  // Brak value bez jawnego statusu → traktujemy jako brak danych ('—' / 'brak danych').
  if (valueIsMissing) {
    return placeholder === 'long' ? MISSING_LABEL : MISSING_DASH;
  }

  const effectiveStatus: CalculationStatus = status ?? 'ok';

  const rawNumeric = (value as number).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // Normalizacja spacji specjalnych (NBSP U+00A0, NNBSP U+202F, thin U+2009)
  // do ASCII ' '. Node ICU wstawia je m.in. przy separatorze tysięcy oraz przed
  // jednostką w pl-PL. Bez normalizacji testy snapshotów są niedeterministyczne.
  const numericPart = rawNumeric
    .replace(/\u00A0/g, ' ')
    .replace(/\u202F/g, ' ')
    .replace(/\u2009/g, ' ');

  const valueText = unit ? `${numericPart} ${unit}` : numericPart;

  if (effectiveStatus === 'partial') {
    return placeholder === 'long' ? `${valueText} (wynik częściowy)` : `${valueText} cz.`;
  }

  return valueText;
}

/* === Helpery jednostkowe === */

export function formatCurrent(
  value: number | null | undefined,
  options: Omit<FormatPolishValueOptions, 'unit'> = {},
): string {
  return formatPolishValue(value, { decimals: 2, ...options, unit: 'A' });
}

export function formatVoltage(
  value: number | null | undefined,
  options: Omit<FormatPolishValueOptions, 'unit'> = {},
): string {
  return formatPolishValue(value, { decimals: 2, ...options, unit: 'kV' });
}

export function formatActivePower(
  value: number | null | undefined,
  options: Omit<FormatPolishValueOptions, 'unit'> = {},
): string {
  return formatPolishValue(value, { decimals: 2, ...options, unit: 'kW' });
}

export function formatReactivePower(
  value: number | null | undefined,
  options: Omit<FormatPolishValueOptions, 'unit'> = {},
): string {
  return formatPolishValue(value, { decimals: 2, ...options, unit: 'kvar' });
}

export function formatApparentPower(
  value: number | null | undefined,
  options: Omit<FormatPolishValueOptions, 'unit'> = {},
): string {
  return formatPolishValue(value, { decimals: 2, ...options, unit: 'kVA' });
}

export function formatLengthKm(
  value: number | null | undefined,
  options: Omit<FormatPolishValueOptions, 'unit'> = {},
): string {
  return formatPolishValue(value, { decimals: 3, ...options, unit: 'km' });
}

export function formatPercent(
  value: number | null | undefined,
  options: Omit<FormatPolishValueOptions, 'unit'> = {},
): string {
  return formatPolishValue(value, { decimals: 1, ...options, unit: '%' });
}

export function formatFrequency(
  value: number | null | undefined,
  options: Omit<FormatPolishValueOptions, 'unit'> = {},
): string {
  return formatPolishValue(value, { decimals: 2, ...options, unit: 'Hz' });
}

/**
 * Etykieta statusu (do badge’y).
 *
 * Niezmiennik: NIGDY nie zwraca '0.00'.
 */
export function formatStatusLabel(
  status: CalculationStatus,
  placeholder: 'short' | 'long' = 'long',
): string {
  return placeholder === 'long'
    ? POLISH_STATUS_LABEL[status]
    : POLISH_STATUS_SHORT[status];
}
