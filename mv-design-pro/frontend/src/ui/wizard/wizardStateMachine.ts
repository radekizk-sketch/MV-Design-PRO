import type { Branch, Cable, EnergyNetworkModel, OverheadLine } from '../../types/enm';

export type StepStatus = 'empty' | 'partial' | 'complete' | 'error';
export type StepIssueSeverity = 'BLOCKER' | 'IMPORTANT' | 'INFO';

export interface StepIssue {
  readonly code: string;
  readonly severity: StepIssueSeverity;
  readonly messagePl: string;
  readonly elementRef?: string;
}

export interface StepState {
  readonly stepId: string;
  readonly status: StepStatus;
  readonly completionPercent: number;
  readonly issues: readonly StepIssue[];
}

export interface AnalysisReadiness {
  readonly available: boolean;
  readonly missingRequirements: readonly string[];
}

export interface ReadinessMatrix {
  readonly shortCircuit3F: AnalysisReadiness;
  readonly shortCircuit1F: AnalysisReadiness;
  readonly loadFlow: AnalysisReadiness;
}

export interface ElementCounts {
  readonly buses: number;
  readonly sources: number;
  readonly transformers: number;
  readonly branches: number;
  readonly loads: number;
  readonly generators: number;
  readonly measurements: number;
  readonly protectionAssignments: number;
}

export interface WizardState {
  readonly steps: readonly StepState[];
  readonly overallStatus: 'empty' | 'incomplete' | 'ready' | 'blocked';
  readonly readinessMatrix: ReadinessMatrix;
  readonly elementCounts: ElementCounts;
}

const STEP_IDS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10'] as const;

function hasBlocker(issues: readonly StepIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'BLOCKER');
}

function statusFromIssues(completionPercent: number, issues: readonly StepIssue[]): StepStatus {
  if (hasBlocker(issues)) return 'error';
  if (completionPercent >= 100) return 'complete';
  if (completionPercent > 0) return 'partial';
  return 'empty';
}

function isLineOrCable(branch: Branch): branch is OverheadLine | Cable {
  return branch.type === 'line_overhead' || branch.type === 'cable';
}

function branchHasZeroSequence(branch: Branch): boolean {
  if (!isLineOrCable(branch)) return true;
  return branch.r0_ohm_per_km != null || branch.x0_ohm_per_km != null;
}

function evaluateK1(enm: EnergyNetworkModel): StepState {
  const issues: StepIssue[] = [];
  let completionPercent = 0;

  if (enm.header.name.trim().length > 0) {
    completionPercent += 50;
  } else {
    issues.push({ code: 'K1_NO_NAME', severity: 'BLOCKER', messagePl: 'Brak nazwy projektu' });
  }

  if (enm.header.defaults.frequency_hz > 0) {
    completionPercent += 50;
  } else {
    issues.push({ code: 'K1_NO_FREQUENCY', severity: 'IMPORTANT', messagePl: 'Brak czestotliwosci znamionowej' });
  }

  return { stepId: 'K1', status: statusFromIssues(completionPercent, issues), completionPercent, issues };
}

function evaluateK2(enm: EnergyNetworkModel): StepState {
  const issues: StepIssue[] = [];
  let completionPercent = 0;

  const sourceBus = enm.buses.find((bus) => bus.tags.includes('source') || enm.sources.some((source) => source.bus_ref === bus.ref_id));
  if (sourceBus) {
    completionPercent += sourceBus.voltage_kv > 0 ? 50 : 25;
  } else {
    issues.push({ code: 'K2_NO_SOURCE_BUS', severity: 'BLOCKER', messagePl: 'Brak szyny zasilajacej' });
  }

  if (enm.sources.length > 0) {
    completionPercent += 50;
  } else {
    issues.push({ code: 'K2_NO_SOURCE', severity: 'BLOCKER', messagePl: 'Brak zrodla zasilania' });
  }

  return {
    stepId: 'K2',
    status: statusFromIssues(Math.min(100, completionPercent), issues),
    completionPercent: Math.min(100, completionPercent),
    issues,
  };
}

function evaluateK3(enm: EnergyNetworkModel): StepState {
  const issues: StepIssue[] = [];
  const completionPercent = enm.buses.length > 0 ? 100 : 0;
  if (enm.buses.length === 0) {
    issues.push({ code: 'K3_NO_BUSES', severity: 'BLOCKER', messagePl: 'Brak szyn w modelu' });
  }
  return { stepId: 'K3', status: statusFromIssues(completionPercent, issues), completionPercent, issues };
}

function evaluateK4(enm: EnergyNetworkModel): StepState {
  const issues: StepIssue[] = [];
  const busRefs = new Set(enm.buses.map((bus) => bus.ref_id));
  const lineBranches = enm.branches.filter(isLineOrCable);

  for (const branch of lineBranches) {
    if (!busRefs.has(branch.from_bus_ref)) {
      issues.push({ code: 'K4_DANGLING_FROM', severity: 'BLOCKER', messagePl: `Galaz ${branch.name}: brak szyny poczatkowej`, elementRef: branch.ref_id });
    }
    if (!busRefs.has(branch.to_bus_ref)) {
      issues.push({ code: 'K4_DANGLING_TO', severity: 'BLOCKER', messagePl: `Galaz ${branch.name}: brak szyny koncowej`, elementRef: branch.ref_id });
    }
  }

  const completionPercent = lineBranches.length > 0 ? 100 : 0;
  return { stepId: 'K4', status: statusFromIssues(completionPercent, issues), completionPercent, issues };
}

function evaluateK5(enm: EnergyNetworkModel): StepState {
  const issues: StepIssue[] = [];

  for (const transformer of enm.transformers) {
    if (transformer.sn_mva <= 0) {
      issues.push({ code: 'K5_SN_ZERO', severity: 'BLOCKER', messagePl: `Transformator ${transformer.name}: Sn musi byc dodatnie`, elementRef: transformer.ref_id });
    }
    if (transformer.uk_percent <= 0) {
      issues.push({ code: 'K5_UK_ZERO', severity: 'BLOCKER', messagePl: `Transformator ${transformer.name}: uk% musi byc dodatnie`, elementRef: transformer.ref_id });
    }
    if (transformer.hv_bus_ref === transformer.lv_bus_ref) {
      issues.push({ code: 'K5_SAME_BUS', severity: 'BLOCKER', messagePl: `Transformator ${transformer.name}: ta sama szyna po obu stronach`, elementRef: transformer.ref_id });
    }
  }

  const completionPercent = enm.transformers.length > 0 ? 100 : 0;
  return { stepId: 'K5', status: statusFromIssues(completionPercent, issues), completionPercent, issues };
}

function evaluateK6(enm: EnergyNetworkModel): StepState {
  const issues: StepIssue[] = [];
  const busRefs = new Set(enm.buses.map((bus) => bus.ref_id));

  for (const load of enm.loads) {
    if (!busRefs.has(load.bus_ref)) {
      issues.push({ code: 'K6_LOAD_DANGLING', severity: 'BLOCKER', messagePl: `Odbior ${load.name}: szyna nie istnieje`, elementRef: load.ref_id });
    }
  }

  for (const generator of enm.generators) {
    if (!generator.bus_ref || !busRefs.has(generator.bus_ref)) {
      issues.push({ code: 'K6_GENERATOR_DANGLING', severity: 'BLOCKER', messagePl: `Generator ${generator.name}: szyna nie istnieje`, elementRef: generator.ref_id });
    }
  }

  const completionPercent = enm.loads.length + enm.generators.length > 0 ? 100 : 0;
  return { stepId: 'K6', status: statusFromIssues(completionPercent, issues), completionPercent, issues };
}

function evaluateK7(enm: EnergyNetworkModel): StepState {
  const issues: StepIssue[] = [];
  const lineBranches = enm.branches.filter(isLineOrCable);
  const missingBranchZ0 = lineBranches.filter((branch) => !branchHasZeroSequence(branch)).length;
  const missingSourceZ0 = enm.sources.filter((source) => source.r0_ohm == null && source.x0_ohm == null && source.z0_z1_ratio == null).length;

  if (missingBranchZ0 > 0) {
    issues.push({ code: 'K7_BRANCH_Z0_MISSING', severity: 'INFO', messagePl: `${missingBranchZ0} galezi bez danych Z0` });
  }
  if (missingSourceZ0 > 0) {
    issues.push({ code: 'K7_SOURCE_Z0_MISSING', severity: 'INFO', messagePl: `${missingSourceZ0} zrodel bez danych Z0` });
  }

  const total = lineBranches.length + enm.sources.length;
  const complete = total - missingBranchZ0 - missingSourceZ0;
  const completionPercent = total > 0 ? Math.max(0, Math.round((complete / total) * 100)) : 100;

  return { stepId: 'K7', status: completionPercent >= 100 ? 'complete' : 'partial', completionPercent, issues };
}

function computeReadiness(enm: EnergyNetworkModel, prereqSteps: readonly StepState[]): ReadinessMatrix {
  const hasModelBlockers = prereqSteps.some((step) => step.status === 'error');
  const hasBuses = enm.buses.length > 0;
  const hasSources = enm.sources.length > 0;
  const hasNetworkElement = enm.branches.length > 0 || enm.transformers.length > 0;

  const shortCircuit3FMissing: string[] = [];
  if (!hasBuses) shortCircuit3FMissing.push('Brak szyn');
  if (!hasSources) shortCircuit3FMissing.push('Brak zrodla zasilania');
  if (!hasNetworkElement) shortCircuit3FMissing.push('Brak galezi lub transformatorow');
  if (hasModelBlockers) shortCircuit3FMissing.push('Model zawiera blokery');

  const shortCircuit1FMissing = [...shortCircuit3FMissing];
  if (enm.branches.some((branch) => !branchHasZeroSequence(branch))) {
    shortCircuit1FMissing.push('Brak danych Z0 w galeziach');
  }
  if (enm.sources.some((source) => source.r0_ohm == null && source.x0_ohm == null && source.z0_z1_ratio == null)) {
    shortCircuit1FMissing.push('Brak danych Z0 w zrodlach');
  }

  const loadFlowMissing: string[] = [];
  if (!hasBuses) loadFlowMissing.push('Brak szyn');
  if (!hasSources) loadFlowMissing.push('Brak zrodla zasilania');
  if (enm.loads.length === 0 && enm.generators.length === 0) loadFlowMissing.push('Brak odbiorow lub generatorow');
  if (hasModelBlockers) loadFlowMissing.push('Model zawiera blokery');

  return {
    shortCircuit3F: { available: shortCircuit3FMissing.length === 0, missingRequirements: shortCircuit3FMissing },
    shortCircuit1F: { available: shortCircuit1FMissing.length === 0, missingRequirements: shortCircuit1FMissing },
    loadFlow: { available: loadFlowMissing.length === 0, missingRequirements: loadFlowMissing },
  };
}

function evaluateK8(prereqSteps: readonly StepState[]): StepState {
  const blockerSteps = prereqSteps.filter((step) => step.status === 'error');
  const issues: StepIssue[] = blockerSteps.length > 0
    ? [{ code: 'K8_HAS_BLOCKERS', severity: 'BLOCKER', messagePl: `Kroki z blokerami: ${blockerSteps.map((step) => step.stepId).join(', ')}` }]
    : [];
  return { stepId: 'K8', status: issues.length > 0 ? 'error' : 'complete', completionPercent: issues.length > 0 ? 0 : 100, issues };
}

function evaluateK9(): StepState {
  return { stepId: 'K9', status: 'complete', completionPercent: 100, issues: [] };
}

function evaluateK10(readinessMatrix: ReadinessMatrix): StepState {
  const available = readinessMatrix.shortCircuit3F.available || readinessMatrix.shortCircuit1F.available || readinessMatrix.loadFlow.available;
  return { stepId: 'K10', status: available ? 'complete' : 'partial', completionPercent: available ? 100 : 50, issues: [] };
}

export function computeWizardState(enm: EnergyNetworkModel): WizardState {
  const k1 = evaluateK1(enm);
  const k2 = evaluateK2(enm);
  const k3 = evaluateK3(enm);
  const k4 = evaluateK4(enm);
  const k5 = evaluateK5(enm);
  const k6 = evaluateK6(enm);
  const k7 = evaluateK7(enm);
  const prereqSteps = [k1, k2, k3, k4, k5, k6, k7] as const;
  const readinessMatrix = computeReadiness(enm, prereqSteps);
  const steps: StepState[] = [...prereqSteps, evaluateK8(prereqSteps), evaluateK9(), evaluateK10(readinessMatrix)];

  const requiredStepsReady = steps
    .filter((step) => step.stepId === 'K1' || step.stepId === 'K2' || step.stepId === 'K3')
    .every((step) => step.status === 'complete');
  const hasAnyModelData = enm.buses.length > 0 || enm.sources.length > 0 || enm.branches.length > 0 || enm.transformers.length > 0;
  const hasBlockers = steps.some((step) => step.status === 'error');

  const overallStatus: WizardState['overallStatus'] = hasBlockers
    ? 'blocked'
    : requiredStepsReady
      ? 'ready'
      : hasAnyModelData
        ? 'incomplete'
        : 'empty';

  return {
    steps: STEP_IDS.map((stepId) => steps.find((step) => step.stepId === stepId)).filter((step): step is StepState => step !== undefined),
    overallStatus,
    readinessMatrix,
    elementCounts: {
      buses: enm.buses.length,
      sources: enm.sources.length,
      transformers: enm.transformers.length,
      branches: enm.branches.length,
      loads: enm.loads.length,
      generators: enm.generators.length,
      measurements: enm.measurements.length,
      protectionAssignments: enm.protection_assignments.length,
    },
  };
}

export function getStepStatusColor(status: StepStatus): string {
  switch (status) {
    case 'complete':
      return '#22c55e';
    case 'partial':
      return '#eab308';
    case 'error':
      return '#ef4444';
    case 'empty':
    default:
      return '#d1d5db';
  }
}

export function getOverallStatusLabel(status: WizardState['overallStatus']): string {
  switch (status) {
    case 'ready':
      return 'Gotowy do obliczen';
    case 'incomplete':
      return 'W trakcie';
    case 'blocked':
      return 'Blokery';
    case 'empty':
    default:
      return 'Pusty';
  }
}
