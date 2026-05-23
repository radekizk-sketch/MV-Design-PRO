import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  createSolverProgress,
  startSolver,
  recordIteration,
  cancelSolver,
  progressPercent,
  elapsedMs,
  summarizeResult,
} from '../solverProgressTracker';

describe('createSolverProgress', () => {
  it('initial state = idle', () => {
    const p = createSolverProgress('newton_raphson', 50, 1e-6);
    expect(p.state).toBe('idle');
    expect(p.maxIter).toBe(50);
    expect(p.currentIter).toBe(0);
    expect(p.iterations).toHaveLength(0);
  });
});

describe('startSolver', () => {
  it('zmienia state na running + startTime', () => {
    const p = startSolver(createSolverProgress('newton_raphson', 50, 1e-6));
    expect(p.state).toBe('running');
    expect(p.startTime).toBeGreaterThan(0);
  });
});

describe('recordIteration', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('residual ≤ tolerance → converged', () => {
    let p = startSolver(createSolverProgress('newton_raphson', 50, 1e-6));
    p = recordIteration(p, 1e-7);
    expect(p.state).toBe('converged');
    expect(p.currentIter).toBe(1);
    expect(p.endTime).toBeDefined();
  });

  it('iter == max_iter bez zbieżności → diverged', () => {
    let p = startSolver(createSolverProgress('newton_raphson', 3, 1e-6));
    p = recordIteration(p, 1e-2);
    p = recordIteration(p, 5e-3);
    p = recordIteration(p, 1e-3); // 3rd iter, max=3
    expect(p.state).toBe('diverged');
  });

  it('stalled detection: 3 iteracje bez postępu', () => {
    let p = startSolver(createSolverProgress('newton_raphson', 50, 1e-6));
    p = recordIteration(p, 0.01);
    p = recordIteration(p, 0.01);
    p = recordIteration(p, 0.01);
    expect(p.state).toBe('stalled');
  });

  it('postęp zachowany → state pozostaje running', () => {
    let p = startSolver(createSolverProgress('newton_raphson', 50, 1e-6));
    p = recordIteration(p, 1.0);
    p = recordIteration(p, 0.5);
    p = recordIteration(p, 0.1);
    expect(p.state).toBe('running');
  });
});

describe('cancelSolver', () => {
  it('state → cancelled + endTime', () => {
    let p = startSolver(createSolverProgress('newton_raphson', 50, 1e-6));
    p = recordIteration(p, 0.1);
    p = cancelSolver(p);
    expect(p.state).toBe('cancelled');
    expect(p.endTime).toBeDefined();
  });
});

describe('progressPercent', () => {
  it('0% gdy currentIter=0', () => {
    const p = createSolverProgress('newton_raphson', 50, 1e-6);
    expect(progressPercent(p)).toBe(0);
  });

  it('50% gdy currentIter=25 z max=50', () => {
    let p = startSolver(createSolverProgress('newton_raphson', 50, 1e-6));
    for (let i = 0; i < 25; i++) {
      p = recordIteration(p, 1.0 / (i + 1));
    }
    // currentIter = 25, max = 50
    expect(progressPercent(p)).toBe(50);
  });
});

describe('summarizeResult', () => {
  it('converged → success message z residual + czas', () => {
    let p = startSolver(createSolverProgress('newton_raphson', 50, 1e-6));
    p = recordIteration(p, 1e-7);
    const summary = summarizeResult(p);
    expect(summary.severity).toBe('success');
    expect(summary.message).toContain('zbieżność');
    expect(summary.message).toContain('Newton-Raphson');
  });

  it('diverged → error message z max_iter', () => {
    let p = startSolver(createSolverProgress('newton_raphson', 2, 1e-6));
    p = recordIteration(p, 0.5);
    p = recordIteration(p, 0.4);
    const summary = summarizeResult(p);
    expect(summary.severity).toBe('error');
    expect(summary.message).toMatch(/zbieżnoś/);
  });

  it('stalled → warning message z sugestią', () => {
    let p = startSolver(createSolverProgress('newton_raphson', 50, 1e-6));
    for (let i = 0; i < 3; i++) {
      p = recordIteration(p, 0.001);
    }
    const summary = summarizeResult(p);
    expect(summary.severity).toBe('warning');
    expect(summary.message).toContain('zatrzymał');
  });

  it('algorytm labels: NR/GS/FD są polskie', () => {
    const algos: Array<['newton_raphson' | 'gauss_seidel' | 'fast_decoupled', string]> = [
      ['newton_raphson', 'Newton-Raphson'],
      ['gauss_seidel', 'Gauss-Seidel'],
      ['fast_decoupled', 'Fast Decoupled'],
    ];
    for (const [algo, label] of algos) {
      let p = startSolver(createSolverProgress(algo, 50, 1e-6));
      p = recordIteration(p, 1e-7);
      expect(summarizeResult(p).message).toContain(label);
    }
  });
});
