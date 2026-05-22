/**
 * Property Grid Container (with Type Picker integration + P30c Multi-Edit)
 *
 * CANONICAL ALIGNMENT:
 * - P13a: Type Library Browser + type_ref integration
 * - P30c: Multi-edit with Apply/Cancel transactions
 * - SYSTEM_SPEC.md § 4: Type Catalog (Library)
 *
 * This container wires up PropertyGrid with TypePicker modal and catalog API.
 * P30c: Detects multi-select and uses PropertyGridMultiEdit for N > 1 elements.
 *
 * Handles:
 * - Single-select: PropertyGrid (classic)
 * - Multi-select: PropertyGridMultiEdit (P30c)
 * - Type assignment via domain operation assign_catalog_to_element
 * - Element data refresh after type changes
 */

import { useState, useCallback } from 'react';
import { PropertyGrid } from './PropertyGrid';
import { PropertyGridMultiEdit } from './PropertyGridMultiEdit';
import { TypePicker } from '../catalog/TypePicker';
import { DiagnosticsSection } from '../inspector/DiagnosticsSection';
import { useMultiSelection } from '../selection';
import { useSnapshotStore } from '../topology/snapshotStore';
import { useAppStateStore } from '../app-state';
import { notify } from '../notifications/store';
import { NAMESPACE_TO_PICKER_CATEGORY } from '../catalog/elementCatalogRegistry';
import type { ElementType, ValidationMessage } from '../types';
import type { CatalogNamespace, TypeCategory } from '../catalog/types';
import type { ElementData } from './multi-edit-helpers';

interface PropertyGridContainerProps {
  projectId: string;

  // Single-select (legacy)
  elementId?: string;
  elementType?: ElementType;
  elementName?: string;
  elementData?: Record<string, unknown>;
  validationMessages?: ValidationMessage[];

  // Multi-select (P30c)
  elements?: ElementData[];

  onFieldChange?: (fieldKey: string, value: unknown) => void;
  onFieldChangeMulti?: (elementId: string, fieldKey: string, value: unknown) => void | Promise<void>;
  onDataRefresh?: () => void; // Callback to refresh element data after type assignment
}

/**
 * Property Grid Container Component.
 *
 * Integrates PropertyGrid (single) or PropertyGridMultiEdit (multi) with TypePicker and catalog API.
 * P30c: Automatically detects single vs multi-select mode.
 */
export function PropertyGridContainer({
  projectId: _projectId,
  elementId,
  elementType,
  elementName,
  elementData = {},
  validationMessages = [],
  elements,
  onFieldChange,
  onFieldChangeMulti,
  onDataRefresh,
}: PropertyGridContainerProps) {
  useMultiSelection();
  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false);
  const [typePickerCategory, setTypePickerCategory] = useState<TypeCategory | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Domain operation integration (replaces legacy API)
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
  const activeCaseId = useAppStateStore((state) => state.activeCaseId);

  // Determine explicit catalog category and current type_ref based on element data.
  const getTypeCategoryAndRef = (): { category: TypeCategory | null; currentTypeRef: string | null } => {
    const explicitNamespace =
      typeof elementData.catalog_namespace === 'string'
        ? (elementData.catalog_namespace as CatalogNamespace)
        : typeof (elementData.catalog_binding as { namespace?: unknown } | undefined)?.namespace === 'string'
          ? ((elementData.catalog_binding as { namespace: CatalogNamespace }).namespace)
          : null;

    switch (elementType) {
      case 'LineBranch': {
        const currentTypeRef = elementData.type_ref as string | null;
        return {
          category: explicitNamespace ? NAMESPACE_TO_PICKER_CATEGORY[explicitNamespace] ?? null : null,
          currentTypeRef,
        };
      }
      case 'TransformerBranch': {
        const currentTypeRef = elementData.type_ref as string | null;
        return { category: 'TRANSFORMER', currentTypeRef };
      }
      case 'Switch': {
        const currentTypeRef = elementData.equipment_type_ref as string | null;
        return { category: 'SWITCH_EQUIPMENT', currentTypeRef };
      }
      default:
        return { category: null, currentTypeRef: null };
    }
  };

  // Handle "Assign Type" button click
  const handleAssignType = useCallback(() => {
    const { category } = getTypeCategoryAndRef();
    if (!category) {
      const message = 'Brak jawnego kontekstu katalogowego dla wybranego elementu.';
      setError(message);
      notify(message, 'error');
      return;
    }
    setTypePickerCategory(category);
    setIsTypePickerOpen(true);
    setError(null);
  }, [elementType, elementData]);

  // Handle type selection — via domain operation assign_catalog_to_element
  const handleSelectType = useCallback(
    async (typeId: string, typeName: string) => {
      if (!elementId || !activeCaseId) {
        if (!activeCaseId) notify('Wybierz zakres obliczeń przed zapisem.', 'error');
        return;
      }

      setIsProcessing(true);
      setError(null);

      try {
        const response = await executeDomainOperation(activeCaseId, 'assign_catalog_to_element', {
          element_ref: elementId,
          catalog_item_id: typeId,
          source: 'property_grid',
        });

        if (response && !response.error) {
          notify(`Przypisano typ: ${typeName}`, 'success');
          if (onDataRefresh) onDataRefresh();
        } else {
          setError(response?.error ?? 'Nieznany błąd');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Nieznany błąd';
        setError(`Błąd przypisywania typu: ${errorMsg}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [elementId, activeCaseId, executeDomainOperation, onDataRefresh],
  );

  const { currentTypeRef } = getTypeCategoryAndRef();

  // P30c: Detect multi-select mode
  const isMultiMode = elements && elements.length > 1;
  const isSingleMode = !isMultiMode && elementId && elementType && elementName;

  return (
    <>
      {/* Error display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
          Przetwarzanie...
        </div>
      )}

      {/* P30c: Multi-Edit Mode (N > 1) */}
      {isMultiMode && (
        <PropertyGridMultiEdit
          elements={elements!}
          onApplyChange={onFieldChangeMulti}
        />
      )}

      {/* Single-Edit Mode (N = 1, legacy) */}
      {isSingleMode && (
        <>
          <PropertyGrid
            elementId={elementId!}
            elementType={elementType!}
            elementName={elementName!}
            elementData={elementData}
            validationMessages={validationMessages}
            onFieldChange={onFieldChange}
            onAssignType={handleAssignType}
          />

          {/* Diagnostics Section (reuse from #238) - shows protection sanity results */}
          <DiagnosticsSection
            elementId={elementId}
            defaultCollapsed={false}
            className="mt-4"
          />
        </>
      )}

      {/* No selection */}
      {!isMultiMode && !isSingleMode && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 text-center text-sm text-gray-500">
          Nie wybrano żadnych elementów
        </div>
      )}

      {/* Type Picker Modal */}
      {typePickerCategory && (
        <TypePicker
          category={typePickerCategory}
          currentTypeId={currentTypeRef}
          onSelectType={handleSelectType}
          onClose={() => setIsTypePickerOpen(false)}
          isOpen={isTypePickerOpen}
        />
      )}
    </>
  );
}
