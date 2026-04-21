/**
 * Selection hooks for SLD, tree and inspector synchronization.
 */

import { useCallback, useEffect } from 'react';
import { normalizeOperatingMode } from '../operatingMode';
import type { ElementType } from '../types';
import { useSelectionStore } from './store';

export function useSldSelection() {
  const { selectElement, selectedElement } = useSelectionStore();

  const handleSldClick = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      selectElement({ id: elementId, type: elementType, name: elementName });
    },
    [selectElement]
  );

  const handleSldEmptyClick = useCallback(() => {
    selectElement(null);
  }, [selectElement]);

  const handleSldDoubleClick = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      selectElement({ id: elementId, type: elementType, name: elementName });
    },
    [selectElement]
  );

  return {
    selectedElement,
    handleSldClick,
    handleSldEmptyClick,
    handleSldDoubleClick,
  };
}

export function useTreeSelection() {
  const { selectElement, centerSldOnElement, expandTreeNode, selectedElement } =
    useSelectionStore();

  const handleTreeClick = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      selectElement({ id: elementId, type: elementType, name: elementName });
      centerSldOnElement(elementId);
    },
    [centerSldOnElement, selectElement]
  );

  const expandToElement = useCallback(
    (path: string[]) => {
      path.forEach((nodeId) => expandTreeNode(nodeId));
    },
    [expandTreeNode]
  );

  return {
    selectedElement,
    handleTreeClick,
    expandToElement,
  };
}

export function useSelectionSync(options: {
  onSldCenterRequest?: (elementId: string) => void;
  onTreeExpandRequest?: (elementId: string) => void;
}) {
  const { selectedElement, sldCenterOnElement } = useSelectionStore();

  useEffect(() => {
    if (sldCenterOnElement && options.onSldCenterRequest) {
      options.onSldCenterRequest(sldCenterOnElement);
    }
  }, [options.onSldCenterRequest, sldCenterOnElement]);

  useEffect(() => {
    if (selectedElement && options.onTreeExpandRequest) {
      options.onTreeExpandRequest(selectedElement.id);
    }
  }, [options.onTreeExpandRequest, selectedElement]);

  return { selectedElement };
}

export function usePropertyGridSelection() {
  const { selectedElement, mode, resultStatus, propertyGridOpen, togglePropertyGrid } =
    useSelectionStore();
  const runtimeMode = normalizeOperatingMode(mode);

  return {
    selectedElement,
    mode: runtimeMode,
    resultStatus,
    propertyGridOpen,
    togglePropertyGrid,
    isReadOnly: runtimeMode === 'RESULT_VIEW',
  };
}

export function useContextMenuState() {
  const { selectedElement, mode } = useSelectionStore();
  const runtimeMode = normalizeOperatingMode(mode);

  return {
    selectedElement,
    mode: runtimeMode,
    isEditMode: runtimeMode === 'MODEL_EDIT',
    isCaseConfigMode: false,
    isResultMode: runtimeMode === 'RESULT_VIEW',
  };
}

export function useGlobalSelectionSync() {
  const {
    selectElement,
    selectedElement,
    selectedElements,
    centerSldOnElement,
    propertyGridOpen,
    togglePropertyGrid,
  } = useSelectionStore();

  const selectFromAnySource = useCallback(
    (
      elementId: string,
      elementType: ElementType,
      elementName: string,
      options?: {
        centerSld?: boolean;
        openInspector?: boolean;
      }
    ) => {
      selectElement({ id: elementId, type: elementType, name: elementName });

      if (options?.centerSld) {
        centerSldOnElement(elementId);
      }

      if (options?.openInspector && !propertyGridOpen) {
        togglePropertyGrid(true);
      }
    },
    [centerSldOnElement, propertyGridOpen, selectElement, togglePropertyGrid]
  );

  const selectFromResults = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      selectFromAnySource(elementId, elementType, elementName, {
        centerSld: true,
        openInspector: true,
      });
    },
    [selectFromAnySource]
  );

  const selectFromSld = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      selectFromAnySource(elementId, elementType, elementName, {
        centerSld: false,
        openInspector: true,
      });
    },
    [selectFromAnySource]
  );

  const selectFromProof = useCallback(
    (elementId: string, elementType: ElementType, elementName: string) => {
      selectFromAnySource(elementId, elementType, elementName, {
        centerSld: true,
        openInspector: true,
      });
    },
    [selectFromAnySource]
  );

  const clearSelection = useCallback(() => {
    selectElement(null);
  }, [selectElement]);

  return {
    selectedElement,
    selectedElements,
    hasSelection: selectedElement !== null,
    selectFromSld,
    selectFromResults,
    selectFromProof,
    selectFromAnySource,
    clearSelection,
    centerSldOnElement,
  };
}
