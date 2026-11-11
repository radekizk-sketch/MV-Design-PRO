/**
 * K2b §0.4 — TRYB WIDOKU SCHEMATU w sklepie powłoki: domyślnie 'roboczy', przełączanie
 * roboczy ⇄ arkusz, utrwalenie w `mvd-shell-ui-local` i odczyt po przeładowaniu.
 * Iloczyn: zapis {brak · 'arkusz' · 'roboczy' · wartość nieznana} × odczyt (rehydratacja).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useShellStore } from '../useShellStore';

const KLUCZ = 'mvd-shell-ui-local';

describe('tryb widoku schematu (sklep powłoki)', () => {
  beforeEach(() => {
    localStorage.clear();
    useShellStore.getState().setTrybWidokuSchematu('roboczy');
  });

  it('przełącznik: roboczy → arkusz → roboczy, każdy stan zapisany w magazynie przeglądarki', () => {
    expect(useShellStore.getState().trybWidokuSchematu).toBe('roboczy');
    useShellStore.getState().przelaczTrybWidokuSchematu();
    expect(useShellStore.getState().trybWidokuSchematu).toBe('arkusz');
    expect(JSON.parse(localStorage.getItem(KLUCZ)!).state.trybWidokuSchematu).toBe('arkusz');
    useShellStore.getState().przelaczTrybWidokuSchematu();
    expect(JSON.parse(localStorage.getItem(KLUCZ)!).state.trybWidokuSchematu).toBe('roboczy');
  });

  it.each([
    ['arkusz', 'arkusz'],
    ['roboczy', 'roboczy'],
    ['ramka', 'roboczy'],
    [undefined, 'roboczy'],
  ] as const)('zapis %s → po odczycie %s', async (zapis, oczekiwany) => {
    useShellStore.getState().setTrybWidokuSchematu(oczekiwany === 'arkusz' ? 'roboczy' : 'arkusz');
    localStorage.setItem(KLUCZ, JSON.stringify({ state: zapis === undefined ? {} : { trybWidokuSchematu: zapis }, version: 0 }));
    await useShellStore.persist.rehydrate();
    expect(useShellStore.getState().trybWidokuSchematu).toBe(oczekiwany);
  });
});
