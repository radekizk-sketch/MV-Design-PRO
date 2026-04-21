/**
 * PR-SLD-03 — Testy deterministycznego generatora ID (N-07)
 *
 * CANONICAL ALIGNMENT:
 * - AUDYT_SLD_CANONICAL.md: N-07 (brak Date.now/Math.random)
 *
 * TEST SCENARIOS:
 * 1. Hash jest deterministyczny
 * 2. ID symbolu jest deterministyczne
 * 3. ID elementu jest deterministyczne
 * 4. Różne parametry = różne ID
 * 5. generatePasteIdentifiers produkuje unikalne ID
 * 6. Reset kontekstu działa poprawnie
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetIdGeneratorContext,
  hashString,
  generateDeterministicSymbolId,
  generateDeterministicElementId,
  generatePasteIdentifiers,
  incrementPasteCounter,
  getPasteCounter,
  setTopologyHash,
  verifyIdGeneratorDeterminism,
} from '../utils/deterministicId';

describe('N-07: Deterministyczny generator ID', () => {
  beforeEach(() => {
    resetIdGeneratorContext();
  });

  // =============================================================================
  // TEST 1: hashString jest deterministyczny
  // =============================================================================
  describe('hashString', () => {
    it('powinien zwrócić ten sam hash dla tego samego inputu', () => {
      const input = 'test_string_123';

      const hash1 = hashString(input);
      const hash2 = hashString(input);
      const hash3 = hashString(input);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('powinien zwrócić 8-znakowy hex', () => {
      const hash = hashString('anything');
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('powinien zwrócić różne hashe dla różnych inputów', () => {
      const hash1 = hashString('input_a');
      const hash2 = hashString('input_b');
      const hash3 = hashString('input_c');

      expect(hash1).not.toBe(hash2);
      expect(hash2).not.toBe(hash3);
      expect(hash1).not.toBe(hash3);
    });

    it('powinien obsłużyć pusty string', () => {
      const hash = hashString('');
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('powinien obsłużyć długi string', () => {
      const longString = 'a'.repeat(10000);
      const hash = hashString(longString);
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    it('powinien obsłużyć znaki Unicode', () => {
      const unicode = 'Szyna główna ąęółżźćń 日本語';
      const hash = hashString(unicode);
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  // =============================================================================
  // TEST 2: generateDeterministicSymbolId
  // =============================================================================
  describe('generateDeterministicSymbolId', () => {
    it('powinien wygenerować ID w formacie sldsym_<typ>_<hash>', () => {
      const id = generateDeterministicSymbolId('Bus', 0, 1, 'topo');
      expect(id).toMatch(/^sldsym_bus_[0-9a-f]{8}$/);
    });

    it('powinien być deterministyczny dla tych samych parametrów', () => {
      const id1 = generateDeterministicSymbolId('LineBranch', 5, 3, 'hash123');
      resetIdGeneratorContext();
      const id2 = generateDeterministicSymbolId('LineBranch', 5, 3, 'hash123');

      expect(id1).toBe(id2);
    });

    it('powinien zwrócić różne ID dla różnych typów', () => {
      const bus = generateDeterministicSymbolId('Bus', 0, 1, 'h');
      const line = generateDeterministicSymbolId('LineBranch', 0, 1, 'h');
      const sw = generateDeterministicSymbolId('Switch', 0, 1, 'h');

      expect(bus).not.toBe(line);
      expect(line).not.toBe(sw);
      expect(bus).not.toBe(sw);
    });

    it('powinien zwrócić różne ID dla różnych indeksów', () => {
      const idx0 = generateDeterministicSymbolId('Bus', 0, 1, 'h');
      const idx1 = generateDeterministicSymbolId('Bus', 1, 1, 'h');
      const idx2 = generateDeterministicSymbolId('Bus', 2, 1, 'h');

      expect(idx0).not.toBe(idx1);
      expect(idx1).not.toBe(idx2);
      expect(idx0).not.toBe(idx2);
    });

    it('powinien zwrócić różne ID dla różnych liczników wklejenia', () => {
      const pc1 = generateDeterministicSymbolId('Bus', 0, 1, 'h');
      const pc2 = generateDeterministicSymbolId('Bus', 0, 2, 'h');
      const pc3 = generateDeterministicSymbolId('Bus', 0, 3, 'h');

      expect(pc1).not.toBe(pc2);
      expect(pc2).not.toBe(pc3);
    });

    it('powinien zwrócić różne ID dla różnych hashy topologii', () => {
      const t1 = generateDeterministicSymbolId('Bus', 0, 1, 'topology_a');
      const t2 = generateDeterministicSymbolId('Bus', 0, 1, 'topology_b');

      expect(t1).not.toBe(t2);
    });
  });

  // =============================================================================
  // TEST 3: generateDeterministicElementId
  // =============================================================================
  describe('generateDeterministicElementId', () => {
    it('powinien wygenerować ID w formacie elem_<typ>_<hash>', () => {
      const id = generateDeterministicElementId('Bus', 0, 1, 'topo');
      expect(id).toMatch(/^elem_bus_[0-9a-f]{8}$/);
    });

    it('powinien być deterministyczny', () => {
      const id1 = generateDeterministicElementId('Switch', 2, 4, 'abc');
      resetIdGeneratorContext();
      const id2 = generateDeterministicElementId('Switch', 2, 4, 'abc');

      expect(id1).toBe(id2);
    });

    it('symbolId i elementId powinny być różne dla tych samych parametrów', () => {
      const symbolId = generateDeterministicSymbolId('Bus', 0, 1, 'h');
      const elementId = generateDeterministicElementId('Bus', 0, 1, 'h');

      expect(symbolId).not.toBe(elementId);
    });
  });

  // =============================================================================
  // TEST 4: generatePasteIdentifiers
  // =============================================================================
  describe('generatePasteIdentifiers', () => {
    it('powinien wygenerować mapę ID dla wszystkich elementów', () => {
      const types = ['Bus', 'LineBranch', 'Switch'];
      const existingIds = ['existing1', 'existing2'];

      const result = generatePasteIdentifiers(types, existingIds);

      expect(result.size).toBe(3);
      expect(result.get(0)).toBeDefined();
      expect(result.get(1)).toBeDefined();
      expect(result.get(2)).toBeDefined();
    });

    it('powinien wygenerować unikalne ID dla każdego elementu', () => {
      const types = ['Bus', 'Bus', 'Bus'];
      const result = generatePasteIdentifiers(types, []);

      const ids = [
        result.get(0)!.symbolId,
        result.get(1)!.symbolId,
        result.get(2)!.symbolId,
      ];

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);

      const elemIds = [
        result.get(0)!.elementId,
        result.get(1)!.elementId,
        result.get(2)!.elementId,
      ];

      const uniqueElemIds = new Set(elemIds);
      expect(uniqueElemIds.size).toBe(3);
    });

    it('powinien inkrementować licznik wklejenia', () => {
      const before = getPasteCounter();
      generatePasteIdentifiers(['Bus'], []);
      const after = getPasteCounter();

      expect(after).toBe(before + 1);
    });

    it('powinien być deterministyczny przy tym samym stanie', () => {
      resetIdGeneratorContext();
      const result1 = generatePasteIdentifiers(['Bus', 'LineBranch'], ['a', 'b']);

      resetIdGeneratorContext();
      const result2 = generatePasteIdentifiers(['Bus', 'LineBranch'], ['a', 'b']);

      expect(result1.get(0)!.symbolId).toBe(result2.get(0)!.symbolId);
      expect(result1.get(0)!.elementId).toBe(result2.get(0)!.elementId);
      expect(result1.get(1)!.symbolId).toBe(result2.get(1)!.symbolId);
      expect(result1.get(1)!.elementId).toBe(result2.get(1)!.elementId);
    });
  });

  // =============================================================================
  // TEST 5: Kontekst generatora
  // =============================================================================
  describe('Kontekst generatora', () => {
    it('resetIdGeneratorContext powinien zresetować licznik', () => {
      incrementPasteCounter();
      incrementPasteCounter();
      expect(getPasteCounter()).toBe(2);

      resetIdGeneratorContext();
      expect(getPasteCounter()).toBe(0);
    });

    it('incrementPasteCounter powinien inkrementować i zwracać nową wartość', () => {
      expect(incrementPasteCounter()).toBe(1);
      expect(incrementPasteCounter()).toBe(2);
      expect(incrementPasteCounter()).toBe(3);
    });

    it('setTopologyHash powinien być deterministyczny', () => {
      setTopologyHash(['a', 'b', 'c']);
      const id1 = generateDeterministicSymbolId('Bus', 0, 1);

      resetIdGeneratorContext();
      setTopologyHash(['a', 'b', 'c']);
      const id2 = generateDeterministicSymbolId('Bus', 0, 1);

      expect(id1).toBe(id2);
    });

    it('różna kolejność w setTopologyHash powinna dawać ten sam hash (sortowane)', () => {
      setTopologyHash(['c', 'a', 'b']);
      const id1 = generateDeterministicSymbolId('Bus', 0, 1);

      resetIdGeneratorContext();
      setTopologyHash(['a', 'b', 'c']);
      const id2 = generateDeterministicSymbolId('Bus', 0, 1);

      expect(id1).toBe(id2);
    });
  });

  // =============================================================================
  // TEST 6: Weryfikacja deterministyczności
  // =============================================================================
  describe('verifyIdGeneratorDeterminism', () => {
    it('powinien zwrócić true', () => {
      expect(verifyIdGeneratorDeterminism()).toBe(true);
    });
  });

  // =============================================================================
  // TEST 7: Brak wzorców czasowych w ID
  // =============================================================================
  describe('Brak Date.now w ID', () => {
    it('ID nie powinno zawierać wzorca timestamp (sekwencji >10 cyfr)', () => {
      for (let i = 0; i < 100; i++) {
        const id = generateDeterministicSymbolId(`Type${i}`, i, i, `hash${i}`);
        // Timestamp ma format np. 1672531200000 (13 cyfr)
        expect(id).not.toMatch(/\d{10,}/);
      }
    });
  });
});
