/**
 * useWizardStore — Zustand store for wizard step controller state.
 *
 * Single source of truth for:
 * - currentStep (K1-K10 index)
 * - wizardState (deterministic, recomputed from ENM)
 * - canProceed (per-step forward gate)
 * - issuesByStep (deterministic per step)
 * - lastAppliedRevision (ENM header.revision after last successful apply)
 *
 * Integrates with backend:
 * - GET /wizard/state → restore on refresh
 * - POST /wizard/apply-step → atomic step application
 * - GET /wizard/can-proceed → transition gate check
 *
 * Emits 'model-updated' CustomEvent on successful mutation
 * for Tree/SLD reactivity (no direct store coupling).
 *
 * BINDING: Polish labels, no project codenames.
 */

import { create } from 'zustand';
import type { EnergyNetworkModel } from '../../types/enm';
import {
  resolveWizardSurfaceStepId,
  type WizardSurfaceStepId,
} from '../../types/fixActionSurface';
import { computeWizardState } from './wizardStateMachine';
import type { WizardState, StepIssue } from './wizardStateMachine';
import { useSnapshotStore } from '../topology/snapshotStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Backend wizard issue (snake_case JSON) */
export interface WizardIssueApi {
  code: string;
  severity: 'BLOCKER' | 'IMPORTANT' | 'INFO';
  message_pl: string;
  element_ref?: string | null;
  wizard_step_hint?: string | null;
  wizard_step_id?: WizardSurfaceStepId | null;
  suggested_fix?: string | null;
}

/** Backend apply-step response */
export interface ApplyStepResponse {
  success: boolean;
  step_id: string;
  precondition_issues: WizardIssueApi[];
  postcondition_issues: WizardIssueApi[];
  can_proceed: boolean;
  current_step: string;
  next_step: string | null;
  revision: number;
  wizard_state: WizardStateApi | null;
}

/** Backend wizard state response (snake_case JSON) */
export interface WizardStateApi {
  steps: Array<{
    step_id: string;
    status: 'empty' | 'partial' | 'complete' | 'error';
    completion_percent: number;
    issues: WizardIssueApi[];
  }>;
  overall_status: 'empty' | 'incomplete' | 'ready' | 'blocked';
  readiness_matrix: {
    short_circuit_3f: { available: boolean; missing_requirements: string[] };
    short_circuit_1f: { available: boolean; missing_requirements: string[] };
    load_flow: { available: boolean; missing_requirements: string[] };
  };
  element_counts: {
    buses: number;
    sources: number;
    transformers: number;
    branches: number;
    loads: number;
    generators: number;
  };
}

/** Backend can-proceed response */
export interface CanProceedResponse {
  allowed: boolean;
  from_step: string;
  to_step: string;
  blocking_issues: WizardIssueApi[];
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const STEP_IDS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10'] as const;

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface WizardStoreState {
  /** 0-indexed current step */
  currentStep: number;

  /** Full wizard state computed from ENM (client-side, deterministic) */
  wizardState: WizardState | null;

  /** Issues grouped by step ID */
  issuesByStep: Record<string, StepIssue[]>;

  /** Whether forward transition from current step is allowed */
  canProceed: boolean;

  /** ENM header.revision after last successful apply */
  lastAppliedRevision: number;

  /** Backend-sourced blocking issues for current forward transition */
  transitionBlockers: WizardIssueApi[];

  /** Loading state */
  isApplying: boolean;

  /** Last apply error message */
  applyError: string | null;

  // Actions
  setCurrentStep: (step: number) => void;
  recomputeFromEnm: (enm: EnergyNetworkModel) => void;
  checkCanProceed: (caseId: string, fromIdx: number, toIdx: number) => Promise<boolean>;
  applyStep: (
    caseId: string,
    stepId: string,
    data: Record<string, unknown>,
  ) => Promise<ApplyStepResponse | null>;
  fetchWizardState: (caseId: string) => Promise<WizardStateApi | null>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildIssuesByStep(ws: WizardState): Record<string, StepIssue[]> {
  const map: Record<string, StepIssue[]> = {};
  for (const step of ws.steps) {
    if (step.issues.length > 0) {
      map[step.stepId] = [...step.issues];
    }
  }
  return map;
}

function computeCanProceed(ws: WizardState, currentIdx: number): boolean {
  if (currentIdx >= STEP_IDS.length - 1) return false;
  const currentStep = ws.steps[currentIdx];
  if (!currentStep) return false;
  // Forward blocked if current step has BLOCKER issues
  return currentStep.status !== 'error';
}

function normalizeWizardIssue(issue: WizardIssueApi): WizardIssueApi {
  return {
    ...issue,
    wizard_step_hint: issue.wizard_step_hint ?? null,
    wizard_step_id:
      issue.wizard_step_id ?? resolveWizardSurfaceStepId(issue.wizard_step_hint ?? null),
  };
}

function normalizeWizardIssues(issues: WizardIssueApi[]): WizardIssueApi[] {
  return issues.map(normalizeWizardIssue);
}

function normalizeWizardStateApi(state: WizardStateApi): WizardStateApi {
  return {
    ...state,
    steps: state.steps.map((step) => ({
      ...step,
      issues: normalizeWizardIssues(step.issues),
    })),
  };
}

// ---------------------------------------------------------------------------
// Custom event for Tree/SLD reactivity
// ---------------------------------------------------------------------------

function emitModelUpdated(revision: number): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('model-updated', { detail: { revision, source: 'wizard' } }),
    );
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const initialState = {
  currentStep: 0,
  wizardState: null as WizardState | null,
  issuesByStep: {} as Record<string, StepIssue[]>,
  canProceed: true,
  lastAppliedRevision: 0,
  transitionBlockers: [] as WizardIssueApi[],
  isApplying: false,
  applyError: null as string | null,
};

export const useWizardStore = create<WizardStoreState>()((set, get) => ({
  ...initialState,

  setCurrentStep: (step: number) => {
    const ws = get().wizardState;
    set({
      currentStep: step,
      canProceed: ws ? computeCanProceed(ws, step) : true,
      transitionBlockers: [],
      applyError: null,
    });
  },

  recomputeFromEnm: (enm: EnergyNetworkModel) => {
    const ws = computeWizardState(enm);
    const currentStep = get().currentStep;
    set({
      wizardState: ws,
      issuesByStep: buildIssuesByStep(ws),
      canProceed: computeCanProceed(ws, currentStep),
    });
  },

  checkCanProceed: async (caseId: string, fromIdx: number, toIdx: number): Promise<boolean> => {
    const fromStep = STEP_IDS[fromIdx];
    const toStep = STEP_IDS[toIdx];
    if (!fromStep || !toStep) return false;

    // Backward always allowed
    if (toIdx <= fromIdx) return true;

    try {
      const r = await fetch(
        `${API_BASE}/api/cases/${caseId}/wizard/can-proceed?from_step=${fromStep}&to_step=${toStep}`,
      );
      if (!r.ok) return false;
      const rawData: CanProceedResponse = await r.json();
      const data: CanProceedResponse = {
        ...rawData,
        blocking_issues: normalizeWizardIssues(rawData.blocking_issues),
      };
      set({
        canProceed: data.allowed,
        transitionBlockers: data.blocking_issues,
      });
      return data.allowed;
    } catch {
      // Fallback to client-side check
      const ws = get().wizardState;
      return ws ? computeCanProceed(ws, fromIdx) : false;
    }
  },

  applyStep: async (
    caseId: string,
    stepId: string,
    data: Record<string, unknown>,
  ): Promise<ApplyStepResponse | null> => {
    set({ isApplying: true, applyError: null });
    try {
      const r = await fetch(`${API_BASE}/api/cases/${caseId}/wizard/apply-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_id: stepId, data }),
      });
      if (!r.ok) {
        set({ isApplying: false, applyError: `Błąd serwera: ${r.status}` });
        return null;
      }
      const rawResp: ApplyStepResponse = await r.json();
      const resp: ApplyStepResponse = {
        ...rawResp,
        precondition_issues: normalizeWizardIssues(rawResp.precondition_issues),
        postcondition_issues: normalizeWizardIssues(rawResp.postcondition_issues),
        wizard_state: rawResp.wizard_state
          ? normalizeWizardStateApi(rawResp.wizard_state)
          : null,
      };

      if (resp.success) {
        set({
          canProceed: resp.can_proceed,
          lastAppliedRevision: resp.revision,
          transitionBlockers: [],
          isApplying: false,
        });
        // Sync snapshotStore after successful wizard step
        const cId = caseId;
        useSnapshotStore.getState().refreshFromBackend(cId).catch(() => {});
        emitModelUpdated(resp.revision);
      } else {
        // Combine pre and post issues for display
        const allIssues = [...resp.precondition_issues, ...resp.postcondition_issues];
        set({
          canProceed: false,
          transitionBlockers: allIssues,
          isApplying: false,
        });
      }
      return resp;
    } catch (e) {
      set({ isApplying: false, applyError: String(e) });
      return null;
    }
  },

  fetchWizardState: async (caseId: string): Promise<WizardStateApi | null> => {
    try {
      const r = await fetch(`${API_BASE}/api/cases/${caseId}/wizard/state`);
      if (!r.ok) return null;
      const data: WizardStateApi = await r.json();
      return normalizeWizardStateApi(data);
    } catch {
      return null;
    }
  },

  reset: () => set(initialState),
}));

// ---------------------------------------------------------------------------
// Derived hooks
// ---------------------------------------------------------------------------

export function useCurrentStepId(): string {
  return useWizardStore((s) => STEP_IDS[s.currentStep] ?? 'K1');
}

export function useCanProceedForward(): boolean {
  return useWizardStore((s) => s.canProceed);
}

export function useStepIssues(stepId: string): StepIssue[] {
  return useWizardStore((s) => s.issuesByStep[stepId] ?? []);
}

export function useTransitionBlockers(): WizardIssueApi[] {
  return useWizardStore((s) => s.transitionBlockers);
}

export function useIsApplying(): boolean {
  return useWizardStore((s) => s.isApplying);
}
