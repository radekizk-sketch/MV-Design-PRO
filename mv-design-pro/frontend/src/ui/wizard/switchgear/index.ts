/**
 * Switchgear Wizard module exports — Rozdzielnica: pola i aparaty
 *
 * RUN #3G §1: UI kreator pól i aparatów.
 */

// Main page
export { SwitchgearWizardPage } from './SwitchgearWizardPage';

// Screens
export { StationListScreen } from './StationListScreen';
export { StationEditScreen } from './StationEditScreen';
export { FieldEditScreen } from './FieldEditScreen';
export { CatalogPicker } from './CatalogPicker';

// Store
export {
  useSwitchgearStore,
  useCurrentScreen,
  useStationList,
  useCurrentStationData,
  useCurrentFieldData,
  useGlobalFixActions,
  useFocusTarget,
} from './useSwitchgearStore';
export type { SwitchgearScreen, SwitchgearStoreState } from './useSwitchgearStore';

// Types
export type {
  StationListRowV1,
  StationEditDataV1,
  FieldEditDataV1,
  FieldSummaryV1,
  GeneratorSourceEntryV1,
  DeviceEntryV1,
  DeviceBindingV1,
  FieldFixActionV1,
  FieldEditDataV1 as FieldEditData,
  CatalogEntryV1,
  ReadinessStatus,
  FixActionNavigationV1,
} from './types';

export { parseFixActionNavigation } from './types';
