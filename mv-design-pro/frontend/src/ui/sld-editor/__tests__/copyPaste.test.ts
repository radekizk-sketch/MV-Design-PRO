/**
 * PR-SLD-03 — Testy kopiowania/wklejania (N-03, N-07)
 *
 * CANONICAL ALIGNMENT:
 * - AUDYT_SLD_CANONICAL.md: N-03 (nowe elementy modelu przy wklejeniu)
 * - AUDYT_SLD_CANONICAL.md: N-07 (deterministyczne identyfikatory)
 *
 * TEST SCENARIOS:
 * 1. Wklejenie pojedynczego symbolu → nowy elementId, nowy symbolId
 * 2. Wklejenie grupy + połączenia wewnętrzne → odtworzone połączenia port↔port
 * 3. Brak odtworzenia połączeń zewnętrznych
 * 4. Deterministyczność: to samo wejście → te same nowe ID
 * 5. Brak Date.now/Math.random w ścieżce kopiowania (statyczna weryfikacja)
 * 6. Walidator wykrywa zduplikowane elementId
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSldEditorStore } from '../SldEditorStore';
import type { NodeSymbol, BranchSymbol, SourceSymbol, SwitchSymbol, LoadSymbol, Position } from '../types';
import {
  resetIdGeneratorContext,
  generateDeterministicSymbolId,
  generateDeterministicElementId,
  generatePasteIdentifiers,
  hashString,
  verifyIdGeneratorDeterminism,
} from '../utils/deterministicId';
import { validateSld } from '../utils/sldValidator';

describe('PR-SLD-03: Copy/Paste (N-03, N-07)', () => {
  // Reset store i generator ID przed każdym testem
  beforeEach(() => {
    const store = useSldEditorStore.getState();
    store.setSymbols([]);
    store.clearSelection();
    resetIdGeneratorContext();
  });

  // Helper: Utwórz symbol węzła
  const createNodeSymbol = (id: string, elementId: string, x: number, y: number): NodeSymbol => ({
    id,
    elementId,
    elementType: 'Bus',
    elementName: `Szyna ${id}`,
    position: { x, y },
    inService: true,
    width: 60,
    height: 8,
  });

  // Helper: Utwórz symbol gałęzi
  const createBranchSymbol = (
    id: string,
    elementId: string,
    fromNodeId: string,
    toNodeId: string,
    x: number,
    y: number
  ): BranchSymbol => ({
    id,
    elementId,
    elementType: 'LineBranch',
    elementName: `Linia ${id}`,
    position: { x, y },
    inService: true,
    fromNodeId,
    toNodeId,
    points: [],
  });

  // Helper: Utwórz symbol źródła
  const createSourceSymbol = (
    id: string,
    elementId: string,
    connectedToNodeId: string,
    x: number,
    y: number
  ): SourceSymbol => ({
    id,
    elementId,
    elementType: 'Source',
    elementName: `Źródło ${id}`,
    position: { x, y },
    inService: true,
    connectedToNodeId,
  });

  // Helper: Utwórz symbol łącznika (switch)
  const createSwitchSymbol = (
    id: string,
    elementId: string,
    fromNodeId: string,
    toNodeId: string,
    x: number,
    y: number
  ): SwitchSymbol => ({
    id,
    elementId,
    elementType: 'Switch',
    elementName: `Łącznik ${id}`,
    position: { x, y },
    inService: true,
    fromNodeId,
    toNodeId,
    switchState: 'CLOSED',
    switchType: 'BREAKER',
  });

  // Helper: Utwórz symbol odbiornika (load)
  const createLoadSymbol = (
    id: string,
    elementId: string,
    connectedToNodeId: string,
    x: number,
    y: number
  ): LoadSymbol => ({
    id,
    elementId,
    elementType: 'Load',
    elementName: `Odbiornik ${id}`,
    position: { x, y },
    inService: true,
    connectedToNodeId,
  });

  // =============================================================================
  // TEST 1: Wklejenie pojedynczego symbolu → nowy elementId, nowy symbolId
  // =============================================================================
  describe('N-03: Wklejenie tworzy nowe elementy modelu', () => {
    it('powinno utworzyć nowy symbolId i elementId przy wklejeniu pojedynczego symbolu', () => {
      const store = useSldEditorStore.getState();

      // Dodaj symbol
      const originalSymbol = createNodeSymbol('sym1', 'elem_bus_1', 100, 100);
      store.setSymbols([originalSymbol]);

      // Zaznacz i skopiuj
      store.selectMultiple(['sym1']);
      store.copySelection();

      // Wklej
      const PASTE_OFFSET = { x: 40, y: 40 };
      const newSymbols = store.pasteFromClipboard(PASTE_OFFSET);

      // Weryfikacja
      expect(newSymbols.length).toBe(1);
      const pastedSymbol = newSymbols[0];

      // Nowy symbolId (NIE taki sam jak oryginał)
      expect(pastedSymbol.id).not.toBe('sym1');
      expect(pastedSymbol.id).toMatch(/^sldsym_bus_/);

      // Nowy elementId (NIE taki sam jak oryginał)
      expect(pastedSymbol.elementId).not.toBe('elem_bus_1');
      expect(pastedSymbol.elementId).toMatch(/^elem_bus_/);

      // Pozycja z offsetem
      expect(pastedSymbol.position.x).toBe(140); // 100 + 40
      expect(pastedSymbol.position.y).toBe(140);

      // Nazwa zawiera "(kopia)"
      expect(pastedSymbol.elementName).toContain('(kopia)');
    });

    it('powinno utworzyć różne elementId dla każdego wklejenia', () => {
      const store = useSldEditorStore.getState();

      const originalSymbol = createNodeSymbol('sym1', 'elem_bus_1', 100, 100);
      store.setSymbols([originalSymbol]);

      store.selectMultiple(['sym1']);
      store.copySelection();

      // Wklej dwa razy
      const first = store.pasteFromClipboard({ x: 20, y: 20 });
      const second = store.pasteFromClipboard({ x: 60, y: 60 });

      // Każde wklejenie ma unikalne ID
      expect(first[0].id).not.toBe(second[0].id);
      expect(first[0].elementId).not.toBe(second[0].elementId);
    });
  });

  // =============================================================================
  // TEST 2: Wklejenie grupy z połączeniami wewnętrznymi
  // =============================================================================
  describe('N-03: Wklejenie grupy symboli', () => {
    it('generatePasteIdentifiers powinno zwrócić unikalne ID dla wielu elementów', () => {
      // Test bezpośrednio funkcji generującej ID (bez zależności od store selection)
      resetIdGeneratorContext();

      const types = ['Bus', 'Bus', 'LineBranch'];
      const existing = ['existing1', 'existing2'];

      const mapping = generatePasteIdentifiers(types, existing);

      // Powinniśmy mieć 3 pary ID
      expect(mapping.size).toBe(3);

      // Wszystkie symbolId powinny być unikalne
      const symbolIds = [
        mapping.get(0)!.symbolId,
        mapping.get(1)!.symbolId,
        mapping.get(2)!.symbolId,
      ];
      const uniqueSymbolIds = new Set(symbolIds);
      expect(uniqueSymbolIds.size).toBe(3);

      // Wszystkie elementId powinny być unikalne
      const elementIds = [
        mapping.get(0)!.elementId,
        mapping.get(1)!.elementId,
        mapping.get(2)!.elementId,
      ];
      const uniqueElementIds = new Set(elementIds);
      expect(uniqueElementIds.size).toBe(3);

      // Formaty powinny być poprawne
      expect(symbolIds[0]).toMatch(/^sldsym_bus_[0-9a-f]{8}$/);
      expect(symbolIds[2]).toMatch(/^sldsym_linebranch_[0-9a-f]{8}$/);
      expect(elementIds[0]).toMatch(/^elem_bus_[0-9a-f]{8}$/);
    });
  });

  // =============================================================================
  // TEST 3: Brak odtworzenia połączeń zewnętrznych
  // =============================================================================
  describe('N-03: Połączenia zewnętrzne nie są odtwarzane', () => {
    it('powinno zostawić puste referencje dla połączeń zewnętrznych', () => {
      const store = useSldEditorStore.getState();

      // Szyna + źródło podłączone do szyny
      const bus = createNodeSymbol('bus1', 'elem_bus_1', 100, 100);
      const source = createSourceSymbol('src1', 'elem_src_1', 'elem_bus_1', 50, 100);

      store.setSymbols([bus, source]);

      // Skopiuj TYLKO źródło (bez szyny)
      store.selectMultiple(['src1']);
      store.copySelection();

      // Wklej
      const newSymbols = store.pasteFromClipboard({ x: 200, y: 0 });
      expect(newSymbols.length).toBe(1);

      // Źródło powinno mieć puste connectedToNodeId (zewnętrzne połączenie)
      const pastedSource = newSymbols[0] as SourceSymbol;
      expect(pastedSource.connectedToNodeId).toBe('');
    });
  });

  // =============================================================================
  // TEST 4: Deterministyczność identyfikatorów (N-07)
  // =============================================================================
  describe('N-07: Deterministyczne identyfikatory', () => {
    it('hashString powinien być deterministyczny', () => {
      const input = 'test_input_string';
      const hash1 = hashString(input);
      const hash2 = hashString(input);
      const hash3 = hashString(input);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);

      // Różne inputy = różne hashe
      const differentHash = hashString('different_input');
      expect(differentHash).not.toBe(hash1);
    });

    it('generateDeterministicSymbolId powinien być deterministyczny', () => {
      resetIdGeneratorContext();

      const id1 = generateDeterministicSymbolId('Bus', 0, 1, 'topo_hash');
      resetIdGeneratorContext();
      const id2 = generateDeterministicSymbolId('Bus', 0, 1, 'topo_hash');

      expect(id1).toBe(id2);
    });

    it('generateDeterministicElementId powinien być deterministyczny', () => {
      resetIdGeneratorContext();

      const id1 = generateDeterministicElementId('LineBranch', 2, 3, 'topo_abc');
      resetIdGeneratorContext();
      const id2 = generateDeterministicElementId('LineBranch', 2, 3, 'topo_abc');

      expect(id1).toBe(id2);
    });

    it('różne parametry powinny dawać różne ID', () => {
      const id1 = generateDeterministicSymbolId('Bus', 0, 1, 'hash1');
      const id2 = generateDeterministicSymbolId('Bus', 1, 1, 'hash1');
      const id3 = generateDeterministicSymbolId('LineBranch', 0, 1, 'hash1');
      const id4 = generateDeterministicSymbolId('Bus', 0, 2, 'hash1');

      expect(id1).not.toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1).not.toBe(id4);
    });

    it('verifyIdGeneratorDeterminism powinien zwrócić true', () => {
      const result = verifyIdGeneratorDeterminism();
      expect(result).toBe(true);
    });

    it('to samo wklejenie przy tym samym stanie canvas powinno dać te same ID', () => {
      resetIdGeneratorContext();
      const store = useSldEditorStore.getState();

      const symbol = createNodeSymbol('sym1', 'elem1', 100, 100);
      store.setSymbols([symbol]);
      store.selectMultiple(['sym1']);
      store.copySelection();

      // Zapisz stan schowka
      const clipboardCopy = JSON.stringify(store.clipboard);

      // Wklej
      const first = store.pasteFromClipboard({ x: 20, y: 20 });
      const firstId = first[0].id;
      const firstElementId = first[0].elementId;

      // Reset i powtórz
      resetIdGeneratorContext();
      store.setSymbols([symbol]); // Reset symboli
      store.clipboard = JSON.parse(clipboardCopy);

      const second = store.pasteFromClipboard({ x: 20, y: 20 });
      const secondId = second[0].id;
      const secondElementId = second[0].elementId;

      // Powinny być takie same
      expect(secondId).toBe(firstId);
      expect(secondElementId).toBe(firstElementId);
    });
  });

  // =============================================================================
  // TEST 5: Brak Date.now/Math.random w ID (statyczna weryfikacja)
  // =============================================================================
  describe('N-07: Brak losowości w identyfikatorach', () => {
    it('wygenerowane ID nie powinny zawierać wzorców czasowych', () => {
      const id = generateDeterministicSymbolId('Bus', 0, 1, 'test');

      // ID nie powinno zawierać timestamp (sekwencji >10 cyfr)
      expect(id).not.toMatch(/\d{10,}/);

      // ID powinno mieć format sldsym_<typ>_<hash>
      expect(id).toMatch(/^sldsym_\w+_[0-9a-f]{8}$/);
    });

    it('elementId powinien mieć deterministyczny format', () => {
      const id = generateDeterministicElementId('Switch', 3, 5, 'hash');

      expect(id).toMatch(/^elem_switch_[0-9a-f]{8}$/);
    });
  });

  // =============================================================================
  // TEST 6: Walidator wykrywa zduplikowane elementId
  // =============================================================================
  describe('V-01b: Walidator wykrywa zduplikowane elementId', () => {
    it('powinien zgłosić błąd dla symboli z tym samym elementId', () => {
      // Symulacja starego błędnego zachowania (zduplikowane elementId)
      const symbols = [
        createNodeSymbol('sym1', 'elem_shared', 100, 100),
        createNodeSymbol('sym2', 'elem_shared', 200, 100), // TEN SAM elementId!
      ];

      const result = validateSld(symbols);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.ruleId === 'V-01b')).toBe(true);

      const duplicateIssue = result.issues.find((i) => i.ruleId === 'V-01b');
      expect(duplicateIssue?.severity).toBe('ERROR');
      expect(duplicateIssue?.symbolIds).toContain('sym1');
      expect(duplicateIssue?.symbolIds).toContain('sym2');
    });

    it('powinien przejść walidację dla unikalnych elementId', () => {
      const symbols = [
        createNodeSymbol('sym1', 'elem_1', 100, 100),
        createNodeSymbol('sym2', 'elem_2', 200, 100),
        createNodeSymbol('sym3', 'elem_3', 300, 100),
      ];

      const result = validateSld(symbols, { checkDuplicateElementIds: true });

      const duplicateIssues = result.issues.filter((i) => i.ruleId === 'V-01b');
      expect(duplicateIssues.length).toBe(0);
    });
  });

  // =============================================================================
  // TEST 7: Duplikacja (Ctrl+D) również tworzy nowe elementy
  // =============================================================================
  describe('Duplikacja: tworzy nowe elementy', () => {
    it('duplicateSelection powinno utworzyć nowe elementId', () => {
      const store = useSldEditorStore.getState();

      const symbol = createNodeSymbol('sym1', 'elem_bus_1', 100, 100);
      store.setSymbols([symbol]);
      store.selectMultiple(['sym1']);

      // Duplikuj
      const duplicated = store.duplicateSelection();

      expect(duplicated.length).toBe(1);
      expect(duplicated[0].id).not.toBe('sym1');
      expect(duplicated[0].elementId).not.toBe('elem_bus_1');
    });
  });

  // =============================================================================
  // TEST 8: Walidacja V-01b działa poprawnie
  // =============================================================================
  describe('Walidacja: V-01b sprawdza duplikaty', () => {
    it('walidator powinien wykryć zduplikowane elementId', () => {
      // Test bezpośrednio walidatora (bez zależności od store)
      const symbolsWithDuplicates = [
        createNodeSymbol('s1', 'same_element', 100, 100),
        createNodeSymbol('s2', 'same_element', 200, 100), // DUPLIKAT!
        createNodeSymbol('s3', 'unique_element', 300, 100),
      ];

      const result = validateSld(symbolsWithDuplicates);

      // Powinien być błąd V-01b
      const duplicateIssues = result.issues.filter((i) => i.ruleId === 'V-01b');
      expect(duplicateIssues.length).toBe(1);
      expect(duplicateIssues[0].symbolIds).toContain('s1');
      expect(duplicateIssues[0].symbolIds).toContain('s2');
    });

    it('walidator powinien przejść dla unikalnych elementId', () => {
      const symbolsUnique = [
        createNodeSymbol('s1', 'elem_1', 100, 100),
        createNodeSymbol('s2', 'elem_2', 200, 100),
        createNodeSymbol('s3', 'elem_3', 300, 100),
      ];

      const result = validateSld(symbolsUnique);

      const duplicateIssues = result.issues.filter((i) => i.ruleId === 'V-01b');
      expect(duplicateIssues.length).toBe(0);
    });
  });

  // =============================================================================
  // TEST 9: PR-SLD-03b — Odtwarzanie połączeń wewnętrznych
  // =============================================================================
  describe('PR-SLD-03b: Odtwarzanie połączeń wewnętrznych', () => {
    it('powinno odtworzyć połączenie wewnętrzne dla szyna+linia+szyna', () => {
      const store = useSldEditorStore.getState();

      // Szyna 1 → Linia → Szyna 2
      const bus1 = createNodeSymbol('bus1', 'elem_bus_1', 100, 100);
      const bus2 = createNodeSymbol('bus2', 'elem_bus_2', 300, 100);
      const line = createBranchSymbol('line1', 'elem_line_1', 'elem_bus_1', 'elem_bus_2', 200, 100);

      store.setSymbols([bus1, bus2, line]);

      // Zaznacz wszystkie i skopiuj
      store.selectMultiple(['bus1', 'bus2', 'line1']);
      store.copySelection();

      // Wklej
      const newSymbols = store.pasteFromClipboard({ x: 0, y: 200 });

      // Powinny być 3 nowe symbole
      expect(newSymbols.length).toBe(3);

      // Znajdź nowe symbole
      const newBus1 = newSymbols.find((s) => s.elementType === 'Bus' && s.elementName.includes('Szyna bus1'));
      const newBus2 = newSymbols.find((s) => s.elementType === 'Bus' && s.elementName.includes('Szyna bus2'));
      const newLine = newSymbols.find((s) => s.elementType === 'LineBranch') as BranchSymbol;

      expect(newBus1).toBeDefined();
      expect(newBus2).toBeDefined();
      expect(newLine).toBeDefined();

      // Nowe ID powinny być różne od oryginałów
      expect(newBus1!.elementId).not.toBe('elem_bus_1');
      expect(newBus2!.elementId).not.toBe('elem_bus_2');
      expect(newLine!.elementId).not.toBe('elem_line_1');

      // KLUCZOWE: Połączenia wewnętrzne powinny być odtworzone
      // fromNodeId i toNodeId powinny wskazywać na NOWE elementId szyn
      expect(newLine.fromNodeId).toBe(newBus1!.elementId);
      expect(newLine.toNodeId).toBe(newBus2!.elementId);
    });

    it('powinno odtworzyć połączenie wewnętrzne dla szyna+łącznik+szyna', () => {
      const store = useSldEditorStore.getState();

      // Szyna 1 → Łącznik → Szyna 2
      const bus1 = createNodeSymbol('bus1', 'elem_bus_1', 100, 100);
      const bus2 = createNodeSymbol('bus2', 'elem_bus_2', 300, 100);
      const sw = createSwitchSymbol('sw1', 'elem_sw_1', 'elem_bus_1', 'elem_bus_2', 200, 100);

      store.setSymbols([bus1, bus2, sw]);
      store.selectMultiple(['bus1', 'bus2', 'sw1']);
      store.copySelection();

      const newSymbols = store.pasteFromClipboard({ x: 0, y: 200 });

      const newBus1 = newSymbols.find((s) => s.elementType === 'Bus' && s.elementName.includes('Szyna bus1'));
      const newBus2 = newSymbols.find((s) => s.elementType === 'Bus' && s.elementName.includes('Szyna bus2'));
      const newSwitch = newSymbols.find((s) => s.elementType === 'Switch') as SwitchSymbol;

      expect(newSwitch.fromNodeId).toBe(newBus1!.elementId);
      expect(newSwitch.toNodeId).toBe(newBus2!.elementId);
    });

    it('powinno odtworzyć połączenie wewnętrzne dla szyna+źródło', () => {
      const store = useSldEditorStore.getState();

      const bus = createNodeSymbol('bus1', 'elem_bus_1', 100, 100);
      const source = createSourceSymbol('src1', 'elem_src_1', 'elem_bus_1', 50, 100);

      store.setSymbols([bus, source]);
      store.selectMultiple(['bus1', 'src1']);
      store.copySelection();

      const newSymbols = store.pasteFromClipboard({ x: 0, y: 200 });

      const newBus = newSymbols.find((s) => s.elementType === 'Bus');
      const newSource = newSymbols.find((s) => s.elementType === 'Source') as SourceSymbol;

      // Połączenie wewnętrzne powinno być odtworzone
      expect(newSource.connectedToNodeId).toBe(newBus!.elementId);
    });

    it('powinno odtworzyć połączenie wewnętrzne dla szyna+odbiornik', () => {
      const store = useSldEditorStore.getState();

      const bus = createNodeSymbol('bus1', 'elem_bus_1', 100, 100);
      const load = createLoadSymbol('load1', 'elem_load_1', 'elem_bus_1', 150, 100);

      store.setSymbols([bus, load]);
      store.selectMultiple(['bus1', 'load1']);
      store.copySelection();

      const newSymbols = store.pasteFromClipboard({ x: 0, y: 200 });

      const newBus = newSymbols.find((s) => s.elementType === 'Bus');
      const newLoad = newSymbols.find((s) => s.elementType === 'Load') as LoadSymbol;

      expect(newLoad.connectedToNodeId).toBe(newBus!.elementId);
    });

    it('połączenia zewnętrzne powinny pozostać puste', () => {
      const store = useSldEditorStore.getState();

      // Szyna zewnętrzna (nie kopiowana) + linia + szyna wewnętrzna
      const externalBus = createNodeSymbol('ext_bus', 'elem_ext_bus', 50, 100);
      const internalBus = createNodeSymbol('int_bus', 'elem_int_bus', 300, 100);
      const line = createBranchSymbol('line1', 'elem_line_1', 'elem_ext_bus', 'elem_int_bus', 175, 100);

      store.setSymbols([externalBus, internalBus, line]);

      // Kopiuj TYLKO wewnętrzną szynę i linię (BEZ zewnętrznej szyny)
      store.selectMultiple(['int_bus', 'line1']);
      store.copySelection();

      const newSymbols = store.pasteFromClipboard({ x: 0, y: 200 });

      const newLine = newSymbols.find((s) => s.elementType === 'LineBranch') as BranchSymbol;
      const newBus = newSymbols.find((s) => s.elementType === 'Bus');

      // toNodeId (wewnętrzne) powinno być odtworzone
      expect(newLine.toNodeId).toBe(newBus!.elementId);

      // fromNodeId (zewnętrzne) powinno być puste
      expect(newLine.fromNodeId).toBe('');
    });
  });

  // =============================================================================
  // TEST 10: PR-SLD-03b — Deterministyczność połączeń wewnętrznych
  // =============================================================================
  describe('PR-SLD-03b: Deterministyczność połączeń', () => {
    it('to samo wklejenie powinno dać te same połączenia wewnętrzne', () => {
      resetIdGeneratorContext();
      const store = useSldEditorStore.getState();

      const bus1 = createNodeSymbol('bus1', 'elem_bus_1', 100, 100);
      const bus2 = createNodeSymbol('bus2', 'elem_bus_2', 300, 100);
      const line = createBranchSymbol('line1', 'elem_line_1', 'elem_bus_1', 'elem_bus_2', 200, 100);

      store.setSymbols([bus1, bus2, line]);
      store.selectMultiple(['bus1', 'bus2', 'line1']);
      store.copySelection();

      // Zapisz stan schowka
      const clipboardCopy = JSON.stringify(store.clipboard);

      // Pierwsze wklejenie
      const first = store.pasteFromClipboard({ x: 0, y: 200 });
      const firstLine = first.find((s) => s.elementType === 'LineBranch') as BranchSymbol;
      const firstFromNodeId = firstLine.fromNodeId;
      const firstToNodeId = firstLine.toNodeId;

      // Reset i powtórz
      resetIdGeneratorContext();
      store.setSymbols([bus1, bus2, line]);
      store.clipboard = JSON.parse(clipboardCopy);

      // Drugie wklejenie (identyczne warunki)
      const second = store.pasteFromClipboard({ x: 0, y: 200 });
      const secondLine = second.find((s) => s.elementType === 'LineBranch') as BranchSymbol;
      const secondFromNodeId = secondLine.fromNodeId;
      const secondToNodeId = secondLine.toNodeId;

      // Połączenia powinny być identyczne
      expect(secondFromNodeId).toBe(firstFromNodeId);
      expect(secondToNodeId).toBe(firstToNodeId);
    });

    it('schowek powinien zawierać połączenia wewnętrzne posortowane deterministycznie', () => {
      const store = useSldEditorStore.getState();

      // Kilka elementów z połączeniami
      const bus1 = createNodeSymbol('bus1', 'elem_bus_1', 100, 100);
      const bus2 = createNodeSymbol('bus2', 'elem_bus_2', 300, 100);
      const line = createBranchSymbol('line1', 'elem_line_1', 'elem_bus_1', 'elem_bus_2', 200, 100);
      const source = createSourceSymbol('src1', 'elem_src_1', 'elem_bus_1', 50, 100);

      store.setSymbols([bus1, bus2, line, source]);
      store.selectMultiple(['bus1', 'bus2', 'line1', 'src1']);
      store.copySelection();

      const connections = store.clipboard!.internalConnections;

      // Powinny być połączenia wewnętrzne
      expect(connections.length).toBeGreaterThan(0);

      // Powinny być posortowane deterministycznie
      for (let i = 1; i < connections.length; i++) {
        const prev = connections[i - 1];
        const curr = connections[i];

        const cmpResult =
          prev.fromOriginalElementId.localeCompare(curr.fromOriginalElementId) ||
          prev.connectionType.localeCompare(curr.connectionType) ||
          prev.toOriginalElementId.localeCompare(curr.toOriginalElementId);

        expect(cmpResult).toBeLessThanOrEqual(0);
      }
    });
  });
});
