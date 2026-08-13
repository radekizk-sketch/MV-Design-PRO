/**
 * Most tras przestrzeni powłoki — kontrakt „przestrzeń wygrywa z trasą legacy".
 *
 * Sedno (KD-3, naprawa u źródła): trasy z listy nadrzędnej (`#sld`, `#dashboard`,
 * …) są w `LegacyWarsztat.TrasaLubPrzestrzen` rozpatrywane PRZED zawartością
 * przestrzeni. Przestrzeń, która ma WŁASNY warsztat (Model sieci, Gotowość,
 * Projekt, Dokumentacja), musi taką trasę wyczyścić — inaczej jawny wybór z
 * nawigacji nie zmienia tego, co widać, i warsztat jest nieosiągalny klikiem.
 * Regresja, którą to blokuje: „Model sieci" ustawiał `#sld` i pokazywał kanwę
 * schematu zamiast warsztatu modelu (właściwości · szablony · katalog).
 *
 * „Schemat (SLD)" zachowuje trasę `#sld` — to JEST jego powierzchnia.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { przejdzDoPrzestrzeni } from '../przejsciaPrzestrzeni';
import { useShellStore } from '../useShellStore';

beforeEach(() => {
  window.location.hash = '';
  useShellStore.getState().setActiveSpace('projekt');
});

describe('mostTrasyPrzestrzeni — przestrzeń z własnym warsztatem czyści trasę nadrzędną', () => {
  it.each(['model', 'gotowosc', 'projekt', 'dokumentacja'] as const)(
    'wybór „%s" z aktywnej trasy #sld czyści hash i aktywuje przestrzeń',
    (przestrzen) => {
      window.location.hash = '#sld';
      przejdzDoPrzestrzeni(przestrzen);
      expect(useShellStore.getState().activeSpace).toBe(przestrzen);
      // Pusty hash = zawartość wg przestrzeni (jak przy zimnym starcie „/").
      expect(window.location.hash).toBe('');
    },
  );

  it('„Schemat (SLD)" ustawia własną trasę #sld (to jego powierzchnia)', () => {
    przejdzDoPrzestrzeni('schemat');
    expect(useShellStore.getState().activeSpace).toBe('schemat');
    expect(window.location.hash).toBe('#sld');
  });

  it('przejście Schemat → Model sieci zdejmuje trasę schematu', () => {
    przejdzDoPrzestrzeni('schemat');
    expect(window.location.hash).toBe('#sld');
    przejdzDoPrzestrzeni('model');
    expect(useShellStore.getState().activeSpace).toBe('model');
    expect(window.location.hash).toBe('');
  });
});
