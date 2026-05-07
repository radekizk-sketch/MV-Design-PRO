/**
 * AnonymizationProvider — React context dla Phase 5 (operator-grade SLD plan v2).
 *
 * 6 toggles (master + 5 sub) + salt management.
 *
 * Acceptance Invariant 8: Anonimizacja zmienia prezentację only, NIE
 * topology_hash ani layout_hash. View_hash zmienia się.
 *
 * Hook `useAnonymizedLabel(rawLabel, kind)` używany przez wszystkie renderery
 * do projekcji etykiet przez `anonymize.ts:anonymizeLabel()`.
 */
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {
  type AnonymizableKind,
  type AnonymizationConfig,
  type AnonymizationToggles,
  DEFAULT_CONFIG,
  DEFAULT_TOGGLES,
  anonymizeLabel,
  anonymizeNumeric,
  shouldAnonymize,
} from './anonymize';

interface AnonymizationContextValue {
  readonly config: AnonymizationConfig;
  readonly setEnabled: (enabled: boolean) => void;
  readonly setToggle: <K extends keyof AnonymizationToggles>(
    key: K,
    value: AnonymizationToggles[K],
  ) => void;
  readonly setSalt: (salt: string) => void;
  readonly resetToggles: () => void;
}

const Ctx = createContext<AnonymizationContextValue | null>(null);

interface ProviderProps {
  readonly children: ReactNode;
  readonly initialConfig?: Partial<AnonymizationConfig>;
}

export function AnonymizationProvider(props: ProviderProps): JSX.Element {
  const [config, setConfig] = useState<AnonymizationConfig>(() => ({
    salt: props.initialConfig?.salt ?? DEFAULT_CONFIG.salt,
    enabled: props.initialConfig?.enabled ?? DEFAULT_CONFIG.enabled,
    toggles: {
      ...DEFAULT_TOGGLES,
      ...(props.initialConfig?.toggles ?? {}),
    },
  }));

  const setEnabled = useCallback((enabled: boolean) => {
    setConfig((c) => ({ ...c, enabled }));
  }, []);

  const setToggle = useCallback(
    <K extends keyof AnonymizationToggles>(key: K, value: AnonymizationToggles[K]) => {
      setConfig((c) => ({ ...c, toggles: { ...c.toggles, [key]: value } }));
    },
    [],
  );

  const setSalt = useCallback((salt: string) => {
    setConfig((c) => ({ ...c, salt }));
  }, []);

  const resetToggles = useCallback(() => {
    setConfig((c) => ({ ...c, toggles: { ...DEFAULT_TOGGLES } }));
  }, []);

  const value = useMemo<AnonymizationContextValue>(
    () => ({ config, setEnabled, setToggle, setSalt, resetToggles }),
    [config, setEnabled, setToggle, setSalt, resetToggles],
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

/**
 * Hook konsumowany przez renderery: zwraca anonimizowaną etykietę na podstawie
 * rawLabel + kind. Gdy provider nieobecny — zwraca raw (no-op safe default).
 */
export function useAnonymizedLabel(rawLabel: string, kind: AnonymizableKind): string {
  const ctx = useContext(Ctx);
  if (!ctx) return rawLabel; // brak provider → no-op
  return anonymizeLabel(rawLabel, kind, ctx.config);
}

/**
 * Hook dla wartości liczbowych (moc/wyniki).
 * Zwraca '—' dla anonimizowanych wartości lub original number.
 */
export function useAnonymizedNumeric(
  value: number | null | undefined,
  kind: 'power' | 'result',
): number | null | string {
  const ctx = useContext(Ctx);
  if (!ctx) return value ?? null;
  return anonymizeNumeric(value, kind, ctx.config);
}

/** Hook do dostępu do całego config (np. do toolbar UI). */
export function useAnonymizationConfig(): AnonymizationContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useAnonymizationConfig must be used within AnonymizationProvider');
  }
  return ctx;
}

/** Hook helper: czy kind jest aktualnie anonimizowany. */
export function useShouldAnonymize(kind: AnonymizableKind): boolean {
  const ctx = useContext(Ctx);
  if (!ctx) return false;
  return shouldAnonymize(kind, ctx.config);
}
