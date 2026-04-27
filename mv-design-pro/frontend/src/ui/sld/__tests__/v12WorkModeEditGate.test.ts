/**
 * Testy bramki edycji V12 — V12 § 5.6
 *
 * Weryfikuje:
 * - Tylko tryb TE (Edycja) daje uprawnienie do edycji modelu
 * - Wszystkie pozostałe tryby (TW, TZ, TP, TA, TN) blokują edycję
 * - Komunikat o blokadzie jest po polsku i nie zawiera zakazanych terminów
 * - useIsAuditMode zwraca true tylko dla TA
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStateStore } from '../../app-state/store';
import { useWorkModeEditAllowed, useIsAuditMode, useWorkModeLabel } from '../../mode-gate/useModePermissions';
import type { WorkMode } from '../../app-state/store';

const FORBIDDEN_TERMS = ['PCC', 'snapshot', 'proof', 'feeder', 'branch', 'wizard', 'legacy', 'Boundary'];

describe('useWorkModeEditAllowed', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
  });

  const READ_ONLY_MODES: WorkMode[] = ['TW', 'TZ', 'TP', 'TA', 'TN'];

  it('TE: edycja dozwolona', () => {
    act(() => useAppStateStore.getState().setActiveWorkMode('TE'));
    const { result } = renderHook(() => useWorkModeEditAllowed());
    expect(result.current.allowed).toBe(true);
    expect(result.current.blockedReason).toBeNull();
  });

  for (const mode of READ_ONLY_MODES) {
    it(`${mode}: edycja zablokowana`, () => {
      act(() => useAppStateStore.getState().setActiveWorkMode(mode));
      const { result } = renderHook(() => useWorkModeEditAllowed());
      expect(result.current.allowed).toBe(false);
      expect(result.current.blockedReason).toBeTruthy();
    });
  }

  it('komunikat o blokadzie jest po polsku i nie zawiera zakazanych terminów', () => {
    act(() => useAppStateStore.getState().setActiveWorkMode('TW'));
    const { result } = renderHook(() => useWorkModeEditAllowed());
    const msg = result.current.blockedReason ?? '';
    expect(msg.length).toBeGreaterThan(10);
    for (const term of FORBIDDEN_TERMS) {
      expect(msg.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });
});

describe('useIsAuditMode', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
  });

  it('true tylko dla TA', () => {
    act(() => useAppStateStore.getState().setActiveWorkMode('TA'));
    const { result } = renderHook(() => useIsAuditMode());
    expect(result.current).toBe(true);
  });

  it('false dla wszystkich innych trybów', () => {
    const nonAuditModes: WorkMode[] = ['TE', 'TW', 'TZ', 'TP', 'TN'];
    for (const mode of nonAuditModes) {
      act(() => useAppStateStore.getState().setActiveWorkMode(mode));
      const { result } = renderHook(() => useIsAuditMode());
      expect(result.current).toBe(false);
    }
  });
});

describe('useWorkModeLabel', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
  });

  it('zwraca etykiety po polsku bez zakazanych terminów', () => {
    const modes: WorkMode[] = ['TE', 'TW', 'TZ', 'TP', 'TA', 'TN'];
    for (const mode of modes) {
      act(() => useAppStateStore.getState().setActiveWorkMode(mode));
      const { result } = renderHook(() => useWorkModeLabel());
      expect(result.current.length).toBeGreaterThan(1);
      for (const term of FORBIDDEN_TERMS) {
        expect(result.current.toLowerCase()).not.toContain(term.toLowerCase());
      }
    }
  });

  it('TE → "Edycja"', () => {
    act(() => useAppStateStore.getState().setActiveWorkMode('TE'));
    const { result } = renderHook(() => useWorkModeLabel());
    expect(result.current).toBe('Edycja');
  });

  it('TA → "Audyt"', () => {
    act(() => useAppStateStore.getState().setActiveWorkMode('TA'));
    const { result } = renderHook(() => useWorkModeLabel());
    expect(result.current).toBe('Audyt');
  });
});
