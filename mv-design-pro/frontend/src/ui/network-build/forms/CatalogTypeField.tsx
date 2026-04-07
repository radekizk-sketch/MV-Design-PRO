import { useState } from 'react';

import { TypePicker } from '../../catalog/TypePicker';
import type { TypeCategory } from '../../catalog/types';

interface CatalogTypeFieldProps {
  label: string;
  category: TypeCategory;
  selectedTypeId: string | null;
  selectedTypeName: string | null;
  onSelect: (typeId: string, typeName: string) => void;
  helperText?: string;
  error?: string | null;
  testId: string;
}

export function CatalogTypeField({
  label,
  category,
  selectedTypeId,
  selectedTypeName,
  onSelect,
  helperText,
  error,
  testId,
}: CatalogTypeFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  return (
    <div data-testid={testId}>
      <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-chrome-500">
        {label}
      </label>
      <div className="mt-2 rounded border border-chrome-200 bg-white p-3">
        {selectedTypeId ? (
          <div className="space-y-1">
            <div className="text-sm font-medium text-chrome-800">{selectedTypeName ?? selectedTypeId}</div>
            <div className="text-[11px] text-chrome-500">{selectedTypeId}</div>
          </div>
        ) : (
          <div className="text-sm text-chrome-500">Wybór katalogu jest wymagany dla tej operacji.</div>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPickerOpen(true)}
            className="rounded border border-ind-300 bg-ind-50 px-3 py-1.5 text-xs font-medium text-ind-700 hover:bg-ind-100"
          >
            {selectedTypeId ? 'Zmień typ z katalogu' : 'Wybierz z katalogu'}
          </button>
        </div>
        {helperText && <p className="mt-2 text-[11px] text-chrome-500">{helperText}</p>}
        {error && <p className="mt-2 text-[11px] text-rose-600">{error}</p>}
      </div>

      <TypePicker
        isOpen={isPickerOpen}
        category={category}
        currentTypeId={selectedTypeId}
        onClose={() => setIsPickerOpen(false)}
        onSelectType={(typeId, typeName) => onSelect(typeId, typeName)}
      />
    </div>
  );
}

export default CatalogTypeField;
