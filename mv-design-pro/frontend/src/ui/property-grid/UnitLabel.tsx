/**
 * UnitLabel Component (PF-style)
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md § D.2: Unit display requirements
 *
 * Displays engineering units in consistent style:
 * - Voltage: kV, V
 * - Current: A, kA
 * - Power: MW, Mvar, MVA, kW
 * - Impedance: Ω, Ω/km, mΩ
 * - Length: km, m
 * - Percentage: %
 * - Angle: °
 */

import { clsx } from 'clsx';

// =============================================================================
// Types
// =============================================================================

interface UnitLabelProps {
  /** The unit string (e.g., 'kV', 'A', 'Ω/km') */
  unit: string;
  /** Compact mode (smaller text) */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Unit Categories (for semantic coloring)
// =============================================================================

type UnitCategory = 'voltage' | 'current' | 'power' | 'impedance' | 'length' | 'percentage' | 'angle' | 'other';

const UNIT_CATEGORIES: Record<string, UnitCategory> = {
  // Voltage
  'kV': 'voltage',
  'V': 'voltage',
  // Current
  'A': 'current',
  'kA': 'current',
  'mA': 'current',
  // Power
  'MW': 'power',
  'Mvar': 'power',
  'MVA': 'power',
  'kW': 'power',
  'kvar': 'power',
  'kVA': 'power',
  'W': 'power',
  'var': 'power',
  'VA': 'power',
  // Impedance
  'Ω': 'impedance',
  'Ω/km': 'impedance',
  'mΩ': 'impedance',
  'μS/km': 'impedance',
  // Length
  'km': 'length',
  'm': 'length',
  // Percentage
  '%': 'percentage',
  // Angle
  '°': 'angle',
};

const CATEGORY_STYLES: Record<UnitCategory, string> = {
  voltage: 'text-blue-600',
  current: 'text-orange-600',
  power: 'text-green-600',
  impedance: 'text-purple-600',
  length: 'text-gray-600',
  percentage: 'text-gray-500',
  angle: 'text-gray-500',
  other: 'text-gray-500',
};

// =============================================================================
// UnitLabel Component
// =============================================================================

/**
 * Engineering unit label with consistent styling.
 *
 * Usage:
 * ```tsx
 * <UnitLabel unit="kV" />
 * <UnitLabel unit="Ω/km" compact />
 * ```
 */
export function UnitLabel({ unit, compact = false, className }: UnitLabelProps) {
  const category = UNIT_CATEGORIES[unit] ?? 'other';
  const categoryStyle = CATEGORY_STYLES[category];

  return (
    <span
      className={clsx(
        'font-mono',
        compact ? 'text-xs' : 'text-sm',
        categoryStyle,
        className
      )}
      title={getUnitDescription(unit)}
    >
      {unit}
    </span>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get Polish description for unit (for tooltip).
 */
function getUnitDescription(unit: string): string {
  const descriptions: Record<string, string> = {
    'kV': 'kilowolt',
    'V': 'wolt',
    'A': 'amper',
    'kA': 'kiloamper',
    'mA': 'miliamper',
    'MW': 'megawat (moc czynna)',
    'Mvar': 'megawar (moc bierna)',
    'MVA': 'megawoltamper (moc pozorna)',
    'kW': 'kilowat',
    'kvar': 'kilowar',
    'kVA': 'kilowoltamper',
    'Ω': 'om (impedancja)',
    'Ω/km': 'om na kilometr',
    'mΩ': 'miliom',
    'μS/km': 'mikrosiemens na kilometr (susceptancja)',
    'km': 'kilometr',
    'm': 'metr',
    '%': 'procent',
    '°': 'stopień (kąt)',
  };

  return descriptions[unit] ?? unit;
}

// =============================================================================
// ValueWithUnit Component
// =============================================================================

interface ValueWithUnitProps {
  /** The numeric value */
  value: number | null | undefined;
  /** The unit string */
  unit?: string;
  /** Number of decimal places */
  decimals?: number;
  /** Additional CSS classes for value */
  valueClassName?: string;
  /** Placeholder for null/undefined values */
  placeholder?: string;
}

/**
 * Displays a numeric value with its unit.
 *
 * Usage:
 * ```tsx
 * <ValueWithUnit value={15.5} unit="kV" decimals={1} />
 * <ValueWithUnit value={null} unit="A" placeholder="—" />
 * ```
 */
export function ValueWithUnit({
  value,
  unit,
  decimals = 2,
  valueClassName,
  placeholder = '—',
}: ValueWithUnitProps) {
  const formattedValue =
    value !== null && value !== undefined
      ? value.toLocaleString('pl-PL', {
          minimumFractionDigits: 0,
          maximumFractionDigits: decimals,
        })
      : placeholder;

  return (
    <span className="inline-flex items-center gap-1">
      <span className={clsx('font-mono', valueClassName)}>{formattedValue}</span>
      {unit && value !== null && value !== undefined && (
        <UnitLabel unit={unit} compact />
      )}
    </span>
  );
}

export default UnitLabel;
