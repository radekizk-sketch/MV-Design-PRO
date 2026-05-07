/**
 * AnonymizationProvider tests + hooks (Phase 5).
 *
 * Pokrycie:
 *   1. Default config = enabled=false → no-op.
 *   2. setEnabled(true) → anonimizacja aktywna.
 *   3. setToggle(hideNames, false) → station/gpz raw.
 *   4. setSalt → stabilna re-generacja.
 *   5. resetToggles → DEFAULT_TOGGLES.
 *   6. useAnonymizedLabel poza provider → no-op.
 *   7. useAnonymizedNumeric: hidePower → '—'.
 *   8. useShouldAnonymize: zgodne z toggles.
 *   9. useAnonymizationConfig poza provider → throws.
 */
import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AnonymizationProvider,
  useAnonymizationConfig,
  useAnonymizedLabel,
  useAnonymizedNumeric,
  useShouldAnonymize,
} from '../AnonymizationProvider';

function wrapper({ children }: { children: React.ReactNode }) {
  return <AnonymizationProvider>{children}</AnonymizationProvider>;
}

function wrapperWithEnabled({ children }: { children: React.ReactNode }) {
  return (
    <AnonymizationProvider initialConfig={{ enabled: true, salt: 'test-salt' }}>
      {children}
    </AnonymizationProvider>
  );
}

describe('AnonymizationProvider — default config', () => {
  it('Default enabled=false → useAnonymizedLabel zwraca raw', () => {
    const { result } = renderHook(() => useAnonymizedLabel('GPZ Olsztyn', 'gpz'), {
      wrapper,
    });
    expect(result.current).toBe('GPZ Olsztyn');
  });

  it('Default enabled=false → useShouldAnonymize zwraca false', () => {
    const { result } = renderHook(() => useShouldAnonymize('gpz'), { wrapper });
    expect(result.current).toBe(false);
  });
});

describe('AnonymizationProvider — setEnabled / setToggle', () => {
  it('setEnabled(true) → label anonimizowany', () => {
    const { result } = renderHook(
      () => {
        const ctx = useAnonymizationConfig();
        const label = useAnonymizedLabel('GPZ Olsztyn', 'gpz');
        return { ctx, label };
      },
      { wrapper },
    );
    expect(result.current.label).toBe('GPZ Olsztyn');
    act(() => {
      result.current.ctx.setEnabled(true);
    });
    expect(result.current.label).not.toBe('GPZ Olsztyn');
    expect(result.current.label).toMatch(/^GPZ-/);
  });

  it('setToggle(hideNames, false) gdy enabled → station raw', () => {
    const { result } = renderHook(
      () => {
        const ctx = useAnonymizationConfig();
        const label = useAnonymizedLabel('Stacja A', 'station');
        return { ctx, label };
      },
      { wrapper: wrapperWithEnabled },
    );
    expect(result.current.label).not.toBe('Stacja A'); // default hideNames=true → anonim
    act(() => {
      result.current.ctx.setToggle('hideNames', false);
    });
    expect(result.current.label).toBe('Stacja A');
  });

  it('setSalt → różne pseudonimy dla tego samego label', () => {
    const { result } = renderHook(
      () => {
        const ctx = useAnonymizationConfig();
        const label = useAnonymizedLabel('GPZ X', 'gpz');
        return { ctx, label };
      },
      { wrapper: wrapperWithEnabled },
    );
    const firstPseudonym = result.current.label;
    act(() => {
      result.current.ctx.setSalt('different-salt');
    });
    expect(result.current.label).not.toBe(firstPseudonym);
  });

  it('resetToggles → DEFAULT_TOGGLES', () => {
    const { result } = renderHook(
      () => {
        const ctx = useAnonymizationConfig();
        return ctx;
      },
      { wrapper: wrapperWithEnabled },
    );
    act(() => {
      result.current.setToggle('hideNames', false);
      result.current.setToggle('hidePower', true);
    });
    expect(result.current.config.toggles.hideNames).toBe(false);
    expect(result.current.config.toggles.hidePower).toBe(true);
    act(() => {
      result.current.resetToggles();
    });
    expect(result.current.config.toggles.hideNames).toBe(true);  // DEFAULT_TOGGLES.hideNames=true
    expect(result.current.config.toggles.hidePower).toBe(false);
  });
});

describe('AnonymizationProvider — useAnonymizedNumeric', () => {
  it('hidePower=false (default) + enabled → wartość zachowana', () => {
    const { result } = renderHook(() => useAnonymizedNumeric(100, 'power'), {
      wrapper: wrapperWithEnabled,
    });
    expect(result.current).toBe(100);
  });

  it('hidePower=true + enabled → "—"', () => {
    const { result } = renderHook(
      () => {
        const ctx = useAnonymizationConfig();
        const value = useAnonymizedNumeric(100, 'power');
        return { ctx, value };
      },
      { wrapper: wrapperWithEnabled },
    );
    act(() => {
      result.current.ctx.setToggle('hidePower', true);
    });
    expect(result.current.value).toBe('—');
  });

  it('Bez provider → wartość zachowana', () => {
    const { result } = renderHook(() => useAnonymizedNumeric(100, 'power'));
    expect(result.current).toBe(100);
  });
});

describe('AnonymizationProvider — error paths', () => {
  it('useAnonymizationConfig poza provider → throws', () => {
    expect(() => renderHook(() => useAnonymizationConfig())).toThrow(
      /must be used within AnonymizationProvider/,
    );
  });

  it('useAnonymizedLabel poza provider → no-op (no throw)', () => {
    const { result } = renderHook(() => useAnonymizedLabel('Stacja A', 'station'));
    expect(result.current).toBe('Stacja A');
  });
});

describe('AnonymizationProvider — render integration', () => {
  it('Provider wystawia zmienne dzieci', () => {
    const { container } = render(
      <AnonymizationProvider>
        <div data-testid="child">child</div>
      </AnonymizationProvider>,
    );
    expect(container.querySelector('[data-testid="child"]')).toBeTruthy();
  });

  it('initialConfig.enabled=true → label od razu anonimizowany', () => {
    const { result } = renderHook(() => useAnonymizedLabel('GPZ X', 'gpz'), {
      wrapper: wrapperWithEnabled,
    });
    expect(result.current).not.toBe('GPZ X');
  });
});
