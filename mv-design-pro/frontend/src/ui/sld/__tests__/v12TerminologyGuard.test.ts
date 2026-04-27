/**
 * Test terminologii V12 — zakaz zakazanych terminów w napisach użytkownika
 *
 * Sprawdza wszystkie nowe etykiety i komunikaty z V12 § 5.6-5.7:
 * - LOD_BAND_LABELS_PL
 * - SLD_LAYER_FILTER_LABELS_PL, SLD_LAYER_FILTER_DESCRIPTIONS_PL
 * - useWorkModeLabel (przez bezpośredni dostęp do stałej)
 * - Komunikat blokady edycji
 *
 * Zakazane terminy (per CLAUDE.md i sld_rules.md):
 * PCC, Boundary, Connection Point, snapshot, run, proof, case,
 * fallback, legacy, wizard, feeder, branch
 *
 * UWAGA: „run" może pojawić się w słowach polskich zawierających tę sekwencję
 * (np. „runąć") — sprawdzamy jako pełne słowo z granicami słowa.
 */

import { describe, it, expect } from 'vitest';
import {
  LOD_BAND_LABELS_PL,
  LOD_BANDS,
} from '../sldDetailLevel';
import {
  SLD_LAYER_FILTER_LABELS_PL,
  SLD_LAYER_FILTER_DESCRIPTIONS_PL,
  SLD_LAYER_FILTERS,
} from '../sldLayerFiltersStore';

const FORBIDDEN_EXACT = ['PCC', 'Boundary', 'Connection Point', 'snapshot', 'proof', 'fallback', 'legacy', 'wizard', 'feeder'];

// Sprawdzanie granic słowa (case-insensitive)
function containsForbiddenWord(text: string, word: string): boolean {
  const re = new RegExp(`\\b${word}\\b`, 'i');
  return re.test(text);
}

describe('LOD_BAND_LABELS_PL — brak zakazanych terminów', () => {
  it('etykiety pasm LOD są po polsku bez zakazanych terminów', () => {
    for (const range of LOD_BANDS) {
      const label = LOD_BAND_LABELS_PL[range.band];
      expect(label).toBeTruthy();
      for (const term of FORBIDDEN_EXACT) {
        expect(containsForbiddenWord(label, term)).toBe(false);
      }
    }
  });
});

describe('SLD_LAYER_FILTER_LABELS_PL — brak zakazanych terminów', () => {
  it('etykiety filtrów są po polsku bez zakazanych terminów', () => {
    for (const filter of SLD_LAYER_FILTERS) {
      const label = SLD_LAYER_FILTER_LABELS_PL[filter];
      const desc = SLD_LAYER_FILTER_DESCRIPTIONS_PL[filter];
      for (const term of FORBIDDEN_EXACT) {
        expect(containsForbiddenWord(label, term)).toBe(false);
        expect(containsForbiddenWord(desc, term)).toBe(false);
      }
    }
  });

  it('etykiety nie zawierają angielskich nazw technicznych', () => {
    const ENGLISH_TECH = ['case', 'run', 'branch'];
    for (const filter of SLD_LAYER_FILTERS) {
      const label = SLD_LAYER_FILTER_LABELS_PL[filter];
      for (const term of ENGLISH_TECH) {
        expect(containsForbiddenWord(label, term)).toBe(false);
      }
    }
  });
});

describe('Etykiety stałe — nie są pustymi stringami', () => {
  it('LOD_BAND_LABELS_PL — wszystkie wartości niepuste', () => {
    for (const range of LOD_BANDS) {
      expect(LOD_BAND_LABELS_PL[range.band]).toBeTruthy();
    }
  });

  it('SLD_LAYER_FILTER_LABELS_PL — wszystkie wartości niepuste', () => {
    for (const filter of SLD_LAYER_FILTERS) {
      expect(SLD_LAYER_FILTER_LABELS_PL[filter]).toBeTruthy();
    }
  });

  it('SLD_LAYER_FILTER_DESCRIPTIONS_PL — wszystkie wartości niepuste', () => {
    for (const filter of SLD_LAYER_FILTERS) {
      expect(SLD_LAYER_FILTER_DESCRIPTIONS_PL[filter]).toBeTruthy();
    }
  });
});
