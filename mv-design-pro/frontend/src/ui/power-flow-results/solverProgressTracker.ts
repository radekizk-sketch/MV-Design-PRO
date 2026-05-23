/**
 * solverProgressTracker — śledzenie progress iteracji solvera (Etap 10 z planu).
 *
 * "Loading overlay z progress bar dla iteracji PF (max_iter / current_iter)"
 * "Toast sukcesu: 'Power Flow zbieżność po 7 iteracjach (residual: 1e-6)'"
 *
 * Wzór: % progress = current_iter / max_iter
 * Diverged: residual rośnie albo current_iter == max_iter bez zbieżności.
 */

export type SolverState = 'idle' | 'running' | 'converged' | 'diverged' | 'stalled' | 'cancelled';
export type SolverAlgorithm = 'newton_raphson' | 'gauss_seidel' | 'fast_decoupled';

export interface SolverIteration {
  iter: number;
  residual: number;
  timeElapsedMs: number;
}

export interface SolverProgress {
  state: SolverState;
  algorithm: SolverAlgorithm;
  maxIter: number;
  currentIter: number;
  iterations: SolverIteration[];
  tolerance: number;
  startTime: number;
  endTime?: number;
}

export function createSolverProgress(
  algorithm: SolverAlgorithm,
  maxIter: number,
  tolerance: number,
): SolverProgress {
  return {
    state: 'idle',
    algorithm,
    maxIter,
    currentIter: 0,
    iterations: [],
    tolerance,
    startTime: 0,
  };
}

export function startSolver(progress: SolverProgress): SolverProgress {
  return { ...progress, state: 'running', startTime: Date.now(), iterations: [] };
}

export function recordIteration(progress: SolverProgress, residual: number): SolverProgress {
  const iter = progress.currentIter + 1;
  const timeElapsedMs = Date.now() - progress.startTime;
  const iterations = [...progress.iterations, { iter, residual, timeElapsedMs }];

  let state: SolverState = 'running';
  let endTime: number | undefined;

  if (residual <= progress.tolerance) {
    state = 'converged';
    endTime = Date.now();
  } else if (iter >= progress.maxIter) {
    state = 'diverged';
    endTime = Date.now();
  } else if (iterations.length >= 3) {
    // Stalled detection: ostatnie 3 iteracje pokazują brak postępu
    const last3 = iterations.slice(-3);
    const r1 = last3[0].residual;
    const r3 = last3[2].residual;
    if (r3 >= r1 * 0.99 && r1 > progress.tolerance) {
      state = 'stalled';
      endTime = Date.now();
    }
  }

  return {
    ...progress,
    state,
    currentIter: iter,
    iterations,
    endTime,
  };
}

export function cancelSolver(progress: SolverProgress): SolverProgress {
  return {
    ...progress,
    state: 'cancelled',
    endTime: Date.now(),
  };
}

export function progressPercent(progress: SolverProgress): number {
  if (progress.maxIter <= 0) return 0;
  return Math.min(100, Math.round((progress.currentIter / progress.maxIter) * 100));
}

export function elapsedMs(progress: SolverProgress): number {
  if (progress.startTime === 0) return 0;
  return (progress.endTime ?? Date.now()) - progress.startTime;
}

export function summarizeResult(progress: SolverProgress): {
  message: string;
  severity: 'success' | 'warning' | 'error' | 'info';
} {
  const elapsed = elapsedMs(progress);
  const lastIter = progress.iterations[progress.iterations.length - 1];

  switch (progress.state) {
    case 'converged':
      return {
        message: `Solver ${algorithmLabel(progress.algorithm)} zbieżność po ${progress.currentIter} iteracjach (residual: ${formatResidual(lastIter?.residual ?? 0)}, czas: ${formatElapsed(elapsed)}).`,
        severity: 'success',
      };
    case 'diverged':
      return {
        message: `Solver ${algorithmLabel(progress.algorithm)} nie osiągnął zbieżności po ${progress.currentIter} iteracjach (max_iter=${progress.maxIter}, ostatni residual: ${formatResidual(lastIter?.residual ?? 0)}).`,
        severity: 'error',
      };
    case 'stalled':
      return {
        message: `Solver ${algorithmLabel(progress.algorithm)} zatrzymał się — brak postępu w ostatnich iteracjach. Spróbuj innego algorytmu lub zwiększ tolerancję.`,
        severity: 'warning',
      };
    case 'cancelled':
      return {
        message: 'Obliczenia anulowane przez użytkownika.',
        severity: 'info',
      };
    case 'running':
      return {
        message: `Iteracja ${progress.currentIter}/${progress.maxIter} — residual: ${formatResidual(lastIter?.residual ?? Infinity)}.`,
        severity: 'info',
      };
    default:
      return { message: 'Solver gotowy do uruchomienia.', severity: 'info' };
  }
}

function algorithmLabel(algo: SolverAlgorithm): string {
  return {
    newton_raphson: 'Newton-Raphson',
    gauss_seidel: 'Gauss-Seidel',
    fast_decoupled: 'Fast Decoupled',
  }[algo];
}

function formatResidual(residual: number): string {
  if (residual === Infinity || !Number.isFinite(residual)) return '∞';
  return residual.toExponential(2);
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
