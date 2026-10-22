/**
 * K6 (znalezisko przy edycji z karty inspektora) — zapis stanu do adresu przy ZIMNYM STARCIE `/`.
 *
 * Defekt: przy pustej trasie każdy zapis stanu składał adres `${pathname}?…`, czyli kładł
 * parametry w `location.search`, którego routing hash nigdy nie czyta. Pierwsza zmiana trasy
 * (np. `navigateToSld()` po zapisie kreatora edycji parametrów) gubiła selekcję i zwijała prawy
 * inspektor. Iloczyn cech, w którym defekt mógłby się schować:
 *
 *   zapis stanu {selekcja · diagnostyka · selekcja z diagnostyką · tryb schematu · tryb migawki
 *   wyników} × trasa {pusta (zimny start) · jawna `#sld`}.
 *
 * Każdy przypadek sprawdza: parametry leżą w części hash, `location.search` jest pusty,
 * odczyt zwrotny przez `getCurrentSearchParams` widzi zapisaną wartość, trasa się nie zmienia.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  getCurrentHashRoute,
  getCurrentSearchParams,
  readDiagnosticsFromUrl,
  readSelectionFromUrl,
  readSldModeFromUrl,
  updateUrlWithDiagnostics,
  updateUrlWithSelection,
  updateUrlWithSelectionAndDiagnostics,
  updateUrlWithSldMode,
} from '../urlState';
import { updateResultsSnapshotMode } from '../../results-inspector/viewState';

const SELEKCJA = { id: 'stn/1/transformer', type: 'TransformerBranch', name: 'Transformator SN/nN' } as const;

const ZAPISY: ReadonlyArray<{ readonly nazwa: string; readonly zapisz: () => void; readonly sprawdz: () => void }> = [
  {
    nazwa: 'selekcja',
    zapisz: () => updateUrlWithSelection(SELEKCJA),
    sprawdz: () => expect(readSelectionFromUrl()).toMatchObject(SELEKCJA),
  },
  {
    nazwa: 'diagnostyka',
    zapisz: () => updateUrlWithDiagnostics({ visible: true, filter: 'ERRORS_ONLY' }),
    sprawdz: () => expect(readDiagnosticsFromUrl()).toEqual({ visible: true, filter: 'ERRORS_ONLY' }),
  },
  {
    nazwa: 'selekcja z diagnostyką',
    zapisz: () => updateUrlWithSelectionAndDiagnostics(SELEKCJA, { visible: true, filter: 'ALL' }),
    sprawdz: () => {
      expect(readSelectionFromUrl()).toMatchObject(SELEKCJA);
      expect(readDiagnosticsFromUrl().visible).toBe(true);
    },
  },
  {
    nazwa: 'tryb schematu',
    zapisz: () => updateUrlWithSldMode({ mode: 'WYNIKI', diagnosticLayerVisible: true, protectionLayerVisible: false }),
    sprawdz: () => expect(readSldModeFromUrl().mode).toBe('WYNIKI'),
  },
  {
    nazwa: 'tryb migawki wyników',
    zapisz: () => updateResultsSnapshotMode('CURRENT_MODEL'),
    sprawdz: () => expect(getCurrentSearchParams().get('snapshot')).toBe('current'),
  },
];

const TRASY = [
  { nazwa: 'pusta (zimny start)', adres: '/', trasa: '' },
  { nazwa: 'jawna #sld', adres: '/#sld', trasa: '#sld' },
] as const;

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe.each(TRASY)('zapis stanu do adresu — trasa $nazwa', (trasa) => {
  it.each(ZAPISY)('$nazwa: parametry w części hash, bez location.search, odczyt zwrotny', (zapis) => {
    window.history.replaceState(null, '', trasa.adres);
    zapis.zapisz();
    expect(window.location.search).toBe('');
    expect(window.location.hash.includes('?')).toBe(true);
    expect(getCurrentHashRoute()).toBe(trasa.trasa);
    zapis.sprawdz();
  });
});
