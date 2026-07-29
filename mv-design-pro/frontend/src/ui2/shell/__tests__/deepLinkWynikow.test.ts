/**
 * Test kontraktu jednorazowego żądania deep-linku zakładki „Wyniki" (R2-B):
 * `wynikiTab` + kontekst elementu `wynikiTabElement` są ustawiane i czyszczone
 * RAZEM przez `setWynikiTab`. Wywołania bez elementu (konsumenci sprzed R2-B)
 * działają 1:1 i zerują kontekst — żaden ref nie zalega między żądaniami.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { useShellStore } from '../useShellStore';

describe('useShellStore — deep-link zakładki „Wyniki" z kontekstem elementu (R2-B)', () => {
  beforeEach(() => {
    useShellStore.setState({ wynikiTab: null, wynikiTabElement: null });
  });

  it('setWynikiTab(tab, element) ustawia oba pola żądania', () => {
    useShellStore.getState().setWynikiTab('kompensacja', 'bus-a');
    expect(useShellStore.getState().wynikiTab).toBe('kompensacja');
    expect(useShellStore.getState().wynikiTabElement).toBe('bus-a');
  });

  it('setWynikiTab(tab) bez elementu działa 1:1 i zeruje kontekst elementu', () => {
    useShellStore.setState({ wynikiTab: 'kompensacja', wynikiTabElement: 'bus-a' });
    useShellStore.getState().setWynikiTab('studium');
    expect(useShellStore.getState().wynikiTab).toBe('studium');
    // Stary kontekst nie może zalegać przy nowym żądaniu bez elementu.
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });

  it('setWynikiTab(null) czyści OBA pola (konsumpcja żądania)', () => {
    useShellStore.getState().setWynikiTab('kompensacja', 'bus-a');
    useShellStore.getState().setWynikiTab(null);
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
  });
});
