/**
 * CatalogPicker — komponent wyboru elementu z katalogu typów.
 *
 * Wymagany w trybie STANDARDOWYM.
 * Wyszukiwanie + filtr + wybór catalog_ref.
 * BINDING: PL labels, no codenames.
 */

import { useCallback, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  id: string;
  name: string;
  manufacturer?: string;
  summary?: string;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CatalogPicker({
  label,
  entries,
  selectedId,
  onChange,
  required = false,
  error,
  placeholder = 'Wyszukaj typ w katalogu\u2026',
  disabled = false,
}: CatalogPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return entries;
    const lower = searchTerm.toLowerCase();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(lower) ||
        (e.manufacturer && e.manufacturer.toLowerCase().includes(lower)),
    );
  }, [entries, searchTerm]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
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
  }, [onChange]);

  return (
    <div data-testid="catalog-picker">
      <label className="mb-1 block font-mono-eng text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8eb1cf]">
        {label}
        {required && <span className="ml-0.5 text-[#ff5c5c]">*</span>}
      </label>

      {selectedEntry ? (
        <div className="flex items-center gap-2 border border-[#1f5c8a] bg-[#08213a] px-3 py-2 text-sm text-white">
          <div className="flex-1">
            <span className="font-medium">{selectedEntry.name}</span>
            {selectedEntry.manufacturer && (
              <span className="ml-1 text-[#7da1bf]">({selectedEntry.manufacturer})</span>
            )}
          </div>
          {!disabled && (
            <button
              onClick={handleClear}
              className="text-xs text-[#7da1bf] hover:text-white"
              title="Usuń wybór"
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            disabled={disabled}
            className={`w-full px-3 py-2 border rounded-md text-sm ${
              error ? 'border-[#ff5c5c]' : 'border-[#2a4562]'
            } bg-[#08111d] text-white outline-none placeholder:text-[#526f88] focus:border-[#04d6ff] disabled:opacity-60`}
            placeholder={placeholder}
            data-testid="catalog-picker-search"
          />
          {isDropdownOpen && filteredEntries.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto border border-[#2a4562] bg-[#08111d] shadow-lg shadow-black/40">
              {filteredEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleSelect(entry.id)}
                  className="w-full border-b border-[#17314c] px-3 py-2 text-left text-sm text-white last:border-b-0 hover:bg-[#0b2b45]"
                  data-testid={`catalog-entry-${entry.id}`}
                >
                  <span className="font-medium">{entry.name}</span>
                  {entry.manufacturer && (
                    <span className="ml-1 text-[#7da1bf]">({entry.manufacturer})</span>
                  )}
                  {entry.summary && (
                    <span className="block text-xs text-[#6f8eaa]">{entry.summary}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {isDropdownOpen && filteredEntries.length === 0 && searchTerm && (
            <div className="absolute z-10 mt-1 w-full border border-[#2a4562] bg-[#08111d] px-3 py-2 text-sm text-[#9fc2df] shadow-lg shadow-black/40">
              Brak wyników dla &ldquo;{searchTerm}&rdquo;
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-[#ff9a9a]">{error}</p>}
    </div>
  );
}
