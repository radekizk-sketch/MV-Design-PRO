/**
 * ManufacturerPicker — krok 1 wyboru producenta rozdzielnicy SN (goal §11A).
 *
 * Komponent prezentacyjny — przyjmuje listę producentów z props (parent fetchuje
 * przez `fetchManufacturers()`). Pokazuje każdego z badge statusu; producent o
 * `status="requires_catalog"` ma czerwone ostrzeżenie „Wymaga uzupełnienia
 * katalogu" — operator może go wybrać, ale UI sygnalizuje brak zweryfikowanych
 * danych.
 *
 * Reguła nadrzędna: NIE udajemy oficjalnego katalogu producenta gdy brak
 * source_refs (goal §11A.1 ‘Zasada główna’).
 */

import { clsx } from 'clsx';

import {
  describeManufacturerStatusPl,
  isManufacturerBlockedForUse,
  type Manufacturer,
  type ManufacturerStatus,
} from './manufacturer';

export interface ManufacturerPickerProps {
  readonly manufacturers: readonly Manufacturer[];
  readonly selectedRef?: string | null;
  readonly onSelect: (manufacturerRef: string) => void;
  readonly className?: string;
}

const STATUS_BADGE_CLASS: Record<ManufacturerStatus, string> = {
  verified: 'bg-green-100 text-green-800 border-green-300',
  user_defined: 'bg-blue-100 text-blue-800 border-blue-300',
  requires_catalog: 'bg-red-100 text-red-800 border-red-300',
  deprecated: 'bg-gray-100 text-gray-700 border-gray-300',
};

export function ManufacturerPicker({
  manufacturers,
  selectedRef,
  onSelect,
  className,
}: ManufacturerPickerProps): JSX.Element {
  if (manufacturers.length === 0) {
    return (
      <div
        className={clsx('rounded border border-gray-300 p-3 text-sm text-gray-600', className)}
        data-testid="manufacturer-picker-empty"
      >
        Brak producentów rozdzielnic w katalogu.
      </div>
    );
  }

  return (
    <ul
      className={clsx('flex flex-col gap-2', className)}
      data-testid="manufacturer-picker"
    >
      {manufacturers.map((m) => {
        const isSelected = m.manufacturer_ref === selectedRef;
        const isBlocked = isManufacturerBlockedForUse(m);
        return (
          <li key={m.manufacturer_ref}>
            <button
              type="button"
              onClick={() => onSelect(m.manufacturer_ref)}
              data-testid={`manufacturer-picker-option-${m.manufacturer_ref}`}
              data-status={m.status}
              data-selected={isSelected ? 'true' : 'false'}
              className={clsx(
                'flex w-full flex-col items-start rounded border p-2 text-left transition-colors',
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50',
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{m.name}</span>
                <span
                  className={clsx(
                    'rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase',
                    STATUS_BADGE_CLASS[m.status],
                  )}
                  data-testid={`manufacturer-picker-status-${m.manufacturer_ref}`}
                >
                  {describeManufacturerStatusPl(m.status)}
                </span>
              </div>
              {m.country && (
                <span className="text-[11px] text-gray-500">Kraj: {m.country}</span>
              )}
              {m.notes_pl && (
                <span
                  className={clsx(
                    'mt-1 text-[11px]',
                    isBlocked ? 'text-red-700' : 'text-gray-600',
                  )}
                >
                  {m.notes_pl}
                </span>
              )}
              {isBlocked && (
                <span
                  data-testid={`manufacturer-picker-blocked-${m.manufacturer_ref}`}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-red-700"
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-600" />
                  Pole renderowane jako szablon kanoniczny ogólny (fallback).
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
