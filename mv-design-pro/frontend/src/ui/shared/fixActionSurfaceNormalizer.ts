import type {
  AnalysisEligibilityIssue,
  AnalysisEligibilityMatrixResponse,
  EngineeringReadinessResponse,
  FixAction as UiFixAction,
  ReadinessIssue,
} from '../types';
import type {
  FixAction as EnmFixAction,
  SelectionRef,
  ValidationIssue,
} from '../../types/enm';
import {
  resolveFixActionSurface,
  resolveWizardSurfaceStepId,
  type FixActionSurfaceDescriptor,
} from '../../types/fixActionSurface';

type FixActionLike = {
  code?: string | null;
  action_type: string;
  element_ref: string | null;
  modal_type?: string | null;
  panel?: string | null;
  step?: string | null;
  focus?: string | null;
  payload_hint?: Record<string, unknown> | null;
  surface_descriptor?: FixActionSurfaceDescriptor | null;
};

function normalizeFixActionBase<T extends FixActionLike>(
  action: T,
  fallbackCode: string,
  fallbackStepHint: string | null = null,
): T & {
  payload_hint: Record<string, unknown> | null;
  surface_descriptor: FixActionSurfaceDescriptor;
} {
  const payloadHint = action.payload_hint ?? null;
  const surfaceDescriptor =
    action.surface_descriptor ??
    resolveFixActionSurface({
      code: action.code ?? fallbackCode,
      action_type: action.action_type,
      element_ref: action.element_ref,
      modal_type: action.modal_type ?? null,
      panel: action.panel ?? null,
      step_hint: action.step ?? fallbackStepHint,
      focus_ref: action.focus ?? null,
      payload_hint: payloadHint,
    });

  return {
    ...action,
    payload_hint: payloadHint,
    surface_descriptor: surfaceDescriptor,
  };
}

export function normalizeEnmFixAction(
  action: EnmFixAction,
): EnmFixAction & {
  payload_hint: Record<string, unknown> | null;
  surface_descriptor: FixActionSurfaceDescriptor;
} {
  return normalizeFixActionBase(action, action.code);
}

export function normalizeUiFixAction(
  action: UiFixAction,
  fallbackCode: string,
  fallbackStepHint: string | null = null,
): UiFixAction & {
  payload_hint: Record<string, unknown> | null;
  surface_descriptor: FixActionSurfaceDescriptor;
} {
  return normalizeFixActionBase(action, fallbackCode, fallbackStepHint);
}

export function normalizeValidationIssue(
  issue: ValidationIssue,
): ValidationIssue & { wizard_step_id: ReturnType<typeof resolveWizardSurfaceStepId> } {
  return {
    ...issue,
    wizard_step_hint: issue.wizard_step_hint ?? null,
    wizard_step_id: resolveWizardSurfaceStepId(issue.wizard_step_hint),
  };
}

export function normalizeSelectionRef(
  selectionRef: SelectionRef,
): SelectionRef & { wizard_step_id: ReturnType<typeof resolveWizardSurfaceStepId> } {
  return {
    ...selectionRef,
    wizard_step_hint: selectionRef.wizard_step_hint ?? null,
    wizard_step_id: resolveWizardSurfaceStepId(selectionRef.wizard_step_hint),
  };
}

export function normalizeReadinessIssue(issue: ReadinessIssue): ReadinessIssue {
  return {
    ...issue,
    wizard_step_hint: issue.wizard_step_hint ?? null,
    wizard_step_id: resolveWizardSurfaceStepId(issue.wizard_step_hint),
    fix_action: issue.fix_action
      ? normalizeUiFixAction(issue.fix_action, issue.code, issue.wizard_step_hint ?? null)
      : null,
  };
}

export function normalizeEngineeringReadinessResponse(
  response: EngineeringReadinessResponse,
): EngineeringReadinessResponse {
  return {
    ...response,
    issues: response.issues.map(normalizeReadinessIssue),
  };
}

function normalizeEligibilityIssue(issue: AnalysisEligibilityIssue): AnalysisEligibilityIssue {
  return {
    ...issue,
    fix_action: issue.fix_action
      ? normalizeUiFixAction(issue.fix_action, issue.code, null)
      : null,
  };
}

export function normalizeAnalysisEligibilityResponse(
  response: AnalysisEligibilityMatrixResponse,
): AnalysisEligibilityMatrixResponse {
  return {
    ...response,
    matrix: response.matrix.map((result) => ({
      ...result,
      blockers: result.blockers.map(normalizeEligibilityIssue),
      warnings: result.warnings.map(normalizeEligibilityIssue),
      info: result.info.map(normalizeEligibilityIssue),
    })),
  };
}
