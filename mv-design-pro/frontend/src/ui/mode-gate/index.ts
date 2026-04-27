/**
 * Mode Gate Module — P12a Data Manager Parity
 *
 * Components and hooks for mode-based UI gating.
 */

export {
  ModeGate,
  BlockedOverlay,
  ModelEditGate,
  CaseConfigGate,
  ResultViewGate,
  default as ModeGateDefault,
} from './ModeGate';

export {
  useActionPermission,
  useModePermissions,
  useCanEditModel,
  useCanEditCaseConfig,
  useCanRunCalculations,
  useEnforcePermission,
  useWorkModeEditAllowed,
  useIsAuditMode,
  useWorkModeLabel,
  type AppAction,
  type PermissionResult,
} from './useModePermissions';
