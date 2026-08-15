/**
 * CatalogPicker - wybór typu katalogowego bez ręcznego przepisywania parametrów.
 *
 * Wybierany catalog_ref jest jedynym źródłem danych katalogowych dla odcinka.
 */

import { useCallback, useMemo, useState } from 'react';

export interface CatalogEntry {
  id: string;
  name: string;
  manufacturer?: string;
  summary?: string;
  voltage_rating_kv?: number;
  cross_section_mm2?: number;
  rated_current_a?: number;
  r_ohm_per_km?: number;
  x_ohm_per_km?: number;
  c_nf_per_km?: number;
  b_us_per_km?: number;
  max_temperature_c?: number;
  number_of_cores?: number;
  return_conductor_cross_section_mm2?: number | null;
  return_conductor_material?: string | null;
  return_conductor_r_ohm_per_km_20c?: number | null;
  return_conductor_jth_1s_a_per_mm2?: number | null;
  return_conductor_ith_1s_a?: number | null;
  phase_set_label?: string;
  insulation_type?: string;
  conductor_material?: string;
  standard?: string;
}

interface CatalogPickerProps {
  label: string;
  entries: CatalogEntry[];
  selectedId: string;
  onChange: (id: string) => void;
  required?: boolean;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
}

function formatCatalogMeta(entry: CatalogEntry): string {
  const parts = [
    entry.voltage_rating_kv !== undefined ? `${entry.voltage_rating_kv} kV` : null,
    entry.phase_set_label ?? null,
    entry.cross_section_mm2 !== undefined ? `${entry.cross_section_mm2} mm²` : null,
    entry.rated_current_a !== undefined ? `Iz ${entry.rated_current_a} A` : null,
  ].filter(Boolean);

  return parts.join(' · ');
}

export function CatalogPicker({
  label,
  entries,
  selectedId,
  onChange,
  required = false,
  error,
  placeholder = 'Wyszukaj typ w katalogu',
  disabled = false,
}: CatalogPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return entries;
    const lower = searchTerm.toLowerCase();
    return entries.filter(
      (entry) =>
        entry.name.toLowerCase().includes(lower) ||
        entry.manufacturer?.toLowerCase().includes(lower) ||
        entry.summary?.toLowerCase().includes(lower),
    );
  }, [entries, searchTerm]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id);
      setIsDropdownOpen(false);
      setSearchTerm('');
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange('');
    setSearchTerm('');
    setIsDropdownOpen(true);
  }, [onChange]);

  return (
    <div data-testid="catalog-picker">
      <label className="mb-1 block font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-scada-text">
        {label}
        {required && <span className="ml-0.5 text-sygnal-blokada-tusz">*</span>}
      </label>

      {selectedEntry ? (
        <div className="border border-sygnal-info bg-scada-surface px-3 py-2">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{selectedEntry.name}</p>
              <p className="mt-0.5 text-xs text-scada-text">
                {[selectedEntry.manufacturer, formatCatalogMeta(selectedEntry)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {selectedEntry.summary && (
                <p className="mt-1 text-xs text-scada-muted">{selectedEntry.summary}</p>
              )}
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="shrink-0 border border-scada-border-strong px-2 py-1 text-xs font-semibold text-sygnal-info-tusz hover:border-sygnal-info hover:text-white"
                title="Zmień typ katalogowy"
              >
                Zmień
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            disabled={disabled}
            className={`w-full border px-3 py-2 text-sm ${
              error ? 'border-sygnal-blokada' : 'border-scada-border-strong'
            } bg-scada-bg text-white outline-none placeholder:text-scada-muted focus:border-sygnal-info disabled:opacity-60`}
            placeholder={placeholder}
            data-testid="catalog-picker-search"
          />
          {isDropdownOpen && filteredEntries.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto border border-scada-border-strong bg-scada-bg shadow-lg shadow-black/40">
              {filteredEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => handleSelect(entry.id)}
                  className="w-full border-b border-scada-border px-3 py-2 text-left text-sm text-white last:border-b-0 hover:bg-scada-panel-raised"
                  data-testid={`catalog-entry-${entry.id}`}
                >
                  <span className="font-medium">{entry.name}</span>
                  {entry.manufacturer && (
                    <span className="ml-1 text-scada-muted">({entry.manufacturer})</span>
                  )}
                  <span className="mt-0.5 block text-xs text-scada-text">
                    {formatCatalogMeta(entry)}
                  </span>
                  {entry.summary && (
                    <span className="mt-0.5 block text-xs text-scada-muted">{entry.summary}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {isDropdownOpen && filteredEntries.length === 0 && searchTerm && (
            <div className="absolute z-10 mt-1 w-full border border-scada-border-strong bg-scada-bg px-3 py-2 text-sm text-scada-text shadow-lg shadow-black/40">
              Brak pozycji katalogowych dla: {searchTerm}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-sygnal-blokada-tusz">{error}</p>}
    </div>
  );
}
