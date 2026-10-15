/**
 * Catalog Materialization Dialog — §5 UX 10/10
 *
 * Modal wyboru typu z katalogu z podglądem parametrów.
 * Layout: Lista katalogowa (lewa) | Podgląd parametrów (prawa)
 *
 * WYMAGANIA:
 * - Lista elementów katalogowych po lewej
 * - Podgląd parametrów po prawej (solver + UI fields)
 * - MaterializationContract-based preview
 * - Jednostki zawsze widoczne
 * - Diff z aktualnym Snapshot (jeśli edycja)
 *
 * INVARIANTS:
 * - Read-only preview — no model mutation until confirm
 * - CatalogBinding required (namespace + id + version + materialize=true)
 * - 100% Polish labels
 * - Deterministic field ordering
 */

import React, { useState, useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import type {
  CatalogPreview,
  CatalogPreviewField,
  MaterializationContractDef,
} from '../../modules/sld/cdse/catalogPreviewEngine';
import { buildCatalogPreview, formatPreviewValue } from '../../modules/sld/cdse/catalogPreviewEngine';

// =============================================================================
// Types
// =============================================================================

export interface CatalogItem {
  id: string;
  name: string;
  name_pl?: string;
  version: string;
  [key: string]: unknown;
}

export interface CatalogMaterializationDialogProps {
  /** Whether dialog is open */
  isOpen: boolean;
  /** Catalog namespace (e.g., KABEL_SN, TRAFO_SN_NN) */
  namespace: string;
  /** Polish title (e.g., "Wybierz typ kabla SN") */
  title: string;
  /** Available catalog items */
  items: CatalogItem[];
  /** Materialization contract */
  contract: MaterializationContractDef;
  /** Current values in Snapshot (for diff) — empty for new elements */
  currentValues?: Record<string, unknown>;
  /** Currently assigned item ID (for highlighting) */
  currentItemId?: string;
  /** Called on confirm */
  onConfirm: (item: CatalogItem) => void;
  /** Called on cancel */
  onCancel: () => void;
  /** Loading state */
  loading?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export const CatalogMaterializationDialog: React.FC<CatalogMaterializationDialogProps> = ({
  isOpen,
  namespace,
  title,
  items,
  contract,
  currentValues = {},
  currentItemId,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(currentItemId ?? null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filtered items
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.name_pl?.toLowerCase().includes(q) ?? false) ||
        item.id.toLowerCase().includes(q),
    );
  }, [items, searchQuery]);

  // Selected item
  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  // Build preview for selected item
  const preview = useMemo((): CatalogPreview | null => {
    if (!selectedItem) return null;
    return buildCatalogPreview(
      namespace,
      selectedItem as unknown as Record<string, unknown>,
      contract,
      currentValues,
    );
  }, [selectedItem, namespace, contract, currentValues]);

  const handleConfirm = useCallback(() => {
    if (selectedItem) {
      onConfirm(selectedItem);
    }
  }, [selectedItem, onConfirm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="catalog-materialization-dialog"
    >
      <div className="bg-white rounded-lg shadow-2xl w-[800px] max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Katalog: {namespace} | {items.length} pozycji
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        {/* Body — two-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel: catalog list */}
          <div className="w-[320px] border-r border-gray-200 flex flex-col">
            {/* Search */}
            <div className="p-3 border-b border-gray-100">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Szukaj w katalogu..."
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                data-testid="catalog-search"
              />
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Ładowanie katalogu...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Brak pozycji
                </div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={clsx(
                      'w-full text-left px-4 py-2.5 border-b border-gray-50 transition-colors',
                      selectedId === item.id
                        ? 'bg-sygnal-info-tlo border-l-4 border-l-blue-500'
                        : 'hover:bg-gray-50 border-l-4 border-l-transparent',
                      currentItemId === item.id && selectedId !== item.id &&
                        'bg-sygnal-ok-tlo/50',
                    )}
                    data-testid={`catalog-item-${item.id}`}
                  >
                    <div className="text-sm font-medium text-gray-800">
                      {item.name_pl ?? item.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {item.id} | wer. {item.version}
                    </div>
                    {currentItemId === item.id && (
                      <span className="text-xs text-sygnal-ok font-medium">
                        Aktualnie przypisany
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right panel: parameter preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!preview ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Wybierz element z listy
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4">
                {/* Item header */}
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-gray-800">
                    {preview.itemName_pl}
                  </h3>
                  <div className="text-xs text-gray-500 mt-1 flex gap-3">
                    <span>Wersja: {preview.itemVersion}</span>
                    <span>Materializacja: {preview.materializationCount} pól</span>
                    {preview.isUpdate && preview.changedFieldCount > 0 && (
                      <span className="text-sygnal-uwaga font-medium">
                        Zmienione: {preview.changedFieldCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Solver fields */}
                {preview.solverFields.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                      Parametry obliczeniowe
                    </h4>
                    <div className="space-y-1">
                      {preview.solverFields.map((field) => (
                        <FieldRow key={field.fieldName} field={field} />
                      ))}
                    </div>
                  </div>
                )}

                {/* UI fields */}
                {preview.uiFields.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                      Parametry katalogowe
                    </h4>
                    <div className="space-y-1">
                      {preview.uiFields.map((field) => (
                        <FieldRow key={field.fieldName} field={field} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-xs text-gray-500">
            {preview
              ? `Wybrany: ${preview.itemName_pl}`
              : 'Nie wybrano elementu'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors"
            >
              Anuluj
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedItem}
              className={clsx(
                'px-4 py-1.5 text-sm font-medium rounded transition-colors',
                selectedItem
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              )}
              data-testid="catalog-confirm-btn"
            >
              Zastosuj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Field Row Component
// =============================================================================

interface FieldRowProps {
  field: CatalogPreviewField;
}

const FieldRow: React.FC<FieldRowProps> = ({ field }) => {
  const formattedValue = formatPreviewValue(field);

  return (
    <div
      className={clsx(
        'flex items-center justify-between px-3 py-1.5 rounded text-sm',
        field.hasChanged ? 'bg-sygnal-uwaga-tlo' : 'bg-gray-50',
      )}
      data-testid={`preview-field-${field.fieldName}`}
    >
      <div className="flex items-center gap-2">
        {field.isSolverField && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Pole obliczeniowe" />
        )}
        <span className="text-gray-700">{field.label_pl}</span>
      </div>
      <div className="flex items-center gap-2">
        {field.hasChanged && field.currentValue !== undefined && (
          <span className="text-xs text-gray-400 line-through">
            {typeof field.currentValue === 'number'
              ? field.currentValue.toString()
              : String(field.currentValue ?? '—')}
          </span>
        )}
        <span
          className={clsx(
            'font-mono font-medium',
            field.hasChanged ? 'text-sygnal-uwaga' : 'text-gray-800',
          )}
        >
          {formattedValue}
        </span>
      </div>
    </div>
  );
};

export default CatalogMaterializationDialog;
