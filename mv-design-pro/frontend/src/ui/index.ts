/**
 * UI Module Exports — minimal po wygaszeniu starego SLD (cz. III).
 *
 * Eksporty stare SLD (SldEditor, SLDView, SLDViewPage, SLDViewCanvas,
 * IssuePanelContainer, EmbeddedSldWorkspace, SldVisualModes, InspectorEngineeringView)
 * usunięte — nowy SLD v2 importowany bezpośrednio z `ui/sld/v2/`.
 */

// Types
export * from './types';

// Selection state management
export {
  useSelectionStore,
  useCanEdit,
  useIsMutationBlocked,
  useModeLabel,
  useResultStatusLabel,
  useSldSelection,
  useTreeSelection,
  useSelectionSync,
  usePropertyGridSelection,
  useContextMenuState,
} from './selection';

// Property Grid
export { PropertyGrid, getFieldDefinitions, SECTION_LABELS, SECTION_ORDER } from './property-grid';

// Context Menu
export {
  ContextMenu,
  buildContextMenuActions,
  buildBusContextMenu,
  buildNetworkModelContextMenu,
  getContextMenuHeader,
} from './context-menu';

// Type Catalog
export {
  TypePicker,
  fetchLineTypes,
  fetchCableTypes,
  fetchTransformerTypes,
  fetchSwitchEquipmentTypes,
  fetchTypesByCategory,
  assignTypeToBranch,
  assignTypeToTransformer,
  assignEquipmentTypeToSwitch,
  clearTypeFromBranch,
  clearTypeFromTransformer,
  clearEquipmentTypeFromSwitch,
} from './catalog';
export type {
  LineType,
  CableType,
  TransformerType,
  SwitchEquipmentType,
  TypeCategory,
  TypeReference,
} from './catalog';

// Protection Library (READ-ONLY)
export { ProtectionLibraryBrowser } from './protection';
export type {
  ProtectionCategory,
  ProtectionDeviceType,
  ProtectionCurve,
  ProtectionSettingTemplate,
  ProtectionTypeUnion,
} from './protection';

// Issue Panel (Validation Browser)
export { IssuePanel } from './issue-panel';
export type { IssuePanelProps } from './issue-panel';

// Inspector (READ-ONLY Property Grid - Canonical parity)
export {
  InspectorPanel,
  InspectorPanelConnected,
  PropertyGrid as InspectorPropertyGrid,
  INSPECTOR_SECTION_LABELS,
  FLAG_LABELS as INSPECTOR_FLAG_LABELS,
} from './inspector';
export type {
  InspectorSection,
  InspectorField,
  InspectorElementData,
  BusResultData,
  BranchResultData,
  ShortCircuitResultData,
} from './inspector';

// Calculation Trace Viewer (READ-ONLY)
export {
  TraceViewer,
  TraceViewerContainer,
  TraceToc,
  TraceStepView,
  TraceStepViewEmpty,
  TraceMetadataPanel,
  TraceMetadataPanelEmpty,
} from './proof';
