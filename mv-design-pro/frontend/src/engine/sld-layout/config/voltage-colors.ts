/**
 * Voltage Color Configuration — Konfigurowalna mapa kolorów napięciowych
 *
 * ZASADA KLUCZOWA: Algorytm NIGDY nie porównuje napięcia z konkretną wartością
 * (np. if voltage === 15). Zamiast tego szuka ZAKRESU pasującego do napięcia.
 *
 * Użytkownik może nadpisać mapę kolorów w konfiguracji projektu.
 */

import type { VoltageColorRule, VoltageCategory } from '../types';

// =============================================================================
// DOMYŚLNA MAPA KOLORÓW NAPIĘCIOWYCH
// =============================================================================

/**
 * Domyślna mapa kolorów napięciowych — KONFIGUROWALNA.
 *
 * Kolejność: od najwyższego do najniższego napięcia.
 * Algorytm przeszukuje tablicę od góry i zwraca pierwszą pasującą regułę.
 *
 * Kolory inspirowane standardami CANONICAL i Canonical.
 */
export const DEFAULT_VOLTAGE_COLOR_MAP: VoltageColorRule[] = [
  // Najwyższe napięcie (NN) — 220kV+
  {
    minKV: 200,
    maxKV: Infinity,
    color: '#CC0000',
    category: 'NN',
    description: 'Najwyższe napięcie (220 kV, 400 kV)',
  },

  // Wysokie napięcie (WN) — 60-200 kV
  {
    minKV: 60,
    maxKV: 200,
    color: '#CC3333',
    category: 'WN',
    description: 'Wysokie napięcie (110 kV)',
  },

  // Średnie napięcie górne — 16-60 kV (30 kV, 20 kV)
  {
    minKV: 16,
    maxKV: 60,
    color: '#9933CC',
    category: 'SN',
    description: 'Średnie napięcie górne (20 kV, 30 kV)',
  },

  // Średnie napięcie — 1-16 kV (15 kV, 10 kV, 6 kV)
  {
    minKV: 1,
    maxKV: 16,
    color: '#00AACC',
    category: 'SN',
    description: 'Średnie napięcie (6 kV, 10 kV, 15 kV)',
  },

  // Niskie napięcie — 0.1-1 kV (0.4 kV, 0.69 kV)
  {
    minKV: 0.1,
    maxKV: 1,
    color: '#FF8800',
    category: 'nN',
    description: 'Niskie napięcie (0.4 kV, 0.69 kV)',
  },

  // Bardzo niskie napięcie / DC — 0-0.1 kV
  {
    minKV: 0,
    maxKV: 0.1,
    color: '#3366FF',
    category: 'DC',
    description: 'Bardzo niskie napięcie / DC',
  },
];

// =============================================================================
// FUNKCJE POMOCNICZE
// =============================================================================

/**
 * Znajdź kolor dla danego napięcia.
 *
 * ALGORYTM:
 * 1. Przeszukaj mapę kolorów od góry
 * 2. Zwróć pierwszą regułę gdzie: minKV <= voltageKV < maxKV
 * 3. Jeśli brak pasującej reguły → fallback (szary)
 *
 * @param voltageKV - Napięcie w kV (ODCZYTANE z modelu)
 * @param colorMap - Mapa kolorów (opcjonalna, domyślna DEFAULT_VOLTAGE_COLOR_MAP)
 * @returns Kolor w formacie hex
 */
export function getVoltageColor(
  voltageKV: number | undefined | null,
  colorMap: VoltageColorRule[] = DEFAULT_VOLTAGE_COLOR_MAP
): string {
  // Brak napięcia → szary (unknown)
  if (voltageKV === undefined || voltageKV === null || isNaN(voltageKV)) {
    return '#888888';
  }

  // Szukaj pasującego zakresu
  for (const rule of colorMap) {
    if (voltageKV >= rule.minKV && voltageKV < rule.maxKV) {
      return rule.color;
    }
  }

  // Fallback — szary dla nieznanego napięcia
  return '#888888';
}

/**
 * Znajdź kategorię napięciową dla danego napięcia.
 *
 * @param voltageKV - Napięcie w kV
 * @param colorMap - Mapa kolorów
 * @returns Kategoria napięciowa
 */
export function getVoltageCategory(
  voltageKV: number | undefined | null,
  colorMap: VoltageColorRule[] = DEFAULT_VOLTAGE_COLOR_MAP
): VoltageCategory {
  if (voltageKV === undefined || voltageKV === null || isNaN(voltageKV)) {
    return 'unknown';
  }

  for (const rule of colorMap) {
    if (voltageKV >= rule.minKV && voltageKV < rule.maxKV) {
      return rule.category;
    }
  }

  return 'unknown';
}

/**
 * Znajdź regułę koloru dla danego napięcia.
 *
 * @param voltageKV - Napięcie w kV
 * @param colorMap - Mapa kolorów
 * @returns Reguła koloru lub undefined
 */
export function getVoltageColorRule(
  voltageKV: number | undefined | null,
  colorMap: VoltageColorRule[] = DEFAULT_VOLTAGE_COLOR_MAP
): VoltageColorRule | undefined {
  if (voltageKV === undefined || voltageKV === null || isNaN(voltageKV)) {
    return undefined;
  }

  for (const rule of colorMap) {
    if (voltageKV >= rule.minKV && voltageKV < rule.maxKV) {
      return rule;
    }
  }

  return undefined;
}

/**
 * Formatuj napięcie do etykiety.
 *
 * @param voltageKV - Napięcie w kV
 * @returns Sformatowana etykieta (np. "15 kV", "0,4 kV", "400 V")
 */
export function formatVoltageLabel(voltageKV: number | undefined | null): string {
  if (voltageKV === undefined || voltageKV === null || isNaN(voltageKV)) {
    return '? kV';
  }

  // Dla napięć < 1 kV, pokazuj w V (polskie formatowanie)
  if (voltageKV < 1) {
    const volts = voltageKV * 1000;
    // Zaokrąglij do sensownej wartości
    const rounded = Math.round(volts);
    return `${rounded} V`;
  }

  // Dla napięć >= 1 kV, pokazuj w kV
  // Użyj polskiego formatowania (przecinek jako separator dziesiętny)
  if (voltageKV === Math.floor(voltageKV)) {
    return `${voltageKV} kV`;
  }

  // Napięcie z częścią dziesiętną
  const formatted = voltageKV.toFixed(1).replace('.', ',');
  return `${formatted} kV`;
}

/**
 * Generuj ID pasma napięciowego z napięcia.
 *
 * @param voltageKV - Napięcie w kV
 * @returns ID pasma (deterministyczne)
 */
export function generateVoltageBandId(voltageKV: number): string {
  // Zaokrąglij do 3 miejsc dziesiętnych dla stabilnego ID
  const rounded = Math.round(voltageKV * 1000) / 1000;
  // Zamień kropkę na underscore dla bezpiecznego ID
  return `band_${rounded.toString().replace('.', '_')}kV`;
}

// =============================================================================
// PRESETY KOLORÓW (dla różnych standardów/preferencji)
// =============================================================================

/**
 * Preset kolorów w stylu CANONICAL.
 */
export const CANONICAL_STYLE_COLORS: VoltageColorRule[] = [
  { minKV: 200, maxKV: Infinity, color: '#E60000', category: 'NN', description: 'Extra High Voltage' },
  { minKV: 60, maxKV: 200, color: '#FF3333', category: 'WN', description: 'High Voltage' },
  { minKV: 16, maxKV: 60, color: '#9900CC', category: 'SN', description: 'Medium Voltage (Upper)' },
  { minKV: 1, maxKV: 16, color: '#0099CC', category: 'SN', description: 'Medium Voltage' },
  { minKV: 0.1, maxKV: 1, color: '#FF9900', category: 'nN', description: 'Low Voltage' },
  { minKV: 0, maxKV: 0.1, color: '#3366FF', category: 'DC', description: 'DC / ELV' },
];

/**
 * Preset kolorów w stylu referencyjnym.
 */
export const REFERENCE_STYLE_COLORS: VoltageColorRule[] = [
  { minKV: 200, maxKV: Infinity, color: '#B30000', category: 'NN', description: 'Najwyższe napięcie' },
  { minKV: 60, maxKV: 200, color: '#E63E3E', category: 'WN', description: 'Wysokie napięcie' },
  { minKV: 16, maxKV: 60, color: '#8033CC', category: 'SN', description: 'Średnie napięcie (górne)' },
  { minKV: 1, maxKV: 16, color: '#0088AA', category: 'SN', description: 'Średnie napięcie' },
  { minKV: 0.1, maxKV: 1, color: '#E68A00', category: 'nN', description: 'Niskie napięcie' },
  { minKV: 0, maxKV: 0.1, color: '#2255DD', category: 'DC', description: 'DC / bardzo niskie' },
];

/**
 * Preset kolorów monochromatycznych (dla wydruków).
 */
export const MONOCHROME_COLORS: VoltageColorRule[] = [
  { minKV: 200, maxKV: Infinity, color: '#000000', category: 'NN', description: 'Extra High Voltage' },
  { minKV: 60, maxKV: 200, color: '#333333', category: 'WN', description: 'High Voltage' },
  { minKV: 16, maxKV: 60, color: '#555555', category: 'SN', description: 'Medium Voltage (Upper)' },
  { minKV: 1, maxKV: 16, color: '#666666', category: 'SN', description: 'Medium Voltage' },
  { minKV: 0.1, maxKV: 1, color: '#888888', category: 'nN', description: 'Low Voltage' },
  { minKV: 0, maxKV: 0.1, color: '#AAAAAA', category: 'DC', description: 'DC / ELV' },
];

// =============================================================================
// WALIDACJA MAPY KOLORÓW
// =============================================================================

/**
 * Waliduj mapę kolorów (sprawdź czy pokrywa cały zakres napięć).
 *
 * @param colorMap - Mapa do walidacji
 * @returns Lista błędów (pusta jeśli OK)
 */
export function validateVoltageColorMap(colorMap: VoltageColorRule[]): string[] {
  const errors: string[] = [];

  if (colorMap.length === 0) {
    errors.push('Mapa kolorów jest pusta');
    return errors;
  }

  // Sprawdź czy reguły są posortowane malejąco
  for (let i = 1; i < colorMap.length; i++) {
    if (colorMap[i].minKV >= colorMap[i - 1].minKV) {
      errors.push(
        `Reguły powinny być posortowane malejąco (indeks ${i}: ${colorMap[i].minKV} >= ${colorMap[i - 1].minKV})`
      );
    }
  }

  // Sprawdź czy zakresy się nie nakładają
  for (let i = 1; i < colorMap.length; i++) {
    if (colorMap[i].maxKV > colorMap[i - 1].minKV) {
      errors.push(
        `Nakładające się zakresy (indeks ${i - 1} i ${i}): ${colorMap[i - 1].minKV}-${colorMap[i - 1].maxKV} vs ${colorMap[i].minKV}-${colorMap[i].maxKV}`
      );
    }
  }

  // Sprawdź czy pokrywają zakres od 0 do Infinity
  const hasZeroStart = colorMap.some((r) => r.minKV === 0);
  const hasInfinityEnd = colorMap.some((r) => r.maxKV === Infinity);

  if (!hasZeroStart) {
    errors.push('Brak reguły zaczynającej się od 0 kV');
  }
  if (!hasInfinityEnd) {
    errors.push('Brak reguły kończącej się na Infinity');
  }

  // Sprawdź poprawność kolorów hex
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
  for (let i = 0; i < colorMap.length; i++) {
    if (!hexColorRegex.test(colorMap[i].color)) {
      errors.push(`Niepoprawny format koloru hex (indeks ${i}): ${colorMap[i].color}`);
    }
  }

  return errors;
}
